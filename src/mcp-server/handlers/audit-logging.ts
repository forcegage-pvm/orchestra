/**
 * MCP Tool Audit Logging
 *
 * Provides consistent audit logging for all MCP tool invocations.
 * Records to tool_executions table for debugging and accountability.
 *
 * TD-012: MCP Handler Audit Logging
 */

import { and, eq } from "drizzle-orm";
import { getActiveSprint, getDb } from "../../db/index.js";
import { systemLogs, tasks, toolExecutions } from "../../db/schema.js";

export interface ToolExecutionContext {
  toolName: string;
  role: "orchestrator" | "implementor" | "controller";
  input: unknown;
  taskId?: number;
}

export interface ToolExecutionResult {
  success: boolean;
  output?: unknown;
  errorMessage?: string;
}

/**
 * Log a tool execution to the database
 */
export async function logToolExecution(
  context: ToolExecutionContext,
  result: ToolExecutionResult,
  durationMs: number
): Promise<number> {
  const db = getDb();
  const now = new Date().toISOString();

  // Get active sprint for context
  let sprintId: string | null = null;
  let dbTaskId: number | null = null;

  try {
    const sprint = await getActiveSprint();
    if (sprint) {
      sprintId = sprint.id;

      // Resolve task_id (sprint-scoped) to database task id
      if (context.taskId !== undefined) {
        const [task] = await db
          .select({ id: tasks.id })
          .from(tasks)
          .where(
            and(
              eq(tasks.sprint_id, sprint.id),
              eq(tasks.task_id, context.taskId)
            )
          )
          .limit(1);
        if (task) {
          dbTaskId = task.id;
        }
      }
    }
  } catch {
    // Sprint context not available, continue without it
  }

  const insertResult = await db
    .insert(toolExecutions)
    .values({
      tool_name: context.toolName,
      role: context.role,
      sprint_id: sprintId,
      task_id: dbTaskId,
      input: JSON.stringify(context.input),
      output: result.output ? JSON.stringify(result.output) : null,
      success: result.success ? 1 : 0,
      error_message: result.errorMessage ?? null,
      duration_ms: durationMs,
      executed_at: now,
    })
    .returning({ id: toolExecutions.id });

  return insertResult[0]?.id ?? 0;
}

/**
 * Log a system event
 */
export async function logSystemEvent(params: {
  level: "ERROR" | "WARN" | "INFO" | "DEBUG";
  category:
    | "validation"
    | "database"
    | "git"
    | "verification"
    | "mcp"
    | "escalation"
    | "security";
  message: string;
  details?: Record<string, unknown>;
  taskId?: number;
  toolExecutionId?: number;
  stackTrace?: string;
}): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  let sprintId: string | null = null;
  let dbTaskId: number | null = null;

  try {
    const sprint = await getActiveSprint();
    if (sprint) {
      sprintId = sprint.id;

      if (params.taskId !== undefined) {
        const [task] = await db
          .select({ id: tasks.id })
          .from(tasks)
          .where(
            and(
              eq(tasks.sprint_id, sprint.id),
              eq(tasks.task_id, params.taskId)
            )
          )
          .limit(1);
        if (task) {
          dbTaskId = task.id;
        }
      }
    }
  } catch {
    // Sprint context not available, continue without it
  }

  await db.insert(systemLogs).values({
    level: params.level,
    category: params.category,
    message: params.message,
    details: params.details ? JSON.stringify(params.details) : null,
    sprint_id: sprintId,
    task_id: dbTaskId,
    tool_execution_id: params.toolExecutionId ?? null,
    stack_trace: params.stackTrace ?? null,
    logged_at: now,
  });
}

/**
 * Wrapper to execute a handler with automatic audit logging
 *
 * Usage:
 * ```typescript
 * return withAuditLogging(
 *   { toolName: "get_task", role: "orchestrator", input, taskId: input.task_id },
 *   async () => {
 *     // handler logic
 *     return { success: true, data: result };
 *   }
 * );
 * ```
 */
export async function withAuditLogging<T>(
  context: ToolExecutionContext,
  handler: () => Promise<T>
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startTime = performance.now();

  try {
    const result = await handler();
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      context,
      { success: true, output: result },
      durationMs
    );

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    const err = error instanceof Error ? error : new Error(String(error));

    await logToolExecution(
      context,
      { success: false, errorMessage: err.message },
      durationMs
    );

    return {
      content: [
        {
          type: "text" as const,
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
