/**
 * edit tool - Replace text using oldString/newString pattern
 */

import * as crypto from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";

interface EditInput {
  path: string;
  oldString: string;
  newString: string;
}

function getAbsolutePath(workspaceRoot: string, filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(workspaceRoot, filePath);
}

/**
 * Normalize line endings to LF for consistent matching.
 * This handles the case where the file uses CRLF but the agent sends LF.
 */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function hashContent(content: string | null): string | null {
  if (content === null) {
    return null;
  }

  return crypto.createHash("sha256").update(content).digest("hex");
}

async function replaceText(
  input: EditInput,
  context: ToolContext,
): Promise<ToolResult> {
  try {
    const absolutePath = getAbsolutePath(context.workspaceRoot, input.path);
    const uri = vscode.Uri.file(absolutePath);
    const document = await vscode.workspace.openTextDocument(uri);
    const content = document.getText();

    // Normalize line endings for matching
    const normalizedContent = normalizeLineEndings(content);
    const normalizedOldString = normalizeLineEndings(input.oldString);

    const firstIndex = normalizedContent.indexOf(normalizedOldString);
    if (firstIndex === -1) {
      return {
        success: false,
        output: "",
        error: `oldString not found in file: ${input.path}.`,
      };
    }

    const lastIndex = normalizedContent.lastIndexOf(normalizedOldString);
    if (lastIndex !== firstIndex) {
      return {
        success: false,
        output: "",
        error: `oldString matched multiple locations in ${input.path}. Provide a more specific match.`,
      };
    }

    // Calculate position in original content by counting characters up to match
    // We need to map from normalized position back to original position
    let originalIndex = 0;
    let normalizedIndex = 0;
    while (normalizedIndex < firstIndex && originalIndex < content.length) {
      if (
        content[originalIndex] === "\r" &&
        content[originalIndex + 1] === "\n"
      ) {
        // CRLF in original maps to single LF in normalized
        originalIndex += 2;
        normalizedIndex += 1;
      } else {
        originalIndex += 1;
        normalizedIndex += 1;
      }
    }

    // Calculate end position similarly
    const matchLength = normalizedOldString.length;
    let originalEndIndex = originalIndex;
    let matchedChars = 0;
    while (matchedChars < matchLength && originalEndIndex < content.length) {
      if (
        content[originalEndIndex] === "\r" &&
        content[originalEndIndex + 1] === "\n"
      ) {
        originalEndIndex += 2;
        matchedChars += 1;
      } else {
        originalEndIndex += 1;
        matchedChars += 1;
      }
    }

    const startPosition = document.positionAt(originalIndex);
    const endPosition = document.positionAt(originalEndIndex);
    const range = new vscode.Range(startPosition, endPosition);

    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, range, input.newString);

    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      return {
        success: false,
        output: "",
        error: `Failed to apply edit in ${input.path}.`,
      };
    }

    if (context.fileTracker) {
      const previousContent = content;
      const newContent =
        content.substring(0, originalIndex) +
        input.newString +
        content.substring(originalEndIndex);

      context.fileTracker.trackChange({
        uri: uri.toString(),
        relativePath: input.path,
        operation: "modify",
        previousContent,
        previousContentHash: hashContent(previousContent),
        newContent,
        newContentHash: hashContent(newContent),
        toolCallId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        iteration: context.iteration,
      });
    }

    return {
      success: true,
      output: `Replaced text in ${input.path}.`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error applying edit";
    return {
      success: false,
      output: "",
      error: `Failed to edit file ${input.path}: ${message}`,
    };
  }
}

export const editTool: AgentTool = {
  name: "edit",
  description:
    "Replace a single exact match of oldString with newString in a file.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file relative to workspace root",
      },
      oldString: {
        type: "string",
        description: "Exact text to replace (must match exactly once)",
      },
      newString: {
        type: "string",
        description: "Replacement text",
      },
    },
    required: ["path", "oldString", "newString"],
  },
  execute: async (
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    const parsed = input as EditInput;
    return replaceText(parsed, context);
  },
};
