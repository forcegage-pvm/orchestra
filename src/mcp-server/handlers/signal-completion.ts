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
import {
  runPreSignalChecks,
  type PreSignalConfig,
} from "../../core/pre-signal-executor.js";
import {
  getActiveSprint,
  getDb,
  resolveWorkspacePath,
} from "../../db/index.js";
import { config, progress, signals, sprints, tasks } from "../../db/schema.js";
import {
  SignalCompletionInputSchema,
  type SignalCompletionOutput,
} from "../../schemas/signal.js";
import { validateInput } from "../../schemas/utils.js";

export async function handleSignalCompletion(input: unknown) {
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
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
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

  // 4. Run pre-signal checks (GAP-01: actually execute commands)
  const preSignalConfig = await getPreSignalConfig();
  const preSignalChecks = await runPreSignalChecks(preSignalConfig);

  // 4b. Validate artifacts exist (VER-003)
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

    throw new Error(`Pre-signal checks failed: ${failures.join("; ")}`);
  }

  // 5. Get configuration for auto-commit setting
  const [autoCommitConfig] = await db
    .select()
    .from(config)
    .where(eq(config.key, "auto_commit_enabled"))
    .limit(1);

  const autoCommitEnabled =
    autoCommitConfig && autoCommitConfig.value === "true";

  const now = new Date().toISOString();
  const signalId = randomUUID();
  const attempt = task.retry_count + 1;

  // 6. Create signal record
  await db.insert(signals).values({
    task_id: task.id,
    signal_id: signalId,
    attempt,
    summary: input.summary,
    artifacts_created: JSON.stringify(input.artifacts_created),
    tests: input.tests ? JSON.stringify(input.tests) : JSON.stringify([]),
    build_status: input.build_status,
    test_status: input.test_status,
    pre_signal_checks: JSON.stringify(preSignalChecks),
    notes: input.notes,
    signaled_at: now,
  });

  // 7. Update task status to GATE_CHECK
  await db
    .update(tasks)
    .set({
      status: "GATE_CHECK",
      updated_at: now,
    })
    .where(eq(tasks.id, task.id));

  // 8. Update sprint workflow_step if needed
  if (sprint.workflow_step === "IMPLEMENT") {
    await db
      .update(sprints)
      .set({
        workflow_step: "VERIFY",
        updated_at: now,
      })
      .where(eq(sprints.id, sprint.id));
  }

  // 9. Log progress
  await db.insert(progress).values({
    sprint_id: sprint.id,
    task_id: task.id,
    from_status: "IMPLEMENT",
    to_status: "GATE_CHECK",
    workflow_step: sprint.workflow_step,
    triggered_by: "implementor",
    notes: `Completion signaled (attempt ${attempt})${
      autoCommitEnabled ? ", auto-commit: enabled" : ""
    }`,
    changed_at: now,
  });

  return {
    success: true,
    signal_id: signalId,
    status: "GATE_CHECK",
    pre_signal_checks: preSignalChecks,
    next_step: "Orchestrator will run verification checks",
  };
}

/**
 * Get pre-signal configuration from database
 *
 * Reads command configuration from the config table.
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

  const configRows = await db
    .select()
    .from(config)
    .where(inArray(config.key, configKeys));

  // Build config object from database values
  const configMap = new Map(configRows.map((row) => [row.key, row.value]));

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
