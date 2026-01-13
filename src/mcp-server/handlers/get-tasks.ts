/**
 * get_tasks tool handler
 *
 * Lists tasks with optional filters (phase_id, status, category).
 * Returns orchestrator view with verification criteria.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { getActiveSprint } from "../../db/queries.js";
import { logToolExecution } from "./audit-logging.js";
import { phases, tasks, verificationChecks } from "../../db/schema.js";
import {
  GetTasksInputSchema,
  type GetTaskOutput,
  type GetTasksOutput,
} from "../../schemas/sprint-config.js";
import { validateInput } from "../../schemas/utils.js";

export async function handleGetTasks(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(GetTasksInputSchema, input);
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
    const output = await getTasks(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "get_tasks",
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
        toolName: "get_tasks",
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

async function getTasks(
  input: typeof GetTasksInputSchema._output | undefined
): Promise<GetTasksOutput> {
  const db = getDb();

  // 1. Get explicitly active sprint
  const sprint = await getActiveSprint();

  if (!sprint) {
    throw new Error("No active sprint found");
  }

  // 2. Build query with filters
  const conditions = [eq(tasks.sprint_id, sprint.id)];

  if (input?.status) {
    conditions.push(eq(tasks.status, input.status));
  }

  if (input?.category) {
    conditions.push(eq(tasks.category, input.category));
  }

  // 3. Get tasks
  let taskResults = await db
    .select()
    .from(tasks)
    .where(and(...conditions));

  // 4. Filter by phase_id if provided (requires join)
  if (input?.phase_id) {
    const phaseResults = await db
      .select({ id: phases.id })
      .from(phases)
      .where(
        and(
          eq(phases.sprint_id, sprint.id),
          eq(phases.phase_id, input.phase_id)
        )
      );

    if (phaseResults.length === 0) {
      throw new Error(`Phase not found: ${input.phase_id}`);
    }

    const phaseInternalId = phaseResults[0]!.id;
    taskResults = taskResults.filter((t) => t.phase_id === phaseInternalId);
  }

  // 5. Build output with verification for each task
  const taskOutputs: GetTaskOutput[] = await Promise.all(
    taskResults.map(async (task) => {
      // Get phase details
      const [phase] = await db
        .select({ phase_id: phases.phase_id })
        .from(phases)
        .where(eq(phases.id, task.phase_id))
        .limit(1);

      // Get verification checks
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
            metrics: config.metrics,
            threshold: config.threshold,
            failure_message: config.failure_message,
          };
        });

      return {
        task_id: task.task_id,
        phase_id: phase?.phase_id || "UNKNOWN",
        title: task.title,
        description: task.description,
        category: task.category as
          | "INFRASTRUCTURE"
          | "INTEGRATION"
          | "VISUAL"
          | "REFACTOR",
        status: task.status as
          | "PENDING"
          | "PREPARE"
          | "IMPLEMENT"
          | "GATE_CHECK"
          | "VERIFY"
          | "VERIFY_FAILED"
          | "RETRY"
          | "ESCALATED"
          | "COMPLETE",
        dependencies: JSON.parse(task.dependencies),
        speckit_task_ref: task.speckit_task_ref || undefined,
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
      };
    })
  );

  return {
    tasks: taskOutputs,
    total: taskOutputs.length,
  };
}
