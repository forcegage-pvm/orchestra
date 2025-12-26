/**
 * set_sprint_config tool handler
 *
 * Sets sprint-specific configuration values.
 * If no sprint_id is provided, uses the active sprint.
 */

import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/index.js";
import { logToolExecution } from "./audit-logging.js";
import { sprintSettings, sprints } from "../../db/schema.js";
import { validateInput } from "../../schemas/utils.js";

/**
 * Input schema for set_sprint_config
 */
export const SetSprintConfigInputSchema = z.object({
  /** Configuration key */
  key: z.string().min(1, "Key is required"),
  /** Configuration value (stored as string) */
  value: z.string().min(0),
  /** Optional description of the configuration */
  description: z.string().optional(),
  /** Sprint ID (defaults to active sprint if not provided) */
  sprint_id: z.string().optional(),
});

export type SetSprintConfigInput = z.infer<typeof SetSprintConfigInputSchema>;

/**
 * Output type for set_sprint_config
 */
export interface SetSprintConfigOutput {
  success: boolean;
  key: string;
  value: string;
  sprint_id: string;
  action: "created" | "updated";
}

/**
 * Handle set_sprint_config tool call
 */
export async function handleSetSprintConfig(
  input: unknown
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startTime = performance.now();
  // Validate input
  const validation = validateInput(SetSprintConfigInputSchema, input);
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

  const { key, value, description, sprint_id } = validation.data;

  try {
    const result = await setSprintConfig(key, value, description, sprint_id);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "set_sprint_config",
        role: "orchestrator",
        input: validation.data,
      },
      { success: true, output: result },
      durationMs
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    const err = error instanceof Error ? error : new Error(String(error));

    await logToolExecution(
      {
        toolName: "set_sprint_config",
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

/**
 * Set a sprint-specific configuration value
 */
async function setSprintConfig(
  key: string,
  value: string,
  description?: string,
  sprintId?: string
): Promise<SetSprintConfigOutput> {
  const db = getDb();
  const now = new Date().toISOString();

  // Determine the sprint to update
  let targetSprintId = sprintId;

  if (!targetSprintId) {
    // Use active sprint
    const [activeSprint] = await db
      .select()
      .from(sprints)
      .where(eq(sprints.is_active, true))
      .limit(1);

    if (!activeSprint) {
      throw new Error("No active sprint found");
    }

    targetSprintId = activeSprint.id;
  }

  // Verify sprint exists
  const [sprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.id, targetSprintId))
    .limit(1);

  if (!sprint) {
    throw new Error(`Sprint ${targetSprintId} not found`);
  }

  // Check if key exists for this sprint
  const [existing] = await db
    .select()
    .from(sprintSettings)
    .where(
      and(
        eq(sprintSettings.sprint_id, targetSprintId),
        eq(sprintSettings.key, key)
      )
    )
    .limit(1);

  if (existing) {
    // Update existing
    await db
      .update(sprintSettings)
      .set({
        value,
        ...(description !== undefined ? { description } : {}),
        updated_at: now,
      })
      .where(eq(sprintSettings.id, existing.id));

    return {
      success: true,
      key,
      value,
      sprint_id: targetSprintId,
      action: "updated",
    };
  } else {
    // Insert new
    await db.insert(sprintSettings).values({
      sprint_id: targetSprintId,
      key,
      value,
      description: description ?? null,
      created_at: now,
      updated_at: now,
    });

    return {
      success: true,
      key,
      value,
      sprint_id: targetSprintId,
      action: "created",
    };
  }
}
