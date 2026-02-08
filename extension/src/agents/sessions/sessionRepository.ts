/**
 * Agent Session Repository
 *
 * CRUD operations for agent_sessions table.
 * Maps between AgentSession TypeScript interface (camelCase) and database schema (snake_case).
 *
 * Specification: specs/011-agent-panel-rework/tasks.md T010, T011
 */

import { randomUUID } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { AgentRole, AgentSession, SessionStage } from "./types.js";
import { OrchestraDB } from "../../database/client.js";
import * as schema from "../../database/local-schema.js";
import { copyMessages, insertMessage } from "./sessionMessageRepository.js";
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
  is_continued?: boolean | number | null;
  continued_at?: string | null;
  continuation_count?: number | null;
  tool_call_count: number;
  successful_tool_calls: number;
  failed_tool_calls: number;
  warning_count: number;
  files_modified: unknown;
  duration_ms: number | null;
}): AgentSession {
  const session: AgentSession = {
    sessionId: row.id,
    role: row.role as AgentRole,
    taskId: row.task_id,
    taskNumber: undefined, // Not stored in database; resolved at higher level
    taskTitle: undefined, // Not stored in database
    sprintId: row.sprint_id,
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    endedAt: row.ended_at ?? undefined,
    status: row.status as AgentSession["status"],
    statusMessage: row.status_message ?? undefined,
    iteration: row.iteration,
    maxIterations: row.max_iterations,
    toolCallCount: row.tool_call_count,
    successfulToolCalls: row.successful_tool_calls,
    failedToolCalls: row.failed_tool_calls,
    warningCount: row.warning_count,
    filesModified: Array.isArray(row.files_modified)
      ? (row.files_modified as string[])
      : [],
    durationMs: row.duration_ms ?? undefined,
  };

  // Continuation fields — conditionally add optional properties to comply
  // with exactOptionalPropertyTypes (assigning undefined is not allowed).
  const stage = row.stage as AgentSession["stage"];
  if (stage) {
    session.stage = stage;
  }
  if (row.parent_session_id) {
    session.parentSessionId = row.parent_session_id;
  }
  // These have defaults (0 / false) so always set them
  session.attempt = row.attempt ?? 0;
  session.isContinued = Boolean(row.is_continued ?? false);
  if (row.continued_at) {
    session.continuedAt = row.continued_at;
  }
  session.continuationCount = row.continuation_count ?? 0;

  return session;
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
    is_continued: session.isContinued ?? false,
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
    updateData.is_continued = Boolean((updates as any).isContinued);
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

// ============================================================================
// Session Continuation Functions
// ============================================================================

/**
 * Maximum depth for session continuation chains (5 levels total).
 * 0 (Root) -> 1 -> 2 -> 3 -> 4 (Max)
 * Attempting to continue a session at depth 4 (creating depth 5) will fail.
 */
export const MAX_CONTINUATION_DEPTH = 5;

/**
 * Continue a session by creating a new child session linked to the parent.
 *
 * - Creates new session record with parent_session_id = sessionId
 * - Increments attempt counter (parent.attempt + 1)
 * - Sets stage to new stage
 * - Copies messages from parent to child (via copyMessages)
 * - Appends continuation prompt as new User message
 * - Marks parent session as continued
 * - Validates depth limit
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Parent session ID to continue
 * @param continuationPrompt User prompt for the new session
 * @param stage Stage for the new session
 * @param maxIterations Optional override for max iterations
 * @returns The newly created child session
 */
export function continueSession(
  workspaceRoot: string,
  sessionId: string,
  continuationPrompt: string,
  stage: SessionStage,
  maxIterations?: number
): AgentSession {
  const parentSession = getSession(workspaceRoot, sessionId);
  if (!parentSession) {
    throw new Error(`Parent session ${sessionId} not found`);
  }

  // Depth validation check
  // attempt is 0-based.
  // If parent's attempt is 4, child will be 5.
  // MAX=5 means levels 1..5 allowed (indices 0..4).
  // So if child attempt (parent.attempt + 1) >= MAX (5) -> Error.
  if ((parentSession.attempt ?? 0) >= MAX_CONTINUATION_DEPTH - 1) {
    throw new Error(`Maximum continuation depth of ${MAX_CONTINUATION_DEPTH} exceeded`);
  }

  // Create new session
  // Naming: Child of X
  const now = new Date().toISOString();
  const newSessionData: Omit<AgentSession, "sessionId"> = {
    taskId: parentSession.taskId,
    taskNumber: parentSession.taskNumber,
    taskTitle: parentSession.taskTitle,
    sprintId: parentSession.sprintId,
    role: parentSession.role,
    status: "initializing" as const,
    statusMessage: undefined,
    startedAt: now,
    lastActivityAt: now,
    endedAt: undefined,
    iteration: 0,
    maxIterations: maxIterations ?? parentSession.maxIterations,
    durationMs: undefined,

    // Continuation fields
    stage: stage,
    parentSessionId: sessionId,
    attempt: (parentSession.attempt ?? 0) + 1,
    isContinued: false, 
    continuationCount: 0,

    toolCallCount: 0,
    successfulToolCalls: 0,
    failedToolCalls: 0,
    warningCount: 0,
    filesModified: [], // Start fresh
  };

  const newSession = createSession(workspaceRoot, newSessionData);

  // Copy messages from parent
  copyMessages(workspaceRoot, sessionId, newSession.sessionId);

  // Append continuation prompt
  insertMessage(workspaceRoot, {
    session_id: newSession.sessionId,
    role: "user",
    content: continuationPrompt,
    iteration: 0
  });

  // Mark parent as continued
  markSessionAsContinued(workspaceRoot, sessionId);

  // Return full session object (reload to get confirmed DB state)
  const created = getSession(workspaceRoot, newSession.sessionId);
  if (!created) {
      throw new Error("Failed to retrieve created session");
  }
  return created;
}

/**
 * Mark a session as having been continued.
 * Updates is_continued=true, sets continued_at, increments continuation_count.
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session ID
 */
export function markSessionAsContinued(
  workspaceRoot: string,
  sessionId: string
): void {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);
  
  db.update(schema.agentSessions)
    .set({
      is_continued: true,
      continued_at: new Date().toISOString(),
      continuation_count: sql`${schema.agentSessions.continuation_count} + 1`
    })
    .where(eq(schema.agentSessions.id, sessionId))
    .run();
}

/**
 * Get the full parent-to-child chain for a session.
 * Uses recursive CTE to traverse the hierarchy downward starting from the given session.
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Root session ID for the query
 * @returns Array of sessions in the chain, ordered by depth
 */
export function getSessionChain(
  workspaceRoot: string, 
  sessionId: string
): AgentSession[] {
    const db = OrchestraDB.getInstance(workspaceRoot);
    const sqlQuery = `
        WITH RECURSIVE chain AS (
            SELECT *, 0 as depth FROM agent_sessions WHERE id = ?
            UNION ALL
            SELECT c.*, p.depth + 1
            FROM agent_sessions c
            INNER JOIN chain p ON c.parent_session_id = p.id
            WHERE p.depth < 5
        )
        SELECT * FROM chain ORDER BY depth ASC;
    `;
    
    // better-sqlite3 prepare/all
    const rows = db.prepare(sqlQuery).all(sessionId) as any[];
    return rows.map(mapRowToSession);
}

/**
 * Get the latest implementor session for a task.
 * Used to find the target session to continue from during fix cycles.
 *
 * @param workspaceRoot Workspace root directory
 * @param taskId Task ID
 * @returns Most recent implementor session or undefined
 */
export function getLatestImplementorSession(
    workspaceRoot: string,
    taskId: number
): AgentSession | undefined {
    const db = OrchestraDB.getDrizzleInstance(workspaceRoot);
    
    // Query: WHERE task_id = ? AND role = 'implementor' ORDER BY started_at DESC LIMIT 1
    const rows = db.select()
        .from(schema.agentSessions)
        .where(
            and(
                eq(schema.agentSessions.task_id, taskId),
                eq(schema.agentSessions.role, "implementor")
            )
        )
        .orderBy(desc(schema.agentSessions.started_at))
        .limit(1)
        .all();
        
    const firstRow = rows[0];
    if (!firstRow) return undefined;
    
    return mapRowToSession(firstRow);
}