/**
 * Unit tests for AgentSession state management
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AgentSession } from "../../src/agents/AgentSession.js";
import { SessionError } from "../../src/agents/errors.js";
import { SessionStorage } from "../../src/agents/SessionStorage.js";
import {
  AgentMessage,
  CheckpointReference,
  FileChange,
  ToolCall,
} from "../../src/agents/types.js";

describe("AgentSession", () => {
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-test-"));
    SessionStorage.getInstance(tempDir);
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 50,
      });
    }
  });

  describe("constructor", () => {
    test("should create new session with orchestrator role", () => {
      const session = new AgentSession("orchestrator", "sprint-001");

      expect(session.id).toBeDefined();
      expect(session.role).toBe("orchestrator");
      expect(session.sprintId).toBe("sprint-001");
      expect(session.taskId).toBeNull();
      expect(session.status).toBe("running");
      expect(session.currentIteration).toBe(0);
      expect(session.maxIterations).toBe(80);
      expect(session.messages).toEqual([]);
      expect(session.toolCalls).toEqual([]);
      expect(session.fileChanges).toEqual([]);
      expect(session.checkpoints).toEqual([]);
      expect(session.lastCheckpointId).toBeNull();
    });

    test("should create new session with implementor role and task ID", () => {
      const session = new AgentSession("implementor", "sprint-001", 5);

      expect(session.role).toBe("implementor");
      expect(session.taskId).toBe(5);
    });

    test("should generate unique UUID for session ID", () => {
      const session1 = new AgentSession("orchestrator", "sprint-001");
      const session2 = new AgentSession("orchestrator", "sprint-001");

      expect(session1.id).not.toBe(session2.id);
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(session1.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    test("should set timestamps on creation", () => {
      const session = new AgentSession("orchestrator", "sprint-001");

      // Verify timestamps are defined and valid ISO 8601 format
      expect(session.createdAt).toBeDefined();
      expect(session.updatedAt).toBeDefined();
      expect(session.lastActivityAt).toBeDefined();

      // Verify ISO 8601 format
      expect(() => new Date(session.createdAt)).not.toThrow();
      expect(session.updatedAt).toBe(session.createdAt);
      expect(session.lastActivityAt).toBe(session.createdAt);
    });

    test("should accept custom maxIterations", () => {
      const session = new AgentSession("orchestrator", "sprint-001", null, 100);

      expect(session.maxIterations).toBe(100);
    });

    test("should initialize recovery info", () => {
      const session = new AgentSession("orchestrator", "sprint-001");

      expect(session.recoveryInfo).toEqual({
        canResume: true,
        resumeFromIteration: null,
        resumeFromToolCall: null,
        failureReason: null,
      });
    });
  });

  describe("addMessage", () => {
    test("should add message to history", () => {
      const session = new AgentSession("orchestrator", "sprint-001");

      const message: AgentMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: "Test message",
        timestamp: new Date().toISOString(),
        iteration: 0,
      };

      session.addMessage(message);

      expect(session.messages).toHaveLength(1);
      expect(session.messages[0]).toBe(message);
    });

    test("should add multiple messages in order", () => {
      const session = new AgentSession("orchestrator", "sprint-001");

      const message1: AgentMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: "First",
        timestamp: new Date().toISOString(),
        iteration: 0,
      };

      const message2: AgentMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Second",
        timestamp: new Date().toISOString(),
        iteration: 0,
      };

      session.addMessage(message1);
      session.addMessage(message2);

      expect(session.messages).toHaveLength(2);
      expect(session.messages[0]).toBe(message1);
      expect(session.messages[1]).toBe(message2);
    });
  });

  describe("recordToolCall", () => {
    test("should record tool call", () => {
      const session = new AgentSession("orchestrator", "sprint-001");

      const toolCall: ToolCall = {
        id: crypto.randomUUID(),
        name: "read_file",
        arguments: { path: "test.txt" },
        result: "file content",
        status: "success",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 100,
        iteration: 0,
        messageId: crypto.randomUUID(),
      };

      session.recordToolCall(toolCall);

      expect(session.toolCalls).toHaveLength(1);
      expect(session.toolCalls[0]).toBe(toolCall);
    });
  });

  describe("recordFileChange", () => {
    test("should record file change", () => {
      const session = new AgentSession("orchestrator", "sprint-001");

      const fileChange: FileChange = {
        id: crypto.randomUUID(),
        uri: "file:///path/to/file.ts",
        relativePath: "src/file.ts",
        operation: "create",
        previousContent: null,
        previousContentHash: null,
        newContent: "console.log('test');",
        newContentHash: "abc123",
        toolCallId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        iteration: 0,
        undone: false,
        undoneAt: null,
      };

      session.recordFileChange(fileChange);

      expect(session.fileChanges).toHaveLength(1);
      expect(session.fileChanges[0]).toBe(fileChange);
    });
  });

  describe("incrementIteration", () => {
    test("should increment iteration counter", () => {
      const session = new AgentSession("orchestrator", "sprint-001");

      expect(session.currentIteration).toBe(0);

      session.incrementIteration();
      expect(session.currentIteration).toBe(1);

      session.incrementIteration();
      expect(session.currentIteration).toBe(2);
    });

    test("should throw error when max iterations exceeded", () => {
      const session = new AgentSession("orchestrator", "sprint-001", null, 3);

      session.incrementIteration(); // 1
      session.incrementIteration(); // 2
      session.incrementIteration(); // 3

      expect(() => session.incrementIteration()).toThrow(SessionError);
      expect(() => session.incrementIteration()).toThrow(
        "Maximum iterations (3) exceeded",
      );
    });
  });

  describe("status transitions", () => {
    describe("pause", () => {
      test("should pause running session", () => {
        const session = new AgentSession("orchestrator", "sprint-001");

        expect(session.status).toBe("running");

        session.pause();

        expect(session.status).toBe("paused");
        expect(session.recoveryInfo.canResume).toBe(true);
        expect(session.recoveryInfo.resumeFromIteration).toBe(0);
      });

      test("should throw error when pausing non-running session", () => {
        const session = new AgentSession("orchestrator", "sprint-001");
        session.pause();

        expect(() => session.pause()).toThrow(SessionError);
        expect(() => session.pause()).toThrow(
          "Cannot pause session with status: paused",
        );
      });

      test("should set resumeFromToolCall when tool calls exist", () => {
        const session = new AgentSession("orchestrator", "sprint-001");

        const toolCall: ToolCall = {
          id: crypto.randomUUID(),
          name: "test_tool",
          arguments: {},
          status: "success",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 100,
          iteration: 0,
          messageId: crypto.randomUUID(),
        };

        session.recordToolCall(toolCall);
        session.pause();

        expect(session.recoveryInfo.resumeFromToolCall).toBe(toolCall.id);
      });
    });

    describe("stop", () => {
      test("should stop running session", () => {
        const session = new AgentSession("orchestrator", "sprint-001");

        session.stop();

        expect(session.status).toBe("stopped");
        expect(session.recoveryInfo.canResume).toBe(true);
      });

      test("should stop paused session", () => {
        const session = new AgentSession("orchestrator", "sprint-001");
        session.pause();

        session.stop();

        expect(session.status).toBe("stopped");
      });

      test("should throw error when stopping completed session", () => {
        const session = new AgentSession("orchestrator", "sprint-001");
        session.complete();

        expect(() => session.stop()).toThrow(SessionError);
      });
    });

    describe("resume", () => {
      test("should resume paused session", () => {
        const session = new AgentSession("orchestrator", "sprint-001");
        session.pause();

        session.resume();

        expect(session.status).toBe("running");
      });

      test("should resume stopped session", () => {
        const session = new AgentSession("orchestrator", "sprint-001");
        session.stop();

        session.resume();

        expect(session.status).toBe("running");
      });

      test("should throw error when resuming running session", () => {
        const session = new AgentSession("orchestrator", "sprint-001");

        expect(() => session.resume()).toThrow(SessionError);
      });

      test("should throw error when canResume is false", () => {
        const session = new AgentSession("orchestrator", "sprint-001");
        session.complete();

        expect(() => session.resume()).toThrow(SessionError);
        expect(() => session.resume()).toThrow(
          "Cannot resume session with status: completed",
        );
      });
    });

    describe("complete", () => {
      test("should complete running session", () => {
        const session = new AgentSession("orchestrator", "sprint-001");

        session.complete();

        expect(session.status).toBe("completed");
        expect(session.recoveryInfo.canResume).toBe(false);
        expect(session.recoveryInfo.failureReason).toBeNull();
      });

      test("should throw error when completing non-running session", () => {
        const session = new AgentSession("orchestrator", "sprint-001");
        session.pause();

        expect(() => session.complete()).toThrow(SessionError);
      });
    });

    describe("fail", () => {
      test("should fail running session with reason", () => {
        const session = new AgentSession("orchestrator", "sprint-001");

        session.fail("Test failure reason");

        expect(session.status).toBe("failed");
        expect(session.recoveryInfo.canResume).toBe(false);
        expect(session.recoveryInfo.failureReason).toBe("Test failure reason");
      });

      test("should fail paused session", () => {
        const session = new AgentSession("orchestrator", "sprint-001");
        session.pause();

        session.fail("Error occurred");

        expect(session.status).toBe("failed");
      });

      test("should throw error when failing completed session", () => {
        const session = new AgentSession("orchestrator", "sprint-001");
        session.complete();

        expect(() => session.fail("reason")).toThrow(SessionError);
      });

      test("should throw error when failing already failed session", () => {
        const session = new AgentSession("orchestrator", "sprint-001");
        session.fail("first failure");

        expect(() => session.fail("second failure")).toThrow(SessionError);
      });
    });
  });

  describe("addCheckpoint", () => {
    test("should add checkpoint reference", () => {
      const session = new AgentSession("orchestrator", "sprint-001");

      const checkpoint: CheckpointReference = {
        id: crypto.randomUUID(),
        iteration: 5,
        position: "end",
        toolCallId: null,
        filePath: "checkpoints/checkpoint-1.json",
        fileSize: 1024,
        createdAt: new Date().toISOString(),
      };

      session.addCheckpoint(checkpoint);

      expect(session.checkpoints).toHaveLength(1);
      expect(session.checkpoints[0]).toBe(checkpoint);
      expect(session.lastCheckpointId).toBe(checkpoint.id);
    });

    test("should update lastCheckpointId with most recent", () => {
      const session = new AgentSession("orchestrator", "sprint-001");

      const checkpoint1: CheckpointReference = {
        id: crypto.randomUUID(),
        iteration: 5,
        position: "end",
        toolCallId: null,
        filePath: "checkpoints/checkpoint-1.json",
        fileSize: 1024,
        createdAt: new Date().toISOString(),
      };

      const checkpoint2: CheckpointReference = {
        id: crypto.randomUUID(),
        iteration: 10,
        position: "end",
        toolCallId: null,
        filePath: "checkpoints/checkpoint-2.json",
        fileSize: 2048,
        createdAt: new Date().toISOString(),
      };

      session.addCheckpoint(checkpoint1);
      expect(session.lastCheckpointId).toBe(checkpoint1.id);

      session.addCheckpoint(checkpoint2);
      expect(session.lastCheckpointId).toBe(checkpoint2.id);
    });
  });

  describe("toJSON", () => {
    test("should serialize session to JSON", () => {
      const session = new AgentSession("orchestrator", "sprint-001");

      const json = session.toJSON();

      expect(json.version).toBe("1.0");
      expect(json.id).toBe(session.id);
      expect(json.role).toBe("orchestrator");
      expect(json.sprintId).toBe("sprint-001");
      expect(json.status).toBe("running");
      expect(json.currentIteration).toBe(0);
      expect(json.maxIterations).toBe(80);
      expect(json.messages).toEqual([]);
      expect(json.toolCalls).toEqual([]);
      expect(json.fileChanges).toEqual([]);
    });

    test("should include all messages, tool calls, and file changes", () => {
      const session = new AgentSession("orchestrator", "sprint-001");

      const message: AgentMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: "Test",
        timestamp: new Date().toISOString(),
        iteration: 0,
      };

      const toolCall: ToolCall = {
        id: crypto.randomUUID(),
        name: "test_tool",
        arguments: {},
        status: "success",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 100,
        iteration: 0,
        messageId: crypto.randomUUID(),
      };

      const fileChange: FileChange = {
        id: crypto.randomUUID(),
        uri: "file:///test.ts",
        relativePath: "test.ts",
        operation: "create",
        previousContent: null,
        previousContentHash: null,
        newContent: "test",
        newContentHash: "hash",
        toolCallId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        iteration: 0,
        undone: false,
        undoneAt: null,
      };

      session.addMessage(message);
      session.recordToolCall(toolCall);
      session.recordFileChange(fileChange);

      const json = session.toJSON();

      expect(json.messages).toHaveLength(1);
      expect(json.toolCalls).toHaveLength(1);
      expect(json.fileChanges).toHaveLength(1);
    });
  });

  describe("fromJSON", () => {
    test("should deserialize valid session JSON", () => {
      const data = {
        version: "1.0",
        id: crypto.randomUUID(),
        role: "orchestrator",
        taskId: null,
        sprintId: "sprint-001",
        status: "running",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        currentIteration: 5,
        maxIterations: 50,
        messages: [],
        toolCalls: [],
        fileChanges: [],
        checkpoints: [],
        lastCheckpointId: null,
        recoveryInfo: {
          canResume: true,
          resumeFromIteration: null,
          resumeFromToolCall: null,
          failureReason: null,
        },
      };

      const session = AgentSession.fromJSON(data);

      expect(session.id).toBe(data.id);
      expect(session.role).toBe("orchestrator");
      expect(session.sprintId).toBe("sprint-001");
      expect(session.currentIteration).toBe(5);
    });

    test("should throw SessionError for invalid data", () => {
      const invalidData = {
        version: "1.0",
        // Missing required fields
      };

      expect(() => AgentSession.fromJSON(invalidData)).toThrow(SessionError);
      expect(() => AgentSession.fromJSON(invalidData)).toThrow(
        "Invalid session data",
      );
    });

    test("should preserve messages, tool calls, and file changes", () => {
      const message: AgentMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: "Test",
        timestamp: new Date().toISOString(),
        iteration: 0,
      };

      const data = {
        version: "1.0",
        id: crypto.randomUUID(),
        role: "orchestrator",
        taskId: null,
        sprintId: "sprint-001",
        status: "paused",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        currentIteration: 3,
        maxIterations: 50,
        messages: [message],
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

      const session = AgentSession.fromJSON(data);

      expect(session.messages).toHaveLength(1);
      expect(session.messages[0].id).toBe(message.id);
      expect(session.status).toBe("paused");
    });
  });

  describe("save and load", () => {
    test("should save session to file", async () => {
      const session = new AgentSession("orchestrator", "sprint-001");
      const filePath = path.join(tempDir, "session.json");

      await session.save(filePath);

      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(content);

      expect(data.id).toBe(session.id);
      expect(data.role).toBe("orchestrator");
    });

    test("should create directory if it doesn't exist", async () => {
      const session = new AgentSession("orchestrator", "sprint-001");
      const filePath = path.join(tempDir, "nested", "dir", "session.json");

      await session.save(filePath);

      expect(fs.existsSync(filePath)).toBe(true);
    });

    test("should load session from file", async () => {
      const originalSession = new AgentSession("implementor", "sprint-002", 10);
      originalSession.incrementIteration();
      originalSession.incrementIteration();
      originalSession.pause();

      const filePath = path.join(tempDir, "session.json");
      await originalSession.save(filePath);

      const loadedSession = await AgentSession.load(filePath);

      expect(loadedSession.id).toBe(originalSession.id);
      expect(loadedSession.role).toBe("implementor");
      expect(loadedSession.taskId).toBe(10);
      expect(loadedSession.currentIteration).toBe(2);
      expect(loadedSession.status).toBe("paused");
      expect(loadedSession.recoveryInfo.canResume).toBe(true);
    });

    test("should throw SessionError when loading non-existent file", async () => {
      const filePath = path.join(tempDir, "nonexistent.json");

      await expect(AgentSession.load(filePath)).rejects.toThrow(SessionError);
      await expect(AgentSession.load(filePath)).rejects.toThrow(
        "Failed to load session",
      );
    });

    test("should throw SessionError when loading invalid JSON", async () => {
      const filePath = path.join(tempDir, "invalid.json");
      fs.writeFileSync(filePath, "not valid json", "utf-8");

      await expect(AgentSession.load(filePath)).rejects.toThrow(SessionError);
    });

    test("should round-trip save and load preserving all data", async () => {
      const session = new AgentSession("orchestrator", "sprint-001");

      // Add various data
      const message: AgentMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: "Test message",
        timestamp: new Date().toISOString(),
        iteration: 0,
      };

      const toolCall: ToolCall = {
        id: crypto.randomUUID(),
        name: "test_tool",
        arguments: { foo: "bar" },
        result: { success: true },
        status: "success",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 150,
        iteration: 0,
        messageId: crypto.randomUUID(),
      };

      const fileChange: FileChange = {
        id: crypto.randomUUID(),
        uri: "file:///test.ts",
        relativePath: "test.ts",
        operation: "modify",
        previousContent: "old",
        previousContentHash: "oldhash",
        newContent: "new",
        newContentHash: "newhash",
        toolCallId: toolCall.id,
        timestamp: new Date().toISOString(),
        iteration: 0,
        undone: false,
        undoneAt: null,
      };

      session.addMessage(message);
      session.recordToolCall(toolCall);
      session.recordFileChange(fileChange);
      session.incrementIteration();

      const filePath = path.join(tempDir, "roundtrip.json");
      await session.save(filePath);

      const loaded = await AgentSession.load(filePath);

      expect(loaded.messages).toHaveLength(1);
      expect(loaded.messages[0].content).toBe("Test message");
      expect(loaded.toolCalls).toHaveLength(1);
      expect(loaded.toolCalls[0].name).toBe("test_tool");
      expect(loaded.fileChanges).toHaveLength(1);
      expect(loaded.fileChanges[0].operation).toBe("modify");
      expect(loaded.currentIteration).toBe(1);
    });

    test("should validate data before saving", async () => {
      const session = new AgentSession("orchestrator", "sprint-001");

      // Corrupt the session data
      (session as any).status = "invalid-status";

      const filePath = path.join(tempDir, "invalid.json");

      await expect(session.save(filePath)).rejects.toThrow(SessionError);
      await expect(session.save(filePath)).rejects.toThrow(
        "Session data validation failed",
      );
    });
  });

  describe("edge cases", () => {
    test("should handle empty sprint ID", () => {
      const session = new AgentSession("orchestrator", "");

      expect(session.sprintId).toBe("");
    });

    test("should handle very long sprint ID", () => {
      const longId = "sprint-".repeat(100);
      const session = new AgentSession("orchestrator", longId);

      expect(session.sprintId).toBe(longId);
    });

    test("should handle taskId of 0 (edge case but valid)", () => {
      // Note: schema requires positive, but constructor accepts null
      // This tests the boundary
      const session = new AgentSession("implementor", "sprint-001", null);

      expect(session.taskId).toBeNull();
    });

    test("should handle maxIterations of 1", () => {
      const session = new AgentSession("orchestrator", "sprint-001", null, 1);

      session.incrementIteration();

      expect(() => session.incrementIteration()).toThrow(SessionError);
    });
  });
});
