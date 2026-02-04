/**
 * Agent Event Repository
 *
 * CRUD operations for session_events table.
 * Maps between AgentEvent TypeScript interface (camelCase) and database schema (snake_case).
 *
 * Specification: specs/011-agent-panel-rework/tasks.md T012, T013
 */

import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { OrchestraDB } from "../../database/client.js";
import * as schema from "../../database/local-schema.js";
import type { AgentEvent } from "./types.js";

/**
 * Extract type-specific fields from an event for indexing
 */
function extractIndexedFields(event: AgentEvent): {
  tool_call_id: string | null;
  tool_name: string | null;
  success: boolean | null;
  duration_ms: number | null;
  severity: string | null;
} {
  // Tool-related events have toolCallId and toolName
  if (
    event.type === "tool_call" ||
    event.type === "tool_progress" ||
    event.type === "tool_output" ||
    event.type === "tool_file_operation" ||
    event.type === "tool_metadata" ||
    event.type === "tool_result"
  ) {
    const toolEvent = event as Extract<
      AgentEvent,
      { toolCallId: string; toolName: string }
    >;
    return {
      tool_call_id: toolEvent.toolCallId,
      tool_name: toolEvent.toolName,
      success:
        event.type === "tool_result"
          ? (event as Extract<AgentEvent, { type: "tool_result" }>).success
          : null,
      duration_ms:
        event.type === "tool_result"
          ? (event as Extract<AgentEvent, { type: "tool_result" }>).durationMs
          : null,
      severity: null,
    };
  }

  // Error events have severity
  if (event.type === "error") {
    const errorEvent = event as Extract<AgentEvent, { type: "error" }>;
    return {
      tool_call_id: null,
      tool_name: null,
      success: null,
      duration_ms: null,
      severity: errorEvent.severity,
    };
  }

  // Other events (prompt, thinking, status_change) don't have indexed fields
  return {
    tool_call_id: null,
    tool_name: null,
    success: null,
    duration_ms: null,
    severity: null,
  };
}

/**
 * Map database row to AgentEvent interface
 */
function mapRowToEvent(row: {
  id: string;
  session_id: string;
  type: string;
  timestamp: string;
  iteration: number;
  payload: unknown;
}): AgentEvent {
  // The payload contains the full event data
  return row.payload as AgentEvent;
}

/**
 * Insert a single event into the database
 *
 * @param workspaceRoot Workspace root directory
 * @param event Event data (id will be generated if not provided)
 * @returns Created event with generated id
 */
export function insertEvent(
  workspaceRoot: string,
  event: AgentEvent,
): AgentEvent {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  const eventId = event.id || randomUUID();
  const eventWithId = { ...event, id: eventId };

  const indexed = extractIndexedFields(eventWithId);

  const insertData = {
    id: eventId,
    session_id: eventWithId.sessionId,
    type: eventWithId.type,
    timestamp: eventWithId.timestamp,
    iteration: eventWithId.iteration,
    tool_call_id: indexed.tool_call_id,
    tool_name: indexed.tool_name,
    success: indexed.success,
    duration_ms: indexed.duration_ms,
    severity: indexed.severity,
    payload: eventWithId, // Drizzle will handle JSON serialization
  };

  db.insert(schema.sessionEvents).values(insertData).run();

  return eventWithId;
}

/**
 * Insert multiple events in a single transaction
 *
 * @param workspaceRoot Workspace root directory
 * @param events Array of events to insert
 * @returns Array of created events with generated ids
 */
export function insertEventBatch(
  workspaceRoot: string,
  events: AgentEvent[],
): AgentEvent[] {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  const eventsWithIds = events.map((event) => ({
    ...event,
    id: event.id || randomUUID(),
  }));

  const insertData = eventsWithIds.map((event) => {
    const indexed = extractIndexedFields(event);
    return {
      id: event.id,
      session_id: event.sessionId,
      type: event.type,
      timestamp: event.timestamp,
      iteration: event.iteration,
      tool_call_id: indexed.tool_call_id,
      tool_name: indexed.tool_name,
      success: indexed.success,
      duration_ms: indexed.duration_ms,
      severity: indexed.severity,
      payload: event, // Drizzle will handle JSON serialization
    };
  });

  // Use transaction for batch insert
  db.transaction(() => {
    for (const data of insertData) {
      db.insert(schema.sessionEvents).values(data).run();
    }
  });

  return eventsWithIds;
}

/**
 * Get all events for a session, ordered by timestamp
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @returns Array of events ordered by timestamp ascending
 */
export function getEventsForSession(
  workspaceRoot: string,
  sessionId: string,
): AgentEvent[] {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  const rows = db
    .select()
    .from(schema.sessionEvents)
    .where(eq(schema.sessionEvents.session_id, sessionId))
    .orderBy(schema.sessionEvents.timestamp)
    .all();

  return rows.map(mapRowToEvent);
}

/**
 * Get events filtered by session and event type
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @param eventType Event type discriminator
 * @returns Array of events matching type, ordered by timestamp ascending
 */
export function getEventsByType(
  workspaceRoot: string,
  sessionId: string,
  eventType: AgentEvent["type"],
): AgentEvent[] {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  const rows = db
    .select()
    .from(schema.sessionEvents)
    .where(
      and(
        eq(schema.sessionEvents.session_id, sessionId),
        eq(schema.sessionEvents.type, eventType),
      ),
    )
    .orderBy(schema.sessionEvents.timestamp)
    .all();

  return rows.map(mapRowToEvent);
}

/**
 * Get all events related to a specific tool call
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @param toolCallId Tool call identifier
 * @returns Array of tool-related events ordered by timestamp ascending
 */
export function getToolEvents(
  workspaceRoot: string,
  sessionId: string,
  toolCallId: string,
): AgentEvent[] {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  const rows = db
    .select()
    .from(schema.sessionEvents)
    .where(
      and(
        eq(schema.sessionEvents.session_id, sessionId),
        eq(schema.sessionEvents.tool_call_id, toolCallId),
      ),
    )
    .orderBy(schema.sessionEvents.timestamp)
    .all();

  return rows.map(mapRowToEvent);
}

/**
 * Delete all events for a session
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @returns Number of events deleted
 */
export function deleteEventsForSession(
  workspaceRoot: string,
  sessionId: string,
): number {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  const result = db
    .delete(schema.sessionEvents)
    .where(eq(schema.sessionEvents.session_id, sessionId))
    .run();

  return result.changes;
}
