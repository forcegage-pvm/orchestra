/**
 * autoFixFile tool — Apply VS Code auto-fixes (source.fixAll, organizeImports, etc.)
 *
 * Standalone tool for direct agent invocation. Agents use this to:
 * - Fix lint/compile errors after a series of edits
 * - Organize imports after adding new dependencies
 * - Clean up a file before committing
 * - Apply auto-fixes to files they didn't just edit
 */

import * as vscode from "vscode";

import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import {
  applyAutoFixes,
  formatAutoFixSummary,
  type AutoFixKind,
} from "../utils/autofix.js";
import {
  formatDiagnosticsSummary,
  getDiagnosticsForFile,
} from "../utils/diagnostics.js";
import { validatePath } from "../utils/pathValidation.js";

interface AutoFixFileInput {
  /** File path relative to workspace root */
  path: string;
  /** Code action kinds to apply. Defaults to ["source.fixAll", "source.organizeImports"] */
  kinds?: string[];
  /** If true, report remaining diagnostics after fix. Default: true */
  reportDiagnostics?: boolean;
}

const TOOL_NAME = "auto_fix_file";

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

async function autoFixFile(
  input: AutoFixFileInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const callId = crypto.randomUUID();
  context.observer?.onProgress?.(callId, `Auto-fixing: ${input.path}`);

  // Validate path
  const validatedPath = await validatePath(input.path, context.workspaceRoot);
  if (!validatedPath.isValid) {
    return buildToolResult({
      success: false,
      content: [{ type: "error", value: validatedPath.error.message }],
      error: validatedPath.error,
      metadata: { toolName: TOOL_NAME, callId, durationMs: 0 },
    });
  }

  const uri = vscode.Uri.file(validatedPath.absolutePath);

  // Parse kinds if provided
  const kinds = input.kinds as AutoFixKind[] | undefined;

  // Apply auto-fixes
  const fixResult = await applyAutoFixes(
    uri,
    kinds ? { kinds } : undefined,
  );
  const fixSummary = formatAutoFixSummary(fixResult);

  // Optionally check remaining diagnostics
  const reportDiagnostics = input.reportDiagnostics !== false;
  let diagSummary: string | null = null;
  if (reportDiagnostics) {
    const diagResult = await getDiagnosticsForFile(uri, 300);
    diagSummary = formatDiagnosticsSummary(diagResult);
  }

  // Build result message
  const contentParts: { type: "text"; value: string }[] = [];

  if (fixResult.applied) {
    contentParts.push({
      type: "text",
      value: `Auto-fixed ${input.path}: ${fixResult.actionsApplied} action(s) applied.`,
    });
  } else {
    contentParts.push({
      type: "text",
      value: `No auto-fixes available for ${input.path}.`,
    });
  }

  if (fixSummary) {
    contentParts.push({ type: "text", value: fixSummary });
  }

  if (diagSummary) {
    contentParts.push({ type: "text", value: diagSummary });
  } else if (reportDiagnostics) {
    contentParts.push({
      type: "text",
      value: "✅ No remaining diagnostics after auto-fix.",
    });
  }

  // Track as file operation if changes were made
  if (fixResult.applied) {
    context.observer?.onFileOperation?.(callId, {
      operation: "update",
      path: input.path,
      linesChanged: 0, // unknown exact count
    });
  }

  return buildToolResult({
    success: true,
    content: contentParts,
    metadata: { toolName: TOOL_NAME, callId, durationMs: 0 },
  });
}

export const autoFixFileTool: AgentTool<AutoFixFileInput> = {
  name: TOOL_NAME,
  description:
    "Apply automatic code fixes to a file using VS Code's code action providers " +
    "(same mechanism as editor.codeActionsOnSave). Applies source.fixAll and " +
    "source.organizeImports by default. Use after editing files to auto-fix " +
    "lint errors, organize imports, remove unused imports, etc.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path relative to workspace root",
      },
      kinds: {
        type: "string",
        description:
          'Code action kinds to apply, e.g. ["source.fixAll", "source.organizeImports"]. ' +
          "Defaults to both. Other options: source.fixAll.eslint, source.fixAll.ts, " +
          "source.removeUnused, source.addMissingImports, source.sortImports",
      },
      reportDiagnostics: {
        type: "boolean",
        description:
          "If true (default), report remaining diagnostics after fixes are applied.",
        default: true,
      },
    },
    required: ["path"],
  },
  invoke: async (
    input: AutoFixFileInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => autoFixFile(input, context),
};
