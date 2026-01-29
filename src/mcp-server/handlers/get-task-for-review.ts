/**
 * get_task_for_review tool handler - CONTROLLER ONLY
 *
 * Returns task details for review purposes, WITHOUT verification criteria.
 * Used by Controller to see task metadata when reviewing handovers.
 *
 * Sprint 004: Controller Agent - T035
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  parseSpecTaskDefinitions,
  type SpecTaskDefinition,
} from "../../core/spec-task-parser.js";
import { getDb } from "../../db/index.js";
import { getActiveSprint } from "../../db/queries.js";
import { phases, tasks } from "../../db/schema.js";
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

/**
 * Input schema for get_task_for_review
 */
const GetTaskForReviewInputSchema = z.object({
  task_id: z.number().describe("The task ID to retrieve"),
});

/**
 * Output schema for get_task_for_review
 */
interface GetTaskForReviewOutput {
  success: boolean;
  task_id: number;
  spec_path: string | null;
  spec_files: string[];
  spec_task_definitions: SpecTaskDefinition[];
  phase_id: string;
  phase_name: string;
  title: string;
  summary: string;
  category: string;
  status: string;
  dependencies: number[];
  spec_task_refs: string[];
  tdd_red_phase: boolean;
  created_at: string;
  updated_at: string;
  // NOTE: verification criteria intentionally NOT included
  // Controller reviews handovers against spec, not verification criteria
}

export async function handleGetTaskForReview(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(GetTaskForReviewInputSchema, input);
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
    const output = await getTaskForReview(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "get_task_for_review",
        role: "controller",
        input: validation.data,
        taskId: validation.data.task_id,
      },
      { success: true, output },
      durationMs,
    );

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(output, null, 2) },
      ],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    const err = error instanceof Error ? error : new Error(String(error));

    await logToolExecution(
      {
        toolName: "get_task_for_review",
        role: "controller",
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

async function getTaskForReview(
  input: z.output<typeof GetTaskForReviewInputSchema>,
): Promise<GetTaskForReviewOutput> {
  const db = getDb();

  // 1. Get active sprint
  const sprint = await getActiveSprint();
  if (!sprint) {
    throw new Error("No active sprint found");
  }

  // 2. Find the task with phase info
  const [result] = await db
    .select({
      task_id: tasks.task_id,
      phase_id: phases.phase_id,
      phase_name: phases.phase_name,
      title: tasks.title,
      summary: tasks.description, // TD-032: Map description column to summary in API response
      category: tasks.category,
      status: tasks.status,
      dependencies: tasks.dependencies,
      spec_task_refs: tasks.speckit_task_ref, // TD-032: Map speckit_task_ref column to spec_task_refs in API
      tdd_red_phase: tasks.tdd_red_phase,
      created_at: tasks.created_at,
      updated_at: tasks.updated_at,
    })
    .from(tasks)
    .innerJoin(phases, eq(tasks.phase_id, phases.id))
    .where(
      and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task_id)),
    )
    .limit(1);

  if (!result) {
    throw new Error(`Task ${input.task_id} not found in active sprint`);
  }

  const specTaskIds = parseSpecTaskRefs(result.spec_task_refs);
  const specPath = sprint.spec_path ?? null;
  const specFiles = parseJsonArray(sprint.spec_files);

  const specTaskDefinitions =
    specTaskIds.length === 0
      ? []
      : await parseSpecTaskDefinitions(
          ensureSpecPath(specPath, specTaskIds),
          specTaskIds,
          specFiles,
        );

  return {
    success: true,
    task_id: result.task_id,
    spec_path: specPath,
    spec_files: specFiles,
    spec_task_definitions: specTaskDefinitions,
    phase_id: result.phase_id,
    phase_name: result.phase_name,
    title: result.title,
    summary: result.summary,
    category: result.category,
    status: result.status,
    dependencies: JSON.parse(result.dependencies || "[]"),
    spec_task_refs: parseSpecTaskRefs(result.spec_task_refs),
    tdd_red_phase: Boolean(result.tdd_red_phase),
    created_at: result.created_at,
    updated_at: result.updated_at,
  };
}

function ensureSpecPath(specPath: string | null, taskIds: string[]): string {
  if (!specPath) {
    throw new Error(
      `Spec path not set for active sprint (requested tasks: ${taskIds.join(
        ", ",
      )})`,
    );
  }

  return specPath;
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
