/**
 * Tool Error Codes and Factory Helpers
 */

import type { ToolError } from "./types.js";

/**
 * Fixed error codes for tool failures
 */
export enum ToolErrorCode {
  // File operations
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  FILE_EXISTS = "FILE_EXISTS",
  PATH_TRAVERSAL = "PATH_TRAVERSAL",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  BINARY_FILE = "BINARY_FILE",
  FILE_TOO_LARGE = "FILE_TOO_LARGE",

  // Edit operations
  MULTIPLE_MATCHES = "MULTIPLE_MATCHES",
  NO_MATCH = "NO_MATCH",
  INVALID_RANGE = "INVALID_RANGE",

  // Terminal operations
  SHELL_INTEGRATION_UNAVAILABLE = "SHELL_INTEGRATION_UNAVAILABLE",
  COMMAND_FAILED = "COMMAND_FAILED",
  NO_OUTPUT = "NO_OUTPUT",
  TERMINAL_NOT_FOUND = "TERMINAL_NOT_FOUND",

  // Task operations
  TASK_NOT_FOUND = "TASK_NOT_FOUND",
  TASK_FAILED = "TASK_FAILED",

  // General
  TIMEOUT = "TIMEOUT",
  CANCELLED = "CANCELLED",
  INVALID_INPUT = "INVALID_INPUT",
  WORKSPACE_REQUIRED = "WORKSPACE_REQUIRED",
  PARTIAL_FAILURE = "PARTIAL_FAILURE",
  UNKNOWN = "UNKNOWN",

  // Test runner operations
  TEST_RUN_IN_PROGRESS = "TEST_RUN_IN_PROGRESS",
  TIER_NOT_CONFIGURED = "TIER_NOT_CONFIGURED",
  CONFIG_NOT_FOUND = "CONFIG_NOT_FOUND",
  PROMOTION_BLOCKED = "PROMOTION_BLOCKED",
  NO_CHANGES_DETECTED = "NO_CHANGES_DETECTED",
  TEST_COMMAND_BLOCKED = "TEST_COMMAND_BLOCKED",
}
/**
 * Create a structured ToolError object
 */
export function createToolError(
  code: ToolErrorCode,
  message: string,
  suggestion?: string,
  details?: Record<string, unknown>,
): ToolError {
  const error: ToolError = {
    code,
    message,
  };

  if (suggestion) {
    error.suggestion = suggestion;
  }

  if (details) {
    error.details = details;
  }

  return error;
}
