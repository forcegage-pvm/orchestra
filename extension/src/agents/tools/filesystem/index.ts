/**
 * Filesystem tools index
 *
 * Exports filesystem operation tools for AI coding agents.
 */

import { ToolRegistry } from "../../ToolRegistry.js";
import { copyFileTool } from "./copyFile.js";
import { moveDirectoryTool } from "./moveDirectory.js";
import { moveFileTool } from "./moveFile.js";

export const filesystemTools = [
  copyFileTool,
  moveDirectoryTool,
  moveFileTool,
] as const;

export function registerFilesystemTools(registry: ToolRegistry): void {
  registry.registerAll([...filesystemTools]);
}

export { copyFileTool, moveDirectoryTool, moveFileTool };
