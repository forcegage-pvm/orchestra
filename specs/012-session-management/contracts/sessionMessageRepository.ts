/**
 * API Contract: Session Message Repository
 *
 * Purpose: CRUD operations for LLM conversation messages within agent sessions
 * Location: extension/src/agents/sessions/sessionMessageRepository.ts
 * Phase: 1 (Database Schema & Repository)
 * Tasks: T003
 */

import type { Database } from "better-sqlite3";

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
  token_count: number | null; // Estimated tokens (from ContextManager)
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
// Repository Functions
// ============================================================================

/**
 * Insert a message into the session conversation history
 *
 * - Automatically generates message_index (next in sequence)
 * - Automatically estimates tokens if not provided
 * - Returns created message with generated ID and index
 *
 * @param workspaceRoot Workspace root directory
 * @param message Message data with session_id and content
 * @returns Created message with generated ID and message_index
 * @throws Error if session_id invalid or database write fails
 *
 * @example
 * const message = insertMessage(workspaceRoot, {
 *   session_id: 'session-123',
 *   role: 'user',
 *   content: 'Implement feature X',
 *   iteration: 1
 * });
 * console.log(message.id, message.message_index); // 'msg-abc', 0
 */
export function insertMessage(
  workspaceRoot: string,
  message: MessageInput,
): SessionMessage;

/**
 * Get all messages for a session in sequence order
 *
 * - Returns messages ordered by message_index ASC
 * - Supports pagination for large conversations
 * - Returns empty array if session has no messages
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @param options Pagination options (offset, limit)
 * @returns Messages ordered by message_index
 *
 * @example
 * // Get first 50 messages
 * const messages = getSessionMessages(workspaceRoot, sessionId, { offset: 0, limit: 50 });
 *
 * // Get all messages (no pagination)
 * const allMessages = getSessionMessages(workspaceRoot, sessionId);
 */
export function getSessionMessages(
  workspaceRoot: string,
  sessionId: string,
  options?: MessagePaginationOptions,
): SessionMessage[];

/**
 * Get message count and token usage for a session
 *
 * - Aggregates token counts from all messages
 * - Counts messages by role (system, user, assistant)
 * - Returns statistics for analytics
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @returns Statistics object with counts and timestamps
 *
 * @example
 * const stats = getSessionStats(workspaceRoot, sessionId);
 * console.log(`${stats.messageCount} messages, ${stats.totalTokens} tokens`);
 * // "87 messages, 12543 tokens"
 */
export function getSessionStats(
  workspaceRoot: string,
  sessionId: string,
): SessionMessageStats;

/**
 * Get the last N messages for a session
 *
 * - Useful for displaying recent conversation in UI
 * - Returns messages in chronological order (oldest to newest)
 * - Returns empty array if count > total messages
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @param count Number of recent messages to retrieve
 * @returns Last N messages ordered by message_index ASC
 *
 * @example
 * // Get last 10 messages
 * const recentMessages = getRecentMessages(workspaceRoot, sessionId, 10);
 */
export function getRecentMessages(
  workspaceRoot: string,
  sessionId: string,
  count: number,
): SessionMessage[];

/**
 * Get a specific message by ID
 *
 * @param workspaceRoot Workspace root directory
 * @param messageId Message UUID
 * @returns Message or undefined if not found
 */
export function getMessage(
  workspaceRoot: string,
  messageId: string,
): SessionMessage | undefined;

/**
 * Delete all messages for a session
 *
 * NOTE: This is typically handled automatically by CASCADE DELETE
 * when the parent session is deleted. Only use directly for testing
 * or manual cleanup.
 *
 * @param workspaceRoot Workspace root directory
 * @param sessionId Session UUID
 * @returns Number of messages deleted
 */
export function deleteSessionMessages(
  workspaceRoot: string,
  sessionId: string,
): number;

/**
 * Copy all messages from one session to another
 *
 * Used for session continuation - copies parent messages to child session
 * with updated session_id but preserving message_index.
 *
 * @param workspaceRoot Workspace root directory
 * @param sourceSessionId Source session UUID
 * @param targetSessionId Target session UUID
 * @returns Number of messages copied
 *
 * @example
 * // Continue session: copy parent messages to new session
 * const newSession = createSession(workspaceRoot, { ... });
 * copyMessages(workspaceRoot, parentSessionId, newSession.id);
 */
export function copyMessages(
  workspaceRoot: string,
  sourceSessionId: string,
  targetSessionId: string,
): number;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the next message_index for a session
 *
 * Internal helper for insertMessage - finds MAX(message_index) + 1
 *
 * @param db Database connection
 * @param sessionId Session UUID
 * @returns Next message_index (0 if no messages exist)
 */
function getNextMessageIndex(db: Database, sessionId: string): number;

/**
 * Estimate token count for message content
 *
 * Internal helper - delegates to ContextManager.estimateTokens()
 *
 * @param content Message content (string or parts array)
 * @returns Estimated token count
 */
function estimateTokenCount(content: MessageContent): number;

/**
 * Serialize message content to JSON string
 *
 * Internal helper - handles both string and structured content
 *
 * @param content Message content
 * @returns JSON string for database storage
 */
function serializeContent(content: MessageContent): string;

/**
 * Deserialize message content from JSON string
 *
 * Internal helper - parses database JSON to MessageContent type
 *
 * @param json JSON string from database
 * @returns Parsed MessageContent
 */
function deserializeContent(json: string): MessageContent;

// ============================================================================
// Performance Characteristics
// ============================================================================

/**
 * Expected performance:
 *
 * - insertMessage: <5ms p95 (async, non-blocking)
 * - getSessionMessages: <500ms for 100-message sessions
 * - getSessionStats: <100ms (uses SUM aggregation)
 * - copyMessages: <200ms for 100 messages
 *
 * Index usage:
 * - idx_messages_session_seq (session_id, message_index) for ordered retrieval
 * - idx_messages_timestamp for time-based queries
 */
