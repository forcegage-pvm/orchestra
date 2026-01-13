/**
 * set_config tool handler
 *
 * Sets configuration values in the config table.
 * Used to configure pre-signal commands, timeouts, and other settings.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/index.js";
import { logToolExecution } from "./audit-logging.js";
import { config } from "../../db/schema.js";
import { validateInput } from "../../schemas/utils.js";

/**
 * Input schema for set_config
 */
export const SetConfigInputSchema = z.object({
  /** Configuration key */
  key: z.string().min(1, "Key is required"),
  /** Configuration value (stored as string) */
  value: z.string().min(0),
  /** Optional description of the configuration */
  description: z.string().optional(),
});

export type SetConfigInput = z.infer<typeof SetConfigInputSchema>;

/**
 * Output type for set_config
 */
export interface SetConfigOutput {
  success: boolean;
  key: string;
  value: string;
  action: "created" | "updated";
}

/**
 * Handle set_config tool call
 */
export async function handleSetConfig(
  input: unknown
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startTime = performance.now();
  // Validate input
  const validation = validateInput(SetConfigInputSchema, input);
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

  const { key, value, description } = validation.data;

  try {
    const result = await setConfig(key, value, description);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "set_config",
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
        toolName: "set_config",
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
 * Set a configuration value
 */
async function setConfig(
  key: string,
  value: string,
  description?: string
): Promise<SetConfigOutput> {
  const db = getDb();
  const now = new Date().toISOString();

  // Check if key exists
  const [existing] = await db
    .select()
    .from(config)
    .where(eq(config.key, key))
    .limit(1);

  if (existing) {
    // Update existing
    await db
      .update(config)
      .set({
        value,
        ...(description !== undefined ? { description } : {}),
        updated_at: now,
      })
      .where(eq(config.key, key));

    return {
      success: true,
      key,
      value,
      action: "updated",
    };
  } else {
    // Insert new
    await db.insert(config).values({
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
      action: "created",
    };
  }
}
