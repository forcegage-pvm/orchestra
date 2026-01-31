/**
 * validateEdit tool - Pre-flight syntax validation using VS Code diagnostics
 */

import * as vscode from "vscode";

import { createToolError, ToolErrorCode } from "../errors.js";
import type {
  AgentTool,
  DiagnosticInfo,
  ToolInvocationContext,
  ToolResult,
  ValidateEditInput,
  ValidateEditResult,
} from "../types.js";
import { validatePath } from "../utils/pathValidation.js";

const TOOL_NAME = "validate_edit";
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Map VS Code DiagnosticSeverity to our severity string
 */
function mapSeverity(
  severity: vscode.DiagnosticSeverity,
): "error" | "warning" | "info" {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return "error";
    case vscode.DiagnosticSeverity.Warning:
      return "warning";
    case vscode.DiagnosticSeverity.Information:
    case vscode.DiagnosticSeverity.Hint:
      return "info";
    default:
      return "info";
  }
}

/**
 * Convert VS Code Diagnostic to our DiagnosticInfo format
 */
function convertDiagnostic(diagnostic: vscode.Diagnostic): DiagnosticInfo {
  const info: DiagnosticInfo = {
    line: diagnostic.range.start.line + 1, // Convert 0-based to 1-based
    column: diagnostic.range.start.character + 1, // Convert 0-based to 1-based
    message: diagnostic.message,
    severity: mapSeverity(diagnostic.severity),
  };

  // Only add source if it exists
  if (diagnostic.source) {
    info.source = diagnostic.source;
  }

  return info;
}

/**
 * Generate fix suggestions based on common error patterns
 */
function generateSuggestions(diagnostics: DiagnosticInfo[]): string[] {
  const suggestions: string[] = [];

  for (const diag of diagnostics) {
    const msg = diag.message.toLowerCase();

    // Common TypeScript/JavaScript errors
    if (msg.includes("expected") && msg.includes("}")) {
      suggestions.push(`Missing closing brace - add } at line ${diag.line}`);
    } else if (msg.includes("expected") && msg.includes(")")) {
      suggestions.push(
        `Missing closing parenthesis - add ) at line ${diag.line}`,
      );
    } else if (msg.includes("expected") && msg.includes("]")) {
      suggestions.push(`Missing closing bracket - add ] at line ${diag.line}`);
    } else if (msg.includes("expected") && msg.includes(";")) {
      suggestions.push(`Missing semicolon - add ; at line ${diag.line}`);
    } else if (
      msg.includes("cannot find name") ||
      msg.includes("is not defined")
    ) {
      suggestions.push(
        `Undefined variable or missing import at line ${diag.line}`,
      );
    } else if (msg.includes("duplicate identifier")) {
      suggestions.push(
        `Duplicate declaration at line ${diag.line} - rename or remove one`,
      );
    } else if (msg.includes("type") && msg.includes("is not assignable")) {
      suggestions.push(
        `Type mismatch at line ${diag.line} - check variable types`,
      );
    }
  }

  return suggestions.length > 0 ? suggestions : [];
}

/**
 * Validate proposed file content using VS Code diagnostics
 */
async function validateEdit(
  input: ValidateEditInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const startTime = Date.now();

  // Validate the file path
  const validatedPath = await validatePath(
    input.file_path,
    context.workspaceRoot,
  );
  if (!validatedPath.isValid) {
    return {
      success: false,
      content: [{ type: "error", value: validatedPath.error.message }],
      error: validatedPath.error,
      metadata: {
        toolName: TOOL_NAME,
        callId: context.sessionId,
        durationMs: Date.now() - startTime,
      },
    };
  }
  const timeout = input.timeout_ms ?? DEFAULT_TIMEOUT_MS;

  try {
    // Create a temporary document with the proposed content
    // We use openTextDocument with untitled scheme to create a virtual document
    const tempDoc = await vscode.workspace.openTextDocument({
      content: input.new_content,
      language: getLanguageId(input.file_path),
    });

    // Wait for diagnostics to be computed (with timeout)
    const diagnostics = await waitForDiagnostics(tempDoc, timeout);

    // Separate errors and warnings
    const errors: DiagnosticInfo[] = [];
    const warnings: DiagnosticInfo[] = [];

    for (const diagnostic of diagnostics) {
      const info = convertDiagnostic(diagnostic);
      if (info.severity === "error") {
        errors.push(info);
      } else if (info.severity === "warning") {
        warnings.push(info);
      }
    }

    const syntax_valid = errors.length === 0;

    const result: ValidateEditResult = {
      syntax_valid,
      errors,
      warnings,
    };

    // Generate actionable suggestions for errors
    const suggestions = generateSuggestions(errors);

    // Build content response
    const contentValue: Record<string, unknown> = {
      ...result,
    };

    if (suggestions.length > 0) {
      contentValue.suggestions = suggestions;
    }

    return {
      success: true,
      content: [
        {
          type: "json",
          value: JSON.stringify(contentValue, null, 2),
        },
      ],
      metadata: {
        toolName: TOOL_NAME,
        callId: context.sessionId,
        durationMs: Date.now() - startTime,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      content: [
        {
          type: "error",
          value: `Failed to validate content: ${message}`,
        },
      ],
      error: createToolError(
        ToolErrorCode.COMMAND_FAILED,
        `Failed to validate content: ${message}`,
        "Ensure the file path is correct and the content is well-formed.",
        { file_path: input.file_path },
      ),
      metadata: {
        toolName: TOOL_NAME,
        callId: context.sessionId,
        durationMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Determine language ID from file extension
 */
function getLanguageId(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();

  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescriptreact",
    js: "javascript",
    jsx: "javascriptreact",
    py: "python",
    json: "json",
    md: "markdown",
    html: "html",
    css: "css",
    scss: "scss",
    yaml: "yaml",
    yml: "yaml",
  };

  return languageMap[ext || ""] || "plaintext";
}

/**
 * Wait for diagnostics to be computed for a document
 */
async function waitForDiagnostics(
  document: vscode.TextDocument,
  timeoutMs: number,
): Promise<vscode.Diagnostic[]> {
  const startTime = Date.now();

  // Poll for diagnostics with exponential backoff
  const maxAttempts = 10;
  let attempt = 0;

  while (attempt < maxAttempts) {
    const elapsed = Date.now() - startTime;
    if (elapsed > timeoutMs) {
      // Timeout - return whatever diagnostics we have
      return vscode.languages.getDiagnostics(document.uri);
    }

    const diagnostics = vscode.languages.getDiagnostics(document.uri);

    // If we have diagnostics or enough time has passed, return them
    if (diagnostics.length > 0 || elapsed > 1000) {
      return diagnostics;
    }

    // Wait with exponential backoff: 50ms, 100ms, 200ms, ...
    const delay = Math.min(50 * Math.pow(2, attempt), 500);
    await new Promise((resolve) => setTimeout(resolve, delay));
    attempt++;
  }

  // Return diagnostics even if empty after max attempts
  return vscode.languages.getDiagnostics(document.uri);
}

/**
 * Agent tool for validating file edits before applying
 * Leverages VS Code language services to check syntax and report errors/warnings
 * Waits for diagnostics to populate for accurate validation
 * @property name - Tool identifier: "validate_edit"
 * @property description - Human-readable tool description
 * @property inputSchema - JSON Schema defining input parameters
 * @property invoke - Execute the tool with validated input
 */
export const validateEditTool: AgentTool<ValidateEditInput> = {
  name: TOOL_NAME,
  description:
    "Validate proposed file content before applying edits using VS Code diagnostics. Returns syntax errors and warnings with line numbers and fix suggestions.",
  inputSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: "Path to the file relative to workspace root",
      },
      new_content: {
        type: "string",
        description: "Proposed file content to validate",
      },
      timeout_ms: {
        type: "number",
        description: "Timeout for diagnostics in milliseconds (default: 5000)",
        default: 5000,
      },
    },
    required: ["file_path", "new_content"],
  },
  invoke: async (
    input: ValidateEditInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => validateEdit(input, context),
};
