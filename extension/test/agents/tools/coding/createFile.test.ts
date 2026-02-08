/**
 * createFile tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFileTool } from "../../../src/agents/tools/coding/createFile.js";
import { ToolErrorCode } from "../../../src/agents/tools/errors.js";
import type {
  ToolInvocationContext,
  ToolResult,
} from "../../../src/agents/tools/types.js";
import { validatePath } from "../../../src/agents/tools/utils/pathValidation.js";

const { workspace, WorkspaceEdit, Uri, FileSystemError } = vi.hoisted(() => {
  const workspace = {
    fs: {
      stat: vi.fn(),
      createDirectory: vi.fn(),
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
    createFile = vi.fn();

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

vi.mock("../../../src/agents/tools/utils/pathValidation.js", () => ({
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
  WorkspaceEdit.lastInstance = undefined;
});

describe("createFileTool", () => {
  it("creates file with content and parent directories", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/nested/file.txt",
    });
    workspace.fs.stat.mockRejectedValue(FileSystemError.FileNotFound());
    workspace.fs.createDirectory.mockResolvedValue(undefined);
    workspace.applyEdit.mockResolvedValue(true);

    const result = await createFileTool.invoke(
      { path: "nested/file.txt", content: "hello" },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(result.content).toEqual([
      { type: "text", value: "Created file at nested/file.txt." },
    ]);

    const createDirCall = workspace.fs.createDirectory.mock.calls[0]?.[0];
    expect(createDirCall?.fsPath).toBe("/workspace/nested");

    expect(WorkspaceEdit.lastInstance?.createFile).toHaveBeenCalledTimes(1);
    const createCall = WorkspaceEdit.lastInstance?.createFile.mock.calls[0];
    expect(createCall).toBeDefined();
    if (createCall) {
      const options = createCall[1] as {
        overwrite?: boolean;
        ignoreIfExists?: boolean;
        contents?: Uint8Array;
      };
      expect(options.overwrite).toBe(false);
      expect(options.ignoreIfExists).toBe(false);
      expect(Buffer.from(options.contents ?? []).toString()).toBe("hello");
    }

    const createDirectoryOrder =
      workspace.fs.createDirectory.mock.invocationCallOrder[0];
    const applyEditOrder = workspace.applyEdit.mock.invocationCallOrder[0];
    expect(createDirectoryOrder).toBeLessThan(applyEditOrder);
  });

  it("returns FILE_EXISTS when file already exists", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/file.txt",
    });
    workspace.fs.stat.mockResolvedValue({});

    const result = (await createFileTool.invoke(
      { path: "file.txt", content: "hello" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.FILE_EXISTS);
    expect(workspace.applyEdit).not.toHaveBeenCalled();
  });

  it("creates parent directories before file creation", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/deep/nested/file.txt",
    });
    workspace.fs.stat.mockRejectedValue(FileSystemError.FileNotFound());
    workspace.fs.createDirectory.mockResolvedValue(undefined);
    workspace.applyEdit.mockResolvedValue(true);

    const result = await createFileTool.invoke(
      { path: "deep/nested/file.txt" },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(workspace.fs.createDirectory).toHaveBeenCalledTimes(1);
  });
});
