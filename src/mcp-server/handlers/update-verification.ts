/**
 * update_verification tool handler
 *
 * Replaces ALL verification checks for a task with new criteria.
 * Deletes existing checks and inserts new ones.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import {
  progress,
  sprints,
  tasks,
  verificationChecks,
} from "../../db/schema.js";
import {
  UpdateVerificationInputSchema,
  type UpdateVerificationOutput,
} from "../../schemas/sprint-config.js";
import { createErrorResponse, validateInput } from "../../schemas/utils.js";

export async function handleUpdateVerification(input: unknown) {
  const validation = validateInput(UpdateVerificationInputSchema, input);
  if (!validation.success) {
    return createErrorResponse(validation.error);
  }

  try {
    const output = await updateVerification(validation.data);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

async function updateVerification(
  input: typeof UpdateVerificationInputSchema._output
): Promise<UpdateVerificationOutput> {
  const db = getDb();

  // 1. Get active sprint
  const [sprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.workflow_step, "CONFIGURE"))
    .limit(1);

  if (!sprint) {
    throw new Error("No active sprint in CONFIGURE state");
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
    throw new Error(`Task ${input.task_id} not found in active sprint`);
  }

  const now = new Date().toISOString();

  // 3. Delete existing verification checks
  await db
    .delete(verificationChecks)
    .where(eq(verificationChecks.task_id, task.id));

  // 4. Insert new verification checks
  const structural = input.verification.structural || [];
  const behavioral = input.verification.behavioral || [];
  const quality = input.verification.quality || [];

  const allChecks = [
    ...structural.map((check, idx) => ({
      task_id: task.id,
      check_id: `struct-${idx}`,
      check_type: "structural" as const,
      description: check.description,
      severity: check.severity,
      check_config: JSON.stringify(check.check_config),
      created_at: now,
    })),
    ...behavioral.map((check, idx) => ({
      task_id: task.id,
      check_id: `behav-${idx}`,
      check_type: "behavioral" as const,
      description: check.description,
      severity: check.severity,
      check_config: JSON.stringify(check.check_config),
      created_at: now,
    })),
    ...quality.map((check, idx) => ({
      task_id: task.id,
      check_id: `qual-${idx}`,
      check_type: "quality" as const,
      description: check.description,
      severity: check.severity,
      check_config: JSON.stringify(check.check_config),
      created_at: now,
    })),
  ];

  const totalChecks = allChecks.length;

  if (totalChecks > 0) {
    await db.insert(verificationChecks).values(allChecks);
  }

  // 5. Update task timestamp
  await db.update(tasks).set({ updated_at: now }).where(eq(tasks.id, task.id));

  // 6. Log progress
  await db.insert(progress).values({
    task_id: task.id,
    status: task.status,
    triggered_by: "orchestrator",
    notes: `Updated verification checks: ${totalChecks} total (${structural.length} structural, ${behavioral.length} behavioral, ${quality.length} quality)`,
    changed_at: now,
  });

  return {
    success: true,
    message: `Verification criteria updated for task ${input.task_id}`,
    task_id: input.task_id,
    total_checks: totalChecks,
    checks_by_type: {
      structural: structural.length,
      behavioral: behavioral.length,
      quality: quality.length,
    },
  };
}
