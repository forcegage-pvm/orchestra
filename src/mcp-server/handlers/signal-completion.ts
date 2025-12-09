/**
 * signal_completion tool handler
 *
 * Implementor signals task completion.
 * Runs pre-signal checks, creates signal record, transitions task to GATE_CHECK.
 */

import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { getActiveSprint, getDb } from "../../db/index.js";
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

  // 4. Run pre-signal checks
  const preSignalChecks = runPreSignalChecks(input);

  const allChecksPassed =
    preSignalChecks.build.passed &&
    preSignalChecks.test.passed &&
    preSignalChecks.lint.passed;

  if (!allChecksPassed) {
    const failures = [
      !preSignalChecks.build.passed && "Build did not pass",
      !preSignalChecks.test.passed && "Tests did not pass",
      !preSignalChecks.lint.passed && preSignalChecks.lint.output,
    ].filter(Boolean);

    throw new Error(`Pre-signal checks failed: ${failures.join(", ")}`);
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
 * Run pre-signal validation checks
 */
function runPreSignalChecks(
  input: typeof SignalCompletionInputSchema._output
): {
  build: { passed: boolean; output?: string; duration_ms: number };
  test: { passed: boolean; output?: string; duration_ms: number };
  lint: { passed: boolean; output?: string; duration_ms: number };
} {
  const buildPassed = input.build_status === "PASS";
  const testPassed = input.test_status === "PASS";
  const artifactsPassed = input.artifacts_created.length > 0;
  const summaryPassed = input.summary.length >= 10;

  const lintOutput = !artifactsPassed
    ? "No artifacts created"
    : !summaryPassed
    ? "Summary too short"
    : undefined;

  return {
    build: {
      passed: buildPassed,
      duration_ms: 0,
    },
    test: {
      passed: testPassed,
      duration_ms: 0,
    },
    lint: {
      passed: artifactsPassed && summaryPassed,
      ...(lintOutput ? { output: lintOutput } : {}),
      duration_ms: 0,
    },
  };
}
