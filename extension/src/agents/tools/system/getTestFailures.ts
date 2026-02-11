/**
 * getTestFailures tool - Retrieve test failure diagnostics
 */

import * as vscode from "vscode";

import { ToolErrorCode } from "../errors.js";
import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

interface GetTestFailuresInput {
  maxItems?: number;
}

interface TestFailureEntry {
  file: string;
  message: string;
  severity: "error" | "warning" | "info" | "hint";
  source?: string;
  code?: string | number;
  range: {
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
  };
}

interface TestFailureOutput {
  total: number;
  failures: TestFailureEntry[];
  truncated: boolean;
}

const TOOL_NAME = "get_test_failures";
const DEFAULT_MAX_ITEMS = 50;

function buildToolResult(partial: Partial<ToolResult>): ToolResult {
  return {
    success: partial.success ?? false,
    content: partial.content ?? [],
    error: partial.error,
    metadata: partial.metadata ?? {
      toolName: TOOL_NAME,
      callId: "",
      durationMs: 0,
    },
  };
}

function formatSeverity(
  severity: vscode.DiagnosticSeverity,
): "error" | "warning" | "info" | "hint" {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return "error";
    case vscode.DiagnosticSeverity.Warning:
      return "warning";
    case vscode.DiagnosticSeverity.Information:
      return "info";
    case vscode.DiagnosticSeverity.Hint:
      return "hint";
    default:
      return "error";
  }
}

function normalizeCode(
  code: vscode.Diagnostic["code"],
): string | number | undefined {
  if (typeof code === "string" || typeof code === "number") {
    return code;
  }
  if (code && typeof code === "object" && "value" in code) {
    const value = (code as { value?: string | number }).value;
    if (typeof value === "string" || typeof value === "number") {
      return value;
    }
  }
  return undefined;
}

export const getTestFailuresTool: AgentTool<GetTestFailuresInput> = {
  name: TOOL_NAME,
  description: "Retrieve test failure diagnostics from the Problems view.",
  inputSchema: {
    type: "object",
    properties: {
      maxItems: {
        type: "number",
        description: "Maximum number of failure entries to return",
      },
    },
  },
  invoke: async (
    input: GetTestFailuresInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => {
    const callId = crypto.randomUUID();
    context.observer?.onProgress?.(callId, "Getting test failures");

    if (context.token.isCancellationRequested) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.CANCELLED,
          "Test failure retrieval cancelled.",
          "Retry after cancellation is cleared.",
        ),
      );
    }

    const maxItems = input.maxItems ?? DEFAULT_MAX_ITEMS;
    const diagnostics = vscode.languages.getDiagnostics();
    const failures: TestFailureEntry[] = [];

    for (const [uri, entries] of diagnostics) {
      for (const entry of entries) {
        if (entry.severity !== vscode.DiagnosticSeverity.Error) {
          continue;
        }

        const code = normalizeCode(entry.code);
        const failureEntry: TestFailureEntry = {
          file: uri.fsPath,
          message: entry.message,
          severity: formatSeverity(entry.severity),
          range: {
            startLine: entry.range.start.line + 1,
            startCharacter: entry.range.start.character + 1,
            endLine: entry.range.end.line + 1,
            endCharacter: entry.range.end.character + 1,
          },
        };
        if (entry.source !== undefined) {
          failureEntry.source = entry.source;
        }
        if (code !== undefined) {
          failureEntry.code = code;
        }
        failures.push(failureEntry);

        if (failures.length >= maxItems) {
          break;
        }
      }
      if (failures.length >= maxItems) {
        break;
      }
    }

    const output: TestFailureOutput = {
      total: failures.length,
      failures,
      truncated: failures.length >= maxItems,
    };

    return buildToolResult(
      successResult(TOOL_NAME, [
        { type: "json", value: JSON.stringify(output, null, 2) },
      ]),
    );
  },
};
