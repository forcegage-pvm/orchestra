/**
 * deleteFile tool - Delete specified file
 */

import * as crypto from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";

interface DeleteFileInput {
  path: string;
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

function isFileNotFound(error: unknown): boolean {
  return (
    error instanceof vscode.FileSystemError && error.code === "FileNotFound"
  );
}

async function deleteFile(
  input: DeleteFileInput,
  context: ToolContext,
): Promise<ToolResult> {
  try {
    const absolutePath = getAbsolutePath(context.workspaceRoot, input.path);
    const uri = vscode.Uri.file(absolutePath);

    try {
      await vscode.workspace.fs.stat(uri);
    } catch (error) {
      if (isFileNotFound(error)) {
        return {
          success: false,
          output: "",
          error: "File does not exist.",
        };
      }
      throw error;
    }

    const bytes = await vscode.workspace.fs.readFile(uri);
    const previousContent = Buffer.from(bytes).toString("utf8");

    const edit = new vscode.WorkspaceEdit();
    edit.deleteFile(uri, { ignoreIfNotExists: false, recursive: false });

    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      return {
        success: false,
        output: "",
        error: "Failed to delete file.",
      };
    }

    if (context.fileTracker) {
      context.fileTracker.trackChange({
        uri: uri.toString(),
        relativePath: input.path,
        operation: "delete",
        previousContent,
        previousContentHash: hashContent(previousContent),
        newContent: null,
        newContentHash: null,
        toolCallId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        iteration: context.iteration,
      });
    }

    return {
      success: true,
      output: `Deleted file at ${input.path}.`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error deleting file";
    return {
      success: false,
      output: "",
      error: `Failed to delete file: ${message}`,
    };
  }
}

export const deleteFileTool: AgentTool = {
  name: "delete_file",
  description: "Delete a file by path.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file relative to workspace root",
      },
    },
    required: ["path"],
  },
  execute: async (
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    const parsed = input as DeleteFileInput;
    return deleteFile(parsed, context);
  },
};
