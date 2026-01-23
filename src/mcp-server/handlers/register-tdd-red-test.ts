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
  type RegisterTddRedTestInput,
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
    // Ensure test_count has a value (Zod default should handle this, but TS needs assurance)
    const inputWithDefaults = {
      ...validation.data,
      test_count: validation.data.test_count ?? 1,
    };
    const output = await registerTddRedTest(inputWithDefaults);
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
  input: RegisterTddRedTestInput
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

  // 5. Validation: check for duplicates in sprint (file-level)
  const [existing] = await db
    .select()
    .from(tddRedRegistry)
    .where(
      and(
        eq(tddRedRegistry.sprint_id, sprint.id),
        eq(tddRedRegistry.test_file, input.test_file)
      )
    )
    .limit(1);

  if (existing) {
    throw new Error(`Test file already registered: ${input.test_file}`);
  }

  // 6. Register the test using core function
  const options: {
    taskId: number;
    testFile: string;
    testCount: number;
  } = {
    taskId: input.task_id,
    testFile: input.test_file,
    testCount: input.test_count,
  };

  const result = await registerTest(options);

  return {
    success: true,
    registry_id: result.registryId,
    test_file: result.testFile,
    test_count: result.testCount,
    next_step: "Continue writing red tests or signal completion when done",
  };
}
