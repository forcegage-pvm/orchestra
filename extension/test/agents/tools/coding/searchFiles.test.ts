/**
 * searchFiles tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { searchFilesTool } from "../../../../src/agents/tools/coding/searchFiles.js";
import { ToolErrorCode } from "../../../../src/agents/tools/errors.js";
import type {
  ToolInvocationContext,
  ToolResult,
} from "../../../../src/agents/tools/types.js";

const { workspace, Uri } = vi.hoisted(() => {
  const workspace = {
    findFiles: vi.fn(),
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

const mockContext: ToolInvocationContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  token: { isCancellationRequested: false } as ToolInvocationContext["token"],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchFilesTool", () => {
  it("returns matching file paths", async () => {
    workspace.findFiles.mockResolvedValue([
      Uri.file("/workspace/src/one.ts"),
      Uri.file("/workspace/readme.md"),
    ]);

    const result = await searchFilesTool.invoke({ query: "**/*" }, mockContext);

    expect(result.success).toBe(true);
    const matches = JSON.parse(result.content[0]?.value ?? "[]") as string[];
    expect(matches).toEqual(["src/one.ts", "readme.md"]);
  });

  it("passes excludePattern and maxResults to findFiles", async () => {
    workspace.findFiles.mockResolvedValue([Uri.file("/workspace/src/one.ts")]);

    await searchFilesTool.invoke(
      { query: "**/*.ts", excludePattern: "**/node_modules/**", maxResults: 1 },
      mockContext,
    );

    expect(workspace.findFiles).toHaveBeenCalledWith(
      "**/*.ts",
      "**/node_modules/**",
      1,
    );
  });

  it("returns CANCELLED when cancellation is requested", async () => {
    workspace.findFiles.mockResolvedValue([Uri.file("/workspace/src/one.ts")]);

    const result = (await searchFilesTool.invoke(
      { query: "**/*.ts" },
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
