/**
 * update_sprint_spec tool handler
 *
 * Updates spec_path and/or spec_files for a sprint.
 * Allows modifying spec traceability configuration after sprint creation.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/index.js";
import { sprints } from "../../db/schema.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

/**
 * Input schema for update_sprint_spec
 */
export const UpdateSprintSpecInputSchema = z
  .object({
    sprint_id: z.string().optional(),
    spec_path: z.string().min(1).optional(),
    spec_files: z.array(z.string()).optional(),
  })
  .refine(
    (data) => data.spec_path !== undefined || data.spec_files !== undefined,
    {
      message: "At least one of spec_path or spec_files must be provided",
    },
  );

export type UpdateSprintSpecInput = z.infer<typeof UpdateSprintSpecInputSchema>;

/**
 * Output type for update_sprint_spec
 */
export interface UpdateSprintSpecOutput {
  success: boolean;
  sprint_id: string;
  spec_path: string | null;
  spec_files: string[];
  updated_fields: string[];
}

/**
 * Handle update_sprint_spec tool call
 */
export async function handleUpdateSprintSpec(
  input: unknown,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startTime = performance.now();

  const validation = validateInput(UpdateSprintSpecInputSchema, input);
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
    const result = await updateSprintSpec(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "update_sprint_spec",
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
        toolName: "update_sprint_spec",
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

async function updateSprintSpec(
  input: UpdateSprintSpecInput,
): Promise<UpdateSprintSpecOutput> {
  const db = getDb();

  // Get target sprint
  let sprintId = input.sprint_id;

  if (!sprintId) {
    const activeSprint = await db
      .select()
      .from(sprints)
      .where(eq(sprints.is_active, true))
      .limit(1);

    if (activeSprint.length === 0) {
      throw new Error("No active sprint found. Provide sprint_id explicitly.");
    }

    sprintId = activeSprint[0]!.id;
  }

  // Verify sprint exists
  const sprintRows = await db
    .select()
    .from(sprints)
    .where(eq(sprints.id, sprintId));

  if (sprintRows.length === 0) {
    throw new Error(`Sprint not found: ${sprintId}`);
  }

  const sprint = sprintRows[0]!;

  // Build update object
  const updates: Partial<{
    spec_path: string;
    spec_files: string;
    updated_at: string;
  }> = {
    updated_at: new Date().toISOString(),
  };

  const updatedFields: string[] = [];

  if (input.spec_path !== undefined) {
    updates.spec_path = input.spec_path;
    updatedFields.push("spec_path");
  }

  if (input.spec_files !== undefined) {
    updates.spec_files = JSON.stringify(input.spec_files);
    updatedFields.push("spec_files");
  }

  // Update sprint
  await db.update(sprints).set(updates).where(eq(sprints.id, sprintId));

  // Return updated values
  const newSpecPath = input.spec_path ?? sprint.spec_path ?? null;
  const newSpecFiles = input.spec_files ?? parseJsonArray(sprint.spec_files);

  return {
    success: true,
    sprint_id: sprintId,
    spec_path: newSpecPath,
    spec_files: newSpecFiles,
    updated_fields: updatedFields,
  };
}

function parseJsonArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
