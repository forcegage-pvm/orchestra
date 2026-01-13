/**
 * prepare_task tool handler
 *
 * Creates handover record for a task and transitions it to IMPLEMENT status.
 * Updates sprint workflow_step to IMPLEMENT if coming from SELECT_TASK.
 */

import { and, eq, inArray } from "drizzle-orm";
import { autoCommitIfEnabled, generateCommitMessage } from "../../core/git.js";
import {
  cleanupTddRedMarkers,
  detectProjectLanguage,
} from "../../core/tdd-cleanup.js";
import {
  getActiveSprint,
  getDb,
  resolveWorkspacePath,
} from "../../db/index.js";
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
import { writeSignal } from "../db-signal.js";
import { logToolExecution } from "./audit-logging.js";
import { validateHandoverIsolation } from "./handover-validation.js";

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

  // 0. Clean up TDD red-phase markers from previous tasks
  const workspaceRoot = resolveWorkspacePath();
  const cleanupResult = await cleanupTddRedMarkers(workspaceRoot);

  // Auto-commit cleanup if files were cleaned
  if (cleanupResult.cleaned) {
    await autoCommitIfEnabled({
      toolName: "prepare_task",
      commitMessage: "chore(orchestra): cleanup tdd-red markers",
      sprintId: null, // No specific sprint context for cleanup
      taskInternalId: null, // No specific task context for cleanup
      cwd: workspaceRoot,
    });
  }

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

  // 4b. Validate information isolation boundary (trust boundary)
  // This THROWS ERROR if context or context_files contain forbidden content
  validateHandoverIsolation(input.context, input.context_files);

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
      const detectedPatterns = detectTestPatterns(input.file_operations);
      const patternToDisplay =
        tddInjectionResult.testFilePattern || detectedPatterns.testFilePattern;

      effectiveTestRequirements =
        `[TDD REQUIRED] This task requires test coverage.\n\n` +
        `Create tests that verify:\n` +
        `1. All acceptance criteria are met\n` +
        `2. Core functionality works as expected\n` +
        `3. Edge cases and error conditions are handled\n\n` +
        `Test file pattern: ${patternToDisplay}\n` +
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

  // 5c. Auto-inject TDD red-phase verification checks
  // When tdd_red_phase=true: inject checks for tagged tests fail, others pass
  // When tdd_red_phase=false: inject check that no markers remain
  const tddRedPhase = Boolean(task.tdd_red_phase);

  // Count existing checks for unique IDs
  const existingChecks = await db
    .select({ check_id: verificationChecks.check_id })
    .from(verificationChecks)
    .where(eq(verificationChecks.task_id, task.id));

  let behavCheckCount = existingChecks.filter((c) =>
    c.check_id.startsWith("behav-")
  ).length;
  let structCheckCount = existingChecks.filter((c) =>
    c.check_id.startsWith("struct-")
  ).length;

  if (tddRedPhase) {
    // Generate and insert red-phase checks
    const redPhaseChecks = generateTddRedPhaseChecks(workspaceRoot, task.title);

    for (const check of redPhaseChecks) {
      const checkIdPrefix =
        check.check_type === "behavioral" ? "behav" : "struct";
      const checkIdNumber =
        check.check_type === "behavioral"
          ? behavCheckCount++
          : structCheckCount++;

      await db.insert(verificationChecks).values({
        task_id: task.id,
        check_id: `${checkIdPrefix}-tdd-red-${checkIdNumber}`,
        check_type: check.check_type,
        description: check.description,
        severity: check.severity,
        check_config: JSON.stringify(check.check_config),
        created_at: now,
      });
    }

    console.error(
      `[TDD RED] Auto-injected ${redPhaseChecks.length} red-phase verification checks for task ${input.task_id}`
    );
  }
  // Note: Cleanup of tdd-red markers is the implementor's responsibility during
  // the GREEN phase. The orchestrator should add explicit cleanup verification
  // criteria to GREEN phase tasks when preparing them.

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
    cwd: resolveWorkspacePath(),
  });

  // Notify extension of database changes
  writeSignal();

  return {
    success: true,
    task_id: input.task_id,
    status: "IMPLEMENT",
    git_commit: gitResult.committed ? gitResult.sha ?? undefined : undefined,
  };
}

/**
 * Detect project language and return appropriate test patterns.
 */
function detectTestPatterns(
  fileOperations: Array<{
    operation: string;
    path: string;
    description: string;
  }>
): { testFilePattern: string; testContentPattern: string } {
  // Check file extensions in file_operations
  const extensions = new Set<string>();
  for (const op of fileOperations) {
    const match = op.path.match(/\.([^.]+)$/);
    if (match && match[1]) {
      extensions.add(match[1]);
    }
  }

  // Dart project
  if (extensions.has("dart")) {
    return {
      testFilePattern: "test/**/*_test.dart",
      testContentPattern: "test\\(|testWidgets\\(|group\\(",
    };
  }

  // Python project
  if (extensions.has("py")) {
    return {
      testFilePattern: "test/**/test_*.py",
      testContentPattern: "def test_|class Test",
    };
  }

  // Rust project
  if (extensions.has("rs")) {
    return {
      testFilePattern: "tests/**/*.rs",
      testContentPattern: "#\\[test\\]|#\\[cfg\\(test\\)\\]",
    };
  }

  // Go project
  if (extensions.has("go")) {
    return {
      testFilePattern: "**/*_test.go",
      testContentPattern: "func Test",
    };
  }

  // C/C++ project
  if (
    extensions.has("c") ||
    extensions.has("cpp") ||
    extensions.has("cc") ||
    extensions.has("h") ||
    extensions.has("hpp")
  ) {
    return {
      testFilePattern: "test/**/*_test.{c,cpp}",
      testContentPattern: "TEST\\(|TEST_F\\(|ASSERT_|EXPECT_",
    };
  }

  // Java project
  if (extensions.has("java")) {
    return {
      testFilePattern: "src/test/**/*Test.java",
      testContentPattern: "@Test|@RunWith",
    };
  }

  // C# project
  if (extensions.has("cs")) {
    return {
      testFilePattern: "**/*.Tests/**/*Tests.cs",
      testContentPattern: "\\[Test\\]|\\[Fact\\]|\\[Theory\\]",
    };
  }

  // Ruby project
  if (extensions.has("rb")) {
    return {
      testFilePattern: "test/**/*_test.rb",
      testContentPattern: "describe |it |test |RSpec",
    };
  }

  // PHP project
  if (extensions.has("php")) {
    return {
      testFilePattern: "tests/**/*Test.php",
      testContentPattern: "public function test|@test",
    };
  }

  // Default to TypeScript/JavaScript
  return {
    testFilePattern: "test/**/*.test.ts",
    testContentPattern: "describe|test|it",
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
 * Detects project language from file extensions and uses appropriate test patterns.
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

  // Get test file pattern from config or detect from file operations
  const configTestPattern = configMap.get("tdd.test_file_pattern");
  const configContentPattern = configMap.get("tdd.test_pattern");

  // Detect language-appropriate test patterns from file operations
  const detectedPatterns = detectTestPatterns(fileOperations);

  // Use config patterns if provided, otherwise use detected patterns
  const testContentPattern =
    configContentPattern || detectedPatterns.testContentPattern;

  // Determine test file pattern:
  // 1. If explicit test_file provided, use that exact path
  // 2. If config provides pattern, use that
  // 3. If file_operations target extension/, adapt detected pattern for extension/
  // 4. Otherwise use detected pattern
  let testFilePattern: string;

  if (explicitTestFile) {
    // Use the exact test file specified by orchestrator
    testFilePattern = explicitTestFile;
  } else if (configTestPattern) {
    // Use configured pattern (manual override)
    testFilePattern = configTestPattern;
  } else {
    // Use detected pattern, adapt for extension/ if needed
    const hasExtensionFiles = fileOperations.some((op) =>
      op.path.startsWith("extension/")
    );

    if (hasExtensionFiles) {
      testFilePattern = detectedPatterns.testFilePattern.replace(
        /^test\//,
        "extension/test/"
      );
    } else {
      testFilePattern = detectedPatterns.testFilePattern;
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

/**
 * Generate TDD red-phase verification checks
 *
 * When a task is marked as tdd_red_phase=true, it requires:
 * 1. Tagged tests MUST fail (exit code 1)
 * 2. Non-tagged tests MUST pass (exit code 0)
 * 3. At least one tdd-red marker exists
 *
 * @param workspaceRoot - Root directory of the workspace
 * @param taskTitle - Task title for check descriptions
 * @returns Array of verification check configs
 */
function generateTddRedPhaseChecks(
  workspaceRoot: string,
  taskTitle: string
): Array<{
  check_type: "behavioral" | "structural";
  description: string;
  severity: "BLOCKING" | "MAJOR" | "MINOR";
  check_config: Record<string, unknown>;
}> {
  const language = detectProjectLanguage(workspaceRoot);
  const checks: Array<{
    check_type: "behavioral" | "structural";
    description: string;
    severity: "BLOCKING" | "MAJOR" | "MINOR";
    check_config: Record<string, unknown>;
  }> = [];

  if (language === "dart") {
    // Behavioral: Tagged tests must fail
    checks.push({
      check_type: "behavioral",
      description: `[TDD RED] Tagged tests must fail for "${taskTitle}"`,
      severity: "BLOCKING",
      check_config: {
        command: "flutter test --tags tdd-red",
        expect_exit_code: 1,
        success_message: "Tagged tests failed as expected (red phase)",
        failure_message: "Tagged tests must fail in red phase",
      },
    });

    // Behavioral: Non-tagged tests must pass
    checks.push({
      check_type: "behavioral",
      description: `[TDD RED] Non-tagged tests must pass for "${taskTitle}"`,
      severity: "BLOCKING",
      check_config: {
        command: "flutter test --exclude-tags tdd-red",
        expect_exit_code: 0,
        success_message: "Non-tagged tests passed (no regressions)",
        failure_message: "Non-tagged tests failed - regressions detected",
      },
    });

    // Structural: At least one tdd-red marker exists
    checks.push({
      check_type: "structural",
      description: `[TDD RED] Red-phase marker present for "${taskTitle}"`,
      severity: "BLOCKING",
      check_config: {
        path: "test/**/*.dart",
        pattern: "@Tags\\(\\['tdd-red'\\]\\)",
        min_matches: 1,
      },
    });
  } else if (language === "typescript") {
    // Behavioral: tdd-red tests must fail
    checks.push({
      check_type: "behavioral",
      description: `[TDD RED] Red-phase tests must fail for "${taskTitle}"`,
      severity: "BLOCKING",
      check_config: {
        command: "npm test test/tdd-red",
        expect_exit_code: 1,
        success_message: "Red-phase tests failed as expected",
        failure_message: "Red-phase tests must fail",
      },
    });

    // Behavioral: Non-red tests must pass
    checks.push({
      check_type: "behavioral",
      description: `[TDD RED] Non-red tests must pass for "${taskTitle}"`,
      severity: "BLOCKING",
      check_config: {
        command: "npm test -- --testPathIgnorePatterns=test/tdd-red",
        expect_exit_code: 0,
        success_message: "Non-red tests passed (no regressions)",
        failure_message: "Non-red tests failed - regressions detected",
      },
    });

    // Structural: tdd-red directory exists with test files
    checks.push({
      check_type: "structural",
      description: `[TDD RED] Red-phase test files present for "${taskTitle}"`,
      severity: "BLOCKING",
      check_config: {
        path: "test/tdd-red/**/*.test.ts",
        pattern: "test\\(|it\\(|describe\\(",
        min_matches: 1,
      },
    });
  }

  return checks;
}
