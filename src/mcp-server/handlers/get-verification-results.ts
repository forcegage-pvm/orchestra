/**
 * get_verification_results tool handler
 *
 * Retrieves verification check execution results for the latest signal of a task.
 * Returns orchestrator view with full check details.
 */

import { and, desc, eq } from "drizzle-orm";
import { getActiveSprint, getDb } from "../../db/index.js";
import { signals, tasks, verificationResults } from "../../db/schema.js";
import { validateInput } from "../../schemas/utils.js";
import {
  GetVerificationResultsInputSchema,
  type GetVerificationResultsOutput,
} from "../../schemas/verification.js";

export async function handleGetVerificationResults(input: unknown) {
  const validation = validateInput(GetVerificationResultsInputSchema, input);
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
    const output = await getVerificationResults(validation.data);
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

async function getVerificationResults(
  input: typeof GetVerificationResultsInputSchema._output
): Promise<GetVerificationResultsOutput> {
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

  // 3. Get latest signal
  const [signal] = await db
    .select()
    .from(signals)
    .where(eq(signals.task_id, task.id))
    .orderBy(desc(signals.attempt))
    .limit(1);

  if (!signal) {
    throw new Error(`No signal found for task ${input.task_id}`);
  }

  // 4. Get verification results for this signal
  const results = await db
    .select()
    .from(verificationResults)
    .where(eq(verificationResults.signal_id, signal.signal_id));

  if (results.length === 0) {
    throw new Error(
      `No verification results found for task ${input.task_id} signal ${signal.signal_id}`
    );
  }

  // 5. Build output
  const resultsOutput = results.map((r) => ({
    check_id: r.check_id.toString(),
    passed: r.passed === 1,
    output: r.output || undefined,
    duration_ms: r.duration_ms,
  }));

  const totalChecks = results.length;
  const passed = results.filter((r) => r.passed === 1).length;
  const failed = totalChecks - passed;
  const overallPassed = failed === 0;

  // Use run_at from first result (all should have same timestamp)
  const runAt = results[0]!.run_at;

  return {
    task_id: input.task_id,
    run_at: runAt,
    results: resultsOutput,
    summary: {
      total_checks: totalChecks,
      passed,
      failed,
      overall_passed: overallPassed,
    },
  };
}
