/**
 * Tool Type System (Zod Schemas + TypeScript Types)
 */

import type * as vscode from "vscode";
import { z } from "zod";

import { ToolErrorCode } from "./errors.js";

// ============================================================================
// Tool Input Schema
// ============================================================================

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
export type ToolInputSchema = z.output<typeof ToolInputSchemaSchema>;

// ============================================================================
// Tool Result Types
// ============================================================================

export const ToolErrorCodeSchema = z.nativeEnum(ToolErrorCode);
export type ToolErrorCode = z.output<typeof ToolErrorCodeSchema>;

export const ToolErrorSchema = z.object({
  code: ToolErrorCodeSchema,
  message: z.string().min(1),
  suggestion: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});
export type ToolError = z.output<typeof ToolErrorSchema>;

export const ToolResultContentSchema = z.object({
  type: z.enum(["text", "json", "data", "error"]),
  value: z.string(),
  mimeType: z.string().optional(),
});
export type ToolResultContent = z.output<typeof ToolResultContentSchema>;

export const ToolMetadataSchema = z.object({
  toolName: z.string().min(1),
  callId: z.string().uuid(),
  durationMs: z.number().int().nonnegative(),
  inputHash: z.string().optional(),
  outputTruncated: z.boolean().optional(),
  warnings: z.array(z.string()).optional(),
  retryCount: z.number().int().nonnegative().optional(),
});
export type ToolMetadata = z.output<typeof ToolMetadataSchema>;

export const ToolResultSchema = z.object({
  success: z.boolean(),
  content: z.array(ToolResultContentSchema),
  error: ToolErrorSchema.optional(),
  metadata: ToolMetadataSchema,
});
export type ToolResult = z.output<typeof ToolResultSchema>;

// ============================================================================
// Terminal Tool Types
// ============================================================================

export const RunCommandInputSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeout_ms: z.number().int().nonnegative().optional(),
  stdin: z.string().optional(),
  env: z.record(z.string()).optional(),
});
export type RunCommandInput = z.output<typeof RunCommandInputSchema>;

export interface RunCommandResult {
  success: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  timed_out: boolean;
  warning?: string;
}

export const StartProcessInputSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  ready_pattern: z.string().optional(),
  ready_timeout_ms: z.number().int().nonnegative().optional(),
  env: z.record(z.string()).optional(),
});
export type StartProcessInput = z.output<typeof StartProcessInputSchema>;

export interface StartProcessResult {
  success: boolean;
  process_id: string;
  status: ProcessStatus;
  initial_output: string;
  error?: string;
}

export const GetProcessOutputInputSchema = z.object({
  process_id: z.string().min(1),
  since_last_read: z.boolean().optional(),
  max_lines: z.number().int().positive().optional(),
  include_ansi: z.boolean().optional(),
});
export type GetProcessOutputInput = z.output<
  typeof GetProcessOutputInputSchema
>;

export interface GetProcessOutputResult {
  success: boolean;
  process_id: string;
  status: ProcessStatus;
  output: string;
  truncated: boolean;
  lines_returned: number;
  total_lines: number;
}

export const StopProcessInputSchema = z.object({
  process_id: z.string().min(1),
  graceful_timeout_ms: z.number().int().nonnegative().optional(),
});
export type StopProcessInput = z.output<typeof StopProcessInputSchema>;

export interface StopProcessResult {
  success: boolean;
  process_id: string;
  exit_code?: number;
  force_killed: boolean;
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

export const SmartReplaceInputSchema = z.object({
  file_path: z.string().min(1),
  old_text: z.string(),
  new_text: z.string(),
  start_line_hint: z.number().int().positive().optional(),
  occurrence: z.number().int().positive().optional(),
  fuzzy_threshold: z.number().min(0).max(1).optional(),
  dry_run: z.boolean().optional(),
});
export type SmartReplaceInput = z.output<typeof SmartReplaceInputSchema>;

export interface SmartReplaceResult {
  success: boolean;
  match_type: MatchType;
  confidence: number;
  lines_changed: [number, number];
  preview?: string;
  message?: string;
}

export const EditLinesInputSchema = z.object({
  file_path: z.string().min(1),
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive(),
  new_content: z.string(),
  create_if_missing: z.boolean().optional(),
  preserve_indentation: z.boolean().optional(),
  dry_run: z.boolean().optional(),
});
export type EditLinesInput = z.output<typeof EditLinesInputSchema>;

export interface EditLinesResult {
  success: boolean;
  file_path: string;
  lines_replaced: number;
  new_line_count: number;
  diff_preview?: string;
  warning?: string;
}

export const InsertAtLineInputSchema = z.object({
  file_path: z.string().min(1),
  line: z.number().int().positive(),
  content: z.string(),
  auto_indent: z.boolean().optional(),
  dry_run: z.boolean().optional(),
});
export type InsertAtLineInput = z.output<typeof InsertAtLineInputSchema>;

export interface InsertAtLineResult {
  success: boolean;
  file_path: string;
  inserted_at: number;
  lines_inserted: number;
  diff_preview?: string;
}

export const DeleteSectionInputSchema = z.object({
  file_path: z.string().min(1),
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive(),
  dry_run: z.boolean().optional(),
});
export type DeleteSectionInput = z.output<typeof DeleteSectionInputSchema>;

export interface DeleteSectionResult {
  success: boolean;
  lines_deleted: number;
  start_line: number;
  end_line: number;
  deleted_content: string;
}

export const ValidateEditInputSchema = z.object({
  file_path: z.string().min(1),
  new_content: z.string(),
  timeout_ms: z.number().int().nonnegative().optional(),
});
export type ValidateEditInput = z.output<typeof ValidateEditInputSchema>;

export interface DiagnosticInfo {
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning" | "info";
  source?: string;
}

export interface ValidateEditResult {
  syntax_valid: boolean;
  errors: DiagnosticInfo[];
  warnings: DiagnosticInfo[];
}

// ============================================================================
// Tool Invocation Context
// ============================================================================

export interface ToolObserver {
  onProgress?(callId: string, message: string, percent?: number): void;
  onOutput?(callId: string, chunk: string): void;
}

export interface ToolInvocationContext {
  workspaceRoot: string;
  sessionId: string;
  token: vscode.CancellationToken;
  observer?: ToolObserver;
  progress?: vscode.Progress<{ message?: string; increment?: number }>;
}

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

export interface AgentTool<TInput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ToolInputSchema;

  invoke(input: TInput, context: ToolInvocationContext): Promise<ToolResult>;

  prepareInvocation?(
    input: TInput,
    context: ToolInvocationContext,
  ): Promise<PreparedToolInvocation>;
}
