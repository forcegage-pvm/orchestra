/**
 * smartReplaces tool - Batch smart text replacement across multiple files
 *
 * Allows agents to perform multiple smart_replace operations in a single call.
 * - For same-file replacements: executed sequentially to handle line shifts
 * - For different files: executed in parallel for efficiency
 */

import * as vscode from "vscode";

import { createToolError, ToolErrorCode } from "../errors.js";
import { FuzzyMatcher } from "../infrastructure/FuzzyMatcher.js";
import type {
  AgentTool,
  MatchResult,
  ToolInputSchema,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import {
  formatDiagnosticsSummary,
  getDiagnosticsForFile,
  type DiagnosticsResult,
} from "../utils/diagnostics.js";
import { validatePath } from "../utils/pathValidation.js";

const TOOL_NAME = "smart_replaces";

interface ReplacementSpec {
  file_path: string;
  old_text: string;
  new_text: string;
  start_line_hint?: number;
  occurrence?: number;
  fuzzy_threshold?: number;
}

interface SmartReplacesInput {
  replacements: ReplacementSpec[];
  dry_run?: boolean;
  /** If true, check for TypeScript/ESLint errors after all edits are applied */
  validate?: boolean;
}

interface SingleReplacementResult {
  file_path: string;
  success: boolean;
  match_type?: "EXACT" | "NORMALIZED" | "FUZZY";
  similarity?: number;
  lines_changed?: {
    start: number;
    end: number;
    count: number;
  };
  diff_preview?: string;
  error?: {
    code: string;
    message: string;
  };
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function generateDiffPreview(
  oldLines: string[],
  newLines: string[],
  startLine: number,
  endLine: number,
): string {
  const contextLines = 3;
  const diffStart = Math.max(0, startLine - 1 - contextLines);
  const diffEnd = Math.min(oldLines.length, endLine + contextLines);

  const diffLines: string[] = [];
  diffLines.push(
    `@@ -${startLine},${endLine - startLine + 1} +${startLine},${newLines.length} @@`,
  );

  for (let i = diffStart; i < startLine - 1; i++) {
    diffLines.push(` ${oldLines[i]}`);
  }

  for (let i = startLine - 1; i < endLine; i++) {
    diffLines.push(`-${oldLines[i]}`);
  }

  for (const line of newLines) {
    diffLines.push(`+${line}`);
  }

  for (let i = endLine; i < diffEnd; i++) {
    diffLines.push(` ${oldLines[i]}`);
  }

  return diffLines.join("\n");
}

function findNthOccurrence(
  lines: string[],
  target: string,
  matcher: FuzzyMatcher,
  occurrence: number,
  startLineHint?: number,
): MatchResult | null {
  if (occurrence === 1 && startLineHint === undefined) {
    const result = matcher.match(lines, target);
    return result.found ? result : null;
  }

  if (occurrence === 1 && startLineHint !== undefined) {
    const result = matcher.match(lines, target, { startLineHint });
    return result.found ? result : null;
  }

  const matches: MatchResult[] = [];
  const targetLineCount = target.split("\n").length;
  const seen = new Set<string>();

  for (
    let startLine = 0;
    startLine <= lines.length - targetLineCount;
    startLine++
  ) {
    const segment = lines
      .slice(startLine, startLine + targetLineCount)
      .join("\n");
    const segmentResult = matcher.match([segment], target);

    if (segmentResult.found) {
      const key = `${startLine + 1}`;
      if (!seen.has(key)) {
        seen.add(key);
        matches.push({
          ...segmentResult,
          start_line: startLine + 1,
          end_line: startLine + targetLineCount,
          matched_text: segment,
        });
      }
    }
  }

  if (matches.length === 0 || occurrence > matches.length) {
    return null;
  }

  if (startLineHint !== undefined) {
    matches.sort((a, b) => {
      const distA = Math.abs(a.start_line - startLineHint);
      const distB = Math.abs(b.start_line - startLineHint);
      return distA - distB;
    });
  } else {
    matches.sort((a, b) => a.start_line - b.start_line);
  }

  return matches[occurrence - 1] ?? null;
}

/**
 * Apply a single replacement to a document
 */
async function applySingleReplacement(
  spec: ReplacementSpec,
  workspaceRoot: string,
  dryRun: boolean,
  callId: string,
  observer?: ToolInvocationContext["observer"],
): Promise<SingleReplacementResult> {
  const validatedPath = await validatePath(spec.file_path, workspaceRoot);
  if (!validatedPath.isValid) {
    return {
      file_path: spec.file_path,
      success: false,
      error: {
        code: validatedPath.error.code,
        message: validatedPath.error.message,
      },
    };
  }

  const uri = vscode.Uri.file(validatedPath.absolutePath);
  let document: vscode.TextDocument;

  try {
    document = await vscode.workspace.openTextDocument(uri);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      file_path: spec.file_path,
      success: false,
      error: {
        code: ToolErrorCode.FILE_NOT_FOUND,
        message: `Failed to open file: ${message}`,
      },
    };
  }

  const content = document.getText();
  const lines = normalizeLineEndings(content).split("\n");
  const normalizedOldText = normalizeLineEndings(spec.old_text);

  const fuzzyThreshold = spec.fuzzy_threshold ?? 0.85;
  const occurrence = spec.occurrence ?? 1;

  if (occurrence < 1) {
    return {
      file_path: spec.file_path,
      success: false,
      error: {
        code: ToolErrorCode.INVALID_INPUT,
        message: "occurrence must be >= 1",
      },
    };
  }

  const matcher = new FuzzyMatcher({ threshold: fuzzyThreshold });
  const matchResult = findNthOccurrence(
    lines,
    normalizedOldText,
    matcher,
    occurrence,
    spec.start_line_hint,
  );

  if (!matchResult) {
    return {
      file_path: spec.file_path,
      success: false,
      error: {
        code: ToolErrorCode.NO_MATCH,
        message: `No match found for occurrence ${occurrence}`,
      },
    };
  }

  const newTextLines = normalizeLineEndings(spec.new_text).split("\n");
  const diffPreview = generateDiffPreview(
    lines,
    newTextLines,
    matchResult.start_line,
    matchResult.end_line,
  );

  if (dryRun) {
    return {
      file_path: spec.file_path,
      success: true,
      match_type: matchResult.match_type,
      similarity: matchResult.confidence,
      lines_changed: {
        start: matchResult.start_line,
        end: matchResult.end_line,
        count: matchResult.end_line - matchResult.start_line + 1,
      },
      diff_preview: diffPreview,
    };
  }

  // Apply the edit - use lineAt() to correctly handle CRLF line endings
  const startLine = document.lineAt(matchResult.start_line - 1);
  const endLine = document.lineAt(matchResult.end_line - 1);
  const startPosition = startLine.range.start;
  const endPosition = endLine.rangeIncludingLineBreak.end;

  const range = new vscode.Range(startPosition, endPosition);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, range, spec.new_text);

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    return {
      file_path: spec.file_path,
      success: false,
      error: {
        code: ToolErrorCode.COMMAND_FAILED,
        message: `Failed to apply edit in ${spec.file_path}`,
      },
    };
  }

  // Emit file operation event
  const linesChanged = matchResult.end_line - matchResult.start_line + 1;
  observer?.onFileOperation?.(callId, {
    operation: "update",
    path: spec.file_path,
    linesChanged,
  });

  return {
    file_path: spec.file_path,
    success: true,
    match_type: matchResult.match_type,
    similarity: matchResult.confidence,
    lines_changed: {
      start: matchResult.start_line,
      end: matchResult.end_line,
      count: linesChanged,
    },
    diff_preview: diffPreview,
  };
}

/**
 * Process all replacements for a single file sequentially
 * This is important because each replacement can shift line numbers
 */
async function processFileReplacements(
  _filePath: string,
  replacements: ReplacementSpec[],
  workspaceRoot: string,
  dryRun: boolean,
  callId: string,
  observer?: ToolInvocationContext["observer"],
): Promise<SingleReplacementResult[]> {
  const results: SingleReplacementResult[] = [];

  for (const spec of replacements) {
    const result = await applySingleReplacement(
      spec,
      workspaceRoot,
      dryRun,
      callId,
      observer,
    );
    results.push(result);

    // If a replacement fails, continue with remaining replacements
    // but the user should check the results
  }

  return results;
}

async function smartReplaces(
  input: SmartReplacesInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const callId = crypto.randomUUID();

  // Validate input
  if (!input.replacements || !Array.isArray(input.replacements)) {
    return {
      success: false,
      content: [
        {
          type: "error",
          value:
            "Invalid input: replacements must be an array of replacement specifications.",
        },
      ],
      error: createToolError(
        ToolErrorCode.INVALID_INPUT,
        "replacements must be an array",
        "Provide an array of replacement objects with file_path, old_text, and new_text.",
      ),
      metadata: {
        toolName: TOOL_NAME,
        callId,
        durationMs: 0,
      },
    };
  }

  if (input.replacements.length === 0) {
    return {
      success: false,
      content: [
        {
          type: "error",
          value: "No replacements specified.",
        },
      ],
      error: createToolError(
        ToolErrorCode.INVALID_INPUT,
        "replacements array is empty",
        "Provide at least one replacement specification.",
      ),
      metadata: {
        toolName: TOOL_NAME,
        callId,
        durationMs: 0,
      },
    };
  }

  const dryRun = input.dry_run ?? false;

  context.observer?.onProgress?.(
    callId,
    `Processing ${input.replacements.length} replacement(s)...`,
  );

  // Group replacements by file
  const byFile = new Map<string, ReplacementSpec[]>();
  for (const spec of input.replacements) {
    const existing = byFile.get(spec.file_path) ?? [];
    existing.push(spec);
    byFile.set(spec.file_path, existing);
  }

  // Process files in parallel, but replacements within each file sequentially
  const filePromises = Array.from(byFile.entries()).map(([filePath, specs]) =>
    processFileReplacements(
      filePath,
      specs,
      context.workspaceRoot,
      dryRun,
      callId,
      context.observer,
    ),
  );

  const fileResults = await Promise.all(filePromises);
  const allResults = fileResults.flat();

  // Count successes and failures
  const successCount = allResults.filter((r) => r.success).length;
  const failureCount = allResults.length - successCount;

  // If validate=true and not dry_run, check for diagnostics after all edits
  let diagnosticsResult: DiagnosticsResult | undefined;
  let diagnosticsSummary: string | null = null;
  let validationWarning: string | undefined;

  if (input.validate && !dryRun && successCount > 0) {
    // Gather diagnostics from all edited files
    const editedFiles = Array.from(byFile.keys());
    let totalErrors = 0;
    let totalWarnings = 0;
    const allDiagnostics: Array<{
      file: string;
      severity: string;
      line: number;
      message: string;
    }> = [];

    for (const filePath of editedFiles) {
      const validatedPath = await validatePath(filePath, context.workspaceRoot);
      if (validatedPath.isValid) {
        const uri = vscode.Uri.file(validatedPath.absolutePath);
        const fileDiagnostics = await getDiagnosticsForFile(uri);
        totalErrors += fileDiagnostics.errorCount;
        totalWarnings += fileDiagnostics.warningCount;
        allDiagnostics.push(...fileDiagnostics.diagnostics);
      }
    }

    diagnosticsResult = {
      hasErrors: totalErrors > 0,
      errorCount: totalErrors,
      warningCount: totalWarnings,
      diagnostics: allDiagnostics.slice(0, 20),
    };

    diagnosticsSummary = formatDiagnosticsSummary(diagnosticsResult);

    if (totalErrors > 0) {
      validationWarning = `⚠️ ${totalErrors} error(s) detected after edits`;
    } else if (totalWarnings > 0) {
      validationWarning = `${totalWarnings} warning(s) detected`;
    }
  }

  // Build output
  const output: Record<string, unknown> = {
    totalReplacements: allResults.length,
    successCount,
    failureCount,
    dryRun,
    replacements: allResults,
  };

  if (validationWarning) {
    output.warning = validationWarning;
  }

  // Build output content
  const outputContent: { type: string; value: string }[] = [
    {
      type: "json",
      value: JSON.stringify(output, null, 2),
    },
  ];

  // Include diagnostics in output if available
  if (diagnosticsSummary) {
    outputContent.push({ type: "text", value: diagnosticsSummary });
  }

  return {
    success: failureCount === 0,
    content: outputContent,
    metadata: {
      toolName: TOOL_NAME,
      callId,
      durationMs: 0,
    },
  };
}

// Extended schema with array items support (cast needed for LLM consumption)
const smartReplacesInputSchema = {
  type: "object",
  properties: {
    replacements: {
      type: "array",
      description:
        "Array of replacement specifications. Replacements for the same file are applied sequentially; different files are processed in parallel.",
      items: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Path to the file relative to workspace root",
          },
          old_text: {
            type: "string",
            description: "Text to find and replace (supports fuzzy matching)",
          },
          new_text: {
            type: "string",
            description: "Replacement text",
          },
          start_line_hint: {
            type: "number",
            description: "Line number hint for middle-out search (1-based)",
          },
          occurrence: {
            type: "number",
            description: "Which occurrence to replace (1-based, default: 1)",
          },
          fuzzy_threshold: {
            type: "number",
            description: "Fuzzy match threshold 0.0-1.0 (default: 0.85)",
          },
        },
        required: ["file_path", "old_text", "new_text"],
      },
    },
    dry_run: {
      type: "boolean",
      description: "Preview all changes without applying (default: false)",
    },
    validate: {
      type: "boolean",
      description:
        "If true, check for TypeScript/ESLint errors after all edits are applied and include diagnostics in output. Adds ~500ms delay per edited file. Use when you want immediate feedback on errors introduced.",
    },
  },
  required: ["replacements"],
} as ToolInputSchema;

/**
 * Agent tool for batch smart text replacement with fuzzy matching
 *
 * Key behaviors:
 * - Replacements targeting the SAME file are applied SEQUENTIALLY (to handle line shifts)
 * - Replacements targeting DIFFERENT files are applied in PARALLEL (for efficiency)
 * - Each replacement supports fuzzy matching with configurable threshold
 *
 * @property name - Tool identifier: "smart_replaces"
 * @property description - Human-readable tool description
 * @property inputSchema - JSON Schema defining input parameters
 * @property invoke - Execute the tool with validated input
 */
export const smartReplacesTool: AgentTool<SmartReplacesInput> = {
  name: TOOL_NAME,
  description:
    "BATCH replacement tool: Apply multiple smart_replace operations in a single call. " +
    "More efficient than multiple smart_replace calls. " +
    "Same-file replacements are applied sequentially to handle line shifts; " +
    "different files are processed in parallel.",
  inputSchema: smartReplacesInputSchema,
  invoke: async (
    input: SmartReplacesInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => smartReplaces(input, context),
};
