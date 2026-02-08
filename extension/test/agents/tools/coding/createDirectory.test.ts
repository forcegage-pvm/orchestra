/**
 * createDirectory tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDirectoryTool } from "../../../src/agents/tools/coding/createDirectory.js";
import type { ToolInvocationContext } from "../../../src/agents/tools/types.js";
import { validatePath } from "../../../src/agents/tools/utils/pathValidation.js";

const { workspace, Uri } = vi.hoisted(() => {
  const workspace = {
    fs: {
      createDirectory: vi.fn(),
    },
  };

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

  return { workspace, Uri };
});

vi.mock("vscode", () => ({
  workspace,
  Uri,
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
});

describe("createDirectoryTool", () => {
  it("creates directories recursively", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/new-dir",
    });
    workspace.fs.createDirectory.mockResolvedValue(undefined);

    const result = await createDirectoryTool.invoke(
      { path: "new-dir" },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(result.content).toEqual([
      { type: "text", value: "Created directory at new-dir." },
    ]);
    expect(workspace.fs.createDirectory).toHaveBeenCalledTimes(1);
  });
});
