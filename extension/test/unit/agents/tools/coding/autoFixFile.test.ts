/**
 * autoFixFile tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { autoFixFileTool } from "../../../../../src/agents/tools/coding/autoFixFile.js";
import type { ToolInvocationContext } from "../../../../../src/agents/tools/types.js";
import { applyAutoFixes, formatAutoFixSummary } from "../../../../../src/agents/tools/utils/autofix.js";
import { getDiagnosticsForFile, formatDiagnosticsSummary } from "../../../../../src/agents/tools/utils/diagnostics.js";
import { validatePath } from "../../../../../src/agents/tools/utils/pathValidation.js";

const { workspace, Uri } = vi.hoisted(() => {
  const workspace = {
    openTextDocument: vi.fn(),
    applyEdit: vi.fn(),
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

vi.mock("../../../../../src/agents/tools/utils/pathValidation.js", () => ({
  validatePath: vi.fn(),
}));

vi.mock("../../../../../src/agents/tools/utils/autofix.js", () => ({
  applyAutoFixes: vi.fn(),
  formatAutoFixSummary: vi.fn(),
}));

vi.mock("../../../../../src/agents/tools/utils/diagnostics.js", () => ({
  getDiagnosticsForFile: vi.fn(),
  formatDiagnosticsSummary: vi.fn(),
}));

const mockContext: ToolInvocationContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  token: {} as ToolInvocationContext["token"],
};

const validatePathMock = vi.mocked(validatePath);
const applyAutoFixesMock = vi.mocked(applyAutoFixes);
const formatAutoFixSummaryMock = vi.mocked(formatAutoFixSummary);
const getDiagnosticsForFileMock = vi.mocked(getDiagnosticsForFile);
const formatDiagnosticsSummaryMock = vi.mocked(formatDiagnosticsSummary);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("autoFixFileTool", () => {
  it("should have name auto_fix_file", () => {
    expect(autoFixFileTool.name).toBe("auto_fix_file");
  });

  it("should validate path before applying fixes", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/file.ts",
    });

    applyAutoFixesMock.mockResolvedValue({
      applied: true,
      actionsApplied: 1,
      actionDescriptions: ["[source.fixAll] Fix lint"],
      kindsWithNoActions: [],
      errors: [],
    });
    formatAutoFixSummaryMock.mockReturnValue("🔧 Auto-fix: 1 action(s) applied");

    getDiagnosticsForFileMock.mockResolvedValue({
      totalCount: 0,
      errorCount: 0,
      warningCount: 0,
      hasErrors: false,
      diagnostics: [],
    });
    formatDiagnosticsSummaryMock.mockReturnValue(null);

    const result = await autoFixFileTool.invoke(
      { path: "file.ts" },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(validatePathMock).toHaveBeenCalledWith("file.ts", "/workspace");
    expect(applyAutoFixesMock).toHaveBeenCalled();
  });

  it("should return error on invalid path", async () => {
    validatePathMock.mockResolvedValue({
      isValid: false,
      error: {
        code: "PATH_TRAVERSAL",
        message: "Path traversal detected",
      },
    });

    const result = await autoFixFileTool.invoke(
      { path: "../etc/passwd" },
      mockContext,
    );

    expect(result.success).toBe(false);
    expect(result.content[0]).toEqual(
      expect.objectContaining({ type: "error" }),
    );
    expect(applyAutoFixesMock).not.toHaveBeenCalled();
  });

  it("should report applied actions in result", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/file.ts",
    });

    applyAutoFixesMock.mockResolvedValue({
      applied: true,
      actionsApplied: 2,
      actionDescriptions: [
        "[source.fixAll] Fix lint",
        "[source.organizeImports] Organize imports",
      ],
      kindsWithNoActions: [],
      errors: [],
    });
    formatAutoFixSummaryMock.mockReturnValue(
      "🔧 Auto-fix: 2 action(s) applied:\n  • [source.fixAll] Fix lint\n  • [source.organizeImports] Organize imports",
    );

    getDiagnosticsForFileMock.mockResolvedValue({
      totalCount: 0,
      errorCount: 0,
      warningCount: 0,
      hasErrors: false,
      diagnostics: [],
    });
    formatDiagnosticsSummaryMock.mockReturnValue(null);

    const result = await autoFixFileTool.invoke(
      { path: "file.ts" },
      mockContext,
    );

    expect(result.success).toBe(true);
    const textValues = result.content.map((c) => c.value).join("\n");
    expect(textValues).toContain("2 action(s) applied");
  });

  it("should report remaining diagnostics", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/file.ts",
    });

    applyAutoFixesMock.mockResolvedValue({
      applied: false,
      actionsApplied: 0,
      actionDescriptions: [],
      kindsWithNoActions: ["source.fixAll", "source.organizeImports"],
      errors: [],
    });
    formatAutoFixSummaryMock.mockReturnValue(null);

    getDiagnosticsForFileMock.mockResolvedValue({
      totalCount: 2,
      errorCount: 1,
      warningCount: 1,
      hasErrors: true,
      diagnostics: [],
    });
    formatDiagnosticsSummaryMock.mockReturnValue(
      "❌ 1 error, 1 warning found after edit",
    );

    const result = await autoFixFileTool.invoke(
      { path: "file.ts" },
      mockContext,
    );

    expect(result.success).toBe(true);
    const textValues = result.content.map((c) => c.value).join("\n");
    expect(textValues).toContain("No auto-fixes available");
    expect(textValues).toContain("1 error, 1 warning");
  });

  it("should handle no fixes available", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/file.ts",
    });

    applyAutoFixesMock.mockResolvedValue({
      applied: false,
      actionsApplied: 0,
      actionDescriptions: [],
      kindsWithNoActions: ["source.fixAll", "source.organizeImports"],
      errors: [],
    });
    formatAutoFixSummaryMock.mockReturnValue(null);

    getDiagnosticsForFileMock.mockResolvedValue({
      totalCount: 0,
      errorCount: 0,
      warningCount: 0,
      hasErrors: false,
      diagnostics: [],
    });
    formatDiagnosticsSummaryMock.mockReturnValue(null);

    const result = await autoFixFileTool.invoke(
      { path: "file.ts" },
      mockContext,
    );

    expect(result.success).toBe(true);
    const textValues = result.content.map((c) => c.value).join("\n");
    expect(textValues).toContain("No auto-fixes available");
    expect(textValues).toContain("No remaining diagnostics");
  });

  it("should skip diagnostics when reportDiagnostics is false", async () => {
    validatePathMock.mockResolvedValue({
      isValid: true,
      absolutePath: "/workspace/file.ts",
    });

    applyAutoFixesMock.mockResolvedValue({
      applied: false,
      actionsApplied: 0,
      actionDescriptions: [],
      kindsWithNoActions: ["source.fixAll", "source.organizeImports"],
      errors: [],
    });
    formatAutoFixSummaryMock.mockReturnValue(null);

    const result = await autoFixFileTool.invoke(
      { path: "file.ts", reportDiagnostics: false },
      mockContext,
    );

    expect(result.success).toBe(true);
    expect(getDiagnosticsForFileMock).not.toHaveBeenCalled();
  });
});
