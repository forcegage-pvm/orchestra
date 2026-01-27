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

    const firstIndex = content.indexOf(input.oldString);
    if (firstIndex === -1) {
      return {
        success: false,
        output: "",
        error: `oldString not found in file: ${input.path}.`,
      };
    }

    const lastIndex = content.lastIndexOf(input.oldString);
    if (lastIndex !== firstIndex) {
      return {
        success: false,
        output: "",
        error:
          `oldString matched multiple locations in ${input.path}. Provide a more specific match.`,
      };
    }

    const startPosition = document.positionAt(firstIndex);
    const endPosition = document.positionAt(
      firstIndex + input.oldString.length,
    );
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
      const newContent = content.replace(input.oldString, input.newString);

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
