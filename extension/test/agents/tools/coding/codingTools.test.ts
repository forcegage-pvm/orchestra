/**
 * Coding tools tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../../../../src/agents/ToolRegistry.js";
import { createFileTool } from "../../../../src/agents/tools/coding/createFile.js";
import { deleteFileTool } from "../../../../src/agents/tools/coding/deleteFile.js";
import {
  codingTools,
  registerCodingTools,
} from "../../../../src/agents/tools/coding/index.js";
import { readFileTool } from "../../../../src/agents/tools/coding/readFile.js";
import { testFailureTool } from "../../../../src/agents/tools/coding/testFailure.js";
import { usagesTool } from "../../../../src/agents/tools/coding/usages.js";
import type { ToolInvocationContext } from "../../../../src/agents/tools/types.js";
import { validatePath } from "../../../../src/agents/tools/utils/pathValidation.js";
import type { ToolContext } from "../../../../src/agents/types.js";

const {
  commands,
  window,
  workspace,
  FileSystemError,
  Position,
  Range,
  WorkspaceEdit,
  Uri,
} = vi.hoisted(() => {
  const commands = {
    executeCommand: vi.fn(),
  };

  const window = {
    activeTextEditor: undefined as { document: unknown } | undefined,
  };

  const workspace = {
    openTextDocument: vi.fn(),
    applyEdit: vi.fn(),
    fs: {
      stat: vi.fn(),
      createDirectory: vi.fn(),
      readFile: vi.fn(),
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
    commands,
    window,
    workspace,
    FileSystemError,
    Position,
    Range,
    WorkspaceEdit,
    Uri,
  };
});

vi.mock("vscode", () => ({
  commands,
  window,
  workspace,
  FileSystemError,
  Position,
  Range,
  WorkspaceEdit,
  Uri,
}));

vi.mock("../../../../src/agents/tools/utils/pathValidation.js", () => ({
  validatePath: vi.fn(),
}));

function createDocument(
  content: string,
  uri: { fsPath: string; path: string } = Uri.file("/workspace/file.txt"),
) {
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
    uri,
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

const mockInvocationContext: ToolInvocationContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  token: {} as ToolInvocationContext["token"],
};

const validatePathMock = vi.mocked(validatePath);

beforeEach(() => {
  vi.clearAllMocks();
  WorkspaceEdit.lastInstance = undefined;
});

describe("readFileTool", () => {
  it("reads full file contents", async () => {
    const content = "alpha\nbeta\ngamma";
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/file.txt",
    });
    workspace.fs.readFile.mockResolvedValue(new TextEncoder().encode(content));

    const result = await readFileTool.invoke(
      { path: "file.txt" },
      mockInvocationContext,
    );

    expect(result.success).toBe(true);
    expect(result.content).toEqual([{ type: "text", value: content }]);
  });

  it("handles missing file", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/missing.txt",
    });
    workspace.fs.readFile.mockRejectedValue(FileSystemError.FileNotFound());

    const result = await readFileTool.invoke(
      { path: "missing.txt" },
      mockInvocationContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FILE_NOT_FOUND");
  });
});

describe("createFileTool", () => {
  it("creates file when it does not exist", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/new.txt",
    });
    workspace.fs.stat.mockRejectedValue(FileSystemError.FileNotFound());
    workspace.fs.createDirectory.mockResolvedValue(undefined);
    workspace.applyEdit.mockResolvedValue(true);

    const result = await createFileTool.invoke(
      { path: "new.txt", content: "data" },
      mockInvocationContext,
    );

    expect(result.success).toBe(true);
    expect(workspace.fs.createDirectory).toHaveBeenCalledTimes(1);
    expect(WorkspaceEdit.lastInstance?.createFile).toHaveBeenCalledTimes(1);
  });

  it("fails when file already exists", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/existing.txt",
    });
    workspace.fs.stat.mockResolvedValue({});

    const result = await createFileTool.invoke(
      { path: "existing.txt", content: "data" },
      mockInvocationContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("FILE_EXISTS");
  });
});

describe("deleteFileTool", () => {
  it("deletes file when it exists", async () => {
    workspace.fs.stat.mockResolvedValue({});
    workspace.fs.readFile.mockResolvedValue(Buffer.from("delete me"));
    workspace.applyEdit.mockResolvedValue(true);

    const result = await deleteFileTool.execute(
      { path: "delete.txt" },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(WorkspaceEdit.lastInstance?.deleteFile).toHaveBeenCalledTimes(1);
  });

  it("tracks changes when fileTracker is present", async () => {
    workspace.fs.stat.mockResolvedValue({});
    workspace.fs.readFile.mockResolvedValue(Buffer.from("delete me"));
    workspace.applyEdit.mockResolvedValue(true);
    const fileTracker = { trackChange: vi.fn() };

    const result = await deleteFileTool.execute(
      { path: "delete.txt" },
      { ...mockContext, fileTracker },
    );

    expect(result.success).toBe(true);
    expect(fileTracker.trackChange).toHaveBeenCalledTimes(1);
    expect(fileTracker.trackChange).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringMatching(/delete\.txt$/),
        relativePath: "delete.txt",
        operation: "delete",
        previousContent: "delete me",
        newContent: null,
        previousContentHash: expect.any(String),
        newContentHash: null,
        iteration: 0,
        toolCallId: expect.any(String),
        timestamp: expect.any(String),
      }),
    );
  });

  it("does not track changes when applyEdit fails", async () => {
    workspace.fs.stat.mockResolvedValue({});
    workspace.fs.readFile.mockResolvedValue(Buffer.from("delete me"));
    workspace.applyEdit.mockResolvedValue(false);
    const fileTracker = { trackChange: vi.fn() };

    const result = await deleteFileTool.execute(
      { path: "delete.txt" },
      { ...mockContext, fileTracker },
    );

    expect(result.success).toBe(false);
    expect(fileTracker.trackChange).not.toHaveBeenCalled();
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

describe("usagesTool", () => {
  it("finds usages using reference provider", async () => {
    const content = "const foo = 1;\nconsole.log(foo);";
    const uri = Uri.file("/workspace/src/example.ts");
    workspace.openTextDocument.mockResolvedValue(createDocument(content, uri));

    const references = [
      {
        uri: Uri.file("/workspace/src/example.ts"),
        range: new Range(new Position(0, 6), new Position(0, 9)),
      },
    ];
    commands.executeCommand.mockResolvedValue(references);

    const result = await usagesTool.execute(
      { symbolName: "foo", filePath: "src/example.ts" },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(commands.executeCommand).toHaveBeenCalledTimes(1);
    expect(commands.executeCommand).toHaveBeenCalledWith(
      "vscode.executeReferenceProvider",
      uri,
      expect.any(Position),
    );

    const position = commands.executeCommand.mock.calls[0]?.[2] as Position;
    expect(position.line).toBe(0);
    expect(position.character).toBe(6);

    const locations = JSON.parse(result.output) as Array<{
      path: string;
      line: number;
      column: number;
      endLine: number;
      endColumn: number;
    }>;
    expect(locations).toHaveLength(1);
    expect(locations[0]).toEqual({
      path: "src/example.ts",
      line: 1,
      column: 7,
      endLine: 1,
      endColumn: 10,
    });
  });

  it("returns error when symbol is missing", async () => {
    const content = "const bar = 1;";
    const uri = Uri.file("/workspace/src/example.ts");
    workspace.openTextDocument.mockResolvedValue(createDocument(content, uri));

    const result = await usagesTool.execute(
      { symbolName: "foo", filePath: "src/example.ts" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Symbol not found");
  });
});

describe("testFailureTool", () => {
  it("parses test failures from output file", async () => {
    const output = [
      "FAIL  src/math.test.ts > Math > adds numbers",
      "AssertionError: expected 2 to be 3",
      "Expected: 3",
      "Received: 2",
      "at src/math.test.ts:10:5",
    ].join("\n");

    workspace.openTextDocument.mockResolvedValue(createDocument(output));

    const result = await testFailureTool.execute({}, mockContext);

    expect(result.success).toBe(true);
    const failures = JSON.parse(result.output) as Array<{
      testName?: string;
      message?: string;
      expected?: string;
      actual?: string;
      file?: string;
      line?: number;
      column?: number;
    }>;

    expect(failures).toHaveLength(1);
    expect(failures[0]).toEqual({
      testName: "src/math.test.ts > Math > adds numbers",
      message: "expected 2 to be 3",
      expected: "3",
      actual: "2",
      file: "src/math.test.ts",
      line: 10,
      column: 5,
    });
  });

  it("handles missing output file", async () => {
    workspace.openTextDocument.mockRejectedValue(
      FileSystemError.FileNotFound(),
    );

    const result = await testFailureTool.execute({}, mockContext);

    expect(result.success).toBe(false);
    expect(result.error).toContain("File not found");
  });
});

describe("registerCodingTools", () => {
  it("registers all coding tools", () => {
    const registry = new ToolRegistry();

    registerCodingTools(registry);

    expect(registry.list()).toHaveLength(9);
    const registeredNames = registry.names().sort();
    const expectedNames = codingTools.map((tool) => tool.name).sort();
    expect(registeredNames).toEqual(expectedNames);
  });
});
