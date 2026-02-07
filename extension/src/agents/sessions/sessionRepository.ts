/**
 * Agent Session Repository
 *
 * CRUD operations for agent_sessions table.
 * Maps between AgentSession TypeScript interface (camelCase) and database schema (snake_case).
 *
 * Specification: specs/011-agent-panel-rework/tasks.md T010, T011
 */

import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import type { AgentRole, AgentSession } from "./types.js";
import { OrchestraDB } from "../../database/client.js";
import * as schema from "../../database/local-schema.js";

/**
 * Map database row to AgentSession interface
 */
function mapRowToSession(row: {
  id: string;
  task_id: number;
  sprint_id: string;
  role: string;
  status: string;
  status_message: string | null;
  started_at: string;
  last_activity_at: string;
  ended_at: string | null;
  iteration: number;
  max_iterations: number;
  stage?: string | null;
  parent_session_id?: string | null;
  attempt?: number | null;
  is_continued?: number | null;
  continued_at?: string | null;
  continuation_count?: number | null;
  tool_call_count: number;
  successful_tool_calls: number;
  failed_tool_calls: number;
  warning_count: number;
  files_modified: unknown;
  duration_ms: number | null;
}): AgentSession {
  return {
    sessionId: row.id,
    role: row.role as AgentRole,
    taskId: row.task_id,
    taskTitle: undefined, // Not stored in database
    sprintId: row.sprint_id,
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    endedAt: row.ended_at ?? undefined,
    status: row.status as AgentSession["status"],
    statusMessage: row.status_message ?? undefined,
    iteration: row.iteration,
    maxIterations: row.max_iterations,

    // Continuation fields (may be null for legacy rows)
    stage: (row.stage as AgentSession["stage"]) ?? undefined,
    parentSessionId: row.parent_session_id ?? undefined,
    attempt: row.attempt ?? 0,
    isContinued: Boolean(row.is_continued ?? 0),
    continuedAt: row.continued_at ?? undefined,
    continuationCount: row.continuation_count ?? 0,

    toolCallCount: row.tool_call_count,
    successfulToolCalls: row.successful_tool_calls,
    failedToolCalls: row.failed_tool_calls,
    warningCount: row.warning_count,
    filesModified: Array.isArray(row.files_modified)
      ? (row.files_modified as string[])
      : [],
    durationMs: row.duration_ms ?? undefined,
  };
}
/**
 * Create a new agent session
 *
 * @param workspaceRoot Workspace root directory
 * @param session Session data (sessionId will be generated if not provided)
 * @returns Created session with generated sessionId
 */
export function createSession(
  workspaceRoot: string,
  session: Omit<AgentSession, "sessionId"> & { sessionId?: string }
): AgentSession {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  const sessionId = session.sessionId ?? randomUUID();

  const insertData = {
    id: sessionId,
    task_id: session.taskId,
    sprint_id: session.sprintId,
    role: session.role,
    status: session.status,
    status_message: session.statusMessage ?? null,
    started_at: session.startedAt,
    last_activity_at: session.lastActivityAt,
    ended_at: session.endedAt ?? null,
    iteration: session.iteration,
    max_iterations: session.maxIterations,

    // Continuation fields
    stage: session.stage ?? null,
    parent_session_id: session.parentSessionId ?? null,
    attempt: session.attempt ?? 0,
    is_continued: session.isContinued ? 1 : 0,
    continued_at: session.continuedAt ?? null,
    continuation_count: session.continuationCount ?? 0,

    tool_call_count: session.toolCallCount,
    successful_tool_calls: session.successfulToolCalls,
    failed_tool_calls: session.failedToolCalls,
    warning_count: session.warningCount,
    files_modified: session.filesModified, // Drizzle will handle JSON serialization
    duration_ms: session.durationMs ?? null,
  };
  db.insert(schema.agentSessions).values(insertData).run();

  return {
    ...session,
    sessionId,
  };
}

/**
 * Get a single session by sessionId
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @returns Session data or undefined if not found
 */
export function getSession(
  workspaceRoot: string,
  sessionId: string
): AgentSession | undefined {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  const rows = db
    .select()
    .from(schema.agentSessions)
    .where(eq(schema.agentSessions.id, sessionId))
    .all();

  const firstRow = rows[0];
  if (!firstRow) {
    return undefined;
  }

  return mapRowToSession(firstRow);
}

/**
 * Update an existing session's mutable fields
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @param updates Partial session data to update
 * @returns Updated session or undefined if not found
 */
export function updateSession(
  workspaceRoot: string,
  sessionId: string,
  updates: Partial<
    Pick<
      AgentSession,
      | "status"
      | "statusMessage"
      | "lastActivityAt"
      | "iteration"
      | "toolCallCount"
      | "successfulToolCalls"
      | "failedToolCalls"
      | "warningCount"
      | "filesModified"
      | "endedAt"
      | "durationMs"
    >
  >
): AgentSession | undefined {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  // Build update object with snake_case keys
  const updateData: Record<string, unknown> = {};

  if (updates.status !== undefined) {
    updateData.status = updates.status;
  }
  if (updates.statusMessage !== undefined) {
    updateData.status_message = updates.statusMessage;
  }
  if (updates.lastActivityAt !== undefined) {
    updateData.last_activity_at = updates.lastActivityAt;
  }
  if (updates.iteration !== undefined) {
    updateData.iteration = updates.iteration;
  }
  if (updates.toolCallCount !== undefined) {
    updateData.tool_call_count = updates.toolCallCount;
  }
  if (updates.successfulToolCalls !== undefined) {
    updateData.successful_tool_calls = updates.successfulToolCalls;
  }
  if (updates.failedToolCalls !== undefined) {
    updateData.failed_tool_calls = updates.failedToolCalls;
  }
  if (updates.warningCount !== undefined) {
    updateData.warning_count = updates.warningCount;
  }
  if (updates.filesModified !== undefined) {
    updateData.files_modified = updates.filesModified; // Drizzle will handle JSON serialization
  }
  if (updates.endedAt !== undefined) {
    updateData.ended_at = updates.endedAt;
  }
  if (updates.durationMs !== undefined) {
    updateData.duration_ms = updates.durationMs;
  }

  // Continuation fields
  if ((updates as any).stage !== undefined) {
    updateData.stage = (updates as any).stage;
  }
  if ((updates as any).parentSessionId !== undefined) {
    updateData.parent_session_id = (updates as any).parentSessionId;
  }
  if ((updates as any).attempt !== undefined) {
    updateData.attempt = (updates as any).attempt;
  }
  if ((updates as any).isContinued !== undefined) {
    updateData.is_continued = (updates as any).isContinued ? 1 : 0;
  }
  if ((updates as any).continuedAt !== undefined) {
    updateData.continued_at = (updates as any).continuedAt;
  }
  if ((updates as any).continuationCount !== undefined) {
    updateData.continuation_count = (updates as any).continuationCount;
  }

  // Execute update
  db.update(schema.agentSessions)
    .set(updateData)
    .where(eq(schema.agentSessions.id, sessionId))
    .run();

  // Return updated session
  return getSession(workspaceRoot, sessionId);
}

/**
 * Get all sessions for a given task, ordered by most recent first
 *
 * @param workspaceRoot Workspace root directory
 * @param taskId Task ID
 * @returns Array of sessions ordered by startedAt descending
 */
export function getSessionsForTask(
  workspaceRoot: string,
  taskId: number
): AgentSession[] {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  const rows = db
    .select()
    .from(schema.agentSessions)
    .where(eq(schema.agentSessions.task_id, taskId))
    .orderBy(desc(schema.agentSessions.started_at))
    .all();

  return rows.map(mapRowToSession);
}

/**
 * Get sessions filtered by both taskId and role
 *
 * @param workspaceRoot Workspace root directory
 * @param taskId Task ID
 * @param role Agent role filter
 * @returns Array of sessions matching taskId and role, ordered by startedAt descending
 */
export function getSessionsForTaskAndRole(
  workspaceRoot: string,
  taskId: number,
  role: AgentRole
): AgentSession[] {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  const rows = db
    .select()
    .from(schema.agentSessions)
    .where(
      and(
        eq(schema.agentSessions.task_id, taskId),
        eq(schema.agentSessions.role, role)
      )
    )
    .orderBy(desc(schema.agentSessions.started_at))
    .all();

  return rows.map(mapRowToSession);
}

/**
 * Get the N most recent sessions across all tasks
 *
 * @param workspaceRoot Workspace root directory
 * @param limit Maximum number of sessions to return (default: 10)
 * @returns Array of recent sessions ordered by startedAt descending
 */
export function getRecentSessions(
  workspaceRoot: string,
  limit: number = 10
): AgentSession[] {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  const rows = db
    .select()
    .from(schema.agentSessions)
    .orderBy(desc(schema.agentSessions.started_at))
    .limit(limit)
    .all();

  return rows.map(mapRowToSession);
}

/**
 * Delete a session and its cascaded events
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @returns true if session was deleted, false if not found
 */
export function deleteSession(
  workspaceRoot: string,
  sessionId: string
): boolean {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  const result = db
    .delete(schema.agentSessions)
    .where(eq(schema.agentSessions.id, sessionId))
    .run();

  return result.changes > 0;
}
