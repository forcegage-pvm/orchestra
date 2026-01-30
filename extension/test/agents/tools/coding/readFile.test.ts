/**
 * readFile tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { readFileTool } from "../../../../src/agents/tools/coding/readFile.js";
import {
  ToolErrorCode,
  createToolError,
} from "../../../../src/agents/tools/errors.js";
import type {
  ToolInvocationContext,
  ToolResult,
} from "../../../../src/agents/tools/types.js";
import { validatePath } from "../../../../src/agents/tools/utils/pathValidation.js";

const { workspace, Uri, FileSystemError } = vi.hoisted(() => {
  const workspace = {
    fs: {
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
    Uri,
    FileSystemError,
  };
});

vi.mock("vscode", () => ({
  workspace,
  Uri,
  FileSystemError,
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

describe("readFileTool", () => {
  it("reads file contents successfully", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/file.txt",
    });
    workspace.fs.readFile.mockResolvedValue(
      new TextEncoder().encode("hello world"),
    );

    const result = await readFileTool.invoke({ path: "file.txt" }, mockContext);

    expect(result.success).toBe(true);
    expect(result.content).toEqual([{ type: "text", value: "hello world" }]);
    expect(result.metadata.toolName).toBe("read_file");
    expect(result.metadata.outputTruncated).toBeUndefined();
  });

  it("returns FILE_NOT_FOUND when file does not exist", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/missing.txt",
    });
    workspace.fs.readFile.mockRejectedValue(FileSystemError.FileNotFound());

    const result = await readFileTool.invoke(
      { path: "missing.txt" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.FILE_NOT_FOUND);
    expect(result.error?.suggestion).toBe(
      "Ensure the path is correct or create the file first.",
    );
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

    const result = (await readFileTool.invoke(
      { path: "../file.txt" },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.PATH_TRAVERSAL);
    expect(workspace.fs.readFile).not.toHaveBeenCalled();
  });

  it("truncates large files and returns warning", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/large.txt",
    });
    const maxBytes = 1024 * 1024;
    const content = "a".repeat(maxBytes + 10);
    workspace.fs.readFile.mockResolvedValue(new TextEncoder().encode(content));

    const result = await readFileTool.invoke(
      { path: "large.txt" },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(result.metadata.outputTruncated).toBe(true);
    expect(result.metadata.warnings).toEqual([
      "File exceeds 1MB. Content truncated. Consider using startLine/endLine parameters.",
    ]);
    expect(result.content[0]?.value.length).toBe(maxBytes);
  });

  it("returns BINARY_FILE for binary content", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/binary.bin",
    });
    workspace.fs.readFile.mockResolvedValue(new Uint8Array([0, 1, 2, 3]));

    const result = await readFileTool.invoke(
      { path: "binary.bin" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.BINARY_FILE);
    expect(result.error?.suggestion).toBe(
      "This appears to be a binary file. Use appropriate binary file handling.",
    );
  });

  it("returns only requested line range", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/range.txt",
    });
    const content = Array.from(
      { length: 20 },
      (_, index) => `line ${index + 1}`,
    ).join("\n");
    workspace.fs.readFile.mockResolvedValue(new TextEncoder().encode(content));

    const result = await readFileTool.invoke(
      { path: "range.txt", startLine: 5, endLine: 10 },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(result.content).toEqual([
      {
        type: "text",
        value: "line 5\nline 6\nline 7\nline 8\nline 9\nline 10",
      },
    ]);
  });

  it("reads from startLine to end when endLine omitted", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/start-only.txt",
    });
    const content = ["line 1", "line 2", "line 3", "line 4"].join("\n");
    workspace.fs.readFile.mockResolvedValue(new TextEncoder().encode(content));

    const result = await readFileTool.invoke(
      { path: "start-only.txt", startLine: 2 },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(result.content).toEqual([
      { type: "text", value: "line 2\nline 3\nline 4" },
    ]);
  });

  it("reads from beginning to endLine when startLine omitted", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/end-only.txt",
    });
    const content = ["line 1", "line 2", "line 3", "line 4"].join("\n");
    workspace.fs.readFile.mockResolvedValue(new TextEncoder().encode(content));

    const result = await readFileTool.invoke(
      { path: "end-only.txt", endLine: 3 },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(result.content).toEqual([
      { type: "text", value: "line 1\nline 2\nline 3" },
    ]);
  });

  it("returns INVALID_RANGE when startLine is greater than endLine", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/invalid-range.txt",
    });
    const content = ["line 1", "line 2", "line 3"].join("\n");
    workspace.fs.readFile.mockResolvedValue(new TextEncoder().encode(content));

    const result = await readFileTool.invoke(
      { path: "invalid-range.txt", startLine: 3, endLine: 2 },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.INVALID_RANGE);
  });

  it("returns INVALID_RANGE when line number is less than 1", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/invalid-line.txt",
    });
    const content = ["line 1", "line 2", "line 3"].join("\n");
    workspace.fs.readFile.mockResolvedValue(new TextEncoder().encode(content));

    const result = await readFileTool.invoke(
      { path: "invalid-line.txt", startLine: 0 },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.INVALID_RANGE);
  });

  it("returns INVALID_RANGE when line number exceeds file length", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/too-far.txt",
    });
    const content = ["line 1", "line 2", "line 3"].join("\n");
    workspace.fs.readFile.mockResolvedValue(new TextEncoder().encode(content));

    const result = await readFileTool.invoke(
      { path: "too-far.txt", startLine: 4 },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.INVALID_RANGE);
  });
});
