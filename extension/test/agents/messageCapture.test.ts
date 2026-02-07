
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
    "Message Capture Integration (skipped: native module incompatible)",
    () => {
      it("skipped due to NODE_MODULE_VERSION mismatch", () => {});
    },
  );
} else {
  const { AgentSession } = await import("../../../src/agents/AgentSession.js");
  const { getSessionMessages } = await import(
    "../../../src/agents/sessions/sessionMessageRepository.js"
  );
  const { OrchestraDB } = await import("../../../src/database/client.js");

  // Test fixtures
  let testWorkspaceRoot: string;
  let testDbPath: string;

  /**
   * Create a minimal Orchestra database for testing.
   */
  function createTestDatabase(dbPath: string): void {
    if (!canRunTests) return;
    const db = new Database!(dbPath);

    // Enable foreign keys for CASCADE support
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
    
    // Add indices as in production schema
    db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_session ON session_messages(session_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_session_message ON session_messages(session_id, message_index);`);

    db.close();
  }

  function insertTestTask(taskId: number): void {
    if (!canRunTests) return;
    const db = new Database!(testDbPath);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, sprint_id, phase_id, task_id, title, description, category, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(taskId, "sprint-001", 1, taskId, `Task ${taskId}`, "Desc", "implementation", "PENDING", now, now);
    db.close();
  }

  function insertTestSession(sessionId: string, taskId: number): void {
    if (!canRunTests) return;
    const db = new Database!(testDbPath);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO agent_sessions (id, task_id, sprint_id, role, status, started_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(sessionId, taskId, "sprint-001", "implementor", "running", now, now);
    db.close();
  }

  const describeIfCompatible = canRunTests ? describe : describe.skip;

  describeIfCompatible("Agent Message Capture Integration", () => {
    beforeEach(() => {
      testWorkspaceRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "orchestra-capture-test-"),
      );
      const orchestraDir = path.join(testWorkspaceRoot, ".orchestra");
      fs.mkdirSync(orchestraDir, { recursive: true });
      testDbPath = path.join(orchestraDir, "orchestra.db");
      createTestDatabase(testDbPath);
    });

    afterEach(() => {
      OrchestraDB.close();
      fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
      vi.restoreAllMocks();
    });

    it("should persist messages to database when persistence is enabled", async () => {
      insertTestTask(1);
      insertTestSession("db-session-1", 1);

      const session = new AgentSession("implementor", "sprint-001", 1);
      const dbSessionId = "db-session-1";
      session.enablePersistence(testWorkspaceRoot, dbSessionId);

      session.addMessage({
        id: "msg-1",
        role: "user",
        content: "Hello world",
        timestamp: new Date().toISOString(),
        iteration: 1,
      });

      // Wait for async persistence (fire-and-forget)
      await new Promise((resolve) => setTimeout(resolve, 100));

      const messages = getSessionMessages(testWorkspaceRoot, dbSessionId);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("Hello world");
      expect(messages[0].role).toBe("user");
      expect(messages[0].iteration).toBe(1);
    });

    it("should capture system, user, and assistant messages correctly", async () => {
      insertTestTask(1);
      insertTestSession("db-session-1", 1);

      const session = new AgentSession("implementor", "sprint-001", 1);
      const dbSessionId = "db-session-1";
      session.enablePersistence(testWorkspaceRoot, dbSessionId);

      session.addMessage({
        id: "sys-1",
        role: "system",
        content: "System prompt",
        timestamp: new Date().toISOString(),
        iteration: 0,
      });

      session.addMessage({
        id: "usr-1",
        role: "user",
        content: "User input",
        timestamp: new Date().toISOString(),
        iteration: 1,
      });

      session.addMessage({
        id: "asst-1",
        role: "assistant",
        content: "Assistant response",
        timestamp: new Date().toISOString(),
        iteration: 1,
      });

      // Wait for async persistence
      await new Promise((resolve) => setTimeout(resolve, 100));

      const messages = getSessionMessages(testWorkspaceRoot, dbSessionId);
      expect(messages).toHaveLength(3);
      expect(messages[0].role).toBe("system");
      expect(messages[1].role).toBe("user");
      expect(messages[2].role).toBe("assistant");
    });

    it("should work normally (in-memory only) when persistence is not enabled", async () => {
      insertTestTask(1);
      insertTestSession("db-session-1", 1);

      const session = new AgentSession("implementor", "sprint-001", 1);
      // Not calling enablePersistence()

      session.addMessage({
        id: "msg-1",
        role: "user",
        content: "Hello memory",
        timestamp: new Date().toISOString(),
        iteration: 1,
      });

      // Wait for potential async persistence (shouldn't happen)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify in-memory state
      expect(session.messages).toHaveLength(1);

      // Verify DB state (should be empty)
      const messages = getSessionMessages(testWorkspaceRoot, "db-session-1");
      expect(messages).toHaveLength(0);
    });

    it("should handle fire-and-forget without blocking execution even if DB is slow", async () => {
      insertTestTask(1);
      insertTestSession("db-session-1", 1);

      const session = new AgentSession("implementor", "sprint-001", 1);
      session.enablePersistence(testWorkspaceRoot, "db-session-1");

      const startTime = Date.now();
      session.addMessage({
        id: "msg-1",
        role: "user",
        content: "Fast return",
        timestamp: new Date().toISOString(),
        iteration: 1,
      });
      const duration = Date.now() - startTime;

      // addMessage should return almost immediately (sync check + promise creation)
      expect(duration).toBeLessThan(50); 

      // Eventually it persists
      await new Promise((resolve) => setTimeout(resolve, 100));
      const messages = getSessionMessages(testWorkspaceRoot, "db-session-1");
      expect(messages).toHaveLength(1);
    });

    it("should degrade gracefully (log warning) when DB insert fails", async () => {
      // Don't create the session in DB -> Foreign Key constraint violation
      // This should cause insertMessage to throw
      insertTestTask(1);
      // NO insertTestSession("db-session-1", 1);

      const session = new AgentSession("implementor", "sprint-001", 1);
      session.enablePersistence(testWorkspaceRoot, "db-session-1");

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Should NOT throw
      expect(() => {
        session.addMessage({
          id: "msg-1",
          role: "user",
          content: "Will fail",
          timestamp: new Date().toISOString(),
          iteration: 1,
        });
      }).not.toThrow();

      // Wait for async error handling
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have logged a warning
      expect(consoleSpy).toHaveBeenCalled();
      const warningArgs = consoleSpy.mock.calls[0][0];
      expect(warningArgs).toContain("Failed to persist message");
    });
    
    it("should extract and store toolCallIds correctly", async () => {
        insertTestTask(1);
        insertTestSession("db-session-1", 1);
        
        const session = new AgentSession("implementor", "sprint-001", 1);
        session.enablePersistence(testWorkspaceRoot, "db-session-1");
        
        const toolCallContent = [
            { type: "text" as const, value: "Thinking..." },
            { type: "toolCall" as const, toolCallId: "call-1", name: "test_tool", input: {} }
        ];
        
        session.addMessage({
            id: "msg-1",
            role: "assistant",
            content: toolCallContent,
            timestamp: new Date().toISOString(),
            iteration: 1
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const messages = getSessionMessages(testWorkspaceRoot, "db-session-1");
        expect(messages).toHaveLength(1);
        expect(messages[0].toolCallIds).toEqual(["call-1"]);
    });
  });
}
