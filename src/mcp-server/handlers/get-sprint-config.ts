/**
 * get_sprint_config tool handler
 *
 * Retrieves sprint-specific configuration values with fallback to global config.
 * If no sprint_id is provided, uses the active sprint.
 */

import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/index.js";
import { logToolExecution } from "./audit-logging.js";
import { config, sprintSettings, sprints } from "../../db/schema.js";
import { validateInput } from "../../schemas/utils.js";

/**
 * Input schema for get_sprint_config
 */
export const GetSprintConfigInputSchema = z.object({
  /** Configuration key */
  key: z.string().min(1, "Key is required"),
  /** Sprint ID (defaults to active sprint if not provided) */
  sprint_id: z.string().optional(),
});

export type GetSprintConfigInput = z.infer<typeof GetSprintConfigInputSchema>;

/**
 * Output type for get_sprint_config
 */
export interface GetSprintConfigOutput {
  success: boolean;
  key: string;
  value: string | null;
  source: "sprint" | "global" | "not_found";
  sprint_id?: string;
}

/**
 * Handle get_sprint_config tool call
 */
export async function handleGetSprintConfig(
  input: unknown
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startTime = performance.now();
  // Validate input
  const validation = validateInput(GetSprintConfigInputSchema, input);
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

  const { key, sprint_id } = validation.data;

  try {
    const result = await getSprintConfig(key, sprint_id);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "get_sprint_config",
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
        toolName: "get_sprint_config",
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
 * Get a sprint-specific configuration value with fallback to global config
 */
async function getSprintConfig(
  key: string,
  sprintId?: string
): Promise<GetSprintConfigOutput> {
  const db = getDb();

  // Determine the sprint to query
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

  // Try sprint-specific config first
  const [sprintValue] = await db
    .select()
    .from(sprintSettings)
    .where(
      and(
        eq(sprintSettings.sprint_id, targetSprintId),
        eq(sprintSettings.key, key)
      )
    )
    .limit(1);

  if (sprintValue) {
    return {
      success: true,
      key,
      value: sprintValue.value,
      source: "sprint",
      sprint_id: targetSprintId,
    };
  }

  // Fall back to global config
  const [globalValue] = await db
    .select()
    .from(config)
    .where(eq(config.key, key))
    .limit(1);

  if (globalValue) {
    return {
      success: true,
      key,
      value: globalValue.value,
      source: "global",
      sprint_id: targetSprintId,
    };
  }

  // Not found in either
  return {
    success: true,
    key,
    value: null,
    source: "not_found",
    sprint_id: targetSprintId,
  };
}
