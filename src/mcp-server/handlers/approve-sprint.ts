/**
 * approve_sprint tool handler (Controller Agent)
 *
 * Approves a sprint configuration after Controller review.
 * Transitions sprint status from PENDING_SPEC_REVIEW to ACTIVE.
 * Transitions workflow_step from SPEC_REVIEW to SELECT_TASK.
 *
 * Sprint 004: Controller Agent - T017
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getActiveSprint, getDb } from "../../db/index.js";
import { specReviews, sprints } from "../../db/schema.js";
import { validateInput } from "../../schemas/utils.js";
import { writeSignal } from "../db-signal.js";
import { logToolExecution } from "./audit-logging.js";

const ApproveSprintInputSchema = z.object({
  conformance: z
    .enum(["PASS", "WARN"])
    .describe(
      "Conformance level: PASS for full alignment, WARN for minor issues"
    ),
  notes: z
    .string()
    .optional()
    .describe("Required if conformance is WARN - explain the minor issues"),
  spec_path: z
    .string()
    .optional()
    .describe("Path to the specification document that was reviewed"),
  spec_requirements: z
    .array(z.string())
    .optional()
    .describe("List of specification requirements that were verified"),
  recommendations: z
    .array(z.string())
    .optional()
    .describe("Optional recommendations for the orchestrator"),
});

interface ApproveSprintOutput {
  success: boolean;
  sprint_id: string;
  previous_status: string;
  new_status: string;
  previous_workflow_step: string;
  new_workflow_step: string;
  conformance: string;
  message: string;
}

export async function handleApproveSprint(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(ApproveSprintInputSchema, input);
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

  // Validate: WARN conformance requires notes
  if (validation.data.conformance === "WARN" && !validation.data.notes) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: {
                code: "VALIDATION_ERROR",
                message: "Notes are required when conformance is WARN",
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  try {
    const output = await approveSprint(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "approve_sprint",
        role: "controller",
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
        toolName: "approve_sprint",
        role: "controller",
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

async function approveSprint(
  input: z.output<typeof ApproveSprintInputSchema>
): Promise<ApproveSprintOutput> {
  const db = getDb();
  const now = new Date().toISOString();

  // 1. Get active sprint
  const sprint = await getActiveSprint();
  if (!sprint) {
    throw new Error("No active sprint found");
  }

  // 2. Validate sprint is in PENDING_SPEC_REVIEW state
  if (sprint.status !== "PENDING_SPEC_REVIEW") {
    throw new Error(
      `Sprint "${sprint.id}" is in "${sprint.status}" state. ` +
        `Only sprints in PENDING_SPEC_REVIEW state can be approved. ` +
        `Current workflow_step: ${sprint.workflow_step}`
    );
  }

  // 3. Update sprint status to ACTIVE and workflow_step to SELECT_TASK
  await db
    .update(sprints)
    .set({
      status: "ACTIVE",
      workflow_step: "SELECT_TASK",
      updated_at: now,
    })
    .where(eq(sprints.id, sprint.id));

  // 4. Count previous reviews for revision tracking (T038 - US4)
  const revisionCountResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(specReviews)
    .where(
      and(eq(specReviews.sprint_id, sprint.id), isNull(specReviews.task_id))
    );
  const previousReviewCount = revisionCountResult[0]?.count ?? 0;

  // 5. Get previous review ID for chaining
  const [previousReview] = await db
    .select({ id: specReviews.id })
    .from(specReviews)
    .where(
      and(eq(specReviews.sprint_id, sprint.id), isNull(specReviews.task_id))
    )
    .orderBy(sql`reviewed_at DESC`)
    .limit(1);

  // 6. Create spec_reviews audit record (T038 - US4)
  await db.insert(specReviews).values({
    sprint_id: sprint.id,
    task_id: null, // Sprint-level review
    review_type: "SPRINT",
    decision: "APPROVED",
    conformance: input.conformance,
    spec_path: input.spec_path ?? null,
    spec_requirements: JSON.stringify(input.spec_requirements ?? []),
    issues: JSON.stringify([]), // No issues on approval
    recommendations: input.recommendations
      ? JSON.stringify(input.recommendations)
      : null,
    notes: input.notes ?? null,
    reviewed_by: "controller",
    reviewed_at: now,
    revision_count: previousReviewCount,
    previous_review_id: previousReview?.id ?? null,
  });

  // Notify extension of database changes
  writeSignal();

  return {
    success: true,
    sprint_id: sprint.id,
    previous_status: "PENDING_SPEC_REVIEW",
    new_status: "ACTIVE",
    previous_workflow_step: sprint.workflow_step,
    new_workflow_step: "SELECT_TASK",
    conformance: input.conformance,
    message: `Sprint "${sprint.id}" approved by Controller. Tasks can now be prepared.`,
  };
}
