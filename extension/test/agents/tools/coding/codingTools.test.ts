/**
 * Coding tools tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteFileTool } from "../../../../src/agents/tools/coding/deleteFile.js";
import { editTool } from "../../../../src/agents/tools/coding/edit.js";
import { newFileTool } from "../../../../src/agents/tools/coding/newFile.js";
import { readFileTool } from "../../../../src/agents/tools/coding/readFile.js";
import type { ToolContext } from "../../../../src/agents/types.js";

const { workspace, FileSystemError, Position, Range, WorkspaceEdit, Uri } =
  vi.hoisted(() => {
    const workspace = {
      openTextDocument: vi.fn(),
      applyEdit: vi.fn(),
      fs: {
        stat: vi.fn(),
        createDirectory: vi.fn(),
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
      createFile = vi.fn();
      deleteFile = vi.fn();

      constructor() {
        WorkspaceEdit.lastInstance = this;
      }
    }

    class Uri {
      static file(filePath: string): { fsPath: string; path: string } {
        return { fsPath: filePath, path: filePath };
      }
    }

    return {
      workspace,
      FileSystemError,
      Position,
      Range,
      WorkspaceEdit,
      Uri,
    };
  });

vi.mock("vscode", () => ({
  workspace,
  FileSystemError,
  Position,
  Range,
  WorkspaceEdit,
  Uri,
}));

function createDocument(content: string) {
  const lines = content.split("\n");
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }

  const positionAt = (position: number) => {
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1] <= position) {
      line += 1;
    }
    const character = Math.max(0, position - lineStarts[line]);
    return new Position(line, character);
  };

  const getText = (range?: Range) => {
    if (!range) {
      return content;
    }

    const startOffset = lineStarts[range.start.line] + range.start.character;
    const endOffset = lineStarts[range.end.line] + range.end.character;
    return content.slice(startOffset, endOffset);
  };

  const lineAt = (line: number) => {
    const text = lines[line] ?? "";
    return {
      text,
      range: {
        end: {
          character: text.length,
        },
      },
    };
  };

  return {
    lineCount: lines.length,
    getText,
    positionAt,
    lineAt,
  };
}

const mockContext: ToolContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  iteration: 0,
  cancellationToken: {},
  logger: {},
  db: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  WorkspaceEdit.lastInstance = undefined;
});

describe("readFileTool", () => {
  it("reads full file contents", async () => {
    const content = "alpha\nbeta\ngamma";
    workspace.openTextDocument.mockResolvedValue(createDocument(content));

    const result = await readFileTool.execute(
      { path: "file.txt" },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe(content);
  });

  it("reads file contents with line range", async () => {
    const content = "alpha\nbeta\ngamma";
    workspace.openTextDocument.mockResolvedValue(createDocument(content));

    const result = await readFileTool.execute(
      { path: "file.txt", startLine: 2, endLine: 3 },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe("beta\ngamma");
  });

  it("handles missing file", async () => {
    workspace.openTextDocument.mockRejectedValue(
      FileSystemError.FileNotFound(),
    );

    const result = await readFileTool.execute(
      { path: "missing.txt" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("File not found");
  });
});

describe("editTool", () => {
  it("replaces exact oldString match", async () => {
    workspace.openTextDocument.mockResolvedValue(createDocument("hello world"));
    workspace.applyEdit.mockResolvedValue(true);

    const result = await editTool.execute(
      { path: "file.txt", oldString: "world", newString: "there" },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(workspace.applyEdit).toHaveBeenCalledTimes(1);
    expect(WorkspaceEdit.lastInstance?.replace).toHaveBeenCalledTimes(1);
  });

  it("fails when oldString not found", async () => {
    workspace.openTextDocument.mockResolvedValue(createDocument("hello world"));

    const result = await editTool.execute(
      { path: "file.txt", oldString: "missing", newString: "there" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("oldString not found");
  });

  it("fails when oldString is ambiguous", async () => {
    workspace.openTextDocument.mockResolvedValue(createDocument("hello hello"));

    const result = await editTool.execute(
      { path: "file.txt", oldString: "hello", newString: "hi" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("multiple");
  });
});

describe("newFileTool", () => {
  it("creates file when it does not exist", async () => {
    workspace.fs.stat.mockRejectedValue(FileSystemError.FileNotFound());
    workspace.applyEdit.mockResolvedValue(true);

    const result = await newFileTool.execute(
      { path: "new.txt", content: "data" },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(workspace.fs.createDirectory).toHaveBeenCalledTimes(1);
    expect(WorkspaceEdit.lastInstance?.createFile).toHaveBeenCalledTimes(1);
  });

  it("fails when file already exists", async () => {
    workspace.fs.stat.mockResolvedValue({});

    const result = await newFileTool.execute(
      { path: "existing.txt", content: "data" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("already exists");
  });
});

describe("deleteFileTool", () => {
  it("deletes file when it exists", async () => {
    workspace.fs.stat.mockResolvedValue({});
    workspace.applyEdit.mockResolvedValue(true);

    const result = await deleteFileTool.execute(
      { path: "delete.txt" },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(WorkspaceEdit.lastInstance?.deleteFile).toHaveBeenCalledTimes(1);
  });

  it("fails when file does not exist", async () => {
    workspace.fs.stat.mockRejectedValue(FileSystemError.FileNotFound());

    const result = await deleteFileTool.execute(
      { path: "missing.txt" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
  });
});
