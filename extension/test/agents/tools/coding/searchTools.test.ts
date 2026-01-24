/**
 * Search and navigation tools tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { grepSearchTool } from "../../../../src/agents/tools/coding/grepSearch.js";
import { listDirectoryTool } from "../../../../src/agents/tools/coding/listDirectory.js";
import { searchTool } from "../../../../src/agents/tools/coding/search.js";
import type { ToolContext } from "../../../../src/agents/types.js";

const { workspace, FileSystemError, FileType, Uri } = vi.hoisted(() => {
  const workspace = {
    findFiles: vi.fn(),
    openTextDocument: vi.fn(),
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
    static file(filePath: string): { fsPath: string; path: string } {
      return { fsPath: filePath, path: filePath };
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

function createDocument(content: string) {
  const lines = content.split("\n");

  const lineAt = (line: number) => {
    const text = lines[line] ?? "";
    return {
      text,
    };
  };

  return {
    lineCount: lines.length,
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
});

describe("searchTool", () => {
  it("finds matches within files filtered by includePattern", async () => {
    workspace.findFiles.mockResolvedValue([
      Uri.file("/workspace/src/one.ts"),
      Uri.file("/workspace/src/two.ts"),
    ]);

    workspace.openTextDocument.mockImplementation(async (uri) => {
      if (uri.fsPath.endsWith("one.ts")) {
        return createDocument("alpha\nneedle here\nbeta");
      }
      return createDocument("nothing here");
    });

    const result = await searchTool.execute(
      { query: "needle", includePattern: "src/**/*.ts" },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(workspace.findFiles).toHaveBeenCalledWith("src/**/*.ts");

    const matches = JSON.parse(result.output) as Array<{
      path: string;
      line: number;
      text: string;
    }>;
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({
      path: "src/one.ts",
      line: 2,
      text: "needle here",
    });
  });

  it("respects maxResults", async () => {
    workspace.findFiles.mockResolvedValue([Uri.file("/workspace/src/one.ts")]);
    workspace.openTextDocument.mockResolvedValue(
      createDocument("needle one\nneedle two"),
    );

    const result = await searchTool.execute(
      { query: "needle", maxResults: 1 },
      mockContext,
    );

    const matches = JSON.parse(result.output) as Array<{
      path: string;
      line: number;
      text: string;
    }>;
    expect(matches).toHaveLength(1);
  });
});

describe("grepSearchTool", () => {
  it("performs exact string matching", async () => {
    workspace.findFiles.mockResolvedValue([Uri.file("/workspace/src/app.ts")]);
    workspace.openTextDocument.mockResolvedValue(
      createDocument("alpha\nbeta alpha"),
    );

    const result = await grepSearchTool.execute(
      { query: "alpha", isRegexp: false },
      mockContext,
    );

    expect(result.success).toBe(true);
    const matches = JSON.parse(result.output) as Array<{
      path: string;
      line: number;
      text: string;
    }>;
    expect(matches).toHaveLength(2);
    expect(matches[0].line).toBe(1);
    expect(matches[1].line).toBe(2);
  });

  it("supports regex search", async () => {
    workspace.findFiles.mockResolvedValue([Uri.file("/workspace/src/app.ts")]);
    workspace.openTextDocument.mockResolvedValue(
      createDocument("foo123\nbar"),
    );

    const result = await grepSearchTool.execute(
      { query: "^foo\\d+", isRegexp: true },
      mockContext,
    );

    expect(result.success).toBe(true);
    const matches = JSON.parse(result.output) as Array<{
      path: string;
      line: number;
      text: string;
    }>;
    expect(matches).toHaveLength(1);
    expect(matches[0].line).toBe(1);
  });

  it("filters by includePattern", async () => {
    workspace.findFiles.mockResolvedValue([Uri.file("/workspace/src/app.ts")]);
    workspace.openTextDocument.mockResolvedValue(createDocument("alpha"));

    await grepSearchTool.execute(
      { query: "alpha", includePattern: "src/**/*.ts" },
      mockContext,
    );

    expect(workspace.findFiles).toHaveBeenCalledWith("src/**/*.ts");
  });

  it("returns error on invalid regex", async () => {
    const result = await grepSearchTool.execute(
      { query: "[", isRegexp: true },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid regex");
  });
});

describe("listDirectoryTool", () => {
  it("lists directory contents with trailing slash for folders", async () => {
    workspace.fs.readDirectory.mockResolvedValue([
      ["src", FileType.Directory],
      ["file.txt", FileType.File],
    ]);

    const result = await listDirectoryTool.execute(
      { path: "project" },
      mockContext,
    );

    expect(result.success).toBe(true);
    const lines = result.output.split("\n");
    expect(lines).toContain("src/");
    expect(lines).toContain("file.txt");
  });

  it("handles missing directory", async () => {
    workspace.fs.readDirectory.mockRejectedValue(
      FileSystemError.FileNotFound(),
    );

    const result = await listDirectoryTool.execute(
      { path: "missing" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("File not found");
  });
});
