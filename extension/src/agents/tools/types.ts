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
