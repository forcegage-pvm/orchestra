/**
 * archive_sprint tool handler
 *
 * Archives a sprint to remove it from active views.
 * Active sprints cannot be archived.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/index.js";
import { sprints } from "../../db/schema.js";
import { validateInput } from "../../schemas/utils.js";
import { writeSignal } from "../db-signal.js";
import { logToolExecution } from "./audit-logging.js";

const ArchiveSprintInputSchema = z.object({
  sprint_id: z.string().min(1).describe("The ID of the sprint to archive"),
});

type ArchiveSprintErrorCode = "CANNOT_ARCHIVE_ACTIVE" | "SPRINT_NOT_FOUND";

interface ArchiveSprintOutput {
  success: true;
  sprint_id: string;
  sprint_name: string;
  message: string;
}

interface ArchiveSprintErrorOutput {
  success: false;
  error: {
    code: ArchiveSprintErrorCode | "SYSTEM_ERROR";
    message: string;
  };
}

class ArchiveSprintError extends Error {
  public readonly code: ArchiveSprintErrorCode;

  public constructor(code: ArchiveSprintErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export async function handleArchiveSprint(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(ArchiveSprintInputSchema, input);
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
    const output = await archiveSprint(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "archive_sprint",
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
      error instanceof ArchiveSprintError ? error.code : "SYSTEM_ERROR";

    await logToolExecution(
      {
        toolName: "archive_sprint",
        role: "orchestrator",
        input: validation.data,
      },
      { success: false, errorMessage: err.message },
      durationMs,
    );

    const output: ArchiveSprintErrorOutput = {
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

async function archiveSprint(
  input: z.output<typeof ArchiveSprintInputSchema>,
): Promise<ArchiveSprintOutput> {
  const db = getDb();

  const [sprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.id, input.sprint_id))
    .limit(1);

  if (!sprint) {
    throw new ArchiveSprintError(
      "SPRINT_NOT_FOUND",
      `Sprint not found: ${input.sprint_id}`,
    );
  }

  if (sprint.is_active) {
    throw new ArchiveSprintError(
      "CANNOT_ARCHIVE_ACTIVE",
      `Cannot archive active sprint: ${input.sprint_id}`,
    );
  }

  const now = new Date().toISOString();
  await db
    .update(sprints)
    .set({
      is_archived: true,
      updated_at: now,
    })
    .where(eq(sprints.id, input.sprint_id));

  writeSignal();

  return {
    success: true,
    sprint_id: sprint.id,
    sprint_name: sprint.name,
    message: `Sprint "${sprint.name}" (${sprint.id}) archived`,
  };
}
