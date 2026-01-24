/**
 * prepare_task tool handler
 *
 * Creates handover record for a task and transitions it to IMPLEMENT status.
 * Updates sprint workflow_step to IMPLEMENT if coming from SELECT_TASK.
 */

import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  detectLanguageFromEnv,
  getTddRedChecks,
  type SupportedLanguage,
} from "../../core/check-templates.js";
import { enforcePhaseGate } from "../../core/code-review-gates.js";
import { validateBehavioralCommand } from "../../core/command-validation.js";
import { autoCommitIfEnabled, generateCommitMessage } from "../../core/git.js";
import { validateVerificationPatterns } from "../../core/pattern-validator.js";
import {
  cleanupTddRedMarkers,
  detectProjectLanguage,
} from "../../core/tdd-cleanup.js";
import {
  mapToRunnerFlags,
  resolveExclusions,
  type FileOperation,
  type TddRegistryEntry,
} from "../../core/tdd-exclusion-resolver.js";
import {
  getActiveSprint,
  getDb,
  resolveWorkspacePath,
} from "../../db/index.js";
import {
  codeReviews,
  config,
  escalations,
  handovers,
  progress,
  sprints,
  sprintSettings,
  tasks,
  tddRedRegistry,
  verificationChecks,
} from "../../db/schema.js";
import { CodeReviewConfigSchema } from "../../schemas/config.js";
import {
  PrepareTaskInputSchema,
  type PrepareTaskOutput,
} from "../../schemas/handover.js";
import { validateInput } from "../../schemas/utils.js";
import { writeSignal } from "../db-signal.js";
import { logToolExecution } from "./audit-logging.js";
import { validateHandoverIsolation } from "./handover-validation.js";

const isTestEnv =
  process.env.NODE_ENV === "test" ||
  process.env.VITEST === "true" ||
  process.env.VITEST_WORKER_ID !== undefined;

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
      validation.data as typeof PrepareTaskInputSchema._output,
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
      durationMs,
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
      durationMs,
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
            2,
          ),
        },
      ],
    };
  }
}

async function prepareTask(
  input: typeof PrepareTaskInputSchema._output,
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

  // 1b. T016: Check if sprint is pending Controller review - block task preparation
  // Controller Agent must approve sprint configuration before any tasks can be prepared
  if (sprint.status === "PENDING_SPEC_REVIEW") {
    throw new Error(
      `Sprint "${sprint.id}" is awaiting Controller review. ` +
        `Task preparation is blocked until the Controller approves the sprint configuration. ` +
        `Use approve_sprint tool (Controller role) to proceed.`,
    );
  }

  if (sprint.status === "SPEC_REVIEW_FAILED") {
    throw new Error(
      `Sprint "${sprint.id}" failed Controller review. ` +
        `Task preparation is blocked. Orchestrator must use resubmit_sprint ` +
        `after addressing the issues identified by the Controller.`,
    );
  }

  // 1d. Block task preparation if any non-escalated REJECTED task reviews exist
  const rejectedReviews = await db
    .select({ task_id: codeReviews.task_id })
    .from(codeReviews)
    .where(
      and(
        eq(codeReviews.sprint_id, sprint.id),
        eq(codeReviews.status, "REJECTED"),
        eq(codeReviews.review_scope, "TASK"),
      ),
    );

  if (rejectedReviews.length > 0) {
    const rejectedTaskIds = rejectedReviews
      .map((review) => review.task_id)
      .filter((taskId): taskId is number => taskId !== null);

    const escalatedTaskRows =
      rejectedTaskIds.length > 0
        ? await db
            .select({ task_id: escalations.task_id })
            .from(escalations)
            .where(
              and(
                eq(escalations.sprint_id, sprint.id),
                inArray(escalations.task_id, rejectedTaskIds),
                isNull(escalations.resolved_at),
              ),
            )
        : [];

    const escalatedTaskIds = new Set(
      escalatedTaskRows
        .map((row) => row.task_id)
        .filter((taskId): taskId is number => taskId !== null),
    );

    const blockingTaskIds = rejectedTaskIds.filter(
      (taskId) => !escalatedTaskIds.has(taskId),
    );

    if (blockingTaskIds.length > 0) {
      throw new Error(
        `Task preparation blocked due to REJECTED code reviews on tasks: ${blockingTaskIds.join(
          ", ",
        )}. ` +
          `Resolve the rejected review(s) or escalate the task(s) to proceed.`,
      );
    }
  }

  // 1c. Fetch sprint environment configuration (REQUIRED since Sprint 006)
  // These eliminate guessing about test commands, file patterns, and directories
  const sprintSettingsRows = await db
    .select()
    .from(sprintSettings)
    .where(eq(sprintSettings.sprint_id, sprint.id));

  // Build sprintEnv object conditionally (exactOptionalPropertyTypes compliance)
  const sprintEnv: SprintEnvironment = {
    source_base_dir:
      sprintSettingsRows.find((s) => s.key === "source_base_dir")?.value || ".",
  };

  const testCommandSetting = sprintSettingsRows.find(
    (s) => s.key === "test_command",
  );
  if (testCommandSetting) {
    sprintEnv.test_command = testCommandSetting.value;
  }

  const testFilePatternSetting = sprintSettingsRows.find(
    (s) => s.key === "test_file_pattern",
  );
  if (testFilePatternSetting) {
    sprintEnv.test_file_pattern = testFilePatternSetting.value;
  }

  // Warn if environment config is missing (for backwards compatibility with old sprints)
  if (!sprintEnv.test_command || !sprintEnv.test_file_pattern) {
    if (!isTestEnv) {
      console.error(
        `[prepare_task] WARNING: Sprint "${sprint.id}" is missing environment configuration. ` +
          `New sprints should use configure_sprint with environment field. ` +
          `Falling back to auto-detection (may cause verification errors).`,
      );
    }
  }

  // 2. Find task
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task_id)),
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
          `Human supervisor must de-escalate the task first using VS Code.`,
      );
    }
    throw new Error(
      `Task ${input.task_id} is in ${task.status} state and cannot be prepared. ` +
        `Expected: ${validStatuses.join(", ")}`,
    );
  }

  // 3b. Enforce phase gate before preparing tasks in next phase
  const codeReviewConfig = CodeReviewConfigSchema.parse(
    sprint.config ? JSON.parse(sprint.config) : {},
  );

  if (
    codeReviewConfig.code_review_enabled &&
    codeReviewConfig.code_review_policy === "phase_gate"
  ) {
    const gateResult = await enforcePhaseGate({ phase_id: task.phase_id });
    if (gateResult.blocked) {
      throw new Error(
        gateResult.reason ||
          "Phase gate blocks task preparation until phase review is approved",
      );
    }
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
      (depId) => depMap.get(depId) !== "COMPLETE",
    );

    if (incompleteDeps.length > 0) {
      throw new Error(
        `Task ${
          input.task_id
        } has incomplete dependencies: ${incompleteDeps.join(", ")}`,
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
    sprintEnv,
    input.test_file,
  );

  // Determine effective test_requirements - auto-generate if TDD injected but none provided
  let effectiveTestRequirements = input.test_requirements;
  let effectiveTestFile = input.test_file;

  if (tddInjectionResult.injected) {
    if (!isTestEnv) {
      console.error(
        `[TDD] Auto-injected test verification check for task ${input.task_id} (${task.category}): ${tddInjectionResult.checkDescription}`,
      );
    }

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
    c.check_id.startsWith("behav-"),
  ).length;
  let structCheckCount = existingChecks.filter((c) =>
    c.check_id.startsWith("struct-"),
  ).length;

  if (tddRedPhase) {
    // Generate and insert red-phase checks
    // Use sprint environment config (explicit) or fall back to file_operations inference

    // Query tdd_red_registry for existing red-phase test files
    const registryEntries = await db
      .select()
      .from(tddRedRegistry)
      .where(eq(tddRedRegistry.sprint_id, sprint.id));

    const redPhaseChecks = generateTddRedPhaseChecks(
      workspaceRoot,
      task.title,
      input.task_id,
      sprint.id,
      sprintEnv,
      input.file_operations,
      registryEntries,
    );

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

    if (!isTestEnv) {
      console.error(
        `[TDD RED] Auto-injected ${redPhaseChecks.length} red-phase verification checks for task ${input.task_id}`,
      );
    }
  }
  // Note: Cleanup of tdd-red markers is the implementor's responsibility during
  // the GREEN phase. The orchestrator should add explicit cleanup verification
  // criteria to GREEN phase tasks when preparing them.

  // 5d. Validate verification patterns before finalizing handover
  // Read ALL verification checks (including auto-injected TDD checks)
  const allChecks = await db
    .select()
    .from(verificationChecks)
    .where(eq(verificationChecks.task_id, task.id));

  // Group checks by type for validation
  const structural_checks = allChecks
    .filter((c) => c.check_type === "structural")
    .map((c) => ({
      ...JSON.parse(c.check_config as string),
      description: c.description,
      severity: c.severity,
    }));

  const behavioral_checks = allChecks
    .filter((c) => c.check_type === "behavioral")
    .map((c) => ({
      ...JSON.parse(c.check_config as string),
      description: c.description,
      severity: c.severity,
    }));

  const quality_checks = allChecks
    .filter((c) => c.check_type === "quality")
    .map((c) => ({
      ...JSON.parse(c.check_config as string),
      description: c.description,
      severity: c.severity,
    }));

  const validationResult = await validateVerificationPatterns(
    {
      structural_checks,
      behavioral_checks,
      quality_checks,
    },
    workspaceRoot,
    input.file_operations, // Pass file_operations to check alignment
  );

  // Log validation warnings if any (also returned in response)
  if (validationResult.warnings.length > 0) {
    if (!isTestEnv) {
      console.warn(
        `[prepare_task] Pattern validation warnings for task ${input.task_id}:`,
        validationResult.warnings,
      );
    }
  }

  // BLOCK on validation errors - don't allow bad specs to be saved
  if (validationResult.errors.length > 0) {
    console.error(
      `[prepare_task] Pattern validation errors for task ${input.task_id}:`,
      validationResult.errors,
    );
    throw new Error(
      `Verification pattern validation failed. These errors WILL cause verification to fail:\n\n` +
        `${validationResult.errors.join("\n")}\n\n` +
        `Fix the verification criteria before preparing the task.` +
        (validationResult.warnings.length > 0
          ? `\n\nWarnings (non-blocking):\n${validationResult.warnings.join("\n")}`
          : ``),
    );
  }

  // 5e. Validate behavioral check commands before finalizing handover
  // Check that all behavioral commands are executable (correct executables, scripts, flags, etc.)
  const commandValidationErrors: string[] = [];
  const commandValidationWarnings: string[] = [];

  for (const check of behavioral_checks) {
    if (check.command) {
      const result = validateBehavioralCommand(
        check.command,
        check.working_directory || workspaceRoot,
      );

      if (!result.isValid) {
        // Collect errors with check description for context
        for (const error of result.errors) {
          commandValidationErrors.push(
            `[${check.description}] ${error.message} (code: ${error.code})`,
          );
        }
      }

      // Collect warnings
      for (const warning of result.warnings) {
        commandValidationWarnings.push(
          `[${check.description}] ${warning.message} (code: ${warning.code})`,
        );
      }
    }
  }

  // BLOCK on command validation errors - don't allow invalid commands
  if (commandValidationErrors.length > 0) {
    console.error(
      `[prepare_task] Behavioral command validation errors for task ${input.task_id}:`,
      commandValidationErrors,
    );
    throw new Error(
      `Behavioral command validation failed. These errors WILL cause verification to fail:\n\n` +
        `${commandValidationErrors.join("\n")}\n\n` +
        `Fix the behavioral check commands before preparing the task.` +
        (commandValidationWarnings.length > 0
          ? `\n\nWarnings (non-blocking):\n${commandValidationWarnings.join("\n")}`
          : ``),
    );
  }

  // Merge command validation warnings into pattern validation warnings
  if (commandValidationWarnings.length > 0) {
    validationResult.warnings.push(...commandValidationWarnings);
    if (!isTestEnv) {
      console.warn(
        `[prepare_task] Behavioral command validation warnings for task ${input.task_id}:`,
        commandValidationWarnings,
      );
    }
  }

  // 6. T023: Update task status to PENDING_HANDOVER_REVIEW
  // Controller Agent must review and approve handover before implementation can begin
  await db
    .update(tasks)
    .set({
      status: "PENDING_HANDOVER_REVIEW",
      updated_at: now,
    })
    .where(eq(tasks.id, task.id));

  // 7. T024: Update sprint workflow_step to HANDOVER_REVIEW
  // This blocks implementation until Controller approves the handover
  if (
    sprint.workflow_step === "SELECT_TASK" ||
    sprint.workflow_step === "SPEC_REVIEW"
  ) {
    await db
      .update(sprints)
      .set({
        workflow_step: "HANDOVER_REVIEW",
        updated_at: now,
      })
      .where(eq(sprints.id, sprint.id));
  }

  // 8. Log progress
  await db.insert(progress).values({
    sprint_id: sprint.id,
    task_id: task.id,
    from_status: task.status,
    to_status: "PENDING_HANDOVER_REVIEW",
    workflow_step: "HANDOVER_REVIEW",
    triggered_by: "orchestrator",
    notes:
      "Task prepared - awaiting Controller handover review before implementation",
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
    status: "PENDING_HANDOVER_REVIEW",
    message:
      "Task prepared and awaiting Controller handover review. " +
      "Use approve_handover (Controller role) to allow implementation to begin.",
    git_commit: gitResult.committed ? (gitResult.sha ?? undefined) : undefined,
    pattern_warnings:
      validationResult.warnings.length > 0
        ? validationResult.warnings
        : undefined,
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
  }>,
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
  sprintEnv: SprintEnvironment,
  explicitTestFile?: string,
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

  // Skip TDD injection for documentation-only tasks
  // If ALL file operations target non-code files (markdown, text, etc.), no tests are needed
  const documentationExtensions = new Set([
    "md",
    "mdx",
    "rst",
    "txt",
    "adoc",
    "asciidoc",
  ]);
  const isDocumentationOnly =
    fileOperations.length > 0 &&
    fileOperations.every((op) => {
      const ext = op.path.split(".").pop()?.toLowerCase() || "";
      return documentationExtensions.has(ext);
    });

  if (isDocumentationOnly) {
    return { injected: false };
  }

  // Get test file pattern from sprint config (preferred) or global config (fallback)
  // Sprint config is set via configure_sprint environment field
  const sprintTestPattern = sprintEnv.test_file_pattern;
  const globalTestPattern = configMap.get("tdd.test_file_pattern");
  const configContentPattern = configMap.get("tdd.test_pattern");

  // Detect language-appropriate test patterns from file operations
  const detectedPatterns = detectTestPatterns(fileOperations);

  // Use config patterns if provided, otherwise use detected patterns
  const testContentPattern =
    configContentPattern || detectedPatterns.testContentPattern;

  // Determine test file pattern priority:
  // 1. If explicit test_file provided, use that exact path
  // 2. If sprint config provides pattern, use that (already adapted for project structure)
  // 3. If global config provides pattern, adapt for subdirectory if needed
  // 4. If file_operations target extension/, adapt detected pattern for extension/
  // 5. Otherwise use detected pattern
  let testFilePattern: string;

  if (explicitTestFile) {
    // Use the exact test file specified by orchestrator
    testFilePattern = explicitTestFile;
  } else if (sprintTestPattern) {
    // Use sprint-level config (already correct for project structure)
    testFilePattern = sprintTestPattern;
  } else if (globalTestPattern) {
    // Use global config but adapt for subdirectory if needed
    const hasExtensionFiles = fileOperations.some((op) =>
      op.path.startsWith("extension/"),
    );
    if (hasExtensionFiles && globalTestPattern.startsWith("test/")) {
      testFilePattern = globalTestPattern.replace(/^test\//, "extension/test/");
    } else {
      testFilePattern = globalTestPattern;
    }
  } else {
    // Use detected pattern, adapt for extension/ if needed
    const hasExtensionFiles = fileOperations.some((op) =>
      op.path.startsWith("extension/"),
    );

    if (hasExtensionFiles) {
      testFilePattern = detectedPatterns.testFilePattern.replace(
        /^test\//,
        "extension/test/",
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
    c.check_id.startsWith("struct-"),
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
 * Sprint environment configuration for TDD checks
 */
interface SprintEnvironment {
  test_command?: string; // e.g., "npm test", "flutter test", "pytest"
  test_file_pattern?: string; // e.g., "test/**/*.test.ts", "test/**/*_test.dart"
  source_base_dir?: string; // e.g., ".", "extension", "packages/app"
}

/**
 * Generate TDD red-phase verification checks using predefined templates.
 *
 * This uses the check-templates system to ensure patterns/commands are
 * correct and tested, eliminating agent improvisation errors.
 *
 * When a task is marked as tdd_red_phase=true, it requires:
 * 1. Tagged tests MUST fail (exit code 1)
 * 2. Non-tagged tests MUST pass (exit code 0)
 * 3. At least one tdd-red marker exists
 *
 * Sprint 007 Addition: Non-red checks now include file-level exclusions to prevent
 * test runner load/import failures when red-phase files have unresolved dependencies.
 *
 * @param workspaceRoot - Root directory of the workspace
 * @param taskTitle - Task title for check descriptions
 * @param taskId - Task ID for annotation pattern
 * @param sprintId - Sprint ID for registry lookup
 * @param sprintEnv - Sprint environment configuration (explicit, preferred)
 * @param fileOperations - File operations from handover (fallback inference)
 * @param registryEntries - TDD registry entries for exclusion resolution
 * @returns Array of verification check configs
 */
function generateTddRedPhaseChecks(
  workspaceRoot: string,
  taskTitle: string,
  taskId: number,
  sprintId: string,
  sprintEnv: SprintEnvironment,
  fileOperations?: Array<{
    operation: string;
    path: string;
    description: string;
  }>,
  registryEntries?: TddRegistryEntry[],
): Array<{
  check_type: "behavioral" | "structural";
  description: string;
  severity: "BLOCKING" | "MAJOR" | "MINOR";
  check_config: Record<string, unknown>;
}> {
  // Use explicit sprint config when available, otherwise fall back to inference
  let sourceBaseDir = sprintEnv.source_base_dir || ".";
  let testCommand = sprintEnv.test_command;
  let testFilePattern = sprintEnv.test_file_pattern;

  // Fall back to inference if sprint config is missing (backwards compatibility)
  if (!testCommand || !testFilePattern) {
    const language = detectProjectLanguage(workspaceRoot);

    // Infer subdirectory prefix from file_operations (legacy behavior)
    let subdirPrefix = "";
    if (fileOperations && fileOperations.length > 0) {
      const topDirs = new Set<string>();
      for (const op of fileOperations) {
        const parts = op.path.split("/");
        const topDir = parts[0];
        if (topDir && !["test", "lib", "src", "."].includes(topDir)) {
          topDirs.add(topDir);
        }
      }
      if (topDirs.size === 1) {
        const topDir = [...topDirs][0];
        const firstPath = fileOperations[0]?.path || "";
        if (
          firstPath.startsWith(`${topDir}/`) &&
          firstPath.split("/").length > 2
        ) {
          const secondPart = firstPath.split("/")[1];
          if (secondPart && !["test", "lib", "src"].includes(secondPart)) {
            subdirPrefix = `${topDir}/${secondPart}/`;
          } else {
            subdirPrefix = `${topDir}/`;
          }
        } else {
          subdirPrefix = `${topDir}/`;
        }
      }
    }

    // Set defaults based on language detection
    if (language === "dart") {
      testCommand = testCommand || "flutter test";
      testFilePattern = testFilePattern || `${subdirPrefix}test/**/*.dart`;
      // Only override sourceBaseDir if it wasn't explicitly configured
      if (subdirPrefix && !sprintEnv.source_base_dir) {
        sourceBaseDir = subdirPrefix.replace(/\/$/, "");
      }
    } else {
      // TypeScript/JavaScript default
      testCommand = testCommand || "npm test";
      testFilePattern = testFilePattern || `${subdirPrefix}test/**/*.test.ts`;
      // Only override sourceBaseDir if it wasn't explicitly configured
      if (subdirPrefix && !sprintEnv.source_base_dir) {
        sourceBaseDir = subdirPrefix.replace(/\/$/, "");
      }
    }
  }

  // Normalize sourceBaseDir to cd prefix
  const cdPrefix =
    sourceBaseDir && sourceBaseDir !== "." ? `cd ${sourceBaseDir}; ` : "";

  // Detect language from test command using template system
  const language: SupportedLanguage =
    detectLanguageFromEnv(testCommand, testFilePattern) || "typescript";

  // Get checks from predefined templates
  const templateChecks = getTddRedChecks(language, {
    cdPrefix,
    testFilePattern: testFilePattern || "test/**/*",
    taskId,
    taskTitle,
    testCommand: testCommand || "npm test",
  });

  // Sprint 007: Resolve exclusions for non-red TDD check
  // This prevents test runner failures when red-phase files have unresolved dependencies
  const normalizedFileOps: FileOperation[] = (fileOperations || []).map(
    (op) => ({
      operation: op.operation as "CREATE" | "UPDATE" | "DELETE",
      path: op.path,
      description: op.description,
    }),
  );

  const exclusionResult = resolveExclusions(
    sprintId,
    normalizedFileOps,
    registryEntries,
  );

  // Generate runner-specific exclusion flags
  const exclusionFlags = mapToRunnerFlags(
    exclusionResult.files,
    testCommand || "npm test",
    workspaceRoot,
  );

  // Convert to expected return type and inject exclusion flags into non-red check
  return templateChecks.map((check) => {
    // Find the non-red behavioral check and add exclusion flags
    const isNonRedBehavioralCheck =
      check.check_type === "behavioral" &&
      (check.description.includes("Non-tagged tests must pass") ||
        check.description.includes("Non-red tests must pass"));

    if (isNonRedBehavioralCheck && exclusionFlags) {
      const modifiedConfig = { ...check.check_config };
      if (
        modifiedConfig.command &&
        typeof modifiedConfig.command === "string"
      ) {
        modifiedConfig.command =
          `${modifiedConfig.command} ${exclusionFlags}`.trim();
      }
      return {
        check_type: check.check_type as "behavioral" | "structural",
        description: check.description,
        severity: check.severity as "BLOCKING" | "MAJOR" | "MINOR",
        check_config: modifiedConfig as Record<string, unknown>,
      };
    }

    return {
      check_type: check.check_type as "behavioral" | "structural",
      description: check.description,
      severity: check.severity as "BLOCKING" | "MAJOR" | "MINOR",
      check_config: check.check_config as Record<string, unknown>,
    };
  });
}
