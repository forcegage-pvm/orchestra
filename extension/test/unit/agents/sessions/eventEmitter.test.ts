/**
 * Tests for SessionEventEmitter
 *
 * Verifies all emit methods create properly typed events and persist to database.
 * Tests iteration tracking, event generation, and database integration.
 *
 * These tests use in-memory SQLite database to verify the emitter works correctly
 * without requiring a full Orchestra workspace setup.
 *
 * Note: These tests require the Node.js-compiled better-sqlite3 module.
 * When the module is compiled for Electron (for VSIX packaging), these tests
 * will be skipped to avoid NODE_MODULE_VERSION mismatch errors.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

vi.mock("vscode", () => ({
  EventEmitter: class<T> {
    private listeners = new Set<(payload: T) => void>();

    event = (listener: (payload: T) => void) => {
      this.listeners.add(listener);
      return {
        dispose: () => {
          this.listeners.delete(listener);
        },
      };
    };

    fire(payload: T): void {
      this.listeners.forEach((listener) => listener(payload));
    }

    dispose(): void {
      this.listeners.clear();
    }
  },
}));

// Early detection of better-sqlite3 compatibility
let Database: typeof import("better-sqlite3").default | null = null;
let moduleCompatible = false;
try {
  const { loadBetterSqlite3 } = await import(
    "../../../../src/database/native-loader.js"
  );
  const loadedModule = loadBetterSqlite3() as unknown as {
    default?: typeof import("better-sqlite3").default;
  };
  const loadedDatabase =
    loadedModule.default ??
    (loadedModule as unknown as typeof import("better-sqlite3").default);
  Database = loadedDatabase;
  // Try to actually use it to confirm compatibility
  const testDb = new Database(":memory:");
  testDb.close();
  moduleCompatible = true;
} catch {
  moduleCompatible = false;
}

// Module compatibility flag for conditional test execution
const canRunTests = moduleCompatible && Database !== null;

// If module is not compatible, skip the entire file
if (!moduleCompatible) {
  describe.skip(
    "SessionEventEmitter (skipped: native module incompatible)",
    () => {
      it("skipped due to NODE_MODULE_VERSION mismatch", () => {});
    }
  );
} else {
  // Import dependencies only if module is compatible
  const { SessionEventEmitter } = await import(
    "../../../../src/agents/sessions/eventEmitter.js"
  );
  const { getAgentEventBus, disposeAgentEventBus } = await import(
    "../../../../src/agents/sessions/eventBus.js"
  );
  const { getEventsForSession } = await import(
    "../../../../src/agents/sessions/eventRepository.js"
  );
  const { OrchestraDB } = await import("../../../../src/database/client.js");

  // Test fixtures
  let testWorkspaceRoot: string;
  let testDbPath: string;

  /**
   * Create a minimal Orchestra database for testing
   */
  function createTestDatabase(dbPath: string): void {
    if (!canRunTests) return;
    const db = new Database!(dbPath);

    // Create agent_sessions table (required for foreign key)
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY,
        task_id INTEGER NOT NULL,
        sprint_id TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        status_message TEXT,
        started_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        ended_at TEXT,
        iteration INTEGER NOT NULL DEFAULT 0,
        max_iterations INTEGER NOT NULL DEFAULT 50,
        tool_call_count INTEGER NOT NULL DEFAULT 0,
        successful_tool_calls INTEGER NOT NULL DEFAULT 0,
        failed_tool_calls INTEGER NOT NULL DEFAULT 0,
        warning_count INTEGER NOT NULL DEFAULT 0,
        files_modified JSON NOT NULL DEFAULT '[]',
        duration_ms INTEGER
      )
    `);

    // Create session_events table
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        iteration INTEGER NOT NULL,
        tool_call_id TEXT,
        tool_name TEXT,
        success INTEGER,
        duration_ms INTEGER,
        severity TEXT,
        payload JSON NOT NULL,
        FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);
      CREATE INDEX IF NOT EXISTS idx_events_tool_call ON session_events(tool_call_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON session_events(session_id, type);
    `);

    db.close();
  }

  /**
   * Insert a test session for foreign key constraints
   */
  function insertTestSession(sessionId: string): void {
    if (!canRunTests) return;
    const db = new Database!(testDbPath);
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO agent_sessions (id, task_id, sprint_id, role, status, started_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(sessionId, 1, "sprint-001", "implementor", "running", now, now);

    db.close();
  }

  // Skip all tests if better-sqlite3 module is incompatible
  const describeIfCompatible = canRunTests ? describe : describe.skip;

  describeIfCompatible("SessionEventEmitter", () => {
    let emitter: InstanceType<typeof SessionEventEmitter>;
    const sessionId = "test-session-123";

    beforeEach(() => {
      // Create temporary directory for test database
      testWorkspaceRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "orchestra-emitter-test-")
      );

      // Create .orchestra directory structure
      const orchestraDir = path.join(testWorkspaceRoot, ".orchestra");
      fs.mkdirSync(orchestraDir, { recursive: true });

      // Create test database
      testDbPath = path.join(orchestraDir, "orchestra.db");
      createTestDatabase(testDbPath);

      // Insert test session
      insertTestSession(sessionId);

      // Create emitter instance
      emitter = new SessionEventEmitter(testWorkspaceRoot, sessionId);
    });

    afterEach(() => {
      // Close database connection before cleanup
      OrchestraDB.close();

      disposeAgentEventBus();

      // Clean up test workspace
      fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
    });

    describe("Constructor and Iteration Tracking", () => {
      it("should create emitter with workspace root and session ID", () => {
        expect(emitter).toBeDefined();
        expect(emitter).toBeInstanceOf(SessionEventEmitter);
      });

      it("should start with iteration 0 by default", () => {
        const event = emitter.emitPrompt("Test prompt");
        expect(event.iteration).toBe(0);
      });

      it("should update iteration via setIteration", () => {
        emitter.setIteration(5);
        const event = emitter.emitPrompt("Test prompt");
        expect(event.iteration).toBe(5);
      });

      it("should track iteration across multiple events", () => {
        emitter.setIteration(1);
        const event1 = emitter.emitPrompt("First");
        expect(event1.iteration).toBe(1);

        emitter.setIteration(2);
        const event2 = emitter.emitThinking("Second");
        expect(event2.iteration).toBe(2);

        emitter.setIteration(3);
        const event3 = emitter.emitStatusChange(
          "initializing",
          "running",
          "Started"
        );
        expect(event3.iteration).toBe(3);
      });
    });

    describe("emitPrompt", () => {
      it("should create and persist PromptEvent", () => {
        const event = emitter.emitPrompt("Implement the feature");

        expect(event.id).toBeDefined();
        expect(event.sessionId).toBe(sessionId);
        expect(event.timestamp).toBeDefined();
        expect(event.type).toBe("prompt");
        expect(event.text).toBe("Implement the feature");
        expect(event.attachments).toBeUndefined();

        // Verify persistence
        const events = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("prompt");
      });

      it("should emit session_event payload on AgentEventBus", () => {
        const eventBus = getAgentEventBus();
        const emitSpy = vi.spyOn(eventBus, "emit");

        const event = emitter.emitPrompt("Stream this prompt");

        expect(emitSpy).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledWith({
          type: "session_event",
          event,
        });
      });

      it("should create PromptEvent with attachments", () => {
        const attachments = [
          { path: "src/main.ts", name: "main.ts", mimeType: "text/typescript" },
        ];
        const event = emitter.emitPrompt("Review this file", attachments);

        expect(event.attachments).toEqual(attachments);
        expect(event.attachments).toHaveLength(1);
      });

      it("should generate unique IDs for multiple prompts", () => {
        const event1 = emitter.emitPrompt("First prompt");
        const event2 = emitter.emitPrompt("Second prompt");

        expect(event1.id).not.toBe(event2.id);
      });
    });

    describe("emitThinking", () => {
      it("should create and persist ThinkingEvent", () => {
        const event = emitter.emitThinking("I need to analyze the requirements");

        expect(event.id).toBeDefined();
        expect(event.sessionId).toBe(sessionId);
        expect(event.type).toBe("thinking");
        expect(event.text).toBe("I need to analyze the requirements");
        expect(event.tokenCount).toBeUndefined();

        // Verify persistence
        const events = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("thinking");
      });

      it("should emit session_event payload on AgentEventBus", () => {
        const eventBus = getAgentEventBus();
        const emitSpy = vi.spyOn(eventBus, "emit");

        const event = emitter.emitThinking("Stream this thought");

        expect(emitSpy).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledWith({
          type: "session_event",
          event,
        });

        emitSpy.mockRestore();
      });

      it("should create ThinkingEvent with token count", () => {
        const event = emitter.emitThinking("Planning implementation", 250);

        expect(event.tokenCount).toBe(250);
      });

      it("should use current timestamp for thinking events", () => {
        const before = new Date().toISOString();
        const event = emitter.emitThinking("Thinking...");
        const after = new Date().toISOString();

        expect(event.timestamp >= before).toBe(true);
        expect(event.timestamp <= after).toBe(true);
      });
    });

    describe("emitStatusChange", () => {
      it("should create and persist StatusChangeEvent", () => {
        const event = emitter.emitStatusChange(
          "initializing",
          "running",
          "Agent started"
        );

        expect(event.id).toBeDefined();
        expect(event.type).toBe("status_change");
        expect(event.previousStatus).toBe("initializing");
        expect(event.newStatus).toBe("running");
        expect(event.message).toBe("Agent started");

        // Verify persistence
        const events = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(events).toHaveLength(1);
      });

      it("should emit session_event payload on AgentEventBus", () => {
        const eventBus = getAgentEventBus();
        const emitSpy = vi.spyOn(eventBus, "emit");

        const event = emitter.emitStatusChange(
          "initializing",
          "running",
          "Agent started"
        );

        expect(emitSpy).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledWith({
          type: "session_event",
          event,
        });
      });

      it("should create StatusChangeEvent without message", () => {
        const event = emitter.emitStatusChange("running", "completed");

        expect(event.previousStatus).toBe("running");
        expect(event.newStatus).toBe("completed");
        expect(event.message).toBeUndefined();
      });

      it("should track status progression", () => {
        emitter.emitStatusChange("initializing", "running");
        emitter.emitStatusChange("running", "waiting_for_tool");
        emitter.emitStatusChange("waiting_for_tool", "thinking");
        emitter.emitStatusChange("thinking", "completed");

        const events = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(events).toHaveLength(4);
        expect(events.every((e) => e.type === "status_change")).toBe(true);
      });
    });

    describe("emitError", () => {
      it("should create and persist ErrorEvent", () => {
        const event = emitter.emitError(
          "error",
          "FILE_NOT_FOUND",
          "File does not exist",
          false
        );

        expect(event.id).toBeDefined();
        expect(event.type).toBe("error");
        expect(event.severity).toBe("error");
        expect(event.code).toBe("FILE_NOT_FOUND");
        expect(event.message).toBe("File does not exist");
        expect(event.recoverable).toBe(false);
        expect(event.details).toBeUndefined();
        expect(event.suggestion).toBeUndefined();

        // Verify persistence
        const events = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(events).toHaveLength(1);
      });

      it("should emit session_event payload on AgentEventBus", () => {
        const eventBus = getAgentEventBus();
        const emitSpy = vi.spyOn(eventBus, "emit");

        const event = emitter.emitError(
          "error",
          "TEST_ERROR",
          "Something went wrong",
          false
        );

        expect(emitSpy).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledWith({
          type: "session_event",
          event,
        });

        emitSpy.mockRestore();
      });

      it("should create ErrorEvent with details and suggestion", () => {
        const details = { path: "src/missing.ts", line: 42 };
        const event = emitter.emitError(
          "warning",
          "PARSE_ERROR",
          "Syntax error detected",
          true,
          details,
          "Check file syntax"
        );

        expect(event.severity).toBe("warning");
        expect(event.details).toEqual(details);
        expect(event.suggestion).toBe("Check file syntax");
        expect(event.recoverable).toBe(true);
      });

      it("should differentiate between error and warning severity", () => {
        const error = emitter.emitError(
          "error",
          "CRITICAL",
          "Fatal error",
          false
        );
        const warning = emitter.emitError(
          "warning",
          "DEPRECATED",
          "API deprecated",
          true
        );

        expect(error.severity).toBe("error");
        expect(warning.severity).toBe("warning");
      });
    });

    describe("emitToolCall", () => {
      it("should create and persist ToolCallEvent", () => {
        const args = { path: "src/main.ts", startLine: 1, endLine: 10 };
        const event = emitter.emitToolCall(
          "tool-call-1",
          "read_file",
          "filesystem",
          args
        );

        expect(event.id).toBeDefined();
        expect(event.type).toBe("tool_call");
        expect(event.toolCallId).toBe("tool-call-1");
        expect(event.toolName).toBe("read_file");
        expect(event.toolCategory).toBe("filesystem");
        expect(event.arguments).toEqual(args);

        // Verify persistence
        const events = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(events).toHaveLength(1);
      });

      it("should emit session_event payload on AgentEventBus", () => {
        const eventBus = getAgentEventBus();
        const emitSpy = vi.spyOn(eventBus, "emit");

        const event = emitter.emitToolCall(
          "tool-call-1",
          "read_file",
          "filesystem",
          {}
        );

        expect(emitSpy).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledWith({
          type: "session_event",
          event,
        });

        emitSpy.mockRestore();
      });

      it("should handle all tool categories", () => {
        const coding = emitter.emitToolCall(
          "tool-1",
          "refactor",
          "coding",
          {}
        );
        const filesystem = emitter.emitToolCall(
          "tool-2",
          "list_dir",
          "filesystem",
          {}
        );
        const system = emitter.emitToolCall(
          "tool-3",
          "run_command",
          "system",
          {}
        );
        const orchestra = emitter.emitToolCall(
          "tool-4",
          "get_current_task",
          "orchestra",
          {}
        );

        expect(coding.toolCategory).toBe("coding");
        expect(filesystem.toolCategory).toBe("filesystem");
        expect(system.toolCategory).toBe("system");
        expect(orchestra.toolCategory).toBe("orchestra");
      });

      it("should handle complex arguments", () => {
        const args = {
          filePath: "src/complex.ts",
          options: { recursive: true, maxDepth: 5 },
          filters: ["*.ts", "*.js"],
        };
        const event = emitter.emitToolCall(
          "tool-1",
          "complex_tool",
          "coding",
          args
        );

        expect(event.arguments).toEqual(args);
      });
    });

    describe("emitToolProgress", () => {
      it("should create and persist ToolProgressEvent", () => {
        const event = emitter.emitToolProgress(
          "tool-1",
          "build",
          "Compiling TypeScript..."
        );

        expect(event.id).toBeDefined();
        expect(event.type).toBe("tool_progress");
        expect(event.toolCallId).toBe("tool-1");
        expect(event.toolName).toBe("build");
        expect(event.message).toBe("Compiling TypeScript...");
        expect(event.percent).toBeUndefined();

        // Verify persistence
        const events = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(events).toHaveLength(1);
      });

      it("should emit session_event payload on AgentEventBus", () => {
        const eventBus = getAgentEventBus();
        const emitSpy = vi.spyOn(eventBus, "emit");

        const event = emitter.emitToolProgress(
          "tool-1",
          "build",
          "Compiling TypeScript..."
        );

        expect(emitSpy).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledWith({
          type: "session_event",
          event,
        });

        emitSpy.mockRestore();
      });

      it("should create ToolProgressEvent with percentage", () => {
        const event = emitter.emitToolProgress(
          "tool-1",
          "download",
          "Downloading...",
          75
        );

        expect(event.percent).toBe(75);
      });

      it("should track progress sequence", () => {
        emitter.emitToolProgress("tool-1", "build", "Starting...", 0);
        emitter.emitToolProgress("tool-1", "build", "Compiling...", 50);
        emitter.emitToolProgress("tool-1", "build", "Linking...", 75);
        emitter.emitToolProgress("tool-1", "build", "Complete!", 100);

        const events = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(events).toHaveLength(4);
        expect(events.every((e) => e.type === "tool_progress")).toBe(true);
      });
    });

    describe("emitToolOutput", () => {
      it("should create and persist ToolOutputEvent", () => {
        const event = emitter.emitToolOutput(
          "tool-1",
          "run_command",
          "Building project..."
        );

        expect(event.id).toBeDefined();
        expect(event.type).toBe("tool_output");
        expect(event.toolCallId).toBe("tool-1");
        expect(event.toolName).toBe("run_command");
        expect(event.chunk).toBe("Building project...");
        expect(event.isStderr).toBeUndefined();

        // Verify persistence
        const events = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(events).toHaveLength(1);
      });

      it("should emit session_event payload on AgentEventBus", () => {
        const eventBus = getAgentEventBus();
        const emitSpy = vi.spyOn(eventBus, "emit");

        const event = emitter.emitToolOutput(
          "tool-1",
          "run_command",
          "Streaming output..."
        );

        expect(emitSpy).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledWith({
          type: "session_event",
          event,
        });

        emitSpy.mockRestore();
      });

      it("should mark stderr output", () => {
        const stdout = emitter.emitToolOutput(
          "tool-1",
          "run_command",
          "stdout line",
          false
        );
        const stderr = emitter.emitToolOutput(
          "tool-1",
          "run_command",
          "stderr line",
          true
        );

        expect(stdout.isStderr).toBe(false);
        expect(stderr.isStderr).toBe(true);
      });

      it("should handle streaming output", () => {
        const chunks = ["Line 1\n", "Line 2\n", "Line 3\n"];
        chunks.forEach((chunk) => {
          emitter.emitToolOutput("tool-1", "run_command", chunk);
        });

        const events = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(events).toHaveLength(3);
      });
    });

    describe("emitToolFileOperation", () => {
      it("should create and persist ToolFileOperationEvent", () => {
        const operation = {
          operation: "create" as const,
          path: "src/new-file.ts",
          targetPath: undefined,
          size: 1024,
          linesChanged: undefined,
          linesInserted: 42,
          linesDeleted: undefined,
        };

        const event = emitter.emitToolFileOperation(
          "tool-1",
          "create_file",
          operation
        );

        expect(event.id).toBeDefined();
        expect(event.type).toBe("tool_file_operation");
        expect(event.toolCallId).toBe("tool-1");
        expect(event.toolName).toBe("create_file");
        expect(event.operation).toEqual(operation);

        // Verify persistence
        const events = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(events).toHaveLength(1);
      });

      it("should emit session_event payload on AgentEventBus", () => {
        const eventBus = getAgentEventBus();
        const emitSpy = vi.spyOn(eventBus, "emit");
        const operation = {
          operation: "create" as const,
          path: "src/new-file.ts",
          targetPath: undefined,
          size: 1024,
          linesChanged: undefined,
          linesInserted: 42,
          linesDeleted: undefined,
        };

        const event = emitter.emitToolFileOperation(
          "tool-1",
          "create_file",
          operation
        );

        expect(emitSpy).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledWith({
          type: "session_event",
          event,
        });

        emitSpy.mockRestore();
      });

      it("should handle all operation types", () => {
        emitter.emitToolFileOperation("tool-1", "create", {
          operation: "create",
          path: "file.ts",
          targetPath: undefined,
          size: 100,
          linesChanged: undefined,
          linesInserted: undefined,
          linesDeleted: undefined,
        });

        emitter.emitToolFileOperation("tool-2", "update", {
          operation: "update",
          path: "file.ts",
          targetPath: undefined,
          size: 150,
          linesChanged: 10,
          linesInserted: 5,
          linesDeleted: 3,
        });

        emitter.emitToolFileOperation("tool-3", "delete", {
          operation: "delete",
          path: "file.ts",
          targetPath: undefined,
          size: undefined,
          linesChanged: undefined,
          linesInserted: undefined,
          linesDeleted: undefined,
        });

        emitter.emitToolFileOperation("tool-4", "move", {
          operation: "move",
          path: "old.ts",
          targetPath: "new.ts",
          size: undefined,
          linesChanged: undefined,
          linesInserted: undefined,
          linesDeleted: undefined,
        });

        const events = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(events).toHaveLength(4);
      });
    });

    describe("emitToolMetadata", () => {
      it("should create and persist ToolMetadataEvent", () => {
        const event = emitter.emitToolMetadata(
          "tool-1",
          "analyze",
          "complexity",
          42
        );

        expect(event.id).toBeDefined();
        expect(event.type).toBe("tool_metadata");
        expect(event.toolCallId).toBe("tool-1");
        expect(event.toolName).toBe("analyze");
        expect(event.key).toBe("complexity");
        expect(event.value).toBe(42);

        // Verify persistence
        const events = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(events).toHaveLength(1);
      });

      it("should emit session_event payload on AgentEventBus", () => {
        const eventBus = getAgentEventBus();
        const emitSpy = vi.spyOn(eventBus, "emit");

        const event = emitter.emitToolMetadata(
          "tool-1",
          "analyze",
          "complexity",
          42
        );

        expect(emitSpy).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledWith({
          type: "session_event",
          event,
        });

        emitSpy.mockRestore();
      });

      it("should handle various metadata value types", () => {
        emitter.emitToolMetadata("tool-1", "tool", "string", "value");
        emitter.emitToolMetadata("tool-1", "tool", "number", 123);
        emitter.emitToolMetadata("tool-1", "tool", "boolean", true);
        emitter.emitToolMetadata("tool-1", "tool", "object", {
          nested: "data",
        });
        emitter.emitToolMetadata("tool-1", "tool", "array", [1, 2, 3]);

        const events = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(events).toHaveLength(5);
      });
    });

    describe("emitToolResult", () => {
      it("should create and persist ToolResultEvent for success", () => {
        const event = emitter.emitToolResult(
          "tool-1",
          "read_file",
          true,
          "File contents here",
          150
        );

        expect(event.id).toBeDefined();
        expect(event.type).toBe("tool_result");
        expect(event.toolCallId).toBe("tool-1");
        expect(event.toolName).toBe("read_file");
        expect(event.success).toBe(true);
        expect(event.output).toBe("File contents here");
        expect(event.durationMs).toBe(150);
        expect(event.error).toBeUndefined();

        // Verify persistence
        const events = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(events).toHaveLength(1);
      });

      it("should emit session_event payload on AgentEventBus", () => {
        const eventBus = getAgentEventBus();
        const emitSpy = vi.spyOn(eventBus, "emit");

        const event = emitter.emitToolResult(
          "tool-1",
          "read_file",
          true,
          "File contents here",
          150
        );

        expect(emitSpy).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledWith({
          type: "session_event",
          event,
        });
      });

      it("should create ToolResultEvent with error", () => {
        const error = {
          code: "FILE_NOT_FOUND" as const,
          message: "File does not exist",
          suggestion: "Check the file path",
          details: { path: "missing.ts" },
        };

        const event = emitter.emitToolResult(
          "tool-1",
          "read_file",
          false,
          "",
          50,
          error
        );

        expect(event.success).toBe(false);
        expect(event.error).toEqual(error);
      });

      it("should track tool execution timing", () => {
        emitter.emitToolResult("tool-1", "fast", true, "output", 10);
        emitter.emitToolResult("tool-2", "slow", true, "output", 5000);

        const events = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(events).toHaveLength(2);
      });
    });

    describe("emitSessionStart", () => {
      it("should emit session_start payload on AgentEventBus", () => {
        const eventBus = getAgentEventBus();
        const emitSpy = vi.spyOn(eventBus, "emit");

        const session = {
          id: sessionId,
          role: "implementor" as const,
          status: "running" as const,
          startedAt: new Date().toISOString(),
          taskId: 1,
          taskTitle: "Test Task",
        };

        emitter.emitSessionStart(session);

        expect(emitSpy).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledWith({
          type: "session_start",
          session,
        });
      });
    });

    describe("emitSessionEnd", () => {
      it("should emit session_end payload on AgentEventBus", () => {
        const eventBus = getAgentEventBus();
        const emitSpy = vi.spyOn(eventBus, "emit");

        emitter.emitSessionEnd("completed");

        expect(emitSpy).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledWith({
          type: "session_end",
          sessionId,
          status: "completed",
        });
      });
    });

    describe("Complete Tool Call Sequence", () => {
      it("should emit complete tool call lifecycle", () => {
        const toolCallId = "tool-lifecycle-1";

        // 1. Tool call initiated
        emitter.emitToolCall(toolCallId, "build_project", "system", {
          target: "production",
        });

        // 2. Progress updates
        emitter.emitToolProgress(toolCallId, "build_project", "Starting...", 0);
        emitter.emitToolProgress(
          toolCallId,
          "build_project",
          "Compiling...",
          50
        );

        // 3. Output streaming
        emitter.emitToolOutput(toolCallId, "build_project", "Building...\n");
        emitter.emitToolOutput(toolCallId, "build_project", "Linking...\n");

        // 4. File operations
        emitter.emitToolFileOperation(toolCallId, "build_project", {
          operation: "create",
          path: "dist/bundle.js",
          targetPath: undefined,
          size: 50000,
          linesChanged: undefined,
          linesInserted: undefined,
          linesDeleted: undefined,
        });

        // 5. Metadata
        emitter.emitToolMetadata(
          toolCallId,
          "build_project",
          "bundle_size",
          50000
        );

        // 6. Completion
        emitter.emitToolResult(
          toolCallId,
          "build_project",
          true,
          "Build successful",
          2500
        );

        const events = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(events).toHaveLength(8);
      });
    });

    describe("Event ID Generation", () => {
      it("should generate unique UUIDs for all events", () => {
        const event1 = emitter.emitPrompt("Test 1");
        const event2 = emitter.emitThinking("Test 2");
        const event3 = emitter.emitStatusChange("running", "completed");

        const ids = new Set([event1.id, event2.id, event3.id]);
        expect(ids.size).toBe(3); // All unique
      });

      it("should generate valid UUID format", () => {
        const event = emitter.emitPrompt("Test");
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        expect(event.id).toMatch(uuidRegex);
      });
    });

    describe("Timestamp Generation", () => {
      it("should generate ISO 8601 timestamps", () => {
        const event = emitter.emitPrompt("Test");
        const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
        expect(event.timestamp).toMatch(isoRegex);
      });

      it("should generate ascending timestamps for sequential events", () => {
        const event1 = emitter.emitPrompt("First");
        const event2 = emitter.emitPrompt("Second");
        const event3 = emitter.emitPrompt("Third");

        expect(event1.timestamp <= event2.timestamp).toBe(true);
        expect(event2.timestamp <= event3.timestamp).toBe(true);
      });
    });

    describe("Session ID Association", () => {
      it("should associate all events with correct session ID", () => {
        emitter.emitPrompt("Test 1");
        emitter.emitThinking("Test 2");
        emitter.emitStatusChange("running", "completed");
        emitter.emitError("error", "TEST", "Test error", false);
        emitter.emitToolCall("tool-1", "test", "system", {});

        const events = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(events).toHaveLength(5);
        expect(events.every((e) => e.sessionId === sessionId)).toBe(true);
      });
    });
  });
}
