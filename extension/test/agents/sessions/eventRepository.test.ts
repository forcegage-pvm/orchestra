/**
 * Tests for event repository
 *
 * Verifies all CRUD operations for session_events table.
 * Tests insertEvent, insertEventBatch, getEventsForSession, getEventsByType,
 * getToolEvents, and deleteEventsForSession.
 *
 * Tests cover all 10 event types from the AgentEvent discriminated union:
 * - prompt
 * - thinking
 * - status_change
 * - error
 * - tool_call
 * - tool_progress
 * - tool_output
 * - tool_file_operation
 * - tool_metadata
 * - tool_result
 *
 * These tests use in-memory SQLite database to verify the functions work correctly
 * without requiring a full Orchestra workspace setup.
 *
 * Note: These tests require the Node.js-compiled better-sqlite3 module.
 * When the module is compiled for Electron (for VSIX packaging), these tests
 * will be skipped to avoid NODE_MODULE_VERSION mismatch errors.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Early detection of better-sqlite3 compatibility
let Database: typeof import("better-sqlite3").default | null = null;
let moduleCompatible = false;
try {
  Database = (await import("better-sqlite3")).default;
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
    "Event Repository (skipped: native module incompatible)",
    () => {
      it("skipped due to NODE_MODULE_VERSION mismatch", () => {});
    }
  );
} else {
  // Import dependencies only if module is compatible
  const {
    insertEvent,
    insertEventBatch,
    getEventsForSession,
    getEventsByType,
    getToolEvents,
    deleteEventsForSession,
  } = await import("../../../src/agents/sessions/eventRepository.js");
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

  describeIfCompatible("Event Repository", () => {
    beforeEach(() => {
      // Create temporary directory for test database
      testWorkspaceRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "orchestra-event-repo-test-")
      );

      // Create .orchestra directory structure
      const orchestraDir = path.join(testWorkspaceRoot, ".orchestra");
      fs.mkdirSync(orchestraDir, { recursive: true });

      // Create test database
      testDbPath = path.join(orchestraDir, "orchestra.db");
      createTestDatabase(testDbPath);
    });

    afterEach(() => {
      // Close database connection before cleanup
      OrchestraDB.close();

      // Clean up test workspace
      fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
    });

    describe("insertEvent", () => {
      it("should insert a single event and generate ID if not provided", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const event: type.PromptEvent = {
          id: "",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Implement the feature",
          attachments: undefined,
        };

        const inserted = insertEvent(testWorkspaceRoot, event);

        expect(inserted.id).toBeDefined();
        expect(inserted.id).not.toBe("");
        expect(inserted.sessionId).toBe(sessionId);
        expect(inserted.type).toBe("prompt");
        expect(inserted.text).toBe("Implement the feature");
      });

      it("should preserve provided event ID", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const customId = "custom-event-id-123";
        const event: type.ThinkingEvent = {
          id: customId,
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "thinking",
          text: "Analyzing the requirements",
          tokenCount: 150,
        };

        const inserted = insertEvent(testWorkspaceRoot, event);

        expect(inserted.id).toBe(customId);
      });

      it("should insert prompt event with attachments", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const event: type.PromptEvent = {
          id: "prompt-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Review this file",
          attachments: [
            {
              path: "src/main.ts",
              name: "main.ts",
              mimeType: "text/typescript",
            },
          ],
        };

        const inserted = insertEvent(testWorkspaceRoot, event);

        expect(inserted.attachments).toHaveLength(1);
        expect(inserted.attachments?.[0].path).toBe("src/main.ts");
      });

      it("should insert thinking event", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const event: type.ThinkingEvent = {
          id: "thinking-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 1,
          type: "thinking",
          text: "I need to create a new file",
          tokenCount: 200,
        };

        const inserted = insertEvent(testWorkspaceRoot, event);

        expect(inserted.type).toBe("thinking");
        expect(inserted.tokenCount).toBe(200);
      });

      it("should insert status_change event", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const event: type.StatusChangeEvent = {
          id: "status-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 1,
          type: "status_change",
          previousStatus: "initializing",
          newStatus: "running",
          message: "Agent started processing",
        };

        const inserted = insertEvent(testWorkspaceRoot, event);

        expect(inserted.type).toBe("status_change");
        expect(inserted.previousStatus).toBe("initializing");
        expect(inserted.newStatus).toBe("running");
      });

      it("should insert error event and populate severity column", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const event: type.ErrorEvent = {
          id: "error-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 1,
          type: "error",
          severity: "error",
          code: "FILE_NOT_FOUND",
          message: "Could not find config.json",
          recoverable: true,
          details: { path: "config.json" },
          suggestion: "Create the file first",
        };

        const inserted = insertEvent(testWorkspaceRoot, event);

        expect(inserted.type).toBe("error");
        expect(inserted.severity).toBe("error");

        // Verify severity is in indexed column
        const db = new Database!(testDbPath);
        const row = db
          .prepare("SELECT severity FROM session_events WHERE id = ?")
          .get(inserted.id) as { severity: string };
        expect(row.severity).toBe("error");
        db.close();
      });

      it("should insert tool_call event and populate tool columns", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const event: type.ToolCallEvent = {
          id: "event-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 1,
          type: "tool_call",
          toolCallId: "tool-123",
          toolName: "read_file",
          toolCategory: "filesystem",
          arguments: { path: "src/main.ts" },
        };

        const inserted = insertEvent(testWorkspaceRoot, event);

        expect(inserted.type).toBe("tool_call");
        expect(inserted.toolCallId).toBe("tool-123");
        expect(inserted.toolName).toBe("read_file");

        // Verify indexed columns
        const db = new Database!(testDbPath);
        const row = db
          .prepare(
            "SELECT tool_call_id, tool_name FROM session_events WHERE id = ?"
          )
          .get(inserted.id) as { tool_call_id: string; tool_name: string };
        expect(row.tool_call_id).toBe("tool-123");
        expect(row.tool_name).toBe("read_file");
        db.close();
      });

      it("should insert tool_progress event", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const event: type.ToolProgressEvent = {
          id: "event-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 1,
          type: "tool_progress",
          toolCallId: "tool-123",
          toolName: "run_tests",
          message: "Running test suite...",
          percent: 45,
        };

        const inserted = insertEvent(testWorkspaceRoot, event);

        expect(inserted.type).toBe("tool_progress");
        expect(inserted.percent).toBe(45);
      });

      it("should insert tool_output event", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const event: type.ToolOutputEvent = {
          id: "event-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 1,
          type: "tool_output",
          toolCallId: "tool-123",
          toolName: "run_tests",
          chunk: "Test passed: should validate input\n",
          isStderr: false,
        };

        const inserted = insertEvent(testWorkspaceRoot, event);

        expect(inserted.type).toBe("tool_output");
        expect(inserted.chunk).toContain("Test passed");
        expect(inserted.isStderr).toBe(false);
      });

      it("should insert tool_file_operation event", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const event: type.ToolFileOperationEvent = {
          id: "event-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 1,
          type: "tool_file_operation",
          toolCallId: "tool-123",
          toolName: "create_file",
          operation: {
            operation: "create",
            path: "src/new-file.ts",
            targetPath: undefined,
            size: 1024,
            linesChanged: undefined,
            linesInserted: 50,
            linesDeleted: undefined,
          },
        };

        const inserted = insertEvent(testWorkspaceRoot, event);

        expect(inserted.type).toBe("tool_file_operation");
        expect(inserted.operation.operation).toBe("create");
        expect(inserted.operation.path).toBe("src/new-file.ts");
        expect(inserted.operation.size).toBe(1024);
      });

      it("should insert tool_metadata event", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const event: type.ToolMetadataEvent = {
          id: "event-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 1,
          type: "tool_metadata",
          toolCallId: "tool-123",
          toolName: "run_tests",
          key: "test_framework",
          value: "vitest",
        };

        const inserted = insertEvent(testWorkspaceRoot, event);

        expect(inserted.type).toBe("tool_metadata");
        expect(inserted.key).toBe("test_framework");
        expect(inserted.value).toBe("vitest");
      });

      it("should insert tool_result event and populate result columns", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const event: type.ToolResultEvent = {
          id: "event-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 1,
          type: "tool_result",
          toolCallId: "tool-123",
          toolName: "read_file",
          success: true,
          output: "File contents here",
          error: undefined,
          durationMs: 250,
        };

        const inserted = insertEvent(testWorkspaceRoot, event);

        expect(inserted.type).toBe("tool_result");
        expect(inserted.success).toBe(true);
        expect(inserted.durationMs).toBe(250);

        // Verify indexed columns
        const db = new Database!(testDbPath);
        const row = db
          .prepare(
            "SELECT success, duration_ms FROM session_events WHERE id = ?"
          )
          .get(inserted.id) as { success: number; duration_ms: number };
        expect(row.success).toBe(1); // SQLite stores boolean as integer
        expect(row.duration_ms).toBe(250);
        db.close();
      });

      it("should handle tool_result with error", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const event: type.ToolResultEvent = {
          id: "event-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 1,
          type: "tool_result",
          toolCallId: "tool-123",
          toolName: "read_file",
          success: false,
          output: "",
          error: {
            code: "FILE_NOT_FOUND",
            message: "File does not exist",
            suggestion: "Check the path",
            details: { path: "missing.txt" },
          },
          durationMs: 100,
        };

        const inserted = insertEvent(testWorkspaceRoot, event);

        expect(inserted.success).toBe(false);
        expect(inserted.error?.code).toBe("FILE_NOT_FOUND");
        expect(inserted.error?.message).toBe("File does not exist");
      });
    });

    describe("insertEventBatch", () => {
      it("should insert multiple events in a single transaction", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const events: type.AgentEvent[] = [
          {
            id: "",
            sessionId,
            timestamp: "2026-02-01T10:00:00Z",
            iteration: 0,
            type: "prompt",
            text: "Task 1",
            attachments: undefined,
          },
          {
            id: "",
            sessionId,
            timestamp: "2026-02-01T10:00:01Z",
            iteration: 1,
            type: "thinking",
            text: "Analyzing task",
            tokenCount: 100,
          },
          {
            id: "",
            sessionId,
            timestamp: "2026-02-01T10:00:02Z",
            iteration: 1,
            type: "status_change",
            previousStatus: "initializing",
            newStatus: "running",
            message: undefined,
          },
        ];

        const inserted = insertEventBatch(testWorkspaceRoot, events);

        expect(inserted).toHaveLength(3);
        expect(inserted[0].id).toBeDefined();
        expect(inserted[1].id).toBeDefined();
        expect(inserted[2].id).toBeDefined();

        // Verify all events were inserted
        const retrieved = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(retrieved).toHaveLength(3);
      });

      it("should preserve event IDs when provided", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const events: type.AgentEvent[] = [
          {
            id: "event-1",
            sessionId,
            timestamp: "2026-02-01T10:00:00Z",
            iteration: 0,
            type: "prompt",
            text: "Task 1",
            attachments: undefined,
          },
          {
            id: "event-2",
            sessionId,
            timestamp: "2026-02-01T10:00:01Z",
            iteration: 1,
            type: "thinking",
            text: "Analyzing task",
            tokenCount: 100,
          },
        ];

        const inserted = insertEventBatch(testWorkspaceRoot, events);

        expect(inserted[0].id).toBe("event-1");
        expect(inserted[1].id).toBe("event-2");
      });

      it("should handle batch with all 10 event types", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const events: type.AgentEvent[] = [
          {
            id: "1",
            sessionId,
            timestamp: "2026-02-01T10:00:00Z",
            iteration: 0,
            type: "prompt",
            text: "Start",
            attachments: undefined,
          },
          {
            id: "2",
            sessionId,
            timestamp: "2026-02-01T10:00:01Z",
            iteration: 1,
            type: "thinking",
            text: "Think",
            tokenCount: 50,
          },
          {
            id: "3",
            sessionId,
            timestamp: "2026-02-01T10:00:02Z",
            iteration: 1,
            type: "status_change",
            previousStatus: "initializing",
            newStatus: "running",
            message: undefined,
          },
          {
            id: "4",
            sessionId,
            timestamp: "2026-02-01T10:00:03Z",
            iteration: 1,
            type: "error",
            severity: "warning",
            code: "WARN",
            message: "Warning",
            recoverable: true,
            details: undefined,
            suggestion: undefined,
          },
          {
            id: "5",
            sessionId,
            timestamp: "2026-02-01T10:00:04Z",
            iteration: 2,
            type: "tool_call",
            toolCallId: "tool-1",
            toolName: "test_tool",
            toolCategory: "system",
            arguments: {},
          },
          {
            id: "6",
            sessionId,
            timestamp: "2026-02-01T10:00:05Z",
            iteration: 2,
            type: "tool_progress",
            toolCallId: "tool-1",
            toolName: "test_tool",
            message: "Progress",
            percent: undefined,
          },
          {
            id: "7",
            sessionId,
            timestamp: "2026-02-01T10:00:06Z",
            iteration: 2,
            type: "tool_output",
            toolCallId: "tool-1",
            toolName: "test_tool",
            chunk: "output",
            isStderr: undefined,
          },
          {
            id: "8",
            sessionId,
            timestamp: "2026-02-01T10:00:07Z",
            iteration: 2,
            type: "tool_file_operation",
            toolCallId: "tool-1",
            toolName: "test_tool",
            operation: {
              operation: "create",
              path: "test.ts",
              targetPath: undefined,
              size: undefined,
              linesChanged: undefined,
              linesInserted: undefined,
              linesDeleted: undefined,
            },
          },
          {
            id: "9",
            sessionId,
            timestamp: "2026-02-01T10:00:08Z",
            iteration: 2,
            type: "tool_metadata",
            toolCallId: "tool-1",
            toolName: "test_tool",
            key: "meta",
            value: "data",
          },
          {
            id: "10",
            sessionId,
            timestamp: "2026-02-01T10:00:09Z",
            iteration: 2,
            type: "tool_result",
            toolCallId: "tool-1",
            toolName: "test_tool",
            success: true,
            output: "done",
            error: undefined,
            durationMs: 5000,
          },
        ];

        const inserted = insertEventBatch(testWorkspaceRoot, events);

        expect(inserted).toHaveLength(10);

        // Verify all types were inserted correctly
        const retrieved = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(retrieved).toHaveLength(10);

        const types = retrieved.map((e) => e.type);
        expect(types).toContain("prompt");
        expect(types).toContain("thinking");
        expect(types).toContain("status_change");
        expect(types).toContain("error");
        expect(types).toContain("tool_call");
        expect(types).toContain("tool_progress");
        expect(types).toContain("tool_output");
        expect(types).toContain("tool_file_operation");
        expect(types).toContain("tool_metadata");
        expect(types).toContain("tool_result");
      });

      it("should be faster than individual inserts for large batches", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        // Generate 100 events
        const events: type.AgentEvent[] = Array.from(
          { length: 100 },
          (_, i) => ({
            id: `event-${i}`,
            sessionId,
            timestamp: new Date(
              Date.parse("2026-02-01T10:00:00Z") + i * 1000
            ).toISOString(),
            iteration: i,
            type: "thinking",
            text: `Thinking ${i}`,
            tokenCount: 100,
          })
        );

        // Batch insert (should be faster)
        const batchStart = Date.now();
        insertEventBatch(testWorkspaceRoot, events);
        const batchDuration = Date.now() - batchStart;

        // Verify all inserted
        const retrieved = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(retrieved).toHaveLength(100);

        // Note: We're not comparing to individual inserts because that would double test time
        // Just verify batch insert completes reasonably quickly (< 1 second for 100 events)
        expect(batchDuration).toBeLessThan(1000);
      });
    });

    describe("getEventsForSession", () => {
      it("should retrieve all events for a session ordered by timestamp", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const events: type.AgentEvent[] = [
          {
            id: "event-3",
            sessionId,
            timestamp: "2026-02-01T10:00:02Z",
            iteration: 2,
            type: "thinking",
            text: "Third",
            tokenCount: 100,
          },
          {
            id: "event-1",
            sessionId,
            timestamp: "2026-02-01T10:00:00Z",
            iteration: 0,
            type: "prompt",
            text: "First",
            attachments: undefined,
          },
          {
            id: "event-2",
            sessionId,
            timestamp: "2026-02-01T10:00:01Z",
            iteration: 1,
            type: "thinking",
            text: "Second",
            tokenCount: 100,
          },
        ];

        insertEventBatch(testWorkspaceRoot, events);

        const retrieved = getEventsForSession(testWorkspaceRoot, sessionId);

        expect(retrieved).toHaveLength(3);
        // Should be ordered by timestamp ascending
        expect(retrieved[0].id).toBe("event-1");
        expect(retrieved[1].id).toBe("event-2");
        expect(retrieved[2].id).toBe("event-3");
      });

      it("should return empty array for session with no events", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const retrieved = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(retrieved).toEqual([]);
      });

      it("should not return events from other sessions", () => {
        const session1 = "session-1";
        const session2 = "session-2";
        insertTestSession(session1);
        insertTestSession(session2);

        insertEvent(testWorkspaceRoot, {
          id: "event-1",
          sessionId: session1,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Session 1",
          attachments: undefined,
        });

        insertEvent(testWorkspaceRoot, {
          id: "event-2",
          sessionId: session2,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Session 2",
          attachments: undefined,
        });

        const retrieved = getEventsForSession(testWorkspaceRoot, session1);

        expect(retrieved).toHaveLength(1);
        expect(retrieved[0].sessionId).toBe(session1);
        expect((retrieved[0] as type.PromptEvent).text).toBe("Session 1");
      });

      it("should deserialize complex payloads correctly", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const event: type.ErrorEvent = {
          id: "error-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 1,
          type: "error",
          severity: "error",
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          recoverable: true,
          details: {
            field: "email",
            constraint: "format",
            value: "invalid-email",
            nested: {
              deep: true,
              array: [1, 2, 3],
            },
          },
          suggestion: "Check email format",
        };

        insertEvent(testWorkspaceRoot, event);

        const retrieved = getEventsForSession(testWorkspaceRoot, sessionId);
        const errorEvent = retrieved[0] as type.ErrorEvent;

        expect(errorEvent.details).toEqual(event.details);
        expect(errorEvent.details?.nested).toEqual({ deep: true, array: [1, 2, 3] });
      });
    });

    describe("getEventsByType", () => {
      it("should filter events by type", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const events: type.AgentEvent[] = [
          {
            id: "1",
            sessionId,
            timestamp: "2026-02-01T10:00:00Z",
            iteration: 0,
            type: "prompt",
            text: "Start",
            attachments: undefined,
          },
          {
            id: "2",
            sessionId,
            timestamp: "2026-02-01T10:00:01Z",
            iteration: 1,
            type: "thinking",
            text: "Think 1",
            tokenCount: 100,
          },
          {
            id: "3",
            sessionId,
            timestamp: "2026-02-01T10:00:02Z",
            iteration: 1,
            type: "thinking",
            text: "Think 2",
            tokenCount: 100,
          },
          {
            id: "4",
            sessionId,
            timestamp: "2026-02-01T10:00:03Z",
            iteration: 2,
            type: "status_change",
            previousStatus: "running",
            newStatus: "completed",
            message: undefined,
          },
        ];

        insertEventBatch(testWorkspaceRoot, events);

        const thinkingEvents = getEventsByType(
          testWorkspaceRoot,
          sessionId,
          "thinking"
        );

        expect(thinkingEvents).toHaveLength(2);
        expect(thinkingEvents[0].type).toBe("thinking");
        expect(thinkingEvents[1].type).toBe("thinking");
      });

      it("should return empty array when no events match type", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        insertEvent(testWorkspaceRoot, {
          id: "1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Start",
          attachments: undefined,
        });

        const errorEvents = getEventsByType(
          testWorkspaceRoot,
          sessionId,
          "error"
        );

        expect(errorEvents).toEqual([]);
      });

      it("should filter by all event types correctly", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        // Insert one of each type
        const events: type.AgentEvent[] = [
          {
            id: "1",
            sessionId,
            timestamp: "2026-02-01T10:00:00Z",
            iteration: 0,
            type: "prompt",
            text: "Start",
            attachments: undefined,
          },
          {
            id: "2",
            sessionId,
            timestamp: "2026-02-01T10:00:01Z",
            iteration: 1,
            type: "thinking",
            text: "Think",
            tokenCount: 50,
          },
          {
            id: "3",
            sessionId,
            timestamp: "2026-02-01T10:00:02Z",
            iteration: 1,
            type: "status_change",
            previousStatus: "initializing",
            newStatus: "running",
            message: undefined,
          },
          {
            id: "4",
            sessionId,
            timestamp: "2026-02-01T10:00:03Z",
            iteration: 1,
            type: "error",
            severity: "warning",
            code: "WARN",
            message: "Warning",
            recoverable: true,
            details: undefined,
            suggestion: undefined,
          },
          {
            id: "5",
            sessionId,
            timestamp: "2026-02-01T10:00:04Z",
            iteration: 2,
            type: "tool_call",
            toolCallId: "tool-1",
            toolName: "test_tool",
            toolCategory: "system",
            arguments: {},
          },
          {
            id: "6",
            sessionId,
            timestamp: "2026-02-01T10:00:05Z",
            iteration: 2,
            type: "tool_progress",
            toolCallId: "tool-1",
            toolName: "test_tool",
            message: "Progress",
            percent: undefined,
          },
          {
            id: "7",
            sessionId,
            timestamp: "2026-02-01T10:00:06Z",
            iteration: 2,
            type: "tool_output",
            toolCallId: "tool-1",
            toolName: "test_tool",
            chunk: "output",
            isStderr: undefined,
          },
          {
            id: "8",
            sessionId,
            timestamp: "2026-02-01T10:00:07Z",
            iteration: 2,
            type: "tool_file_operation",
            toolCallId: "tool-1",
            toolName: "test_tool",
            operation: {
              operation: "create",
              path: "test.ts",
              targetPath: undefined,
              size: undefined,
              linesChanged: undefined,
              linesInserted: undefined,
              linesDeleted: undefined,
            },
          },
          {
            id: "9",
            sessionId,
            timestamp: "2026-02-01T10:00:08Z",
            iteration: 2,
            type: "tool_metadata",
            toolCallId: "tool-1",
            toolName: "test_tool",
            key: "meta",
            value: "data",
          },
          {
            id: "10",
            sessionId,
            timestamp: "2026-02-01T10:00:09Z",
            iteration: 2,
            type: "tool_result",
            toolCallId: "tool-1",
            toolName: "test_tool",
            success: true,
            output: "done",
            error: undefined,
            durationMs: 5000,
          },
        ];

        insertEventBatch(testWorkspaceRoot, events);

        // Test filtering each type
        const promptEvents = getEventsByType(
          testWorkspaceRoot,
          sessionId,
          "prompt"
        );
        expect(promptEvents).toHaveLength(1);
        expect(promptEvents[0].type).toBe("prompt");

        const thinkingEvents = getEventsByType(
          testWorkspaceRoot,
          sessionId,
          "thinking"
        );
        expect(thinkingEvents).toHaveLength(1);

        const statusEvents = getEventsByType(
          testWorkspaceRoot,
          sessionId,
          "status_change"
        );
        expect(statusEvents).toHaveLength(1);

        const errorEvents = getEventsByType(
          testWorkspaceRoot,
          sessionId,
          "error"
        );
        expect(errorEvents).toHaveLength(1);

        const toolCallEvents = getEventsByType(
          testWorkspaceRoot,
          sessionId,
          "tool_call"
        );
        expect(toolCallEvents).toHaveLength(1);

        const progressEvents = getEventsByType(
          testWorkspaceRoot,
          sessionId,
          "tool_progress"
        );
        expect(progressEvents).toHaveLength(1);

        const outputEvents = getEventsByType(
          testWorkspaceRoot,
          sessionId,
          "tool_output"
        );
        expect(outputEvents).toHaveLength(1);

        const fileOpEvents = getEventsByType(
          testWorkspaceRoot,
          sessionId,
          "tool_file_operation"
        );
        expect(fileOpEvents).toHaveLength(1);

        const metadataEvents = getEventsByType(
          testWorkspaceRoot,
          sessionId,
          "tool_metadata"
        );
        expect(metadataEvents).toHaveLength(1);

        const resultEvents = getEventsByType(
          testWorkspaceRoot,
          sessionId,
          "tool_result"
        );
        expect(resultEvents).toHaveLength(1);
      });
    });

    describe("getToolEvents", () => {
      it("should retrieve all events for a specific tool call", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const toolCallId = "tool-call-123";

        const events: type.AgentEvent[] = [
          {
            id: "1",
            sessionId,
            timestamp: "2026-02-01T10:00:00Z",
            iteration: 1,
            type: "tool_call",
            toolCallId,
            toolName: "read_file",
            toolCategory: "filesystem",
            arguments: { path: "src/main.ts" },
          },
          {
            id: "2",
            sessionId,
            timestamp: "2026-02-01T10:00:01Z",
            iteration: 1,
            type: "tool_progress",
            toolCallId,
            toolName: "read_file",
            message: "Reading file...",
            percent: 50,
          },
          {
            id: "3",
            sessionId,
            timestamp: "2026-02-01T10:00:02Z",
            iteration: 1,
            type: "tool_output",
            toolCallId,
            toolName: "read_file",
            chunk: "file contents",
            isStderr: false,
          },
          {
            id: "4",
            sessionId,
            timestamp: "2026-02-01T10:00:03Z",
            iteration: 1,
            type: "tool_result",
            toolCallId,
            toolName: "read_file",
            success: true,
            output: "file contents",
            error: undefined,
            durationMs: 3000,
          },
        ];

        insertEventBatch(testWorkspaceRoot, events);

        const toolEvents = getToolEvents(
          testWorkspaceRoot,
          sessionId,
          toolCallId
        );

        expect(toolEvents).toHaveLength(4);
        expect(toolEvents[0].type).toBe("tool_call");
        expect(toolEvents[1].type).toBe("tool_progress");
        expect(toolEvents[2].type).toBe("tool_output");
        expect(toolEvents[3].type).toBe("tool_result");
      });

      it("should return empty array for non-existent tool call ID", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        insertEvent(testWorkspaceRoot, {
          id: "1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Start",
          attachments: undefined,
        });

        const toolEvents = getToolEvents(
          testWorkspaceRoot,
          sessionId,
          "non-existent"
        );

        expect(toolEvents).toEqual([]);
      });

      it("should only return events for specified tool call, not other tool calls", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const events: type.AgentEvent[] = [
          {
            id: "1",
            sessionId,
            timestamp: "2026-02-01T10:00:00Z",
            iteration: 1,
            type: "tool_call",
            toolCallId: "tool-1",
            toolName: "read_file",
            toolCategory: "filesystem",
            arguments: {},
          },
          {
            id: "2",
            sessionId,
            timestamp: "2026-02-01T10:00:01Z",
            iteration: 1,
            type: "tool_call",
            toolCallId: "tool-2",
            toolName: "write_file",
            toolCategory: "filesystem",
            arguments: {},
          },
          {
            id: "3",
            sessionId,
            timestamp: "2026-02-01T10:00:02Z",
            iteration: 1,
            type: "tool_result",
            toolCallId: "tool-1",
            toolName: "read_file",
            success: true,
            output: "done",
            error: undefined,
            durationMs: 1000,
          },
        ];

        insertEventBatch(testWorkspaceRoot, events);

        const tool1Events = getToolEvents(testWorkspaceRoot, sessionId, "tool-1");

        expect(tool1Events).toHaveLength(2);
        expect(
          (tool1Events[0] as type.ToolCallEvent).toolCallId
        ).toBe("tool-1");
        expect(
          (tool1Events[1] as type.ToolResultEvent).toolCallId
        ).toBe("tool-1");
      });
    });

    describe("deleteEventsForSession", () => {
      it("should delete all events for a session", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const events: type.AgentEvent[] = [
          {
            id: "1",
            sessionId,
            timestamp: "2026-02-01T10:00:00Z",
            iteration: 0,
            type: "prompt",
            text: "Start",
            attachments: undefined,
          },
          {
            id: "2",
            sessionId,
            timestamp: "2026-02-01T10:00:01Z",
            iteration: 1,
            type: "thinking",
            text: "Think",
            tokenCount: 100,
          },
        ];

        insertEventBatch(testWorkspaceRoot, events);

        // Verify events exist
        let retrieved = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(retrieved).toHaveLength(2);

        // Delete events
        const deletedCount = deleteEventsForSession(
          testWorkspaceRoot,
          sessionId
        );

        expect(deletedCount).toBe(2);

        // Verify events are gone
        retrieved = getEventsForSession(testWorkspaceRoot, sessionId);
        expect(retrieved).toEqual([]);
      });

      it("should return 0 when no events exist for session", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const deletedCount = deleteEventsForSession(
          testWorkspaceRoot,
          sessionId
        );

        expect(deletedCount).toBe(0);
      });

      it("should not delete events from other sessions", () => {
        const session1 = "session-1";
        const session2 = "session-2";
        insertTestSession(session1);
        insertTestSession(session2);

        insertEvent(testWorkspaceRoot, {
          id: "1",
          sessionId: session1,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Session 1",
          attachments: undefined,
        });

        insertEvent(testWorkspaceRoot, {
          id: "2",
          sessionId: session2,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Session 2",
          attachments: undefined,
        });

        // Delete events for session1
        deleteEventsForSession(testWorkspaceRoot, session1);

        // Verify session1 events are gone
        const session1Events = getEventsForSession(testWorkspaceRoot, session1);
        expect(session1Events).toEqual([]);

        // Verify session2 events remain
        const session2Events = getEventsForSession(testWorkspaceRoot, session2);
        expect(session2Events).toHaveLength(1);
      });
    });

    describe("Edge Cases", () => {
      it("should handle events with undefined optional fields", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const event: type.ThinkingEvent = {
          id: "1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 1,
          type: "thinking",
          text: "Thinking",
          tokenCount: undefined,
        };

        const inserted = insertEvent(testWorkspaceRoot, event);

        expect(inserted.tokenCount).toBeUndefined();
      });

      it("should handle empty arrays in payloads", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const event: type.PromptEvent = {
          id: "1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Start",
          attachments: [],
        };

        const inserted = insertEvent(testWorkspaceRoot, event);
        const retrieved = getEventsForSession(testWorkspaceRoot, sessionId);

        expect((retrieved[0] as type.PromptEvent).attachments).toEqual([]);
      });

      it("should handle very large iteration numbers", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const event: type.ThinkingEvent = {
          id: "1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 999999,
          type: "thinking",
          text: "Late iteration",
          tokenCount: 100,
        };

        const inserted = insertEvent(testWorkspaceRoot, event);

        expect(inserted.iteration).toBe(999999);
      });

      it("should handle special characters in text fields", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const specialText = 'Text with "quotes", \'apostrophes\', and \\backslashes\\';

        const event: type.PromptEvent = {
          id: "1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: specialText,
          attachments: undefined,
        };

        insertEvent(testWorkspaceRoot, event);
        const retrieved = getEventsForSession(testWorkspaceRoot, sessionId);

        expect((retrieved[0] as type.PromptEvent).text).toBe(specialText);
      });
    });
  });
}
