/**
 * Tests for session repository
 *
 * Verifies all CRUD operations for agent_sessions table.
 * Tests createSession, getSession, updateSession, getSessionsForTask,
 * getSessionsForTaskAndRole, getRecentSessions, and deleteSession.
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
// If module version mismatch, skip all tests in this file
let Database: any = null;
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
  describe.skip("Session Repository (skipped: native module incompatible)", () => {
    it("skipped due to NODE_MODULE_VERSION mismatch", () => {});
  });
} else {
  // Import dependencies only if module is compatible
  const {
    createSession,
    getSession,
    updateSession,
    getSessionsForTask,
    getSessionsForTaskAndRole,
    getRecentSessions,
    deleteSession,
  } = await import("../../../src/agents/sessions/sessionRepository.js");
  const { OrchestraDB } = await import("../../../src/database/client.js");
  const type = await import("../../../src/agents/sessions/types.js");

  // Test fixtures
  let testWorkspaceRoot: string;
  let testDbPath: string;

  /**
   * Create a minimal Orchestra database for testing
   * Creates tasks table (required for foreign key) and agent_sessions table
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
        files_modified JSON NOT NULL DEFAULT '[]',
        duration_ms INTEGER,
        FOREIGN KEY (task_id) REFERENCES tasks(id)
      )
    `);

    // Create indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_task ON agent_sessions(task_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_role ON agent_sessions(task_id, role);
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

  // Skip all tests if better-sqlite3 module is incompatible (e.g., compiled for Electron)
  const describeIfCompatible = canRunTests ? describe : describe.skip;

  describeIfCompatible("Session Repository", () => {
    beforeEach(() => {
      // Create temporary directory for test database
      testWorkspaceRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "orchestra-session-repo-test-"),
      );

      // Create .orchestra directory structure
      const orchestraDir = path.join(testWorkspaceRoot, ".orchestra");
      fs.mkdirSync(orchestraDir, { recursive: true });

      // Create test database
      testDbPath = path.join(orchestraDir, "orchestra.db");
      createTestDatabase(testDbPath);
    });

    afterEach(() => {
      // Close database connection before cleanup (critical for Windows)
      OrchestraDB.close();

      // Clean up test workspace
      fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
    });

    describe("createSession", () => {
      it("should create a new session with all required fields", () => {
        insertTestTask(1);

        const session = createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        expect(session.sessionId).toBeDefined();
        expect(session.role).toBe("implementor");
        expect(session.taskId).toBe(1);
        expect(session.sprintId).toBe("sprint-001");
        expect(session.status).toBe("running");
      });

      it("should generate a unique sessionId when not provided", () => {
        insertTestTask(1);

        const session1 = createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        const session2 = createSession(testWorkspaceRoot, {
          role: "orchestrator",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        expect(session1.sessionId).not.toBe(session2.sessionId);
      });

      it("should use provided sessionId if given", () => {
        insertTestTask(1);

        const customId = "custom-uuid-12345";
        const session = createSession(testWorkspaceRoot, {
          sessionId: customId,
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        expect(session.sessionId).toBe(customId);
      });

      it("should store filesModified as JSON array", () => {
        insertTestTask(1);

        const files = ["src/file1.ts", "src/file2.ts"];
        const session = createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: files,
          durationMs: undefined,
        });

        expect(session.filesModified).toEqual(files);
      });

      it("should handle optional fields correctly", () => {
        insertTestTask(1);

        const session = createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: "2026-02-01T11:00:00Z",
          status: "completed",
          statusMessage: "Task completed successfully",
          iteration: 5,
          maxIterations: 50,
          toolCallCount: 20,
          successfulToolCalls: 18,
          failedToolCalls: 2,
          warningCount: 3,
          filesModified: ["src/main.ts"],
          durationMs: 3600000,
        });

        expect(session.endedAt).toBe("2026-02-01T11:00:00Z");
        expect(session.statusMessage).toBe("Task completed successfully");
        expect(session.durationMs).toBe(3600000);
      });
    });

    describe("getSession", () => {
      it("should retrieve an existing session by sessionId", () => {
        insertTestTask(1);

        const created = createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        const retrieved = getSession(testWorkspaceRoot, created.sessionId);

        expect(retrieved).toBeDefined();
        expect(retrieved?.sessionId).toBe(created.sessionId);
        expect(retrieved?.role).toBe("implementor");
        expect(retrieved?.taskId).toBe(1);
      });

      it("should return undefined for non-existent sessionId", () => {
        const retrieved = getSession(testWorkspaceRoot, "non-existent-uuid");
        expect(retrieved).toBeUndefined();
      });

      it("should map all database fields to AgentSession interface", () => {
        insertTestTask(1);

        const created = createSession(testWorkspaceRoot, {
          role: "orchestrator",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:30:00Z",
          endedAt: "2026-02-01T11:00:00Z",
          status: "completed",
          statusMessage: "All tasks completed",
          iteration: 10,
          maxIterations: 50,
          toolCallCount: 42,
          successfulToolCalls: 40,
          failedToolCalls: 2,
          warningCount: 5,
          filesModified: ["src/a.ts", "src/b.ts"],
          durationMs: 1800000,
        });

        const retrieved = getSession(testWorkspaceRoot, created.sessionId);

        expect(retrieved).toMatchObject({
          sessionId: created.sessionId,
          role: "orchestrator",
          taskId: 1,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:30:00Z",
          endedAt: "2026-02-01T11:00:00Z",
          status: "completed",
          statusMessage: "All tasks completed",
          iteration: 10,
          maxIterations: 50,
          toolCallCount: 42,
          successfulToolCalls: 40,
          failedToolCalls: 2,
          warningCount: 5,
          filesModified: ["src/a.ts", "src/b.ts"],
          durationMs: 1800000,
        });
      });
    });

    describe("updateSession", () => {
      it("should update mutable fields of an existing session", () => {
        insertTestTask(1);

        const created = createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        const updated = updateSession(testWorkspaceRoot, created.sessionId, {
          status: "completed",
          iteration: 5,
          toolCallCount: 10,
          successfulToolCalls: 9,
          failedToolCalls: 1,
          endedAt: "2026-02-01T11:00:00Z",
          durationMs: 3600000,
        });

        expect(updated).toBeDefined();
        expect(updated?.status).toBe("completed");
        expect(updated?.iteration).toBe(5);
        expect(updated?.toolCallCount).toBe(10);
        expect(updated?.endedAt).toBe("2026-02-01T11:00:00Z");
        expect(updated?.durationMs).toBe(3600000);
      });

      it("should return undefined when updating non-existent session", () => {
        const updated = updateSession(testWorkspaceRoot, "non-existent-uuid", {
          status: "completed",
        });

        expect(updated).toBeUndefined();
      });

      it("should update only specified fields", () => {
        insertTestTask(1);

        const created = createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: "Initial message",
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        const updated = updateSession(testWorkspaceRoot, created.sessionId, {
          iteration: 3,
        });

        expect(updated?.iteration).toBe(3);
        expect(updated?.status).toBe("running"); // Unchanged
        expect(updated?.statusMessage).toBe("Initial message"); // Unchanged
      });

      it("should update filesModified array", () => {
        insertTestTask(1);

        const created = createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        const newFiles = ["src/updated1.ts", "src/updated2.ts"];
        const updated = updateSession(testWorkspaceRoot, created.sessionId, {
          filesModified: newFiles,
        });

        expect(updated?.filesModified).toEqual(newFiles);
      });
    });

    describe("getSessionsForTask", () => {
      it("should return all sessions for a given taskId", () => {
        insertTestTask(1);

        createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        createSession(testWorkspaceRoot, {
          role: "orchestrator",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T11:00:00Z",
          lastActivityAt: "2026-02-01T11:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        const sessions = getSessionsForTask(testWorkspaceRoot, 1);

        expect(sessions).toHaveLength(2);
        expect(sessions.some((s) => s.role === "implementor")).toBe(true);
        expect(sessions.some((s) => s.role === "orchestrator")).toBe(true);
      });

      it("should return empty array when no sessions exist for taskId", () => {
        insertTestTask(1);
        const sessions = getSessionsForTask(testWorkspaceRoot, 999);
        expect(sessions).toEqual([]);
      });

      it("should return sessions ordered by startedAt descending (most recent first)", () => {
        insertTestTask(1);

        const session1 = createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        const session2 = createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T12:00:00Z",
          lastActivityAt: "2026-02-01T12:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        const sessions = getSessionsForTask(testWorkspaceRoot, 1);

        expect(sessions[0].sessionId).toBe(session2.sessionId); // Most recent first
        expect(sessions[1].sessionId).toBe(session1.sessionId);
      });

      it("should not return sessions from other tasks", () => {
        insertTestTask(1);
        insertTestTask(2);

        createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 2,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T11:00:00Z",
          lastActivityAt: "2026-02-01T11:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        const sessions = getSessionsForTask(testWorkspaceRoot, 1);

        expect(sessions).toHaveLength(1);
        expect(sessions[0].taskId).toBe(1);
      });
    });

    describe("getSessionsForTaskAndRole", () => {
      it("should return sessions filtered by both taskId and role", () => {
        insertTestTask(1);

        createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        createSession(testWorkspaceRoot, {
          role: "orchestrator",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T11:00:00Z",
          lastActivityAt: "2026-02-01T11:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        const implementorSessions = getSessionsForTaskAndRole(
          testWorkspaceRoot,
          1,
          "implementor",
        );
        const orchestratorSessions = getSessionsForTaskAndRole(
          testWorkspaceRoot,
          1,
          "orchestrator",
        );

        expect(implementorSessions).toHaveLength(1);
        expect(implementorSessions[0].role).toBe("implementor");
        expect(orchestratorSessions).toHaveLength(1);
        expect(orchestratorSessions[0].role).toBe("orchestrator");
      });

      it("should return empty array when no sessions match both filters", () => {
        insertTestTask(1);

        createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        const controllerSessions = getSessionsForTaskAndRole(
          testWorkspaceRoot,
          1,
          "controller",
        );

        expect(controllerSessions).toEqual([]);
      });

      it("should return sessions ordered by startedAt descending", () => {
        insertTestTask(1);

        const session1 = createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        const session2 = createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T12:00:00Z",
          lastActivityAt: "2026-02-01T12:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        const sessions = getSessionsForTaskAndRole(
          testWorkspaceRoot,
          1,
          "implementor",
        );

        expect(sessions[0].sessionId).toBe(session2.sessionId);
        expect(sessions[1].sessionId).toBe(session1.sessionId);
      });
    });

    describe("getRecentSessions", () => {
      it("should return the N most recent sessions across all tasks", () => {
        insertTestTask(1);
        insertTestTask(2);

        for (let i = 0; i < 5; i++) {
          createSession(testWorkspaceRoot, {
            role: "implementor",
            taskId: 1,
            taskTitle: undefined,
            sprintId: "sprint-001",
            startedAt: new Date(2026, 1, 1, 10 + i, 0, 0).toISOString(),
            lastActivityAt: new Date(2026, 1, 1, 10 + i, 0, 0).toISOString(),
            endedAt: undefined,
            status: "running",
            statusMessage: undefined,
            iteration: 0,
            maxIterations: 50,
            toolCallCount: 0,
            successfulToolCalls: 0,
            failedToolCalls: 0,
            warningCount: 0,
            filesModified: [],
            durationMs: undefined,
          });
        }

        for (let i = 0; i < 5; i++) {
          createSession(testWorkspaceRoot, {
            role: "orchestrator",
            taskId: 2,
            taskTitle: undefined,
            sprintId: "sprint-001",
            startedAt: new Date(2026, 1, 1, 15 + i, 0, 0).toISOString(),
            lastActivityAt: new Date(2026, 1, 1, 15 + i, 0, 0).toISOString(),
            endedAt: undefined,
            status: "running",
            statusMessage: undefined,
            iteration: 0,
            maxIterations: 50,
            toolCallCount: 0,
            successfulToolCalls: 0,
            failedToolCalls: 0,
            warningCount: 0,
            filesModified: [],
            durationMs: undefined,
          });
        }

        const recentSessions = getRecentSessions(testWorkspaceRoot, 3);

        expect(recentSessions).toHaveLength(3);
        // Most recent should be from task 2
        expect(recentSessions[0].taskId).toBe(2);
      });

      it("should default to 10 sessions when no limit provided", () => {
        insertTestTask(1);

        for (let i = 0; i < 15; i++) {
          createSession(testWorkspaceRoot, {
            role: "implementor",
            taskId: 1,
            taskTitle: undefined,
            sprintId: "sprint-001",
            startedAt: new Date(2026, 1, 1, 10 + i, 0, 0).toISOString(),
            lastActivityAt: new Date(2026, 1, 1, 10 + i, 0, 0).toISOString(),
            endedAt: undefined,
            status: "running",
            statusMessage: undefined,
            iteration: 0,
            maxIterations: 50,
            toolCallCount: 0,
            successfulToolCalls: 0,
            failedToolCalls: 0,
            warningCount: 0,
            filesModified: [],
            durationMs: undefined,
          });
        }

        const recentSessions = getRecentSessions(testWorkspaceRoot);

        expect(recentSessions).toHaveLength(10);
      });

      it("should return all sessions if fewer than limit exist", () => {
        insertTestTask(1);

        for (let i = 0; i < 3; i++) {
          createSession(testWorkspaceRoot, {
            role: "implementor",
            taskId: 1,
            taskTitle: undefined,
            sprintId: "sprint-001",
            startedAt: new Date(2026, 1, 1, 10 + i, 0, 0).toISOString(),
            lastActivityAt: new Date(2026, 1, 1, 10 + i, 0, 0).toISOString(),
            endedAt: undefined,
            status: "running",
            statusMessage: undefined,
            iteration: 0,
            maxIterations: 50,
            toolCallCount: 0,
            successfulToolCalls: 0,
            failedToolCalls: 0,
            warningCount: 0,
            filesModified: [],
            durationMs: undefined,
          });
        }

        const recentSessions = getRecentSessions(testWorkspaceRoot, 10);

        expect(recentSessions).toHaveLength(3);
      });

      it("should return sessions ordered by startedAt descending", () => {
        insertTestTask(1);

        const session1 = createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        const session2 = createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T14:00:00Z",
          lastActivityAt: "2026-02-01T14:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        const recentSessions = getRecentSessions(testWorkspaceRoot, 2);

        expect(recentSessions[0].sessionId).toBe(session2.sessionId);
        expect(recentSessions[1].sessionId).toBe(session1.sessionId);
      });
    });

    describe("deleteSession", () => {
      it("should delete an existing session and return true", () => {
        insertTestTask(1);

        const session = createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        const deleted = deleteSession(testWorkspaceRoot, session.sessionId);

        expect(deleted).toBe(true);

        // Verify session is gone
        const retrieved = getSession(testWorkspaceRoot, session.sessionId);
        expect(retrieved).toBeUndefined();
      });

      it("should return false when deleting non-existent session", () => {
        const deleted = deleteSession(testWorkspaceRoot, "non-existent-uuid");
        expect(deleted).toBe(false);
      });

      it("should not affect other sessions when deleting one", () => {
        insertTestTask(1);

        const session1 = createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        const session2 = createSession(testWorkspaceRoot, {
          role: "orchestrator",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T11:00:00Z",
          lastActivityAt: "2026-02-01T11:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        deleteSession(testWorkspaceRoot, session1.sessionId);

        // session2 should still exist
        const retrieved = getSession(testWorkspaceRoot, session2.sessionId);
        expect(retrieved).toBeDefined();
        expect(retrieved?.sessionId).toBe(session2.sessionId);
      });
    });

    describe("Edge Cases and Error Handling", () => {
      it("should handle empty filesModified array correctly", () => {
        insertTestTask(1);

        const session = createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 0,
          maxIterations: 50,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: undefined,
        });

        const retrieved = getSession(testWorkspaceRoot, session.sessionId);
        expect(retrieved?.filesModified).toEqual([]);
      });

      it("should handle all three role types", () => {
        insertTestTask(1);

        const roles: Array<"orchestrator" | "implementor" | "controller"> = [
          "orchestrator",
          "implementor",
          "controller",
        ];

        roles.forEach((role) => {
          const session = createSession(testWorkspaceRoot, {
            role,
            taskId: 1,
            taskTitle: undefined,
            sprintId: "sprint-001",
            startedAt: "2026-02-01T10:00:00Z",
            lastActivityAt: "2026-02-01T10:00:00Z",
            endedAt: undefined,
            status: "running",
            statusMessage: undefined,
            iteration: 0,
            maxIterations: 50,
            toolCallCount: 0,
            successfulToolCalls: 0,
            failedToolCalls: 0,
            warningCount: 0,
            filesModified: [],
            durationMs: undefined,
          });

          const retrieved = getSession(testWorkspaceRoot, session.sessionId);
          expect(retrieved?.role).toBe(role);
        });
      });

      it("should handle large numbers in aggregate fields", () => {
        insertTestTask(1);

        const session = createSession(testWorkspaceRoot, {
          role: "implementor",
          taskId: 1,
          taskTitle: undefined,
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:00:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 100,
          maxIterations: 200,
          toolCallCount: 9999,
          successfulToolCalls: 9500,
          failedToolCalls: 499,
          warningCount: 250,
          filesModified: [],
          durationMs: 86400000, // 24 hours
        });

        const retrieved = getSession(testWorkspaceRoot, session.sessionId);
        expect(retrieved?.toolCallCount).toBe(9999);
        expect(retrieved?.durationMs).toBe(86400000);
      });
    });
  });
}
