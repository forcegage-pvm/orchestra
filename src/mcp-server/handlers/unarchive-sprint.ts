/**
 * unarchive_sprint tool handler
 *
 * Unarchives a sprint to restore it to active views.
 * Only archived sprints can be unarchived.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/index.js";
import { sprints } from "../../db/schema.js";
import { validateInput } from "../../schemas/utils.js";
import { writeSignal } from "../db-signal.js";
import { logToolExecution } from "./audit-logging.js";

const UnarchiveSprintInputSchema = z.object({
  sprint_id: z.string().min(1).describe("The ID of the sprint to unarchive"),
});

type UnarchiveSprintErrorCode = "SPRINT_NOT_FOUND" | "SPRINT_NOT_ARCHIVED";

interface UnarchiveSprintOutput {
  success: true;
  sprint_id: string;
  sprint_name: string;
  message: string;
}

interface UnarchiveSprintErrorOutput {
  success: false;
  error: {
    code: UnarchiveSprintErrorCode | "SYSTEM_ERROR";
    message: string;
  };
}

class UnarchiveSprintError extends Error {
  public readonly code: UnarchiveSprintErrorCode;

  public constructor(code: UnarchiveSprintErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export async function handleUnarchiveSprint(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(UnarchiveSprintInputSchema, input);
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
    const output = await unarchiveSprint(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "unarchive_sprint",
        role: "orchestrator",
        input: validation.data,
      },
      { success: true, output },
      durationMs,
    );

    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    const err = error instanceof Error ? error : new Error(String(error));
    const errorCode =
      error instanceof UnarchiveSprintError ? error.code : "SYSTEM_ERROR";

    await logToolExecution(
      {
        toolName: "unarchive_sprint",
        role: "orchestrator",
        input: validation.data,
      },
      { success: false, errorMessage: err.message },
      durationMs,
    );

    const output: UnarchiveSprintErrorOutput = {
      success: false,
      error: {
        code: errorCode,
        message: err.message,
      },
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(output, null, 2),
        },
      ],
    };
  }
}

async function unarchiveSprint(
  input: z.output<typeof UnarchiveSprintInputSchema>,
): Promise<UnarchiveSprintOutput> {
  const db = getDb();

  const [sprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.id, input.sprint_id))
    .limit(1);

  if (!sprint) {
    throw new UnarchiveSprintError(
      "SPRINT_NOT_FOUND",
      `Sprint not found: ${input.sprint_id}`,
    );
  }

  if (!sprint.is_archived) {
    throw new UnarchiveSprintError(
      "SPRINT_NOT_ARCHIVED",
      `Sprint is not archived: ${input.sprint_id}`,
    );
  }

  const now = new Date().toISOString();
  await db
    .update(sprints)
    .set({
      is_archived: false,
      updated_at: now,
    })
    .where(eq(sprints.id, input.sprint_id));

  writeSignal();

  return {
    success: true,
    sprint_id: sprint.id,
    sprint_name: sprint.name,
    message: `Sprint "${sprint.name}" (${sprint.id}) unarchived`,
  };
}
