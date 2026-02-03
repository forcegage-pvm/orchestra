/**
 * moveFile tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToolErrorCode } from "../../../../src/agents/tools/errors.js";
import { moveFileTool } from "../../../../src/agents/tools/filesystem/moveFile.js";
import type {
  ToolInvocationContext,
  ToolResult,
} from "../../../../src/agents/tools/types.js";
import { validatePath } from "../../../../src/agents/tools/utils/pathValidation.js";

const { workspace, Uri, FileSystemError } = vi.hoisted(() => {
  const workspace = {
    fs: {
      stat: vi.fn(),
      createDirectory: vi.fn(),
      rename: vi.fn(),
    },
  };

  class FileSystemError extends Error {
    code?: string;

    constructor(message: string, code?: string) {
      super(message);
      this.code = code;
      this.name = "FileSystemError";
    }

    static FileNotFound(): FileSystemError {
      return new FileSystemError("File not found", "FileNotFound");
    }
  }

  class Uri {
    static file(filePath: string): {
      fsPath: string;
      path: string;
      toString: () => string;
    } {
      return {
        fsPath: filePath,
        path: filePath,
        toString: () => filePath,
      };
    }
  }

  return {
    workspace,
    Uri,
    FileSystemError,
  };
});

vi.mock("vscode", () => ({
  workspace,
  Uri,
  FileSystemError,
}));

vi.mock("../../../../src/agents/tools/utils/pathValidation.js", () => ({
  validatePath: vi.fn(),
}));

const mockContext: ToolInvocationContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  token: {} as ToolInvocationContext["token"],
};

const validatePathMock = vi.mocked(validatePath);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("moveFileTool", () => {
  it("moves file successfully", async () => {
    validatePathMock
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/src/old.ts",
      })
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/src/new.ts",
      });
    workspace.fs.stat
      .mockResolvedValueOnce({}) // source exists
      .mockRejectedValueOnce(FileSystemError.FileNotFound()); // dest doesn't exist
    workspace.fs.createDirectory.mockResolvedValue(undefined);
    workspace.fs.rename.mockResolvedValue(undefined);

    const result = await moveFileTool.invoke(
      { source_path: "src/old.ts", destination_path: "src/new.ts" },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
    const jsonContent = result.content.find((c) => c.type === "json");
    expect(jsonContent).toBeDefined();
    if (jsonContent) {
      const data = JSON.parse(jsonContent.value);
      expect(data.old_path).toBe("src/old.ts");
      expect(data.new_path).toBe("src/new.ts");
    }

    expect(workspace.fs.rename).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: "/workspace/src/old.ts" }),
      expect.objectContaining({ fsPath: "/workspace/src/new.ts" }),
      { overwrite: false },
    );
  });

  it("creates parent directories when destination parent doesn't exist", async () => {
    validatePathMock
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/file.ts",
      })
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/nested/deep/file.ts",
      });
    workspace.fs.stat
      .mockResolvedValueOnce({}) // source exists
      .mockRejectedValueOnce(FileSystemError.FileNotFound()); // dest doesn't exist
    workspace.fs.createDirectory.mockResolvedValue(undefined);
    workspace.fs.rename.mockResolvedValue(undefined);

    const result = await moveFileTool.invoke(
      { source_path: "file.ts", destination_path: "nested/deep/file.ts" },
      mockContext,
    );

    expect(result.success).toBe(true);
    const jsonContent = result.content.find((c) => c.type === "json");
    if (jsonContent) {
      const data = JSON.parse(jsonContent.value);
      expect(data.directories_created).toBe(true);
    }

    expect(workspace.fs.createDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: "/workspace/nested/deep" }),
    );
  });

  it("returns FILE_EXISTS when destination exists and overwrite is false", async () => {
    validatePathMock
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/old.ts",
      })
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/new.ts",
      });
    workspace.fs.stat.mockResolvedValue({}); // both exist

    const result = (await moveFileTool.invoke(
      { source_path: "old.ts", destination_path: "new.ts" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.FILE_EXISTS);
    expect(workspace.fs.rename).not.toHaveBeenCalled();
  });

  it("overwrites destination when overwrite is true", async () => {
    validatePathMock
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/old.ts",
      })
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/new.ts",
      });
    workspace.fs.stat.mockResolvedValue({}); // both exist
    workspace.fs.createDirectory.mockResolvedValue(undefined);
    workspace.fs.rename.mockResolvedValue(undefined);

    const result = await moveFileTool.invoke(
      { source_path: "old.ts", destination_path: "new.ts", overwrite: true },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(workspace.fs.rename).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { overwrite: true },
    );
  });

  it("returns FILE_NOT_FOUND when source doesn't exist", async () => {
    validatePathMock
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/missing.ts",
      })
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/new.ts",
      });
    workspace.fs.stat.mockRejectedValue(FileSystemError.FileNotFound());

    const result = (await moveFileTool.invoke(
      { source_path: "missing.ts", destination_path: "new.ts" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.FILE_NOT_FOUND);
    expect(workspace.fs.rename).not.toHaveBeenCalled();
  });

  it("returns PATH_TRAVERSAL when source path validation fails", async () => {
    validatePathMock.mockResolvedValueOnce({
      isValid: false,
      error: {
        code: ToolErrorCode.PATH_TRAVERSAL,
        message: "Path traversal detected",
      },
    });

    const result = (await moveFileTool.invoke(
      { source_path: "../outside.ts", destination_path: "new.ts" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.PATH_TRAVERSAL);
    expect(workspace.fs.rename).not.toHaveBeenCalled();
  });

  it("returns PATH_TRAVERSAL when destination path validation fails", async () => {
    validatePathMock
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/old.ts",
      })
      .mockResolvedValueOnce({
        isValid: false,
        error: {
          code: ToolErrorCode.PATH_TRAVERSAL,
          message: "Path traversal detected",
        },
      });

    const result = (await moveFileTool.invoke(
      { source_path: "old.ts", destination_path: "../outside.ts" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.PATH_TRAVERSAL);
    expect(workspace.fs.rename).not.toHaveBeenCalled();
  });
});
