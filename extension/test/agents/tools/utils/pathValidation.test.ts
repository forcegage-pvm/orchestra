import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";

import { ToolErrorCode } from "../../../../src/agents/tools/errors.js";
import {
  isWithinWorkspace,
  validatePath,
} from "../../../../src/agents/tools/utils/pathValidation.js";

async function createTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function removeDir(targetPath: string): Promise<void> {
  await fs.rm(targetPath, { recursive: true, force: true });
}

describe("pathValidation", () => {
  it("rejects path traversal segments", async () => {
    const workspaceRoot = await createTempDir("orchestra-workspace-");

    try {
      const result = await validatePath("../secrets.txt", workspaceRoot);
      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error.code).toBe(ToolErrorCode.PATH_TRAVERSAL);
      }
    } finally {
      await removeDir(workspaceRoot);
    }
  });

  it("accepts absolute paths within the workspace", async () => {
    const workspaceRoot = await createTempDir("orchestra-workspace-");

    try {
      const filePath = path.join(workspaceRoot, "file.txt");
      const result = await validatePath(filePath, workspaceRoot);
      expect(result.isValid).toBe(true);
      if (result.isValid) {
        expect(result.absolutePath).toBe(path.normalize(filePath));
      }
    } finally {
      await removeDir(workspaceRoot);
    }
  });

  it("detects paths outside the workspace", async () => {
    const workspaceRoot = await createTempDir("orchestra-workspace-");
    const outsideRoot = await createTempDir("orchestra-outside-");

    try {
      const outsidePath = path.join(outsideRoot, "file.txt");
      const inside = await isWithinWorkspace(outsidePath, workspaceRoot);
      expect(inside).toBe(false);
    } finally {
      await removeDir(workspaceRoot);
      await removeDir(outsideRoot);
    }
  });

  it("rejects symlink escapes", async () => {
    const workspaceRoot = await createTempDir("orchestra-workspace-");
    const outsideRoot = await createTempDir("orchestra-outside-");

    try {
      const linkPath = path.join(workspaceRoot, "escape");
      let linkCreated = false;

      try {
        const type = process.platform === "win32" ? "junction" : "dir";
        await fs.symlink(outsideRoot, linkPath, type);
        linkCreated = true;
      } catch {
        // Symlink creation can fail on restricted systems; skip if not available
        linkCreated = false;
      }

      if (!linkCreated) {
        return;
      }

      const result = await validatePath(
        path.join("escape", "secret.txt"),
        workspaceRoot,
      );

      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error.code).toBe(ToolErrorCode.PATH_TRAVERSAL);
      }
    } finally {
      await removeDir(workspaceRoot);
      await removeDir(outsideRoot);
    }
  });

  it("rejects UNC paths outside workspace on Windows", async () => {
    if (process.platform !== "win32") {
      return;
    }

    const workspaceRoot = await createTempDir("orchestra-workspace-");

    try {
      const uncPath = "\\\\server\\share\\file.txt";
      const result = await validatePath(uncPath, workspaceRoot);

      expect(result.isValid).toBe(false);
      if (!result.isValid) {
        expect(result.error.code).toBe(ToolErrorCode.PATH_TRAVERSAL);
      }
    } finally {
      await removeDir(workspaceRoot);
    }
  });
});
