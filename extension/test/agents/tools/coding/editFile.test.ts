/**
 * editFile tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { editFileTool } from "../../../src/agents/tools/coding/editFile.js";
import {
  ToolErrorCode,
  createToolError,
} from "../../../src/agents/tools/errors.js";
import type {
  ToolInvocationContext,
  ToolResult,
} from "../../../src/agents/tools/types.js";
import { validatePath } from "../../../src/agents/tools/utils/pathValidation.js";

const { workspace, Range, Position, WorkspaceEdit, Uri, FileSystemError } =
  vi.hoisted(() => {
    const workspace = {
      openTextDocument: vi.fn(),
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

    class Position {
      constructor(
        public line: number,
        public character: number,
      ) {}
    }

    class Range {
      constructor(
        public start: Position,
        public end: Position,
      ) {}
    }

    class WorkspaceEdit {
      static lastInstance: WorkspaceEdit | undefined;
      replace = vi.fn();

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
      Range,
      Position,
      WorkspaceEdit,
      Uri,
      FileSystemError,
    };
  });

vi.mock("vscode", () => ({
  workspace,
  Range,
  Position,
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

function createDocument(content: string) {
  const lineStarts: number[] = [0];
  for (let index = 0; index < content.length; index += 1) {
    const current = content[index];
    if (current === "\n") {
      lineStarts.push(index + 1);
      continue;
    }

    if (current === "\r" && content[index + 1] === "\n") {
      lineStarts.push(index + 2);
      index += 1;
    }
  }

  const positionAt = (offset: number) => {
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1] <= offset) {
      line += 1;
    }
    const character = Math.max(0, offset - lineStarts[line]);
    return new Position(line, character);
  };

  const getText = () => content;

  return {
    getText,
    positionAt,
  };
}

const validatePathMock = vi.mocked(validatePath);

beforeEach(() => {
  vi.clearAllMocks();
  WorkspaceEdit.lastInstance = undefined;
});

describe("editFileTool", () => {
  it("replaces text using WorkspaceEdit", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/file.txt",
    });
    workspace.openTextDocument.mockResolvedValue(createDocument("hello world"));
    workspace.applyEdit.mockResolvedValue(true);

    const result = await editFileTool.invoke(
      { path: "file.txt", oldString: "world", newString: "there" },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(result.content).toEqual([
      { type: "text", value: "Replaced text in file.txt." },
    ]);
    expect(result.metadata.toolName).toBe("edit_file");
    expect(workspace.applyEdit).toHaveBeenCalledTimes(1);
    expect(WorkspaceEdit.lastInstance?.replace).toHaveBeenCalledTimes(1);
  });

  it("matches oldString when file uses CRLF", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/file.txt",
    });
    workspace.openTextDocument.mockResolvedValue(
      createDocument("hello\r\nworld"),
    );
    workspace.applyEdit.mockResolvedValue(true);

    const result = await editFileTool.invoke(
      { path: "file.txt", oldString: "world", newString: "there" },
      mockContext,
    );

    expect(result.success).toBe(true);
    const replaceCall = WorkspaceEdit.lastInstance?.replace.mock.calls[0];
    expect(replaceCall).toBeDefined();
    if (replaceCall) {
      const range = replaceCall[1] as InstanceType<typeof Range>;
      expect(range.start.line).toBe(1);
      expect(range.start.character).toBe(0);
      expect(range.end.line).toBe(1);
      expect(range.end.character).toBe(5);
    }
  });

  it("returns NO_MATCH when oldString is missing", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/file.txt",
    });
    workspace.openTextDocument.mockResolvedValue(createDocument("hello"));

    const result = await editFileTool.invoke(
      { path: "file.txt", oldString: "missing", newString: "there" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.NO_MATCH);
    expect(result.error?.suggestion).toBeTruthy();
  });

  it("returns MULTIPLE_MATCHES when oldString is ambiguous", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/file.txt",
    });
    workspace.openTextDocument.mockResolvedValue(createDocument("hello hello"));

    const result = await editFileTool.invoke(
      { path: "file.txt", oldString: "hello", newString: "hi" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.MULTIPLE_MATCHES);
    expect(result.error?.suggestion).toBeTruthy();
  });

  it("returns PATH_TRAVERSAL when validation fails", async () => {
    validatePathMock.mockResolvedValue({
      isValid: false,
      error: createToolError(
        ToolErrorCode.PATH_TRAVERSAL,
        "Path traversal is not allowed",
        "Use a workspace-relative path.",
      ),
    });

    const result = (await editFileTool.invoke(
      { path: "../file.txt", oldString: "a", newString: "b" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.PATH_TRAVERSAL);
  });
});
