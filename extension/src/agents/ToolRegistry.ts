/**
 * Tool Registry - Central hub for managing agent tools
 *
 * Handles registration, lookup, and execution of tools with:
 * - Tool registration and lookup by name
 * - Execution with retry logic and timeout support
 * - Conversion to vscode.lm LanguageModelChatTool format
 *
 * @module agents/ToolRegistry
 */

import { randomUUID } from "crypto";
import type { LanguageModelChatTool } from "vscode";
import { ToolExecutionError } from "./errors.js";
import type { ToolInvocationContext, ToolResult } from "./tools/types.js";

export type AgentTool = import("./tools/types.js").AgentTool;

/**
 * Tool execution options
 */
export interface ToolExecutionOptions {
  /** Timeout in milliseconds */
  timeout?: number;

  /** Number of retries on failure */
  retries?: number;

  /** Whether to track file changes */
  trackFileChanges?: boolean;
}

/**
 * Tool execution result with metadata
 */
export interface ToolExecutionResult {
  /** The tool result */
  result: ToolResult;

  /** Execution duration in ms */
  durationMs: number;

  /** Number of retries attempted */
  retryCount: number;

  /** Tool call ID */
  toolCallId: string;
}

/**
 * Tool Registry - Manages agent tools
 *
 * Implements the IToolRegistry interface pattern with:
 * - Map-based storage for O(1) lookup
 * - Retry logic with exponential backoff
 * - Timeout handling with AbortController
 * - Conversion to vscode.lm LanguageModelChatTool format
 */
export class ToolRegistry {
  private tools: Map<string, AgentTool> = new Map();

  /**
   * Clear all registered tools.
   * Call this before loading a new set of role-specific tools.
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * Register a tool
   *
   * @param tool - Tool to register
   * @throws ToolExecutionError if tool with same name already exists
   */
  register(tool: AgentTool): void {
    if (this.tools.has(tool.name)) {
      throw new ToolExecutionError(
        `Tool '${tool.name}' is already registered`,
        tool.name,
      );
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Register multiple tools
   *
   * @param tools - Array of tools to register
   */
  registerAll(tools: AgentTool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Unregister a tool by name
   *
   * @param name - Tool name to remove
   */
  unregister(name: string): void {
    this.tools.delete(name);
  }

  /**
   * Get a tool by name
   *
   * @param name - Tool name to look up
   * @returns Tool if found, undefined otherwise
   */
  get(name: string): AgentTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if tool exists
   *
   * @param name - Tool name to check
   * @returns True if tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * List all registered tools
   *
   * @returns Array of all registered tools
   */
  list(): AgentTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool names
   *
   * @returns Array of all tool names
   */
  names(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get tool definitions for vscode.lm API
   *
   * Converts internal AgentTool format to LanguageModelChatTool format
   * required by the vscode.lm.sendRequest() API.
   *
   * @returns Array of LanguageModelChatTool definitions
   */
  getToolDefinitions(): LanguageModelChatTool[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as LanguageModelChatTool["inputSchema"],
    }));
  }

  /**
   * Execute a tool with retry logic and timeout
   *
   * @param name - Tool name
   * @param input - Tool input
   * @param context - Execution context
   * @param options - Execution options
   * @returns Execution result with metadata
   * @throws ToolExecutionError if tool not found or execution fails after retries
   */
  async execute(
    name: string,
    input: unknown,
    context: ToolInvocationContext,
    options?: ToolExecutionOptions,
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolExecutionError(`Tool '${name}' not found`, name);
    }

    const maxRetries = options?.retries ?? 3;
    const timeout = options?.timeout;
    const toolCallId = randomUUID();
    const startTime = Date.now();

    let lastError: Error | undefined;
    let retryCount = 0;

    // Try execution with retries
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const rawResult = timeout
          ? await this.executeWithTimeout(tool, input, context, timeout)
          : await tool.invoke(input, context);

        const durationMs = Date.now() - startTime;
        const result: ToolResult = {
          ...rawResult,
          metadata: {
            ...rawResult.metadata,
            toolName: tool.name,
            callId: toolCallId,
            durationMs,
            retryCount,
          },
        };

        return {
          result,
          durationMs,
          retryCount,
          toolCallId,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // If this was the last attempt, throw
        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff: 100ms, 200ms, 400ms, ...
        const backoffMs = 100 * Math.pow(2, attempt);
        await this.sleep(backoffMs);

        retryCount++;
      }
    }

    // All retries exhausted
    const durationMs = Date.now() - startTime;
    throw new ToolExecutionError(
      `Tool '${name}' failed after ${maxRetries + 1} attempts: ${
        lastError?.message
      }`,
      name,
      {
        retryCount,
        durationMs,
        toolCallId,
        lastError: lastError?.message,
      },
    );
  }

  /**
   * Execute tool with timeout using AbortController pattern
   *
   * @param tool - Tool to execute
   * @param input - Tool input
   * @param context - Execution context
   * @param timeoutMs - Timeout in milliseconds
   * @returns Tool result
   * @throws Error if timeout exceeded
   */
  private async executeWithTimeout(
    tool: AgentTool,
    input: unknown,
    context: ToolInvocationContext,
    timeoutMs: number,
  ): Promise<ToolResult> {
    return Promise.race([
      tool.invoke(input, context),
      this.createTimeoutPromise(timeoutMs, tool.name),
    ]);
  }

  /**
   * Create a promise that rejects after timeout
   *
   * @param timeoutMs - Timeout in milliseconds
   * @param toolName - Tool name for error message
   * @returns Promise that rejects on timeout
   */
  private createTimeoutPromise(
    timeoutMs: number,
    toolName: string,
  ): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Tool '${toolName}' execution timed out after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
    });
  }

  /**
   * Sleep utility for backoff delays
   *
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get tools by category
   *
   * @param category - Tool category to filter by
   * @returns Array of tools in the specified category
   */
  getByCategory(category: "coding" | "orchestra" | "system"): AgentTool[] {
    // Category filtering based on tool name prefix convention:
    // - coding: edit_file, read_file, etc.
    // - orchestra: get_current_task, signal_completion, etc.
    // - system: run_command, etc.
    return this.list().filter((tool) => {
      const name = tool.name.toLowerCase();
      switch (category) {
        case "coding":
          return (
            name.includes("file") ||
            name.includes("edit") ||
            name.includes("read") ||
            name.includes("write")
          );
        case "orchestra":
          return (
            name.includes("task") ||
            name.includes("signal") ||
            name.includes("feedback") ||
            name.includes("escalate")
          );
        case "system":
          return (
            name.includes("command") ||
            name.includes("run") ||
            name.includes("execute")
          );
        default:
          return false;
      }
    });
  }
}
