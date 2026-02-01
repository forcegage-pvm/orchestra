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
import type {
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
import { insertEvent } from "./eventRepository.js";

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
    insertEvent(this.workspaceRoot, event);
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
    insertEvent(this.workspaceRoot, event);
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
    message?: string
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
    insertEvent(this.workspaceRoot, event);
    return event;
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
    suggestion?: string
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
    insertEvent(this.workspaceRoot, event);
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
    args: Record<string, unknown>
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
    insertEvent(this.workspaceRoot, event);
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
    percent?: number
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
    insertEvent(this.workspaceRoot, event);
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
    isStderr?: boolean
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
    insertEvent(this.workspaceRoot, event);
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
    operation: FileOperation
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
    insertEvent(this.workspaceRoot, event);
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
    value: unknown
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
    insertEvent(this.workspaceRoot, event);
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
    error?: ToolError
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
    insertEvent(this.workspaceRoot, event);
    return event;
  }
}
