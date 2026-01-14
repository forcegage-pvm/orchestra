/**
 * register_tdd_red_test tool handler
 *
 * Implementor registers a failing (red) test during TDD red-phase development.
 * Validates tdd_red_phase=true, task not complete, identifier format, and duplicates.
 */

import { and, eq } from "drizzle-orm";
import { registerTest } from "../../core/tdd-registry.js";
import { getActiveSprint, getDb } from "../../db/index.js";
import { tasks, tddRedRegistry } from "../../db/schema.js";
import {
  RegisterTddRedTestInputSchema,
  type RegisterTddRedTestOutput,
} from "../../schemas/tdd-registry.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

export async function handleRegisterTddRedTest(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(RegisterTddRedTestInputSchema, input);
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
    const output = await registerTddRedTest(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "register_tdd_red_test",
        role: "implementor",
        input: validation.data,
        taskId: validation.data.task_id,
      },
      { success: true, output },
      durationMs
    );

    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    const err = error instanceof Error ? error : new Error(String(error));

    await logToolExecution(
      {
        toolName: "register_tdd_red_test",
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

async function registerTddRedTest(
  input: typeof RegisterTddRedTestInputSchema._output
): Promise<RegisterTddRedTestOutput> {
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

  // 3. Validation: tdd_red_phase must be true
  if (!task.tdd_red_phase) {
    throw new Error(`Task ${input.task_id} is not a TDD red-phase task`);
  }

  // 4. Validation: task must not be complete
  if (task.status === "COMPLETE") {
    throw new Error("Cannot register tests for completed task");
  }

  // 5. Validation: test_identifier format (must contain ::)
  if (!input.test_identifier.includes("::")) {
    throw new Error("Invalid test_identifier format");
  }

  // 6. Validation: check for duplicates in sprint
  const [existing] = await db
    .select()
    .from(tddRedRegistry)
    .where(
      and(
        eq(tddRedRegistry.sprint_id, sprint.id),
        eq(tddRedRegistry.test_identifier, input.test_identifier)
      )
    )
    .limit(1);

  if (existing) {
    throw new Error(`Test already registered: ${input.test_identifier}`);
  }

  // 7. Register the test using core function
  const options: {
    taskId: number;
    testIdentifier: string;
    description?: string;
    markerType?: string;
  } = {
    taskId: input.task_id,
    testIdentifier: input.test_identifier,
  };

  if (input.description !== undefined) {
    options.description = input.description;
  }

  if (input.marker_type !== undefined) {
    options.markerType = input.marker_type;
  }

  const result = await registerTest(options);

  return {
    success: true,
    registry_id: result.registryId,
    test_identifier: result.testIdentifier,
    status: "REGISTERED",
    next_step: "Continue writing red tests or signal completion when done",
  };
}
