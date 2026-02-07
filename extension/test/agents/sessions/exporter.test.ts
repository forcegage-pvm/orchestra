/**
 * Tests for Agent Session Exporter
 *
 * Tests the exportSession function that builds SessionExport objects.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 10
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Early detection of better-sqlite3 compatibility
let Database: any = null;
let moduleCompatible = false;
try {
  Database = (await import("better-sqlite3")).default;
  const testDb = new Database(":memory:");
  testDb.close();
  moduleCompatible = true;
} catch {
  moduleCompatible = false;
}

// Additional check: try loading the native binary via the project's loader
// This catches cases where the packaged native module (extension's node_modules)
// was compiled for a different Node version than the test runtime.
if (moduleCompatible) {
  try {
    const { loadBetterSqlite3 } =
      await import("../../../src/database/native-loader.js");
    const Better = loadBetterSqlite3();
    const probe = new Better(":memory:");
    probe.close();
  } catch {
    moduleCompatible = false;
  }
}

const canRunTests = moduleCompatible && Database !== null;

if (!moduleCompatible) {
  describe.skip("Agent Session Exporter (skipped: native module incompatible)", () => {
    it("skipped due to NODE_MODULE_VERSION mismatch", () => {});
  });
} else {
  const { exportSession } =
    await import("../../../src/agents/sessions/exporter.js");
  const { createSession } =
    await import("../../../src/agents/sessions/sessionRepository.js");
  const { insertEventBatch } =
    await import("../../../src/agents/sessions/eventRepository.js");
  const { OrchestraDB } = await import("../../../src/database/client.js");
  const type = await import("../../../src/agents/sessions/types.js");

  // Test fixtures
  let testWorkspaceRoot: string;
  let testDbPath: string;

  /**
   * Create a minimal Orchestra database for testing
   */
  function createTestDatabase(dbPath: string): void {
    if (!canRunTests) return;
    const db = new Database!(dbPath);

    // Create tasks table (required for foreign key references)
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sprint_id TEXT NOT NULL,
        phase_id INTEGER NOT NULL,
        task_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        dependencies TEXT NOT NULL DEFAULT '[]',
        speckit_task_ref TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        tdd_red_phase INTEGER DEFAULT 0
      )
    `);

    // Create agent_sessions table
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
        stage TEXT,
        parent_session_id TEXT,
        attempt INTEGER NOT NULL DEFAULT 0,
        is_continued INTEGER NOT NULL DEFAULT 0,
        continued_at TEXT,
        continuation_count INTEGER NOT NULL DEFAULT 0,
        files_modified JSON NOT NULL DEFAULT '[]',
        duration_ms INTEGER,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `);

    // Create session_events table
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        iteration INTEGER NOT NULL DEFAULT 0,
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
      CREATE INDEX IF NOT EXISTS idx_sessions_task ON agent_sessions(task_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_role ON agent_sessions(task_id, role);
      CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON session_events(session_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_tool_call ON session_events(session_id, tool_call_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON session_events(session_id, type);
    `);

    db.close();
  }

  /**
   * Insert a test task for foreign key constraints
   */
  function insertTestTask(
    taskId: number,
    sprintId: string = "sprint-001",
  ): void {
    if (!canRunTests) return;
    const db = new Database!(testDbPath);
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO tasks (id, sprint_id, phase_id, task_id, title, description, category, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      taskId,
      sprintId,
      1,
      taskId,
      `Task ${taskId}`,
      "Test task",
      "implementation",
      "PENDING",
      now,
      now,
    );

    db.close();
  }

  describe("exportSession", () => {
    beforeEach(() => {
      // Create temporary directory for test database
      testWorkspaceRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "orchestra-exporter-test-"),
      );
      testDbPath = path.join(testWorkspaceRoot, ".orchestra", "orchestra.db");

      // Create .orchestra directory
      fs.mkdirSync(path.dirname(testDbPath), { recursive: true });

      // Create test database
      createTestDatabase(testDbPath);

      // Mock Date for consistent timestamps
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-01T14:30:52.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();

      // Close database connection
      OrchestraDB.close();

      // Clean up temporary directory
      if (fs.existsSync(testWorkspaceRoot)) {
        fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
      }
    });

    it("should export session with all events", () => {
      // Insert test task for foreign key constraint
      insertTestTask(42);

      // Create a test session
      const session: Omit<type.AgentSession, "sessionId"> = {
        role: "implementor",
        taskId: 42,
        taskTitle: "Test Task",
        sprintId: "sprint-001",
        startedAt: "2026-02-01T14:00:00.000Z",
        lastActivityAt: "2026-02-01T14:30:00.000Z",
        endedAt: "2026-02-01T14:30:00.000Z",
        status: "completed",
        statusMessage: "Task completed successfully",
        iteration: 5,
        maxIterations: 10,
        toolCallCount: 3,
        successfulToolCalls: 3,
        failedToolCalls: 0,
        warningCount: 0,
        filesModified: ["src/test.ts"],
        durationMs: 1800000,
      };

      const createdSession = createSession(testWorkspaceRoot, session);

      // Create test events
      const events: type.AgentEvent[] = [
        {
          id: "event-1",
          sessionId: createdSession.sessionId,
          timestamp: "2026-02-01T14:00:00.000Z",
          iteration: 1,
          type: "prompt",
          text: "Implement feature X",
          attachments: undefined,
        } as type.PromptEvent,
        {
          id: "event-2",
          sessionId: createdSession.sessionId,
          timestamp: "2026-02-01T14:00:05.000Z",
          iteration: 1,
          type: "thinking",
          text: "Analyzing requirements...",
          tokenCount: 150,
        } as type.ThinkingEvent,
        {
          id: "event-3",
          sessionId: createdSession.sessionId,
          timestamp: "2026-02-01T14:01:00.000Z",
          iteration: 1,
          type: "tool_call",
          toolCallId: "tool-1",
          toolName: "read_file",
          toolCategory: "filesystem",
          arguments: { path: "src/test.ts" },
        } as type.ToolCallEvent,
        {
          id: "event-4",
          sessionId: createdSession.sessionId,
          timestamp: "2026-02-01T14:01:05.000Z",
          iteration: 1,
          type: "tool_result",
          toolCallId: "tool-1",
          toolName: "read_file",
          success: true,
          output: "file contents...",
          error: undefined,
          durationMs: 50,
        } as type.ToolResultEvent,
      ];

      insertEventBatch(testWorkspaceRoot, events);

      // Export the session
      const exportData = exportSession(
        testWorkspaceRoot,
        createdSession.sessionId,
      );

      // Verify export structure
      expect(exportData).toMatchObject({
        exportedAt: "2026-02-01T14:30:52.000Z",
        version: "1.0",
        session: {
          sessionId: createdSession.sessionId,
          role: "implementor",
          taskId: 42,
          sprintId: "sprint-001",
          status: "completed",
        },
        events: expect.arrayContaining([
          expect.objectContaining({ id: "event-1", type: "prompt" }),
          expect.objectContaining({ id: "event-2", type: "thinking" }),
          expect.objectContaining({ id: "event-3", type: "tool_call" }),
          expect.objectContaining({ id: "event-4", type: "tool_result" }),
        ]),
      });

      expect(exportData.events).toHaveLength(4);
    });

    it("should export session with empty events array", () => {
      // Insert test task for foreign key constraint
      insertTestTask(10);

      // Create a session with no events
      const session: Omit<type.AgentSession, "sessionId"> = {
        role: "orchestrator",
        taskId: 10,
        taskTitle: undefined,
        sprintId: "sprint-002",
        startedAt: "2026-02-01T14:00:00.000Z",
        lastActivityAt: "2026-02-01T14:00:00.000Z",
        endedAt: undefined,
        status: "initializing",
        statusMessage: undefined,
        iteration: 0,
        maxIterations: 10,
        toolCallCount: 0,
        successfulToolCalls: 0,
        failedToolCalls: 0,
        warningCount: 0,
        filesModified: [],
        durationMs: undefined,
      };

      const createdSession = createSession(testWorkspaceRoot, session);

      // Export the session
      const exportData = exportSession(
        testWorkspaceRoot,
        createdSession.sessionId,
      );

      // Verify structure with empty events
      expect(exportData).toMatchObject({
        exportedAt: "2026-02-01T14:30:52.000Z",
        version: "1.0",
        session: {
          sessionId: createdSession.sessionId,
          role: "orchestrator",
          taskId: 10,
          sprintId: "sprint-002",
          status: "initializing",
        },
        events: [],
      });
    });

    it("should throw error if session does not exist", () => {
      const nonExistentSessionId = "00000000-0000-0000-0000-000000000000";

      expect(() => {
        exportSession(testWorkspaceRoot, nonExistentSessionId);
      }).toThrow(`Session not found: ${nonExistentSessionId}`);
    });

    it("should set exportedAt to current timestamp", () => {
      // Insert test task for foreign key constraint
      insertTestTask(1);

      // Create a session
      const session: Omit<type.AgentSession, "sessionId"> = {
        role: "implementor",
        taskId: 1,
        taskTitle: "Test",
        sprintId: "sprint-001",
        startedAt: "2026-01-01T10:00:00.000Z",
        lastActivityAt: "2026-01-01T10:00:00.000Z",
        endedAt: undefined,
        status: "running",
        statusMessage: undefined,
        iteration: 1,
        maxIterations: 10,
        toolCallCount: 0,
        successfulToolCalls: 0,
        failedToolCalls: 0,
        warningCount: 0,
        filesModified: [],
        durationMs: undefined,
      };

      const createdSession = createSession(testWorkspaceRoot, session);

      // Export and verify timestamp
      const exportData = exportSession(
        testWorkspaceRoot,
        createdSession.sessionId,
      );

      expect(exportData.exportedAt).toBe("2026-02-01T14:30:52.000Z");
    });

    it("should always set version to '1.0'", () => {
      // Insert test task for foreign key constraint
      insertTestTask(99);

      // Create a session
      const session: Omit<type.AgentSession, "sessionId"> = {
        role: "controller",
        taskId: 99,
        taskTitle: "Controller Task",
        sprintId: "sprint-003",
        startedAt: "2026-02-01T12:00:00.000Z",
        lastActivityAt: "2026-02-01T12:00:00.000Z",
        endedAt: undefined,
        status: "running",
        statusMessage: undefined,
        iteration: 2,
        maxIterations: 5,
        toolCallCount: 1,
        successfulToolCalls: 1,
        failedToolCalls: 0,
        warningCount: 0,
        filesModified: [],
        durationMs: undefined,
      };

      const createdSession = createSession(testWorkspaceRoot, session);

      // Export and verify version
      const exportData = exportSession(
        testWorkspaceRoot,
        createdSession.sessionId,
      );

      expect(exportData.version).toBe("1.0");
    });

    it("should include complete session data in export", () => {
      // Insert test task for foreign key constraint
      insertTestTask(42);

      // Create a session with all fields populated
      const session: Omit<type.AgentSession, "sessionId"> = {
        role: "implementor",
        taskId: 42,
        taskTitle: "Full Featured Task",
        sprintId: "sprint-001",
        startedAt: "2026-02-01T14:00:00.000Z",
        lastActivityAt: "2026-02-01T14:30:00.000Z",
        endedAt: "2026-02-01T14:30:00.000Z",
        status: "completed",
        statusMessage: "All tests passed",
        iteration: 8,
        maxIterations: 10,
        toolCallCount: 25,
        successfulToolCalls: 23,
        failedToolCalls: 2,
        warningCount: 3,
        filesModified: ["src/file1.ts", "src/file2.ts", "test/file1.test.ts"],
        durationMs: 1800000,
      };

      const createdSession = createSession(testWorkspaceRoot, session);

      // Export and verify all fields are preserved
      const exportData = exportSession(
        testWorkspaceRoot,
        createdSession.sessionId,
      );

      expect(exportData.session).toMatchObject({
        sessionId: createdSession.sessionId,
        role: "implementor",
        taskId: 42,
        sprintId: "sprint-001",
        startedAt: "2026-02-01T14:00:00.000Z",
        lastActivityAt: "2026-02-01T14:30:00.000Z",
        endedAt: "2026-02-01T14:30:00.000Z",
        status: "completed",
        statusMessage: "All tests passed",
        iteration: 8,
        maxIterations: 10,
        toolCallCount: 25,
        successfulToolCalls: 23,
        failedToolCalls: 2,
        warningCount: 3,
        filesModified: ["src/file1.ts", "src/file2.ts", "test/file1.test.ts"],
        durationMs: 1800000,
      });
      // Note: taskTitle is undefined as it's not stored in the database
    });

    it("should preserve event order and data integrity", () => {
      // Insert test task for foreign key constraint
      insertTestTask(5);

      // Create a session
      const session: Omit<type.AgentSession, "sessionId"> = {
        role: "implementor",
        taskId: 5,
        taskTitle: "Order Test",
        sprintId: "sprint-001",
        startedAt: "2026-02-01T14:00:00.000Z",
        lastActivityAt: "2026-02-01T14:05:00.000Z",
        endedAt: undefined,
        status: "running",
        statusMessage: undefined,
        iteration: 1,
        maxIterations: 10,
        toolCallCount: 0,
        successfulToolCalls: 0,
        failedToolCalls: 0,
        warningCount: 0,
        filesModified: [],
        durationMs: undefined,
      };

      const createdSession = createSession(testWorkspaceRoot, session);

      // Create events with specific order and data
      const events: type.AgentEvent[] = [
        {
          id: "event-1",
          sessionId: createdSession.sessionId,
          timestamp: "2026-02-01T14:00:00.000Z",
          iteration: 1,
          type: "prompt",
          text: "First event",
          attachments: undefined,
        } as type.PromptEvent,
        {
          id: "event-2",
          sessionId: createdSession.sessionId,
          timestamp: "2026-02-01T14:00:01.000Z",
          iteration: 1,
          type: "thinking",
          text: "Second event",
          tokenCount: 100,
        } as type.ThinkingEvent,
        {
          id: "event-3",
          sessionId: createdSession.sessionId,
          timestamp: "2026-02-01T14:00:02.000Z",
          iteration: 1,
          type: "prompt",
          text: "Third event",
          attachments: undefined,
        } as type.PromptEvent,
      ];

      insertEventBatch(testWorkspaceRoot, events);

      // Export and verify order is preserved
      const exportData = exportSession(
        testWorkspaceRoot,
        createdSession.sessionId,
      );

      expect(exportData.events).toHaveLength(3);
      expect(exportData.events[0]).toMatchObject({
        id: "event-1",
        text: "First event",
      });
      expect(exportData.events[1]).toMatchObject({
        id: "event-2",
        text: "Second event",
      });
      expect(exportData.events[2]).toMatchObject({
        id: "event-3",
        text: "Third event",
      });
    });
  });
}
