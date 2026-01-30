/**
 * grepSearch tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { grepSearchTool } from "../../../../src/agents/tools/coding/grepSearch.js";
import { ToolErrorCode } from "../../../../src/agents/tools/errors.js";
import type {
  ToolInvocationContext,
  ToolResult,
} from "../../../../src/agents/tools/types.js";

const { workspace, Uri } = vi.hoisted(() => {
  const workspace = {
    findFiles: vi.fn(),
    openTextDocument: vi.fn(),
  };

  class Uri {
    static file(filePath: string): { fsPath: string; path: string } {
      return { fsPath: filePath, path: filePath };
    }
  }

  return {
    workspace,
    Uri,
  };
});

vi.mock("vscode", () => ({
  workspace,
  Uri,
}));

function createDocument(content: string) {
  const lines = content.split("\n");

  const lineAt = (line: number) => {
    const text = lines[line] ?? "";
    return { text };
  };

  return {
    lineCount: lines.length,
    lineAt,
  };
}

const mockContext: ToolInvocationContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  token: { isCancellationRequested: false } as ToolInvocationContext["token"],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("grepSearchTool", () => {
  it("performs exact string matching", async () => {
    workspace.findFiles.mockResolvedValue([Uri.file("/workspace/src/app.ts")]);
    workspace.openTextDocument.mockResolvedValue(
      createDocument("alpha\nbeta alpha"),
    );

    const result = await grepSearchTool.invoke(
      { query: "alpha", isRegexp: false },
      mockContext,
    );

    expect(result.success).toBe(true);
    const matches = JSON.parse(result.content[0]?.value ?? "[]") as Array<{
      path: string;
      line: number;
      text: string;
    }>;
    expect(matches).toHaveLength(2);
    expect(matches[0]?.line).toBe(1);
    expect(matches[1]?.line).toBe(2);
  });

  it("supports regex search", async () => {
    workspace.findFiles.mockResolvedValue([Uri.file("/workspace/src/app.ts")]);
    workspace.openTextDocument.mockResolvedValue(createDocument("foo123\nbar"));

    const result = await grepSearchTool.invoke(
      { query: "^foo\\d+", isRegexp: true },
      mockContext,
    );

    expect(result.success).toBe(true);
    const matches = JSON.parse(result.content[0]?.value ?? "[]") as Array<{
      path: string;
      line: number;
      text: string;
    }>;
    expect(matches).toHaveLength(1);
    expect(matches[0]?.line).toBe(1);
  });

  it("returns INVALID_INPUT on invalid regex", async () => {
    const result = (await grepSearchTool.invoke(
      { query: "[", isRegexp: true },
      mockContext,
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.INVALID_INPUT);
  });

  it("returns CANCELLED when cancellation is requested", async () => {
    workspace.findFiles.mockResolvedValue([Uri.file("/workspace/src/app.ts")]);
    workspace.openTextDocument.mockResolvedValue(createDocument("alpha"));

    const result = (await grepSearchTool.invoke(
      { query: "alpha" },
      {
        ...mockContext,
        token: {
          isCancellationRequested: true,
        } as ToolInvocationContext["token"],
      },
    )) as ToolResult;

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe(ToolErrorCode.CANCELLED);
  });
});
