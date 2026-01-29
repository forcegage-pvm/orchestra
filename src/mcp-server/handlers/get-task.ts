/**
 * get_task tool handler
 *
 * Retrieves complete task details including verification criteria.
 * Orchestrator-only view (includes hidden verification).
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getActiveSprint } from "../../db/queries.js";
import {
  phases,
  specReviews,
  tasks,
  verificationChecks,
} from "../../db/schema.js";
import {
  GetTaskInputSchema,
  type GetTaskOutput,
} from "../../schemas/sprint-config.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

/**
 * Parse spec_task_refs from JSON array or legacy comma-separated string
 * TD-032: Supports both new JSON array format and legacy string format
 */
function parseSpecTaskRefs(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Legacy format: comma-separated string like "T001,T002" or single value "T010"
    return value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
}

export async function handleGetTask(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(GetTaskInputSchema, input);
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
    const output = await getTask(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "get_task",
        role: "orchestrator",
        input: validation.data,
        taskId: validation.data.task_id,
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

    await logToolExecution(
      {
        toolName: "get_task",
        role: "orchestrator",
        input: validation.data,
        taskId: validation.data.task_id,
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

async function getTask(
  input: typeof GetTaskInputSchema._output,
): Promise<GetTaskOutput> {
  const db = getDb();

  // 1. Get explicitly active sprint
  const sprint = await getActiveSprint();

  if (!sprint) {
    throw new Error("No active sprint found");
  }

  // 2. Find task
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task_id)),
    )
    .limit(1);

  if (!task) {
    throw new Error(`Task ${input.task_id} not found in active sprint`);
  }

  // 3. Get phase details
  const [phase] = await db
    .select({ phase_id: phases.phase_id })
    .from(phases)
    .where(eq(phases.id, task.phase_id))
    .limit(1);

  if (!phase) {
    throw new Error(`Phase not found for task ${input.task_id}`);
  }

  // 4. Get verification checks
  const checks = await db
    .select()
    .from(verificationChecks)
    .where(eq(verificationChecks.task_id, task.id));

  const structural = checks
    .filter((c) => c.check_type === "structural")
    .map((c) => {
      const config = JSON.parse(c.check_config);
      return {
        description: c.description,
        severity: c.severity as "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
        path: config.path,
        pattern: config.pattern,
        min_matches: config.min_matches,
      };
    });

  const behavioral = checks
    .filter((c) => c.check_type === "behavioral")
    .map((c) => {
      const config = JSON.parse(c.check_config);
      return {
        description: c.description,
        severity: c.severity as "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
        command: config.command,
        expect_exit_code: config.expect_exit_code,
        expect_output_contains: config.expect_output_contains,
      };
    });

  const quality = checks
    .filter((c) => c.check_type === "quality")
    .map((c) => {
      const config = JSON.parse(c.check_config);
      return {
        description: c.description,
        severity: c.severity as "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
        command: config.command,
        path: config.path,
        pattern: config.pattern,
        min_matches: config.min_matches,
      };
    });

  let handoverReview: GetTaskOutput["handover_review"] | undefined;

  if (task.status === "HANDOVER_REVIEW_FAILED") {
    const [review] = await db
      .select()
      .from(specReviews)
      .where(
        and(
          eq(specReviews.task_id, task.id),
          eq(specReviews.review_type, "HANDOVER"),
        ),
      )
      .orderBy(desc(specReviews.reviewed_at))
      .limit(1);

    if (review) {
      const parseJsonArray = <T>(
        value: string | null | undefined,
        fallback: T[],
      ) => {
        if (!value) {
          return fallback;
        }
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? (parsed as T[]) : fallback;
        } catch {
          return fallback;
        }
      };

      handoverReview = {
        decision: review.decision,
        conformance: review.conformance,
        issues: parseJsonArray<Record<string, unknown>>(review.issues, []),
        recommendations: parseJsonArray<string>(review.recommendations, []),
        notes: review.notes,
        reviewed_by: review.reviewed_by,
        reviewed_at: review.reviewed_at,
        revision_count: review.revision_count,
      };
    }
  }

  return {
    task_id: task.task_id,
    phase_id: phase.phase_id,
    title: task.title,
    summary: task.description, // TD-032: Map description column to summary in API response
    category: task.category as
      | "INFRASTRUCTURE"
      | "INTEGRATION"
      | "VISUAL"
      | "REFACTOR",
    status: task.status as GetTaskOutput["status"],
    dependencies: JSON.parse(task.dependencies),
    spec_task_refs: parseSpecTaskRefs(task.speckit_task_ref), // TD-032: Map speckit_task_ref column to spec_task_refs in API
    created_at: task.created_at,
    updated_at: task.updated_at,
    completed_at: task.completed_at || undefined,
    retry_count: task.retry_count,
    max_retries: task.max_retries,
    tdd_red_phase: task.tdd_red_phase,
    verification: {
      structural_checks: structural.length > 0 ? structural : undefined,
      behavioral_checks: behavioral.length > 0 ? behavioral : undefined,
      quality_checks: quality.length > 0 ? quality : undefined,
    },
    handover_review: handoverReview,
  };
}
