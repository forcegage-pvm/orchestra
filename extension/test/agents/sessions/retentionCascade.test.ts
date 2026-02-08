/**
 * Retention Policy CASCADE DELETE Test for session_messages
 *
 * Verifies that session_messages rows are properly cleaned up
 * via ON DELETE CASCADE when parent sessions are purged by
 * the retention policy (purgeOldSessions).
 *
 * The session_messages table has:
 *   FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
 *
 * This test confirms that when purgeOldSessions deletes sessions,
 * the associated session_messages are also deleted automatically.
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

// Additional check: try loading via the project's native loader
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
  describe.skip("Retention CASCADE DELETE for session_messages (skipped: native module incompatible)", () => {
    it("skipped due to NODE_MODULE_VERSION mismatch", () => {});
  });
} else {
  const { purgeOldSessions } =
    await import("../../../src/agents/sessions/retention.js");
  const { OrchestraDB } = await import("../../../src/database/client.js");

  let testWorkspaceRoot: string;
  let testDbPath: string;

  /**
   * Create a minimal Orchestra database with session_messages table
   */
  function createTestDatabase(dbPath: string): void {
    if (!canRunTests) return;
    const db = new Database!(dbPath);

    // Enable foreign keys
    db.pragma("foreign_keys = ON");

    // Create tasks table
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
        stage TEXT,
        parent_session_id TEXT,
        attempt INTEGER NOT NULL DEFAULT 0,
        is_continued INTEGER NOT NULL DEFAULT 0,
        continued_at TEXT,
        continuation_count INTEGER NOT NULL DEFAULT 0,
        tool_call_count INTEGER NOT NULL DEFAULT 0,
        successful_tool_calls INTEGER NOT NULL DEFAULT 0,
        failed_tool_calls INTEGER NOT NULL DEFAULT 0,
        warning_count INTEGER NOT NULL DEFAULT 0,
        files_modified JSON NOT NULL DEFAULT '[]',
        duration_ms INTEGER,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

    // Create session_events table (retained from original retention test)
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

    // Create session_messages table - the key table under test
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        message_index INTEGER NOT NULL,
        role TEXT NOT NULL,
        content JSON NOT NULL,
        token_count INTEGER,
        timestamp TEXT NOT NULL,
        iteration INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
      )
    `);

    db.close();
  }

  /**
   * Insert test data: tasks, sessions, events, and messages
   */
  function insertTestData(
    sprintId: string,
    numTasks: number,
    sessionsPerTask: number,
    messagesPerSession: number,
  ): void {
    if (!canRunTests) return;
    const db = new Database!(testDbPath);
    db.pragma("foreign_keys = ON");
    const now = new Date().toISOString();

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

    const sessionStmt = db.prepare(`
      INSERT INTO agent_sessions (id, task_id, sprint_id, role, status, started_at, last_activity_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Also insert one session_event per session for retention counting
    const eventStmt = db.prepare(`
      INSERT INTO session_events (id, session_id, type, timestamp, iteration, payload)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const messageStmt = db.prepare(`
      INSERT INTO session_messages (id, session_id, message_index, role, content, token_count, timestamp, iteration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

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

        // Insert one event per session (for retention event counting)
        eventStmt.run(
          `event-${sessionId}`,
          sessionId,
          "status_change",
          now,
          0,
          JSON.stringify({ type: "status_change" }),
        );

        // Insert messages for this session
        for (let m = 0; m < messagesPerSession; m++) {
          const messageId = `msg-${sessionId}-${m}`;
          const role = m % 2 === 0 ? "user" : "assistant";
          const content = JSON.stringify(`Message ${m} for ${sessionId}`);
          messageStmt.run(
            messageId,
            sessionId,
            m,
            role,
            content,
            10 + m,
            now,
            0,
          );
        }
      }
    }

    db.close();
  }

  /**
   * Count sessions and messages in the database
   */
  function countData(): {
    sessions: number;
    events: number;
    messages: number;
  } {
    if (!canRunTests) return { sessions: 0, events: 0, messages: 0 };
    const db = new Database!(testDbPath);

    const sessionsResult = db
      .prepare("SELECT COUNT(*) as count FROM agent_sessions")
      .get() as { count: number };
    const eventsResult = db
      .prepare("SELECT COUNT(*) as count FROM session_events")
      .get() as { count: number };
    const messagesResult = db
      .prepare("SELECT COUNT(*) as count FROM session_messages")
      .get() as { count: number };

    db.close();

    return {
      sessions: sessionsResult.count,
      events: eventsResult.count,
      messages: messagesResult.count,
    };
  }

  /**
   * Get message count for a specific session
   */
  function getMessageCountForSession(sessionId: string): number {
    if (!canRunTests) return 0;
    const db = new Database!(testDbPath);

    const result = db
      .prepare(
        "SELECT COUNT(*) as count FROM session_messages WHERE session_id = ?",
      )
      .get(sessionId) as { count: number };

    db.close();
    return result.count;
  }

  const describeIfCompatible = canRunTests ? describe : describe.skip;

  describeIfCompatible("Retention CASCADE DELETE for session_messages", () => {
    beforeEach(() => {
      testWorkspaceRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "orchestra-cascade-test-"),
      );

      const orchestraDir = path.join(testWorkspaceRoot, ".orchestra");
      fs.mkdirSync(orchestraDir, { recursive: true });

      testDbPath = path.join(orchestraDir, "orchestra.db");
      createTestDatabase(testDbPath);
    });

    afterEach(() => {
      OrchestraDB.close();
      fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
    });

    it("should CASCADE DELETE session_messages when sessions are purged", () => {
      // Setup: 5 tasks, 2 sessions each, 3 messages per session
      const sprintId = "sprint-cascade";
      insertTestData(sprintId, 5, 2, 3);

      // Verify initial state
      const before = countData();
      expect(before.sessions).toBe(10);
      expect(before.events).toBe(10);
      expect(before.messages).toBe(30); // 10 sessions * 3 messages

      // Execute purge (keeps last 3 tasks, purges tasks 1-2)
      const result = purgeOldSessions(testWorkspaceRoot, sprintId);

      // Should delete 4 sessions (tasks 1-2)
      expect(result.sessionsDeleted).toBe(4);

      // Verify sessions reduced
      const after = countData();
      expect(after.sessions).toBe(6); // kept tasks 3,4,5

      // CRITICAL: session_messages should also be cascade deleted
      // 4 deleted sessions * 3 messages each = 12 messages deleted
      expect(after.messages).toBe(18); // 30 - 12

      // Events also cascade
      expect(after.events).toBe(6);
    });

    it("should not delete messages for retained sessions", () => {
      // Setup: 5 tasks, 1 session each, 5 messages per session
      const sprintId = "sprint-retain";
      insertTestData(sprintId, 5, 1, 5);

      const before = countData();
      expect(before.sessions).toBe(5);
      expect(before.messages).toBe(25); // 5 * 5

      purgeOldSessions(testWorkspaceRoot, sprintId);

      // Tasks 3, 4, 5 retained → sessions and messages remain
      const after = countData();
      expect(after.sessions).toBe(3);
      expect(after.messages).toBe(15); // 3 * 5

      // Verify specific retained session messages
      expect(getMessageCountForSession("session-task3-1")).toBe(5);
      expect(getMessageCountForSession("session-task4-1")).toBe(5);
      expect(getMessageCountForSession("session-task5-1")).toBe(5);

      // Verify purged session messages are gone
      expect(getMessageCountForSession("session-task1-1")).toBe(0);
      expect(getMessageCountForSession("session-task2-1")).toBe(0);
    });

    it("should handle sessions with zero messages during purge", () => {
      // Setup: 5 tasks, 1 session each, 0 messages
      const sprintId = "sprint-nomsg";
      insertTestData(sprintId, 5, 1, 0);

      const before = countData();
      expect(before.sessions).toBe(5);
      expect(before.messages).toBe(0);

      const result = purgeOldSessions(testWorkspaceRoot, sprintId);
      expect(result.sessionsDeleted).toBe(2);

      const after = countData();
      expect(after.sessions).toBe(3);
      expect(after.messages).toBe(0);
    });

    it("should cascade messages when all older tasks are purged in large dataset", () => {
      // Setup: 10 tasks, 2 sessions, 4 messages each
      const sprintId = "sprint-large-cascade";
      insertTestData(sprintId, 10, 2, 4);

      const before = countData();
      expect(before.sessions).toBe(20);
      expect(before.messages).toBe(80); // 20 * 4

      purgeOldSessions(testWorkspaceRoot, sprintId);

      // Keep tasks 8, 9, 10 → 6 sessions → 24 messages
      const after = countData();
      expect(after.sessions).toBe(6);
      expect(after.messages).toBe(24);
    });

    it("should not affect messages in other sprints", () => {
      // Setup: data for two sprints
      insertTestData("sprint-a", 5, 1, 3);
      insertTestData("sprint-b", 5, 1, 3);

      const before = countData();
      expect(before.sessions).toBe(10);
      expect(before.messages).toBe(30);

      // Purge only sprint-a
      purgeOldSessions(testWorkspaceRoot, "sprint-a");

      const after = countData();
      // sprint-a: 5 tasks → keep 3 → 2 purged → 2 sessions, 6 messages deleted
      // sprint-b: untouched → 5 sessions, 15 messages
      expect(after.sessions).toBe(8); // 3 + 5
      expect(after.messages).toBe(24); // 9 + 15
    });
  });
}
