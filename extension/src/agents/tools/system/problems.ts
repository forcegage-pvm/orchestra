/**
 * problems tool - Retrieve VS Code diagnostic issues
 */

import * as path from "path";
import * as vscode from "vscode";
import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";

interface ProblemsInput {
  filePath?: string;
}

type SeverityLabel = "error" | "warning" | "info" | "hint";

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
): ProblemDiagnostic[] {
  return diagnostics.map((diagnostic) => {
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
): ProblemsFileOutput | undefined {
  if (diagnostics.length === 0) {
    return undefined;
  }

  const relativePath = getRelativePath(workspaceRoot, filePath);
  const output: ProblemsFileOutput = {
    file: filePath,
    diagnostics: formatDiagnostics(diagnostics),
  };

  if (relativePath) {
    output.relativePath = relativePath;
  }

  return output;
}

async function getProblems(
  input: ProblemsInput,
  context: ToolContext,
): Promise<ToolResult> {
  try {
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

    return {
      success: true,
      output: JSON.stringify(output, null, 2),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      output: JSON.stringify({
        files: [],
        totalDiagnostics: 0,
      }),
      error: `Failed to retrieve diagnostics: ${message}`,
    };
  }
}

export const problemsTool: AgentTool = {
  name: "problems",
  description: "Retrieve VS Code diagnostic problems for the workspace.",
  inputSchema: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "Optional file path to filter diagnostics",
      },
    },
  },
  execute: async (
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    return getProblems(input as ProblemsInput, context);
  },
};
