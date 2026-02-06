/**
 * Tests for retention policy
 *
 * Verifies purgeOldSessions function correctly:
 * - Retains sessions for the 3 most recent tasks
 * - Deletes sessions for older tasks
 * - Cascade deletes events via foreign key
 * - Handles edge cases (no sessions, fewer than 4 tasks, invalid sprint)
 *
 * Test coverage targets: >90% statement coverage
 *
 * Note: These tests require the Node.js-compiled better-sqlite3 module.
 * When the module is compiled for Electron (for VSIX packaging), these tests
 * will be skipped to avoid NODE_MODULE_VERSION mismatch errors.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
  describe.skip("Retention Policy (skipped: native module incompatible)", () => {
    it("skipped due to NODE_MODULE_VERSION mismatch", () => {});
  });
} else {
  // Import dependencies only if module is compatible
  const { purgeOldSessions } =
    await import("../../../src/agents/sessions/retention.js");
  const { OrchestraDB } = await import("../../../src/database/client.js");

  // Test fixtures
  let testWorkspaceRoot: string;
  let testDbPath: string;

  /**
   * Create a minimal Orchestra database for testing
   */
  function createTestDatabase(dbPath: string): void {
    if (!canRunTests) return;
    const db = new Database!(dbPath);

    // Create tasks table (required for foreign key)
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sprint_id TEXT NOT NULL,
        phase_id INTEGER NOT NULL,
        task_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        dependencies TEXT NOT NULL,
        speckit_task_ref TEXT,
        status TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
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
        files_modified JSON NOT NULL DEFAULT '[]',
        duration_ms INTEGER,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
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

    db.close();
  }

  /**
   * Insert test data: tasks, sessions, and events
   */
  function insertTestData(
    sprintId: string,
    numTasks: number,
    sessionsPerTask: number,
    eventsPerSession: number,
  ): void {
    if (!canRunTests) return;
    const db = new Database!(testDbPath);
    const now = new Date().toISOString();

    // Insert tasks
    const taskStmt = db.prepare(`
      INSERT INTO tasks (sprint_id, phase_id, task_id, title, description, category, dependencies, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const taskIds: number[] = [];
    for (let i = 1; i <= numTasks; i++) {
      const result = taskStmt.run(
        sprintId,
        1,
        i,
        `Task ${i}`,
        `Description ${i}`,
        "implementation",
        "[]",
        "PENDING",
        now,
        now,
      );
      taskIds.push(result.lastInsertRowid as number);
    }

    // Insert sessions for each task
    const sessionStmt = db.prepare(`
      INSERT INTO agent_sessions (id, task_id, sprint_id, role, status, started_at, last_activity_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const sessionIds: string[] = [];
    for (const taskId of taskIds) {
      for (let j = 1; j <= sessionsPerTask; j++) {
        const sessionId = `session-task${taskId}-${j}`;
        sessionStmt.run(
          sessionId,
          taskId,
          sprintId,
          "implementor",
          "completed",
          now,
          now,
        );
        sessionIds.push(sessionId);
      }
    }

    // Insert events for each session
    const eventStmt = db.prepare(`
      INSERT INTO session_events (id, session_id, type, timestamp, iteration, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const sessionId of sessionIds) {
      for (let k = 1; k <= eventsPerSession; k++) {
        const eventId = `event-${sessionId}-${k}`;
        const payload = JSON.stringify({
          id: eventId,
          sessionId,
          timestamp: now,
          iteration: 0,
          type: "status_change",
          oldStatus: "running",
          newStatus: "completed",
        });
        eventStmt.run(eventId, sessionId, "status_change", now, 0, payload);
      }
    }

    db.close();
  }

  /**
   * Count sessions and events in the database
   */
  function countData(): { sessions: number; events: number } {
    if (!canRunTests) return { sessions: 0, events: 0 };
    const db = new Database!(testDbPath);

    const sessionsResult = db
      .prepare("SELECT COUNT(*) as count FROM agent_sessions")
      .get() as { count: number };
    const eventsResult = db
      .prepare("SELECT COUNT(*) as count FROM session_events")
      .get() as { count: number };

    db.close();

    return {
      sessions: sessionsResult.count,
      events: eventsResult.count,
    };
  }

  /**
   * Get session IDs for a specific task
   */
  function getSessionsForTask(taskId: number): string[] {
    if (!canRunTests) return [];
    const db = new Database!(testDbPath);

    const rows = db
      .prepare("SELECT id FROM agent_sessions WHERE task_id = ?")
      .all(taskId) as { id: string }[];

    db.close();

    return rows.map((row) => row.id);
  }

  // Skip all tests if better-sqlite3 module is incompatible
  const describeIfCompatible = canRunTests ? describe : describe.skip;

  describeIfCompatible("Retention Policy", () => {
    beforeEach(() => {
      // Create temporary directory for test database
      testWorkspaceRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "orchestra-retention-test-"),
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

    describe("purgeOldSessions", () => {
      it("should retain sessions for the 3 most recent tasks", () => {
        // Setup: 5 tasks with 2 sessions each, 3 events per session
        const sprintId = "sprint-001";
        insertTestData(sprintId, 5, 2, 3);

        // Verify initial state: 10 sessions, 30 events
        const before = countData();
        expect(before.sessions).toBe(10);
        expect(before.events).toBe(30);

        // Execute purge
        const result = purgeOldSessions(testWorkspaceRoot, sprintId);

        // Should delete sessions for tasks 1-2 (4 sessions, 12 events)
        // Should keep sessions for tasks 3-5 (6 sessions, 18 events)
        expect(result.sessionsDeleted).toBe(4);
        expect(result.eventsDeleted).toBe(12);

        // Verify final state
        const after = countData();
        expect(after.sessions).toBe(6);
        expect(after.events).toBe(18);

        // Verify tasks 3, 4, 5 still have sessions
        expect(getSessionsForTask(3).length).toBe(2);
        expect(getSessionsForTask(4).length).toBe(2);
        expect(getSessionsForTask(5).length).toBe(2);

        // Verify tasks 1, 2 have no sessions
        expect(getSessionsForTask(1).length).toBe(0);
        expect(getSessionsForTask(2).length).toBe(0);
      });

      it("should return zero counts when fewer than 4 tasks exist", () => {
        // Setup: 3 tasks with 2 sessions each
        const sprintId = "sprint-001";
        insertTestData(sprintId, 3, 2, 3);

        const before = countData();
        expect(before.sessions).toBe(6);
        expect(before.events).toBe(18);

        // Execute purge
        const result = purgeOldSessions(testWorkspaceRoot, sprintId);

        // Nothing should be deleted
        expect(result.sessionsDeleted).toBe(0);
        expect(result.eventsDeleted).toBe(0);

        // Verify no data was deleted
        const after = countData();
        expect(after.sessions).toBe(6);
        expect(after.events).toBe(18);
      });

      it("should return zero counts when no sessions exist", () => {
        // Setup: 5 tasks but no sessions
        const sprintId = "sprint-001";
        insertTestData(sprintId, 5, 0, 0);

        const before = countData();
        expect(before.sessions).toBe(0);
        expect(before.events).toBe(0);

        // Execute purge
        const result = purgeOldSessions(testWorkspaceRoot, sprintId);

        // Nothing to delete
        expect(result.sessionsDeleted).toBe(0);
        expect(result.eventsDeleted).toBe(0);
      });

      it("should return zero counts for non-existent sprint", () => {
        // Setup: data for sprint-001, but purge sprint-999
        insertTestData("sprint-001", 5, 2, 3);

        const before = countData();
        expect(before.sessions).toBe(10);
        expect(before.events).toBe(30);

        // Execute purge for different sprint
        const result = purgeOldSessions(testWorkspaceRoot, "sprint-999");

        // Nothing deleted (sprint doesn't exist)
        expect(result.sessionsDeleted).toBe(0);
        expect(result.eventsDeleted).toBe(0);

        // Original data untouched
        const after = countData();
        expect(after.sessions).toBe(10);
        expect(after.events).toBe(30);
      });

      it("should handle exactly 4 tasks (deletes 1 oldest task)", () => {
        // Setup: 4 tasks with 1 session each, 2 events per session
        const sprintId = "sprint-001";
        insertTestData(sprintId, 4, 1, 2);

        const before = countData();
        expect(before.sessions).toBe(4);
        expect(before.events).toBe(8);

        // Execute purge
        const result = purgeOldSessions(testWorkspaceRoot, sprintId);

        // Should delete task 1 (1 session, 2 events)
        expect(result.sessionsDeleted).toBe(1);
        expect(result.eventsDeleted).toBe(2);

        // Verify tasks 2, 3, 4 retained
        expect(getSessionsForTask(2).length).toBe(1);
        expect(getSessionsForTask(3).length).toBe(1);
        expect(getSessionsForTask(4).length).toBe(1);
        expect(getSessionsForTask(1).length).toBe(0);
      });

      it("should cascade delete events via foreign key", () => {
        // Setup: 5 tasks, 3 sessions per task, 5 events per session
        const sprintId = "sprint-001";
        insertTestData(sprintId, 5, 3, 5);

        const before = countData();
        expect(before.sessions).toBe(15);
        expect(before.events).toBe(75);

        // Execute purge
        const result = purgeOldSessions(testWorkspaceRoot, sprintId);

        // Should delete 6 sessions (tasks 1-2), 30 events
        expect(result.sessionsDeleted).toBe(6);
        expect(result.eventsDeleted).toBe(30);

        // Verify cascade deletion
        const after = countData();
        expect(after.sessions).toBe(9); // 15 - 6
        expect(after.events).toBe(45); // 75 - 30
      });

      it("should only affect specified sprint", () => {
        // Setup: data for two sprints
        insertTestData("sprint-001", 5, 2, 3);
        insertTestData("sprint-002", 5, 2, 3);

        const before = countData();
        expect(before.sessions).toBe(20); // 10 per sprint
        expect(before.events).toBe(60); // 30 per sprint

        // Purge only sprint-001
        const result = purgeOldSessions(testWorkspaceRoot, "sprint-001");

        // Should delete 4 sessions and 12 events from sprint-001
        expect(result.sessionsDeleted).toBe(4);
        expect(result.eventsDeleted).toBe(12);

        // Total should be reduced by the purged amount
        const after = countData();
        expect(after.sessions).toBe(16); // 20 - 4
        expect(after.events).toBe(48); // 60 - 12
      });

      it("should handle large number of tasks", () => {
        // Setup: 100 tasks with 1 session each, 1 event per session
        const sprintId = "sprint-large";
        insertTestData(sprintId, 100, 1, 1);

        const before = countData();
        expect(before.sessions).toBe(100);
        expect(before.events).toBe(100);

        // Execute purge
        const result = purgeOldSessions(testWorkspaceRoot, sprintId);

        // Should delete 97 sessions (keep last 3)
        expect(result.sessionsDeleted).toBe(97);
        expect(result.eventsDeleted).toBe(97);

        // Verify 3 sessions remain
        const after = countData();
        expect(after.sessions).toBe(3);
        expect(after.events).toBe(3);

        // Verify tasks 98, 99, 100 have sessions
        expect(getSessionsForTask(98).length).toBe(1);
        expect(getSessionsForTask(99).length).toBe(1);
        expect(getSessionsForTask(100).length).toBe(1);
      });

      it("should handle sessions with no events", () => {
        // Setup: 5 tasks with sessions but no events
        const sprintId = "sprint-001";
        insertTestData(sprintId, 5, 2, 0);

        const before = countData();
        expect(before.sessions).toBe(10);
        expect(before.events).toBe(0);

        // Execute purge
        const result = purgeOldSessions(testWorkspaceRoot, sprintId);

        // Should delete 4 sessions, 0 events
        expect(result.sessionsDeleted).toBe(4);
        expect(result.eventsDeleted).toBe(0);

        // Verify final state
        const after = countData();
        expect(after.sessions).toBe(6);
        expect(after.events).toBe(0);
      });
    });

    describe("Edge Cases", () => {
      it("should handle empty database", () => {
        // No data inserted
        const result = purgeOldSessions(testWorkspaceRoot, "sprint-001");

        expect(result.sessionsDeleted).toBe(0);
        expect(result.eventsDeleted).toBe(0);
      });

      it("should handle multiple purges on same sprint", () => {
        // Setup: 5 tasks
        const sprintId = "sprint-001";
        insertTestData(sprintId, 5, 1, 1);

        // First purge
        const result1 = purgeOldSessions(testWorkspaceRoot, sprintId);
        expect(result1.sessionsDeleted).toBe(2);

        // Second purge (no more old sessions)
        const result2 = purgeOldSessions(testWorkspaceRoot, sprintId);
        expect(result2.sessionsDeleted).toBe(0);
        expect(result2.eventsDeleted).toBe(0);
      });
    });
  });
}
