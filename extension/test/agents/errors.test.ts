/**
 * Unit tests for agent error hierarchy
 */

import { describe, test, expect } from "vitest";
import {
  AgentError,
  ToolExecutionError,
  SessionError,
  isAgentError,
  isToolExecutionError,
  isSessionError,
} from "../../src/agents/errors.js";
import { OrchestraExtensionError } from "../../src/utils/errors.js";

describe("AgentError", () => {
  test("should create an error with message and code", () => {
    const error = new AgentError("Test error", "TEST_CODE");

    expect(error.message).toBe("Test error");
    expect(error.code).toBe("TEST_CODE");
    expect(error.name).toBe("AgentError");
  });

  test("should create an error with context", () => {
    const context = { userId: 123, action: "test" };
    const error = new AgentError("Test error", "TEST_CODE", context);

    expect(error.context).toEqual(context);
  });

  test("should extend OrchestraExtensionError", () => {
    const error = new AgentError("Test error", "TEST_CODE");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(OrchestraExtensionError);
    expect(error).toBeInstanceOf(AgentError);
  });

  test("should serialize to JSON", () => {
    const context = { userId: 123 };
    const error = new AgentError("Test error", "TEST_CODE", context);
    const json = error.toJSON();

    expect(json).toEqual({
      name: "AgentError",
      code: "TEST_CODE",
      message: "Test error",
      context,
    });
  });

  test("should capture stack trace", () => {
    const error = new AgentError("Test error", "TEST_CODE");

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("AgentError");
  });

  test("should handle undefined context", () => {
    const error = new AgentError("Test error", "TEST_CODE");

    expect(error.context).toBeUndefined();
  });
});

describe("ToolExecutionError", () => {
  test("should create an error with tool name", () => {
    const error = new ToolExecutionError(
      "Tool failed",
      "read_file"
    );

    expect(error.message).toBe("Tool failed");
    expect(error.toolName).toBe("read_file");
    expect(error.code).toBe("TOOL_EXECUTION_ERROR");
    expect(error.name).toBe("ToolExecutionError");
  });

  test("should create an error with tool name and context", () => {
    const context = { filePath: "/test.ts", error: "not found" };
    const error = new ToolExecutionError(
      "Tool failed",
      "read_file",
      context
    );

    expect(error.toolName).toBe("read_file");
    expect(error.context).toEqual({
      ...context,
      toolName: "read_file",
    });
  });

  test("should extend AgentError", () => {
    const error = new ToolExecutionError("Tool failed", "read_file");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(OrchestraExtensionError);
    expect(error).toBeInstanceOf(AgentError);
    expect(error).toBeInstanceOf(ToolExecutionError);
  });

  test("should serialize to JSON with tool name", () => {
    const context = { filePath: "/test.ts" };
    const error = new ToolExecutionError(
      "Tool failed",
      "read_file",
      context
    );
    const json = error.toJSON();

    expect(json).toEqual({
      name: "ToolExecutionError",
      code: "TOOL_EXECUTION_ERROR",
      message: "Tool failed",
      context: {
        filePath: "/test.ts",
        toolName: "read_file",
      },
      toolName: "read_file",
    });
  });

  test("should include tool name in context automatically", () => {
    const error = new ToolExecutionError("Tool failed", "write_file");

    expect(error.context).toEqual({
      toolName: "write_file",
    });
  });

  test("should preserve existing context when adding tool name", () => {
    const originalContext = { attempt: 2, maxRetries: 3 };
    const error = new ToolExecutionError(
      "Tool failed",
      "execute_task",
      originalContext
    );

    expect(error.context).toEqual({
      attempt: 2,
      maxRetries: 3,
      toolName: "execute_task",
    });
  });
});

describe("SessionError", () => {
  test("should create an error with session ID", () => {
    const sessionId = "session-123";
    const error = new SessionError(
      "Session operation failed",
      sessionId
    );

    expect(error.message).toBe("Session operation failed");
    expect(error.sessionId).toBe(sessionId);
    expect(error.code).toBe("SESSION_ERROR");
    expect(error.name).toBe("SessionError");
  });

  test("should create an error with session ID and context", () => {
    const sessionId = "session-456";
    const context = { operation: "save", reason: "disk full" };
    const error = new SessionError(
      "Session operation failed",
      sessionId,
      context
    );

    expect(error.sessionId).toBe(sessionId);
    expect(error.context).toEqual({
      ...context,
      sessionId,
    });
  });

  test("should extend AgentError", () => {
    const error = new SessionError("Session failed", "session-789");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(OrchestraExtensionError);
    expect(error).toBeInstanceOf(AgentError);
    expect(error).toBeInstanceOf(SessionError);
  });

  test("should serialize to JSON with session ID", () => {
    const sessionId = "session-abc";
    const context = { operation: "load" };
    const error = new SessionError(
      "Session operation failed",
      sessionId,
      context
    );
    const json = error.toJSON();

    expect(json).toEqual({
      name: "SessionError",
      code: "SESSION_ERROR",
      message: "Session operation failed",
      context: {
        operation: "load",
        sessionId: "session-abc",
      },
      sessionId: "session-abc",
    });
  });

  test("should include session ID in context automatically", () => {
    const error = new SessionError("Session failed", "session-xyz");

    expect(error.context).toEqual({
      sessionId: "session-xyz",
    });
  });

  test("should preserve existing context when adding session ID", () => {
    const originalContext = { phase: "checkpoint", iteration: 5 };
    const error = new SessionError(
      "Checkpoint failed",
      "session-def",
      originalContext
    );

    expect(error.context).toEqual({
      phase: "checkpoint",
      iteration: 5,
      sessionId: "session-def",
    });
  });
});

describe("Type Guards", () => {
  describe("isAgentError", () => {
    test("should return true for AgentError", () => {
      const error = new AgentError("Test", "TEST_CODE");
      expect(isAgentError(error)).toBe(true);
    });

    test("should return true for ToolExecutionError", () => {
      const error = new ToolExecutionError("Test", "tool");
      expect(isAgentError(error)).toBe(true);
    });

    test("should return true for SessionError", () => {
      const error = new SessionError("Test", "session-123");
      expect(isAgentError(error)).toBe(true);
    });

    test("should return false for non-AgentError", () => {
      const error = new Error("Regular error");
      expect(isAgentError(error)).toBe(false);
    });

    test("should return false for null", () => {
      expect(isAgentError(null)).toBe(false);
    });

    test("should return false for undefined", () => {
      expect(isAgentError(undefined)).toBe(false);
    });

    test("should return false for string", () => {
      expect(isAgentError("error")).toBe(false);
    });

    test("should return false for OrchestraExtensionError", () => {
      const error = new OrchestraExtensionError("Test");
      expect(isAgentError(error)).toBe(false);
    });
  });

  describe("isToolExecutionError", () => {
    test("should return true for ToolExecutionError", () => {
      const error = new ToolExecutionError("Test", "tool");
      expect(isToolExecutionError(error)).toBe(true);
    });

    test("should return false for AgentError", () => {
      const error = new AgentError("Test", "TEST_CODE");
      expect(isToolExecutionError(error)).toBe(false);
    });

    test("should return false for SessionError", () => {
      const error = new SessionError("Test", "session-123");
      expect(isToolExecutionError(error)).toBe(false);
    });

    test("should return false for non-error values", () => {
      expect(isToolExecutionError(null)).toBe(false);
      expect(isToolExecutionError(undefined)).toBe(false);
      expect(isToolExecutionError("error")).toBe(false);
      expect(isToolExecutionError({})).toBe(false);
    });
  });

  describe("isSessionError", () => {
    test("should return true for SessionError", () => {
      const error = new SessionError("Test", "session-123");
      expect(isSessionError(error)).toBe(true);
    });

    test("should return false for AgentError", () => {
      const error = new AgentError("Test", "TEST_CODE");
      expect(isSessionError(error)).toBe(false);
    });

    test("should return false for ToolExecutionError", () => {
      const error = new ToolExecutionError("Test", "tool");
      expect(isSessionError(error)).toBe(false);
    });

    test("should return false for non-error values", () => {
      expect(isSessionError(null)).toBe(false);
      expect(isSessionError(undefined)).toBe(false);
      expect(isSessionError("error")).toBe(false);
      expect(isSessionError({})).toBe(false);
    });
  });

  describe("Type narrowing", () => {
    test("should narrow type correctly with isAgentError", () => {
      const error: unknown = new AgentError("Test", "TEST_CODE");

      if (isAgentError(error)) {
        // TypeScript should recognize error.code is accessible
        expect(error.code).toBe("TEST_CODE");
        expect(error.message).toBe("Test");
      } else {
        throw new Error("Should not reach here");
      }
    });

    test("should narrow type correctly with isToolExecutionError", () => {
      const error: unknown = new ToolExecutionError("Test", "my_tool");

      if (isToolExecutionError(error)) {
        // TypeScript should recognize error.toolName is accessible
        expect(error.toolName).toBe("my_tool");
        expect(error.code).toBe("TOOL_EXECUTION_ERROR");
      } else {
        throw new Error("Should not reach here");
      }
    });

    test("should narrow type correctly with isSessionError", () => {
      const error: unknown = new SessionError("Test", "session-999");

      if (isSessionError(error)) {
        // TypeScript should recognize error.sessionId is accessible
        expect(error.sessionId).toBe("session-999");
        expect(error.code).toBe("SESSION_ERROR");
      } else {
        throw new Error("Should not reach here");
      }
    });
  });
});

describe("Error inheritance chain", () => {
  test("should maintain proper inheritance chain for AgentError", () => {
    const error = new AgentError("Test", "TEST_CODE");

    expect(error instanceof Error).toBe(true);
    expect(error instanceof OrchestraExtensionError).toBe(true);
    expect(error instanceof AgentError).toBe(true);
  });

  test("should maintain proper inheritance chain for ToolExecutionError", () => {
    const error = new ToolExecutionError("Test", "tool");

    expect(error instanceof Error).toBe(true);
    expect(error instanceof OrchestraExtensionError).toBe(true);
    expect(error instanceof AgentError).toBe(true);
    expect(error instanceof ToolExecutionError).toBe(true);
  });

  test("should maintain proper inheritance chain for SessionError", () => {
    const error = new SessionError("Test", "session-123");

    expect(error instanceof Error).toBe(true);
    expect(error instanceof OrchestraExtensionError).toBe(true);
    expect(error instanceof AgentError).toBe(true);
    expect(error instanceof SessionError).toBe(true);
  });
});

describe("Edge cases", () => {
  test("should handle empty string message", () => {
    const error = new AgentError("", "TEST_CODE");
    expect(error.message).toBe("");
  });

  test("should handle empty string code", () => {
    const error = new AgentError("Test", "");
    expect(error.code).toBe("");
  });

  test("should handle empty string tool name", () => {
    const error = new ToolExecutionError("Test", "");
    expect(error.toolName).toBe("");
  });

  test("should handle empty string session ID", () => {
    const error = new SessionError("Test", "");
    expect(error.sessionId).toBe("");
  });

  test("should handle complex context objects", () => {
    const complexContext = {
      nested: { deeply: { value: 123 } },
      array: [1, 2, 3],
      nullValue: null,
      undefinedValue: undefined,
    };
    const error = new AgentError("Test", "TEST_CODE", complexContext);

    expect(error.context).toEqual(complexContext);
    expect(error.toJSON().context).toEqual(complexContext);
  });

  test("should handle context with conflicting toolName key", () => {
    const context = { toolName: "conflicting", other: "data" };
    const error = new ToolExecutionError("Test", "actual_tool", context);

    // The actual toolName should override the conflicting one
    expect(error.toolName).toBe("actual_tool");
    expect(error.context?.toolName).toBe("actual_tool");
  });

  test("should handle context with conflicting sessionId key", () => {
    const context = { sessionId: "conflicting", other: "data" };
    const error = new SessionError("Test", "actual-session", context);

    // The actual sessionId should override the conflicting one
    expect(error.sessionId).toBe("actual-session");
    expect(error.context?.sessionId).toBe("actual-session");
  });
});
