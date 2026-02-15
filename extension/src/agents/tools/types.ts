/**
 * Tool Type System (Zod Schemas + TypeScript Types)
 */

import type * as vscode from "vscode";
import { z } from "zod";

import { ToolErrorCode } from "./errors.js";

// ============================================================================
// Tool Input Schema
// ============================================================================

/**
 * Schema definition for tool input validation
 * Defines the structure of parameters accepted by an AgentTool
 */
export const ToolInputSchemaSchema = z.object({
  type: z.literal("object"),
  properties: z.record(
    z.object({
      type: z.string(),
      description: z.string().optional(),
      default: z.unknown().optional(),
      enum: z.array(z.string()).optional(),
    }),
  ),
  required: z.array(z.string()).optional(),
});

/**
 * Tool input schema defining parameter structure and validation rules
 * @property type - Must be "object" for tool inputs
 * @property properties - Map of parameter names to their type definitions
 * @property required - Optional array of required parameter names
 */
export type ToolInputSchema = z.output<typeof ToolInputSchemaSchema>;

// ============================================================================
// Tool Result Types
// ============================================================================

/**
 * Zod schema for tool error codes (wraps the ToolErrorCode enum from errors.ts)
 */
export const ToolErrorCodeSchema = z.nativeEnum(ToolErrorCode);

// Re-export the ToolErrorCode enum type from errors.ts for convenience
export { ToolErrorCode } from "./errors.js";

/**
 * Schema for structured tool errors
 */
export const ToolErrorSchema = z.object({
  code: ToolErrorCodeSchema,
  message: z.string().min(1),
  suggestion: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

/**
 * Structured error returned by tool execution failures
 * @property code - Error classification code
 * @property message - Human-readable error message
 * @property suggestion - Optional guidance for resolving the error
 * @property details - Additional context about the error
 */
export type ToolError = z.output<typeof ToolErrorSchema>;

/**
 * Schema for tool result content items
 */
export const ToolResultContentSchema = z.object({
  type: z.enum(["text", "json", "data", "error"]),
  value: z.string(),
  mimeType: z.string().optional(),
});

/**
 * Content item within a tool result
 * @property type - Content classification: "text", "json", "data", or "error"
 * @property value - String content of the result
 * @property mimeType - Optional MIME type for the content
 */
export type ToolResultContent = z.output<typeof ToolResultContentSchema>;

/**
 * Schema for tool invocation metadata
 */
export const ToolMetadataSchema = z.object({
  toolName: z.string().min(1),
  callId: z.string().uuid(),
  durationMs: z.number().int().nonnegative(),
  inputHash: z.string().optional(),
  outputTruncated: z.boolean().optional(),
  warnings: z.array(z.string()).optional(),
  retryCount: z.number().int().nonnegative().optional(),
});

/**
 * Metadata about tool invocation for tracking and debugging
 * @property toolName - Name of the invoked tool
 * @property callId - Unique identifier for this invocation
 * @property durationMs - Execution time in milliseconds
 * @property inputHash - Optional hash of input for caching
 * @property outputTruncated - Whether output was truncated due to size limits
 * @property warnings - Non-fatal warnings generated during execution
 * @property retryCount - Number of retry attempts (if applicable)
 */
export type ToolMetadata = z.output<typeof ToolMetadataSchema>;

/**
 * Signal that a tool can emit to control agent execution
 * - "pause": Agent should pause and wait for user input
 * - "stop": Agent should stop execution completely
 */
export const ToolSignalSchema = z.enum(["pause", "stop"]).optional();
export type ToolSignal = z.output<typeof ToolSignalSchema>;

/**
 * Schema for complete tool execution result
 */
export const ToolResultSchema = z.object({
  success: z.boolean(),
  content: z.array(ToolResultContentSchema),
  error: ToolErrorSchema.optional(),
  metadata: ToolMetadataSchema,
  signal: ToolSignalSchema,
});

/**
 * Complete result of a tool invocation
 * @property success - Whether the tool executed successfully
 * @property content - Array of result content items
 * @property error - Error information if execution failed
 * @property metadata - Invocation metadata for tracking
 * @property signal - Optional signal to control agent execution (pause/stop)
 */
export type ToolResult = z.output<typeof ToolResultSchema>;

// ============================================================================
// Terminal Tool Types
// ============================================================================

/**
 * Schema for run_command tool input
 */
export const RunCommandInputSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeout_ms: z.number().int().nonnegative().optional(),
  stdin: z.string().optional(),
  env: z.record(z.string()).optional(),
  expect_failure: z.boolean().optional(),
});

/**
 * Input parameters for run_command tool
 * @property command - Shell command to execute
 * @property cwd - Optional working directory (defaults to workspace root)
 * @property timeout_ms - Optional command timeout in milliseconds
 * @property stdin - Optional standard input to pipe to the command
 * @property env - Optional environment variables to set
 * @property expect_failure - When true, non-zero exit codes are treated as success (e.g., TDD red-phase tests that should fail)
 */
export type RunCommandInput = z.output<typeof RunCommandInputSchema>;

/**
 * Result of executing a shell command
 * @property success - Whether command executed without error
 * @property exit_code - Process exit code
 * @property stdout - Standard output captured from command
 * @property stderr - Standard error output captured from command
 * @property duration_ms - Execution time in milliseconds
 * @property timed_out - Whether command was terminated due to timeout
 * @property warning - Optional warning message
 */
export interface RunCommandResult {
  success: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  timed_out: boolean;
  warning?: string;
  /** Extracted error summary with diagnostics for failed commands */
  error_summary?: string;
}

/**
 * Schema for start_process tool input
 */
export const StartProcessInputSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  ready_pattern: z.string().optional(),
  ready_timeout_ms: z.number().int().nonnegative().optional(),
  env: z.record(z.string()).optional(),
});

/**
 * Input parameters for start_process tool
 * @property command - Shell command to run as background process
 * @property cwd - Optional working directory
 * @property ready_pattern - Optional regex pattern to detect when process is ready
 * @property ready_timeout_ms - Timeout for ready pattern detection
 * @property env - Optional environment variables
 */
export type StartProcessInput = z.output<typeof StartProcessInputSchema>;

/**
 * Result of starting a background process
 * @property success - Whether process started successfully
 * @property process_id - Unique identifier for the process
 * @property status - Current process status
 * @property initial_output - Initial stdout/stderr captured
 * @property error - Error message if start failed
 */
export interface StartProcessResult {
  success: boolean;
  process_id: string;
  status: ProcessStatus;
  initial_output: string;
  error?: string;
}

/**
 * Schema for get_process_output tool input
 */
export const GetProcessOutputInputSchema = z.object({
  process_id: z.string().min(1),
  since_last_read: z.boolean().optional(),
  max_lines: z.number().int().positive().optional(),
  include_ansi: z.boolean().optional(),
});

/**
 * Input parameters for get_process_output tool
 * @property process_id - Process identifier from start_process
 * @property since_last_read - If true, only return output since last read
 * @property max_lines - Maximum lines to return (truncates with head/tail)
 * @property include_ansi - If false, strip ANSI escape codes
 */
export type GetProcessOutputInput = z.output<
  typeof GetProcessOutputInputSchema
>;

/**
 * Result of retrieving process output
 * @property success - Whether output was retrieved successfully
 * @property process_id - Process identifier
 * @property status - Current process status
 * @property output - Captured stdout/stderr
 * @property truncated - Whether output was truncated
 * @property lines_returned - Number of lines in output
 * @property total_lines - Total lines in buffer
 */
export interface GetProcessOutputResult {
  success: boolean;
  process_id: string;
  status: ProcessStatus;
  output: string;
  truncated: boolean;
  lines_returned: number;
  total_lines: number;
}

/**
 * Schema for stop_process tool input
 */
export const StopProcessInputSchema = z.object({
  process_id: z.string().min(1),
  graceful_timeout_ms: z.number().int().nonnegative().optional(),
});

/**
 * Input parameters for stop_process tool
 * @property process_id - Process identifier to stop
 * @property graceful_timeout_ms - Time to wait for graceful shutdown before force kill
 */
export type StopProcessInput = z.output<typeof StopProcessInputSchema>;

/**
 * Result of stopping a process
 * @property success - Whether stop operation completed
 * @property process_id - Process identifier
 * @property exit_code - Exit code if process terminated gracefully
 * @property force_killed - Whether force kill was required
 */
export interface StopProcessResult {
  success: boolean;
  process_id: string;
  exit_code?: number;
  force_killed: boolean;
}

/**
 * Schema for send_input tool input
 */
export const SendInputInputSchema = z.object({
  process_id: z.string().min(1),
  text: z.string(),
  press_enter: z.boolean().optional(),
  special_key: z.enum(["ctrl+c", "ctrl+d", "ctrl+z"]).optional(),
});

/**
 * Input parameters for send_input tool
 * @property process_id - Target process identifier
 * @property text - Text to send to process stdin
 * @property press_enter - If true, append newline after text
 * @property special_key - Optional special key sequence to send
 */
export type SendInputInput = z.output<typeof SendInputInputSchema>;

/**
 * Result of sending input to a process
 * @property success - Whether input was sent successfully
 * @property process_id - Process identifier
 * @property bytes_sent - Number of bytes written to stdin
 * @property error - Error message if send failed
 */
export interface SendInputResult {
  success: boolean;
  process_id: string;
  bytes_sent: number;
  error?: string;
}

/**
 * Schema for wait_for_pattern tool input
 */
export const WaitForPatternInputSchema = z.object({
  process_id: z.string().min(1),
  pattern: z.string().min(1),
  timeout_ms: z.number().int().nonnegative().optional(),
});

/**
 * Input parameters for wait_for_pattern tool
 * @property process_id - Process to monitor
 * @property pattern - Regex pattern to match in output
 * @property timeout_ms - Maximum wait time in milliseconds
 */
export type WaitForPatternInput = z.output<typeof WaitForPatternInputSchema>;

/**
 * Result of waiting for pattern in process output
 * @property success - Whether operation completed without error
 * @property matched - Whether pattern was found
 * @property matched_line - Line containing the match (if found)
 * @property wait_time_ms - Time elapsed until match or timeout
 * @property timed_out - Whether wait timed out
 */
export interface WaitForPatternResult {
  success: boolean;
  matched: boolean;
  matched_line?: string;
  wait_time_ms: number;
  timed_out: boolean;
}

/**
 * Schema for find_port_process tool input
 */
export const FindPortProcessInputSchema = z.object({
  port: z.number().int().positive(),
});

/**
 * Input parameters for find_port_process tool
 * @property port - Port number to check for active processes
 */
export type FindPortProcessInput = z.output<typeof FindPortProcessInputSchema>;

/**
 * Result of checking port usage
 * @property success - Whether port check completed
 * @property in_use - Whether port is currently bound
 * @property process_id - Orchestra process ID if managed process
 * @property pid - OS process ID using the port
 * @property command - Command string of process using port
 */
export interface FindPortProcessResult {
  success: boolean;
  in_use: boolean;
  process_id?: string;
  pid?: number;
  command?: string;
}

/**
 * Schema for execute_with_retry tool input
 */
export const ExecuteWithRetryInputSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  max_retries: z.number().int().positive().optional(),
  retry_delay_ms: z.number().int().nonnegative().optional(),
  success_exit_codes: z.array(z.number().int()).optional(),
  success_pattern: z.string().optional(),
  timeout_ms: z.number().int().nonnegative().optional(),
});

/**
 * Input parameters for execute_with_retry tool
 * @property command - Shell command to execute with retry logic
 * @property cwd - Optional working directory
 * @property max_retries - Maximum retry attempts (default: 3)
 * @property retry_delay_ms - Delay between retries in milliseconds
 * @property success_exit_codes - Exit codes considered successful (default: [0])
 * @property success_pattern - Optional regex pattern to match in output for success
 * @property timeout_ms - Per-attempt timeout in milliseconds
 */
export type ExecuteWithRetryInput = z.output<
  typeof ExecuteWithRetryInputSchema
>;

/**
 * Result of executing command with retry logic
 * @property success - Whether command ultimately succeeded
 * @property attempts - Total number of attempts made
 * @property final_exit_code - Exit code of final attempt
 * @property stdout - Standard output from final attempt
 * @property stderr - Standard error from final attempt
 * @property total_duration_ms - Total time including retries
 */
export interface ExecuteWithRetryResult {
  success: boolean;
  attempts: number;
  final_exit_code: number;
  stdout: string;
  stderr: string;
  total_duration_ms: number;
}

// ============================================================================
// Infrastructure Types (Process + Matching)
// ============================================================================

/**
 * Lifecycle states for managed processes
 */
export type ProcessStatus =
  | "STARTING"
  | "RUNNING"
  | "READY"
  | "STOPPED"
  | "FAILED";

/**
 * Information about a managed process
 */
export interface ProcessInfo {
  /** Unique identifier for this process */
  process_id: string;

  /** Original command string */
  command: string;

  /** Current lifecycle state */
  status: ProcessStatus;

  /** Working directory */
  cwd: string;

  /** Unix timestamp when started */
  started_at: number;

  /** OS process ID (undefined before spawn) */
  pid?: number;

  /** Exit code (set when STOPPED or FAILED) */
  exit_code?: number;

  /** Pattern used for ready detection */
  ready_pattern?: string;
}

/**
 * Configuration for ProcessManager
 */
export interface ProcessManagerConfig {
  /** Maximum output buffer lines per process (default: 500) */
  max_buffer_lines: number;

  /** Default timeout for commands (default: 30000) */
  default_timeout_ms: number;

  /** How long to keep stopped processes (default: 300000 = 5min) */
  process_retention_ms: number;
}

/**
 * Events emitted by ProcessManager
 */
export interface ProcessEvents {
  output: (process_id: string, data: string) => void;
  ready: (process_id: string) => void;
  exit: (process_id: string, code: number) => void;
  error: (process_id: string, error: Error) => void;
}

/**
 * How the match was found
 */
export type MatchType = "EXACT" | "NORMALIZED" | "FUZZY";

/**
 * Result of a fuzzy match operation
 */
export interface MatchResult {
  /** Whether a match was found */
  found: boolean;

  /** How the match was determined */
  match_type: MatchType;

  /** Confidence score (0.0 - 1.0) */
  confidence: number;

  /** Starting line number (1-indexed) */
  start_line: number;

  /** Ending line number (1-indexed) */
  end_line: number;

  /** The actual matched text */
  matched_text: string;
}

/**
 * Configuration for FuzzyMatcher
 */
export interface FuzzyMatcherConfig {
  /** Minimum similarity for fuzzy match (default: 0.85) */
  threshold: number;

  /** Search radius around line hint (default: 50) */
  search_radius: number;

  /** Normalize whitespace before comparison (default: true) */
  normalize_whitespace: boolean;
}

// ============================================================================
// File Editing Tool Types
// ============================================================================

/**
 * Schema for smart_replace tool input
 */
export const SmartReplaceInputSchema = z.object({
  file_path: z.string().min(1),
  old_text: z.string(),
  new_text: z.string(),
  start_line_hint: z.number().int().positive().optional(),
  occurrence: z.number().int().positive().optional(),
  fuzzy_threshold: z.number().min(0).max(1).optional(),
  dry_run: z.boolean().optional(),
  /** If true, check for TypeScript/ESLint errors after edit (adds ~500ms delay) */
  validate: z.boolean().optional(),
  /** If true, apply auto-fixes after edit (organize imports, fix lint errors, etc.). Adds ~300ms delay. */
  autofix: z.boolean().optional(),
});

/**
 * Input parameters for smart_replace tool
 * @property file_path - Path to file to edit
 * @property old_text - Text to find and replace (supports fuzzy matching)
 * @property new_text - Replacement text
 * @property start_line_hint - Optional line number to start search
 * @property occurrence - Which occurrence to replace (1-indexed)
 * @property fuzzy_threshold - Minimum similarity for fuzzy match (0.0-1.0)
 * @property dry_run - If true, preview changes without applying
 * @property validate - If true, check for errors after edit (adds ~500ms delay)
 */
export type SmartReplaceInput = z.output<typeof SmartReplaceInputSchema>;

/**
 * Result of smart replace operation
 * @property success - Whether replacement succeeded
 * @property match_type - How match was found (EXACT, NORMALIZED, FUZZY)
 * @property confidence - Match confidence score (0.0-1.0)
 * @property lines_changed - Tuple of [start_line, end_line] that changed
 * @property preview - Optional diff preview of changes
 * @property message - Optional informational message
 */
export interface SmartReplaceResult {
  success: boolean;
  match_type: MatchType;
  confidence: number;
  lines_changed: [number, number];
  preview?: string;
  message?: string;
}

/**
 * Schema for edit_lines tool input
 */
export const EditLinesInputSchema = z.object({
  file_path: z.string().min(1),
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive(),
  new_content: z.string(),
  create_if_missing: z.boolean().optional(),
  preserve_indentation: z.boolean().optional(),
  dry_run: z.boolean().optional(),
  /** If true, check for TypeScript/ESLint errors after edit (adds ~500ms delay) */
  validate: z.boolean().optional(),
  /** If true, apply auto-fixes after edit (organize imports, fix lint errors, etc.). Adds ~300ms delay. */
  autofix: z.boolean().optional(),
});

/**
 * Input parameters for edit_lines tool
 * @property file_path - Path to file to edit
 * @property start_line - First line to replace (1-indexed)
 * @property end_line - Last line to replace (inclusive, 1-indexed)
 * @property new_content - Replacement content
 * @property create_if_missing - If true, create file if it doesn't exist
 * @property preserve_indentation - If true, match surrounding indentation
 * @property dry_run - If true, preview changes without applying
 * @property validate - If true, check for errors after edit (adds ~500ms delay)
 */
export type EditLinesInput = z.output<typeof EditLinesInputSchema>;

/**
 * Result of line-based edit operation
 * @property success - Whether edit succeeded
 * @property file_path - Path to edited file
 * @property lines_replaced - Number of lines replaced
 * @property new_line_count - Number of new lines inserted
 * @property diff_preview - Optional diff preview
 * @property warning - Optional warning message
 */
export interface EditLinesResult {
  success: boolean;
  file_path: string;
  lines_replaced: number;
  new_line_count: number;
  diff_preview?: string;
  warning?: string;
}

/**
 * Schema for insert_at_line tool input
 */
export const InsertAtLineInputSchema = z.object({
  file_path: z.string().min(1),
  line: z.number().int().positive(),
  content: z.string(),
  auto_indent: z.boolean().optional(),
  dry_run: z.boolean().optional(),
  /** If true, apply auto-fixes after insertion (organize imports, fix lint errors, etc.). Adds ~300ms delay. */
  autofix: z.boolean().optional(),
});

/**
 * Input parameters for insert_at_line tool
 * @property file_path - Path to file to modify
 * @property line - Line number to insert at (1-indexed)
 * @property content - Content to insert
 * @property auto_indent - If true, match surrounding indentation
 * @property dry_run - If true, preview insertion without applying
 */
export type InsertAtLineInput = z.output<typeof InsertAtLineInputSchema>;

/**
 * Result of line insertion operation
 * @property success - Whether insertion succeeded
 * @property file_path - Path to modified file
 * @property inserted_at - Line number where content was inserted
 * @property lines_inserted - Number of lines inserted
 * @property diff_preview - Optional diff preview
 */
export interface InsertAtLineResult {
  success: boolean;
  file_path: string;
  inserted_at: number;
  lines_inserted: number;
  diff_preview?: string;
}

/**
 * Schema for delete_section tool input
 */
export const DeleteSectionInputSchema = z.object({
  file_path: z.string().min(1),
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive(),
  dry_run: z.boolean().optional(),
  /** If true, apply auto-fixes after deletion (organize imports, fix lint errors, etc.). Adds ~300ms delay. */
  autofix: z.boolean().optional(),
});

/**
 * Input parameters for delete_section tool
 * @property file_path - Path to file to modify
 * @property start_line - First line to delete (1-indexed)
 * @property end_line - Last line to delete (inclusive, 1-indexed)
 * @property dry_run - If true, preview deletion without applying
 */
export type DeleteSectionInput = z.output<typeof DeleteSectionInputSchema>;

/**
 * Result of section deletion operation
 * @property success - Whether deletion succeeded
 * @property lines_deleted - Number of lines deleted
 * @property start_line - First deleted line number
 * @property end_line - Last deleted line number
 * @property deleted_content - Content that was deleted
 */
export interface DeleteSectionResult {
  success: boolean;
  lines_deleted: number;
  start_line: number;
  end_line: number;
  deleted_content: string;
}

/**
 * Schema for validate_edit tool input
 */
export const ValidateEditInputSchema = z.object({
  file_path: z.string().min(1),
  new_content: z.string(),
  timeout_ms: z.number().int().nonnegative().optional(),
});

/**
 * Input parameters for validate_edit tool
 * @property file_path - Path to file being validated
 * @property new_content - Proposed new file content
 * @property timeout_ms - Validation timeout in milliseconds
 */
export type ValidateEditInput = z.output<typeof ValidateEditInputSchema>;

/**
 * Diagnostic message from syntax validation
 * @property line - Line number (1-indexed)
 * @property column - Column number (1-indexed)
 * @property message - Diagnostic message
 * @property severity - Severity level
 * @property source - Optional diagnostic source (e.g., "typescript")
 */
export interface DiagnosticInfo {
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning" | "info";
  source?: string;
}

/**
 * Result of syntax validation
 * @property syntax_valid - Whether content has valid syntax
 * @property errors - Array of error diagnostics
 * @property warnings - Array of warning diagnostics
 */
export interface ValidateEditResult {
  syntax_valid: boolean;
  errors: DiagnosticInfo[];
  warnings: DiagnosticInfo[];
}

/**
 * Schema for bulk_replace tool input
 */
export const BulkReplaceInputSchema = z.object({
  pattern: z.string().min(1),
  replacement: z.string(),
  is_regex: z.boolean().optional(),
  include_glob: z.string().optional(),
  exclude_glob: z.string().optional(),
  case_sensitive: z.boolean().optional(),
  whole_word: z.boolean().optional(),
  max_files: z.number().int().positive().optional(),
  max_replacements: z.number().int().positive().optional(),
  preview_only: z.boolean().optional(),
});

/**
 * Input parameters for bulk_replace tool
 * @property pattern - Search pattern (literal or regex)
 * @property replacement - Replacement text
 * @property is_regex - If true, treat pattern as regex
 * @property include_glob - Glob pattern for files to include
 * @property exclude_glob - Glob pattern for files to exclude
 * @property case_sensitive - If true, match case exactly
 * @property whole_word - If true, match whole words only
 * @property max_files - Maximum files to modify
 * @property max_replacements - Maximum total replacements
 * @property preview_only - If true, don't apply changes
 */
export type BulkReplaceInput = z.output<typeof BulkReplaceInputSchema>;

/**
 * Information about changes made to a file
 * @property file_path - Path to modified file
 * @property replacements - Number of replacements made
 * @property preview - Optional diff preview
 */
export interface FileChangeInfo {
  file_path: string;
  replacements: number;
  preview?: string;
}

/**
 * Information about file processing error
 * @property file_path - Path to file that failed
 * @property error - Error message
 */
export interface FileErrorInfo {
  file_path: string;
  error: string;
}

/**
 * Result of bulk replacement operation
 * @property success - Whether operation completed successfully
 * @property files_scanned - Total files examined
 * @property files_modified - Files that had replacements
 * @property total_replacements - Sum of all replacements
 * @property changes - Per-file change details
 * @property errors - Files that failed to process
 */
export interface BulkReplaceResult {
  success: boolean;
  files_scanned: number;
  files_modified: number;
  total_replacements: number;
  changes: FileChangeInfo[];
  errors: FileErrorInfo[];
}

// ============================================================================
// Filesystem Tool Types
// ============================================================================

/**
 * Schema for move_file tool input
 */
export const MoveFileInputSchema = z.object({
  source_path: z.string().min(1),
  destination_path: z.string().min(1),
  overwrite: z.boolean().optional(),
});

/**
 * Input parameters for move_file tool
 * @property source_path - Current file path
 * @property destination_path - Target file path
 * @property overwrite - If true, overwrite existing file at destination
 */
export type MoveFileInput = z.output<typeof MoveFileInputSchema>;

/**
 * Result of file move operation
 * @property success - Whether move succeeded
 * @property old_path - Original file path
 * @property new_path - New file path
 * @property directories_created - Whether parent directories were created
 * @property error - Error message if move failed
 */
export interface MoveFileResult {
  success: boolean;
  old_path: string;
  new_path: string;
  directories_created?: boolean;
  error?: string;
}

/**
 * Schema for copy_file tool input
 */
export const CopyFileInputSchema = z.object({
  source_path: z.string().min(1),
  destination_path: z.string().min(1),
  overwrite: z.boolean().optional(),
});

/**
 * Input parameters for copy_file tool
 * @property source_path - Source file path
 * @property destination_path - Destination file path
 * @property overwrite - If true, overwrite existing file at destination
 */
export type CopyFileInput = z.output<typeof CopyFileInputSchema>;

/**
 * Result of file copy operation
 * @property success - Whether copy succeeded
 * @property source_path - Source file path
 * @property destination_path - Destination file path
 * @property directories_created - Whether parent directories were created
 * @property error - Error message if copy failed
 */
export interface CopyFileResult {
  success: boolean;
  source_path: string;
  destination_path: string;
  directories_created?: boolean;
  error?: string;
}

/**
 * Schema for move_directory tool input
 */
export const MoveDirectoryInputSchema = z.object({
  source_path: z.string().min(1),
  destination_path: z.string().min(1),
  overwrite: z.boolean().optional(),
});

/**
 * Input parameters for move_directory tool
 * @property source_path - Current directory path
 * @property destination_path - Target directory path
 * @property overwrite - If true, overwrite existing directory at destination
 */
export type MoveDirectoryInput = z.output<typeof MoveDirectoryInputSchema>;

/**
 * Result of directory move operation
 * @property success - Whether move succeeded
 * @property old_path - Original directory path
 * @property new_path - New directory path
 * @property files_moved - Number of files moved
 * @property directories_moved - Number of subdirectories moved
 * @property error - Error message if move failed
 */
export interface MoveDirectoryResult {
  success: boolean;
  old_path: string;
  new_path: string;
  files_moved: number;
  directories_moved: number;
  error?: string;
}

// ============================================================================
// Tool Invocation Context
// ============================================================================

/**
 * File operation types for observability
 */
export type FileOperationType =
  | "create"
  | "update"
  | "delete"
  | "move"
  | "copy"
  | "read";

/**
 * File operation event data
 */
export interface FileOperationEvent {
  operation: FileOperationType;
  path: string;
  /** Target path for move/copy operations */
  targetPath?: string;
  /** Size in bytes if available */
  size?: number;
  /** Lines affected for edit operations */
  linesChanged?: number;
}

/**
 * Observer for tool execution lifecycle events
 */
export interface ToolObserver {
  /** Called to report progress during tool execution */
  onProgress?(callId: string, message: string, percent?: number): void;
  /** Called when tool produces output chunks (streaming) */
  onOutput?(callId: string, chunk: string): void;
  /** Called when tool performs a file operation */
  onFileOperation?(callId: string, event: FileOperationEvent): void;
  /** Called to report structured metadata during execution */
  onMetadata?(callId: string, key: string, value: unknown): void;
}

/**
 * Context provided to tools during invocation
 * @property workspaceRoot - Absolute path to workspace root
 * @property sessionId - Unique identifier for current agent session
 * @property token - Cancellation token for interrupting long operations
 * @property observer - Optional observer for lifecycle events
 * @property progress - Optional VS Code progress reporter
 */
export interface ToolInvocationContext {
  workspaceRoot: string;
  sessionId: string;
  token: vscode.CancellationToken;
  observer?: ToolObserver;
  progress?: vscode.Progress<{ message?: string; increment?: number }>;
}

/**
 * Messages and prompts to display before tool invocation
 * @property invocationMessage - Message to show when tool is about to execute
 * @property confirmationMessages - Optional confirmation dialog details
 */
export interface PreparedToolInvocation {
  invocationMessage?: string | vscode.MarkdownString;
  confirmationMessages?: {
    title: string;
    message: string | vscode.MarkdownString;
  };
}

// ============================================================================
// Agent Tool Interface
// ============================================================================

/**
 * Interface that all agent tools must implement
 * @template TInput - Type of input parameters accepted by the tool
 * @property name - Unique tool identifier
 * @property description - Human-readable tool description
 * @property inputSchema - JSON Schema defining input structure
 */
export interface AgentTool<TInput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ToolInputSchema;

  /**
   * Execute the tool with provided input
   * @param input - Validated tool input parameters
   * @param context - Execution context with workspace info and cancellation
   * @returns Promise resolving to tool execution result
   */
  invoke(input: TInput, context: ToolInvocationContext): Promise<ToolResult>;

  /**
   * Optional hook to prepare UI messages before invocation
   * @param input - Tool input parameters
   * @param context - Execution context
   * @returns Promise resolving to prepared invocation details
   */
  prepareInvocation?(
    input: TInput,
    context: ToolInvocationContext,
  ): Promise<PreparedToolInvocation>;
}
