# Data Model: Enhanced Agent Tools

**Spec Reference**: [spec.md](spec.md)

---

## Process Management Types

```typescript
// ============================================
// Process Status & State
// ============================================

/**
 * Lifecycle states for managed processes
 */
export type ProcessStatus =
  | "STARTING" // spawn() called, waiting for first output
  | "RUNNING" // Active, receiving output
  | "READY" // ready_pattern matched (for servers)
  | "STOPPED" // Terminated gracefully
  | "FAILED"; // Non-zero exit or crash

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

// ============================================
// Terminal Tool Inputs
// ============================================

/**
 * Input for run_command tool
 */
export interface RunCommandInput {
  /** Command to execute */
  command: string;

  /** Working directory (default: workspace root) */
  cwd?: string;

  /** Timeout in milliseconds (default: 30000) */
  timeout_ms?: number;

  /** Input to send to stdin before execution */
  stdin?: string;

  /** Environment variables to set */
  env?: Record<string, string>;
}

/**
 * Result from run_command tool
 */
export interface RunCommandResult {
  success: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  timed_out: boolean;

  /** Warning message (e.g., shell integration unavailable) */
  warning?: string;
}

/**
 * Input for start_process tool
 */
export interface StartProcessInput {
  /** Command to execute */
  command: string;

  /** Working directory (default: workspace root) */
  cwd?: string;

  /** Regex pattern indicating process is ready */
  ready_pattern?: string;

  /** How long to wait for ready_pattern (default: 30000) */
  ready_timeout_ms?: number;

  /** Environment variables to set */
  env?: Record<string, string>;
}

/**
 * Result from start_process tool
 */
export interface StartProcessResult {
  success: boolean;
  process_id: string;
  status: ProcessStatus;

  /** First lines of output before returning */
  initial_output: string;

  /** Error message if failed */
  error?: string;
}

/**
 * Input for get_process_output tool
 */
export interface GetProcessOutputInput {
  /** Process identifier */
  process_id: string;

  /** Only return lines since last read */
  since_last_read?: boolean;

  /** Maximum lines to return (default: 100) */
  max_lines?: number;

  /** Include ANSI escape codes (default: false) */
  include_ansi?: boolean;
}

/**
 * Result from get_process_output tool
 */
export interface GetProcessOutputResult {
  success: boolean;
  process_id: string;
  status: ProcessStatus;
  output: string;

  /** True if output was truncated */
  truncated: boolean;

  /** Number of lines returned */
  lines_returned: number;

  /** Total lines available */
  total_lines: number;
}

/**
 * Input for stop_process tool
 */
export interface StopProcessInput {
  /** Process identifier */
  process_id: string;

  /** Milliseconds to wait before SIGKILL (default: 5000) */
  graceful_timeout_ms?: number;
}

/**
 * Result from stop_process tool
 */
export interface StopProcessResult {
  success: boolean;
  process_id: string;
  exit_code: number;

  /** True if had to force kill */
  force_killed: boolean;
}

/**
 * Input for send_input tool
 */
export interface SendInputInput {
  /** Process identifier */
  process_id: string;

  /** Text to send to stdin */
  text: string;

  /** Append newline (default: true) */
  press_enter?: boolean;

  /** Special key to send instead of text */
  special_key?: 'ctrl+c' | 'ctrl+d' | 'ctrl+z';
}

/**
 * Result from send_input tool
 */
export interface SendInputResult {
  success: boolean;

  /** Output received after input */
  output_after: string;

  /** Current process status */
  status: ProcessStatus;
}

/**
 * Input for wait_for_pattern tool
 */
export interface WaitForPatternInput {
  /** Process identifier */
  process_id: string;

  /** Regex pattern to wait for */
  pattern: string;

  /** Maximum wait time in milliseconds (default: 30000) */
  timeout_ms?: number;

  /** Check stderr instead of stdout */
  in_stderr?: boolean;
}

/**
 * Result from wait_for_pattern tool
 */
export interface WaitForPatternResult {
  /** Whether pattern was found */
  found: boolean;

  /** The line that matched the pattern */
  matched_line?: string;

  /** Time waited in milliseconds */
  wait_time_ms: number;

  /** True if timeout was exceeded */
  timed_out: boolean;
}

/**
 * Input for find_port_process tool
 */
export interface FindPortProcessInput {
  /** Port number to check */
  port: number;
}

/**
 * Result from find_port_process tool
 */
export interface FindPortProcessResult {
  /** Whether port is in use */
  in_use: boolean;

  /** Our managed process ID (if applicable) */
  process_id?: string;

  /** OS process ID */
  pid?: number;

  /** Command that owns the port */
  command?: string;
}

/**
 * Input for execute_with_retry tool
 */
export interface ExecuteWithRetryInput {
  /** Command to execute */
  command: string;

  /** Working directory */
  cwd?: string;

  /** Maximum retry attempts (default: 3) */
  max_retries?: number;

  /** Delay between retries in milliseconds (default: 1000) */
  retry_delay_ms?: number;

  /** Exit codes considered success (default: [0]) */
  success_exit_codes?: number[];

  /** Regex pattern that indicates success in output */
  success_pattern?: string;

  /** Timeout per attempt in milliseconds (default: 30000) */
  timeout_ms?: number;
}

/**
 * Result from execute_with_retry tool
 */
export interface ExecuteWithRetryResult {
  success: boolean;

  /** Number of attempts made */
  attempts: number;

  /** Final exit code */
  final_exit_code: number;

  stdout: string;
  stderr: string;

  /** Total duration including retries */
  duration_ms: number;
}

// ============================================
// File Editing Types
// ============================================

/**
 * How the match was found
 */
export type MatchType =
  | "EXACT" // Character-for-character match
  | "NORMALIZED" // Matched after whitespace normalization
  | "FUZZY"; // Matched via Levenshtein distance

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
 * Input for smart_replace tool
 */
export interface SmartReplaceInput {
  /** Absolute path to the file */
  file_path: string;

  /** Text to search for */
  old_text: string;

  /** Replacement text */
  new_text: string;

  /** Approximate line number for faster search */
  start_line_hint?: number;

  /** Which occurrence to replace (default: 1) */
  occurrence?: number;

  /** Minimum similarity threshold (default: 0.85) */
  fuzzy_threshold?: number;

  /** Preview without applying changes */
  dry_run?: boolean;
}

/**
 * Result from smart_replace tool
 */
export interface SmartReplaceResult {
  success: boolean;

  /** How the match was found */
  match_type: MatchType;

  /** Confidence score if fuzzy matched */
  confidence: number;

  /** Lines that were changed (1-indexed) */
  lines_changed: [number, number];

  /** Preview of change (in dry_run mode) */
  preview?: {
    before: string;
    after: string;
  };

  /** Error or warning message */
  message?: string;
}

/**
 * Input for edit_lines tool
 */
export interface EditLinesInput {
  /** Absolute path to the file */
  file_path: string;

  /** Starting line number (1-indexed, inclusive) */
  start_line: number;

  /** Ending line number (1-indexed, inclusive) */
  end_line: number;

  /** New content to replace the range */
  new_content: string;

  /** Create file if it doesn't exist */
  create_if_missing?: boolean;
}

/**
 * Result from edit_lines tool
 */
export interface EditLinesResult {
  success: boolean;

  /** Lines removed */
  lines_removed: number;

  /** Lines inserted */
  lines_inserted: number;

  /** Warning message (e.g., file created) */
  warning?: string;
}

/**
 * Input for insert_at_line tool
 */
export interface InsertAtLineInput {
  /** Absolute path to the file */
  file_path: string;

  /** Line number to insert before (1-indexed) */
  line: number;

  /** Content to insert */
  content: string;

  /** Auto-detect and apply indentation (default: true) */
  auto_indent?: boolean;
}

/**
 * Input for delete_section tool
 */
export interface DeleteSectionInput {
  /** Absolute path to the file */
  file_path: string;

  // Line-based targeting:
  /** Starting line number (1-indexed, inclusive) */
  start_line?: number;

  /** Ending line number (1-indexed, inclusive) */
  end_line?: number;

  // OR Pattern-based targeting:
  /** Delete from first line matching this pattern */
  start_pattern?: string;

  /** To first line matching this pattern (inclusive) */
  end_pattern?: string;

  /** Delete the boundary lines too (default: true) */
  include_patterns?: boolean;
}

/**
 * Result from delete_section tool
 */
export interface DeleteSectionResult {
  success: boolean;

  /** Number of lines deleted */
  lines_deleted: number;

  /** Start line of deletion */
  start_line: number;

  /** End line of deletion */
  end_line: number;

  /** Deleted content (for undo capability) */
  deleted_content: string;
}

/**
 * Input for validate_edit tool
 */
export interface ValidateEditInput {
  /** Absolute path to the file */
  file_path: string;

  /** Full proposed file content to validate */
  new_content: string;

  /** Timeout for diagnostic collection (default: 3000) */
  timeout_ms?: number;
}

/**
 * Result from validate_edit tool
 */
export interface ValidateEditResult {
  /** True if no syntax errors */
  syntax_valid: boolean;

  /** Error diagnostics */
  errors: DiagnosticInfo[];

  /** Warning diagnostics */
  warnings: DiagnosticInfo[];
}

/**
 * Diagnostic information from validation
 */
export interface DiagnosticInfo {
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning" | "info";
  source?: string;
}

// ============================================
// Refactoring Types
// ============================================

/**
 * Input for rename_symbol tool
 */
export interface RenameSymbolInput {
  /** Absolute path to the file */
  file_path: string;

  /** Line number of the symbol (1-indexed) */
  line: number;

  /** Column number of the symbol (1-indexed) */
  column: number;

  /** New name for the symbol */
  new_name: string;

  /** Preview changes without applying */
  preview?: boolean;
}

/**
 * Result from rename_symbol tool
 */
export interface RenameSymbolResult {
  success: boolean;

  /** Files that were/would be modified */
  files_modified: FileChange[];

  /** Total occurrences renamed */
  occurrences_renamed: number;

  /** Error message if failed */
  error?: string;
}

/**
 * Information about changes to a single file
 */
export interface FileChange {
  /** Absolute path to the file */
  file_path: string;

  /** Number of changes in this file */
  changes: number;

  /** Line numbers where changes occurred */
  lines: number[];
}

/**
 * Input for find_references tool
 */
export interface FindReferencesInput {
  /** Absolute path to the file */
  file_path: string;

  /** Line number of the symbol (1-indexed) */
  line: number;

  /** Column number of the symbol (1-indexed) */
  column: number;

  /** Include the declaration itself (default: false) */
  include_declaration?: boolean;

  /** Maximum references to return (default: 100) */
  max_results?: number;
}

/**
 * Result from find_references tool
 */
export interface FindReferencesResult {
  success: boolean;

  /** Symbol name that was searched */
  symbol: string;

  /** Grouped by file */
  references: ReferenceGroup[];

  /** Total count */
  total_count: number;

  /** True if results were truncated */
  truncated: boolean;
}

/**
 * References grouped by file
 */
export interface ReferenceGroup {
  file_path: string;
  locations: ReferenceLocation[];
}

/**
 * Single reference location
 */
export interface ReferenceLocation {
  line: number;
  column: number;

  /** Preview of the line containing reference */
  preview: string;
}

/**
 * Input for bulk_replace tool (text/regex based)
 */
export interface BulkReplaceInput {
  /** Text or regex pattern to search for */
  find: string;

  /** Replacement text (supports capture groups: $1, $2, etc.) */
  replace: string;

  /** Treat find as regex pattern (default: false) */
  is_regex?: boolean;

  /** Only match complete words (default: false) */
  whole_word?: boolean;

  /** Case-sensitive matching (default: true) */
  case_sensitive?: boolean;

  /** File glob patterns to include (e.g., "src/**/*.ts") */
  include_patterns?: string[];

  /** File glob patterns to exclude */
  exclude_patterns?: string[];

  /** Preview changes without applying (default: true) */
  preview_only?: boolean;

  /** Maximum total replacements (optional limit) */
  max_replacements?: number;
}

/**
 * Result from bulk_replace tool
 */
export interface BulkReplaceResult {
  success: boolean;

  /** Number of files scanned */
  files_scanned: number;

  /** Number of files with replacements */
  files_modified: number;

  /** Total replacement count */
  total_replacements: number;

  /** Details per file */
  changes: BulkReplaceFileChange[];
}

/**
 * Bulk replace information for a single file
 */
export interface BulkReplaceFileChange {
  file_path: string;
  replacements: number;

  /** Preview of changes (in preview_only mode) */
  diff_preview?: string;
}

// ============================================
// File Operations Types (Basic - No Import Updates)
// ============================================

/**
 * Input for move_file tool (basic, no import updates)
 */
export interface MoveFileInput {
  /** Current absolute path */
  source_path: string;

  /** New absolute path */
  destination_path: string;

  /** Overwrite if destination exists (default: false) */
  overwrite?: boolean;
}

/**
 * Result from move_file tool
 */
export interface MoveFileResult {
  success: boolean;

  /** Original path */
  old_path: string;

  /** New path */
  new_path: string;

  /** True if parent directories were created */
  directories_created?: boolean;

  /** Error message if failed */
  error?: string;
}

/**
 * Input for copy_file tool
 */
export interface CopyFileInput {
  /** Source file absolute path */
  source_path: string;

  /** Destination file absolute path */
  destination_path: string;

  /** Overwrite if destination exists (default: false) */
  overwrite?: boolean;
}

/**
 * Result from copy_file tool
 */
export interface CopyFileResult {
  success: boolean;

  /** Source path (unchanged) */
  source_path: string;

  /** Destination path */
  destination_path: string;

  /** True if parent directories were created */
  directories_created?: boolean;

  /** Error message if failed */
  error?: string;
}

/**
 * Input for move_directory tool
 */
export interface MoveDirectoryInput {
  /** Source directory absolute path */
  source_path: string;

  /** Destination directory absolute path */
  destination_path: string;

  /** Overwrite if destination exists (default: false) */
  overwrite?: boolean;
}

/**
 * Result from move_directory tool
 */
export interface MoveDirectoryResult {
  success: boolean;

  /** Original path */
  old_path: string;

  /** New path */
  new_path: string;

  /** Number of files moved */
  files_moved: number;

  /** Number of directories moved */
  directories_moved: number;

  /** Error message if failed */
  error?: string;
}

// ============================================
// Infrastructure Types
// ============================================

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
```

---

## Database Schema (Optional Enhancement)

If persistent process history is needed:

```sql
-- Track process execution history
CREATE TABLE IF NOT EXISTS process_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  process_id TEXT NOT NULL,
  command TEXT NOT NULL,
  cwd TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  exit_code INTEGER,
  status TEXT NOT NULL,
  ready_pattern TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for recent processes
CREATE INDEX idx_process_history_started
ON process_history(started_at DESC);
```

---

## Type Exports

All types should be exported from:

- `extension/src/agents/tools/types.ts` (new file)

Import pattern:

```typescript
import type {
  ProcessInfo,
  ProcessStatus,
  SmartReplaceInput,
  SmartReplaceResult,
} from "./types.js";
```
