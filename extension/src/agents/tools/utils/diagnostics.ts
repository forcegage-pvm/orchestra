/**
 * Diagnostics utility for checking language server problems after file edits.
 *
 * Language servers (TypeScript, ESLint, etc.) update diagnostics asynchronously
 * after file changes. This utility provides functions to wait for and retrieve
 * diagnostics to validate that edits didn't introduce errors.
 */

import * as vscode from "vscode";

/**
 * Severity levels for diagnostics, matching VS Code's DiagnosticSeverity
 */
export type DiagnosticSeverity = "error" | "warning" | "info" | "hint";

/**
 * A simplified diagnostic returned to the agent
 */
export interface SimpleDiagnostic {
  /** 1-based line number where the diagnostic starts */
  line: number;
  /** 0-based column where the diagnostic starts */
  column: number;
  /** Severity of the diagnostic */
  severity: DiagnosticSeverity;
  /** Human-readable message describing the problem */
  message: string;
  /** Source of the diagnostic (e.g., "ts", "eslint") */
  source: string | undefined;
  /** Diagnostic code (e.g., "TS2345", "no-unused-vars") */
  code: string | undefined;
}

/**
 * Result of a diagnostic check on a file
 */
export interface DiagnosticsResult {
  /** Total number of diagnostics found */
  totalCount: number;
  /** Number of errors (severity = Error) */
  errorCount: number;
  /** Number of warnings (severity = Warning) */
  warningCount: number;
  /** Whether the file has any errors */
  hasErrors: boolean;
  /** List of diagnostics, sorted by line number */
  diagnostics: SimpleDiagnostic[];
}

/**
 * Default delay in milliseconds to wait for language server to update diagnostics.
 * Language servers debounce file changes, typically 200-500ms.
 */
export const DEFAULT_DIAGNOSTIC_DELAY_MS = 500;

/**
 * Maximum number of diagnostics to return to avoid overwhelming the agent.
 */
export const MAX_DIAGNOSTICS_RETURNED = 20;

/**
 * Convert VS Code DiagnosticSeverity to our simplified severity string.
 */
function severityToString(
  severity: vscode.DiagnosticSeverity,
): DiagnosticSeverity {
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

/**
 * Format a diagnostic code for display.
 * Handles both string codes and { value, target } object codes.
 */
function formatCode(
  code:
    | string
    | number
    | { value: string | number; target: vscode.Uri }
    | undefined,
): string | undefined {
  if (code === undefined) return undefined;
  if (typeof code === "string" || typeof code === "number") return String(code);
  if (typeof code === "object" && "value" in code) return String(code.value);
  return undefined;
}

/**
 * Convert VS Code Diagnostic to our simplified format.
 */
function toSimpleDiagnostic(diagnostic: vscode.Diagnostic): SimpleDiagnostic {
  return {
    line: diagnostic.range.start.line + 1, // Convert to 1-based
    column: diagnostic.range.start.character,
    severity: severityToString(diagnostic.severity),
    message: diagnostic.message,
    source: diagnostic.source,
    code: formatCode(diagnostic.code),
  };
}

/**
 * Wait for a specified delay to allow language servers to update diagnostics.
 * @param ms - Delay in milliseconds
 */
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get diagnostics for a file after waiting for language server updates.
 *
 * This function waits for the language server to process file changes,
 * then retrieves and formats diagnostics for the specified file.
 *
 * @param uri - The file URI to get diagnostics for
 * @param delayMs - Delay to wait for language server (default: 500ms)
 * @returns DiagnosticsResult with counts and formatted diagnostics
 *
 * @example
 * ```typescript
 * const uri = vscode.Uri.file("/path/to/file.ts");
 * const result = await getDiagnosticsForFile(uri);
 * if (result.hasErrors) {
 *   console.log(`Found ${result.errorCount} errors`);
 * }
 * ```
 */
export async function getDiagnosticsForFile(
  uri: vscode.Uri,
  delayMs: number = DEFAULT_DIAGNOSTIC_DELAY_MS,
): Promise<DiagnosticsResult> {
  // Wait for language server to process changes
  await delay(delayMs);

  // Get all diagnostics for this file
  const diagnostics = vscode.languages.getDiagnostics(uri);

  // Count by severity
  let errorCount = 0;
  let warningCount = 0;

  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === vscode.DiagnosticSeverity.Error) {
      errorCount++;
    } else if (diagnostic.severity === vscode.DiagnosticSeverity.Warning) {
      warningCount++;
    }
  }

  // Convert and sort by line number, limit to max returned
  const simpleDiagnostics = diagnostics
    .map(toSimpleDiagnostic)
    .sort((a, b) => a.line - b.line)
    .slice(0, MAX_DIAGNOSTICS_RETURNED);

  return {
    totalCount: diagnostics.length,
    errorCount,
    warningCount,
    hasErrors: errorCount > 0,
    diagnostics: simpleDiagnostics,
  };
}

/**
 * Format diagnostics result as a human-readable summary for inclusion in tool output.
 *
 * @param result - The diagnostics result to format
 * @returns A formatted string summary, or null if no diagnostics
 *
 * @example
 * ```typescript
 * const result = await getDiagnosticsForFile(uri);
 * const summary = formatDiagnosticsSummary(result);
 * // "⚠️ 2 errors, 1 warning found after edit:\n  Line 10: [ts] TS2345: Argument..."
 * ```
 */
export function formatDiagnosticsSummary(
  result: DiagnosticsResult,
): string | null {
  if (result.totalCount === 0) {
    return null;
  }

  const parts: string[] = [];

  // Header with counts
  const countParts: string[] = [];
  if (result.errorCount > 0) {
    countParts.push(
      `${result.errorCount} error${result.errorCount > 1 ? "s" : ""}`,
    );
  }
  if (result.warningCount > 0) {
    countParts.push(
      `${result.warningCount} warning${result.warningCount > 1 ? "s" : ""}`,
    );
  }
  const otherCount =
    result.totalCount - result.errorCount - result.warningCount;
  if (otherCount > 0) {
    countParts.push(`${otherCount} other`);
  }

  const icon = result.hasErrors ? "❌" : "⚠️";
  parts.push(`${icon} ${countParts.join(", ")} found after edit:`);

  // List diagnostics
  for (const diag of result.diagnostics) {
    const codeStr = diag.code ? ` ${diag.code}:` : "";
    const sourceStr = diag.source ? `[${diag.source}]` : "";
    parts.push(`  Line ${diag.line}: ${sourceStr}${codeStr} ${diag.message}`);
  }

  // Note if truncated
  if (result.totalCount > MAX_DIAGNOSTICS_RETURNED) {
    parts.push(
      `  ... and ${result.totalCount - MAX_DIAGNOSTICS_RETURNED} more`,
    );
  }

  return parts.join("\n");
}
