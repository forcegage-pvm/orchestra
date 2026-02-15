import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi, test } from "vitest";

// Mock VS Code API
vi.mock("vscode", () => {
  const EventEmitter = class {
    event = () => {};
    fire() {}
    dispose() {}
  };
  return {
    EventEmitter,
    CancellationTokenSource: class {
      token = {
        isCancellationRequested: false,
        onCancellationRequested: () => {
          return { dispose: () => {} };
        },
      };
      cancel() {}
      dispose() {}
    },
    workspace: {
      workspaceFolders: [],
      fs: {
        readFile: vi.fn(),
      },
      onDidSaveTextDocument: () => {
        return { dispose: () => {} };
      },
      onDidChangeTextDocument: () => {
        return { dispose: () => {} };
      },
    },
    Uri: {
      file: (p: string) => ({ fsPath: p }),
      parse: (p: string) => ({ fsPath: p }),
    },
    Range: class {},
    Position: class {},
    Diagnostic: class {},
    DiagnosticSeverity: { Error: 0 },
  };
});

// Native binary check (same pattern as sessionResume.test.ts)
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

if (!moduleCompatible) {
  describe.skip(
    "continueSessionExecution Integration (skipped: native module incompatible)",
    () => {
      it("skipped due to native module incompatibility", () => {});
    },
  );
} else {
  const { AgentRunner } = await import("../../../src/agents/AgentRunner.js");
  const { ToolRegistry } = await import("../../../src/agents/ToolRegistry.js");
  const { AgentSession } = await import("../../../src/agents/AgentSession.js");
  const { insertMessage } = await import(
    "../../../src/agents/sessions/sessionMessageRepository.js"
  );
  const { insertEvent } = await import(
    "../../../src/agents/sessions/eventRepository.js"
  );
  const {
    createSession,
    getSession,
    getSessionsForTask,
  } = await import("../../../src/agents/sessions/sessionRepository.js");
  const { AgentError, SessionError } = await import(
    "../../../src/agents/errors.js"
  );
  const { OrchestraDB } = await import("../../../src/database/client.js");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");

  // Helpers
  let testWorkspaceRoot: string;
  let testDbPath: string;

  function createTestDatabase(dbPath: string): void {
    const db = new Database(dbPath);
    db.pragma("foreign_keys = ON");

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

    db.exec(`
      CREATE TABLE IF NOT EXISTS session_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        iteration INTEGER NOT NULL DEFAULT 0,
        payload JSON NOT NULL,
        tool_call_id TEXT,
        tool_name TEXT,
        success INTEGER,
        duration_ms INTEGER,
        severity TEXT
      )
    `);

    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_messages_session ON session_messages(session_id);`,
    );
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);`,
    );

    db.close();
  }

  function insertTestTask(taskId: number): void {
    const db = new Database(testDbPath);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, sprint_id, phase_id, task_id, title, description, category, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      taskId,
      "sprint-001",
      1,
      taskId,
      `Task ${taskId}`,
      "Desc",
      "implementation",
      "PENDING",
      now,
      now,
    );
    db.close();
  }

  /**
   * Create a parent session via repository and return its sessionId.
   */
  function createParentSessionWithMessages(
    taskId: number,
    role = "implementor",
    status = "completed",
  ): string {
    const parent = createSession(testWorkspaceRoot, {
      taskId,
      sprintId: "sprint-001",
      role: role as any,
      status: status as any,
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

    // Add parent messages
    insertMessage(testWorkspaceRoot, {
      session_id: parent.sessionId,
      role: "user",
      content: "Please implement feature X",
      iteration: 0,
    });
    insertMessage(testWorkspaceRoot, {
      session_id: parent.sessionId,
      role: "assistant",
      content: "I will implement feature X now.",
      iteration: 1,
    });

    return parent.sessionId;
  }

  beforeEach(async () => {
    testWorkspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "orchestra-continue-exec-test-"),
    );
    const orchestraDir = path.join(testWorkspaceRoot, ".orchestra");
    fs.mkdirSync(orchestraDir, { recursive: true });
    testDbPath = path.join(orchestraDir, "orchestra.db");
    createTestDatabase(testDbPath);

    const liveDb = new Database(testDbPath);
    const drizzleInstance = drizzle(liveDb);

    vi.spyOn(OrchestraDB, "getDrizzleInstance").mockReturnValue(
      drizzleInstance as any,
    );
    vi.spyOn(OrchestraDB, "getInstance").mockReturnValue(liveDb);
    vi.spyOn(OrchestraDB, "close").mockImplementation(() => {
      try {
        if (liveDb.open) liveDb.close();
      } catch (_e) {
        // ignore
      }
    });

    // Mock workspace folder resolution
    vi.mocked(
      (await import("vscode"))!.workspace,
    ).workspaceFolders = [{ uri: { fsPath: testWorkspaceRoot } } as any];
  });

  afterEach(() => {
    OrchestraDB.close();
    try {
      fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
    vi.restoreAllMocks();
  });

  describe("continueSessionExecution", () => {
    test("basic continuation: creates child session, loads messages, starts agent loop", async () => {
      insertTestTask(1);
      const parentSessionId = createParentSessionWithMessages(1);

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });

      // Mock runAgentLoop to prevent actual LLM execution
      const runAgentLoopSpy = vi
        .spyOn(AgentRunner.prototype as any, "runAgentLoop")
        .mockResolvedValue(undefined);

      const continued = await runner.continueSessionExecution({
        sessionId: parentSessionId,
        continuationPrompt: "Please fix the failing tests",
        stage: "IMPLEMENT_FIX",
      });

      // Child session was created and returned
      expect(continued).toBeDefined();
      expect(continued.id).toBeDefined();
      expect(continued.role).toBe("implementor");
      expect(continued.status).toBe("running");

      // Messages were loaded: 2 parent messages + 1 continuation prompt
      expect(continued.messages.length).toBe(3);
      expect(
        continued.messages.some(
          (m) =>
            typeof m.content === "string" &&
            m.content === "Please implement feature X",
        ),
      ).toBe(true);
      expect(
        continued.messages.some(
          (m) =>
            typeof m.content === "string" &&
            m.content === "Please fix the failing tests",
        ),
      ).toBe(true);

      // Agent loop was started
      expect(runAgentLoopSpy).toHaveBeenCalled();

      // Database reflects parent marked as continued
      const parentInDb = getSession(testWorkspaceRoot, parentSessionId);
      expect(parentInDb).toBeDefined();
      expect(parentInDb!.isContinued).toBe(true);
      expect(parentInDb!.continuationCount).toBe(1);
    });

    test("role validation: child inherits parent role (orchestrator stays orchestrator)", async () => {
      insertTestTask(1);
      const parentSessionId = createParentSessionWithMessages(
        1,
        "orchestrator",
        "completed",
      );

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });

      vi.spyOn(
        AgentRunner.prototype as any,
        "runAgentLoop",
      ).mockResolvedValue(undefined);

      const continued = await runner.continueSessionExecution({
        sessionId: parentSessionId,
        continuationPrompt: "Continue orchestrating",
        stage: "VERIFY",
      });

      // Role MUST be inherited from parent — orchestrator stays orchestrator
      expect(continued.role).toBe("orchestrator");
    });

    test("role validation: rejects invalid role on parent session", async () => {
      insertTestTask(1);

      // Manually insert a session with an invalid role in the database
      const db = new Database(testDbPath);
      const now = new Date().toISOString();
      const badSessionId = "bad-role-session";
      db.prepare(
        `INSERT INTO agent_sessions (id, task_id, sprint_id, role, status, started_at, last_activity_at, iteration, max_iterations)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        badSessionId,
        1,
        "sprint-001",
        "invalid_role",
        "completed",
        now,
        now,
        0,
        50,
      );
      db.close();

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });

      vi.spyOn(
        AgentRunner.prototype as any,
        "runAgentLoop",
      ).mockResolvedValue(undefined);

      await expect(
        runner.continueSessionExecution({
          sessionId: badSessionId,
          continuationPrompt: "Should fail",
          stage: "IMPLEMENT_FIX",
        }),
      ).rejects.toThrow(/role/i);
    });

    test("rejects when agent is already running", async () => {
      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });

      // Set a mock session with running status
      (runner as any).session = { status: "running" };

      await expect(
        runner.continueSessionExecution({
          sessionId: "any-session",
          continuationPrompt: "Continue",
          stage: "IMPLEMENT_FIX",
        }),
      ).rejects.toThrow("Agent is already running");
    });

    test("rejects with SessionError for non-existent parent session", async () => {
      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });

      vi.spyOn(
        AgentRunner.prototype as any,
        "runAgentLoop",
      ).mockResolvedValue(undefined);

      await expect(
        runner.continueSessionExecution({
          sessionId: "non-existent-session-id",
          continuationPrompt: "Fix the bug",
          stage: "IMPLEMENT_FIX",
        }),
      ).rejects.toThrow("Parent session not found");
    });

    test("message loading from parent: child gets parent messages + continuation prompt", async () => {
      insertTestTask(1);
      const parentSessionId = createParentSessionWithMessages(1);

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });

      vi.spyOn(
        AgentRunner.prototype as any,
        "runAgentLoop",
      ).mockResolvedValue(undefined);

      const continued = await runner.continueSessionExecution({
        sessionId: parentSessionId,
        continuationPrompt: "Please retry with different approach",
        stage: "IMPLEMENT_FIX",
      });

      // First two messages from parent
      expect(continued.messages[0]?.content).toBe(
        "Please implement feature X",
      );
      expect(continued.messages[1]?.content).toBe(
        "I will implement feature X now.",
      );

      // Third message is the continuation prompt
      const lastMsg = continued.messages[continued.messages.length - 1];
      expect(lastMsg).toBeDefined();
      expect(lastMsg!.role).toBe("user");
      expect(lastMsg!.content).toBe(
        "Please retry with different approach",
      );
    });

    test("tool call reconstruction from parent session events", async () => {
      insertTestTask(1);
      const parentSessionId = createParentSessionWithMessages(1);

      // Insert tool_result event for the parent session
      insertEvent(testWorkspaceRoot, {
        id: crypto.randomUUID(),
        sessionId: parentSessionId,
        timestamp: new Date().toISOString(),
        iteration: 2,
        type: "tool_result",
        toolCallId: "parent-tool-call-1",
        toolName: "read_file",
        success: true,
        output: "file contents here",
        error: undefined,
        durationMs: 100,
      } as any);

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });

      vi.spyOn(
        AgentRunner.prototype as any,
        "runAgentLoop",
      ).mockResolvedValue(undefined);

      const continued = await runner.continueSessionExecution({
        sessionId: parentSessionId,
        continuationPrompt: "Fix the tests",
        stage: "IMPLEMENT_FIX",
      });

      // Tool calls reconstructed from parent
      expect(continued.toolCalls.length).toBeGreaterThan(0);
      expect(
        continued.toolCalls.some((t) => t.id === "parent-tool-call-1"),
      ).toBe(true);
      expect(
        continued.toolCalls.some((t) => t.name === "read_file"),
      ).toBe(true);
    });

    test("file change reconstruction from parent session events", async () => {
      insertTestTask(1);
      const parentSessionId = createParentSessionWithMessages(1);

      // Insert file op event for the parent session
      insertEvent(testWorkspaceRoot, {
        id: crypto.randomUUID(),
        sessionId: parentSessionId,
        timestamp: new Date().toISOString(),
        iteration: 3,
        type: "tool_file_operation",
        toolCallId: "parent-tool-2",
        toolName: "create_file",
        operation: { operation: "create", path: "src/new-feature.ts" },
      } as any);

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });

      vi.spyOn(
        AgentRunner.prototype as any,
        "runAgentLoop",
      ).mockResolvedValue(undefined);

      const continued = await runner.continueSessionExecution({
        sessionId: parentSessionId,
        continuationPrompt: "Fix the tests",
        stage: "IMPLEMENT_FIX",
      });

      // File changes reconstructed from parent
      expect(continued.fileChanges.length).toBeGreaterThan(0);
      expect(
        continued.fileChanges.some(
          (f) =>
            f.relativePath === "src/new-feature.ts" ||
            f.uri === "src/new-feature.ts",
        ),
      ).toBe(true);
    });

    test("agent loop is started after session setup", async () => {
      insertTestTask(1);
      const parentSessionId = createParentSessionWithMessages(1);

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });

      const runAgentLoopSpy = vi
        .spyOn(AgentRunner.prototype as any, "runAgentLoop")
        .mockResolvedValue(undefined);

      await runner.continueSessionExecution({
        sessionId: parentSessionId,
        continuationPrompt: "Continue",
        stage: "IMPLEMENT_FIX",
      });

      // Agent loop was invoked exactly once
      expect(runAgentLoopSpy).toHaveBeenCalledOnce();
    });

    test("respects optional maxIterations override", async () => {
      insertTestTask(1);
      const parentSessionId = createParentSessionWithMessages(1);

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });

      vi.spyOn(
        AgentRunner.prototype as any,
        "runAgentLoop",
      ).mockResolvedValue(undefined);

      const continued = await runner.continueSessionExecution({
        sessionId: parentSessionId,
        continuationPrompt: "Quick retry",
        stage: "IMPLEMENT_FIX",
        maxIterations: 20,
      });

      expect(continued.maxIterations).toBe(20);
    });

    test("creates ContextManager after message reconstruction", async () => {
      insertTestTask(1);
      const parentSessionId = createParentSessionWithMessages(1);

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });

      vi.spyOn(
        AgentRunner.prototype as any,
        "runAgentLoop",
      ).mockResolvedValue(undefined);

      await runner.continueSessionExecution({
        sessionId: parentSessionId,
        continuationPrompt: "Continue",
        stage: "IMPLEMENT_FIX",
      });

      // ContextManager should exist
      expect((runner as any).contextManager).toBeDefined();
      const cm = (runner as any).contextManager;
      expect(typeof cm.estimateTokens === "function").toBe(true);
    });

    test("uses sessionRepository.continueSession() — parent is marked as continued", async () => {
      insertTestTask(1);
      const parentSessionId = createParentSessionWithMessages(1);

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });

      vi.spyOn(
        AgentRunner.prototype as any,
        "runAgentLoop",
      ).mockResolvedValue(undefined);

      await runner.continueSessionExecution({
        sessionId: parentSessionId,
        continuationPrompt: "Fix issue Y",
        stage: "IMPLEMENT_FIX",
      });

      // Verify parent was marked as continued (done by sessionRepository.continueSession)
      const parentInDb = getSession(testWorkspaceRoot, parentSessionId);
      expect(parentInDb).toBeDefined();
      expect(parentInDb!.isContinued).toBe(true);
      expect(parentInDb!.continuationCount).toBe(1);

      // Verify child session exists with correct parentSessionId
      const taskSessions = getSessionsForTask(testWorkspaceRoot, 1);
      const childInDb = taskSessions.find(
        (s) => s.parentSessionId === parentSessionId,
      );
      expect(childInDb).toBeDefined();
      expect(childInDb!.stage).toBe("IMPLEMENT_FIX");
    });
  });
}
