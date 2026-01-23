/**
 * set_config tool handler
 *
 * Sets configuration values in the config table.
 * Used to configure pre-signal commands, timeouts, and other settings.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/index.js";
import { config } from "../../db/schema.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

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
  input: unknown,
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
      durationMs,
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
      durationMs,
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
            2,
          ),
        },
      ],
    };
  }
}

/**
 * Validate pre-signal configuration values
 * Prevents dangerous or invalid values from being set
 */
function validatePreSignalConfig(key: string, value: string): string | null {
  switch (key) {
    case "pre_signal_build_command": {
      // BLOCK non-existent scripts to prevent misconfiguration
      // build:prod is a common mistake (doesn't exist in this project)
      if (value.includes("build:prod")) {
        return (
          `DANGEROUS: 'build:prod' is not a valid npm script in this project. Use 'npm run build' instead. ` +
          `Setting invalid build commands causes pre-signal checks to fail and blocks signal completion.`
        );
      }
      // Empty value clears the config (uses default)
      return null;
    }

    case "pre_signal_skip_build":
    case "pre_signal_skip_test":
    case "pre_signal_skip_lint": {
      // DANGEROUS: Skipping checks masks real errors
      if (value === "true") {
        return (
          `DANGEROUS: Setting ${key}=true disables verification checks and can mask real errors. ` +
          `This caused Task 4 in Sprint 006 to be escalated incorrectly. ` +
          `Only set to 'true' temporarily for debugging, then immediately set back to 'false'.`
        );
      }
      return null;
    }

    case "pre_signal_timeout": {
      const timeout = parseInt(value, 10);
      if (isNaN(timeout)) {
        return `Invalid timeout value: must be a number (milliseconds)`;
      }
      if (timeout < 60000) {
        return (
          `DANGEROUS: Timeout ${timeout}ms (${timeout / 1000}s) is too short. ` +
          `Minimum is 60000ms (60 seconds). This project's test suite takes ~72 seconds. ` +
          `Use at least 120000ms (2 minutes) for reliable operation.`
        );
      }
      if (timeout > 600000) {
        return `Warning: Timeout very long: ${timeout}ms (${timeout / 60000} minutes). Consider if this is intentional.`;
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Set a configuration value
 */
async function setConfig(
  key: string,
  value: string,
  description?: string,
): Promise<SetConfigOutput> {
  // Validate pre-signal config values
  const validationWarning = validatePreSignalConfig(key, value);
  if (validationWarning) {
    // For dangerous values, block entirely
    if (
      validationWarning.startsWith("DANGEROUS:") ||
      validationWarning.startsWith("Invalid")
    ) {
      throw new Error(validationWarning);
    }
    // For warnings, log but allow (could enhance to return warning in response)
    console.error(`[set_config] ${validationWarning}`);
  }

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
