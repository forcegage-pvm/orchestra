/**
 * Agent Error Hierarchy
 *
 * Error types for the custom AI coding agents system.
 * Combines patterns from:
 * - extension/src/utils/errors.ts (OrchestraExtensionError base)
 * - src/core/errors.ts (error codes and toJSON serialization)
 */

import { OrchestraExtensionError } from "../utils/errors.js";

/**
 * Base error class for all agent-related errors
 *
 * Extends OrchestraExtensionError and adds:
 * - Error code for structured error handling
 * - toJSON method for serialization
 */
export class AgentError extends OrchestraExtensionError {
  constructor(
    message: string,
    public readonly code: string,
    context?: Record<string, unknown>
  ) {
    super(message, context);
    this.name = "AgentError";
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}

/**
 * Error thrown when tool execution fails
 *
 * Includes the tool name for debugging and error reporting.
 */
export class ToolExecutionError extends AgentError {
  constructor(
    message: string,
    public readonly toolName: string,
    context?: Record<string, unknown>
  ) {
    super(message, "TOOL_EXECUTION_ERROR", {
      ...context,
      toolName,
    });
    this.name = "ToolExecutionError";
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      toolName: this.toolName,
    };
  }
}

/**
 * Error thrown when session operations fail
 *
 * Includes the session ID for debugging and recovery operations.
 */
export class SessionError extends AgentError {
  constructor(
    message: string,
    public readonly sessionId: string,
    context?: Record<string, unknown>,
    code: string = "SESSION_ERROR"
  ) {
    super(message, code, {
      ...context,
      sessionId,
    });
    this.name = "SessionError";
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      sessionId: this.sessionId,
    };
  }
}

/**
 * Type guard for AgentError
 */
export function isAgentError(error: unknown): error is AgentError {
  return error instanceof AgentError;
}

/**
 * Type guard for ToolExecutionError
 */
export function isToolExecutionError(
  error: unknown
): error is ToolExecutionError {
  return error instanceof ToolExecutionError;
}

/**
 * Type guard for SessionError
 */
export function isSessionError(error: unknown): error is SessionError {
  return error instanceof SessionError;
}
