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
    commands: {
        executeCommand: vi.fn(),
    },
    lm: {
        selectChatModels: vi.fn().mockResolvedValue([{ id: "test-model", family: "test" }]),
    },
    // Mock LanguageModel classes
    LanguageModelChatMessage: {
      User: (content: any) => ({ role: 1, content }),
      Assistant: (content: any) => ({ role: 2, content }),
    },
    LanguageModelChatMessageRole: { User: 1, Assistant: 2 },
    LanguageModelTextPart: class { constructor(public value: string) {} },
    LanguageModelToolCallPart: class { constructor(public callId: string, public name: string, public input: any) {} },
    LanguageModelToolResultPart: class { constructor(public callId: string, public content: any) {} },
    LanguageModelDataPart: class { constructor(public value: any, public mimeType: string) {} },
  };
});

// Native binary check
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
  describe.skip("continueSessionExecution Integration (skipped: native module incompatible)", () => {
    it("skipped due to native module incompatibility", () => {});
  });
} else {
  // Imports
  const { AgentRunner } = await import("../../src/agents/AgentRunner.js");
  const { ToolRegistry } = await import("../../src/agents/ToolRegistry.js");
  const { insertMessage } = await import("../../src/agents/sessions/sessionMessageRepository.js");
  const { insertEvent } = await import("../../src/agents/sessions/eventRepository.js");
  const { getSession, continueSession } = await import("../../src/agents/sessions/sessionRepository.js");
  const { OrchestraDB } = await import("../../../src/database/client.ts");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");  const { AgentError, SessionError } = await import("../../src/agents/errors.js");
  
  // Helpers
  let testWorkspaceRoot: string;
  let testDbPath: string;
  let db: any;

  function createTestDatabase(dbPath: string): void {
      const initDb = new Database(dbPath);
      initDb.pragma("foreign_keys = ON");
      // ... same schema creation ...
      // I will copy schema creation from my previous input or just use getDb().
      // Actually better-sqlite3 instance returned by getDb will be used.
      // But we need to CREATE tables first.
      
      // ... Schema execution ... 
      // I'll trust my previous schema was correct, just need to re-apply it.
      initDb.exec(`
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

    initDb.exec(`
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

    initDb.exec(`
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

    initDb.exec(`
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

    initDb.exec(`CREATE INDEX IF NOT EXISTS idx_messages_session ON session_messages(session_id);`);
    initDb.exec(`CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);`);
      initDb.close();
  }
  
  // ... insert helpers ...
  function insertTestTask(taskId: number): void {
      const db = new Database(testDbPath);
      // ...
      const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, sprint_id, phase_id, task_id, title, description, category, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(taskId, "sprint-001", 1, taskId, `Task ${taskId}`, "Desc", "implementation", "PENDING", now, now);
      db.close();
  }
  
   function insertTestSession(sessionId: string, taskId: number, role = "implementor", status = "paused", iteration = 0, maxIterations = 50): void {
    const db = new Database(testDbPath);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO agent_sessions (id, task_id, sprint_id, role, status, started_at, last_activity_at, iteration, max_iterations, parent_session_id, attempt, stage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(sessionId, taskId, "sprint-001", role, status, now, now, iteration, maxIterations, null, 0, null);
    db.close();
  }

  beforeEach(async () => {
    testWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-continue-test-"));
    const orchestraDir = path.join(testWorkspaceRoot, ".orchestra");
    fs.mkdirSync(orchestraDir, { recursive: true });
    testDbPath = path.join(orchestraDir, "orchestra.db");
    
    // Set env var so getDb() picks it up?
    // src/db/connection.ts usually uses process.env.ORCHESTRA_DB_PATH or similar?
    // Or it uses findOrchestraRoot.
    // I need to mock getDb to return a connection to MY test db.
    
    // Create schema
    createTestDatabase(testDbPath);

    // Mock getDb in src/db/index.js
    // Since we import getDb, we can't easily mock it unless we mock the module.
    // Vitest vi.mock("../../src/db/index.js") ?
    
    // BUT BETTER: I will overwrite `process.cwd()` or mock `findOrchestraRoot` if I can?
    // No, `getDb` is a singleton.
    
    // Let's use `vi.doMock` for the module import?
    // Since I'm using dynamic import, I can mock before import.
  });


  afterEach(() => {
    OrchestraDB.close();
    fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const describeRunner = moduleCompatible ? describe : describe.skip;
  
  describeRunner("continueSessionExecution", () => {
    test("should continue a session creating a new child session", async () => {
      insertTestTask(1);
      const parentSessionId = "parent-session-1";
      insertTestSession(parentSessionId, 1, "implementor", "paused", 5, 50);

      // Insert parent messages
      insertMessage(testWorkspaceRoot, {
        session_id: parentSessionId,
        role: "user",
        content: "Original instruction",
        iteration: 0,
      });

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });
      
      // Spy on runAgentLoop to prevent execution
      const runAgentSpy = vi.spyOn(AgentRunner.prototype as any, "runAgentLoop").mockResolvedValue(undefined);

      const options = {
        sessionId: parentSessionId,
        continuationPrompt: "Continue with fix",
        stage: "implementation" as const,
        maxIterations: 100
      };

      const childSession = await runner.continueSessionExecution(options);

      // Verify child session properties
      expect(childSession.id).not.toBe(parentSessionId);
      expect(childSession.parentSessionId).toBe(parentSessionId);
      expect(childSession.stage).toBe("implementation");
      expect(childSession.currentIteration).toBe(0);
      expect(childSession.maxIterations).toBe(100);
      expect(childSession.role).toBe("implementor"); // Inherited

      // Verify DB state
      const dbChild = getSession(testWorkspaceRoot, childSession.id);
      expect(dbChild).toBeDefined();
      expect(dbChild?.parentSessionId).toBe(parentSessionId);
      expect(dbChild?.stage).toBe("implementation");
      
      const dbParent = getSession(testWorkspaceRoot, parentSessionId);
      expect(dbParent?.isContinued).toBe(true);
      expect(dbParent?.continuationCount).toBe(1);

      // Verify messages: Parent messages + continuation prompt
      expect(childSession.messages.length).toBeGreaterThan(1);
      expect(childSession.messages[0].content).toContain("Original instruction");
      const lastMsg = childSession.messages[childSession.messages.length - 1];
      expect(lastMsg.role).toBe("user");
      expect(lastMsg.content).toBe("Continue with fix");

      // Verify start called
      expect(runAgentSpy).toHaveBeenCalled();
    });

    test("should inherit role from parent", async () => {
      insertTestTask(1);
      const parentSessionId = "orchestrator-session";
      insertTestSession(parentSessionId, 1, "orchestrator", "paused", 1, 10);

      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });
      vi.spyOn(AgentRunner.prototype as any, "runAgentLoop").mockResolvedValue(undefined);

      const options = {
        sessionId: parentSessionId,
        continuationPrompt: "Proceed",
        stage: "planning" as const
      };

      const childSession = await runner.continueSessionExecution(options);

      expect(childSession.role).toBe("orchestrator");
    });

    test("should throw if parent session not found", async () => {
      const registry = new ToolRegistry();
      const runner = new AgentRunner(registry, { skipToolLoading: true });

      const options = {
        sessionId: "non-existent",
        continuationPrompt: "Continue",
        stage: "implementation" as const
      };

      await expect(runner.continueSessionExecution(options)).rejects.toThrowError(SessionError);
    });

    test("should throw if agent is already running", async () => {
        const registry = new ToolRegistry();
        const runner = new AgentRunner(registry, { skipToolLoading: true });
        
        // Mock session state as running. Session is private so catch 22.
        // We can just rely on setting private prop via cast
        (runner as any).session = { status: "running" };
  
        const options = {
          sessionId: "any",
          continuationPrompt: "Continue",
          stage: "implementation" as const
        };
  
        await expect(runner.continueSessionExecution(options)).rejects.toThrowError(AgentError);
    });

    test("should reconstruct tool calls from PARENT session", async () => {
        insertTestTask(1);
        const parentSessionId = "parent-tools";
        insertTestSession(parentSessionId, 1, "implementor", "paused", 2, 50);
  
        // Insert tool result in PARENT session
        const toolResultEvent = {
          id: crypto.randomUUID(),
          sessionId: parentSessionId,
          timestamp: new Date().toISOString(),
          iteration: 1,
          type: "tool_result",
          toolCallId: "parent-tool-1",
          toolName: "read_file",
          success: true,
          output: "content",
          durationMs: 100,
        } as any;
        insertEvent(testWorkspaceRoot, toolResultEvent);
  
        const registry = new ToolRegistry();
        const runner = new AgentRunner(registry, { skipToolLoading: true });
        vi.spyOn(AgentRunner.prototype as any, "runAgentLoop").mockResolvedValue(undefined);
  
        const childSession = await runner.continueSessionExecution({
            sessionId: parentSessionId,
            continuationPrompt: "Next",
            stage: "implementation" as const
        });
  
        // Child session should have loaded tools from parent
        expect(childSession.toolCalls.length).toBe(1);
        expect(childSession.toolCalls[0].id).toBe("parent-tool-1");
    });

    test("should reconstruct file changes from PARENT session", async () => {
        insertTestTask(1);
        const parentSessionId = "parent-files";
        insertTestSession(parentSessionId, 1, "implementor", "paused", 2, 50);
  
        // Insert file op in PARENT session
        const fileOpEvent = {
          id: crypto.randomUUID(),
          sessionId: parentSessionId,
          timestamp: new Date().toISOString(),
          iteration: 1,
          type: "tool_file_operation",
          toolCallId: "parent-tool-1",
          toolName: "create_file",
          operation: { operation: "create", path: "test.txt" },
        } as any;
        insertEvent(testWorkspaceRoot, fileOpEvent);
  
        const registry = new ToolRegistry();
        const runner = new AgentRunner(registry, { skipToolLoading: true });
        vi.spyOn(AgentRunner.prototype as any, "runAgentLoop").mockResolvedValue(undefined);
  
        const childSession = await runner.continueSessionExecution({
            sessionId: parentSessionId,
            continuationPrompt: "Next",
            stage: "implementation" as const
        });
  
        // Child session should have loaded file changes from parent
        expect(childSession.fileChanges.length).toBe(1);
        expect(childSession.fileChanges[0].relativePath).toBe("test.txt");
    });
  });
}
