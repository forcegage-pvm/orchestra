/**
 * newFile tool - Create new file with specified content
 */

import * as path from "path";
import * as vscode from "vscode";
import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";

interface NewFileInput {
  path: string;
  content?: string;
}

function getAbsolutePath(workspaceRoot: string, filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(workspaceRoot, filePath);
}

function isFileNotFound(error: unknown): boolean {
  return (
    error instanceof vscode.FileSystemError &&
    error.code === "FileNotFound"
  );
}

async function createFile(
  input: NewFileInput,
  context: ToolContext
): Promise<ToolResult> {
  try {
    const absolutePath = getAbsolutePath(context.workspaceRoot, input.path);
    const uri = vscode.Uri.file(absolutePath);

    try {
      await vscode.workspace.fs.stat(uri);
      return {
        success: false,
        output: "",
        error: "File already exists. Use edit instead.",
      };
    } catch (error) {
      if (!isFileNotFound(error)) {
        throw error;
      }
    }

    const parentDir = path.dirname(absolutePath);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(parentDir));

    const edit = new vscode.WorkspaceEdit();
    edit.createFile(uri, {
      overwrite: false,
      ignoreIfExists: false,
      contents: Buffer.from(input.content ?? ""),
    });

    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      return {
        success: false,
        output: "",
        error: "Failed to create file.",
      };
    }

    return {
      success: true,
      output: `Created file at ${input.path}.`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error creating file";
    return {
      success: false,
      output: "",
      error: `Failed to create file: ${message}`,
    };
  }
}

export const newFileTool: AgentTool = {
  name: "new_file",
  description: "Create a new file with optional content.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the file relative to workspace root",
      },
      content: {
        type: "string",
        description: "Optional file content",
      },
    },
    required: ["path"],
  },
  execute: async (input: unknown, context: ToolContext): Promise<ToolResult> => {
    const parsed = input as NewFileInput;
    return createFile(parsed, context);
  },
};
