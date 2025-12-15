/**
 * prepare_task tool handler
 *
 * Creates handover record for a task and transitions it to IMPLEMENT status.
 * Updates sprint workflow_step to IMPLEMENT if coming from SELECT_TASK.
 */

import { and, eq, inArray } from "drizzle-orm";
import { autoCommitIfEnabled, generateCommitMessage } from "../../core/git.js";
import { getActiveSprint, getDb } from "../../db/index.js";
import {
  config,
  handovers,
  progress,
  sprints,
  tasks,
  verificationChecks,
} from "../../db/schema.js";
import {
  PrepareTaskInputSchema,
  type PrepareTaskOutput,
} from "../../schemas/handover.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

export async function handlePrepareTask(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(PrepareTaskInputSchema, input);
  if (!validation.success) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(validation.error, null, 2),
        },
      ],
    };
  }

  try {
    const output = await prepareTask(
      validation.data as typeof PrepareTaskInputSchema._output
    );
    const durationMs = Math.round(performance.now() - startTime);

    // Log successful execution
    await logToolExecution(
      {
        toolName: "prepare_task",
        role: "orchestrator",
        input: validation.data,
        taskId: validation.data.task_id,
      },
      { success: true, output },
      durationMs
    );

    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    const err = error instanceof Error ? error : new Error(String(error));

    // Log failed execution
    await logToolExecution(
      {
        toolName: "prepare_task",
        role: "orchestrator",
        input: validation.data,
        taskId: validation.data.task_id,
      },
      { success: false, errorMessage: err.message },
      durationMs
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: {
                code: "SYSTEM_ERROR",
                message: err.message,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }
}

async function prepareTask(
  input: typeof PrepareTaskInputSchema._output
): Promise<PrepareTaskOutput> {
  const db = getDb();

  // 1. Get active sprint
  const sprint = await getActiveSprint();

  if (!sprint) {
    throw new Error("No active sprint");
  }

  // 2. Find task
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task_id))
    )
    .limit(1);

  if (!task) {
    throw new Error(`Task ${input.task_id} not found`);
  }

  // 3. Validate task can be prepared (PENDING or VERIFY_FAILED only)
  // SECURITY: ESCALATED tasks require human supervisor de-escalation first (TD-016)
  const validStatuses = ["PENDING", "VERIFY_FAILED"];
  if (!validStatuses.includes(task.status)) {
    if (task.status === "ESCALATED") {
      throw new Error(
        `Task ${input.task_id} is ESCALATED and cannot be prepared. ` +
          `Human supervisor must de-escalate the task first using VS Code.`
      );
    }
    throw new Error(
      `Task ${input.task_id} is in ${task.status} state and cannot be prepared. ` +
        `Expected: ${validStatuses.join(", ")}`
    );
  }

  // 4. Check dependencies are complete
  const dependencies = JSON.parse(task.dependencies) as number[];
  if (dependencies.length > 0) {
    const depTasks = await db
      .select({ task_id: tasks.task_id, status: tasks.status })
      .from(tasks)
      .where(eq(tasks.sprint_id, sprint.id));

    const depMap = new Map(depTasks.map((t) => [t.task_id, t.status]));
    const incompleteDeps = dependencies.filter(
      (depId) => depMap.get(depId) !== "COMPLETE"
    );

    if (incompleteDeps.length > 0) {
      throw new Error(
        `Task ${
          input.task_id
        } has incomplete dependencies: ${incompleteDeps.join(", ")}`
      );
    }
  }

  // 4b. Validate context_files don't contain spec/task breakdown files (trust boundary)
  const warnings: string[] = [];
  if (input.context_files && input.context_files.length > 0) {
    const forbiddenPatterns = [
      /spec[\/\\].*sprint/i,
      /spec[\/\\].*task/i,
      /manifest\.yaml/i,
      /\.orchestrator-only/i,
      /task[-_]?breakdown/i,
      /implementation[-_]?plan/i,
    ];

    const violatingFiles = input.context_files.filter((file) =>
      forbiddenPatterns.some((pattern) => pattern.test(file))
    );

    if (violatingFiles.length > 0) {
      warnings.push(
        `WARNING: context_files contains potential spec/task breakdown files that may violate trust boundary: ${violatingFiles.join(
          ", "
        )}. ` +
          `Implementor should NOT see sprint structure, other tasks, or verification criteria. ` +
          `EXTRACT relevant content into the handover context instead of referencing spec files.`
      );
      console.error(`[TRUST_BOUNDARY] ${warnings[0]}`);
    }
  }

  const now = new Date().toISOString();

  // 5. Check TDD requirements BEFORE creating handover
  // This ensures test requirements are communicated to implementor when TDD is enabled
  const tddInjectionResult = await injectTestVerificationIfRequired(
    db,
    task.id,
    task.category,
    task.title,
    now,
    input.file_operations,
    input.test_file
  );

  // Determine effective test_requirements - auto-generate if TDD injected but none provided
  let effectiveTestRequirements = input.test_requirements;
  let effectiveTestFile = input.test_file;

  if (tddInjectionResult.injected) {
    console.error(
      `[TDD] Auto-injected test verification check for task ${input.task_id} (${task.category}): ${tddInjectionResult.checkDescription}`
    );

    // Auto-generate test requirements if not provided by orchestrator
    if (!effectiveTestRequirements) {
      effectiveTestRequirements =
        `[TDD REQUIRED] This task requires test coverage.\n\n` +
        `Create tests that verify:\n` +
        `1. All acceptance criteria are met\n` +
        `2. Core functionality works as expected\n` +
        `3. Edge cases and error conditions are handled\n\n` +
        `Test file pattern: ${
          tddInjectionResult.testFilePattern || "test/**/*.test.ts"
        }\n` +
        `Tests must include describe/test/it blocks.`;
    }

    // Suggest test file path if not provided
    if (!effectiveTestFile && tddInjectionResult.suggestedTestFile) {
      effectiveTestFile = tddInjectionResult.suggestedTestFile;
    }
  }

  // 5b. Create or update handover record (now includes TDD requirements)
  const existingHandover = await db
    .select()
    .from(handovers)
    .where(eq(handovers.task_id, task.id))
    .limit(1);

  if (existingHandover.length > 0) {
    // Update existing
    await db
      .update(handovers)
      .set({
        priority: input.priority,
        context: input.context || null,
        context_files: input.context_files
          ? JSON.stringify(input.context_files)
          : null,
        acceptance_criteria: JSON.stringify(input.acceptance_criteria),
        file_operations: JSON.stringify(input.file_operations),
        deliverables: JSON.stringify(input.deliverables),
        test_file: effectiveTestFile,
        test_requirements: effectiveTestRequirements,
        constraints: input.constraints
          ? JSON.stringify(input.constraints)
          : null,
        reference_links: input.references
          ? JSON.stringify(input.references)
          : null,
        updated_at: now,
      })
      .where(eq(handovers.id, existingHandover[0]!.id));
  } else {
    // Create new
    await db.insert(handovers).values({
      task_id: task.id,
      priority: input.priority,
      context: input.context || null,
      context_files: input.context_files
        ? JSON.stringify(input.context_files)
        : null,
      acceptance_criteria: JSON.stringify(input.acceptance_criteria),
      file_operations: JSON.stringify(input.file_operations),
      deliverables: JSON.stringify(input.deliverables),
      test_file: effectiveTestFile,
      test_requirements: effectiveTestRequirements,
      constraints: input.constraints ? JSON.stringify(input.constraints) : null,
      reference_links: input.references
        ? JSON.stringify(input.references)
        : null,
      created_at: now,
      updated_at: now,
    });
  }

  // 6. Update task status to IMPLEMENT
  await db
    .update(tasks)
    .set({
      status: "IMPLEMENT",
      updated_at: now,
    })
    .where(eq(tasks.id, task.id));

  // 7. Update sprint workflow_step if needed
  if (sprint.workflow_step === "SELECT_TASK") {
    await db
      .update(sprints)
      .set({
        workflow_step: "IMPLEMENT",
        updated_at: now,
      })
      .where(eq(sprints.id, sprint.id));
  }

  // 8. Log progress
  await db.insert(progress).values({
    sprint_id: sprint.id,
    task_id: task.id,
    from_status: task.status,
    to_status: "IMPLEMENT",
    workflow_step: sprint.workflow_step,
    triggered_by: "orchestrator",
    notes: "Task prepared and handed over to implementor",
    changed_at: now,
  });

  // 9. Auto-commit if enabled
  const commitMessage = generateCommitMessage({
    operation: "prepare",
    taskId: input.task_id,
    taskTitle: task.title,
  });

  const gitResult = await autoCommitIfEnabled({
    toolName: "prepare_task",
    commitMessage,
    sprintId: sprint.id,
    taskInternalId: task.id,
    cwd: process.cwd(),
  });

  return {
    success: true,
    task_id: input.task_id,
    status: "IMPLEMENT",
    git_commit: gitResult.committed ? gitResult.sha ?? undefined : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Auto-inject test verification check if TDD is enabled for the task category.
 *
 * Reads TDD config from database: require_tests, require_tests_categories,
 * test_file_pattern, and test_pattern.
 *
 * When enabled and category matches, inserts a BLOCKING structural check.
 * Also returns info needed to update handover with test requirements.
 *
 * Infers test location from file_operations - if files are in extension/,
 * uses extension/test/ pattern instead of test/.
 */
async function injectTestVerificationIfRequired(
  db: ReturnType<typeof getDb>,
  taskInternalId: number,
  taskCategory: string,
  taskTitle: string,
  now: string,
  fileOperations: Array<{
    operation: string;
    path: string;
    description: string;
  }>,
  explicitTestFile?: string
): Promise<{
  injected: boolean;
  checkDescription?: string;
  testFilePattern?: string;
  suggestedTestFile?: string;
}> {
  // Read TDD config from database
  const tddConfigKeys = [
    "tdd.require_tests",
    "tdd.require_tests_categories",
    "tdd.test_file_pattern",
    "tdd.test_pattern",
  ];

  const configRows = await db
    .select()
    .from(config)
    .where(inArray(config.key, tddConfigKeys));

  const configMap = new Map(configRows.map((row) => [row.key, row.value]));

  // Check if TDD is enabled (default to false if not configured)
  const requireTests = configMap.get("tdd.require_tests") === "true";
  if (!requireTests) {
    return { injected: false };
  }

  // Check if task category requires tests
  const categoriesStr =
    configMap.get("tdd.require_tests_categories") ||
    "INFRASTRUCTURE,INTEGRATION";
  const requiredCategories = categoriesStr.split(",").map((c) => c.trim());

  if (!requiredCategories.includes(taskCategory)) {
    return { injected: false };
  }

  // Get test file pattern from config or infer from file operations
  const configTestPattern = configMap.get("tdd.test_file_pattern");
  const testContentPattern =
    configMap.get("tdd.test_pattern") || "describe|test|it";

  // Determine test file pattern:
  // 1. If explicit test_file provided, use that exact path
  // 2. If file_operations target extension/, use extension/test/**/*.test.ts
  // 3. Otherwise use config or default test/**/*.test.ts
  let testFilePattern: string;

  if (explicitTestFile) {
    // Use the exact test file specified by orchestrator
    testFilePattern = explicitTestFile;
  } else {
    // Infer from file operations - check if any files are in extension/
    const hasExtensionFiles = fileOperations.some((op) =>
      op.path.startsWith("extension/")
    );

    if (hasExtensionFiles) {
      testFilePattern =
        configTestPattern?.replace(/^test\//, "extension/test/") ||
        "extension/test/**/*.test.ts";
    } else {
      testFilePattern = configTestPattern || "test/**/*.test.ts";
    }
  }

  // Count existing checks to generate unique check_id
  const existingChecks = await db
    .select({ check_id: verificationChecks.check_id })
    .from(verificationChecks)
    .where(eq(verificationChecks.task_id, taskInternalId));

  const structCheckCount = existingChecks.filter((c) =>
    c.check_id.startsWith("struct-")
  ).length;

  const checkDescription = `[TDD] Test file required for "${taskTitle}" (${taskCategory})`;

  // Insert TDD structural check
  await db.insert(verificationChecks).values({
    task_id: taskInternalId,
    check_id: `struct-tdd-${structCheckCount}`,
    check_type: "structural",
    description: checkDescription,
    severity: "BLOCKING",
    check_config: JSON.stringify({
      path: testFilePattern,
      pattern: testContentPattern,
      min_matches: 1,
    }),
    created_at: now,
  });

  const result: {
    injected: boolean;
    checkDescription?: string;
    testFilePattern?: string;
    suggestedTestFile?: string;
  } = {
    injected: true,
    checkDescription,
    testFilePattern,
  };

  // Only add suggestedTestFile if pattern is not a glob
  if (!testFilePattern.includes("*")) {
    result.suggestedTestFile = testFilePattern;
  }

  return result;
}
