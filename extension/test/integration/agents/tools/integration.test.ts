/**
 * Integration tests for agent tools workflows
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { editFileTool } from "../../../../src/agents/tools/coding/editFile.js";
import { readFileTool } from "../../../../src/agents/tools/coding/readFile.js";
import { getTerminalOutputTool } from "../../../../src/agents/tools/system/getTerminalOutput.js";
import { runTerminalTool } from "../../../../src/agents/tools/system/runTerminal.js";
import type { ToolInvocationContext } from "../../../../src/agents/tools/types.js";
import { validatePath } from "../../../../src/agents/tools/utils/pathValidation.js";
import {
  clearBufferedOutput,
  setBufferedOutput,
} from "../../../../src/agents/tools/utils/shellIntegration.js";

const {
  workspace,
  window,
  Range,
  Position,
  WorkspaceEdit,
  Uri,
  FileSystemError,
  executeInTerminalMock,
  terminal,
} = vi.hoisted(() => {
  const executeInTerminalMock = vi.fn();

  const workspace = {
    fs: {
      readFile: vi.fn(),
    },
    openTextDocument: vi.fn(),
    applyEdit: vi.fn(),
  };

  const terminal = {
    name: "Orchestra Terminal",
    show: vi.fn(),
    sendText: vi.fn(),
  };

  const window = {
    terminals: [] as (typeof terminal)[],
    createTerminal: vi.fn(() => terminal),
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
    window,
    Range,
    Position,
    WorkspaceEdit,
    Uri,
    FileSystemError,
    executeInTerminalMock,
    terminal,
  };
});

vi.mock("vscode", () => ({
  workspace,
  window,
  Range,
  Position,
  WorkspaceEdit,
  Uri,
  FileSystemError,
}));

vi.mock("../../../../src/agents/tools/utils/pathValidation.js", () => ({
  validatePath: vi.fn(),
}));

vi.mock("../../../../src/agents/tools/utils/shellIntegration.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../src/agents/tools/utils/shellIntegration.js")
  >("../../../../src/agents/tools/utils/shellIntegration.js");

  return {
    ...actual,
    executeInTerminal: (...args: unknown[]) => executeInTerminalMock(...args),
  };
});

const mockContext: ToolInvocationContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  token: { isCancellationRequested: false } as ToolInvocationContext["token"],
};

const validatePathMock = vi.mocked(validatePath);

function getLineStarts(content: string): number[] {
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
  return lineStarts;
}

function createDocument(content: string) {
  const lineStarts = getLineStarts(content);

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

function positionToOffset(content: string, position: InstanceType<typeof Position>): number {
  const lineStarts = getLineStarts(content);
  const lineStart = lineStarts[position.line] ?? content.length;
  return Math.min(lineStart + position.character, content.length);
}

beforeEach(() => {
  vi.clearAllMocks();
  WorkspaceEdit.lastInstance = undefined;
  window.terminals = [] as (typeof terminal)[];
  clearBufferedOutput("Orchestra Terminal");
});

describe("agent tool integration workflows", () => {
  it("runs readFile → editFile → readFile workflow", async () => {
    let currentContent = "hello world";

    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/file.txt",
    });

    workspace.fs.readFile.mockImplementation(async () => {
      return new TextEncoder().encode(currentContent);
    });

    workspace.openTextDocument.mockImplementation(async () => {
      return createDocument(currentContent);
    });

    workspace.applyEdit.mockImplementation(async () => {
      const replaceCall = WorkspaceEdit.lastInstance?.replace.mock.calls[0];
      if (!replaceCall) {
        return false;
      }

      const range = replaceCall[1] as InstanceType<typeof Range>;
      const newText = replaceCall[2] as string;
      const startOffset = positionToOffset(currentContent, range.start);
      const endOffset = positionToOffset(currentContent, range.end);
      currentContent =
        currentContent.slice(0, startOffset) +
        newText +
        currentContent.slice(endOffset);
      return true;
    });

    const readResult = await readFileTool.invoke(
      { path: "file.txt" },
      mockContext,
    );

    expect(readResult.success).toBe(true);
    expect(readResult.content).toEqual([
      { type: "text", value: "hello world" },
    ]);

    const editResult = await editFileTool.invoke(
      { path: "file.txt", oldString: "world", newString: "there" },
      mockContext,
    );

    expect(editResult.success).toBe(true);

    const verifyResult = await readFileTool.invoke(
      { path: "file.txt" },
      mockContext,
    );

    expect(verifyResult.success).toBe(true);
    expect(verifyResult.content).toEqual([
      { type: "text", value: "hello there" },
    ]);
  });

  it("runs runTerminal → getTerminalOutput workflow", async () => {
    executeInTerminalMock.mockImplementation(async (toolTerminal: typeof terminal) => {
      setBufferedOutput(toolTerminal.name, "ok");
      return {
        output: "ok",
        exitCode: 0,
        terminalId: toolTerminal.name,
        usedShellIntegration: true,
      };
    });

    const runResult = await runTerminalTool.invoke(
      { command: "echo ok" },
      mockContext,
    );

    expect(runResult.success).toBe(true);
    expect(runResult.content).toEqual([{ type: "text", value: "ok" }]);

    const outputResult = await getTerminalOutputTool.invoke(
      { terminalId: "Orchestra Terminal" },
      mockContext,
    );

    expect(outputResult.success).toBe(true);
    expect(outputResult.content).toEqual([{ type: "text", value: "ok" }]);
  });
});
