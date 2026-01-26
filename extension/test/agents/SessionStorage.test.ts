/**
 * Unit tests for SessionStorage
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AgentSession } from "../../src/agents/AgentSession.js";
import { SessionError } from "../../src/agents/errors.js";
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

    const acquireSpy = vi.spyOn(storage, "acquireLock");
    const releaseSpy = vi.spyOn(storage, "releaseLock");
    const loaded = await storage.load(session.id);

    expect(acquireSpy).toHaveBeenCalledWith(session.id);
    expect(releaseSpy).toHaveBeenCalledWith(session.id);

    expect(loaded.id).toBe(session.id);
    expect(loaded.role).toBe("implementor");
    expect(loaded.taskId).toBe(7);
    expect(loaded.sprintId).toBe("sprint-002");

    acquireSpy.mockRestore();
    releaseSpy.mockRestore();
  });

  test("load() restores messages and file changes", async () => {
    const session = new AgentSession("implementor", "sprint-restore", 21);
    session.messages.push({
      id: crypto.randomUUID(),
      role: "user",
      content: "Hello",
      timestamp: new Date().toISOString(),
      iteration: 0,
    });
    session.fileChanges.push({
      id: crypto.randomUUID(),
      uri: "file:///tmp/demo.txt",
      relativePath: "demo.txt",
      operation: "modify",
      previousContent: "before",
      previousContentHash: "hash-before",
      newContent: "after",
      newContentHash: "hash-after",
      toolCallId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      iteration: 0,
      undone: false,
      undoneAt: null,
    });

    await storage.save(session);
    const restored = await storage.load(session.id);

    expect(restored.messages.length).toBe(1);
    expect(restored.messages[0]?.content).toBe("Hello");
    expect(restored.fileChanges.length).toBe(1);
    expect(restored.fileChanges[0]?.relativePath).toBe("demo.txt");
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

  test("loadWithFallback() restores session from latest checkpoint when session file is corrupted", async () => {
    const session = new AgentSession("orchestrator", "sprint-fallback", 3);
    session.messages.push({
      id: crypto.randomUUID(),
      role: "user",
      content: "First",
      timestamp: new Date().toISOString(),
      iteration: 0,
    });
    session.currentIteration = 1;
    await storage.save(session);
    await storage.createCheckpoint(session);

    session.messages.push({
      id: crypto.randomUUID(),
      role: "assistant",
      content: "Second",
      timestamp: new Date().toISOString(),
      iteration: 1,
    });
    session.currentIteration = 2;
    await storage.createCheckpoint(session);

    const sessionPath = storage.getSessionPath(session.id);
    await fs.promises.writeFile(sessionPath, "{not-json", "utf-8");

    const restored = await storage.loadWithFallback(session.id);

    expect(restored.messages.length).toBe(2);
    expect(restored.currentIteration).toBe(2);
    expect(restored.recoveryInfo.failureReason).toMatch(/corrupted/i);
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

  test("getRecoverableSessions() filters paused, stopped, and running sessions", async () => {
    const runningSession = new AgentSession("orchestrator", "sprint-009");
    const pausedSession = new AgentSession("implementor", "sprint-010", 12);
    const stoppedSession = new AgentSession("orchestrator", "sprint-011");
    const completedSession = new AgentSession("implementor", "sprint-012", 3);

    pausedSession.status = "paused";
    stoppedSession.status = "stopped";
    completedSession.status = "completed";

    await storage.save(runningSession);
    await storage.save(pausedSession);
    await storage.save(stoppedSession);
    await storage.save(completedSession);

    const recoverable = await storage.getRecoverableSessions();
    const recoverableIds = recoverable.map((session) => session.id);

    expect(recoverableIds).toContain(runningSession.id);
    expect(recoverableIds).toContain(pausedSession.id);
    expect(recoverableIds).toContain(stoppedSession.id);
    expect(recoverableIds).not.toContain(completedSession.id);
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

  test("acquireLock() creates lock file and releaseLock() removes it", async () => {
    const session = new AgentSession("orchestrator", "sprint-005");
    const lockPath = storage.getLockPath(session.id);

    await storage.acquireLock(session.id);

    expect(fs.existsSync(lockPath)).toBe(true);
    const lockData = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    expect(lockData.pid).toBe(process.pid);
    expect(lockData.hostname).toBe(os.hostname());
    expect(typeof lockData.acquiredAt).toBe("string");

    await storage.releaseLock(session.id);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  test("acquireLock() throws SessionError when lock is held", async () => {
    const session = new AgentSession("implementor", "sprint-006");

    await storage.acquireLock(session.id);

    await expect(storage.acquireLock(session.id)).rejects.toEqual(
      expect.objectContaining({
        name: "SessionError",
        code: "LOCK_HELD",
      }),
    );

    await storage.releaseLock(session.id);
  });

  test("acquireLock() reclaims stale lock files", async () => {
    const session = new AgentSession("orchestrator", "sprint-007");
    const lockPath = storage.getLockPath(session.id);
    const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    await fs.promises.mkdir(storage.getSessionDir(), { recursive: true });
    await fs.promises.writeFile(
      lockPath,
      JSON.stringify(
        { pid: 9999, hostname: "stale-host", acquiredAt: staleTime },
        null,
        2,
      ),
      "utf-8",
    );

    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    await storage.acquireLock(session.id);

    expect(warnSpy).toHaveBeenCalled();
    const lockData = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
    expect(lockData.pid).toBe(process.pid);
    expect(lockData.hostname).toBe(os.hostname());
    expect(Date.parse(lockData.acquiredAt)).toBeGreaterThan(
      Date.parse(staleTime),
    );

    await storage.releaseLock(session.id);
    warnSpy.mockRestore();
  });

  test("save() releases lock when write fails", async () => {
    const session = new AgentSession("orchestrator", "sprint-008");
    const lockPath = storage.getLockPath(session.id);
    const originalWriteFile = fs.promises.writeFile;

    const writeSpy = vi
      .spyOn(fs.promises, "writeFile")
      .mockImplementation(async (filePath, data, options) => {
        if (String(filePath).includes(".tmp.")) {
          throw new Error("disk failure");
        }
        return originalWriteFile(filePath, data, options as string | undefined);
      });

    await expect(storage.save(session)).rejects.toBeInstanceOf(SessionError);
    expect(fs.existsSync(lockPath)).toBe(false);

    writeSpy.mockRestore();
  });

  test("cleanupExpiredSessions() deletes old completed and failed sessions only", async () => {
    const completedOld = new AgentSession("orchestrator", "sprint-clean-1");
    const failedOld = new AgentSession("implementor", "sprint-clean-2", 9);
    const completedRecent = new AgentSession("orchestrator", "sprint-clean-3");
    const runningOld = new AgentSession("implementor", "sprint-clean-4", 4);

    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();

    completedOld.status = "completed";
    completedOld.updatedAt = oldDate;
    completedOld.lastActivityAt = oldDate;

    failedOld.status = "failed";
    failedOld.updatedAt = oldDate;
    failedOld.lastActivityAt = oldDate;

    completedRecent.status = "completed";

    runningOld.status = "running";
    runningOld.updatedAt = oldDate;
    runningOld.lastActivityAt = oldDate;

    await storage.save(completedOld);
    await storage.save(failedOld);
    await storage.save(completedRecent);
    await storage.save(runningOld);

    const deletedCount = await storage.cleanupExpiredSessions();
    expect(deletedCount).toBe(2);

    expect(fs.existsSync(storage.getSessionPath(completedOld.id))).toBe(false);
    expect(fs.existsSync(storage.getSessionPath(failedOld.id))).toBe(false);
    expect(fs.existsSync(storage.getSessionPath(completedRecent.id))).toBe(true);
    expect(fs.existsSync(storage.getSessionPath(runningOld.id))).toBe(true);
  });
});
