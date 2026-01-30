/**
 * Coding tools index
 *
 * Barrel exports and registration helper for all coding tools.
 */

import { ToolRegistry } from "../../ToolRegistry.js";
import { createDirectoryTool } from "./createDirectory.js";
import { createFileTool } from "./createFile.js";
import { deleteFileTool } from "./deleteFile.js";
import { editFileTool } from "./editFile.js";
import { findUsagesTool } from "./findUsages.js";
import { grepSearchTool } from "./grepSearch.js";
import { listDirectoryTool } from "./listDirectory.js";
import { readFileTool } from "./readFile.js";
import { searchFilesTool } from "./searchFiles.js";

// Placeholder structure for upcoming file editing tools:
// - smartReplace
// - editLines
// - insertAtLine
// - deleteSection
// - validateEdit
// - bulkReplace

export const codingTools = [
  readFileTool,
  editFileTool,
  createFileTool,
  createDirectoryTool,
  deleteFileTool,
  searchFilesTool,
  grepSearchTool,
  listDirectoryTool,
  findUsagesTool,
] as const;

export function registerCodingTools(registry: ToolRegistry): void {
  registry.registerAll([...codingTools]);
}

export {
  createDirectoryTool,
  createFileTool,
  deleteFileTool,
  editFileTool,
  findUsagesTool,
  grepSearchTool,
  listDirectoryTool,
  readFileTool,
  searchFilesTool,
};
