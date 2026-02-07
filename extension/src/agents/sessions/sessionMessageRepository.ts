/**
 * Session Message Repository
 *
 * CRUD operations for session_messages table.
 * Stores LLM conversation messages within agent sessions.
 *
 * Follows Drizzle ORM patterns from sessionRepository.ts:
 * - OrchestraDB.getDrizzleInstance(workspaceRoot) for DB access
 * - schema.* table references
 * - camelCase↔snake_case field mapping
 */

import { randomUUID } from "crypto";
import { asc, eq, sql } from "drizzle-orm";
import { OrchestraDB } from "../../database/client.js";
import * as schema from "../../database/local-schema.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Message role in LLM conversation
 */
export type MessageRole = "system" | "user" | "assistant";

/**
 * Content part for structured messages (tool calls, attachments, results)
 */
export interface MessageContentPart {
  type: "text" | "data" | "tool_call" | "tool_result";
  value: string | object;
}

/**
 * Message content - either plain text or structured parts array
 */
export type MessageContent = string | MessageContentPart[];

/**
 * Persisted session message in database
 */
export interface SessionMessage {
  id: string; // UUID
  session_id: string; // FK to agent_sessions
  message_index: number; // 0-based sequence within session
  role: MessageRole;
  content: MessageContent;
  token_count: number | null; // Estimated tokens
  timestamp: string; // ISO 8601
  iteration: number; // Agent iteration when message sent
}

/**
 * Input for creating a new message
 */
export interface MessageInput {
  session_id: string;
  role: MessageRole;
  content: MessageContent;
  iteration: number;
  token_count?: number; // Optional - auto-calculated if not provided
}

/**
 * Session message statistics
 */
export interface SessionMessageStats {
  messageCount: number;
  totalTokens: number;
  systemMessageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  firstMessageTimestamp: string | null;
  lastMessageTimestamp: string | null;
}

/**
 * Pagination options for message queries
 */
export interface MessagePaginationOptions {
  offset?: number; // Default: 0
  limit?: number; // Default: unlimited
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Estimate token count for message content.
 *
 * Uses the heuristic: 4 characters ≈ 1 token for English text.
 * This matches the ContextManager.estimateTokens() approach.
 *
 * @param content Message content (string or parts array)
 * @returns Estimated token count, or null if content is empty
 */
function estimateTokenCount(content: MessageContent): number | null {
  let charCount = 0;

  if (typeof content === "string") {
    charCount = content.length;
  } else if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part.value === "string") {
        charCount += part.value.length;
      } else {
        charCount += JSON.stringify(part.value).length;
      }
      // Type overhead
      charCount += part.type.length + 10;
    }
  }

  if (charCount === 0) {
    return null;
  }

  // 4 characters ≈ 1 token + message structure overhead
  return Math.ceil(charCount / 4) + 4;
}

/**
 * Serialize message content for storage in database JSON column.
 */
function serializeContent(content: MessageContent): string {
  return JSON.stringify(content);
}

/**
 * Deserialize message content from database JSON column.
 */
function deserializeContent(json: unknown): MessageContent {
  // Drizzle json mode may already parse the JSON
  if (typeof json === "string") {
    try {
      return JSON.parse(json) as MessageContent;
    } catch {
      return json;
    }
  }
  // Already parsed by Drizzle (array or string)
  if (Array.isArray(json)) {
    return json as MessageContentPart[];
  }
  return String(json);
}

/**
 * Map database row to SessionMessage interface.
 */
function mapRowToMessage(row: {
  id: string;
  session_id: string;
  message_index: number;
  role: string;
  content: unknown;
  token_count: number | null;
  timestamp: string;
  iteration: number;
}): SessionMessage {
  return {
    id: row.id,
    session_id: row.session_id,
    message_index: row.message_index,
    role: row.role as MessageRole,
    content: deserializeContent(row.content),
    token_count: row.token_count,
    timestamp: row.timestamp,
    iteration: row.iteration,
  };
}

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Insert a message into the session conversation history.
 *
 * Automatically:
 * - Generates a UUID id
 * - Calculates the next message_index (MAX(message_index)+1 for session, or 0)
 * - Estimates token_count if not provided
 * - Stores content as JSON
 * - Sets timestamp to current ISO time
 *
 * @param workspaceRoot Workspace root directory
 * @param message Message data with session_id and content
 * @returns Created message with generated ID and message_index
 */
export function insertMessage(
  workspaceRoot: string,
  message: MessageInput,
): SessionMessage {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  const id = randomUUID();
  const timestamp = new Date().toISOString();

  // Calculate next message_index using SQL MAX
  const maxResult = db
    .select({ maxIndex: sql<number | null>`MAX(${schema.sessionMessages.message_index})` })
    .from(schema.sessionMessages)
    .where(eq(schema.sessionMessages.session_id, message.session_id))
    .all();

  const currentMax = maxResult[0]?.maxIndex;
  const messageIndex = currentMax !== null && currentMax !== undefined ? currentMax + 1 : 0;

  // Estimate token count if not provided
  const tokenCount = message.token_count !== undefined
    ? message.token_count
    : estimateTokenCount(message.content);

  const serializedContent = serializeContent(message.content);

  const insertData = {
    id,
    session_id: message.session_id,
    message_index: messageIndex,
    role: message.role,
    content: serializedContent,
    token_count: tokenCount,
    timestamp,
    iteration: message.iteration,
  };

  db.insert(schema.sessionMessages).values(insertData).run();

  return {
    id,
    session_id: message.session_id,
    message_index: messageIndex,
    role: message.role,
    content: message.content,
    token_count: tokenCount,
    timestamp,
    iteration: message.iteration,
  };
}

/**
 * Get all messages for a session in sequence order.
 *
 * Returns messages ordered by message_index ascending.
 * Supports optional offset/limit pagination.
 * Returns empty array if session has no messages.
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @param options Pagination options (offset, limit)
 * @returns Messages ordered by message_index
 */
export function getSessionMessages(
  workspaceRoot: string,
  sessionId: string,
  options?: MessagePaginationOptions,
): SessionMessage[] {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  let query = db
    .select()
    .from(schema.sessionMessages)
    .where(eq(schema.sessionMessages.session_id, sessionId))
    .orderBy(asc(schema.sessionMessages.message_index));

  // SQLite requires LIMIT before OFFSET; when offset-only, use a very large LIMIT
  if (options?.limit !== undefined) {
    query = query.limit(options.limit) as typeof query;
  } else if (options?.offset !== undefined) {
    // Must supply LIMIT when OFFSET is used in SQLite
    query = query.limit(2147483647) as typeof query;
  }

  if (options?.offset !== undefined) {
    query = query.offset(options.offset) as typeof query;
  }

  const rows = query.all();
  return rows.map(mapRowToMessage);
}

/**
 * Get message count and token usage statistics for a session.
 *
 * Uses SQL aggregation queries to compute:
 * - Total message count
 * - Total tokens across all messages
 * - Counts by role (system, user, assistant)
 * - First and last message timestamps
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @returns Statistics object with counts and timestamps
 */
export function getSessionStats(
  workspaceRoot: string,
  sessionId: string,
): SessionMessageStats {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  const result = db
    .select({
      messageCount: sql<number>`COUNT(*)`,
      totalTokens: sql<number>`COALESCE(SUM(${schema.sessionMessages.token_count}), 0)`,
      systemMessageCount: sql<number>`SUM(CASE WHEN ${schema.sessionMessages.role} = 'system' THEN 1 ELSE 0 END)`,
      userMessageCount: sql<number>`SUM(CASE WHEN ${schema.sessionMessages.role} = 'user' THEN 1 ELSE 0 END)`,
      assistantMessageCount: sql<number>`SUM(CASE WHEN ${schema.sessionMessages.role} = 'assistant' THEN 1 ELSE 0 END)`,
      firstMessageTimestamp: sql<string | null>`MIN(${schema.sessionMessages.timestamp})`,
      lastMessageTimestamp: sql<string | null>`MAX(${schema.sessionMessages.timestamp})`,
    })
    .from(schema.sessionMessages)
    .where(eq(schema.sessionMessages.session_id, sessionId))
    .all();

  const row = result[0];

  if (!row || row.messageCount === 0) {
    return {
      messageCount: 0,
      totalTokens: 0,
      systemMessageCount: 0,
      userMessageCount: 0,
      assistantMessageCount: 0,
      firstMessageTimestamp: null,
      lastMessageTimestamp: null,
    };
  }

  return {
    messageCount: Number(row.messageCount),
    totalTokens: Number(row.totalTokens),
    systemMessageCount: Number(row.systemMessageCount),
    userMessageCount: Number(row.userMessageCount),
    assistantMessageCount: Number(row.assistantMessageCount),
    firstMessageTimestamp: row.firstMessageTimestamp,
    lastMessageTimestamp: row.lastMessageTimestamp,
  };
}

/**
 * Delete all messages for a session.
 *
 * NOTE: This is typically handled automatically by CASCADE DELETE
 * when the parent session is deleted. Use this for programmatic cleanup.
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @returns Number of messages deleted
 */
export function deleteMessagesForSession(
  workspaceRoot: string,
  sessionId: string,
): number {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  const result = db
    .delete(schema.sessionMessages)
    .where(eq(schema.sessionMessages.session_id, sessionId))
    .run();

  return result.changes;
}

/**
 * Copy all messages from one session to another.
 *
 * Used for session continuation — copies parent messages to child session
 * with new UUIDs but preserving message_index order and all other field values.
 *
 * @param workspaceRoot Workspace root directory
 * @param sourceSessionId Source session UUID
 * @param targetSessionId Target session UUID
 * @returns Number of messages copied
 */
export function copyMessages(
  workspaceRoot: string,
  sourceSessionId: string,
  targetSessionId: string,
): number {
  const db = OrchestraDB.getDrizzleInstance(workspaceRoot);

  // Get all source messages ordered by message_index
  const sourceMessages = db
    .select()
    .from(schema.sessionMessages)
    .where(eq(schema.sessionMessages.session_id, sourceSessionId))
    .orderBy(asc(schema.sessionMessages.message_index))
    .all();

  if (sourceMessages.length === 0) {
    return 0;
  }

  // Insert copies with new UUIDs and target session_id
  db.transaction(() => {
    for (const msg of sourceMessages) {
      db.insert(schema.sessionMessages)
        .values({
          id: randomUUID(),
          session_id: targetSessionId,
          message_index: msg.message_index,
          role: msg.role,
          content: msg.content as string, // Already serialized JSON from DB
          token_count: msg.token_count,
          timestamp: msg.timestamp,
          iteration: msg.iteration,
        })
        .run();
    }
  });

  return sourceMessages.length;
}
