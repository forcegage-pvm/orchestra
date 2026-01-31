/**
 * bulkReplace tool - Multi-file text/regex replacement with glob pattern targeting
 */

import * as path from "path";
import * as vscode from "vscode";

import { ToolErrorCode } from "../errors.js";
import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

interface BulkReplaceInput {
  pattern: string;
  replacement: string;
  is_regex?: boolean;
  include_glob?: string;
  exclude_glob?: string;
  case_sensitive?: boolean;
  whole_word?: boolean;
  max_files?: number;
  max_replacements?: number;
  preview_only?: boolean;
}

interface FileChangeInfo {
  file_path: string;
  replacements: number;
  preview?: string;
}

interface FileErrorInfo {
  file_path: string;
  error: string;
}

interface BulkReplaceResult {
  success: boolean;
  files_scanned: number;
  files_modified: number;
  total_replacements: number;
  changes: FileChangeInfo[];
  errors: FileErrorInfo[];
}

const TOOL_NAME = "bulk_replace";
const MAX_PREVIEW_LENGTH = 500;

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function toRelativePath(
  context: ToolInvocationContext,
  uri: vscode.Uri,
): string {
  const fsPath = uri.fsPath;
  const relative = path.relative(context.workspaceRoot, fsPath);
  const normalizedRelative = relative.split(path.sep).join("/");
  const normalizedFsPath = fsPath.split(path.sep).join("/");
  return normalizedRelative.length > 0 ? normalizedRelative : normalizedFsPath;
}

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

/**
 * Check if file is likely binary by reading first few bytes
 */
async function isBinaryFile(uri: vscode.Uri): Promise<boolean> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    // Check first 512 bytes for null bytes (common in binary files)
    const checkLength = Math.min(512, bytes.length);
    for (let i = 0; i < checkLength; i++) {
      if (bytes[i] === 0) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Build a regex from pattern with options
 */
function buildRegex(
  pattern: string,
  isRegex: boolean,
  caseSensitive: boolean,
  wholeWord: boolean,
): RegExp {
  let regexPattern = pattern;

  if (!isRegex) {
    // Escape special regex characters for literal matching
    regexPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  if (wholeWord) {
    // Add word boundaries
    regexPattern = `\\b${regexPattern}\\b`;
  }

  const flags = caseSensitive ? "gm" : "gim";
  return new RegExp(regexPattern, flags);
}

/**
 * Generate preview of changes for a file
 */
function generatePreview(
  originalContent: string,
  modifiedContent: string,
  maxLength: number = MAX_PREVIEW_LENGTH,
): string {
  const preview = `--- Original\n+++ Modified\n${modifiedContent.substring(0, maxLength)}`;
  if (modifiedContent.length > maxLength) {
    return `${preview}\n... (truncated)`;
  }
  return preview;
}

/**
 * Process a single file for replacements
 */
async function processFile(
  uri: vscode.Uri,
  regex: RegExp,
  replacement: string,
  context: ToolInvocationContext,
  previewOnly: boolean,
): Promise<FileChangeInfo | FileErrorInfo> {
  const relativePath = toRelativePath(context, uri);

  try {
    // Check if binary
    if (await isBinaryFile(uri)) {
      return {
        file_path: relativePath,
        error: "Binary file skipped",
      };
    }

    // Read file content
    const document = await vscode.workspace.openTextDocument(uri);
    const content = document.getText();
    const normalizedContent = normalizeLineEndings(content);

    // Count matches and perform replacement
    const matches = normalizedContent.match(regex);
    if (!matches || matches.length === 0) {
      return {
        file_path: relativePath,
        replacements: 0,
      };
    }

    const replacementCount = matches.length;
    const modifiedContent = normalizedContent.replace(regex, replacement);

    // Generate preview if requested
    const changeInfo: FileChangeInfo = {
      file_path: relativePath,
      replacements: replacementCount,
    };

    if (previewOnly) {
      changeInfo.preview = generatePreview(normalizedContent, modifiedContent);
      return changeInfo;
    }

    // Apply edit if not preview mode
    if (replacementCount > 0) {
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(content.length),
      );
      edit.replace(uri, fullRange, modifiedContent);

      const applied = await vscode.workspace.applyEdit(edit);
      if (!applied) {
        return {
          file_path: relativePath,
          error: "Failed to apply edit",
        };
      }
    }

    return changeInfo;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      file_path: relativePath,
      error: message,
    };
  }
}

/**
 * Main bulk replace implementation
 */
async function bulkReplace(
  input: BulkReplaceInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  try {
    // Validate inputs
    const pattern = input.pattern?.trim();
    if (!pattern) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          "pattern is required and cannot be empty.",
          "Provide a non-empty search pattern.",
        ),
      );
    }

    const replacement =
      input.replacement !== undefined ? input.replacement : "";
    const isRegex = input.is_regex ?? false;
    const includeGlob = input.include_glob ?? "**/*";
    const excludeGlob = input.exclude_glob;
    const caseSensitive = input.case_sensitive ?? true;
    const wholeWord = input.whole_word ?? false;
    const maxFiles = input.max_files;
    const maxReplacements = input.max_replacements;
    const previewOnly = input.preview_only ?? false;

    // Build regex
    let regex: RegExp;
    try {
      regex = buildRegex(pattern, isRegex, caseSensitive, wholeWord);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid regular expression";
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          `Invalid pattern: ${message}`,
          "Provide a valid search pattern.",
        ),
      );
    }

    // Find files matching glob pattern
    const files = await vscode.workspace.findFiles(
      includeGlob,
      excludeGlob,
      maxFiles,
    );

    if (files.length === 0) {
      return buildToolResult(
        successResult(
          TOOL_NAME,
          JSON.stringify(
            {
              success: true,
              files_scanned: 0,
              files_modified: 0,
              total_replacements: 0,
              changes: [],
              errors: [],
            } as BulkReplaceResult,
            null,
            2,
          ),
        ),
      );
    }

    // Process each file
    const changes: FileChangeInfo[] = [];
    const errors: FileErrorInfo[] = [];
    let totalReplacements = 0;
    let filesScanned = 0;

    for (const uri of files) {
      if (context.token.isCancellationRequested) {
        return buildToolResult(
          errorResult(
            TOOL_NAME,
            ToolErrorCode.CANCELLED,
            "Operation cancelled.",
            "Retry the operation when ready.",
          ),
        );
      }

      filesScanned++;

      const result = await processFile(
        uri,
        regex,
        replacement,
        context,
        previewOnly,
      );

      if ("error" in result) {
        errors.push(result as FileErrorInfo);
      } else {
        const change = result as FileChangeInfo;
        if (change.replacements > 0) {
          // Check if adding this file's replacements would exceed max
          if (
            maxReplacements &&
            totalReplacements + change.replacements > maxReplacements
          ) {
            // Don't add this file, we've reached the limit
            break;
          }

          changes.push(change);
          totalReplacements += change.replacements;
        }
      }
    }

    const result: BulkReplaceResult = {
      success: true,
      files_scanned: filesScanned,
      files_modified: changes.length,
      total_replacements: totalReplacements,
      changes,
      errors,
    };

    return buildToolResult(
      successResult(TOOL_NAME, JSON.stringify(result, null, 2)),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error during bulk replace";
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.UNKNOWN,
        `Bulk replace failed: ${message}`,
        "Check the pattern and glob settings before retrying.",
      ),
    );
  }
}

/**
 * Agent tool for bulk text replacement across multiple files
 * Supports literal text or regex patterns with capture group substitution
 * Includes glob-based file filtering and safety limits
 * @property name - Tool identifier: "bulk_replace"
 * @property description - Human-readable tool description
 * @property inputSchema - JSON Schema defining input parameters
 * @property invoke - Execute the tool with validated input
 */
export const bulkReplaceTool: AgentTool<BulkReplaceInput> = {
  name: TOOL_NAME,
  description:
    "Replace text patterns across multiple files using literal text or regex with capture group support.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Text pattern or regex to search for",
      },
      replacement: {
        type: "string",
        description:
          "Replacement text (supports $1, $2 for regex capture groups)",
      },
      is_regex: {
        type: "boolean",
        description: "Treat pattern as regular expression (default: false)",
        default: false,
      },
      include_glob: {
        type: "string",
        description: "Glob pattern for files to include (default: **/*)",
        default: "**/*",
      },
      exclude_glob: {
        type: "string",
        description: "Glob pattern for files to exclude",
      },
      case_sensitive: {
        type: "boolean",
        description: "Case-sensitive matching (default: true)",
        default: true,
      },
      whole_word: {
        type: "boolean",
        description: "Match whole words only (default: false)",
        default: false,
      },
      max_files: {
        type: "number",
        description: "Maximum number of files to process",
      },
      max_replacements: {
        type: "number",
        description: "Maximum total replacements across all files",
      },
      preview_only: {
        type: "boolean",
        description: "Preview changes without applying (default: false)",
        default: false,
      },
    },
    required: ["pattern", "replacement"],
  },
  invoke: async (
    input: BulkReplaceInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => bulkReplace(input, context),
};
