/**
 * signal_completion tool handler
 *
 * Implementor signals task completion.
 * Runs pre-signal checks, creates signal record, transitions task to GATE_CHECK.
 *
 * GAP-01 FIX: Pre-signal checks now execute actual commands instead of trusting claims.
 * VER-003: Artifact path validation added.
 */

import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  validateArtifacts,
  type Artifact,
} from "../../core/artifact-validator.js";
import { autoCommitIfEnabled, generateCommitMessage } from "../../core/git.js";
import {
  runPreSignalChecks,
  type PreSignalConfig,
} from "../../core/pre-signal-executor.js";
import {
  getActiveSprint,
  getDb,
  resolveWorkspacePath,
} from "../../db/index.js";
import {
  config,
  progress,
  signals,
  sprintSettings,
  sprints,
  tasks,
} from "../../db/schema.js";
import {
  SignalCompletionInputSchema,
  type SignalCompletionOutput,
} from "../../schemas/signal.js";
import { validateInput } from "../../schemas/utils.js";
import { writeSignal } from "../db-signal.js";
import { logToolExecution } from "./audit-logging.js";

export async function handleSignalCompletion(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(SignalCompletionInputSchema, input);
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
    const output = await signalCompletion(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    // Log successful signal
    await logToolExecution(
      {
        toolName: "signal_completion",
        role: "implementor",
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

    // Log failed signal attempt (TD-013: Even failures should be recorded)
    await logToolExecution(
      {
        toolName: "signal_completion",
        role: "implementor",
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

async function signalCompletion(
  input: typeof SignalCompletionInputSchema._output
): Promise<SignalCompletionOutput> {
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

  // 3. Validate task is in IMPLEMENT or VERIFY_FAILED state (retry)
  if (task.status !== "IMPLEMENT" && task.status !== "VERIFY_FAILED") {
    throw new Error(
      `Task ${input.task_id} is in ${task.status} state, expected IMPLEMENT or VERIFY_FAILED`
    );
  }

  // TD-013 FIX: Record signal BEFORE running pre-signal checks
  // This ensures we have evidence of the attempt even if checks fail
  const now = new Date().toISOString();
  const signalId = randomUUID();
  const attempt = task.retry_count + 1;

  // 4. Create signal record FIRST (with PENDING status)
  await db.insert(signals).values({
    task_id: task.id,
    signal_id: signalId,
    attempt,
    summary: input.summary,
    artifacts_created: JSON.stringify(input.artifacts_created),
    tests: input.tests ? JSON.stringify(input.tests) : JSON.stringify([]),
    build_status: "PENDING", // Will be updated after checks
    test_status: "PENDING", // Will be updated after checks
    pre_signal_checks: JSON.stringify({ status: "PENDING" }),
    notes: input.notes,
    signaled_at: now,
  });

  // 5. Run pre-signal checks (GAP-01: actually execute commands)
  const preSignalConfig = await getPreSignalConfig();
  // Pass tdd_red_phase from task to executor (Task 19)
  if (task.tdd_red_phase) {
    preSignalConfig.tddRedPhase = true;
  }
  const preSignalChecks = await runPreSignalChecks(preSignalConfig);

  // 5b. Validate artifacts exist (VER-003)
  const artifacts: Artifact[] = input.artifacts_created.map((a) => ({
    path: a.path,
    type: a.type,
    description: a.description,
  }));
  const artifactValidation = await validateArtifacts(
    artifacts,
    preSignalConfig.workspacePath
  );

  const allChecksPassed =
    preSignalChecks.allPassed && artifactValidation.allValid;

  // 6. Update signal with check results regardless of pass/fail
  await db
    .update(signals)
    .set({
      build_status: preSignalChecks.build.passed ? "PASS" : "FAIL",
      test_status: preSignalChecks.test.passed ? "PASS" : "FAIL",
      pre_signal_checks: JSON.stringify({
        ...preSignalChecks,
        artifact_validation: artifactValidation,
      }),
    })
    .where(eq(signals.signal_id, signalId));

  if (!allChecksPassed) {
    const failures: string[] = [];

    if (!preSignalChecks.build.passed) {
      failures.push(
        `Build failed${
          preSignalChecks.build.output
            ? `: ${preSignalChecks.build.output}`
            : ""
        }`
      );
    }
    if (!preSignalChecks.test.passed) {
      failures.push(
        `Tests failed${
          preSignalChecks.test.output ? `: ${preSignalChecks.test.output}` : ""
        }`
      );
    }
    if (!preSignalChecks.lint.passed) {
      failures.push(
        `Lint failed${
          preSignalChecks.lint.output ? `: ${preSignalChecks.lint.output}` : ""
        }`
      );
    }
    if (!artifactValidation.allValid) {
      failures.push(
        `Missing artifacts: ${artifactValidation.missing.join(", ")}`
      );
    }

    throw new Error(
      `Pre-signal checks failed (signal_id: ${signalId}): ${failures.join(
        "; "
      )}`
    );
  }

  // 7. Auto-commit implementation changes if enabled
  const commitMessage = generateCommitMessage({
    operation: "signal",
    taskId: task.task_id,
    taskTitle: task.title,
  });

  const gitResult = await autoCommitIfEnabled({
    toolName: "signal_completion",
    commitMessage,
    sprintId: sprint.id,
    taskInternalId: task.id,
    cwd: resolveWorkspacePath(),
  });

  // 8. Update task status to GATE_CHECK
  await db
    .update(tasks)
    .set({
      status: "GATE_CHECK",
      updated_at: now,
    })
    .where(eq(tasks.id, task.id));

  // 9. Update sprint workflow_step if needed
  if (sprint.workflow_step === "IMPLEMENT") {
    await db
      .update(sprints)
      .set({
        workflow_step: "VERIFY",
        updated_at: now,
      })
      .where(eq(sprints.id, sprint.id));
  }

  // 10. Log progress
  await db.insert(progress).values({
    sprint_id: sprint.id,
    task_id: task.id,
    from_status: task.status,
    to_status: "GATE_CHECK",
    workflow_step: sprint.workflow_step,
    triggered_by: "implementor",
    notes: `Completion signaled (attempt ${attempt})${
      gitResult.committed ? `, committed: ${gitResult.sha}` : ""
    }`,
    changed_at: now,
  });

  // Notify extension of database changes
  writeSignal();

  return {
    success: true,
    signal_id: signalId,
    status: "GATE_CHECK",
    pre_signal_checks: preSignalChecks,
    next_step: "Orchestrator will run verification checks",
    git_commit: gitResult.committed ? gitResult.sha ?? undefined : undefined,
  };
}

/**
 * Get pre-signal configuration from database
 *
 * Reads command configuration from sprint_settings first (for sprint-specific overrides),
 * then falls back to global config table.
 */
async function getPreSignalConfig(): Promise<PreSignalConfig> {
  const db = getDb();
  const workspacePath = resolveWorkspacePath();

  // Get all pre-signal config keys
  const configKeys = [
    "pre_signal_build_command",
    "pre_signal_test_command",
    "pre_signal_lint_command",
    "pre_signal_timeout",
    "pre_signal_skip_build",
    "pre_signal_skip_test",
    "pre_signal_skip_lint",
  ];

  // First, try to get sprint-specific config from active sprint
  const activeSprint = await getActiveSprint();
  const configMap = new Map<string, string>();

  if (activeSprint) {
    // Get sprint-specific settings first (higher priority)
    const sprintConfigRows = await db
      .select()
      .from(sprintSettings)
      .where(
        and(
          eq(sprintSettings.sprint_id, activeSprint.id),
          inArray(sprintSettings.key, configKeys)
        )
      );

    for (const row of sprintConfigRows) {
      configMap.set(row.key, row.value);
    }
  }

  // Then get global config (lower priority - only for keys not already set)
  const globalConfigRows = await db
    .select()
    .from(config)
    .where(inArray(config.key, configKeys));

  for (const row of globalConfigRows) {
    if (!configMap.has(row.key)) {
      configMap.set(row.key, row.value);
    }
  }

  const preSignalConfig: PreSignalConfig = {
    workspacePath,
  };

  // Apply configured values
  const buildCommand = configMap.get("pre_signal_build_command");
  if (buildCommand) {
    preSignalConfig.buildCommand = buildCommand;
  }

  const testCommand = configMap.get("pre_signal_test_command");
  if (testCommand) {
    preSignalConfig.testCommand = testCommand;
  }

  const lintCommand = configMap.get("pre_signal_lint_command");
  if (lintCommand) {
    preSignalConfig.lintCommand = lintCommand;
  }

  const timeout = configMap.get("pre_signal_timeout");
  if (timeout) {
    preSignalConfig.timeout = parseInt(timeout, 10);
  }

  const skipBuild = configMap.get("pre_signal_skip_build");
  if (skipBuild === "true") {
    preSignalConfig.skipBuild = true;
  }

  const skipTest = configMap.get("pre_signal_skip_test");
  if (skipTest === "true") {
    preSignalConfig.skipTest = true;
  }

  const skipLint = configMap.get("pre_signal_skip_lint");
  if (skipLint === "true") {
    preSignalConfig.skipLint = true;
  }

  return preSignalConfig;
}
