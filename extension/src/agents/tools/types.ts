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
