/**
 * Message Protocol Types
 *
 * Defines bidirectional message types for Extension ↔ Webview communication.
 * Uses discriminated unions for type-safe message handling.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 8.2
 */

import type {
  AgentEvent,
  AgentSession,
} from "../../../agents/sessions/types.js";

// ─────────────────────────────────────────────────────────────────
// Verbosity Level
// ─────────────────────────────────────────────────────────────────

/**
 * Display verbosity level
 * Spec Section 4.3: Timeline verbosity settings
 */
export type VerbosityLevel = "minimal" | "normal" | "verbose" | "debug";

// ─────────────────────────────────────────────────────────────────
// Extension → Webview Messages
// ─────────────────────────────────────────────────────────────────

/**
 * Update current session
 */
export interface SessionUpdateMessage {
  type: "session_update";
  session: AgentSession;
}

/**
 * Provide list of available sessions
 */
export interface SessionListMessage {
  type: "session_list";
  sessions: AgentSession[];
}

/**
 * Single event update
 */
export interface EventMessage {
  type: "event";
  event: AgentEvent;
}

/**
 * Batch of events for efficient bulk updates
 */
export interface EventsBatchMessage {
  type: "events_batch";
  sessionId: string;
  events: AgentEvent[];
}

/**
 * Clear all session data
 */
export interface ClearMessage {
  type: "clear";
}

/**
 * Set verbosity level
 */
export interface SetVerbosityMessage {
  type: "set_verbosity";
  level: VerbosityLevel;
}

/**
 * Load complete session with all events
 */
export interface LoadSessionMessage {
  type: "load_session";
  sessionId: string;
  events: AgentEvent[];
}

/**
 * Discriminated union of all Extension → Webview messages
 */
export type ExtensionMessage =
  | SessionUpdateMessage
  | SessionListMessage
  | EventMessage
  | EventsBatchMessage
  | ClearMessage
  | SetVerbosityMessage
  | LoadSessionMessage;

// ─────────────────────────────────────────────────────────────────
// Webview → Extension Messages
// ─────────────────────────────────────────────────────────────────

/**
 * Webview ready notification
 */
export interface ReadyMessage {
  type: "ready";
}

/**
 * Open file in editor with optional line positioning
 */
export interface OpenFileMessage {
  type: "open_file";
  path: string;
  line?: number;
  endLine?: number;
}

/**
 * Open diff view for file
 */
export interface OpenDiffMessage {
  type: "open_diff";
  path: string;
}

/**
 * Copy text to clipboard
 */
export interface CopyTextMessage {
  type: "copy_text";
  text: string;
}

/**
 * Stop currently running agent
 */
export interface StopAgentMessage {
  type: "stop_agent";
}

/**
 * Continue a previous session
 */
export interface ContinueSessionMessage {
  type: "continue_session";
  sessionId: string;
}

/**
 * Switch to viewing a different session
 */
export interface SwitchSessionMessage {
  type: "switch_session";
  sessionId: string;
}

/**
 * Switch to a different task and load its sessions
 */
export interface SwitchTaskMessage {
  type: "switch_task";
  taskId: number;
}

/**
 * Export session to JSON
 */
export interface ExportSessionMessage {
  type: "export_session";
  sessionId: string;
}

/**
 * Set verbosity level (bidirectional)
 */
export interface SetVerbosityWebviewMessage {
  type: "set_verbosity";
  level: VerbosityLevel;
}

/**
 * User message to agent
 */
export interface UserMessageMessage {
  type: "user_message";
  text: string;
}

/**
 * Discriminated union of all Webview → Extension messages
 */
export type WebviewMessage =
  | ReadyMessage
  | OpenFileMessage
  | OpenDiffMessage
  | CopyTextMessage
  | StopAgentMessage
  | ContinueSessionMessage
  | SwitchSessionMessage
  | SwitchTaskMessage
  | ExportSessionMessage
  | SetVerbosityWebviewMessage
  | UserMessageMessage;
