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
import { validateInput } from "../../schemas/utils.js";

export async function handleUpdateVerification(input: unknown) {
  const validation = validateInput(UpdateVerificationInputSchema, input);
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
    const output = await updateVerification(validation.data);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
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
  const structural = input.verification.structural_checks || [];
  const behavioral = input.verification.behavioral_checks || [];
  const quality = input.verification.quality_checks || [];

  // Extract config from check objects (everything except description/severity)
  const extractConfig = (check: Record<string, unknown>): string => {
    const { description: _d, severity: _s, ...config } = check;
    return JSON.stringify(config);
  };

  const allChecks = [
    ...structural.map((check, idx) => ({
      task_id: task.id,
      check_id: `struct-${idx}`,
      check_type: "structural" as const,
      description: check.description,
      severity: check.severity,
      check_config: extractConfig(check as unknown as Record<string, unknown>),
      created_at: now,
    })),
    ...behavioral.map((check, idx) => ({
      task_id: task.id,
      check_id: `behav-${idx}`,
      check_type: "behavioral" as const,
      description: check.description,
      severity: check.severity,
      check_config: extractConfig(check as unknown as Record<string, unknown>),
      created_at: now,
    })),
    ...quality.map((check, idx) => ({
      task_id: task.id,
      check_id: `qual-${idx}`,
      check_type: "quality" as const,
      description: check.description,
      severity: check.severity,
      check_config: extractConfig(check as unknown as Record<string, unknown>),
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
    sprint_id: sprint.id,
    task_id: task.id,
    from_status: task.status,
    to_status: task.status,
    workflow_step: sprint.workflow_step,
    triggered_by: "orchestrator",
    notes: `Updated verification checks: ${totalChecks} total (${structural.length} structural, ${behavioral.length} behavioral, ${quality.length} quality)`,
    changed_at: now,
  });

  return {
    success: true,
    task_id: input.task_id,
    total_checks: totalChecks,
  };
}
