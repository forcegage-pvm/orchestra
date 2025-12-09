/**
 * signal_completion tool handler
 *
 * Implementor signals task completion.
 * Runs pre-signal checks, creates signal record, transitions task to GATE_CHECK.
 */

import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { config, progress, signals, sprints, tasks } from "../../db/schema.js";
import {
  SignalCompletionInputSchema,
  type SignalCompletionOutput,
} from "../../schemas/signal.js";
import { createErrorResponse, validateInput } from "../../schemas/utils.js";

export async function handleSignalCompletion(input: unknown) {
  const validation = validateInput(SignalCompletionInputSchema, input);
  if (!validation.success) {
    return createErrorResponse(validation.error);
  }

  try {
    const output = await signalCompletion(validation.data);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

async function signalCompletion(
  input: typeof SignalCompletionInputSchema._output
): Promise<SignalCompletionOutput> {
  const db = getDb();

  // 1. Get active sprint
  const [sprint] = await db.select().from(sprints).limit(1);

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

  // 3. Validate task is in IMPLEMENT state
  if (task.status !== "IMPLEMENT") {
    throw new Error(
      `Task ${input.task_id} is in ${task.status} state, expected IMPLEMENT`
    );
  }

  // 4. Run pre-signal checks
  const preSignalChecks = runPreSignalChecks(input);

  if (!preSignalChecks.can_proceed) {
    throw new Error(
      `Pre-signal checks failed: ${preSignalChecks.failures.join(", ")}`
    );
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
    task_id: task.id,
    status: "GATE_CHECK",
    triggered_by: "implementor",
    notes: `Completion signaled (attempt ${attempt})${
      autoCommitEnabled ? ", auto-commit: enabled" : ""
    }`,
    changed_at: now,
  });

  return {
    success: true,
    message: `Completion signal recorded for task ${input.task_id}`,
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
  can_proceed: boolean;
  passed_checks: string[];
  failures: string[];
} {
  const passed: string[] = [];
  const failures: string[] = [];

  // Check: At least one artifact
  if (input.artifacts_created.length > 0) {
    passed.push("artifacts_present");
  } else {
    failures.push("No artifacts created");
  }

  // Check: Build status PASS
  if (input.build_status === "PASS") {
    passed.push("build_passed");
  } else {
    failures.push("Build did not pass");
  }

  // Check: Test status PASS
  if (input.test_status === "PASS") {
    passed.push("tests_passed");
  } else {
    failures.push("Tests did not pass");
  }

  // Check: Summary length
  if (input.summary.length >= 10) {
    passed.push("summary_provided");
  } else {
    failures.push("Summary too short");
  }

  return {
    can_proceed: failures.length === 0,
    passed_checks: passed,
    failures,
  };
}
