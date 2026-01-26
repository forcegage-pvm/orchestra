/**
 * Agent Type Definitions with Zod Schemas
 *
 * Foundational type system for custom AI coding agents.
 * Follows "Types from Zod" pattern: define schemas, infer types via z.output<typeof Schema>
 *
 * @module agents/types
 */

import { z } from "zod";

// ============================================================================
// Agent Role and Status
// ============================================================================

/**
 * Agent role enum - aligns with Orchestra orchestrator/implementor/controller pattern
 * Extended for Controller Agent: independent spec review role
 */
export const AgentRoleSchema = z.enum([
  "orchestrator",
  "implementor",
  "controller",
]);
export type AgentRole = z.output<typeof AgentRoleSchema>;

/**
 * Agent execution status - supports pause/resume workflow
 */
export const AgentStatusSchema = z.enum([
  "running", // Actively executing
  "paused", // User paused, can resume
  "stopped", // User stopped, can resume later
  "completed", // Task finished successfully
  "failed", // Unrecoverable error
]);
export type AgentStatus = z.output<typeof AgentStatusSchema>;

// ============================================================================
// Tool System
// ============================================================================

/**
 * Tool input schema (JSON Schema subset for LLM tool calling)
 */
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

/**
 * Tool execution context passed to every tool handler
 */
export const ToolContextSchema = z.object({
  workspaceRoot: z.string(),
  sessionId: z.string(),
  iteration: z.number().int().nonnegative(),
  cancellationToken: z.unknown(),
  logger: z.unknown(),
  db: z.unknown(),
  fileTracker: z.unknown().optional(),
});
export type ToolContext = z.output<typeof ToolContextSchema>;

/**
 * Tool execution result - standard success/error response
 */
export const ToolResultSchema = z.object({
  success: z.boolean(),
  output: z.string(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type ToolResult = z.output<typeof ToolResultSchema>;

/**
 * Tool definition for registration
 */
export const ToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: ToolInputSchemaSchema,
  handler: z
    .function()
    .args(z.unknown(), ToolContextSchema)
    .returns(z.promise(ToolResultSchema)),
});
export type ToolDefinition = z.output<typeof ToolDefinitionSchema>;

// ============================================================================
// Agent Configuration
// ============================================================================

/**
 * Verbosity levels for agent output
 */
export const VerbosityLevelSchema = z.enum([
  "minimal", // Tool calls and results only
  "normal", // + High-level progress
  "detailed", // + Detailed reasoning
  "debug", // + Token counts, timing, raw messages
]);
export type VerbosityLevel = z.output<typeof VerbosityLevelSchema>;

/**
 * Agent configuration settings
 */
export const AgentConfigSchema = z.object({
  // Model selection
  orchestratorModel: z.string().default("claude-opus-4.5"),
  implementorModel: z.string().default("claude-sonnet-4.5"),
  controllerModel: z.string().default("claude-opus-4.5"),

  // Execution limits
  maxIterations: z.number().int().positive().default(50),
  maxToolRetries: z.number().int().positive().default(3),

  // Output control
  verbosity: VerbosityLevelSchema.default("normal"),

  // Context management
  compactionThreshold: z.number().int().positive().default(5),
  maxContextTokens: z.number().int().positive().default(100000),
  summarizeAfterToolCalls: z.number().int().positive().default(20),
});
export type AgentConfig = z.output<typeof AgentConfigSchema>;

// ============================================================================
// Message System
// ============================================================================

/**
 * Message roles in conversation
 */
export const MessageRoleSchema = z.enum(["user", "assistant", "system"]);
export type MessageRole = z.output<typeof MessageRoleSchema>;

/**
 * Message content part (for multi-part messages)
 */
export const MessageContentPartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), value: z.string() }),
  z.object({ type: z.literal("toolCall"), toolCallId: z.string() }),
  z.object({
    type: z.literal("toolResult"),
    toolCallId: z.string(),
    value: z.string(),
  }),
]);
export type MessageContentPart = z.output<typeof MessageContentPartSchema>;

/**
 * Agent message in conversation history
 */
export const AgentMessageSchema = z.object({
  id: z.string().uuid(),
  role: MessageRoleSchema,
  content: z.union([z.string(), z.array(MessageContentPartSchema)]),
  timestamp: z.string().datetime(),
  iteration: z.number().int().nonnegative(),
  toolCallIds: z.array(z.string()).optional(),
});
export type AgentMessage = z.output<typeof AgentMessageSchema>;

// ============================================================================
// Tool Calls
// ============================================================================

/**
 * Tool call status
 */
export const ToolCallStatusSchema = z.enum(["pending", "success", "error"]);
export type ToolCallStatus = z.output<typeof ToolCallStatusSchema>;

/**
 * Tool call error details
 */
export const ToolCallErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  recoverable: z.boolean(),
  stack: z.string().optional(),
});
export type ToolCallError = z.output<typeof ToolCallErrorSchema>;

/**
 * Tool call record
 */
export const ToolCallSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  arguments: z.record(z.unknown()),
  result: z.unknown().optional(),
  status: ToolCallStatusSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  iteration: z.number().int().nonnegative(),
  messageId: z.string(),
  error: ToolCallErrorSchema.optional(),
});
export type ToolCall = z.output<typeof ToolCallSchema>;

// ============================================================================
// File Changes
// ============================================================================

/**
 * File operation types
 */
export const FileOperationSchema = z.enum(["create", "modify", "delete"]);
export type FileOperation = z.output<typeof FileOperationSchema>;

/**
 * File change record for undo capability
 */
export const FileChangeSchema = z.object({
  id: z.string().uuid(),
  uri: z.string(),
  relativePath: z.string(),
  operation: FileOperationSchema,
  previousContent: z.string().nullable(),
  previousContentHash: z.string().nullable(),
  newContent: z.string().nullable(),
  newContentHash: z.string().nullable(),
  toolCallId: z.string(),
  timestamp: z.string().datetime(),
  iteration: z.number().int().nonnegative(),
  undone: z.boolean(),
  undoneAt: z.string().datetime().nullable(),
});
export type FileChange = z.output<typeof FileChangeSchema>;

// ============================================================================
// Checkpoints
// ============================================================================

/**
 * Checkpoint reference in session
 */
export const CheckpointReferenceSchema = z.object({
  id: z.string().uuid(),
  iteration: z.number().int().nonnegative(),
  position: z.enum(["start", "end"]),
  toolCallId: z.string().nullable(),
  filePath: z.string(),
  fileSize: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});
export type CheckpointReference = z.output<typeof CheckpointReferenceSchema>;

/**
 * Checkpoint file content for recovery
 */
export const CheckpointContentSchema = z.object({
  sessionId: z.string().uuid(),
  iteration: z.number().int().nonnegative(),
  position: z.enum(["start", "end"]),
  messageCount: z.number().int().nonnegative(),
  toolCallCount: z.number().int().nonnegative(),
  fileChangeCount: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
  role: AgentRoleSchema.optional(),
  sprintId: z.string().optional(),
  taskId: z.number().int().positive().nullable().optional(),
  maxIterations: z.number().int().positive().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  lastActivityAt: z.string().datetime().optional(),
  messages: z.array(AgentMessageSchema).optional(),
  toolCalls: z.array(ToolCallSchema).optional(),
  fileChanges: z.array(FileChangeSchema).optional(),
});
export type CheckpointContent = z.output<typeof CheckpointContentSchema>;

// ============================================================================
// Recovery Information
// ============================================================================

/**
 * Recovery information for session resume
 */
export const RecoveryInfoSchema = z.object({
  canResume: z.boolean(),
  resumeFromIteration: z.number().int().nonnegative().nullable(),
  resumeFromToolCall: z.string().nullable(),
  failureReason: z.string().nullable(),
});
export type RecoveryInfo = z.output<typeof RecoveryInfoSchema>;

// ============================================================================
// Agent Session
// ============================================================================

/**
 * Agent session state - full session tracking
 */
export const AgentSessionSchema = z.object({
  version: z.literal("1.0"),

  // Identity
  id: z.string().uuid(),
  role: AgentRoleSchema,
  taskId: z.number().int().positive().nullable(),
  sprintId: z.string(),

  // Lifecycle
  status: AgentStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),

  // Execution tracking
  currentIteration: z.number().int().nonnegative(),
  maxIterations: z.number().int().positive(),

  // Conversation and actions
  messages: z.array(AgentMessageSchema),
  toolCalls: z.array(ToolCallSchema),
  fileChanges: z.array(FileChangeSchema),

  // Checkpoints
  checkpoints: z.array(CheckpointReferenceSchema),
  lastCheckpointId: z.string().nullable(),

  // Recovery
  recoveryInfo: RecoveryInfoSchema,
});
export type AgentSession = z.output<typeof AgentSessionSchema>;

// ============================================================================
// Session Metadata
// ============================================================================

/**
 * Lightweight metadata for listing sessions (recovery UI)
 */
export const SessionMetadataSchema = z.object({
  id: z.string().uuid(),
  role: AgentRoleSchema,
  status: AgentStatusSchema,
  taskId: z.number().int().positive().nullable(),
  sprintId: z.string(),
  updatedAt: z.string().datetime(),
  lastActivityAt: z.string().datetime(),
  currentIteration: z.number().int().nonnegative(),
});
export type SessionMetadata = z.output<typeof SessionMetadataSchema>;
