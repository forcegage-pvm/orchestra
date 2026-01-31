/**
 * moveDirectory tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToolErrorCode } from "../../../../src/agents/tools/errors.js";
import { moveDirectoryTool } from "../../../../src/agents/tools/filesystem/moveDirectory.js";
import type {
  ToolInvocationContext,
  ToolResult,
} from "../../../../src/agents/tools/types.js";
import { validatePath } from "../../../../src/agents/tools/utils/pathValidation.js";

const { workspace, Uri, FileSystemError, FileType } = vi.hoisted(() => {
  const workspace = {
    fs: {
      stat: vi.fn(),
      readDirectory: vi.fn(),
      rename: vi.fn(),
      delete: vi.fn(),
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

  const FileType = {
    File: 1,
    Directory: 2,
  };

  class Uri {
    fsPath: string;
    path: string;

    constructor(filePath: string) {
      this.fsPath = filePath;
      this.path = filePath;
    }

    toString(): string {
      return this.fsPath;
    }

    static file(filePath: string): Uri {
      return new Uri(filePath);
    }

    static joinPath(base: Uri, ...pathSegments: string[]): Uri {
      const joined = [base.fsPath, ...pathSegments].join("/");
      return new Uri(joined);
    }
  }

  return {
    workspace,
    Uri,
    FileSystemError,
    FileType,
  };
});

vi.mock("vscode", () => ({
  workspace,
  Uri,
  FileSystemError,
  FileType,
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

describe("moveDirectoryTool", () => {
  it("moves directory with nested files and subdirectories", async () => {
    validatePathMock
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/src",
      })
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/lib",
      });

    // Source exists and is a directory
    workspace.fs.stat
      .mockResolvedValueOnce({ type: FileType.Directory })
      .mockRejectedValueOnce(FileSystemError.FileNotFound()); // dest doesn't exist

    // Mock directory structure: src/file1.ts, src/subdir/file2.ts
    workspace.fs.readDirectory
      .mockResolvedValueOnce([
        ["file1.ts", FileType.File],
        ["subdir", FileType.Directory],
      ])
      .mockResolvedValueOnce([["file2.ts", FileType.File]]);

    workspace.fs.rename.mockResolvedValue(undefined);

    const result = await moveDirectoryTool.invoke(
      { source_path: "src", destination_path: "lib" },
      mockContext,
    );

    expect(result.success).toBe(true);
    const jsonContent = result.content.find((c) => c.type === "json");
    expect(jsonContent).toBeDefined();
    if (jsonContent) {
      const data = JSON.parse(jsonContent.value);
      expect(data.old_path).toBe("src");
      expect(data.new_path).toBe("lib");
      expect(data.files_moved).toBe(2);
      expect(data.directories_moved).toBe(1);
    }

    expect(workspace.fs.rename).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: "/workspace/src" }),
      expect.objectContaining({ fsPath: "/workspace/lib" }),
      { overwrite: false },
    );
  });

  it("returns error when source is not a directory", async () => {
    validatePathMock
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/file.ts",
      })
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/newdir",
      });

    // Source exists but is a file
    workspace.fs.stat.mockResolvedValueOnce({ type: FileType.File });

    const result = (await moveDirectoryTool.invoke(
      { source_path: "file.ts", destination_path: "newdir" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
    expect(workspace.fs.rename).not.toHaveBeenCalled();
  });

  it("returns FILE_EXISTS when destination exists and overwrite is false", async () => {
    validatePathMock
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/src",
      })
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/lib",
      });

    // Both exist and are directories
    workspace.fs.stat.mockResolvedValue({ type: FileType.Directory });
    workspace.fs.readDirectory.mockResolvedValue([]);

    const result = (await moveDirectoryTool.invoke(
      { source_path: "src", destination_path: "lib" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.FILE_EXISTS);
    expect(workspace.fs.rename).not.toHaveBeenCalled();
  });

  it("overwrites destination directory when overwrite is true", async () => {
    validatePathMock
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/src",
      })
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/lib",
      });

    // Both exist and are directories
    workspace.fs.stat.mockResolvedValue({ type: FileType.Directory });
    workspace.fs.readDirectory.mockResolvedValue([["file.ts", FileType.File]]);
    workspace.fs.delete.mockResolvedValue(undefined);
    workspace.fs.rename.mockResolvedValue(undefined);

    const result = await moveDirectoryTool.invoke(
      { source_path: "src", destination_path: "lib", overwrite: true },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(workspace.fs.delete).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: "/workspace/lib" }),
      { recursive: true },
    );
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
        absolutePath: "/workspace/missing",
      })
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/lib",
      });

    workspace.fs.stat.mockRejectedValue(FileSystemError.FileNotFound());

    const result = (await moveDirectoryTool.invoke(
      { source_path: "missing", destination_path: "lib" },
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

    const result = (await moveDirectoryTool.invoke(
      { source_path: "../outside", destination_path: "lib" },
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
        absolutePath: "/workspace/src",
      })
      .mockResolvedValueOnce({
        isValid: false,
        error: {
          code: ToolErrorCode.PATH_TRAVERSAL,
          message: "Path traversal detected",
        },
      });

    const result = (await moveDirectoryTool.invoke(
      { source_path: "src", destination_path: "../outside" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.PATH_TRAVERSAL);
    expect(workspace.fs.rename).not.toHaveBeenCalled();
  });

  it("counts nested directory structure correctly", async () => {
    validatePathMock
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/src",
      })
      .mockResolvedValueOnce({
        isValid: true,
        absolutePath: "/workspace/lib",
      });

    workspace.fs.stat
      .mockResolvedValueOnce({ type: FileType.Directory })
      .mockRejectedValueOnce(FileSystemError.FileNotFound());

    // Deep nested structure
    workspace.fs.readDirectory
      .mockResolvedValueOnce([
        ["file1.ts", FileType.File],
        ["dir1", FileType.Directory],
      ])
      .mockResolvedValueOnce([
        ["file2.ts", FileType.File],
        ["dir2", FileType.Directory],
      ])
      .mockResolvedValueOnce([
        ["file3.ts", FileType.File],
        ["file4.ts", FileType.File],
      ]);

    workspace.fs.rename.mockResolvedValue(undefined);

    const result = await moveDirectoryTool.invoke(
      { source_path: "src", destination_path: "lib" },
      mockContext,
    );

    expect(result.success).toBe(true);
    const jsonContent = result.content.find((c) => c.type === "json");
    if (jsonContent) {
      const data = JSON.parse(jsonContent.value);
      expect(data.files_moved).toBe(4);
      expect(data.directories_moved).toBe(2);
    }
  });
});
