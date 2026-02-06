/**
 * Tests for EventBatcher
 *
 * Verifies batching behavior with 50ms window, queue management,
 * flush mechanics, and dispose cleanup.
 *
 * Tests use fake timers (vi.useFakeTimers) to verify timing behavior
 * without actual delays.
 *
 * Note: These tests require the Node.js-compiled better-sqlite3 module.
 * When the module is compiled for Electron (for VSIX packaging), these tests
 * will be skipped to avoid NODE_MODULE_VERSION mismatch errors.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

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

// Module compatibility flag for conditional test execution
const canRunTests = moduleCompatible && Database !== null;

// If module is not compatible, skip the entire file
if (!moduleCompatible) {
  describe.skip("Event Batcher (skipped: native module incompatible)", () => {
    it("skipped due to NODE_MODULE_VERSION mismatch", () => {});
  });
} else {
  // Import dependencies only if module is compatible
  const { EventBatcher } =
    await import("../../../src/agents/sessions/eventBatcher.js");
  const eventRepository =
    await import("../../../src/agents/sessions/eventRepository.js");
  const { OrchestraDB } = await import("../../../src/database/client.js");
  const type = await import("../../../src/agents/sessions/types.js");

  // Test fixtures
  let testWorkspaceRoot: string;
  let testDbPath: string;
  let insertEventBatchSpy: MockInstance;

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
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(sessionId, 1, "sprint-001", "implementor", "running", now, now);

    db.close();
  }

  // Skip all tests if better-sqlite3 module is incompatible
  const describeIfCompatible = canRunTests ? describe : describe.skip;

  describeIfCompatible("EventBatcher", () => {
    beforeEach(() => {
      // Use fake timers for timing control
      vi.useFakeTimers();

      // Create temporary directory for test database
      testWorkspaceRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "orchestra-batcher-test-"),
      );

      // Create .orchestra directory structure
      const orchestraDir = path.join(testWorkspaceRoot, ".orchestra");
      fs.mkdirSync(orchestraDir, { recursive: true });

      // Create test database
      testDbPath = path.join(orchestraDir, "orchestra.db");
      createTestDatabase(testDbPath);

      // Spy on insertEventBatch to verify batching behavior
      insertEventBatchSpy = vi.spyOn(eventRepository, "insertEventBatch");
    });

    afterEach(() => {
      // Restore real timers
      vi.useRealTimers();

      // Restore spies
      insertEventBatchSpy.mockRestore();

      // Close database connection before cleanup
      OrchestraDB.close();

      // Clean up test workspace
      fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
    });

    describe("Constructor", () => {
      it("should create batcher with workspaceRoot parameter", () => {
        const batcher = new EventBatcher(testWorkspaceRoot);
        expect(batcher).toBeDefined();
        expect(batcher).toBeInstanceOf(EventBatcher);
      });
    });

    describe("queue()", () => {
      it("should buffer events without immediate persistence", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const batcher = new EventBatcher(testWorkspaceRoot);

        const event: type.PromptEvent = {
          id: "event-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Test prompt",
          attachments: undefined,
        };

        batcher.queue(event);

        // Should not call insertEventBatch immediately
        expect(insertEventBatchSpy).not.toHaveBeenCalled();
      });

      it("should start 50ms timer on first event", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const batcher = new EventBatcher(testWorkspaceRoot);

        const event: type.PromptEvent = {
          id: "event-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Test prompt",
          attachments: undefined,
        };

        batcher.queue(event);

        // Timer is pending
        expect(insertEventBatchSpy).not.toHaveBeenCalled();

        // Advance 49ms - not enough
        vi.advanceTimersByTime(49);
        expect(insertEventBatchSpy).not.toHaveBeenCalled();

        // Advance 1ms more - timer fires at 50ms
        vi.advanceTimersByTime(1);
        expect(insertEventBatchSpy).toHaveBeenCalledTimes(1);
        expect(insertEventBatchSpy).toHaveBeenCalledWith(testWorkspaceRoot, [
          event,
        ]);
      });

      it("should batch multiple events within 50ms window", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const batcher = new EventBatcher(testWorkspaceRoot);

        const event1: type.PromptEvent = {
          id: "event-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Event 1",
          attachments: undefined,
        };

        const event2: type.ThinkingEvent = {
          id: "event-2",
          sessionId,
          timestamp: "2026-02-01T10:00:01Z",
          iteration: 0,
          type: "thinking",
          text: "Event 2",
          tokenCount: 100,
        };

        const event3: type.StatusChangeEvent = {
          id: "event-3",
          sessionId,
          timestamp: "2026-02-01T10:00:02Z",
          iteration: 0,
          type: "status_change",
          previousStatus: "initializing",
          newStatus: "running",
          message: undefined,
        };

        // Queue events at different times within window
        batcher.queue(event1);
        vi.advanceTimersByTime(10);
        batcher.queue(event2);
        vi.advanceTimersByTime(20);
        batcher.queue(event3);

        // Total 30ms elapsed, timer hasn't fired yet
        expect(insertEventBatchSpy).not.toHaveBeenCalled();

        // Advance remaining 20ms to 50ms total
        vi.advanceTimersByTime(20);

        // All three events should be batched together
        expect(insertEventBatchSpy).toHaveBeenCalledTimes(1);
        expect(insertEventBatchSpy).toHaveBeenCalledWith(testWorkspaceRoot, [
          event1,
          event2,
          event3,
        ]);
      });

      it("should not reschedule timer for subsequent events", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const batcher = new EventBatcher(testWorkspaceRoot);

        const event1: type.PromptEvent = {
          id: "event-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Event 1",
          attachments: undefined,
        };

        const event2: type.PromptEvent = {
          id: "event-2",
          sessionId,
          timestamp: "2026-02-01T10:00:01Z",
          iteration: 0,
          type: "prompt",
          text: "Event 2",
          attachments: undefined,
        };

        // Queue first event - starts 50ms timer
        batcher.queue(event1);

        // Advance 40ms
        vi.advanceTimersByTime(40);

        // Queue second event at 40ms mark
        // Timer should NOT be rescheduled - only 10ms remaining
        batcher.queue(event2);

        // Advance final 10ms to complete original 50ms window
        vi.advanceTimersByTime(10);

        // Both events flushed at 50ms mark
        expect(insertEventBatchSpy).toHaveBeenCalledTimes(1);
        expect(insertEventBatchSpy).toHaveBeenCalledWith(testWorkspaceRoot, [
          event1,
          event2,
        ]);
      });

      it("should start new batch after previous batch flushes", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const batcher = new EventBatcher(testWorkspaceRoot);

        const event1: type.PromptEvent = {
          id: "event-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Batch 1",
          attachments: undefined,
        };

        const event2: type.PromptEvent = {
          id: "event-2",
          sessionId,
          timestamp: "2026-02-01T10:00:01Z",
          iteration: 0,
          type: "prompt",
          text: "Batch 2",
          attachments: undefined,
        };

        // First batch
        batcher.queue(event1);
        vi.advanceTimersByTime(50);
        expect(insertEventBatchSpy).toHaveBeenCalledTimes(1);

        // Second batch (after first flushed)
        batcher.queue(event2);
        vi.advanceTimersByTime(50);
        expect(insertEventBatchSpy).toHaveBeenCalledTimes(2);

        // Verify separate batches
        expect(insertEventBatchSpy).toHaveBeenNthCalledWith(
          1,
          testWorkspaceRoot,
          [event1],
        );
        expect(insertEventBatchSpy).toHaveBeenNthCalledWith(
          2,
          testWorkspaceRoot,
          [event2],
        );
      });
    });

    describe("flush()", () => {
      it("should persist all queued events using insertEventBatch", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const batcher = new EventBatcher(testWorkspaceRoot);

        const event1: type.PromptEvent = {
          id: "event-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Event 1",
          attachments: undefined,
        };

        const event2: type.PromptEvent = {
          id: "event-2",
          sessionId,
          timestamp: "2026-02-01T10:00:01Z",
          iteration: 0,
          type: "prompt",
          text: "Event 2",
          attachments: undefined,
        };

        batcher.queue(event1);
        batcher.queue(event2);

        // Manual flush before timer
        batcher.flush();

        expect(insertEventBatchSpy).toHaveBeenCalledTimes(1);
        expect(insertEventBatchSpy).toHaveBeenCalledWith(testWorkspaceRoot, [
          event1,
          event2,
        ]);
      });

      it("should clear queue after flush", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const batcher = new EventBatcher(testWorkspaceRoot);

        const event: type.PromptEvent = {
          id: "event-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Event 1",
          attachments: undefined,
        };

        batcher.queue(event);
        batcher.flush();

        // Second flush should be no-op
        batcher.flush();

        expect(insertEventBatchSpy).toHaveBeenCalledTimes(1);
      });

      it("should cancel pending timer when flushing", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const batcher = new EventBatcher(testWorkspaceRoot);

        const event: type.PromptEvent = {
          id: "event-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Event 1",
          attachments: undefined,
        };

        batcher.queue(event);

        // Manual flush cancels timer
        batcher.flush();

        // Advance past original 50ms window
        vi.advanceTimersByTime(100);

        // Should only have been called once (manual flush)
        expect(insertEventBatchSpy).toHaveBeenCalledTimes(1);
      });

      it("should be no-op when queue is empty", () => {
        const batcher = new EventBatcher(testWorkspaceRoot);

        // Flush with empty queue
        batcher.flush();

        expect(insertEventBatchSpy).not.toHaveBeenCalled();
      });
    });

    describe("dispose()", () => {
      it("should flush pending events on dispose", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const batcher = new EventBatcher(testWorkspaceRoot);

        const event: type.PromptEvent = {
          id: "event-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Event 1",
          attachments: undefined,
        };

        batcher.queue(event);

        // Dispose before timer fires
        batcher.dispose();

        expect(insertEventBatchSpy).toHaveBeenCalledTimes(1);
        expect(insertEventBatchSpy).toHaveBeenCalledWith(testWorkspaceRoot, [
          event,
        ]);
      });

      it("should cancel scheduled timers on dispose", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const batcher = new EventBatcher(testWorkspaceRoot);

        const event: type.PromptEvent = {
          id: "event-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Event 1",
          attachments: undefined,
        };

        batcher.queue(event);
        batcher.dispose();

        // Advance timers - should not trigger additional flush
        vi.advanceTimersByTime(100);

        expect(insertEventBatchSpy).toHaveBeenCalledTimes(1);
      });

      it("should be safe to call dispose multiple times", () => {
        const batcher = new EventBatcher(testWorkspaceRoot);

        batcher.dispose();
        batcher.dispose();

        expect(insertEventBatchSpy).not.toHaveBeenCalled();
      });
    });

    describe("Edge Cases", () => {
      it("should handle rapid successive queue calls", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const batcher = new EventBatcher(testWorkspaceRoot);

        const events: type.PromptEvent[] = [];
        for (let i = 0; i < 100; i++) {
          events.push({
            id: `event-${i}`,
            sessionId,
            timestamp: `2026-02-01T10:00:${String(i).padStart(2, "0")}Z`,
            iteration: 0,
            type: "prompt",
            text: `Event ${i}`,
            attachments: undefined,
          });
        }

        // Queue all events rapidly
        events.forEach((event) => batcher.queue(event));

        // Should still batch them together
        vi.advanceTimersByTime(50);

        expect(insertEventBatchSpy).toHaveBeenCalledTimes(1);
        expect(insertEventBatchSpy).toHaveBeenCalledWith(
          testWorkspaceRoot,
          events,
        );
      });

      it("should handle queue after dispose", () => {
        const sessionId = "session-123";
        insertTestSession(sessionId);

        const batcher = new EventBatcher(testWorkspaceRoot);

        const event1: type.PromptEvent = {
          id: "event-1",
          sessionId,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Event 1",
          attachments: undefined,
        };

        const event2: type.PromptEvent = {
          id: "event-2",
          sessionId,
          timestamp: "2026-02-01T10:00:01Z",
          iteration: 0,
          type: "prompt",
          text: "Event 2",
          attachments: undefined,
        };

        batcher.queue(event1);
        batcher.dispose();

        // Queue after dispose starts new batch
        batcher.queue(event2);
        vi.advanceTimersByTime(50);

        expect(insertEventBatchSpy).toHaveBeenCalledTimes(2);
        expect(insertEventBatchSpy).toHaveBeenNthCalledWith(
          1,
          testWorkspaceRoot,
          [event1],
        );
        expect(insertEventBatchSpy).toHaveBeenNthCalledWith(
          2,
          testWorkspaceRoot,
          [event2],
        );
      });
    });
  });
}
