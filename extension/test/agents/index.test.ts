/**
 * Tests for agents/index.ts barrel export
 *
 * Verifies that all public types, schemas, and error classes
 * are properly re-exported through the index file.
 */

import { describe, it, expect } from "vitest";
import * as agentModule from "../../src/agents/index.js";

describe("agents/index.ts barrel export", () => {
  describe("Type schemas exported from types.ts", () => {
    it("exports AgentRoleSchema", () => {
      expect(agentModule.AgentRoleSchema).toBeDefined();
    });

    it("exports AgentStatusSchema", () => {
      expect(agentModule.AgentStatusSchema).toBeDefined();
    });

    it("exports ToolInputSchemaSchema", () => {
      expect(agentModule.ToolInputSchemaSchema).toBeDefined();
    });

    it("exports ToolContextSchema", () => {
      expect(agentModule.ToolContextSchema).toBeDefined();
    });

    it("exports ToolResultSchema", () => {
      expect(agentModule.ToolResultSchema).toBeDefined();
    });

    it("exports ToolDefinitionSchema", () => {
      expect(agentModule.ToolDefinitionSchema).toBeDefined();
    });

    it("exports VerbosityLevelSchema", () => {
      expect(agentModule.VerbosityLevelSchema).toBeDefined();
    });

    it("exports AgentConfigSchema", () => {
      expect(agentModule.AgentConfigSchema).toBeDefined();
    });

    it("exports MessageRoleSchema", () => {
      expect(agentModule.MessageRoleSchema).toBeDefined();
    });

    it("exports MessageContentPartSchema", () => {
      expect(agentModule.MessageContentPartSchema).toBeDefined();
    });

    it("exports AgentMessageSchema", () => {
      expect(agentModule.AgentMessageSchema).toBeDefined();
    });

    it("exports ToolCallStatusSchema", () => {
      expect(agentModule.ToolCallStatusSchema).toBeDefined();
    });

    it("exports ToolCallErrorSchema", () => {
      expect(agentModule.ToolCallErrorSchema).toBeDefined();
    });

    it("exports ToolCallSchema", () => {
      expect(agentModule.ToolCallSchema).toBeDefined();
    });

    it("exports FileOperationSchema", () => {
      expect(agentModule.FileOperationSchema).toBeDefined();
    });

    it("exports FileChangeSchema", () => {
      expect(agentModule.FileChangeSchema).toBeDefined();
    });

    it("exports CheckpointReferenceSchema", () => {
      expect(agentModule.CheckpointReferenceSchema).toBeDefined();
    });

    it("exports RecoveryInfoSchema", () => {
      expect(agentModule.RecoveryInfoSchema).toBeDefined();
    });

    it("exports AgentSessionSchema", () => {
      expect(agentModule.AgentSessionSchema).toBeDefined();
    });
  });

  describe("Error classes exported from errors.ts", () => {
    it("exports AgentError class", () => {
      expect(agentModule.AgentError).toBeDefined();
      const error = new agentModule.AgentError("test", "TEST_CODE");
      expect(error).toBeInstanceOf(agentModule.AgentError);
      expect(error.code).toBe("TEST_CODE");
      expect(error.message).toBe("test");
    });

    it("exports ToolExecutionError class", () => {
      expect(agentModule.ToolExecutionError).toBeDefined();
      const error = new agentModule.ToolExecutionError(
        "test",
        "testTool"
      );
      expect(error).toBeInstanceOf(agentModule.ToolExecutionError);
      expect(error).toBeInstanceOf(agentModule.AgentError);
      expect(error.toolName).toBe("testTool");
    });

    it("exports SessionError class", () => {
      expect(agentModule.SessionError).toBeDefined();
      const error = new agentModule.SessionError(
        "test",
        "session-123"
      );
      expect(error).toBeInstanceOf(agentModule.SessionError);
      expect(error).toBeInstanceOf(agentModule.AgentError);
      expect(error.sessionId).toBe("session-123");
    });
  });

  describe("Type guards exported from errors.ts", () => {
    it("exports isAgentError type guard", () => {
      expect(agentModule.isAgentError).toBeDefined();
      expect(typeof agentModule.isAgentError).toBe("function");
      
      const error = new agentModule.AgentError("test", "TEST_CODE");
      expect(agentModule.isAgentError(error)).toBe(true);
      expect(agentModule.isAgentError(new Error("test"))).toBe(false);
    });

    it("exports isToolExecutionError type guard", () => {
      expect(agentModule.isToolExecutionError).toBeDefined();
      expect(typeof agentModule.isToolExecutionError).toBe("function");
      
      const error = new agentModule.ToolExecutionError("test", "tool");
      expect(agentModule.isToolExecutionError(error)).toBe(true);
      expect(agentModule.isToolExecutionError(new Error("test"))).toBe(false);
    });

    it("exports isSessionError type guard", () => {
      expect(agentModule.isSessionError).toBeDefined();
      expect(typeof agentModule.isSessionError).toBe("function");
      
      const error = new agentModule.SessionError("test", "session");
      expect(agentModule.isSessionError(error)).toBe(true);
      expect(agentModule.isSessionError(new Error("test"))).toBe(false);
    });
  });

  describe("Integration: using exports in typical patterns", () => {
    it("can destructure commonly used types and errors", () => {
      const {
        AgentRoleSchema,
        AgentStatusSchema,
        AgentConfigSchema,
        AgentError,
        ToolExecutionError,
        SessionError,
      } = agentModule;

      expect(AgentRoleSchema).toBeDefined();
      expect(AgentStatusSchema).toBeDefined();
      expect(AgentConfigSchema).toBeDefined();
      expect(AgentError).toBeDefined();
      expect(ToolExecutionError).toBeDefined();
      expect(SessionError).toBeDefined();
    });

    it("can use schemas for validation", () => {
      const result = agentModule.AgentRoleSchema.safeParse("orchestrator");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("orchestrator");
      }
    });

    it("can instantiate error classes with proper inheritance", () => {
      const baseError = new agentModule.AgentError("base", "BASE");
      const toolError = new agentModule.ToolExecutionError("tool", "myTool");
      const sessionError = new agentModule.SessionError("session", "session-1");

      expect(baseError).toBeInstanceOf(agentModule.AgentError);
      expect(toolError).toBeInstanceOf(agentModule.ToolExecutionError);
      expect(toolError).toBeInstanceOf(agentModule.AgentError);
      expect(sessionError).toBeInstanceOf(agentModule.SessionError);
      expect(sessionError).toBeInstanceOf(agentModule.AgentError);
    });

    it("error toJSON serialization works correctly", () => {
      const error = new agentModule.ToolExecutionError(
        "Failed to execute",
        "myTool",
        { param: "value" }
      );
      
      const json = error.toJSON();
      expect(json).toMatchObject({
        name: "ToolExecutionError",
        code: "TOOL_EXECUTION_ERROR",
        message: "Failed to execute",
        toolName: "myTool",
        context: expect.objectContaining({
          param: "value",
          toolName: "myTool",
        }),
      });
    });
  });
});
