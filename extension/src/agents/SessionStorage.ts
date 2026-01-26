/**
 * SessionStorage - File storage for agent sessions and checkpoints
 *
 * Manages workspace-scoped session persistence in .orchestra/sessions/.
 * Provides atomic writes, checkpointing, and session listing for recovery UI.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AgentSession } from "./AgentSession.js";
import { SessionError } from "./errors.js";
import {
  AgentSessionSchema,
  CheckpointContentSchema,
  CheckpointReference,
  SessionMetadata,
  SessionMetadataSchema,
} from "./types.js";

type AutoSaveOptions = {
  checkpoint?: boolean;
};

const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

export class SessionStorage {
  private static instance: SessionStorage | null = null;

  private workspaceRoot: string;

  private constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  static getInstance(workspaceRoot?: string): SessionStorage {
    if (!SessionStorage.instance) {
      SessionStorage.instance = new SessionStorage(
        workspaceRoot ?? process.cwd(),
      );
      return SessionStorage.instance;
    }

    if (
      workspaceRoot &&
      workspaceRoot !== SessionStorage.instance.workspaceRoot
    ) {
      SessionStorage.instance.workspaceRoot = workspaceRoot;
    }

    return SessionStorage.instance;
  }

  getSessionDir(): string {
    return path.join(this.workspaceRoot, ".orchestra", "sessions");
  }

  getCheckpointDir(): string {
    return path.join(this.getSessionDir(), "checkpoints");
  }

  getSessionPath(sessionId: string): string {
    return path.join(this.getSessionDir(), `session-${sessionId}.json`);
  }

  getLockPath(sessionId: string): string {
    return path.join(this.getSessionDir(), `session-${sessionId}.lock`);
  }

  async acquireLock(sessionId: string): Promise<void> {
    const lockPath = this.getLockPath(sessionId);

    try {
      await fs.promises.mkdir(this.getSessionDir(), { recursive: true });

      const handle = await fs.promises.open(
        lockPath,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
      );

      try {
        const lockInfo = {
          pid: process.pid,
          hostname: os.hostname(),
          acquiredAt: new Date().toISOString(),
        };
        await handle.writeFile(JSON.stringify(lockInfo, null, 2), "utf-8");
      } finally {
        await handle.close();
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "EEXIST") {
        await this.handleExistingLock(sessionId, lockPath);
        return;
      }

      throw new SessionError("Failed to acquire session lock", sessionId, {
        originalError: error instanceof Error ? error.message : String(error),
        lockPath,
      }, "LOCK_FAILED");
    }
  }

  private async handleExistingLock(
    sessionId: string,
    lockPath: string,
  ): Promise<void> {
    let lockInfo: { pid?: number; hostname?: string; acquiredAt?: string } = {};
    let isStale = false;

    try {
      const json = await fs.promises.readFile(lockPath, "utf-8");
      lockInfo = JSON.parse(json) as typeof lockInfo;

      const acquiredAt = lockInfo.acquiredAt
        ? Date.parse(lockInfo.acquiredAt)
        : NaN;
      if (Number.isNaN(acquiredAt)) {
        isStale = true;
      } else {
        const ageMs = Date.now() - acquiredAt;
        isStale = ageMs > LOCK_TIMEOUT_MS;
      }
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") {
        await this.acquireLock(sessionId);
        return;
      }

      isStale = true;
    }

    if (isStale) {
      console.warn(
        `Stale session lock detected for ${sessionId}. Reclaiming lock.`,
      );
      await fs.promises.rm(lockPath, { force: true });
      await this.acquireLock(sessionId);
      return;
    }

    throw new SessionError(
      "Session lock is held by another process",
      sessionId,
      {
        lockInfo,
        lockPath,
      },
      "LOCK_HELD",
    );
  }

  async releaseLock(sessionId: string): Promise<void> {
    const lockPath = this.getLockPath(sessionId);
    await fs.promises.rm(lockPath, { force: true });
  }

  async save(session: AgentSession): Promise<void> {
    const sessionPath = this.getSessionPath(session.id);
    const tempPath = `${sessionPath}.tmp.${Date.now()}`;
    let lockAcquired = false;
    let saveError: unknown;

    try {
      await this.acquireLock(session.id);
      lockAcquired = true;
      await fs.promises.mkdir(this.getSessionDir(), { recursive: true });

      const data = session.toJSON();
      const parseResult = AgentSessionSchema.safeParse(data);
      if (!parseResult.success) {
        throw new SessionError(
          "Session data validation failed before save",
          session.id,
          {
            errors: parseResult.error.errors,
          },
        );
      }

      const json = JSON.stringify(data, null, 2);
      await fs.promises.writeFile(tempPath, json, "utf-8");
      await fs.promises.rename(tempPath, sessionPath);
    } catch (error) {
      saveError = error;
      if (error instanceof SessionError) {
        throw error;
      }

      try {
        await fs.promises.rm(tempPath, { force: true });
      } catch {
        // best-effort cleanup
      }

      throw new SessionError(
        `Failed to save session to ${sessionPath}`,
        session.id,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    } finally {
      if (lockAcquired) {
        try {
          await this.releaseLock(session.id);
        } catch (error) {
          if (!saveError) {
            throw new SessionError(
              "Failed to release session lock",
              session.id,
              {
                originalError:
                  error instanceof Error ? error.message : String(error),
              },
              "LOCK_FAILED",
            );
          }

          console.warn(
            `Failed to release session lock for ${session.id} after error.`,
          );
        }
      }
    }
  }

  async load(sessionId: string): Promise<AgentSession> {
    const sessionPath = this.getSessionPath(sessionId);
    let lockAcquired = false;
    let loadError: unknown;

    try {
      await this.acquireLock(sessionId);
      lockAcquired = true;
      const json = await fs.promises.readFile(sessionPath, "utf-8");
      const data = JSON.parse(json);
      return AgentSession.fromJSON(data);
    } catch (error) {
      loadError = error;
      if (error instanceof SessionError) {
        throw error;
      }

      throw new SessionError(
        `Failed to load session from ${sessionPath}`,
        sessionId,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    } finally {
      if (lockAcquired) {
        try {
          await this.releaseLock(sessionId);
        } catch (error) {
          if (!loadError) {
            throw new SessionError(
              "Failed to release session lock",
              sessionId,
              {
                originalError:
                  error instanceof Error ? error.message : String(error),
              },
              "LOCK_FAILED",
            );
          }

          console.warn(
            `Failed to release session lock for ${sessionId} after error.`,
          );
        }
      }
    }
  }

  async createCheckpoint(session: AgentSession): Promise<CheckpointReference> {
    const checkpointDir = this.getCheckpointDir();
    const checkpointPath = path.join(
      checkpointDir,
      `${session.id}-iter-${session.currentIteration}.json`,
    );
    const tempPath = `${checkpointPath}.tmp.${Date.now()}`;
    const timestamp = new Date().toISOString();

    const checkpointContent = {
      sessionId: session.id,
      iteration: session.currentIteration,
      position: "end" as const,
      messageCount: session.messages.length,
      toolCallCount: session.toolCalls.length,
      fileChangeCount: session.fileChanges.length,
      timestamp,
    };

    try {
      await fs.promises.mkdir(checkpointDir, { recursive: true });

      const parseResult = CheckpointContentSchema.safeParse(checkpointContent);
      if (!parseResult.success) {
        throw new SessionError(
          "Checkpoint content validation failed",
          session.id,
          {
            errors: parseResult.error.errors,
          },
        );
      }

      const json = JSON.stringify(checkpointContent, null, 2);
      await fs.promises.writeFile(tempPath, json, "utf-8");
      await fs.promises.rename(tempPath, checkpointPath);

      const stats = await fs.promises.stat(checkpointPath);
      const checkpointReference: CheckpointReference = {
        id: crypto.randomUUID(),
        iteration: session.currentIteration,
        position: "end",
        toolCallId: null,
        filePath: checkpointPath,
        fileSize: stats.size,
        createdAt: timestamp,
      };

      session.addCheckpoint(checkpointReference);
      return checkpointReference;
    } catch (error) {
      if (error instanceof SessionError) {
        throw error;
      }

      try {
        await fs.promises.rm(tempPath, { force: true });
      } catch {
        // best-effort cleanup
      }

      throw new SessionError(
        `Failed to create checkpoint for session ${session.id}`,
        session.id,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  async autoSave(
    session: AgentSession,
    options: AutoSaveOptions = {},
  ): Promise<void> {
    if (options.checkpoint) {
      await this.createCheckpoint(session);
    }

    await this.save(session);
  }

  async listSessions(): Promise<SessionMetadata[]> {
    const sessionDir = this.getSessionDir();

    try {
      const entries = await fs.promises.readdir(sessionDir, {
        withFileTypes: true,
      });
      const sessionFiles = entries
        .filter(
          (entry) =>
            entry.isFile() &&
            entry.name.startsWith("session-") &&
            entry.name.endsWith(".json"),
        )
        .map((entry) => path.join(sessionDir, entry.name));

      const results: SessionMetadata[] = [];
      for (const filePath of sessionFiles) {
        const json = await fs.promises.readFile(filePath, "utf-8");
        const data = JSON.parse(json);
        const parseResult = AgentSessionSchema.safeParse(data);
        if (!parseResult.success) {
          throw new SessionError("Invalid session data", "unknown", {
            errors: parseResult.error.errors,
            filePath,
          });
        }

        const sessionData = parseResult.data;
        const metadata: SessionMetadata = {
          id: sessionData.id,
          role: sessionData.role,
          status: sessionData.status,
          taskId: sessionData.taskId,
          sprintId: sessionData.sprintId,
          updatedAt: sessionData.updatedAt,
          lastActivityAt: sessionData.lastActivityAt,
          currentIteration: sessionData.currentIteration,
        };

        const metadataResult = SessionMetadataSchema.safeParse(metadata);
        if (!metadataResult.success) {
          throw new SessionError("Invalid session metadata", sessionData.id, {
            errors: metadataResult.error.errors,
          });
        }

        results.push(metadataResult.data);
      }

      return results;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError?.code === "ENOENT") {
        return [];
      }

      if (error instanceof SessionError) {
        throw error;
      }

      throw new SessionError(
        `Failed to list sessions from ${sessionDir}`,
        "unknown",
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  async getRecoverableSessions(): Promise<SessionMetadata[]> {
    const sessions = await this.listSessions();
    return sessions.filter(
      (session) =>
        session.status === "paused" ||
        session.status === "stopped" ||
        session.status === "running",
    );
  }

  async deleteSession(sessionId: string): Promise<void> {
    const sessionPath = this.getSessionPath(sessionId);
    const checkpointDir = this.getCheckpointDir();

    try {
      await fs.promises.rm(sessionPath, { force: true });

      try {
        const entries = await fs.promises.readdir(checkpointDir, {
          withFileTypes: true,
        });
        const checkpointFiles = entries
          .filter(
            (entry) =>
              entry.isFile() &&
              entry.name.startsWith(`${sessionId}-iter-`) &&
              entry.name.endsWith(".json"),
          )
          .map((entry) => path.join(checkpointDir, entry.name));

        await Promise.all(
          checkpointFiles.map((file) => fs.promises.rm(file, { force: true })),
        );
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError?.code !== "ENOENT") {
          throw error;
        }
      }
    } catch (error) {
      throw new SessionError(
        `Failed to delete session ${sessionId}`,
        sessionId,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }
}
