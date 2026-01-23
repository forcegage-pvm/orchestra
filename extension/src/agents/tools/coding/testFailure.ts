/**
 * testFailure tool - Parse test output and return structured failures
 */

import * as path from "path";
import * as vscode from "vscode";
import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";

interface TestFailureInput {
  path?: string;
}

interface TestFailureRecord {
  testName?: string;
  message?: string;
  expected?: string;
  actual?: string;
  file?: string;
  line?: number;
  column?: number;
}

function getAbsolutePath(workspaceRoot: string, filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(workspaceRoot, filePath);
}

function normalizePath(workspaceRoot: string, filePath: string): string {
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(workspaceRoot, filePath);
  const relative = path.relative(workspaceRoot, absolute);
  const normalizedRelative = relative.split(path.sep).join("/");
  const normalizedAbsolute = absolute.split(path.sep).join("/");
  return normalizedRelative.length > 0 ? normalizedRelative : normalizedAbsolute;
}

function pushFailure(
  failures: TestFailureRecord[],
  current: TestFailureRecord | null,
): void {
  if (current &&
    (current.testName ||
      current.message ||
      current.expected ||
      current.actual ||
      current.file)
  ) {
    failures.push(current);
  }
}

function parseExpectedActual(
  line: string,
  current: TestFailureRecord,
): void {
  const expectedMatch = line.match(/^Expected:\s*(.*)$/);
  if (expectedMatch) {
    current.expected = expectedMatch[1]?.trim();
    return;
  }

  const receivedMatch = line.match(/^Received:\s*(.*)$/);
  if (receivedMatch) {
    current.actual = receivedMatch[1]?.trim();
    return;
  }

  const inlineMatch = line.match(/expected\s+(.*)\s+to\s+be\s+(.*)/i);
  if (inlineMatch) {
    current.actual = inlineMatch[1]?.trim();
    current.expected = inlineMatch[2]?.trim();
  }
}

function parseTestFailures(
  output: string,
  workspaceRoot: string,
): TestFailureRecord[] {
  const failures: TestFailureRecord[] = [];
  const lines = output.split(/\r?\n/);
  let current: TestFailureRecord | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      continue;
    }

    const failMatch = line.match(/^FAIL\s+(.*)$/);
    if (failMatch) {
      pushFailure(failures, current);
      current = {
        testName: failMatch[1]?.trim(),
      };
      continue;
    }

    const testNameMatch = line.match(/^(?:✕|×)\s+(.*)$/);
    if (testNameMatch) {
      if (!current) {
        current = {};
      }
      current.testName = testNameMatch[1]?.trim();
      continue;
    }

    const messageMatch = line.match(/^(?:AssertionError|Error|TypeError):\s*(.*)$/);
    if (messageMatch) {
      if (!current) {
        current = {};
      }
      current.message = messageMatch[1]?.trim();
      continue;
    }

    parseExpectedActual(line, current ?? (current = {}));

    const locationMatch = line.match(
      /(?:at\s+)?(.+\.(?:ts|tsx|js|jsx|mjs|cjs)):(\d+):(\d+)/,
    );
    if (locationMatch) {
      if (!current) {
        current = {};
      }
      current.file = normalizePath(workspaceRoot, locationMatch[1]);
      current.line = Number.parseInt(locationMatch[2] ?? "", 10);
      current.column = Number.parseInt(locationMatch[3] ?? "", 10);
    }
  }

  pushFailure(failures, current);
  return failures;
}

export const testFailureTool: AgentTool = {
  name: "test_failure",
  description:
    "Parse test output and return structured test failure details.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Optional path to test output file (default: test-output.txt)",
      },
    },
  },
  execute: async (
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    try {
      const parsed = input as TestFailureInput;
      const filePath = parsed.path ?? "test-output.txt";
      const absolutePath = getAbsolutePath(context.workspaceRoot, filePath);
      const uri = vscode.Uri.file(absolutePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const output = document.getText();

      const failures = parseTestFailures(output, context.workspaceRoot);

      return {
        success: true,
        output: JSON.stringify(failures, null, 2),
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown error reading test output";
      return {
        success: false,
        output: "",
        error: `Failed to read test output: ${message}`,
      };
    }
  },
};
