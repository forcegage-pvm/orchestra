/**
 * listDirectory tool - List contents of a directory
 */

import * as path from "path";
import * as vscode from "vscode";
import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";

interface ListDirectoryInput {
  path: string;
}

function getAbsolutePath(workspaceRoot: string, filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(workspaceRoot, filePath);
}

async function listDirectoryContents(
  input: ListDirectoryInput,
  context: ToolContext,
): Promise<ToolResult> {
  try {
    const absolutePath = getAbsolutePath(context.workspaceRoot, input.path);
    const uri = vscode.Uri.file(absolutePath);
    const entries = await vscode.workspace.fs.readDirectory(uri);

    const outputLines = entries.map(([name, type]) => {
      if (type === vscode.FileType.Directory) {
        return `${name}/`;
      }
      return name;
    });

    return {
      success: true,
      output: outputLines.join("\n"),
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error reading directory";
    return {
      success: false,
      output: "",
      error: `Directory not found or unreadable: ${message}`,
    };
  }
}

export const listDirectoryTool: AgentTool = {
  name: "list_directory",
  description: "List files and folders within a directory.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the directory relative to workspace root",
      },
    },
    required: ["path"],
  },
  execute: async (
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    return listDirectoryContents(input as ListDirectoryInput, context);
  },
};
