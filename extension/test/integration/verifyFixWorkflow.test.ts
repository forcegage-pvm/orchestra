/**
 * End-to-End Verify-Fix Workflow Integration Tests
 *
 * Validates the full session management workflow including:
 * 1. Complete verify-fail-continue-implementor-fix-re-verify cycle with message persistence
 * 2. Session chain integrity: parent → child linkage, stage tracking, message preservation
 * 3. Cascade delete: session deletion removes associated session_messages
 * 4. Retention policy interaction: purgeOldSessions cleans up session_messages via cascade
 * 5. Backward compatibility: sessions without message history or stage fields still work
 *
 * These tests use file-based SQLite database with the better-sqlite3
 * compatibility detection pattern matching existing test conventions.
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  describe.skip(
    "Verify-Fix Workflow E2E (skipped: native module incompatible)",
    () => {
      it("skipped due to NODE_MODULE_VERSION mismatch", () => {});
    },
  );
} else {
  // Dynamic imports - only when native module is compatible
  const {
    createSession,
    getSession,
    getSessionsForTask,
    continueSession,
    getSessionChain,
    deleteSession,
  } = await import(
    "../../src/agents/sessions/sessionRepository.js"
  );

  const {
    insertMessage,
    getSessionMessages,
    getSessionStats,
  } = await import(
    "../../src/agents/sessions/sessionMessageRepository.js"
  );

  const { purgeOldSessions } = await import(
    "../../src/agents/sessions/retention.js"
  );

  const { OrchestraDB } = await import("../../../src/database/client.js");

  // ======================================================================
  // Test Fixtures & Helpers
  // ======================================================================

  let testWorkspaceRoot: string;
  let testDbPath: string;

  /**
   * Create a minimal Orchestra database with all necessary tables.
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

    // Create agent_sessions table with continuation columns
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
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

    // Create session_events table (for retention)
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

    // Create session_messages table
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        message_index INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        token_count INTEGER,
        timestamp TEXT NOT NULL,
        iteration INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_task ON agent_sessions(task_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_role ON agent_sessions(task_id, role);
      CREATE INDEX IF NOT EXISTS idx_sessions_parent ON agent_sessions(parent_session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_session ON session_messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_session_message ON session_messages(session_id, message_index);
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
      `Description for task ${taskId}`,
      "implementation",
      "PENDING",
      now,
      now,
    );

    db.close();
  }

  /**
   * Insert a test session directly (for raw database operations)
   */
  function insertTestSessionRaw(
    sessionId: string,
    taskId: number,
    options: {
      sprintId?: string;
      role?: string;
      status?: string;
      stage?: string | null;
      parentSessionId?: string | null;
    } = {},
  ): void {
    if (!canRunTests) return;
    const db = new Database!(testDbPath);
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO agent_sessions (id, task_id, sprint_id, role, status, started_at, last_activity_at, stage, parent_session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      sessionId,
      taskId,
      options.sprintId ?? "sprint-001",
      options.role ?? "implementor",
      options.status ?? "running",
      now,
      now,
      options.stage ?? null,
      options.parentSessionId ?? null,
    );

    db.close();
  }

  /**
   * Insert a test session_event (for retention counting)
   */
  function insertTestEvent(
    eventId: string,
    sessionId: string,
  ): void {
    if (!canRunTests) return;
    const db = new Database!(testDbPath);
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO session_events (id, session_id, type, timestamp, iteration, payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(eventId, sessionId, "status_change", now, 0, JSON.stringify({ type: "test" }));

    db.close();
  }

  /**
   * Count messages for a given session directly via raw SQL
   */
  function countMessagesForSession(sessionId: string): number {
    if (!canRunTests) return 0;
    const db = new Database!(testDbPath);
    const result = db
      .prepare("SELECT COUNT(*) as count FROM session_messages WHERE session_id = ?")
      .get(sessionId) as { count: number };
    db.close();
    return result.count;
  }

  /**
   * Count all messages in the database
   */
  function countAllMessages(): number {
    if (!canRunTests) return 0;
    const db = new Database!(testDbPath);
    const result = db
      .prepare("SELECT COUNT(*) as count FROM session_messages")
      .get() as { count: number };
    db.close();
    return result.count;
  }

  /**
   * Count all sessions in the database
   */
  function countAllSessions(): number {
    if (!canRunTests) return 0;
    const db = new Database!(testDbPath);
    const result = db
      .prepare("SELECT COUNT(*) as count FROM agent_sessions")
      .get() as { count: number };
    db.close();
    return result.count;
  }

  /**
   * Check if a session exists in the database
   */
  function sessionExists(sessionId: string): boolean {
    if (!canRunTests) return false;
    const db = new Database!(testDbPath);
    const result = db
      .prepare("SELECT COUNT(*) as count FROM agent_sessions WHERE id = ?")
      .get(sessionId) as { count: number };
    db.close();
    return result.count > 0;
  }

  const describeIfCompatible = canRunTests ? describe : describe.skip;

  // ======================================================================
  // Test Suite: E2E Verify-Fix Workflow
  // ======================================================================

  describeIfCompatible("Verify-Fix Workflow E2E", () => {
    beforeEach(() => {
      testWorkspaceRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "orchestra-e2e-workflow-test-"),
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

    // ==================================================================
    // 1. Complete verify-fail-continue-fix-re-verify cycle
    // ==================================================================
    describe("Complete verify-fail-continue-fix-re-verify cycle", () => {
      it("should create a session, add messages, continue on verify failure, and preserve messages in the child", () => {
        insertTestTask(1);

        // Step 1: Create the initial IMPLEMENT session
        const parentSession = createSession(testWorkspaceRoot, {
          taskId: 1,
          sprintId: "sprint-001",
          role: "implementor",
          status: "completed",
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          iteration: 5,
          maxIterations: 50,
          stage: "IMPLEMENT",
          attempt: 0,
          toolCallCount: 10,
          successfulToolCalls: 9,
          failedToolCalls: 1,
          warningCount: 0,
          filesModified: ["src/main.ts", "src/utils.ts"],
        });

        // Step 2: Add conversation messages to the parent session
        insertMessage(testWorkspaceRoot, {
          session_id: parentSession.sessionId,
          role: "system",
          content: "You are an implementor agent.",
          iteration: 0,
          token_count: 10,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: parentSession.sessionId,
          role: "user",
          content: "Implement feature X for task 1",
          iteration: 1,
          token_count: 15,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: parentSession.sessionId,
          role: "assistant",
          content: "I will implement feature X. Let me start by reading the codebase.",
          iteration: 1,
          token_count: 20,
        });

        // Verify parent has 3 messages
        const parentMessages = getSessionMessages(testWorkspaceRoot, parentSession.sessionId);
        expect(parentMessages).toHaveLength(3);

        // Step 3: Simulate verification failure → create continuation child
        const continuationPrompt = "Verification failed: Missing error handling in src/main.ts. Please fix.";
        const childSession = continueSession(
          testWorkspaceRoot,
          parentSession.sessionId,
          continuationPrompt,
          "IMPLEMENT_FIX",
        );

        // Step 4: Verify child session properties
        expect(childSession.sessionId).not.toBe(parentSession.sessionId);
        expect(childSession.parentSessionId).toBe(parentSession.sessionId);
        expect(childSession.stage).toBe("IMPLEMENT_FIX");
        expect(childSession.attempt).toBe(1);
        expect(childSession.taskId).toBe(1);
        expect(childSession.role).toBe("implementor");

        // Step 5: Verify messages were copied to child and continuation prompt appended
        const childMessages = getSessionMessages(testWorkspaceRoot, childSession.sessionId);
        // 3 from parent + 1 continuation prompt = 4
        expect(childMessages).toHaveLength(4);

        // Verify original messages are preserved in order
        expect(childMessages[0].role).toBe("system");
        expect(childMessages[0].content).toBe("You are an implementor agent.");
        expect(childMessages[1].role).toBe("user");
        expect(childMessages[1].content).toBe("Implement feature X for task 1");
        expect(childMessages[2].role).toBe("assistant");
        expect(childMessages[2].content).toBe(
          "I will implement feature X. Let me start by reading the codebase.",
        );

        // Verify continuation prompt was appended
        expect(childMessages[3].role).toBe("user");
        expect(childMessages[3].content).toBe(continuationPrompt);

        // Step 6: Verify the session chain is queryable
        const chain = getSessionChain(testWorkspaceRoot, parentSession.sessionId);
        expect(chain).toHaveLength(2);
        expect(chain[0].sessionId).toBe(parentSession.sessionId);
        expect(chain[1].sessionId).toBe(childSession.sessionId);
      });

      it("should support multi-level continuation chains (verify → fix → re-verify → fix again)", () => {
        insertTestTask(1);

        // Level 0: Original IMPLEMENT session
        const root = createSession(testWorkspaceRoot, {
          taskId: 1,
          sprintId: "sprint-001",
          role: "implementor",
          status: "completed",
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          iteration: 3,
          maxIterations: 50,
          stage: "IMPLEMENT",
          attempt: 0,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
        });

        // Add a message to root
        insertMessage(testWorkspaceRoot, {
          session_id: root.sessionId,
          role: "user",
          content: "Initial prompt",
          iteration: 0,
        });

        // Level 1: First fix attempt
        const fix1 = continueSession(
          testWorkspaceRoot,
          root.sessionId,
          "Fix attempt 1",
          "IMPLEMENT_FIX",
        );

        // Level 2: Second fix attempt
        const fix2 = continueSession(
          testWorkspaceRoot,
          fix1.sessionId,
          "Fix attempt 2",
          "IMPLEMENT_FIX",
        );

        // Verify chain from root
        const chain = getSessionChain(testWorkspaceRoot, root.sessionId);
        expect(chain).toHaveLength(3);
        expect(chain[0].sessionId).toBe(root.sessionId);
        expect(chain[0].stage).toBe("IMPLEMENT");
        expect(chain[0].attempt).toBe(0);

        expect(chain[1].sessionId).toBe(fix1.sessionId);
        expect(chain[1].stage).toBe("IMPLEMENT_FIX");
        expect(chain[1].attempt).toBe(1);

        expect(chain[2].sessionId).toBe(fix2.sessionId);
        expect(chain[2].stage).toBe("IMPLEMENT_FIX");
        expect(chain[2].attempt).toBe(2);

        // Verify messages accumulate through chain
        const fix2Messages = getSessionMessages(testWorkspaceRoot, fix2.sessionId);
        // root: 1 msg → fix1: 1+1=2 → fix2: 2+1=3
        expect(fix2Messages).toHaveLength(3);
        expect(fix2Messages[0].content).toBe("Initial prompt");
        expect(fix2Messages[1].content).toBe("Fix attempt 1");
        expect(fix2Messages[2].content).toBe("Fix attempt 2");
      });
    });

    // ==================================================================
    // 2. Session chain integrity
    // ==================================================================
    describe("Session chain integrity", () => {
      it("should maintain parent_session_id linkage and correct stage values through the chain", () => {
        insertTestTask(1);

        // Create parent with IMPLEMENT stage
        const parent = createSession(testWorkspaceRoot, {
          taskId: 1,
          sprintId: "sprint-001",
          role: "implementor",
          status: "completed",
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          iteration: 5,
          maxIterations: 50,
          stage: "IMPLEMENT",
          attempt: 0,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
        });

        // Add messages to parent
        insertMessage(testWorkspaceRoot, {
          session_id: parent.sessionId,
          role: "user",
          content: "Implement the feature",
          iteration: 0,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: parent.sessionId,
          role: "assistant",
          content: "Done implementing",
          iteration: 1,
        });

        // Continue with IMPLEMENT_FIX stage
        const child = continueSession(
          testWorkspaceRoot,
          parent.sessionId,
          "Verification failed - please fix",
          "IMPLEMENT_FIX",
        );

        // Validate parent_session_id linkage
        expect(child.parentSessionId).toBe(parent.sessionId);

        // Validate stage values
        const retrievedParent = getSession(testWorkspaceRoot, parent.sessionId);
        const retrievedChild = getSession(testWorkspaceRoot, child.sessionId);

        expect(retrievedParent?.stage).toBe("IMPLEMENT");
        expect(retrievedChild?.stage).toBe("IMPLEMENT_FIX");

        // Validate getSessionChain returns correct chain
        const chain = getSessionChain(testWorkspaceRoot, parent.sessionId);
        expect(chain).toHaveLength(2);
        expect(chain[0].sessionId).toBe(parent.sessionId);
        expect(chain[0].stage).toBe("IMPLEMENT");
        expect(chain[1].sessionId).toBe(child.sessionId);
        expect(chain[1].stage).toBe("IMPLEMENT_FIX");
        expect(chain[1].parentSessionId).toBe(parent.sessionId);

        // Verify messages are preserved in child
        const childMessages = getSessionMessages(testWorkspaceRoot, child.sessionId);
        expect(childMessages).toHaveLength(3); // 2 parent + 1 continuation
        expect(childMessages[0].content).toBe("Implement the feature");
        expect(childMessages[1].content).toBe("Done implementing");
        expect(childMessages[2].content).toBe("Verification failed - please fix");
      });

      it("should track parent marked as continued with correct metadata", () => {
        insertTestTask(1);

        const parent = createSession(testWorkspaceRoot, {
          taskId: 1,
          sprintId: "sprint-001",
          role: "implementor",
          status: "completed",
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          iteration: 3,
          maxIterations: 50,
          stage: "IMPLEMENT",
          attempt: 0,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
        });

        // Before continuation, parent is not continued
        const parentBefore = getSession(testWorkspaceRoot, parent.sessionId);
        expect(parentBefore?.isContinued).toBe(false);
        expect(parentBefore?.continuationCount).toBe(0);

        // Continue
        continueSession(testWorkspaceRoot, parent.sessionId, "Fix this", "IMPLEMENT_FIX");

        // After continuation, parent is marked as continued
        const parentAfter = getSession(testWorkspaceRoot, parent.sessionId);
        expect(parentAfter?.isContinued).toBe(true);
        expect(parentAfter?.continuationCount).toBe(1);
        expect(parentAfter?.continuedAt).toBeDefined();
      });
    });

    // ==================================================================
    // 3. Cascade delete
    // ==================================================================
    describe("Cascade delete", () => {
      it("should delete session_messages when parent session is deleted via deleteSession", () => {
        insertTestTask(1);
        insertTestSessionRaw("cascade-test-session", 1);

        // Insert messages
        insertMessage(testWorkspaceRoot, {
          session_id: "cascade-test-session",
          role: "user",
          content: "Message 1",
          iteration: 0,
          token_count: 5,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "cascade-test-session",
          role: "assistant",
          content: "Response 1",
          iteration: 0,
          token_count: 8,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "cascade-test-session",
          role: "user",
          content: "Message 2",
          iteration: 1,
          token_count: 5,
        });

        // Verify messages exist
        expect(countMessagesForSession("cascade-test-session")).toBe(3);

        // Delete the session
        const deleted = deleteSession(testWorkspaceRoot, "cascade-test-session");
        expect(deleted).toBe(true);

        // Verify session is gone
        expect(sessionExists("cascade-test-session")).toBe(false);

        // Verify messages were cascade deleted
        expect(countMessagesForSession("cascade-test-session")).toBe(0);
      });

      it("should delete messages when session is deleted via raw SQL (ON DELETE CASCADE)", () => {
        insertTestTask(1);
        insertTestSessionRaw("raw-cascade-session", 1);

        // Insert messages via repository
        insertMessage(testWorkspaceRoot, {
          session_id: "raw-cascade-session",
          role: "user",
          content: "Test message for raw cascade",
          iteration: 0,
        });

        // Verify message exists
        let messages = getSessionMessages(testWorkspaceRoot, "raw-cascade-session");
        expect(messages).toHaveLength(1);

        // Delete session directly via raw SQL (simulating database-level cascade)
        const db = new Database!(testDbPath);
        db.pragma("foreign_keys = ON");
        db.exec(`DELETE FROM agent_sessions WHERE id = 'raw-cascade-session'`);
        db.close();

        // Reconnect and verify messages were cascade deleted
        OrchestraDB.close();
        messages = getSessionMessages(testWorkspaceRoot, "raw-cascade-session");
        expect(messages).toHaveLength(0);

        // Also verify via direct count
        expect(countMessagesForSession("raw-cascade-session")).toBe(0);
      });

      it("should not cascade delete messages for other sessions", () => {
        insertTestTask(1);
        insertTestSessionRaw("session-to-delete", 1);
        insertTestSessionRaw("session-to-keep", 1);

        // Insert messages for both sessions
        insertMessage(testWorkspaceRoot, {
          session_id: "session-to-delete",
          role: "user",
          content: "Delete me",
          iteration: 0,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "session-to-keep",
          role: "user",
          content: "Keep me",
          iteration: 0,
        });

        expect(countAllMessages()).toBe(2);

        // Delete one session
        deleteSession(testWorkspaceRoot, "session-to-delete");

        // Verify only the deleted session's messages are gone
        expect(countMessagesForSession("session-to-delete")).toBe(0);
        expect(countMessagesForSession("session-to-keep")).toBe(1);
        expect(countAllMessages()).toBe(1);
      });
    });

    // ==================================================================
    // 4. Retention policy interaction
    // ==================================================================
    describe("Retention policy interaction with session_messages", () => {
      it("should cascade delete session_messages when purgeOldSessions removes sessions", () => {
        const sprintId = "sprint-retention";

        // Setup: 5 tasks with 1 session each, 3 messages per session
        for (let t = 1; t <= 5; t++) {
          insertTestTask(t, sprintId);
          const sessionId = `session-task-${t}`;
          insertTestSessionRaw(sessionId, t, { sprintId });
          insertTestEvent(`event-${sessionId}`, sessionId);

          for (let m = 0; m < 3; m++) {
            insertMessage(testWorkspaceRoot, {
              session_id: sessionId,
              role: m % 2 === 0 ? "user" : "assistant",
              content: `Message ${m} for task ${t}`,
              iteration: m,
              token_count: 10,
            });
          }
        }

        // Verify initial state
        expect(countAllSessions()).toBe(5);
        expect(countAllMessages()).toBe(15); // 5 tasks * 3 messages

        // Purge (keeps top 3 tasks: 3, 4, 5; removes tasks 1, 2)
        const result = purgeOldSessions(testWorkspaceRoot, sprintId);
        expect(result.sessionsDeleted).toBe(2);

        // Verify sessions reduced
        expect(countAllSessions()).toBe(3);

        // Verify messages for purged sessions are gone
        expect(countMessagesForSession("session-task-1")).toBe(0);
        expect(countMessagesForSession("session-task-2")).toBe(0);

        // Verify messages for retained sessions persist
        expect(countMessagesForSession("session-task-3")).toBe(3);
        expect(countMessagesForSession("session-task-4")).toBe(3);
        expect(countMessagesForSession("session-task-5")).toBe(3);

        // Total messages after purge
        expect(countAllMessages()).toBe(9); // 3 retained tasks * 3 messages
      });

      it("should handle retention when sessions have different message counts", () => {
        const sprintId = "sprint-mixed-msgs";

        // Task 1: 5 messages, Task 2: 0 messages, Task 3: 2 messages,
        // Task 4: 10 messages, Task 5: 1 message
        const messageCounts = [5, 0, 2, 10, 1];

        for (let t = 1; t <= 5; t++) {
          insertTestTask(t, sprintId);
          const sessionId = `session-mixed-${t}`;
          insertTestSessionRaw(sessionId, t, { sprintId });
          insertTestEvent(`event-mixed-${sessionId}`, sessionId);

          for (let m = 0; m < messageCounts[t - 1]; m++) {
            insertMessage(testWorkspaceRoot, {
              session_id: sessionId,
              role: "user",
              content: `Msg ${m} task ${t}`,
              iteration: m,
            });
          }
        }

        // Total messages before purge: 5 + 0 + 2 + 10 + 1 = 18
        expect(countAllMessages()).toBe(18);

        // Purge: keeps tasks 3, 4, 5 (messages: 2 + 10 + 1 = 13)
        purgeOldSessions(testWorkspaceRoot, sprintId);

        expect(countAllMessages()).toBe(13);
        expect(countMessagesForSession("session-mixed-1")).toBe(0);
        expect(countMessagesForSession("session-mixed-2")).toBe(0);
        expect(countMessagesForSession("session-mixed-3")).toBe(2);
        expect(countMessagesForSession("session-mixed-4")).toBe(10);
        expect(countMessagesForSession("session-mixed-5")).toBe(1);
      });

      it("should not affect sessions in other sprints during purge", () => {
        // Setup two sprints
        for (let t = 1; t <= 5; t++) {
          insertTestTask(t, "sprint-a");
          insertTestTask(t + 10, "sprint-b");

          const sessionA = `session-a-${t}`;
          const sessionB = `session-b-${t}`;
          insertTestSessionRaw(sessionA, t, { sprintId: "sprint-a" });
          insertTestSessionRaw(sessionB, t + 10, { sprintId: "sprint-b" });
          insertTestEvent(`event-a-${t}`, sessionA);
          insertTestEvent(`event-b-${t}`, sessionB);

          insertMessage(testWorkspaceRoot, {
            session_id: sessionA,
            role: "user",
            content: `Sprint A Task ${t}`,
            iteration: 0,
          });
          insertMessage(testWorkspaceRoot, {
            session_id: sessionB,
            role: "user",
            content: `Sprint B Task ${t}`,
            iteration: 0,
          });
        }

        expect(countAllMessages()).toBe(10); // 5 sprint-a + 5 sprint-b

        // Purge only sprint-a
        purgeOldSessions(testWorkspaceRoot, "sprint-a");

        // Sprint-a: keeps tasks 3,4,5 → 3 messages; tasks 1,2 purged → 2 messages gone
        // Sprint-b: untouched → 5 messages
        expect(countAllMessages()).toBe(8); // 3 + 5
      });
    });

    // ==================================================================
    // 5. Backward compatibility
    // ==================================================================
    describe("Backward compatibility", () => {
      it("should handle sessions with NULL stage and NULL parent_session_id", () => {
        insertTestTask(1);

        // Create a session without stage or parent_session_id (legacy session)
        insertTestSessionRaw("legacy-session", 1, {
          stage: null,
          parentSessionId: null,
        });

        // Query via getSession — should not error
        const session = getSession(testWorkspaceRoot, "legacy-session");
        expect(session).toBeDefined();
        expect(session!.sessionId).toBe("legacy-session");
        // Optional fields should be undefined (not set) when NULL in DB
        expect(session!.stage).toBeUndefined();
        expect(session!.parentSessionId).toBeUndefined();
        expect(session!.attempt).toBe(0);
        expect(session!.isContinued).toBe(false);
        expect(session!.continuationCount).toBe(0);
      });

      it("should handle sessions with no messages via getSessionsForTask", () => {
        insertTestTask(1);

        // Create sessions without any messages
        insertTestSessionRaw("no-msg-session-1", 1);
        insertTestSessionRaw("no-msg-session-2", 1);

        // Query via getSessionsForTask — should return sessions normally
        const sessions = getSessionsForTask(testWorkspaceRoot, 1);
        expect(sessions).toHaveLength(2);
        expect(sessions.map((s) => s.sessionId)).toContain("no-msg-session-1");
        expect(sessions.map((s) => s.sessionId)).toContain("no-msg-session-2");
      });

      it("should return empty messages for sessions with no message history", () => {
        insertTestTask(1);
        insertTestSessionRaw("empty-msg-session", 1);

        // Query messages for session with no messages
        const messages = getSessionMessages(testWorkspaceRoot, "empty-msg-session");
        expect(messages).toEqual([]);

        // Stats should return zeros
        const stats = getSessionStats(testWorkspaceRoot, "empty-msg-session");
        expect(stats.messageCount).toBe(0);
        expect(stats.totalTokens).toBe(0);
      });

      it("should handle legacy session via getSession with default continuation values", () => {
        insertTestTask(1);

        // Use createSession to create a session without optional continuation fields
        const session = createSession(testWorkspaceRoot, {
          taskId: 1,
          sprintId: "sprint-001",
          role: "implementor",
          status: "running",
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
        });

        const retrieved = getSession(testWorkspaceRoot, session.sessionId);
        expect(retrieved).toBeDefined();
        // Default continuation values should be set
        expect(retrieved!.attempt).toBe(0);
        expect(retrieved!.isContinued).toBe(false);
        expect(retrieved!.continuationCount).toBe(0);
        // Optional fields should not be set when not provided
        expect(retrieved!.stage).toBeUndefined();
        expect(retrieved!.parentSessionId).toBeUndefined();
      });

      it("should work with sessions that have messages but no stage or parent", () => {
        insertTestTask(1);
        insertTestSessionRaw("hybrid-session", 1, {
          stage: null,
          parentSessionId: null,
        });

        // Add messages to the legacy-style session
        insertMessage(testWorkspaceRoot, {
          session_id: "hybrid-session",
          role: "user",
          content: "Hello from a legacy session",
          iteration: 0,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "hybrid-session",
          role: "assistant",
          content: "Response from legacy session",
          iteration: 0,
        });

        // Session query works
        const session = getSession(testWorkspaceRoot, "hybrid-session");
        expect(session).toBeDefined();
        expect(session!.stage).toBeUndefined();

        // Messages are accessible
        const messages = getSessionMessages(testWorkspaceRoot, "hybrid-session");
        expect(messages).toHaveLength(2);
        expect(messages[0].content).toBe("Hello from a legacy session");

        // Stats work
        const stats = getSessionStats(testWorkspaceRoot, "hybrid-session");
        expect(stats.messageCount).toBe(2);
      });
    });

    // ==================================================================
    // 6. Additional message persistence edge cases
    // ==================================================================
    describe("Message persistence in workflow context", () => {
      it("should preserve message token counts through continuation", () => {
        insertTestTask(1);

        const parent = createSession(testWorkspaceRoot, {
          taskId: 1,
          sprintId: "sprint-001",
          role: "implementor",
          status: "completed",
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          iteration: 2,
          maxIterations: 50,
          stage: "IMPLEMENT",
          attempt: 0,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
        });

        insertMessage(testWorkspaceRoot, {
          session_id: parent.sessionId,
          role: "user",
          content: "Do the task",
          iteration: 0,
          token_count: 42,
        });

        // Continue
        const child = continueSession(
          testWorkspaceRoot,
          parent.sessionId,
          "Fix it",
          "IMPLEMENT_FIX",
        );

        const childMessages = getSessionMessages(testWorkspaceRoot, child.sessionId);
        // First message (copied from parent) should preserve token_count
        expect(childMessages[0].token_count).toBe(42);
      });

      it("should generate correct session stats after continuation", () => {
        insertTestTask(1);

        const parent = createSession(testWorkspaceRoot, {
          taskId: 1,
          sprintId: "sprint-001",
          role: "implementor",
          status: "completed",
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          iteration: 1,
          maxIterations: 50,
          stage: "IMPLEMENT",
          attempt: 0,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
        });

        insertMessage(testWorkspaceRoot, {
          session_id: parent.sessionId,
          role: "system",
          content: "System prompt",
          iteration: 0,
          token_count: 10,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: parent.sessionId,
          role: "user",
          content: "Do it",
          iteration: 1,
          token_count: 5,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: parent.sessionId,
          role: "assistant",
          content: "Done",
          iteration: 1,
          token_count: 8,
        });

        // Create child
        const child = continueSession(
          testWorkspaceRoot,
          parent.sessionId,
          "Fix the error",
          "IMPLEMENT_FIX",
        );

        // Child should have stats for 4 messages
        const stats = getSessionStats(testWorkspaceRoot, child.sessionId);
        expect(stats.messageCount).toBe(4);
        expect(stats.systemMessageCount).toBe(1);
        expect(stats.userMessageCount).toBe(2); // original "Do it" + continuation prompt
        expect(stats.assistantMessageCount).toBe(1);
        // Total tokens: 10 + 5 + 8 + auto-estimated for "Fix the error"
        expect(stats.totalTokens).toBeGreaterThan(23);
      });

      it("should not modify parent messages after creating a child session (immutability)", () => {
        insertTestTask(1);

        const parent = createSession(testWorkspaceRoot, {
          taskId: 1,
          sprintId: "sprint-001",
          role: "implementor",
          status: "completed",
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          iteration: 1,
          maxIterations: 50,
          stage: "IMPLEMENT",
          attempt: 0,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
        });

        insertMessage(testWorkspaceRoot, {
          session_id: parent.sessionId,
          role: "user",
          content: "Original task prompt",
          iteration: 0,
          token_count: 15,
        });

        // Snapshot parent messages before continuation
        const parentMessagesBefore = getSessionMessages(testWorkspaceRoot, parent.sessionId);
        const parentIdsBefore = parentMessagesBefore.map((m) => m.id);

        // Create child
        continueSession(testWorkspaceRoot, parent.sessionId, "Fix prompt", "IMPLEMENT_FIX");

        // Verify parent messages are unchanged
        const parentMessagesAfter = getSessionMessages(testWorkspaceRoot, parent.sessionId);
        expect(parentMessagesAfter).toHaveLength(parentMessagesBefore.length);
        expect(parentMessagesAfter.map((m) => m.id)).toEqual(parentIdsBefore);
        expect(parentMessagesAfter[0].content).toBe("Original task prompt");
        expect(parentMessagesAfter[0].token_count).toBe(15);
      });
    });
  });
}
