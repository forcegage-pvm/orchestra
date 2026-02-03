/**
 * Unit tests for agent type definitions and Zod schemas
 */

import { describe, expect, it } from "vitest";
import {
  AgentConfigSchema,
  AgentMessageSchema,
  AgentRoleSchema,
  AgentSessionSchema,
  AgentStatusSchema,
  CheckpointReferenceSchema,
  FileChangeSchema,
  FileOperationSchema,
  MessageContentPartSchema,
  MessageRoleSchema,
  RecoveryInfoSchema,
  ToolCallErrorSchema,
  ToolCallSchema,
  ToolCallStatusSchema,
  ToolContextSchema,
  ToolDefinitionSchema,
  ToolInputSchemaSchema,
  ToolResultSchema,
  VerbosityLevelSchema,
  type AgentConfig,
  type AgentMessage,
  type AgentRole,
  type AgentSession,
  type AgentStatus,
  type FileChange,
  type MessageRole,
  type ToolCall,
  type ToolContext,
  type ToolInputSchema,
  type ToolResult,
  type VerbosityLevel,
} from "../../src/agents/types.js";

describe("Agent Type Definitions", () => {
  describe("AgentRoleSchema", () => {
    it("should accept valid orchestrator role", () => {
      const result = AgentRoleSchema.safeParse("orchestrator");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("orchestrator");
      }
    });

    it("should accept valid implementor role", () => {
      const result = AgentRoleSchema.safeParse("implementor");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("implementor");
      }
    });

    it("should reject invalid role", () => {
      const result = AgentRoleSchema.safeParse("invalid");
      expect(result.success).toBe(false);
    });

    it("should export TypeScript type", () => {
      const role: AgentRole = "orchestrator";
      expect(role).toBe("orchestrator");
    });
  });

  describe("AgentStatusSchema", () => {
    it("should accept all valid statuses", () => {
      const statuses = ["running", "paused", "stopped", "completed", "failed"];
      statuses.forEach((status) => {
        const result = AgentStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      });
    });

    it("should reject invalid status", () => {
      const result = AgentStatusSchema.safeParse("invalid");
      expect(result.success).toBe(false);
    });

    it("should export TypeScript type", () => {
      const status: AgentStatus = "running";
      expect(status).toBe("running");
    });
  });

  describe("ToolInputSchemaSchema", () => {
    it("should accept valid tool input schema", () => {
      const schema: ToolInputSchema = {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "The name",
          },
          count: {
            type: "number",
            default: 0,
          },
        },
        required: ["name"],
      };
      const result = ToolInputSchemaSchema.safeParse(schema);
      expect(result.success).toBe(true);
    });

    it("should accept schema without required field", () => {
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      };
      const result = ToolInputSchemaSchema.safeParse(schema);
      expect(result.success).toBe(true);
    });

    it("should reject schema with wrong type", () => {
      const schema = {
        type: "array",
        properties: {},
      };
      const result = ToolInputSchemaSchema.safeParse(schema);
      expect(result.success).toBe(false);
    });
  });

  describe("ToolContextSchema", () => {
    it("should accept valid tool context", () => {
      const context: ToolContext = {
        workspaceRoot: "/workspace",
        sessionId: "session-123",
        iteration: 5,
        cancellationToken: {},
        logger: {},
        db: {},
      };
      const result = ToolContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    });

    it("should accept context with optional fileTracker", () => {
      const context = {
        workspaceRoot: "/workspace",
        sessionId: "session-123",
        iteration: 0,
        cancellationToken: {},
        logger: {},
        db: {},
        fileTracker: {},
      };
      const result = ToolContextSchema.safeParse(context);
      expect(result.success).toBe(true);
    });

    it("should reject context with negative iteration", () => {
      const context = {
        workspaceRoot: "/workspace",
        sessionId: "session-123",
        iteration: -1,
        cancellationToken: {},
        logger: {},
        db: {},
      };
      const result = ToolContextSchema.safeParse(context);
      expect(result.success).toBe(false);
    });
  });

  describe("ToolResultSchema", () => {
    it("should accept successful result", () => {
      const result: ToolResult = {
        success: true,
        output: "Operation completed",
      };
      const parsed = ToolResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("should accept result with error and metadata", () => {
      const result = {
        success: false,
        output: "Failed",
        error: "Something went wrong",
        metadata: { code: "ERR_001" },
      };
      const parsed = ToolResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("should require success and output fields", () => {
      const result = { success: true };
      const parsed = ToolResultSchema.safeParse(result);
      expect(parsed.success).toBe(false);
    });
  });

  describe("ToolDefinitionSchema", () => {
    it("should accept valid tool definition", () => {
      const tool = {
        name: "test_tool",
        description: "A test tool",
        inputSchema: {
          type: "object" as const,
          properties: {
            input: { type: "string" },
          },
        },
        handler: async (_input: unknown, _context: ToolContext) => ({
          success: true,
          output: "done",
        }),
      };
      const result = ToolDefinitionSchema.safeParse(tool);
      expect(result.success).toBe(true);
    });

    it("should reject tool without name", () => {
      const tool = {
        name: "",
        description: "A test tool",
        inputSchema: { type: "object" as const, properties: {} },
        handler: async () => ({ success: true, output: "done" }),
      };
      const result = ToolDefinitionSchema.safeParse(tool);
      expect(result.success).toBe(false);
    });
  });

  describe("VerbosityLevelSchema", () => {
    it("should accept all valid verbosity levels", () => {
      const levels = ["minimal", "normal", "detailed", "debug"];
      levels.forEach((level) => {
        const result = VerbosityLevelSchema.safeParse(level);
        expect(result.success).toBe(true);
      });
    });

    it("should export TypeScript type", () => {
      const level: VerbosityLevel = "normal";
      expect(level).toBe("normal");
    });
  });

  describe("AgentConfigSchema", () => {
    it("should accept valid config with defaults", () => {
      const config = {};
      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxIterations).toBe(50);
        expect(result.data.verbosity).toBe("normal");
      }
    });

    it("should accept config with custom values", () => {
      const config: AgentConfig = {
        orchestratorModel: "gpt-4",
        implementorModel: "gpt-4",
        maxIterations: 100,
        maxToolRetries: 5,
        verbosity: "debug",
        compactionThreshold: 10,
        maxContextTokens: 200000,
        summarizeAfterToolCalls: 30,
      };
      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it("should reject config with negative maxIterations", () => {
      const config = { maxIterations: -1 };
      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe("MessageRoleSchema", () => {
    it("should accept valid message roles", () => {
      const roles = ["user", "assistant", "system"];
      roles.forEach((role) => {
        const result = MessageRoleSchema.safeParse(role);
        expect(result.success).toBe(true);
      });
    });

    it("should export TypeScript type", () => {
      const role: MessageRole = "assistant";
      expect(role).toBe("assistant");
    });
  });

  describe("MessageContentPartSchema", () => {
    it("should accept text content part", () => {
      const part = { type: "text", value: "Hello" };
      const result = MessageContentPartSchema.safeParse(part);
      expect(result.success).toBe(true);
    });

    it("should accept toolCall content part", () => {
      const part = {
        type: "toolCall",
        toolCallId: "call-123",
        name: "test_tool",
        input: { param: "value" },
      };
      const result = MessageContentPartSchema.safeParse(part);
      expect(result.success).toBe(true);
    });

    it("should accept toolResult content part", () => {
      const part = {
        type: "toolResult",
        toolCallId: "call-123",
        value: "result",
      };
      const result = MessageContentPartSchema.safeParse(part);
      expect(result.success).toBe(true);
    });

    it("should reject invalid content part type", () => {
      const part = { type: "invalid", value: "test" };
      const result = MessageContentPartSchema.safeParse(part);
      expect(result.success).toBe(false);
    });
  });

  describe("AgentMessageSchema", () => {
    it("should accept message with string content", () => {
      const message: AgentMessage = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        role: "user",
        content: "Hello agent",
        timestamp: "2026-01-13T10:00:00.000Z",
        iteration: 1,
      };
      const result = AgentMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it("should accept message with multi-part content", () => {
      const message = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        role: "assistant",
        content: [{ type: "text", value: "Response" }],
        timestamp: "2026-01-13T10:00:00.000Z",
        iteration: 1,
        toolCallIds: ["call-1"],
      };
      const result = AgentMessageSchema.safeParse(message);
      expect(result.success).toBe(true);
    });

    it("should reject message with invalid UUID", () => {
      const message = {
        id: "not-a-uuid",
        role: "user",
        content: "Hello",
        timestamp: "2026-01-13T10:00:00.000Z",
        iteration: 0,
      };
      const result = AgentMessageSchema.safeParse(message);
      expect(result.success).toBe(false);
    });
  });

  describe("ToolCallStatusSchema", () => {
    it("should accept valid tool call statuses", () => {
      const statuses = ["pending", "success", "error"];
      statuses.forEach((status) => {
        const result = ToolCallStatusSchema.safeParse(status);
        expect(result.success).toBe(true);
      });
    });
  });

  describe("ToolCallErrorSchema", () => {
    it("should accept valid tool call error", () => {
      const error = {
        code: "ERR_TIMEOUT",
        message: "Operation timed out",
        recoverable: true,
        stack: "Error: ...",
      };
      const result = ToolCallErrorSchema.safeParse(error);
      expect(result.success).toBe(true);
    });

    it("should accept error without stack", () => {
      const error = {
        code: "ERR_001",
        message: "Failed",
        recoverable: false,
      };
      const result = ToolCallErrorSchema.safeParse(error);
      expect(result.success).toBe(true);
    });
  });

  describe("ToolCallSchema", () => {
    it("should accept valid tool call", () => {
      const toolCall: ToolCall = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        name: "test_tool",
        arguments: { input: "value" },
        status: "success",
        startedAt: "2026-01-13T10:00:00.000Z",
        completedAt: "2026-01-13T10:00:01.000Z",
        durationMs: 1000,
        iteration: 1,
        messageId: "msg-123",
      };
      const result = ToolCallSchema.safeParse(toolCall);
      expect(result.success).toBe(true);
    });

    it("should accept pending tool call with null completedAt", () => {
      const toolCall = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        name: "test_tool",
        arguments: {},
        status: "pending",
        startedAt: "2026-01-13T10:00:00.000Z",
        completedAt: null,
        durationMs: null,
        iteration: 1,
        messageId: "msg-123",
      };
      const result = ToolCallSchema.safeParse(toolCall);
      expect(result.success).toBe(true);
    });

    it("should accept tool call with error", () => {
      const toolCall = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        name: "test_tool",
        arguments: {},
        status: "error",
        startedAt: "2026-01-13T10:00:00.000Z",
        completedAt: "2026-01-13T10:00:01.000Z",
        durationMs: 1000,
        iteration: 1,
        messageId: "msg-123",
        error: {
          code: "ERR_FAIL",
          message: "Failed",
          recoverable: true,
        },
      };
      const result = ToolCallSchema.safeParse(toolCall);
      expect(result.success).toBe(true);
    });
  });

  describe("FileOperationSchema", () => {
    it("should accept valid file operations", () => {
      const operations = ["create", "modify", "delete"];
      operations.forEach((op) => {
        const result = FileOperationSchema.safeParse(op);
        expect(result.success).toBe(true);
      });
    });
  });

  describe("FileChangeSchema", () => {
    it("should accept valid file change", () => {
      const change: FileChange = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        uri: "file:///workspace/file.ts",
        relativePath: "src/file.ts",
        operation: "create",
        previousContent: null,
        previousContentHash: null,
        newContent: "content",
        newContentHash: "hash123",
        toolCallId: "call-123",
        timestamp: "2026-01-13T10:00:00.000Z",
        iteration: 1,
        undone: false,
        undoneAt: null,
      };
      const result = FileChangeSchema.safeParse(change);
      expect(result.success).toBe(true);
    });

    it("should accept file change with undo info", () => {
      const change = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        uri: "file:///workspace/file.ts",
        relativePath: "src/file.ts",
        operation: "modify",
        previousContent: "old",
        previousContentHash: "hash1",
        newContent: "new",
        newContentHash: "hash2",
        toolCallId: "call-123",
        timestamp: "2026-01-13T10:00:00.000Z",
        iteration: 1,
        undone: true,
        undoneAt: "2026-01-13T10:05:00.000Z",
      };
      const result = FileChangeSchema.safeParse(change);
      expect(result.success).toBe(true);
    });
  });

  describe("CheckpointReferenceSchema", () => {
    it("should accept valid checkpoint reference", () => {
      const checkpoint = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        iteration: 5,
        position: "end",
        toolCallId: "call-123",
        filePath: "/checkpoints/session-123-iter-5.json",
        fileSize: 1024,
        createdAt: "2026-01-13T10:00:00.000Z",
      };
      const result = CheckpointReferenceSchema.safeParse(checkpoint);
      expect(result.success).toBe(true);
    });

    it("should accept checkpoint with null toolCallId", () => {
      const checkpoint = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        iteration: 0,
        position: "start",
        toolCallId: null,
        filePath: "/checkpoints/session-123-iter-0.json",
        fileSize: 512,
        createdAt: "2026-01-13T10:00:00.000Z",
      };
      const result = CheckpointReferenceSchema.safeParse(checkpoint);
      expect(result.success).toBe(true);
    });
  });

  describe("RecoveryInfoSchema", () => {
    it("should accept recovery info for resumable session", () => {
      const info = {
        canResume: true,
        resumeFromIteration: 5,
        resumeFromToolCall: "call-123",
        failureReason: null,
      };
      const result = RecoveryInfoSchema.safeParse(info);
      expect(result.success).toBe(true);
    });

    it("should accept recovery info for failed session", () => {
      const info = {
        canResume: false,
        resumeFromIteration: null,
        resumeFromToolCall: null,
        failureReason: "Max iterations exceeded",
      };
      const result = RecoveryInfoSchema.safeParse(info);
      expect(result.success).toBe(true);
    });
  });

  describe("AgentSessionSchema", () => {
    it("should accept valid agent session", () => {
      const session: AgentSession = {
        version: "1.0",
        id: "123e4567-e89b-12d3-a456-426614174000",
        role: "implementor",
        taskId: 5,
        sprintId: "sprint-001",
        status: "running",
        createdAt: "2026-01-13T10:00:00.000Z",
        updatedAt: "2026-01-13T10:05:00.000Z",
        lastActivityAt: "2026-01-13T10:05:00.000Z",
        currentIteration: 3,
        maxIterations: 50,
        messages: [],
        toolCalls: [],
        fileChanges: [],
        checkpoints: [],
        lastCheckpointId: null,
        recoveryInfo: {
          canResume: true,
          resumeFromIteration: 3,
          resumeFromToolCall: null,
          failureReason: null,
        },
      };
      const result = AgentSessionSchema.safeParse(session);
      expect(result.success).toBe(true);
    });

    it("should accept orchestrator session with null taskId", () => {
      const session = {
        version: "1.0",
        id: "123e4567-e89b-12d3-a456-426614174000",
        role: "orchestrator",
        taskId: null,
        sprintId: "sprint-001",
        status: "running",
        createdAt: "2026-01-13T10:00:00.000Z",
        updatedAt: "2026-01-13T10:00:00.000Z",
        lastActivityAt: "2026-01-13T10:00:00.000Z",
        currentIteration: 0,
        maxIterations: 50,
        messages: [],
        toolCalls: [],
        fileChanges: [],
        checkpoints: [],
        lastCheckpointId: null,
        recoveryInfo: {
          canResume: true,
          resumeFromIteration: 0,
          resumeFromToolCall: null,
          failureReason: null,
        },
      };
      const result = AgentSessionSchema.safeParse(session);
      expect(result.success).toBe(true);
    });

    it("should reject session with invalid version", () => {
      const session = {
        version: "2.0",
        id: "123e4567-e89b-12d3-a456-426614174000",
        role: "implementor",
        taskId: 1,
        sprintId: "sprint-001",
        status: "running",
        createdAt: "2026-01-13T10:00:00.000Z",
        updatedAt: "2026-01-13T10:00:00.000Z",
        lastActivityAt: "2026-01-13T10:00:00.000Z",
        currentIteration: 0,
        maxIterations: 50,
        messages: [],
        toolCalls: [],
        fileChanges: [],
        checkpoints: [],
        lastCheckpointId: null,
        recoveryInfo: {
          canResume: true,
          resumeFromIteration: 0,
          resumeFromToolCall: null,
          failureReason: null,
        },
      };
      const result = AgentSessionSchema.safeParse(session);
      expect(result.success).toBe(false);
    });

    it("should reject session with negative currentIteration", () => {
      const session = {
        version: "1.0",
        id: "123e4567-e89b-12d3-a456-426614174000",
        role: "implementor",
        taskId: 1,
        sprintId: "sprint-001",
        status: "running",
        createdAt: "2026-01-13T10:00:00.000Z",
        updatedAt: "2026-01-13T10:00:00.000Z",
        lastActivityAt: "2026-01-13T10:00:00.000Z",
        currentIteration: -1,
        maxIterations: 50,
        messages: [],
        toolCalls: [],
        fileChanges: [],
        checkpoints: [],
        lastCheckpointId: null,
        recoveryInfo: {
          canResume: true,
          resumeFromIteration: 0,
          resumeFromToolCall: null,
          failureReason: null,
        },
      };
      const result = AgentSessionSchema.safeParse(session);
      expect(result.success).toBe(false);
    });

    it("should accept session with populated arrays", () => {
      const session = {
        version: "1.0",
        id: "123e4567-e89b-12d3-a456-426614174000",
        role: "implementor",
        taskId: 1,
        sprintId: "sprint-001",
        status: "running",
        createdAt: "2026-01-13T10:00:00.000Z",
        updatedAt: "2026-01-13T10:05:00.000Z",
        lastActivityAt: "2026-01-13T10:05:00.000Z",
        currentIteration: 1,
        maxIterations: 50,
        messages: [
          {
            id: "223e4567-e89b-12d3-a456-426614174000",
            role: "user",
            content: "Start task",
            timestamp: "2026-01-13T10:00:00.000Z",
            iteration: 0,
          },
        ],
        toolCalls: [
          {
            id: "323e4567-e89b-12d3-a456-426614174000",
            name: "read_file",
            arguments: { path: "file.ts" },
            status: "success",
            startedAt: "2026-01-13T10:01:00.000Z",
            completedAt: "2026-01-13T10:01:01.000Z",
            durationMs: 1000,
            iteration: 1,
            messageId: "223e4567-e89b-12d3-a456-426614174000",
          },
        ],
        fileChanges: [],
        checkpoints: [
          {
            id: "423e4567-e89b-12d3-a456-426614174000",
            iteration: 0,
            position: "start",
            toolCallId: null,
            filePath: "/checkpoints/session-123-iter-0.json",
            fileSize: 512,
            createdAt: "2026-01-13T10:00:00.000Z",
          },
        ],
        lastCheckpointId: "423e4567-e89b-12d3-a456-426614174000",
        recoveryInfo: {
          canResume: true,
          resumeFromIteration: 1,
          resumeFromToolCall: null,
          failureReason: null,
        },
      };
      const result = AgentSessionSchema.safeParse(session);
      expect(result.success).toBe(true);
    });
  });
});
