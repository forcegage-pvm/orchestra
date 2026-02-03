/**
 * ToolResult Contract
 *
 * Standardized result type for all tool executions.
 * This is a reference contract - actual implementation in extension/src/agents/tools/types.ts
 */

/**
 * Error codes for programmatic error handling
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

  // Task operations
  TASK_NOT_FOUND = "TASK_NOT_FOUND",
  TASK_FAILED = "TASK_FAILED",

  // General
  TIMEOUT = "TIMEOUT",
  CANCELLED = "CANCELLED",
  INVALID_INPUT = "INVALID_INPUT",
  WORKSPACE_REQUIRED = "WORKSPACE_REQUIRED",
  UNKNOWN = "UNKNOWN",
}

/**
 * Structured error information
 */
export interface ToolError {
  /** Machine-readable error code from ToolErrorCode enum */
  code: ToolErrorCode;

  /** Human-readable error message */
  message: string;

  /** Actionable suggestion for recovery */
  suggestion?: string;

  /** Additional debugging context */
  details?: Record<string, unknown>;
}

/**
 * Content part within a tool result
 */
export interface ToolResultContent {
  /**
   * Content type discriminator
   * - 'text': Plain text output
   * - 'json': JSON-formatted data (value is stringified JSON)
   * - 'data': Binary data (value is base64-encoded)
   * - 'error': Error message for display
   */
  type: "text" | "json" | "data" | "error";

  /** Content value */
  value: string;

  /** MIME type (required for 'data' type, e.g., 'image/png') */
  mimeType?: string;
}

/**
 * Execution metadata for observability
 */
export interface ToolMetadata {
  /** Tool name (matches AgentTool.name) */
  toolName: string;

  /** Unique call identifier (UUID) */
  callId: string;

  /** Execution duration in milliseconds */
  durationMs: number;

  /** Hash of input for deduplication/caching */
  inputHash?: string;

  /** Whether output was truncated (e.g., large file) */
  outputTruncated?: boolean;

  /** Non-fatal warnings during execution */
  warnings?: string[];

  /** Number of retry attempts (0 = first attempt succeeded) */
  retryCount?: number;
}

/**
 * Standardized tool execution result
 *
 * All tools return this structure. AgentRunner consumes content[] directly.
 */
export interface ToolResult {
  /** Overall success/failure indicator */
  success: boolean;

  /** Content parts (sent to LLM) */
  content: ToolResultContent[];

  /** Structured error info (required when success=false) */
  error?: ToolError;

  /** Execution metadata (populated by ToolRegistry) */
  metadata: ToolMetadata;
}

/**
 * Minimal observer interface for future observability
 *
 * Tools may receive this in context but must not require it.
 * Full implementation deferred to observability sprint.
 */
export interface ToolObserver {
  /** Report progress during long-running operations */
  onProgress?(callId: string, message: string, percent?: number): void;

  /** Report streaming output (e.g., terminal) */
  onOutput?(callId: string, chunk: string): void;
}

// ============================================================================
// Result Builder Helpers (for tool implementations)
// ============================================================================

/**
 * Create a successful result with text content
 */
export function successResult(
  toolName: string,
  content: string | ToolResultContent[],
  warnings?: string[],
): Partial<ToolResult> {
  const contentArray =
    typeof content === "string"
      ? [{ type: "text" as const, value: content }]
      : content;

  return {
    success: true,
    content: contentArray,
    metadata: {
      toolName,
      callId: "", // Filled by registry
      durationMs: 0, // Filled by registry
      warnings,
    },
  };
}

/**
 * Create an error result
 */
export function errorResult(
  toolName: string,
  code: ToolErrorCode,
  message: string,
  suggestion?: string,
  details?: Record<string, unknown>,
): Partial<ToolResult> {
  return {
    success: false,
    content: [{ type: "error", value: message }],
    error: { code, message, suggestion, details },
    metadata: {
      toolName,
      callId: "", // Filled by registry
      durationMs: 0, // Filled by registry
    },
  };
}
