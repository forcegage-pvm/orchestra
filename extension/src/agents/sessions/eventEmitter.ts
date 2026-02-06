/**
 * Session Event Emitter
 *
 * High-level API for emitting typed agent session events.
 * Provides convenient methods for each event type with automatic ID generation,
 * timestamp creation, and iteration tracking.
 *
 * Specification: specs/011-agent-panel-rework/tasks.md T016
 */

import { randomUUID } from "crypto";
import { getAgentEventBus } from "./eventBus.js";
import { insertEvent } from "./eventRepository.js";
import type {
  AgentEvent,
  AgentSessionInfo,
  ErrorEvent,
  FileAttachment,
  FileOperation,
  PromptEvent,
  SessionStatus,
  StatusChangeEvent,
  ThinkingEvent,
  ToolCallEvent,
  ToolCategory,
  ToolError,
  ToolFileOperationEvent,
  ToolMetadataEvent,
  ToolOutputEvent,
  ToolProgressEvent,
  ToolResultEvent,
} from "./types.js";

/**
 * Debug tag for filtering in DevTools console.
 * Filter with: [ORCH-EMIT] in browser console
 */
const DEBUG_TAG = "[ORCH-EMIT]";

/**
 * SessionEventEmitter provides a high-level API for creating and persisting
 * session events. It handles boilerplate of ID generation, timestamps, and
 * iteration tracking.
 *
 * @example
 * ```typescript
 * const emitter = new SessionEventEmitter(workspaceRoot, sessionId);
 * emitter.setIteration(1);
 * emitter.emitPrompt("Implement the feature");
 * emitter.emitToolCall("tool-1", "read_file", "filesystem", { path: "src/main.ts" });
 * emitter.emitToolResult("tool-1", "read_file", true, "file contents", 150);
 * ```
 */
export class SessionEventEmitter {
  private readonly workspaceRoot: string;
  private readonly sessionId: string;
  private currentIteration: number = 0;

  /**
   * Persist event to DB and emit to bus with error boundary.
   * Logs and re-throws any errors for visibility.
   */
  private persistAndEmit(event: AgentEvent): void {
    const eventSummary = `${event.type} id=${event.id.slice(0, 8)} iter=${this.currentIteration}`;
    try {
      console.log(`${DEBUG_TAG} persist:`, eventSummary);
      insertEvent(this.workspaceRoot, event);
    } catch (error) {
      console.error(
        `${DEBUG_TAG} ERROR insertEvent failed:`,
        eventSummary,
        error,
      );
      throw error;
    }
    try {
      getAgentEventBus().emit({ type: "session_event", event });
    } catch (error) {
      console.error(`${DEBUG_TAG} ERROR bus emit failed:`, eventSummary, error);
      throw error;
    }
  }

  /**
   * Create a new SessionEventEmitter
   *
   * @param workspaceRoot Workspace root directory
   * @param sessionId Session UUID
   */
  constructor(workspaceRoot: string, sessionId: string) {
    this.workspaceRoot = workspaceRoot;
    this.sessionId = sessionId;
  }

  /**
   * Update the current iteration counter
   *
   * @param iteration New iteration number
   */
  setIteration(iteration: number): void {
    this.currentIteration = iteration;
  }

  /**
   * Emit a prompt event (user or system prompt)
   *
   * @param text Prompt text
   * @param attachments Optional file attachments
   * @returns Created and persisted PromptEvent
   */
  emitPrompt(text: string, attachments?: FileAttachment[]): PromptEvent {
    const event: PromptEvent = {
      id: randomUUID(),
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      iteration: this.currentIteration,
      type: "prompt",
      text,
      attachments,
    };
    this.persistAndEmit(event);
    return event;
  }

  /**
   * Emit a thinking event (agent reasoning)
   *
   * @param text Thinking text
   * @param tokenCount Optional token count for the thinking step
   * @returns Created and persisted ThinkingEvent
   */
  emitThinking(text: string, tokenCount?: number): ThinkingEvent {
    const event: ThinkingEvent = {
      id: randomUUID(),
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      iteration: this.currentIteration,
      type: "thinking",
      text,
      tokenCount,
    };
    this.persistAndEmit(event);
    return event;
  }

  /**
   * Emit a status change event
   *
   * @param previousStatus Previous session status
   * @param newStatus New session status
   * @param message Optional status change message
   * @returns Created and persisted StatusChangeEvent
   */
  emitStatusChange(
    previousStatus: SessionStatus,
    newStatus: SessionStatus,
    message?: string,
  ): StatusChangeEvent {
    const event: StatusChangeEvent = {
      id: randomUUID(),
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      iteration: this.currentIteration,
      type: "status_change",
      previousStatus,
      newStatus,
      message,
    };
    this.persistAndEmit(event);
    return event;
  }

  /**
   * Emit a session start event to the AgentEventBus
   *
   * @param session Session info payload
   */
  emitSessionStart(session: AgentSessionInfo): void {
    try {
      console.log(
        `${DEBUG_TAG} session_start sessionId=${session.id} role=${session.role}`
      );
      getAgentEventBus().emit({ type: "session_start", session });
    } catch (error) {
      console.error(
        `${DEBUG_TAG} ERROR session_start failed sessionId=${session.id}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Emit a session end event to the AgentEventBus
   *
   * @param status Final session status
   */
  emitSessionEnd(status: SessionStatus): void {
    try {
      console.log(
        `${DEBUG_TAG} session_end sessionId=${this.sessionId.slice(0, 8)} status=${status}`,
      );
      getAgentEventBus().emit({
        type: "session_end",
        sessionId: this.sessionId,
        status,
      });
    } catch (error) {
      console.error(
        `${DEBUG_TAG} ERROR session_end failed sessionId=${this.sessionId.slice(0, 8)}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Emit an error or warning event
   *
   * @param severity Error severity level
   * @param code Error code
   * @param message Error message
   * @param recoverable Whether the error is recoverable
   * @param details Optional error details
   * @param suggestion Optional suggestion for resolution
   * @returns Created and persisted ErrorEvent
   */
  emitError(
    severity: "error" | "warning",
    code: string,
    message: string,
    recoverable: boolean,
    details?: Record<string, unknown>,
    suggestion?: string,
  ): ErrorEvent {
    const event: ErrorEvent = {
      id: randomUUID(),
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      iteration: this.currentIteration,
      type: "error",
      severity,
      code,
      message,
      recoverable,
      details,
      suggestion,
    };
    this.persistAndEmit(event);
    return event;
  }

  /**
   * Emit a tool call initiation event
   *
   * @param toolCallId Tool call identifier
   * @param toolName Tool name
   * @param toolCategory Tool category
   * @param args Tool arguments
   * @returns Created and persisted ToolCallEvent
   */
  emitToolCall(
    toolCallId: string,
    toolName: string,
    toolCategory: ToolCategory,
    args: Record<string, unknown>,
  ): ToolCallEvent {
    const event: ToolCallEvent = {
      id: randomUUID(),
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      iteration: this.currentIteration,
      type: "tool_call",
      toolCallId,
      toolName,
      toolCategory,
      arguments: args,
    };
    this.persistAndEmit(event);
    return event;
  }

  /**
   * Emit a tool progress event
   *
   * @param toolCallId Tool call identifier
   * @param toolName Tool name
   * @param message Progress message
   * @param percent Optional progress percentage (0-100)
   * @returns Created and persisted ToolProgressEvent
   */
  emitToolProgress(
    toolCallId: string,
    toolName: string,
    message: string,
    percent?: number,
  ): ToolProgressEvent {
    const event: ToolProgressEvent = {
      id: randomUUID(),
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      iteration: this.currentIteration,
      type: "tool_progress",
      toolCallId,
      toolName,
      message,
      percent,
    };
    this.persistAndEmit(event);
    return event;
  }

  /**
   * Emit a tool output event (streaming output)
   *
   * @param toolCallId Tool call identifier
   * @param toolName Tool name
   * @param chunk Output chunk
   * @param isStderr Whether this is stderr output
   * @returns Created and persisted ToolOutputEvent
   */
  emitToolOutput(
    toolCallId: string,
    toolName: string,
    chunk: string,
    isStderr?: boolean,
  ): ToolOutputEvent {
    const event: ToolOutputEvent = {
      id: randomUUID(),
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      iteration: this.currentIteration,
      type: "tool_output",
      toolCallId,
      toolName,
      chunk,
      isStderr,
    };
    this.persistAndEmit(event);
    return event;
  }

  /**
   * Emit a tool file operation event
   *
   * @param toolCallId Tool call identifier
   * @param toolName Tool name
   * @param operation File operation metadata
   * @returns Created and persisted ToolFileOperationEvent
   */
  emitToolFileOperation(
    toolCallId: string,
    toolName: string,
    operation: FileOperation,
  ): ToolFileOperationEvent {
    const event: ToolFileOperationEvent = {
      id: randomUUID(),
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      iteration: this.currentIteration,
      type: "tool_file_operation",
      toolCallId,
      toolName,
      operation,
    };
    this.persistAndEmit(event);
    return event;
  }

  /**
   * Emit a tool metadata event
   *
   * @param toolCallId Tool call identifier
   * @param toolName Tool name
   * @param key Metadata key
   * @param value Metadata value
   * @returns Created and persisted ToolMetadataEvent
   */
  emitToolMetadata(
    toolCallId: string,
    toolName: string,
    key: string,
    value: unknown,
  ): ToolMetadataEvent {
    const event: ToolMetadataEvent = {
      id: randomUUID(),
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      iteration: this.currentIteration,
      type: "tool_metadata",
      toolCallId,
      toolName,
      key,
      value,
    };
    this.persistAndEmit(event);
    return event;
  }

  /**
   * Emit a tool result event (completion)
   *
   * @param toolCallId Tool call identifier
   * @param toolName Tool name
   * @param success Whether the tool call succeeded
   * @param output Tool output
   * @param durationMs Tool execution duration in milliseconds
   * @param error Optional error information
   * @returns Created and persisted ToolResultEvent
   */
  emitToolResult(
    toolCallId: string,
    toolName: string,
    success: boolean,
    output: string,
    durationMs: number,
    error?: ToolError,
  ): ToolResultEvent {
    const event: ToolResultEvent = {
      id: randomUUID(),
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      iteration: this.currentIteration,
      type: "tool_result",
      toolCallId,
      toolName,
      success,
      output,
      error,
      durationMs,
    };
    this.persistAndEmit(event);
    return event;
  }
}
