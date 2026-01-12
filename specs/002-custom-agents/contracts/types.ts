/**
 * Shared Type Definitions
 * 
 * Common types used across agent contracts.
 * 
 * @module contracts/types
 */

/**
 * Agent roles
 */
export type AgentRole = "orchestrator" | "implementor";

/**
 * Agent execution status
 */
export type AgentStatus = 
  | "running"     // Actively executing
  | "paused"      // User paused, can resume
  | "stopped"     // User stopped, can resume later
  | "completed"   // Task finished successfully
  | "failed";     // Unrecoverable error

/**
 * File operation types
 */
export type FileOperation = "create" | "modify" | "delete";

/**
 * Message roles in conversation
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * Tool input schema (JSON Schema subset)
 */
export interface ToolInputSchema {
  type: "object";
  properties: Record<string, {
    type: string;
    description?: string;
    default?: unknown;
    enum?: string[];
  }>;
  required?: string[];
}

/**
 * Tool execution context
 */
export interface ToolContext {
  /** Workspace root path */
  workspaceRoot: string;
  
  /** Current session ID */
  sessionId: string;
  
  /** Current iteration number */
  iteration: number;
  
  /** Cancellation token for abort */
  cancellationToken: unknown;
  
  /** Logger instance */
  logger: unknown;
  
  /** Database client */
  db: unknown;
  
  /** File change tracker */
  fileTracker?: unknown;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  /** Whether execution succeeded */
  success: boolean;
  
  /** Output to return to LLM */
  output: string;
  
  /** Error message if failed */
  error?: string;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Agent message in conversation
 */
export interface AgentMessage {
  id: string;
  role: MessageRole;
  content: string | MessageContentPart[];
  timestamp: string;
  iteration: number;
  toolCallIds?: string[];
}

/**
 * Message content part (for multi-part messages)
 */
export type MessageContentPart = 
  | { type: "text"; value: string }
  | { type: "toolCall"; toolCallId: string }
  | { type: "toolResult"; toolCallId: string; value: string };

/**
 * File change record
 */
export interface FileChange {
  id: string;
  uri: string;
  relativePath: string;
  operation: FileOperation;
  previousContent: string | null;
  previousContentHash: string | null;
  newContent: string | null;
  newContentHash: string | null;
  toolCallId: string;
  timestamp: string;
  iteration: number;
  undone: boolean;
  undoneAt: string | null;
}

/**
 * Agent session state
 */
export interface AgentSession {
  version: "1.0";
  id: string;
  role: AgentRole;
  taskId: number | null;
  sprintId: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  currentIteration: number;
  maxIterations: number;
  messages: AgentMessage[];
  toolCalls: ToolCall[];
  fileChanges: FileChange[];
  checkpoints: CheckpointReference[];
  lastCheckpointId: string | null;
  recoveryInfo: RecoveryInfo;
}

/**
 * Tool call record
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  status: "pending" | "success" | "error";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  iteration: number;
  messageId: string;
  error?: ToolCallError;
}

/**
 * Tool call error
 */
export interface ToolCallError {
  code: string;
  message: string;
  recoverable: boolean;
  stack?: string;
}

/**
 * Checkpoint reference
 */
export interface CheckpointReference {
  id: string;
  iteration: number;
  position: "start" | "end";
  toolCallId: string | null;
  filePath: string;
  fileSize: number;
  createdAt: string;
}

/**
 * Recovery information
 */
export interface RecoveryInfo {
  canResume: boolean;
  resumeFromIteration: number | null;
  resumeFromToolCall: string | null;
  failureReason: string | null;
}

/**
 * Verbosity levels for output
 */
export type VerbosityLevel = "minimal" | "normal" | "detailed" | "debug";

/**
 * Agent configuration
 */
export interface AgentConfiguration {
  orchestratorModel: string;
  implementorModel: string;
  maxIterations: number;
  maxToolRetries: number;
  verbosity: VerbosityLevel;
  compactionThreshold: number;
  maxContextTokens: number;
  summarizeAfterToolCalls: number;
}
