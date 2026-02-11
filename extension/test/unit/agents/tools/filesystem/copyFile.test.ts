/**
 * copyFile tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToolErrorCode } from "../../../../../src/agents/tools/errors.js";
import { copyFileTool } from "../../../../../src/agents/tools/filesystem/copyFile.js";
import type {
  ToolInvocationContext,
  ToolResult,
} from "../../../../../src/agents/tools/types.js";
import { validatePath } from "../../../../../src/agents/tools/utils/pathValidation.js";

const { workspace, Uri, FileSystemError } = vi.hoisted(() => {
  const workspace = {
    fs: {
      stat: vi.fn(),
      createDirectory: vi.fn(),
      copy: vi.fn(),
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

vi.mock("../../../../../src/agents/tools/utils/pathValidation.js", () => ({
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

describe("copyFileTool", () => {
  it("copies file successfully", async () => {
    validatePathMock
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/src/original.ts",
      })
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/src/copy.ts",
      });
    workspace.fs.stat
      .mockResolvedValueOnce({}) // source exists
      .mockRejectedValueOnce(FileSystemError.FileNotFound()); // dest doesn't exist
    workspace.fs.createDirectory.mockResolvedValue(undefined);
    workspace.fs.copy.mockResolvedValue(undefined);

    const result = await copyFileTool.invoke(
      { source_path: "src/original.ts", destination_path: "src/copy.ts" },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
    const jsonContent = result.content.find((c) => c.type === "json");
    expect(jsonContent).toBeDefined();
    if (jsonContent) {
      const data = JSON.parse(jsonContent.value);
      expect(data.source_path).toBe("src/original.ts");
      expect(data.destination_path).toBe("src/copy.ts");
    }

    expect(workspace.fs.copy).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: "/workspace/src/original.ts" }),
      expect.objectContaining({ fsPath: "/workspace/src/copy.ts" }),
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
        absolutePath: "/workspace/backup/nested/file.ts",
      });
    workspace.fs.stat
      .mockResolvedValueOnce({}) // source exists
      .mockRejectedValueOnce(FileSystemError.FileNotFound()); // dest doesn't exist
    workspace.fs.createDirectory.mockResolvedValue(undefined);
    workspace.fs.copy.mockResolvedValue(undefined);

    const result = await copyFileTool.invoke(
      { source_path: "file.ts", destination_path: "backup/nested/file.ts" },
      mockContext,
    );

    expect(result.success).toBe(true);
    const jsonContent = result.content.find((c) => c.type === "json");
    if (jsonContent) {
      const data = JSON.parse(jsonContent.value);
      expect(data.directories_created).toBe(true);
    }

    expect(workspace.fs.createDirectory).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: "/workspace/backup/nested" }),
    );
  });

  it("returns FILE_EXISTS when destination exists and overwrite is false", async () => {
    validatePathMock
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/original.ts",
      })
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/copy.ts",
      });
    workspace.fs.stat.mockResolvedValue({}); // both exist

    const result = (await copyFileTool.invoke(
      { source_path: "original.ts", destination_path: "copy.ts" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.FILE_EXISTS);
    expect(workspace.fs.copy).not.toHaveBeenCalled();
  });

  it("overwrites destination when overwrite is true", async () => {
    validatePathMock
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/original.ts",
      })
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/copy.ts",
      });
    workspace.fs.stat.mockResolvedValue({}); // both exist
    workspace.fs.createDirectory.mockResolvedValue(undefined);
    workspace.fs.copy.mockResolvedValue(undefined);

    const result = await copyFileTool.invoke(
      {
        source_path: "original.ts",
        destination_path: "copy.ts",
        overwrite: true,
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(workspace.fs.copy).toHaveBeenCalledWith(
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
        absolutePath: "/workspace/copy.ts",
      });
    workspace.fs.stat.mockRejectedValue(FileSystemError.FileNotFound());

    const result = (await copyFileTool.invoke(
      { source_path: "missing.ts", destination_path: "copy.ts" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.FILE_NOT_FOUND);
    expect(workspace.fs.copy).not.toHaveBeenCalled();
  });

  it("returns PATH_TRAVERSAL when source path validation fails", async () => {
    validatePathMock.mockResolvedValueOnce({
      isValid: false,
      error: {
        code: ToolErrorCode.PATH_TRAVERSAL,
        message: "Path traversal detected",
      },
    });

    const result = (await copyFileTool.invoke(
      { source_path: "../outside.ts", destination_path: "copy.ts" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.PATH_TRAVERSAL);
    expect(workspace.fs.copy).not.toHaveBeenCalled();
  });

  it("returns PATH_TRAVERSAL when destination path validation fails", async () => {
    validatePathMock
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/original.ts",
      })
      .mockResolvedValueOnce({
        isValid: false,
        error: {
          code: ToolErrorCode.PATH_TRAVERSAL,
          message: "Path traversal detected",
        },
      });

    const result = (await copyFileTool.invoke(
      { source_path: "original.ts", destination_path: "../outside.ts" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.PATH_TRAVERSAL);
    expect(workspace.fs.copy).not.toHaveBeenCalled();
  });
});
