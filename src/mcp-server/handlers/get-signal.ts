/**
 * get_signal tool handler
 *
 * Retrieves signal details for a specific task attempt.
 * Defaults to latest attempt if not specified.
 */

import { and, desc, eq } from "drizzle-orm";
import { getActiveSprint, getDb } from "../../db/index.js";
import { signals, tasks } from "../../db/schema.js";
import {
  GetSignalInputSchema,
  type GetSignalOutput,
} from "../../schemas/signal.js";
import { validateInput } from "../../schemas/utils.js";

export async function handleGetSignal(input: unknown) {
  const validation = validateInput(GetSignalInputSchema, input);
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
    const output = await getSignal(validation.data);
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

async function getSignal(
  input: typeof GetSignalInputSchema._output
): Promise<GetSignalOutput> {
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

  // 3. Get signal - specific attempt or latest
  let signal;

  if (input.attempt !== undefined) {
    [signal] = await db
      .select()
      .from(signals)
      .where(
        and(eq(signals.task_id, task.id), eq(signals.attempt, input.attempt))
      )
      .limit(1);

    if (!signal) {
      throw new Error(
        `No signal found for task ${input.task_id} attempt ${input.attempt}`
      );
    }
  } else {
    // Get latest (highest attempt number)
    [signal] = await db
      .select()
      .from(signals)
      .where(eq(signals.task_id, task.id))
      .orderBy(desc(signals.attempt))
      .limit(1);

    if (!signal) {
      throw new Error(`No signal found for task ${input.task_id}`);
    }
  }

  // 4. Parse JSON fields
  const artifactsCreated = JSON.parse(signal.artifacts_created);
  const tests = JSON.parse(signal.tests);
  const preSignalChecks = JSON.parse(signal.pre_signal_checks);

  return {
    task_id: input.task_id,
    signal_id: signal.signal_id,
    signaled_at: signal.signaled_at,
    attempt: signal.attempt,
    summary: signal.summary,
    artifacts_created: artifactsCreated,
    tests,
    build_status: signal.build_status as "PASS" | "FAIL",
    test_status: signal.test_status as "PASS" | "FAIL",
    notes: signal.notes || undefined,
    pre_signal_checks: preSignalChecks,
  };
}
