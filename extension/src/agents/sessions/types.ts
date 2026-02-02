/**
 * Agent Session TypeScript Types
 *
 * This file contains all type definitions for the Agent Panel feature,
 * including session models, event types, aggregates, and exports.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Sections 1.1-1.6, 10
 */

// ─────────────────────────────────────────────────────────────────
// Session Model (Spec Section 1.1)
// ─────────────────────────────────────────────────────────────────

/**
 * Agent execution session model
 */
export interface AgentSession {
  // Identity
  sessionId: string;
  role: AgentRole;
  taskId: number;
  taskTitle: string | undefined;
  sprintId: string;

  // Timing
  startedAt: string; // ISO timestamp
  lastActivityAt: string; // ISO timestamp
  endedAt: string | undefined; // ISO timestamp

  // Status
  status: SessionStatus;
  statusMessage: string | undefined;

  // Progress
  iteration: number;
  maxIterations: number;

  // Aggregates
  toolCallCount: number;
  successfulToolCalls: number;
  failedToolCalls: number;
  warningCount: number;
  filesModified: string[];
  durationMs: number | undefined; // Total duration in milliseconds (set when complete)
}

/**
 * Session execution status
 */
export type SessionStatus =
  | "initializing"
  | "running"
  | "waiting_for_tool"
  | "thinking"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Agent role type
 */
export type AgentRole = "orchestrator" | "implementor" | "controller";

// ─────────────────────────────────────────────────────────────────
// EventBus Payloads (Spec Addendum Section 1.1)
// ─────────────────────────────────────────────────────────────────

/**
 * Minimal session info for event bus payloads
 */
export interface AgentSessionInfo {
  id: string;
  role: AgentRole;
  status: SessionStatus;
  startedAt: string; // ISO timestamp
  taskId?: number;
  taskTitle?: string;
}

/**
 * Event bus payload union
 */
export type EventBusPayload =
  | {
      type: "session_start";
      session: AgentSessionInfo;
    }
  | {
      type: "session_end";
      sessionId: string;
      status: SessionStatus;
    }
  | {
      type: "session_event";
      event: AgentEvent;
    };

// ─────────────────────────────────────────────────────────────────
// Session Continuation (Spec Section 1.2)
// ─────────────────────────────────────────────────────────────────

/**
 * Session continuation model for resume functionality
 */
export interface SessionContinuation {
  previousSessionId: string;
  previousEvents: AgentEvent[];
  userMessage: string; // User's continuation prompt
}

// ─────────────────────────────────────────────────────────────────
// Event Model (Spec Section 1.3)
// ─────────────────────────────────────────────────────────────────

/**
 * Base event properties shared by all event types
 */
export interface BaseEvent {
  id: string; // UUID for deduplication
  sessionId: string;
  timestamp: string; // ISO timestamp
  iteration: number; // Iteration when event was emitted
}

/**
 * User or system prompt event
 */
export interface PromptEvent extends BaseEvent {
  type: "prompt";
  text: string;
  attachments: FileAttachment[] | undefined;
}

/**
 * Agent thinking/reasoning event
 */
export interface ThinkingEvent extends BaseEvent {
  type: "thinking";
  text: string;
  tokenCount: number | undefined;
}

/**
 * Session status change event
 */
export interface StatusChangeEvent extends BaseEvent {
  type: "status_change";
  previousStatus: SessionStatus;
  newStatus: SessionStatus;
  message: string | undefined;
}

/**
 * Error or warning event
 */
export interface ErrorEvent extends BaseEvent {
  type: "error";
  severity: "error" | "warning";
  code: string;
  message: string;
  recoverable: boolean;
  details: Record<string, unknown> | undefined;
  suggestion: string | undefined;
}

/**
 * Tool call initiation event
 */
export interface ToolCallEvent extends BaseEvent {
  type: "tool_call";
  toolCallId: string;
  toolName: string;
  toolCategory: ToolCategory;
  arguments: Record<string, unknown>;
}

/**
 * Tool execution progress event
 */
export interface ToolProgressEvent extends BaseEvent {
  type: "tool_progress";
  toolCallId: string;
  toolName: string;
  message: string;
  percent: number | undefined; // 0-100
}

/**
 * Tool streaming output event
 */
export interface ToolOutputEvent extends BaseEvent {
  type: "tool_output";
  toolCallId: string;
  toolName: string;
  chunk: string;
  isStderr: boolean | undefined;
}

/**
 * Tool file operation event
 */
export interface ToolFileOperationEvent extends BaseEvent {
  type: "tool_file_operation";
  toolCallId: string;
  toolName: string;
  operation: FileOperation;
}

/**
 * Tool metadata event
 */
export interface ToolMetadataEvent extends BaseEvent {
  type: "tool_metadata";
  toolCallId: string;
  toolName: string;
  key: string;
  value: unknown;
}

/**
 * Tool completion result event
 */
export interface ToolResultEvent extends BaseEvent {
  type: "tool_result";
  toolCallId: string;
  toolName: string;
  success: boolean;
  output: string;
  error: ToolError | undefined;
  durationMs: number;
}

/**
 * Discriminated union of all event types
 */
export type AgentEvent =
  | PromptEvent
  | ThinkingEvent
  | StatusChangeEvent
  | ErrorEvent
  | ToolCallEvent
  | ToolProgressEvent
  | ToolOutputEvent
  | ToolFileOperationEvent
  | ToolMetadataEvent
  | ToolResultEvent;

/**
 * Structured error returned by tool execution failures
 */
export interface ToolError {
  code: ToolErrorCode;
  message: string;
  suggestion: string | undefined;
  details: Record<string, unknown> | undefined;
}

/**
 * Tool error codes
 */
export type ToolErrorCode =
  | "VALIDATION_ERROR"
  | "FILE_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "PARSE_ERROR"
  | "EXECUTION_ERROR"
  | "CANCELLED"
  | "UNKNOWN";

// ─────────────────────────────────────────────────────────────────
// File Operation Model (Spec Section 1.4)
// ─────────────────────────────────────────────────────────────────

/**
 * File operation metadata
 */
export interface FileOperation {
  operation: "create" | "update" | "delete" | "move" | "copy" | "read";
  path: string; // Absolute or relative path
  targetPath: string | undefined; // For move/copy operations
  size: number | undefined; // File size in bytes
  linesChanged: number | undefined; // For update operations
  linesInserted: number | undefined; // For update operations
  linesDeleted: number | undefined; // For update operations
}

/**
 * File attachment metadata
 */
export interface FileAttachment {
  path: string; // Absolute or relative path
  name: string;
  mimeType: string | undefined;
}

// ─────────────────────────────────────────────────────────────────
// Tool Categories (Spec Section 1.5)
// ─────────────────────────────────────────────────────────────────

/**
 * Tool category classification
 */
export type ToolCategory = "coding" | "filesystem" | "system" | "orchestra";

// ─────────────────────────────────────────────────────────────────
// Tool Call Aggregate (Spec Section 1.6)
// ─────────────────────────────────────────────────────────────────

/**
 * Computed view grouping all events for a single tool invocation
 */
export interface ToolCallAggregate {
  toolCallId: string;
  toolName: string;
  toolCategory: ToolCategory;
  status: "pending" | "running" | "success" | "failed";

  // Timing
  startedAt: string; // ISO timestamp
  completedAt: string | undefined; // ISO timestamp
  durationMs: number | undefined;

  // Data
  arguments: Record<string, unknown>;
  result: string | undefined;
  error: ToolError | undefined;

  // Progress
  lastProgressMessage: string | undefined;
  progressPercent: number | undefined; // 0-100

  // Aggregated data
  outputChunks: string[];
  outputLineCount: number;
  fileOperations: FileOperation[];
  metadata: Record<string, unknown>;
  events: AgentEvent[]; // Full event sequence
}

// ─────────────────────────────────────────────────────────────────
// Export Model (Spec Section 10)
// ─────────────────────────────────────────────────────────────────

/**
 * Session export format for JSON export
 */
export interface SessionExport {
  exportedAt: string; // ISO timestamp
  version: "1.0";
  session: AgentSession;
  events: AgentEvent[];
}
