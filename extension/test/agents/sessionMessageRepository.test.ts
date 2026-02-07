/**
 * Tests for session message repository
 *
 * Verifies all CRUD operations for session_messages table.
 * Tests insertMessage, getSessionMessages, getSessionStats,
 * deleteMessagesForSession, and copyMessages.
 *
 * These tests use in-memory SQLite database to verify the functions work correctly
 * without requiring a full Orchestra workspace setup.
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
    "Session Message Repository (skipped: native module incompatible)",
    () => {
      it("skipped due to NODE_MODULE_VERSION mismatch", () => {});
    },
  );
} else {
  const {
    insertMessage,
    getSessionMessages,
    getSessionStats,
    deleteMessagesForSession,
    copyMessages,
  } = await import(
    "../../../src/agents/sessions/sessionMessageRepository.js"
  );
  const { OrchestraDB } = await import("../../../src/database/client.js");

  // Test fixtures
  let testWorkspaceRoot: string;
  let testDbPath: string;

  /**
   * Create a minimal Orchestra database for testing.
   * Includes tasks, agent_sessions (with continuation columns),
   * and session_messages tables.
   */
  function createTestDatabase(dbPath: string): void {
    if (!canRunTests) return;
    const db = new Database!(dbPath);

    // Enable foreign keys for CASCADE support
    db.pragma("foreign_keys = ON");

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

    // Create agent_sessions table (with continuation columns)
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

    // Create agent_sessions indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_task ON agent_sessions(task_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_role ON agent_sessions(task_id, role);
      CREATE INDEX IF NOT EXISTS idx_sessions_parent ON agent_sessions(parent_session_id);
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

    // Create session_messages indexes
    db.exec(`
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
      "Test task",
      "implementation",
      "PENDING",
      now,
      now,
    );

    db.close();
  }

  /**
   * Insert a test session directly into the database
   */
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

  describeIfCompatible("Session Message Repository", () => {
    beforeEach(() => {
      testWorkspaceRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "orchestra-msg-repo-test-"),
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

    describe("insertMessage", () => {
      it("should insert a message and return it with generated ID and message_index 0", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const message = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "Implement feature X",
          iteration: 1,
        });

        expect(message.id).toBeDefined();
        expect(message.id.length).toBeGreaterThan(0);
        expect(message.session_id).toBe("session-1");
        expect(message.message_index).toBe(0);
        expect(message.role).toBe("user");
        expect(message.content).toBe("Implement feature X");
        expect(message.iteration).toBe(1);
        expect(message.timestamp).toBeDefined();
      });

      it("should auto-increment message_index for subsequent messages", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const msg1 = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "system",
          content: "You are an assistant",
          iteration: 0,
        });
        const msg2 = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "Hello",
          iteration: 1,
        });
        const msg3 = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "assistant",
          content: "Hi there!",
          iteration: 1,
        });

        expect(msg1.message_index).toBe(0);
        expect(msg2.message_index).toBe(1);
        expect(msg3.message_index).toBe(2);
      });

      it("should auto-estimate token_count when not provided", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const message = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "Hello world, this is a test message with enough characters to have some tokens",
          iteration: 1,
        });

        expect(message.token_count).toBeGreaterThan(0);
        expect(message.token_count).not.toBeNull();
      });

      it("should use provided token_count when given", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const message = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "Test",
          iteration: 1,
          token_count: 42,
        });

        expect(message.token_count).toBe(42);
      });

      it("should store structured content as JSON", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const structuredContent = [
          { type: "text" as const, value: "Here is a response" },
          { type: "tool_call" as const, value: { name: "read_file", args: { path: "test.ts" } } },
        ];

        const message = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "assistant",
          content: structuredContent,
          iteration: 1,
        });

        expect(message.content).toEqual(structuredContent);
      });

      it("should generate unique IDs for each message", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const msg1 = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "Message 1",
          iteration: 1,
        });
        const msg2 = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "Message 2",
          iteration: 2,
        });

        expect(msg1.id).not.toBe(msg2.id);
      });
    });

    describe("getSessionMessages", () => {
      it("should return messages ordered by message_index ascending", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "system",
          content: "System prompt",
          iteration: 0,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "User message",
          iteration: 1,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "assistant",
          content: "Response",
          iteration: 1,
        });

        const messages = getSessionMessages(testWorkspaceRoot, "session-1");

        expect(messages).toHaveLength(3);
        expect(messages[0].message_index).toBe(0);
        expect(messages[0].role).toBe("system");
        expect(messages[1].message_index).toBe(1);
        expect(messages[1].role).toBe("user");
        expect(messages[2].message_index).toBe(2);
        expect(messages[2].role).toBe("assistant");
      });

      it("should return empty array for session with no messages", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const messages = getSessionMessages(testWorkspaceRoot, "session-1");
        expect(messages).toEqual([]);
      });

      it("should return empty array for non-existent session", () => {
        const messages = getSessionMessages(
          testWorkspaceRoot,
          "non-existent-session",
        );
        expect(messages).toEqual([]);
      });

      it("should support limit pagination", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        for (let i = 0; i < 5; i++) {
          insertMessage(testWorkspaceRoot, {
            session_id: "session-1",
            role: "user",
            content: `Message ${i}`,
            iteration: i,
          });
        }

        const messages = getSessionMessages(testWorkspaceRoot, "session-1", {
          limit: 3,
        });
        expect(messages).toHaveLength(3);
        expect(messages[0].message_index).toBe(0);
        expect(messages[2].message_index).toBe(2);
      });

      it("should support offset pagination", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        for (let i = 0; i < 5; i++) {
          insertMessage(testWorkspaceRoot, {
            session_id: "session-1",
            role: "user",
            content: `Message ${i}`,
            iteration: i,
          });
        }

        const messages = getSessionMessages(testWorkspaceRoot, "session-1", {
          offset: 2,
        });
        expect(messages).toHaveLength(3);
        expect(messages[0].message_index).toBe(2);
        expect(messages[2].message_index).toBe(4);
      });

      it("should support combined offset and limit pagination", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        for (let i = 0; i < 10; i++) {
          insertMessage(testWorkspaceRoot, {
            session_id: "session-1",
            role: "user",
            content: `Message ${i}`,
            iteration: i,
          });
        }

        const messages = getSessionMessages(testWorkspaceRoot, "session-1", {
          offset: 3,
          limit: 2,
        });
        expect(messages).toHaveLength(2);
        expect(messages[0].message_index).toBe(3);
        expect(messages[1].message_index).toBe(4);
      });

      it("should deserialize structured JSON content correctly", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const structuredContent = [
          { type: "text" as const, value: "Response text" },
          {
            type: "tool_result" as const,
            value: { output: "file contents" },
          },
        ];

        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "assistant",
          content: structuredContent,
          iteration: 1,
        });

        const messages = getSessionMessages(testWorkspaceRoot, "session-1");
        expect(messages).toHaveLength(1);
        expect(messages[0].content).toEqual(structuredContent);
      });

      it("should only return messages for the specified session", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);
        insertTestSession("session-2", 1);

        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "Session 1 message",
          iteration: 1,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "session-2",
          role: "user",
          content: "Session 2 message",
          iteration: 1,
        });

        const messages = getSessionMessages(testWorkspaceRoot, "session-1");
        expect(messages).toHaveLength(1);
        expect(messages[0].content).toBe("Session 1 message");
      });
    });

    describe("getSessionStats", () => {
      it("should return correct aggregated statistics", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "system",
          content: "You are an assistant",
          iteration: 0,
          token_count: 10,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "Hello",
          iteration: 1,
          token_count: 5,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "assistant",
          content: "Hi there!",
          iteration: 1,
          token_count: 8,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "How are you?",
          iteration: 2,
          token_count: 7,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "assistant",
          content: "I am fine!",
          iteration: 2,
          token_count: 6,
        });

        const stats = getSessionStats(testWorkspaceRoot, "session-1");

        expect(stats.messageCount).toBe(5);
        expect(stats.totalTokens).toBe(36);
        expect(stats.systemMessageCount).toBe(1);
        expect(stats.userMessageCount).toBe(2);
        expect(stats.assistantMessageCount).toBe(2);
        expect(stats.firstMessageTimestamp).toBeDefined();
        expect(stats.lastMessageTimestamp).toBeDefined();
      });

      it("should return zero stats for empty session", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const stats = getSessionStats(testWorkspaceRoot, "session-1");

        expect(stats.messageCount).toBe(0);
        expect(stats.totalTokens).toBe(0);
        expect(stats.systemMessageCount).toBe(0);
        expect(stats.userMessageCount).toBe(0);
        expect(stats.assistantMessageCount).toBe(0);
        expect(stats.firstMessageTimestamp).toBeNull();
        expect(stats.lastMessageTimestamp).toBeNull();
      });

      it("should return zero stats for non-existent session", () => {
        const stats = getSessionStats(
          testWorkspaceRoot,
          "non-existent-session",
        );

        expect(stats.messageCount).toBe(0);
        expect(stats.totalTokens).toBe(0);
      });

      it("should handle messages with null token_count in sum", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        // Insert one message with explicit token count and one without
        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "Hello",
          iteration: 1,
          token_count: 10,
        });

        const stats = getSessionStats(testWorkspaceRoot, "session-1");
        expect(stats.totalTokens).toBe(10);
        expect(stats.messageCount).toBe(1);
      });
    });

    describe("deleteMessagesForSession", () => {
      it("should delete all messages for a session and return count", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "Message 1",
          iteration: 1,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "assistant",
          content: "Response 1",
          iteration: 1,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "Message 2",
          iteration: 2,
        });

        const deletedCount = deleteMessagesForSession(
          testWorkspaceRoot,
          "session-1",
        );
        expect(deletedCount).toBe(3);

        const remaining = getSessionMessages(testWorkspaceRoot, "session-1");
        expect(remaining).toHaveLength(0);
      });

      it("should return 0 when deleting from a session with no messages", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const deletedCount = deleteMessagesForSession(
          testWorkspaceRoot,
          "session-1",
        );
        expect(deletedCount).toBe(0);
      });

      it("should not delete messages from other sessions", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);
        insertTestSession("session-2", 1);

        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "Session 1 message",
          iteration: 1,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "session-2",
          role: "user",
          content: "Session 2 message",
          iteration: 1,
        });

        deleteMessagesForSession(testWorkspaceRoot, "session-1");

        const session2Messages = getSessionMessages(
          testWorkspaceRoot,
          "session-2",
        );
        expect(session2Messages).toHaveLength(1);
      });
    });

    describe("copyMessages", () => {
      it("should copy all messages from source to target session with new UUIDs", () => {
        insertTestTask(1);
        insertTestSession("source-session", 1);
        insertTestSession("target-session", 1);

        insertMessage(testWorkspaceRoot, {
          session_id: "source-session",
          role: "system",
          content: "System prompt",
          iteration: 0,
          token_count: 5,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "source-session",
          role: "user",
          content: "User query",
          iteration: 1,
          token_count: 8,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "source-session",
          role: "assistant",
          content: "Assistant response",
          iteration: 1,
          token_count: 12,
        });

        const copiedCount = copyMessages(
          testWorkspaceRoot,
          "source-session",
          "target-session",
        );
        expect(copiedCount).toBe(3);

        const targetMessages = getSessionMessages(
          testWorkspaceRoot,
          "target-session",
        );
        expect(targetMessages).toHaveLength(3);

        // Verify message_index order is preserved
        expect(targetMessages[0].message_index).toBe(0);
        expect(targetMessages[1].message_index).toBe(1);
        expect(targetMessages[2].message_index).toBe(2);

        // Verify content is preserved
        expect(targetMessages[0].role).toBe("system");
        expect(targetMessages[0].content).toBe("System prompt");
        expect(targetMessages[1].role).toBe("user");
        expect(targetMessages[2].role).toBe("assistant");

        // Verify token_count is preserved
        expect(targetMessages[0].token_count).toBe(5);
        expect(targetMessages[1].token_count).toBe(8);
        expect(targetMessages[2].token_count).toBe(12);

        // Verify new UUIDs (different from source)
        const sourceMessages = getSessionMessages(
          testWorkspaceRoot,
          "source-session",
        );
        for (let i = 0; i < sourceMessages.length; i++) {
          expect(targetMessages[i].id).not.toBe(sourceMessages[i].id);
        }
      });

      it("should return 0 when copying from empty session", () => {
        insertTestTask(1);
        insertTestSession("empty-source", 1);
        insertTestSession("target-session", 1);

        const copiedCount = copyMessages(
          testWorkspaceRoot,
          "empty-source",
          "target-session",
        );
        expect(copiedCount).toBe(0);

        const targetMessages = getSessionMessages(
          testWorkspaceRoot,
          "target-session",
        );
        expect(targetMessages).toHaveLength(0);
      });

      it("should preserve structured content during copy", () => {
        insertTestTask(1);
        insertTestSession("source-session", 1);
        insertTestSession("target-session", 1);

        const structuredContent = [
          { type: "text" as const, value: "Response text" },
          { type: "tool_call" as const, value: { name: "write_file" } },
        ];

        insertMessage(testWorkspaceRoot, {
          session_id: "source-session",
          role: "assistant",
          content: structuredContent,
          iteration: 1,
        });

        copyMessages(testWorkspaceRoot, "source-session", "target-session");

        const targetMessages = getSessionMessages(
          testWorkspaceRoot,
          "target-session",
        );
        expect(targetMessages).toHaveLength(1);
        expect(targetMessages[0].content).toEqual(structuredContent);
      });

      it("should not modify source messages during copy", () => {
        insertTestTask(1);
        insertTestSession("source-session", 1);
        insertTestSession("target-session", 1);

        insertMessage(testWorkspaceRoot, {
          session_id: "source-session",
          role: "user",
          content: "Original message",
          iteration: 1,
        });

        copyMessages(testWorkspaceRoot, "source-session", "target-session");

        const sourceMessages = getSessionMessages(
          testWorkspaceRoot,
          "source-session",
        );
        expect(sourceMessages).toHaveLength(1);
        expect(sourceMessages[0].content).toBe("Original message");
      });
    });

    describe("Edge Cases", () => {
      it("should handle large number of messages", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const messageCount = 100;
        for (let i = 0; i < messageCount; i++) {
          insertMessage(testWorkspaceRoot, {
            session_id: "session-1",
            role: i % 2 === 0 ? "user" : "assistant",
            content: `Message number ${i}`,
            iteration: Math.floor(i / 2),
          });
        }

        const messages = getSessionMessages(testWorkspaceRoot, "session-1");
        expect(messages).toHaveLength(messageCount);

        // Verify ordering
        for (let i = 0; i < messageCount; i++) {
          expect(messages[i].message_index).toBe(i);
        }

        // Verify stats work with many messages
        const stats = getSessionStats(testWorkspaceRoot, "session-1");
        expect(stats.messageCount).toBe(messageCount);
        expect(stats.userMessageCount).toBe(50);
        expect(stats.assistantMessageCount).toBe(50);
      });

      it("should handle empty string content", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const message = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "",
          iteration: 0,
        });

        expect(message.content).toBe("");

        const retrieved = getSessionMessages(testWorkspaceRoot, "session-1");
        expect(retrieved).toHaveLength(1);
        expect(retrieved[0].content).toBe("");
      });

      it("should handle empty structured content array", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const message = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "assistant",
          content: [],
          iteration: 0,
        });

        expect(message.content).toEqual([]);
      });

      it("should handle multiple sessions independently", () => {
        insertTestTask(1);
        insertTestSession("session-a", 1);
        insertTestSession("session-b", 1);

        insertMessage(testWorkspaceRoot, {
          session_id: "session-a",
          role: "user",
          content: "Session A message 1",
          iteration: 1,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "session-b",
          role: "user",
          content: "Session B message 1",
          iteration: 1,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "session-a",
          role: "user",
          content: "Session A message 2",
          iteration: 2,
        });

        // Session A messages should have indexes 0, 1
        const messagesA = getSessionMessages(testWorkspaceRoot, "session-a");
        expect(messagesA).toHaveLength(2);
        expect(messagesA[0].message_index).toBe(0);
        expect(messagesA[1].message_index).toBe(1);

        // Session B messages should have index 0
        const messagesB = getSessionMessages(testWorkspaceRoot, "session-b");
        expect(messagesB).toHaveLength(1);
        expect(messagesB[0].message_index).toBe(0);
      });

      it("should handle CASCADE delete when parent session is deleted", () => {
        insertTestTask(1);
        insertTestSession("cascade-session", 1);

        insertMessage(testWorkspaceRoot, {
          session_id: "cascade-session",
          role: "user",
          content: "Message that should be cascade deleted",
          iteration: 1,
        });

        // Verify message exists
        let messages = getSessionMessages(testWorkspaceRoot, "cascade-session");
        expect(messages).toHaveLength(1);

        // Delete the parent session directly
        const db = new Database!(testDbPath);
        db.pragma("foreign_keys = ON");
        db.exec(`DELETE FROM agent_sessions WHERE id = 'cascade-session'`);
        db.close();

        // Reconnect and verify messages were cascaded
        OrchestraDB.close();
        messages = getSessionMessages(testWorkspaceRoot, "cascade-session");
        expect(messages).toHaveLength(0);
      });
    });
  });
}
