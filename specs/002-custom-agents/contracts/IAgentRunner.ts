/**
 * Agent Runner Interface
 * 
 * Core interface for executing autonomous agent loops.
 * 
 * @module contracts/IAgentRunner
 */

import type { Disposable } from "vscode";
import type { AgentRole, AgentSession, AgentStatus } from "./types";

/**
 * Output types emitted during agent execution
 */
export type AgentOutputType = 
  | "thinking"      // Agent reasoning text
  | "tool_call"     // Tool invocation started
  | "tool_result"   // Tool execution completed
  | "error"         // Error occurred
  | "status";       // Status change

/**
 * Agent output event
 */
export interface AgentOutput {
  type: AgentOutputType;
  timestamp: string;
  iteration: number;
  
  // For thinking
  text?: string;
  
  // For tool_call
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolCallId?: string;
  
  // For tool_result
  toolResult?: string;
  toolSuccess?: boolean;
  toolDuration?: number;
  
  // For error
  errorCode?: string;
  errorMessage?: string;
  recoverable?: boolean;
  
  // For status
  previousStatus?: AgentStatus;
  newStatus?: AgentStatus;
}

/**
 * Agent state for UI updates
 */
export interface AgentState {
  sessionId: string;
  role: AgentRole;
  status: AgentStatus;
  iteration: number;
  maxIterations: number;
  taskId?: number;
  startedAt: string;
  lastActivityAt: string;
}

/**
 * Options for starting an agent
 */
export interface AgentStartOptions {
  /** Initial prompt/instruction for the agent */
  prompt: string;
  
  /** Task ID (required for implementor) */
  taskId?: number;
  
  /** Sprint ID for context */
  sprintId?: string;
  
  /** Resume from existing session */
  resumeSessionId?: string;
  
  /** Override max iterations */
  maxIterations?: number;
  
  /** Model override */
  model?: string;
}

/**
 * Agent Runner - Executes autonomous agent loops
 */
export interface IAgentRunner {
  /**
   * Start a new agent session
   * 
   * @param role - Agent role (orchestrator or implementor)
   * @param options - Start options
   * @returns The created session
   */
  start(role: AgentRole, options: AgentStartOptions): Promise<AgentSession>;
  
  /**
   * Pause the running agent
   * Agent will complete current step before pausing.
   */
  pause(): Promise<void>;
  
  /**
   * Resume a paused agent
   */
  resume(): Promise<void>;
  
  /**
   * Stop the agent
   * Saves state for potential resume later.
   */
  stop(): Promise<void>;
  
  /**
   * Inject a new instruction into the running agent
   * 
   * @param instruction - New instruction to inject
   */
  redirect(instruction: string): Promise<void>;
  
  /**
   * Get current session
   */
  getSession(): AgentSession | undefined;
  
  /**
   * Get current state for UI
   */
  getState(): AgentState | undefined;
  
  /**
   * Subscribe to output events
   */
  onOutput(callback: (output: AgentOutput) => void): Disposable;
  
  /**
   * Subscribe to state changes
   */
  onStateChange(callback: (state: AgentState) => void): Disposable;
  
  /**
   * Dispose resources
   */
  dispose(): void;
}
