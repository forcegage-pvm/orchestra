/**
 * set_active_sprint tool handler
 *
 * Sets a sprint as the active sprint. Only one sprint can be active at a time.
 * All other sprints are deactivated when this is called.
 */

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/index.js";
import { logToolExecution } from "./audit-logging.js";
import { sprints } from "../../db/schema.js";
import { validateInput } from "../../schemas/utils.js";
import { writeSignal } from "../db-signal.js";

const SetActiveSprintInputSchema = z.object({
  sprint_id: z
    .string()
    .min(1)
    .describe("The ID of the sprint to set as active"),
});

interface SetActiveSprintOutput {
  success: boolean;
  sprint_id: string;
  sprint_name: string;
  message: string;
}

export async function handleSetActiveSprint(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(SetActiveSprintInputSchema, input);
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
    const output = await setActiveSprint(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "set_active_sprint",
        role: "orchestrator",
        input: validation.data,
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

    await logToolExecution(
      {
        toolName: "set_active_sprint",
        role: "orchestrator",
        input: validation.data,
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

async function setActiveSprint(
  input: z.output<typeof SetActiveSprintInputSchema>
): Promise<SetActiveSprintOutput> {
  const db = getDb();

  // 1. Verify the sprint exists
  const [sprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.id, input.sprint_id))
    .limit(1);

  if (!sprint) {
    throw new Error(`Sprint not found: ${input.sprint_id}`);
  }

  // 2. Check if sprint is completed
  if (sprint.completed_at) {
    throw new Error(
      `Cannot activate completed sprint: ${input.sprint_id}. ` +
        `Sprint was completed at ${sprint.completed_at}.`
    );
  }

  // 3. Deactivate all sprints
  await db.run(sql`UPDATE sprints SET is_active = 0`);

  // 4. Activate the requested sprint
  const now = new Date().toISOString();
  await db
    .update(sprints)
    .set({
      is_active: true,
      updated_at: now,
    })
    .where(eq(sprints.id, input.sprint_id));

  writeSignal();

  return {
    success: true,
    sprint_id: sprint.id,
    sprint_name: sprint.name,
    message: `Sprint "${sprint.name}" (${sprint.id}) is now active`,
  };
}
