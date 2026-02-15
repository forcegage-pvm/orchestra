/**
 * deleteFile tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteFileTool } from "../../../../../src/agents/tools/coding/deleteFile.js";
import {
  ToolErrorCode,
  createToolError,
} from "../../../../../src/agents/tools/errors.js";
import type {
  ToolInvocationContext,
  ToolResult,
} from "../../../../../src/agents/tools/types.js";
import { validatePath } from "../../../../../src/agents/tools/utils/pathValidation.js";

const { workspace, WorkspaceEdit, Uri, FileSystemError } = vi.hoisted(() => {
  const workspace = {
    fs: {
      stat: vi.fn(),
    },
    applyEdit: vi.fn(),
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

  class WorkspaceEdit {
    static lastInstance: WorkspaceEdit | undefined;
    deleteFile = vi.fn();

    constructor() {
      WorkspaceEdit.lastInstance = this;
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
    WorkspaceEdit,
    Uri,
    FileSystemError,
  };
});

vi.mock("vscode", () => ({
  workspace,
  WorkspaceEdit,
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
  WorkspaceEdit.lastInstance = undefined;
});

describe("deleteFileTool", () => {
  it("deletes a file using WorkspaceEdit", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/file.txt",
    });
    workspace.fs.stat.mockResolvedValue({});
    workspace.applyEdit.mockResolvedValue(true);

    const result = await deleteFileTool.invoke(
      { path: "file.txt" },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(result.content).toEqual([
      { type: "text", value: "Deleted file at file.txt." },
    ]);

    expect(WorkspaceEdit.lastInstance?.deleteFile).toHaveBeenCalledTimes(1);
    const deleteCall = WorkspaceEdit.lastInstance?.deleteFile.mock.calls[0];
    expect(deleteCall).toBeDefined();
    if (deleteCall) {
      const options = deleteCall[1] as {
        ignoreIfNotExists?: boolean;
        recursive?: boolean;
      };
      expect(options.ignoreIfNotExists).toBe(false);
      expect(options.recursive).toBe(false);
    }
  });

  it("returns FILE_NOT_FOUND when file does not exist", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/missing.txt",
    });
    workspace.fs.stat.mockRejectedValue(FileSystemError.FileNotFound());

    const result = (await deleteFileTool.invoke(
      { path: "missing.txt" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.FILE_NOT_FOUND);
    expect(workspace.applyEdit).not.toHaveBeenCalled();
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

    const result = (await deleteFileTool.invoke(
      { path: "../file.txt" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.PATH_TRAVERSAL);
    expect(workspace.fs.stat).not.toHaveBeenCalled();
  });
});
