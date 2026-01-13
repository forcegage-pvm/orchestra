/**
 * add_phase tool handler
 *
 * Adds a new phase to the active sprint.
 */

import { eq, max } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db/index.js";
import { logToolExecution } from "./audit-logging.js";
import { phases, sprints } from "../../db/schema.js";
import { SuccessResponseSchema } from "../../schemas/errors.js";
import { validateInput } from "../../schemas/utils.js";

// ============================================================================
// Schema
// ============================================================================

export const AddPhaseInputSchema = z.object({
  phase_id: z
    .string()
    .min(1, "Phase ID is required")
    .regex(
      /^[a-z0-9-]+$/,
      "Phase ID must be lowercase alphanumeric with hyphens only"
    ),
  phase_name: z.string().min(1, "Phase name is required"),
  order: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Phase order (auto-assigned if not provided)"),
  speckit_tasks: z
    .array(z.string())
    .optional()
    .describe("Optional speckit task references"),
});

export type AddPhaseInput = z.output<typeof AddPhaseInputSchema>;

export const AddPhaseOutputSchema = SuccessResponseSchema.extend({
  phase_id: z.string(),
  phase_internal_id: z.number().int().positive(),
  order: z.number().int().positive(),
});

export type AddPhaseOutput = z.output<typeof AddPhaseOutputSchema>;

// ============================================================================
// Handler
// ============================================================================

export async function handleAddPhase(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(AddPhaseInputSchema, input);
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
    const output = await addPhase(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "add_phase",
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
        toolName: "add_phase",
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

async function addPhase(input: AddPhaseInput): Promise<AddPhaseOutput> {
  const db = getDb();

  // 1. Get active sprint (any non-completed sprint)
  const [sprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.workflow_step, "SELECT_TASK")) // or any active state
    .limit(1);

  // Also try CONFIGURE state if no active sprint found
  let activeSprint = sprint;
  if (!activeSprint) {
    const [configuringSprint] = await db
      .select()
      .from(sprints)
      .where(eq(sprints.workflow_step, "CONFIGURE"))
      .limit(1);
    activeSprint = configuringSprint;
  }

  if (!activeSprint) {
    throw new Error("No active sprint found");
  }

  // 2. Check if phase_id already exists
  const existingPhase = await db.query.phases.findFirst({
    where: (p, { eq, and }) =>
      and(eq(p.sprint_id, activeSprint.id), eq(p.phase_id, input.phase_id)),
  });

  if (existingPhase) {
    throw new Error(
      `Phase '${input.phase_id}' already exists in sprint '${activeSprint.id}'`
    );
  }

  // 3. Determine order (max + 1 if not provided)
  let phaseOrder = input.order;
  if (!phaseOrder) {
    const [maxOrderResult] = await db
      .select({ maxOrder: max(phases.order) })
      .from(phases)
      .where(eq(phases.sprint_id, activeSprint.id));

    phaseOrder = (maxOrderResult?.maxOrder || 0) + 1;
  }

  // 4. Insert phase
  const [insertedPhase] = await db
    .insert(phases)
    .values({
      sprint_id: activeSprint.id,
      phase_id: input.phase_id,
      phase_name: input.phase_name,
      order: phaseOrder,
      speckit_tasks: input.speckit_tasks
        ? JSON.stringify(input.speckit_tasks)
        : null,
    })
    .returning({ id: phases.id });

  if (!insertedPhase) {
    throw new Error("Failed to insert phase");
  }

  return {
    success: true,
    phase_id: input.phase_id,
    phase_internal_id: insertedPhase.id,
    order: phaseOrder,
  };
}
