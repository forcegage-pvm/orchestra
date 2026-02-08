/**
 * findUsages tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { findUsagesTool } from "../../../src/agents/tools/coding/findUsages.js";
import {
  ToolErrorCode,
  createToolError,
} from "../../../src/agents/tools/errors.js";
import type {
  ToolInvocationContext,
  ToolResult,
} from "../../../src/agents/tools/types.js";
import { validatePath } from "../../../src/agents/tools/utils/pathValidation.js";

const {
  workspace,
  commands,
  window,
  Uri,
  FileSystemError,
  Position,
  Range,
  Location,
} = vi.hoisted(() => {
  const workspace = {
    openTextDocument: vi.fn(),
  };

  const commands = {
    executeCommand: vi.fn(),
  };

  const window = {
    activeTextEditor: undefined as undefined | { document: unknown },
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
    static file(filePath: string): { fsPath: string; path: string } {
      return { fsPath: filePath, path: filePath };
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

  class Location {
    constructor(
      public uri: { fsPath: string; path: string },
      public range: Range,
    ) {}
  }

  return {
    workspace,
    commands,
    window,
    Uri,
    FileSystemError,
    Position,
    Range,
    Location,
  };
});

vi.mock("vscode", () => ({
  workspace,
  commands,
  window,
  Uri,
  FileSystemError,
  Position,
  Range,
  Location,
}));

vi.mock("../../../src/agents/tools/utils/pathValidation.js", () => ({
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

describe("findUsagesTool", () => {
  it("returns usages from the reference provider", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/src/file.ts",
    });

    const document = {
      uri: Uri.file("/workspace/src/file.ts"),
      getText: () => "symbol",
      positionAt: (index: number) => new Position(0, index),
    };

    workspace.openTextDocument.mockResolvedValue(document);
    commands.executeCommand.mockResolvedValue([
      new Location(
        Uri.file("/workspace/src/file.ts"),
        new Range(new Position(0, 0), new Position(0, 3)),
      ),
    ]);

    const result = await findUsagesTool.invoke(
      {
        symbolName: "symbol",
        filePath: "src/file.ts",
        position: "1:1",
      },
      mockContext,
    );

    expect(result.success).toBe(true);
    const matches = JSON.parse(result.content[0]?.value ?? "[]") as Array<{
      path: string;
      line: number;
      column: number;
      endLine: number;
      endColumn: number;
    }>;
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({
      path: "src/file.ts",
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 4,
    });
  });

  it("returns INVALID_INPUT when symbolName is missing", async () => {
    const result = (await findUsagesTool.invoke(
      { symbolName: "" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
  });

  it("returns PATH_TRAVERSAL when file path validation fails", async () => {
    validatePathMock.mockResolvedValue({
      isValid: false,
      error: createToolError(
        ToolErrorCode.PATH_TRAVERSAL,
        "Path traversal is not allowed",
        "Remove any '..' segments from the path.",
      ),
    });

    const result = (await findUsagesTool.invoke(
      { symbolName: "symbol", filePath: "../file.ts" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.PATH_TRAVERSAL);
  });
});
