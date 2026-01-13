/**
 * Tool Registry Interface
 * 
 * Manages registration and execution of agent tools.
 * 
 * @module contracts/IToolRegistry
 */

import type { LanguageModelChatTool } from "vscode";
import type { ToolContext, ToolResult, ToolInputSchema } from "./types";

/**
 * Tool definition for registration
 */
export interface AgentTool {
  /** Unique tool name */
  name: string;
  
  /** Human-readable description for LLM */
  description: string;
  
  /** JSON Schema for input parameters */
  inputSchema: ToolInputSchema;
  
  /** 
   * Execute the tool
   * 
   * @param input - Parsed input from LLM
   * @param context - Execution context
   * @returns Tool result
   */
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}

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
 */
export interface IToolRegistry {
  /**
   * Register a tool
   * 
   * @param tool - Tool to register
   * @throws If tool with same name already exists
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
   * Get tool definitions for vscode.lm API
   */
  getToolDefinitions(): LanguageModelChatTool[];
  
  /**
   * Execute a tool
   * 
   * @param name - Tool name
   * @param input - Tool input
   * @param context - Execution context
   * @param options - Execution options
   * @returns Execution result with metadata
   */
  execute(
    name: string,
    input: unknown,
    context: ToolContext,
    options?: ToolExecutionOptions
  ): Promise<ToolExecutionResult>;
  
  /**
   * Get tools by category
   */
  getByCategory(category: "coding" | "orchestra" | "system"): AgentTool[];
  
  /**
   * Get tool names
   */
  names(): string[];
}
