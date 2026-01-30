/**
 * getTestFailures tool tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTestFailuresTool } from "../../../../src/agents/tools/system/getTestFailures.js";
import type { ToolInvocationContext } from "../../../../src/agents/tools/types.js";

const { languagesApi, DiagnosticSeverity } = vi.hoisted(() => {
  const languagesApi = {
    getDiagnostics: vi.fn(),
  };

  const DiagnosticSeverity = {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
  };

  return { languagesApi, DiagnosticSeverity };
});

vi.mock("vscode", () => ({
  languages: languagesApi,
  DiagnosticSeverity,
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

describe("getTestFailures", () => {
  it("returns diagnostics with error severity", async () => {
    languagesApi.getDiagnostics.mockReturnValue([
      [
        { fsPath: "/workspace/test/sample.test.ts" },
        [
          {
            severity: DiagnosticSeverity.Error,
            message: "Assertion failed",
            source: "vitest",
            code: "TST001",
            range: {
              start: { line: 2, character: 4 },
              end: { line: 2, character: 10 },
            },
          },
          {
            severity: DiagnosticSeverity.Warning,
            message: "Unused variable",
            range: {
              start: { line: 3, character: 0 },
              end: { line: 3, character: 5 },
            },
          },
        ],
      ],
    ]);

    const result = await getTestFailuresTool.invoke({}, mockContext);

    expect(result.success).toBe(true);
    const output = JSON.parse(result.content[0]?.value ?? "{}");
    expect(output.failures).toHaveLength(1);
    expect(output.failures[0]?.message).toBe("Assertion failed");
  });
});
