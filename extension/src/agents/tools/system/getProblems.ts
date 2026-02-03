/**
 * getProblems tool - Retrieve VS Code diagnostic problems
 */

import * as path from "path";
import * as vscode from "vscode";

import { ToolErrorCode } from "../errors.js";
import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

export type SeverityLabel = "error" | "warning" | "info" | "hint";

export interface GetProblemsInput {
  filePath?: string;
  severity?: SeverityLabel;
}

interface ProblemDiagnostic {
  message: string;
  severity: SeverityLabel;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  source?: string;
  code?: string | number;
}

interface ProblemsFileOutput {
  file: string;
  relativePath?: string;
  diagnostics: ProblemDiagnostic[];
}

interface ProblemsOutput {
  files: ProblemsFileOutput[];
  totalDiagnostics: number;
}

const TOOL_NAME = "get_problems";

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

function getAbsolutePath(workspaceRoot: string, filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(workspaceRoot, filePath);
}

function getRelativePath(
  workspaceRoot: string,
  filePath: string,
): string | undefined {
  const relativePath = path.relative(workspaceRoot, filePath);
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return undefined;
  }
  return relativePath.split(path.sep).join("/");
}

function severityToLabel(severity: vscode.DiagnosticSeverity): SeverityLabel {
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
      return "info";
  }
}

function labelToSeverity(
  severity?: SeverityLabel,
): vscode.DiagnosticSeverity | undefined {
  switch (severity) {
    case "error":
      return vscode.DiagnosticSeverity.Error;
    case "warning":
      return vscode.DiagnosticSeverity.Warning;
    case "info":
      return vscode.DiagnosticSeverity.Information;
    case "hint":
      return vscode.DiagnosticSeverity.Hint;
    default:
      return undefined;
  }
}

function normalizeCode(
  code: vscode.Diagnostic["code"],
): string | number | undefined {
  if (code === undefined) {
    return undefined;
  }
  if (typeof code === "string" || typeof code === "number") {
    return code;
  }
  if (typeof code === "object" && "value" in code) {
    return code.value;
  }
  return undefined;
}

function formatDiagnostics(
  diagnostics: vscode.Diagnostic[],
  severityFilter?: vscode.DiagnosticSeverity,
): ProblemDiagnostic[] {
  return diagnostics
    .filter((diagnostic) =>
      severityFilter === undefined
        ? true
        : diagnostic.severity === severityFilter,
    )
    .map((diagnostic) => {
      const { start, end } = diagnostic.range;
      const output: ProblemDiagnostic = {
        message: diagnostic.message,
        severity: severityToLabel(diagnostic.severity),
        line: start.line + 1,
        column: start.character + 1,
      };

      const code = normalizeCode(diagnostic.code);
      if (code !== undefined) {
        output.code = code;
      }

      if (diagnostic.source) {
        output.source = diagnostic.source;
      }

      if (end.line !== start.line || end.character !== start.character) {
        output.endLine = end.line + 1;
        output.endColumn = end.character + 1;
      }

      return output;
    });
}

function buildFileOutput(
  workspaceRoot: string,
  filePath: string,
  diagnostics: vscode.Diagnostic[],
  severityFilter?: vscode.DiagnosticSeverity,
): ProblemsFileOutput | undefined {
  const filtered = formatDiagnostics(diagnostics, severityFilter);
  if (filtered.length === 0) {
    return undefined;
  }

  const relativePath = getRelativePath(workspaceRoot, filePath);
  const output: ProblemsFileOutput = {
    file: filePath,
    diagnostics: filtered,
  };

  if (relativePath) {
    output.relativePath = relativePath;
  }

  return output;
}

export const getProblemsTool: AgentTool<GetProblemsInput> = {
  name: TOOL_NAME,
  description:
    "Retrieve VS Code diagnostic problems for the workspace, with optional file and severity filters.",
  inputSchema: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Optional file path to filter diagnostics",
      },
      severity: {
        type: "string",
        enum: ["error", "warning", "info", "hint"],
        description: "Optional severity filter",
      },
    },
  },
  invoke: async (
    input: GetProblemsInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => {
    const callId = crypto.randomUUID();
    context.observer?.onProgress?.(callId, "Getting workspace problems");

    if (context.token.isCancellationRequested) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.CANCELLED,
          "Diagnostics retrieval cancelled.",
          "Retry after cancellation is cleared.",
        ),
      );
    }

    const severityFilter = labelToSeverity(input.severity);
    const files: ProblemsFileOutput[] = [];

    if (input.filePath) {
      const absolutePath = getAbsolutePath(
        context.workspaceRoot,
        input.filePath,
      );
      const diagnostics = vscode.languages.getDiagnostics(
        vscode.Uri.file(absolutePath),
      );
      const fileOutput = buildFileOutput(
        context.workspaceRoot,
        absolutePath,
        diagnostics,
        severityFilter,
      );
      if (fileOutput) {
        files.push(fileOutput);
      }
    } else {
      const diagnosticsEntries = vscode.languages.getDiagnostics();
      for (const [uri, diagnostics] of diagnosticsEntries) {
        const filePath = uri.fsPath;
        const fileOutput = buildFileOutput(
          context.workspaceRoot,
          filePath,
          diagnostics,
          severityFilter,
        );
        if (fileOutput) {
          files.push(fileOutput);
        }
      }
    }

    const totalDiagnostics = files.reduce(
      (sum, file) => sum + file.diagnostics.length,
      0,
    );

    const output: ProblemsOutput = {
      files,
      totalDiagnostics,
    };

    return buildToolResult(
      successResult(TOOL_NAME, [
        { type: "json", value: JSON.stringify(output, null, 2) },
      ]),
    );
  },
};
