import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi, test } from "vitest";

// Mock VS Code API
vi.mock("vscode", () => {
  return {
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
  describe.skip("Session Continuation Integration (skipped: native module incompatible)", () => {
    it("skipped due to native module incompatibility", () => {});
  });
} else {
  // Import repository functions
  const { 
    continueSession, 
    markSessionAsContinued, 
    getSessionChain, 
    getLatestImplementorSession,
    MAX_CONTINUATION_DEPTH,
    createSession,
    getSession
  } = await import("../../../src/agents/sessions/sessionRepository.js");
  
  const { insertMessage, getSessionMessages } = await import(
    "../../../src/agents/sessions/sessionMessageRepository.js"
  );
  
  const { OrchestraDB } = await import("../../../src/database/client.js");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { eq, and } = await import("drizzle-orm");
  const schema = await import("../../../src/database/local-schema.js");

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
        completed_at TEXT
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

    db.close();
  }

  function insertTestTask(taskId: number): void {
    const db = new Database(testDbPath);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO tasks (id, sprint_id, phase_id, task_id, title, description, category, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(taskId, "sprint-001", 1, taskId, `Task ${taskId}`, "Desc", "implementation", "PENDING", now, now);
    db.close();
  }

  beforeEach(async () => {
    testWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-continuation-test-"));
    const orchestraDir = path.join(testWorkspaceRoot, ".orchestra");
    fs.mkdirSync(orchestraDir, { recursive: true });
    testDbPath = path.join(orchestraDir, "orchestra.db");
    createTestDatabase(testDbPath);

    const liveDb = new Database(testDbPath);
    const drizzleInstance = drizzle(liveDb);

    // Spy on OrchestraDB static methods
    vi.spyOn(OrchestraDB, "getDrizzleInstance").mockReturnValue(drizzleInstance as any);
    vi.spyOn(OrchestraDB, "getInstance").mockReturnValue(liveDb);
    vi.spyOn(OrchestraDB, "close").mockImplementation(() => {
      try {
        if (liveDb.open) liveDb.close();
      } catch (e) {
        // ignore
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
        fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
    } catch {}
  });

  describe("Session Continuation", () => {
    test("getLatestImplementorSession should find most recent session for task", () => {
      insertTestTask(1);
      
      // Create 3 sessions with different timestamps
      const s1 = createSession(testWorkspaceRoot, {
        taskId: 1,
        sprintId: "sprint-001",
        role: "implementor",
        status: "completed",
        startedAt: new Date(Date.now() - 10000).toISOString(),
        lastActivityAt: new Date().toISOString(),
        iteration: 0,
        maxIterations: 10,
        toolCallCount: 0,
        successfulToolCalls: 0,
        failedToolCalls: 0,
        warningCount: 0
      });

      const s2 = createSession(testWorkspaceRoot, {
        taskId: 1,
        sprintId: "sprint-001",
        role: "implementor",
        status: "completed",
        startedAt: new Date(Date.now() - 5000).toISOString(),
        lastActivityAt: new Date().toISOString(),
        iteration: 0,
        maxIterations: 10,
        toolCallCount: 0,
        successfulToolCalls: 0,
        failedToolCalls: 0,
        warningCount: 0
      });

      // s3 is orchestrator - should be ignored
      createSession(testWorkspaceRoot, {
        taskId: 1,
        sprintId: "sprint-001",
        role: "orchestrator",
        status: "completed",
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        iteration: 0,
        maxIterations: 10,
        toolCallCount: 0,
        successfulToolCalls: 0,
        failedToolCalls: 0,
        warningCount: 0
      });

      const latest = getLatestImplementorSession(testWorkspaceRoot, 1);
      expect(latest).toBeDefined();
      expect(latest?.sessionId).toBe(s2.sessionId);
    });

    test("continueSession creates linked child session with correct properties", () => {
      insertTestTask(1);
      
      // Parent session
      const parent = createSession(testWorkspaceRoot, {
        taskId: 1,
        sprintId: "sprint-001",
        role: "implementor",
        status: "failed", // verification failed
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        iteration: 5,
        maxIterations: 10,
        stage: "IMPLEMENT",
        attempt: 1,
        toolCallCount: 0,
        successfulToolCalls: 0,
        failedToolCalls: 0,
        warningCount: 0
      });

      // Continue it
      const prompt = "Please fix issue X";
      const child = continueSession(testWorkspaceRoot, parent.sessionId, prompt, "IMPLEMENT_FIX");

      expect(child.sessionId).not.toBe(parent.sessionId);
      expect(child.parentSessionId).toBe(parent.sessionId);
      expect(child.attempt).toBe(parent.attempt! + 1);
      expect(child.stage).toBe("IMPLEMENT_FIX");
      expect(child.status).toBe("initializing"); // Should start fresh
      expect(child.iteration).toBe(0); // Iteration reset
    });

    test("continueSession copies messages and appends continuation prompt", () => {
        insertTestTask(1);
        const parent = createSession(testWorkspaceRoot, {
          taskId: 1,
          sprintId: "sprint-001",
          role: "implementor",
          status: "failed",
          startedAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
          iteration: 1,
          maxIterations: 10,
          toolCallCount: 0,
          successfulToolCalls: 0,
          failedToolCalls: 0,
          warningCount: 0
        });
  
        // Add parent messages
        insertMessage(testWorkspaceRoot, {
          session_id: parent.sessionId,
          role: "user",
          content: "Do task",
          iteration: 0
        });
        insertMessage(testWorkspaceRoot, {
            session_id: parent.sessionId,
            role: "assistant", 
            content: "OK",
            iteration: 0
        });

        const prompt = "Fix this error";
        const child = continueSession(testWorkspaceRoot, parent.sessionId, prompt, "IMPLEMENT_FIX");

        const childMessages = getSessionMessages(testWorkspaceRoot, child.sessionId);
        expect(childMessages.length).toBe(3); // 2 parent + 1 new
        expect(childMessages[0].content).toBe("Do task");
        expect(childMessages[1].content).toBe("OK");
        expect(childMessages[2].role).toBe("user");
        expect(childMessages[2].content).toBe(prompt);
    });

    test("markSessionAsContinued updates parent session metadata", () => {
        insertTestTask(1);
        const parent = createSession(testWorkspaceRoot, {
            taskId: 1,
            sprintId: "sprint-001",
            role: "implementor",
            status: "failed",
            startedAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
            iteration: 1,
            maxIterations: 10,
            toolCallCount: 0,
            successfulToolCalls: 0,
            failedToolCalls: 0,
            warningCount: 0
        });

        markSessionAsContinued(testWorkspaceRoot, parent.sessionId);

        const updated = getSession(testWorkspaceRoot, parent.sessionId);
        expect(updated?.isContinued).toBe(true);
        expect(updated?.continuationCount).toBe(1);
        expect(updated?.continuedAt).toBeDefined();
    });

    test("getSessionChain uses recursive CTE to return full lineage", () => {
        insertTestTask(1);
        // Create chain: s1 -> s2 -> s3
        const s1 = createSession(testWorkspaceRoot, {
            taskId: 1, 
            sprintId: "sprint-001",
            role: "implementor",
            status: "failed",
            startedAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
            iteration: 0,
            maxIterations: 10,
            toolCallCount: 0, successfulToolCalls: 0, failedToolCalls: 0, warningCount: 0
        });

        const s2 = continueSession(testWorkspaceRoot, s1.sessionId, "c1", "IMPLEMENT_FIX");
        const s3 = continueSession(testWorkspaceRoot, s2.sessionId, "c2", "IMPLEMENT_FIX");

        const chain = getSessionChain(testWorkspaceRoot, s1.sessionId);
        expect(chain.length).toBe(3);
        expect(chain[0].sessionId).toBe(s1.sessionId);
        expect(chain[1].sessionId).toBe(s2.sessionId);
        expect(chain[2].sessionId).toBe(s3.sessionId);
        
        // Also check retrieving from middle
        const chainFromS2 = getSessionChain(testWorkspaceRoot, s2.sessionId);
        // NOTE: Function spec says "traverses downward", usually from a given root.
        // If the function finds children, it should find s2->s3.
        expect(chainFromS2.length).toBe(2);
        expect(chainFromS2[0].sessionId).toBe(s2.sessionId);
        expect(chainFromS2[1].sessionId).toBe(s3.sessionId);
    });

    test("MAX_CONTINUATION_DEPTH validation prevents infinite chains", () => {
        insertTestTask(1);
        let currentId = createSession(testWorkspaceRoot, {
            taskId: 1, 
            sprintId: "sprint-001",
            role: "implementor",
            status: "failed",
            startedAt: new Date().toISOString(),
            lastActivityAt: new Date().toISOString(),
            iteration: 0,
            maxIterations: 10,
            toolCallCount: 0, successfulToolCalls: 0, failedToolCalls: 0, warningCount: 0
        }).sessionId;

        // Create 4 more levels (total depth 5)
        for (let i = 0; i < 4; i++) {
           currentId = continueSession(testWorkspaceRoot, currentId, `cont ${i}`, "IMPLEMENT_FIX").sessionId;
        }

        // Try 6th level (should fail)
        expect(() => {
            continueSession(testWorkspaceRoot, currentId, "too deep", "IMPLEMENT_FIX");
        }).toThrow(/Maximum continuation depth/);
    });
  });
}
