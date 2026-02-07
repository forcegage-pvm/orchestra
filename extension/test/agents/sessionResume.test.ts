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
      token = { isCancellationRequested: false, onCancellationRequested: () => { return { dispose: () => {} } } };
      cancel() {}
      dispose() {}
    },
    workspace: {
      workspaceFolders: [],
      fs: {
        readFile: vi.fn(),
      },
      onDidSaveTextDocument: () => { return { dispose: () => {} } },
      onDidChangeTextDocument: () => { return { dispose: () => {} } },
    },
    Uri: {
      file: (path: string) => ({ fsPath: path }),
      parse: (path: string) => ({ fsPath: path }),
    },
    Range: class {},
    Position: class {},
    Diagnostic: class {},
    DiagnosticSeverity: { Error: 0 },
  };
});

// Native binary check (same pattern as other DB tests)
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
  describe.skip("Session Resume Integration (skipped: native module incompatible)", () => {
    it("skipped due to native module incompatibility", () => {});
  });
} else {
  const { AgentRunner } = await import("../../../src/agents/AgentRunner.js");
  const { ToolRegistry } = await import("../../../src/agents/ToolRegistry.js");
  const { AgentSession } = await import("../../../src/agents/AgentSession.js");
  const { insertMessage, getSessionMessages } = await import(
    "../../../src/agents/sessions/sessionMessageRepository.js",
  );
  const { insertEvent } = await import(
    "../../../src/agents/sessions/eventRepository.js",
  );
  const { insertEventBatch } = await import(
    "../../../src/agents/sessions/eventRepository.js",
  );
  const { getSession } = await import(
    "../../../src/agents/sessions/sessionRepository.js",
  );
  const { AgentError } = await import("../../../src/agents/errors.js");
  const { SessionError } = await import("../../../src/agents/errors.js");
  const { SessionEventEmitter } = await import(
    "../../../src/agents/sessions/eventEmitter.js",
  );
  const { SprintMemory } = await import(
    "../../../src/agents/memory/SprintMemory.js",
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

    db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_session ON session_messages(session_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);`);

    db.close();
  }

  function insertTestTask(taskId: number): void {
    const db = new Database(testDbPath);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, sprint_id, phase_id, task_id, title, description, category, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(taskId, "sprint-001", 1, taskId, `Task ${taskId}`, "Desc", "implementation", "PENDING", now, now);
    db.close();
  }

  function insertTestSession(sessionId: string, taskId: number, role = "implementor", status = "paused", iteration = 0, maxIterations = 50): void {
    const db = new Database(testDbPath);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO agent_sessions (id, task_id, sprint_id, role, status, started_at, last_activity_at, iteration, max_iterations)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(sessionId, taskId, "sprint-001", role, status, now, now, iteration, maxIterations);
    db.close();
  }

  beforeEach(async () => {
    testWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-resume-test-"));
    const orchestraDir = path.join(testWorkspaceRoot, ".orchestra");
    fs.mkdirSync(orchestraDir, { recursive: true });
    testDbPath = path.join(orchestraDir, "orchestra.db");
    createTestDatabase(testDbPath);

    // Mock OrchestraDB to use our compatible Database instance
    // This bypasses the native module mismatch error in src/database/client.ts
    const liveDb = new Database(testDbPath);
    const drizzleInstance = drizzle(liveDb);

    // Spy on OrchestraDB static methods to return our working instances
    // We cast to any to bypass 'readonly' or private protections if needed, 
    // though getDrizzleInstance is public static.
    vi.spyOn(OrchestraDB, "getDrizzleInstance").mockReturnValue(drizzleInstance);
    vi.spyOn(OrchestraDB, "getInstance").mockReturnValue(liveDb);
    vi.spyOn(OrchestraDB, "close").mockImplementation(() => {
      try {
        if (liveDb.open) liveDb.close();
      } catch (e) { console.error("Error closing mock DB", e); }
    });

    // Mock workspace folder resolution
    vi.mocked((await import("vscode"))!.workspace).workspaceFolders = [
      { uri: { fsPath: testWorkspaceRoot } } as any,
    ];
  });

  afterEach(() => {
    OrchestraDB.close();
    fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describeIfCompatible: (moduleCompatible ? describe : describe.skip)("Session Resume", () => {
    test("should reject completed and failed sessions with SESSION_NOT_RECOVERABLE", async () => {
      insertTestTask(1);
      insertTestSession("session-completed", 1, "implementor", "completed");
      insertTestSession("session-failed", 1, "implementor", "failed");

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });

      // Mock runAgentLoop to avoid background activity
      vi.spyOn(AgentRunner.prototype as any, "runAgentLoop").mockResolvedValue();

      await expect(runner.resumeSession("session-completed")).rejects.toThrowError(AgentError);
      await expect(runner.resumeSession("session-failed")).rejects.toThrowError(AgentError);
    });

    test("should reconstruct messages including compaction markers and tool calls and file changes", async () => {
      insertTestTask(1);
      const sessionId = "db-resume-1";
      insertTestSession(sessionId, 1, "implementor", "paused", 3, 50);

      // Insert messages via repository
      insertMessage(testWorkspaceRoot, {
        session_id: sessionId,
        role: "system",
        content: "<<COMPACTED: iterations 1-2, 2 messages summarized>>",
        iteration: 0,
      });

      insertMessage(testWorkspaceRoot, {
        session_id: sessionId,
        role: "user",
        content: "Please implement X",
        iteration: 1,
      });

      insertMessage(testWorkspaceRoot, {
        session_id: sessionId,
        role: "assistant",
        content: "I will do it",
        iteration: 1,
      });

      // Insert tool_result event
      const toolResultEvent = {
        id: crypto.randomUUID(),
        sessionId,
        timestamp: new Date().toISOString(),
        iteration: 2,
        type: "tool_result",
        toolCallId: "tool-1",
        toolName: "read_file",
        success: true,
        output: "file contents",
        error: undefined,
        durationMs: 150,
      } as any;

      insertEvent(testWorkspaceRoot, toolResultEvent);

      // Insert file op event
      const fileOpEvent = {
        id: crypto.randomUUID(),
        sessionId,
        timestamp: new Date().toISOString(),
        iteration: 2,
        type: "tool_file_operation",
        toolCallId: "tool-1",
        toolName: "read_file",
        operation: { operation: "create", path: "src/new.ts" },
      } as any;

      insertEvent(testWorkspaceRoot, fileOpEvent);

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });

      // Prevent agent loop from actually running
      vi.spyOn(AgentRunner.prototype as any, "runAgentLoop").mockResolvedValue();

      const resumed = await runner.resumeSession(sessionId);

      // Messages reconstructed
      expect(resumed.messages.some((m) => typeof m.content === "string" && (m.content as string).startsWith("<<COMPACTED:"))).toBe(true);
      expect(resumed.messages.some((m) => typeof m.content === "string" && (m.content as string).includes("Please implement X"))).toBe(true);

      // Tool calls reconstructed
      expect(resumed.toolCalls.length).toBeGreaterThan(0);
      expect(resumed.toolCalls.some((t) => t.id === "tool-1")).toBe(true);

      // File changes reconstructed
      expect(resumed.fileChanges.length).toBeGreaterThan(0);
      expect(resumed.fileChanges.some((f) => f.relativePath === "src/new.ts" || f.uri === "src/new.ts")).toBe(true);
    });

    test("should inject system resume message with exact text", async () => {
      insertTestTask(1);
      const sessionId = "db-resume-2";
      insertTestSession(sessionId, 1, "implementor", "paused", 1, 10);

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });
      vi.spyOn(AgentRunner.prototype as any, "runAgentLoop").mockResolvedValue();

      const resumed = await runner.resumeSession(sessionId);

      expect(resumed.messages.some((m) => m.role === "system" && typeof m.content === "string" && (m.content as string).includes("Session resumed after pause."))).toBe(true);
    });

    test("should reload sprint memory for orchestrator sessions", async () => {
      insertTestTask(1);
      const sessionId = "db-resume-orch";
      insertTestSession(sessionId, 1, "orchestrator", "paused", 0, 50);

      // Ensure memory file exists by calling getOrCreate
      const memoryStore = SprintMemory.getInstance(testWorkspaceRoot);
      await memoryStore.getOrCreate("sprint-001", "sprint-001");

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });
      vi.spyOn(AgentRunner.prototype as any, "runAgentLoop").mockResolvedValue();

      const resumed = await runner.resumeSession(sessionId);

      // Expect a user message containing sprint memory context
      expect(resumed.messages.some((m) => m.role === "user" && typeof m.content === "string" && (m.content as string).startsWith("[SPRINT MEMORY CONTEXT]"))).toBe(true);
    });

    test("should restore iteration counter and maxIterations from DB", async () => {
      insertTestTask(1);
      const sessionId = "db-resume-iter";
      insertTestSession(sessionId, 1, "implementor", "paused", 7, 10);

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });
      vi.spyOn(AgentRunner.prototype as any, "runAgentLoop").mockResolvedValue();

      const resumed = await runner.resumeSession(sessionId);

      expect(resumed.currentIteration).toBe(7);
      expect(resumed.maxIterations).toBe(10);

      // enforce limit: increment up to limit then expect error on next
      resumed.incrementIteration(); // 8
      resumed.incrementIteration(); // 9
      resumed.incrementIteration(); // 10
      expect(() => resumed.incrementIteration()).toThrowError();
    });

    test("should preserve compaction markers exactly", async () => {
      insertTestTask(1);
      const sessionId = "db-resume-compaction";
      insertTestSession(sessionId, 1, "implementor", "paused", 0, 50);

      const marker = "<<COMPACTED: iterations 1-5, 20 messages summarized>>";
      insertMessage(testWorkspaceRoot, {
        session_id: sessionId,
        role: "system",
        content: marker,
        iteration: 0,
      });

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });
      vi.spyOn(AgentRunner.prototype as any, "runAgentLoop").mockResolvedValue();

      const resumed = await runner.resumeSession(sessionId);

      expect(resumed.messages.some((m) => m.role === "system" && m.content === marker)).toBe(true);
    });

    test("should create ContextManager instance after message reconstruction", async () => {
      insertTestTask(1);
      const sessionId = "db-resume-context";
      insertTestSession(sessionId, 1, "implementor", "paused", 0, 50);

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });
      vi.spyOn(AgentRunner.prototype as any, "runAgentLoop").mockResolvedValue();

      await runner.resumeSession(sessionId);

      expect((runner as any).contextManager).toBeDefined();
      // ContextManager should be able to estimate tokens for messages array
      const cm = (runner as any).contextManager;
      expect(typeof cm.estimateTokens === "function").toBe(true);
    });

    test("reconstructSession() should complete for 100 messages in < 500ms", async () => {
      insertTestTask(1);
      const sessionId = "db-resume-perf";
      insertTestSession(sessionId, 1, "implementor", "paused", 0, 200);

      // Insert 100 messages
      for (let i = 0; i < 100; i++) {
        insertMessage(testWorkspaceRoot, {
          session_id: sessionId,
          role: i % 2 === 0 ? "user" : "assistant",
          content: `msg-${i}`,
          iteration: Math.floor(i / 2),
        });
      }

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });

      // Create an empty session object to attach messages onto
      runner['session'] = new AgentSession("implementor", "sprint-001", 1, 200);

      const start = Date.now();
      await (runner as any).reconstructSession(sessionId);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
      expect(runner.getSession()!.messages.length).toBe(100);
    });

    test("deprecated resumeFromStorage() still throws FEATURE_DEPRECATED", async () => {
      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });
      await expect(runner.resumeFromStorage("anything")).rejects.toThrowError(AgentError);
    });
  });
}
