/**
 * ToolRegistry Contract
 *
 * Central registry for managing agent tools with execution, timeout, and retry logic.
 * This is a reference contract - actual implementation in extension/src/agents/ToolRegistry.ts
 */

import type { AgentTool, ToolInvocationContext } from "./agent-tool";
import type { ToolResult } from "./tool-result";

/**
 * Tool execution options
 */
export interface ToolExecutionOptions {
  /**
   * Timeout in milliseconds
   * Default: 30000 (30s) for file ops, 240000 (240s) for terminal ops
   */
  timeout?: number;

  /**
   * Number of retries on transient failures
   * Default: 3
   */
  retries?: number;
}

/**
 * Tool execution result with metadata
 */
export interface ToolExecutionResult {
  /** The tool result */
  result: ToolResult;

  /** Execution duration in ms (including retries) */
  durationMs: number;

  /** Number of retries attempted (0 = first attempt succeeded) */
  retryCount: number;

  /** Unique tool call ID (UUID) */
  toolCallId: string;
}

/**
 * ToolRegistry Interface
 *
 * Manages registration, lookup, and execution of agent tools.
 */
export interface IToolRegistry {
  /**
   * Clear all registered tools
   * Call before loading role-specific tools
   */
  clear(): void;

  /**
   * Register a single tool
   * @throws if tool with same name already registered
   */
  register(tool: AgentTool): void;

  /**
   * Register multiple tools
   */
  registerAll(tools: AgentTool[]): void;

  /**
   * Unregister a tool by name
   */
  unregister(name: string): void;

  /**
   * Get a tool by name
   */
  get(name: string): AgentTool | undefined;

  /**
   * Check if tool exists
   */
  has(name: string): boolean;

  /**
   * List all registered tools
   */
  list(): AgentTool[];

  /**
   * Get tool names
   */
  names(): string[];

  /**
   * Execute a tool with retry logic and timeout
   *
   * @param name - Tool name
   * @param input - Tool input (validated against inputSchema)
   * @param context - Execution context
   * @param options - Timeout and retry configuration
   * @returns Execution result with populated metadata
   * @throws ToolExecutionError if tool not found or all retries exhausted
   */
  execute(
    name: string,
    input: unknown,
    context: ToolInvocationContext,
    options?: ToolExecutionOptions,
  ): Promise<ToolExecutionResult>;
}

/**
 * Default timeout values by tool category
 */
export const DEFAULT_TIMEOUTS = {
  /** File operations (read, edit, create, delete, list) */
  FILE_OPS: 30_000,

  /** Terminal operations (run-terminal, get-terminal-output) */
  TERMINAL_OPS: 240_000,

  /** Task operations (run-task) */
  TASK_OPS: 240_000,

  /** Search operations (grep, search, find-usages) */
  SEARCH_OPS: 60_000,
} as const;

/**
 * Tool categories for timeout selection
 */
export const TOOL_CATEGORIES: Record<string, keyof typeof DEFAULT_TIMEOUTS> = {
  "read-file": "FILE_OPS",
  "edit-file": "FILE_OPS",
  "create-file": "FILE_OPS",
  "delete-file": "FILE_OPS",
  "list-directory": "FILE_OPS",
  "create-directory": "FILE_OPS",
  "search-files": "SEARCH_OPS",
  "grep-search": "SEARCH_OPS",
  "find-usages": "SEARCH_OPS",
  "run-terminal": "TERMINAL_OPS",
  "get-terminal-output": "TERMINAL_OPS",
  "run-task": "TASK_OPS",
  "run-tests": "TASK_OPS",
  "get-problems": "FILE_OPS",
};
