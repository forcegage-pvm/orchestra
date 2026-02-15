/**
 * listDirectory tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { listDirectoryTool } from "../../../../../src/agents/tools/coding/listDirectory.js";
import {
  ToolErrorCode,
  createToolError,
} from "../../../../../src/agents/tools/errors.js";
import type {
  ToolInvocationContext,
  ToolResult,
} from "../../../../../src/agents/tools/types.js";
import { validatePath } from "../../../../../src/agents/tools/utils/pathValidation.js";

const { workspace, FileSystemError, FileType, Uri } = vi.hoisted(() => {
  const workspace = {
    fs: {
      readDirectory: vi.fn(),
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
  } as const;

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
    FileSystemError,
    FileType,
    Uri,
  };
});

vi.mock("vscode", () => ({
  workspace,
  FileType,
  Uri,
  FileSystemError,
}));

vi.mock("../../../../../src/agents/tools/utils/pathValidation.js", () => ({
  validatePath: vi.fn(),
}));

const mockContext: ToolInvocationContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  token: { isCancellationRequested: false } as ToolInvocationContext["token"],
};

const validatePathMock = vi.mocked(validatePath);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listDirectoryTool", () => {
  it("lists directory contents with trailing slash for folders", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/project",
    });
    workspace.fs.readDirectory.mockResolvedValue([
      ["src", FileType.Directory],
      ["file.txt", FileType.File],
    ]);

    const result = await listDirectoryTool.invoke(
      { path: "project" },
      mockContext,
    );

    expect(result.success).toBe(true);
    const output = result.content[0]?.value ?? "";
    const lines = output.split("\n");
    expect(lines).toContain("src/");
    expect(lines).toContain("file.txt");
  });

  it("returns FILE_NOT_FOUND when directory is missing", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/missing",
    });
    workspace.fs.readDirectory.mockRejectedValue(
      FileSystemError.FileNotFound(),
    );

    const result = (await listDirectoryTool.invoke(
      { path: "missing" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.FILE_NOT_FOUND);
  });

  it("returns PATH_TRAVERSAL when validation fails", async () => {
    validatePathMock.mockResolvedValue({
      isValid: false,
      error: createToolError(
        ToolErrorCode.PATH_TRAVERSAL,
        "Path traversal is not allowed",
        "Remove any '..' segments from the path.",
      ),
    });

    const result = (await listDirectoryTool.invoke(
      { path: "../project" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.PATH_TRAVERSAL);
    expect(workspace.fs.readDirectory).not.toHaveBeenCalled();
  });

  it("returns CANCELLED when cancellation is requested", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/project",
    });

    const result = (await listDirectoryTool.invoke(
      { path: "project" },
      {
        ...mockContext,
        token: {
          isCancellationRequested: true,
        } as ToolInvocationContext["token"],
      },
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.CANCELLED);
    expect(workspace.fs.readDirectory).not.toHaveBeenCalled();
  });
});
