/**
 * getProblems tool tests
 */

import * as path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getProblemsTool } from "../../../../src/agents/tools/system/getProblems.js";
import type { ToolInvocationContext } from "../../../../src/agents/tools/types.js";

const { languagesApi, DiagnosticSeverity, Uri } = vi.hoisted(() => {
  const languagesApi = {
    getDiagnostics: vi.fn(),
  };

  const DiagnosticSeverity = {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
  };

  const Uri = {
    file: (fsPath: string) => ({ fsPath }),
  };

  return { languagesApi, DiagnosticSeverity, Uri };
});

vi.mock("vscode", () => ({
  languages: languagesApi,
  DiagnosticSeverity,
  Uri,
}));

function createToken(): ToolInvocationContext["token"] {
  return {
    isCancellationRequested: false,
    onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })),
  } as ToolInvocationContext["token"];
}

const mockContext: ToolInvocationContext = {
  workspaceRoot: "/workspace",
  sessionId: "session",
  token: createToken(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getProblems", () => {
  it("filters diagnostics by filePaths array and uses 1-based positions", async () => {
    const expectedPath = path.resolve(mockContext.workspaceRoot, "src/app.ts");
    const diagnostics = [
      {
        severity: DiagnosticSeverity.Error,
        message: "Missing semicolon",
        source: "ts",
        code: "TS1005",
        range: {
          start: { line: 0, character: 1 },
          end: { line: 0, character: 2 },
        },
      },
    ];

    languagesApi.getDiagnostics.mockImplementation(
      (uri?: { fsPath: string }) => {
        if (uri?.fsPath === expectedPath) {
          return diagnostics;
        }
        return [];
      },
    );

    const result = await getProblemsTool.invoke(
      { filePaths: ["src/app.ts"] },
      mockContext,
    );

    expect(result.success).toBe(true);
    const output = JSON.parse(result.content[0]?.value ?? "{}");
    expect(output.files).toHaveLength(1);
    expect(output.files[0]?.file).toBe(expectedPath);
    expect(output.files[0]?.diagnostics).toHaveLength(1);
    expect(output.files[0]?.diagnostics[0]?.line).toBe(1);
    expect(output.files[0]?.diagnostics[0]?.column).toBe(2);
  });

  it("checks multiple files when filePaths array has multiple entries", async () => {
    const path1 = path.resolve(mockContext.workspaceRoot, "src/one.ts");
    const path2 = path.resolve(mockContext.workspaceRoot, "src/two.ts");

    languagesApi.getDiagnostics.mockImplementation(
      (uri?: { fsPath: string }) => {
        if (uri?.fsPath === path1) {
          return [
            {
              severity: DiagnosticSeverity.Error,
              message: "Error in file one",
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 5 },
              },
            },
          ];
        }
        if (uri?.fsPath === path2) {
          return [
            {
              severity: DiagnosticSeverity.Warning,
              message: "Warning in file two",
              range: {
                start: { line: 1, character: 0 },
                end: { line: 1, character: 10 },
              },
            },
          ];
        }
        return [];
      },
    );

    const result = await getProblemsTool.invoke(
      { filePaths: ["src/one.ts", "src/two.ts"] },
      mockContext,
    );

    expect(result.success).toBe(true);
    const output = JSON.parse(result.content[0]?.value ?? "{}");
    expect(output.files).toHaveLength(2);
    expect(output.totalDiagnostics).toBe(2);
    expect(output.files[0]?.diagnostics[0]?.message).toBe("Error in file one");
    expect(output.files[1]?.diagnostics[0]?.message).toBe(
      "Warning in file two",
    );
  });

  it("filters diagnostics by severity", async () => {
    languagesApi.getDiagnostics.mockReturnValue([
      [
        { fsPath: "/workspace/src/one.ts" },
        [
          {
            severity: DiagnosticSeverity.Error,
            message: "Type error",
            range: {
              start: { line: 1, character: 0 },
              end: { line: 1, character: 4 },
            },
          },
          {
            severity: DiagnosticSeverity.Warning,
            message: "Unused variable",
            range: {
              start: { line: 2, character: 0 },
              end: { line: 2, character: 5 },
            },
          },
        ],
      ],
    ]);

    const result = await getProblemsTool.invoke(
      { severity: "warning" },
      mockContext,
    );

    expect(result.success).toBe(true);
    const output = JSON.parse(result.content[0]?.value ?? "{}");
    expect(output.totalDiagnostics).toBe(1);
    expect(output.files[0]?.diagnostics).toHaveLength(1);
    expect(output.files[0]?.diagnostics[0]?.severity).toBe("warning");
  });

  it("returns empty output when no diagnostics exist", async () => {
    languagesApi.getDiagnostics.mockReturnValue([]);

    const result = await getProblemsTool.invoke({}, mockContext);

    expect(result.success).toBe(true);
    const output = JSON.parse(result.content[0]?.value ?? "{}");
    expect(output.files).toHaveLength(0);
    expect(output.totalDiagnostics).toBe(0);
  });
});
