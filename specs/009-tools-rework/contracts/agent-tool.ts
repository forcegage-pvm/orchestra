/**
 * AgentTool Interface Contract
 *
 * All agent tools must implement this interface.
 * This is a reference contract - actual implementation in extension/src/agents/tools/types.ts
 */

import type * as vscode from "vscode";
import type { ToolObserver, ToolResult } from "./tool-result";

/**
 * Tool input schema (JSON Schema subset for LLM tool calling)
 */
export interface ToolInputSchema {
  type: "object";
  properties: Record<
    string,
    {
      type: string;
      description?: string;
      default?: unknown;
      enum?: string[];
    }
  >;
  required?: string[];
}

/**
 * Context passed to every tool invocation
 */
export interface ToolInvocationContext {
  /** Workspace root absolute path */
  workspaceRoot: string;

  /** Agent session identifier */
  sessionId: string;

  /** VS Code cancellation token - tools MUST check periodically */
  token: vscode.CancellationToken;

  /** Optional observer for progress/output (deferred to observability sprint) */
  observer?: ToolObserver;

  /** Optional progress reporter for UI feedback */
  progress?: vscode.Progress<{ message?: string; increment?: number }>;
}

/**
 * Prepared tool invocation for confirmation UI
 */
export interface PreparedToolInvocation {
  /** Message shown to user before invocation */
  invocationMessage?: string | vscode.MarkdownString;

  /** Confirmation dialog content */
  confirmationMessages?: {
    title: string;
    message: string | vscode.MarkdownString;
  };
}

/**
 * Agent Tool Interface
 *
 * All tools must implement invoke().
 * prepareInvocation() is optional for tools requiring user confirmation.
 *
 * Implementation Requirements:
 * 1. Check token.isCancellationRequested at natural breakpoints
 * 2. Return structured ToolResult (never throw for expected errors)
 * 3. Accept optional observer without requiring it
 * 4. Validate paths are within workspace for file operations
 */
export interface AgentTool<TInput = unknown> {
  /**
   * Unique tool name (kebab-case)
   * Examples: 'read-file', 'edit-file', 'run-terminal'
   */
  readonly name: string;

  /**
   * Human-readable description for LLM context
   * Should explain what the tool does and when to use it
   */
  readonly description: string;

  /**
   * JSON Schema for input parameters
   * Used by LLM for tool calling and input validation
   */
  readonly inputSchema: ToolInputSchema;

  /**
   * Execute the tool
   *
   * @param input - Validated input matching inputSchema
   * @param context - Execution context with workspace, session, cancellation
   * @returns Promise resolving to structured ToolResult
   *
   * MUST NOT throw for expected errors - return ToolResult with success=false
   * MAY throw for unexpected/unrecoverable errors (will be caught by registry)
   */
  invoke(input: TInput, context: ToolInvocationContext): Promise<ToolResult>;

  /**
   * Optional: Prepare invocation for confirmation UI
   *
   * Called before invoke() when user confirmation is needed.
   * Return confirmation messages to show user before proceeding.
   */
  prepareInvocation?(
    input: TInput,
    context: ToolInvocationContext,
  ): Promise<PreparedToolInvocation>;
}

/**
 * Tool factory function type
 * Used to create tools with dependencies injected
 */
export type ToolFactory<TInput = unknown> = () => AgentTool<TInput>;
