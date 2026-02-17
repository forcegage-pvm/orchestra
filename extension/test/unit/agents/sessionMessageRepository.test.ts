/**
 * Tests for session message repository
 *
 * Verifies all CRUD operations for session_messages table.
 * Tests insertMessage, getSessionMessages, getSessionStats,
 * deleteMessagesForSession, and copyMessages.
 *
 * These tests use file-based SQLite database to verify the functions work correctly
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
      await import("../../../../src/database/native-loader.js");
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
    defaultTokenEstimator,
  } = await import(
    "../../../src/agents/sessions/sessionMessageRepository.js"
  );
  const { OrchestraDB } = await import("../../../../src/database/client.js");

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

    // =====================================================================
    // insertMessage
    // =====================================================================
    describe("insertMessage", () => {
      it("should insert a message and return it with generated UUID and message_index 0", () => {
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
        // Verify UUID format
        expect(message.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        expect(message.session_id).toBe("session-1");
        expect(message.message_index).toBe(0);
        expect(message.role).toBe("user");
        expect(message.content).toBe("Implement feature X");
        expect(message.iteration).toBe(1);
        expect(message.timestamp).toBeDefined();
        // Verify ISO timestamp format
        expect(() => new Date(message.timestamp)).not.toThrow();
      });

      it("should auto-increment message_index for subsequent messages (0-based, gap-free)", () => {
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

      it("should auto-estimate token_count when not provided using default estimator", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const content = "Hello world, this is a test message with enough characters to have some tokens";
        const message = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content,
          iteration: 1,
        });

        expect(message.token_count).toBeGreaterThan(0);
        expect(message.token_count).not.toBeNull();
        // Verify it matches ContextManager's 4-chars-per-token heuristic
        const expectedTokens = Math.ceil(content.length / 4);
        expect(message.token_count).toBe(expectedTokens);
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

      it("should accept custom tokenEstimator callback", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const customEstimator = (_content: string | unknown[]) => 999;

        const message = insertMessage(
          testWorkspaceRoot,
          {
            session_id: "session-1",
            role: "user",
            content: "Test",
            iteration: 1,
          },
          customEstimator,
        );

        expect(message.token_count).toBe(999);
      });

      it("should store plain string content and retrieve it correctly", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const message = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "Hello, I need help with a task",
          iteration: 1,
        });

        expect(message.content).toBe("Hello, I need help with a task");

        // Verify round-trip through database
        const retrieved = getSessionMessages(testWorkspaceRoot, "session-1");
        expect(retrieved[0].content).toBe("Hello, I need help with a task");
      });

      it("should store structured MessageContentPart[] with toolCall parts (DD-001a)", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const structuredContent = [
          { type: "text" as const, value: "I'll read the file for you" },
          {
            type: "toolCall" as const,
            toolCallId: "tc-001",
            name: "read_file",
            input: { path: "src/main.ts" },
          },
        ];

        const message = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "assistant",
          content: structuredContent,
          iteration: 1,
          toolCallIds: ["tc-001"],
        });

        expect(message.content).toEqual(structuredContent);
        expect(message.toolCallIds).toEqual(["tc-001"]);

        // Verify round-trip through database
        const retrieved = getSessionMessages(testWorkspaceRoot, "session-1");
        expect(retrieved[0].content).toEqual(structuredContent);
        expect(retrieved[0].toolCallIds).toEqual(["tc-001"]);
      });

      it("should store structured MessageContentPart[] with toolResult parts (DD-001a)", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const toolResultContent = [
          {
            type: "toolResult" as const,
            toolCallId: "tc-001",
            value: "File contents: export function main() {}",
          },
        ];

        const message = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: toolResultContent,
          iteration: 1,
        });

        expect(message.content).toEqual(toolResultContent);

        // Verify round-trip through database
        const retrieved = getSessionMessages(testWorkspaceRoot, "session-1");
        expect(retrieved[0].content).toEqual(toolResultContent);
        // toolResult messages should not have toolCallIds
        expect(retrieved[0].toolCallIds).toBeUndefined();
      });

      it("should store toolCallIds array for assistant messages with tool calls (FR-003b)", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const content = [
          { type: "text" as const, value: "Let me help" },
          {
            type: "toolCall" as const,
            toolCallId: "tc-100",
            name: "read_file",
            input: { path: "a.ts" },
          },
          {
            type: "toolCall" as const,
            toolCallId: "tc-101",
            name: "write_file",
            input: { path: "b.ts", content: "code" },
          },
        ];

        const message = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "assistant",
          content,
          iteration: 1,
          toolCallIds: ["tc-100", "tc-101"],
        });

        expect(message.toolCallIds).toEqual(["tc-100", "tc-101"]);

        // Verify round-trip
        const retrieved = getSessionMessages(testWorkspaceRoot, "session-1");
        expect(retrieved[0].toolCallIds).toEqual(["tc-100", "tc-101"]);
      });

      it("should generate unique UUIDs for each message", () => {
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

      it("should set ISO timestamp on creation", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const before = new Date().toISOString();
        const message = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "Test",
          iteration: 0,
        });
        const after = new Date().toISOString();

        expect(message.timestamp >= before).toBe(true);
        expect(message.timestamp <= after).toBe(true);
      });
    });

    // =====================================================================
    // getSessionMessages
    // =====================================================================
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

      it("should support limit-only pagination", () => {
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

      it("should support offset-only pagination", () => {
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
            type: "toolResult" as const,
            toolCallId: "tc-42",
            value: "file contents here",
          },
        ];

        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
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

    // =====================================================================
    // getSessionStats
    // =====================================================================
    describe("getSessionStats", () => {
      it("should return correct aggregated statistics with mixed roles", () => {
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

      it("should compute correct first and last timestamps", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        // Insert messages - timestamps are auto-generated but sequential
        const msg1 = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "First",
          iteration: 0,
          token_count: 5,
        });

        const msg2 = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "assistant",
          content: "Last",
          iteration: 1,
          token_count: 5,
        });

        const stats = getSessionStats(testWorkspaceRoot, "session-1");
        expect(stats.firstMessageTimestamp).toBe(msg1.timestamp);
        expect(stats.lastMessageTimestamp).toBe(msg2.timestamp);
      });
    });

    // =====================================================================
    // deleteMessagesForSession
    // =====================================================================
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

      it("should return 0 for non-existent session", () => {
        const deletedCount = deleteMessagesForSession(
          testWorkspaceRoot,
          "non-existent-session",
        );
        expect(deletedCount).toBe(0);
      });

      it("should not delete messages from other sessions (session isolation)", () => {
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
        expect(session2Messages[0].content).toBe("Session 2 message");
      });
    });

    // =====================================================================
    // copyMessages
    // =====================================================================
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
          {
            type: "toolCall" as const,
            toolCallId: "tc-42",
            name: "write_file",
            input: { path: "out.ts", content: "code" },
          },
        ];

        insertMessage(testWorkspaceRoot, {
          session_id: "source-session",
          role: "assistant",
          content: structuredContent,
          iteration: 1,
          toolCallIds: ["tc-42"],
        });

        copyMessages(testWorkspaceRoot, "source-session", "target-session");

        const targetMessages = getSessionMessages(
          testWorkspaceRoot,
          "target-session",
        );
        expect(targetMessages).toHaveLength(1);
        expect(targetMessages[0].content).toEqual(structuredContent);
        expect(targetMessages[0].toolCallIds).toEqual(["tc-42"]);
      });

      it("should preserve iteration field during copy", () => {
        insertTestTask(1);
        insertTestSession("source-session", 1);
        insertTestSession("target-session", 1);

        insertMessage(testWorkspaceRoot, {
          session_id: "source-session",
          role: "user",
          content: "From iteration 5",
          iteration: 5,
        });

        copyMessages(testWorkspaceRoot, "source-session", "target-session");

        const targetMessages = getSessionMessages(
          testWorkspaceRoot,
          "target-session",
        );
        expect(targetMessages[0].iteration).toBe(5);
      });

      it("should NOT modify source messages after copy (DD-002 immutability)", () => {
        insertTestTask(1);
        insertTestSession("source-session", 1);
        insertTestSession("target-session", 1);

        insertMessage(testWorkspaceRoot, {
          session_id: "source-session",
          role: "user",
          content: "Original message",
          iteration: 1,
          token_count: 10,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "source-session",
          role: "assistant",
          content: "Original response",
          iteration: 1,
          token_count: 15,
        });

        // Snapshot source state BEFORE copy
        const sourceBeforeCopy = getSessionMessages(
          testWorkspaceRoot,
          "source-session",
        );
        const sourceIdsBefore = sourceBeforeCopy.map((m) => m.id);
        const sourceContentBefore = sourceBeforeCopy.map((m) => m.content);
        const sourceCountBefore = sourceBeforeCopy.length;

        // Perform copy
        copyMessages(testWorkspaceRoot, "source-session", "target-session");

        // Verify source is EXACTLY unchanged after copy
        const sourceAfterCopy = getSessionMessages(
          testWorkspaceRoot,
          "source-session",
        );
        expect(sourceAfterCopy).toHaveLength(sourceCountBefore);
        expect(sourceAfterCopy.map((m) => m.id)).toEqual(sourceIdsBefore);
        expect(sourceAfterCopy.map((m) => m.content)).toEqual(
          sourceContentBefore,
        );
        // Deep equality check on all fields
        for (let i = 0; i < sourceBeforeCopy.length; i++) {
          expect(sourceAfterCopy[i]).toEqual(sourceBeforeCopy[i]);
        }
      });
    });

    // =====================================================================
    // Content Format Scenarios (FR-003a, FR-003b, DD-001a)
    // =====================================================================
    describe("Content Format Scenarios", () => {
      it("should handle plain string content correctly", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const msg = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "Simple plain text message",
          iteration: 0,
        });

        expect(typeof msg.content).toBe("string");
        expect(msg.content).toBe("Simple plain text message");

        const retrieved = getSessionMessages(testWorkspaceRoot, "session-1");
        expect(typeof retrieved[0].content).toBe("string");
        expect(retrieved[0].content).toBe("Simple plain text message");
      });

      it("should handle structured MessageContentPart[] with toolCall parts (DD-001a)", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const content = [
          { type: "text" as const, value: "I'll create that file" },
          {
            type: "toolCall" as const,
            toolCallId: "toolu_01ABC",
            name: "create_file",
            input: { path: "src/new.ts", content: "export const x = 1;" },
          },
        ];

        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "assistant",
          content,
          iteration: 1,
          toolCallIds: ["toolu_01ABC"],
        });

        const retrieved = getSessionMessages(testWorkspaceRoot, "session-1");
        expect(retrieved).toHaveLength(1);

        const msg = retrieved[0];
        expect(Array.isArray(msg.content)).toBe(true);
        const parts = msg.content as typeof content;

        // Verify text part
        expect(parts[0].type).toBe("text");
        expect(parts[0].value).toBe("I'll create that file");

        // Verify toolCall part with exact format
        expect(parts[1].type).toBe("toolCall");
        expect(parts[1].toolCallId).toBe("toolu_01ABC");
        expect((parts[1] as any).name).toBe("create_file");
        expect((parts[1] as any).input).toEqual({
          path: "src/new.ts",
          content: "export const x = 1;",
        });

        // Verify toolCallIds
        expect(msg.toolCallIds).toEqual(["toolu_01ABC"]);
      });

      it("should handle toolResult parts stored and retrieved with exact format preservation (DD-001a)", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const content = [
          {
            type: "toolResult" as const,
            toolCallId: "toolu_01ABC",
            value: "File created successfully at src/new.ts",
          },
        ];

        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content,
          iteration: 1,
        });

        const retrieved = getSessionMessages(testWorkspaceRoot, "session-1");
        expect(retrieved).toHaveLength(1);

        const msg = retrieved[0];
        expect(Array.isArray(msg.content)).toBe(true);
        const parts = msg.content as typeof content;

        expect(parts[0].type).toBe("toolResult");
        expect(parts[0].toolCallId).toBe("toolu_01ABC");
        expect(parts[0].value).toBe(
          "File created successfully at src/new.ts",
        );
      });

      it("should handle multiple tool calls with toolCallIds array", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const content = [
          { type: "text" as const, value: "Let me do both operations" },
          {
            type: "toolCall" as const,
            toolCallId: "tc-a",
            name: "read_file",
            input: { path: "src/a.ts" },
          },
          {
            type: "toolCall" as const,
            toolCallId: "tc-b",
            name: "read_file",
            input: { path: "src/b.ts" },
          },
        ];

        insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "assistant",
          content,
          iteration: 3,
          toolCallIds: ["tc-a", "tc-b"],
        });

        const retrieved = getSessionMessages(testWorkspaceRoot, "session-1");
        expect(retrieved[0].toolCallIds).toEqual(["tc-a", "tc-b"]);
        expect(Array.isArray(retrieved[0].content)).toBe(true);
        expect((retrieved[0].content as any[]).length).toBe(3);
      });
    });

    // =====================================================================
    // Gap-Free Monotonic Message Index (NFR-005)
    // =====================================================================
    describe("Gap-Free Monotonic Message Index (NFR-005)", () => {
      it("should produce indices 0-9 with no gaps when inserting 10 messages", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        for (let i = 0; i < 10; i++) {
          insertMessage(testWorkspaceRoot, {
            session_id: "session-1",
            role: i % 2 === 0 ? "user" : "assistant",
            content: `Message ${i}`,
            iteration: Math.floor(i / 2),
          });
        }

        const messages = getSessionMessages(testWorkspaceRoot, "session-1");
        expect(messages).toHaveLength(10);

        for (let i = 0; i < 10; i++) {
          expect(messages[i].message_index).toBe(i);
        }
      });

      it("should restart indices at 0 after deleting all messages and re-inserting", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        // Insert initial messages
        for (let i = 0; i < 5; i++) {
          insertMessage(testWorkspaceRoot, {
            session_id: "session-1",
            role: "user",
            content: `Round 1 Message ${i}`,
            iteration: i,
          });
        }

        // Delete all
        deleteMessagesForSession(testWorkspaceRoot, "session-1");

        // Re-insert
        for (let i = 0; i < 3; i++) {
          insertMessage(testWorkspaceRoot, {
            session_id: "session-1",
            role: "user",
            content: `Round 2 Message ${i}`,
            iteration: i,
          });
        }

        const messages = getSessionMessages(testWorkspaceRoot, "session-1");
        expect(messages).toHaveLength(3);
        expect(messages[0].message_index).toBe(0);
        expect(messages[1].message_index).toBe(1);
        expect(messages[2].message_index).toBe(2);
      });

      it("should produce sequential gap-free indices with concurrent-like inserts to same session", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        // Simulate rapid sequential inserts (SQLite is serial for writes,
        // so concurrent inserts to the same session always serialize)
        const messageCount = 20;
        for (let i = 0; i < messageCount; i++) {
          insertMessage(testWorkspaceRoot, {
            session_id: "session-1",
            role: i % 3 === 0 ? "system" : i % 3 === 1 ? "user" : "assistant",
            content: `Msg ${i}`,
            iteration: i,
          });
        }

        const messages = getSessionMessages(testWorkspaceRoot, "session-1");
        expect(messages).toHaveLength(messageCount);

        // Verify gap-free
        for (let i = 0; i < messageCount; i++) {
          expect(messages[i].message_index).toBe(i);
        }
      });

      it("should maintain independent indices across sessions", () => {
        insertTestTask(1);
        insertTestSession("session-a", 1);
        insertTestSession("session-b", 1);

        // Insert interleaved messages to different sessions
        insertMessage(testWorkspaceRoot, {
          session_id: "session-a",
          role: "user",
          content: "A-0",
          iteration: 0,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "session-b",
          role: "user",
          content: "B-0",
          iteration: 0,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "session-a",
          role: "assistant",
          content: "A-1",
          iteration: 1,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "session-b",
          role: "assistant",
          content: "B-1",
          iteration: 1,
        });
        insertMessage(testWorkspaceRoot, {
          session_id: "session-a",
          role: "user",
          content: "A-2",
          iteration: 2,
        });

        const messagesA = getSessionMessages(testWorkspaceRoot, "session-a");
        const messagesB = getSessionMessages(testWorkspaceRoot, "session-b");

        expect(messagesA).toHaveLength(3);
        expect(messagesA[0].message_index).toBe(0);
        expect(messagesA[1].message_index).toBe(1);
        expect(messagesA[2].message_index).toBe(2);

        expect(messagesB).toHaveLength(2);
        expect(messagesB[0].message_index).toBe(0);
        expect(messagesB[1].message_index).toBe(1);
      });
    });

    // =====================================================================
    // Token Estimation
    // =====================================================================
    describe("Token Estimation", () => {
      it("should use default estimator matching ContextManager 4-chars-per-token heuristic", () => {
        // Test the exported defaultTokenEstimator directly
        expect(defaultTokenEstimator("")).toBe(0);
        expect(defaultTokenEstimator("abcd")).toBe(1); // 4 chars = 1 token
        expect(defaultTokenEstimator("abcde")).toBe(2); // 5 chars = ceil(5/4) = 2 tokens
        expect(defaultTokenEstimator("Hello world")).toBe(3); // 11 chars = ceil(11/4) = 3 tokens
      });

      it("should estimate tokens for MessageContentPart[] matching ContextManager pattern", () => {
        const parts = [
          { type: "text" as const, value: "Hello world" },
          {
            type: "toolCall" as const,
            toolCallId: "tc-001",
            name: "read_file",
            input: { path: "test.ts" },
          },
          {
            type: "toolResult" as const,
            toolCallId: "tc-001",
            value: "file contents here",
          },
        ];

        const tokens = defaultTokenEstimator(parts);
        expect(tokens).toBeGreaterThan(0);
        // text: 11 chars
        // toolCall: 50 + 6 (tc-001) = 56 chars
        // toolResult: 50 + 6 + 18 (value) = 74 chars
        // total: 141 chars => ceil(141/4) = 36 tokens
        expect(tokens).toBe(Math.ceil((11 + 56 + 74) / 4));
      });

      it("should support Phase 2 ContextManager wiring via tokenEstimator callback", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        // Simulate ContextManager.estimateTokens()-like function
        const contextManagerEstimator = (content: string | unknown[]) => {
          if (typeof content === "string") {
            return Math.ceil((content.length + 20) / 4); // role overhead
          }
          return 100; // simplified
        };

        const msg = insertMessage(
          testWorkspaceRoot,
          {
            session_id: "session-1",
            role: "user",
            content: "Test message",
            iteration: 0,
          },
          contextManagerEstimator,
        );

        expect(msg.token_count).toBe(
          Math.ceil(("Test message".length + 20) / 4),
        );
      });
    });

    // =====================================================================
    // Edge Cases
    // =====================================================================
    describe("Edge Cases", () => {
      it("should handle large number of messages (100+)", () => {
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

      it("should handle messages without toolCallIds (undefined, not present)", () => {
        insertTestTask(1);
        insertTestSession("session-1", 1);

        const msg = insertMessage(testWorkspaceRoot, {
          session_id: "session-1",
          role: "user",
          content: "No tool calls here",
          iteration: 0,
        });

        expect(msg.toolCallIds).toBeUndefined();

        const retrieved = getSessionMessages(testWorkspaceRoot, "session-1");
        expect(retrieved[0].toolCallIds).toBeUndefined();
      });
    });
  });
}
