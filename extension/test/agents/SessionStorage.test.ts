/**
 * Unit tests for SessionStorage
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentSession } from "../../src/agents/AgentSession.js";
import { SessionStorage } from "../../src/agents/SessionStorage.js";

describe("SessionStorage", () => {
  let tempDir: string;
  let storage: SessionStorage;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-session-"));
    storage = SessionStorage.getInstance(tempDir);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("save() writes session using atomic rename", async () => {
    const session = new AgentSession("orchestrator", "sprint-001");
    const sessionPath = storage.getSessionPath(session.id);

    const renameSpy = vi.spyOn(fs.promises, "rename");

    await storage.save(session);

    expect(fs.existsSync(sessionPath)).toBe(true);
    expect(renameSpy).toHaveBeenCalled();

    const [fromPath, toPath] = renameSpy.mock.calls[0] ?? [];
    expect(typeof fromPath).toBe("string");
    expect(typeof toPath).toBe("string");
    expect(String(fromPath)).toContain(".tmp.");
    expect(String(toPath)).toBe(sessionPath);

    renameSpy.mockRestore();
  });

  test("load() reads session from disk", async () => {
    const session = new AgentSession("implementor", "sprint-002", 7);
    await storage.save(session);

    const loaded = await storage.load(session.id);

    expect(loaded.id).toBe(session.id);
    expect(loaded.role).toBe("implementor");
    expect(loaded.taskId).toBe(7);
    expect(loaded.sprintId).toBe("sprint-002");
  });

  test("createCheckpoint() writes checkpoint content and returns reference", async () => {
    const session = new AgentSession("orchestrator", "sprint-003");
    session.currentIteration = 2;
    session.messages.push({
      id: crypto.randomUUID(),
      role: "user",
      content: "Test",
      timestamp: new Date().toISOString(),
      iteration: 2,
    });

    const reference = await storage.createCheckpoint(session);

    expect(reference.iteration).toBe(2);
    expect(reference.position).toBe("end");
    expect(fs.existsSync(reference.filePath)).toBe(true);
    expect(reference.fileSize).toBeGreaterThan(0);

    const content = JSON.parse(fs.readFileSync(reference.filePath, "utf-8"));
    expect(content.sessionId).toBe(session.id);
    expect(content.iteration).toBe(2);
    expect(content.position).toBe("end");
    expect(content.messageCount).toBe(1);
    expect(content.toolCallCount).toBe(0);
    expect(content.fileChangeCount).toBe(0);
    expect(content.timestamp).toBeDefined();
  });

  test("listSessions() returns metadata for saved sessions", async () => {
    const session1 = new AgentSession("orchestrator", "sprint-001");
    const session2 = new AgentSession("implementor", "sprint-002", 5);

    await storage.save(session1);
    await storage.save(session2);

    const sessions = await storage.listSessions();

    const ids = sessions.map((session) => session.id);
    expect(ids).toContain(session1.id);
    expect(ids).toContain(session2.id);
  });

  test("deleteSession() removes session and checkpoints", async () => {
    const session = new AgentSession("orchestrator", "sprint-004");
    session.currentIteration = 1;

    await storage.save(session);
    const reference = await storage.createCheckpoint(session);

    expect(fs.existsSync(storage.getSessionPath(session.id))).toBe(true);
    expect(fs.existsSync(reference.filePath)).toBe(true);

    await storage.deleteSession(session.id);

    expect(fs.existsSync(storage.getSessionPath(session.id))).toBe(false);
    expect(fs.existsSync(reference.filePath)).toBe(false);
  });
});
