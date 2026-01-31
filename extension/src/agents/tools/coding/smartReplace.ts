/**
 * smartReplace tool - Advanced file editing with fuzzy matching
 */

import * as vscode from "vscode";

import { createToolError, ToolErrorCode } from "../errors.js";
import { FuzzyMatcher } from "../infrastructure/FuzzyMatcher.js";
import type {
  AgentTool,
  MatchResult,
  SmartReplaceInput,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { validatePath } from "../utils/pathValidation.js";

const TOOL_NAME = "smart_replace";

interface SmartReplaceResult {
  success: boolean;
  file_path: string;
  match_type: "EXACT" | "NORMALIZED" | "FUZZY";
  similarity: number;
  lines_changed: {
    start: number;
    end: number;
    count: number;
  };
  diff_preview?: string;
  warning?: string;
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
    // Simple case: find first match
    const result = matcher.match(lines, target);
    return result.found ? result : null;
  }

  if (occurrence === 1 && startLineHint !== undefined) {
    // Simple case with hint: find nearest match
    const result = matcher.match(lines, target, { startLineHint });
    return result.found ? result : null;
  }

  // Complex case: need to find multiple occurrences
  // Collect all matches by trying each possible starting position
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

  if (matches.length === 0) {
    return null;
  }

  if (occurrence > matches.length) {
    return null;
  }

  // If start_line_hint is provided, sort matches by distance from hint
  if (startLineHint !== undefined) {
    matches.sort((a, b) => {
      const distA = Math.abs(a.start_line - startLineHint);
      const distB = Math.abs(b.start_line - startLineHint);
      return distA - distB;
    });
  } else {
    // Otherwise, sort by line number (ascending)
    matches.sort((a, b) => a.start_line - b.start_line);
  }

  return matches[occurrence - 1];
}

async function smartReplace(
  input: SmartReplaceInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
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
        callId: context.callId,
        durationMs: 0,
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
      success: false,
      content: [{ type: "error", value: `Failed to open file: ${message}` }],
      error: createToolError(
        ToolErrorCode.FILE_NOT_FOUND,
        `Failed to open file: ${message}`,
        "Check the file path and ensure it exists.",
        { path: input.file_path },
      ),
      metadata: {
        toolName: TOOL_NAME,
        callId: context.callId,
        durationMs: 0,
      },
    };
  }

  const content = document.getText();
  const lines = normalizeLineEndings(content).split("\n");
  const normalizedOldText = normalizeLineEndings(input.old_text);

  const fuzzyThreshold = input.fuzzy_threshold ?? 0.85;
  const occurrence = input.occurrence ?? 1;
  const dryRun = input.dry_run ?? false;

  if (occurrence < 1) {
    return {
      success: false,
      content: [{ type: "error", value: "occurrence must be >= 1" }],
      error: createToolError(
        ToolErrorCode.INVALID_INPUT,
        "occurrence must be >= 1",
        "Provide a positive occurrence value.",
        { occurrence },
      ),
      metadata: {
        toolName: TOOL_NAME,
        callId: context.callId,
        durationMs: 0,
      },
    };
  }

  // Create FuzzyMatcher with the specified threshold
  const matcher = new FuzzyMatcher({ threshold: fuzzyThreshold });

  // Find the Nth occurrence
  const matchResult = findNthOccurrence(
    lines,
    normalizedOldText,
    matcher,
    occurrence,
    input.start_line_hint,
  );

  if (!matchResult) {
    return {
      success: false,
      content: [
        { type: "error", value: `No match found for occurrence ${occurrence}` },
      ],
      error: createToolError(
        ToolErrorCode.NO_MATCH,
        `No match found for occurrence ${occurrence}`,
        occurrence > 1
          ? "Try a smaller occurrence value or check if old_text is correct."
          : "Check if old_text matches the file content.",
        { file_path: input.file_path, occurrence },
      ),
      metadata: {
        toolName: TOOL_NAME,
        callId: context.callId,
        durationMs: 0,
      },
    };
  }

  const newTextLines = normalizeLineEndings(input.new_text).split("\n");

  // Generate diff preview
  const diffPreview = generateDiffPreview(
    lines,
    newTextLines,
    matchResult.start_line,
    matchResult.end_line,
  );

  const result: SmartReplaceResult = {
    success: true,
    file_path: input.file_path,
    match_type: matchResult.match_type,
    similarity: matchResult.confidence,
    lines_changed: {
      start: matchResult.start_line,
      end: matchResult.end_line,
      count: matchResult.end_line - matchResult.start_line + 1,
    },
    diff_preview: diffPreview,
  };

  if (dryRun) {
    return {
      success: true,
      content: [
        {
          type: "json",
          value: JSON.stringify(result, null, 2),
        },
      ],
      metadata: {
        toolName: TOOL_NAME,
        callId: context.callId,
        durationMs: 0,
      },
    };
  }

  // Apply the edit
  const startPosition = document.positionAt(
    lines.slice(0, matchResult.start_line - 1).join("\n").length +
      (matchResult.start_line > 1 ? 1 : 0),
  );
  const endPosition = document.positionAt(
    lines.slice(0, matchResult.end_line).join("\n").length +
      (matchResult.end_line > 0 ? 1 : 0),
  );

  const range = new vscode.Range(startPosition, endPosition);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, range, input.new_text);

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    return {
      success: false,
      content: [
        { type: "error", value: `Failed to apply edit in ${input.file_path}` },
      ],
      error: createToolError(
        ToolErrorCode.COMMAND_FAILED,
        `Failed to apply edit in ${input.file_path}`,
        "Retry the edit or check if the file is locked.",
        { path: input.file_path },
      ),
      metadata: {
        toolName: TOOL_NAME,
        callId: context.callId,
        durationMs: 0,
      },
    };
  }

  return {
    success: true,
    content: [
      {
        type: "json",
        value: JSON.stringify(result, null, 2),
      },
    ],
    metadata: {
      toolName: TOOL_NAME,
      callId: context.callId,
      durationMs: 0,
    },
  };
}

/**
 * Agent tool for advanced text replacement with fuzzy matching
 * Uses Levenshtein distance to find and replace text with tolerance for whitespace changes
 * Supports exact, normalized, and fuzzy matching modes
 * @property name - Tool identifier: "smart_replace"
 * @property description - Human-readable tool description
 * @property inputSchema - JSON Schema defining input parameters
 * @property invoke - Execute the tool with validated input
 */
export const smartReplaceTool: AgentTool<SmartReplaceInput> = {
  name: TOOL_NAME,
  description:
    "Replace text using exact, whitespace-normalized, or fuzzy matching with Levenshtein distance.",
  inputSchema: {
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
        default: 1,
      },
      fuzzy_threshold: {
        type: "number",
        description: "Fuzzy match threshold 0.0-1.0 (default: 0.85)",
        default: 0.85,
      },
      dry_run: {
        type: "boolean",
        description: "Preview changes without applying (default: false)",
        default: false,
      },
    },
    required: ["file_path", "old_text", "new_text"],
  },
  invoke: async (
    input: SmartReplaceInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => smartReplace(input, context),
};
