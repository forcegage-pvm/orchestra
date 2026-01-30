/**
 * Coding tools index
 *
 * Barrel exports and registration helper for all coding tools.
 */

import { ToolRegistry } from "../../ToolRegistry.js";
import { createDirectoryTool } from "./createDirectory.js";
import { createFileTool } from "./createFile.js";
import { deleteFileTool } from "./deleteFile.js";
import { deleteSectionTool } from "./deleteSection.js";
import { editFileTool } from "./editFile.js";
import { editLinesTool } from "./editLines.js";
import { findUsagesTool } from "./findUsages.js";
import { grepSearchTool } from "./grepSearch.js";
import { insertAtLineTool } from "./insertAtLine.js";
import { listDirectoryTool } from "./listDirectory.js";
import { readFileTool } from "./readFile.js";
import { searchFilesTool } from "./searchFiles.js";
import { smartReplaceTool } from "./smartReplace.js";
import { validateEditTool } from "./validateEdit.js";

// Placeholder structure for upcoming file editing tools:
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
  smartReplaceTool,
  editLinesTool,
  insertAtLineTool,
  deleteSectionTool,
  validateEditTool,
] as const;

export function registerCodingTools(registry: ToolRegistry): void {
  registry.registerAll([...codingTools]);
}

export {
  createDirectoryTool,
  createFileTool,
  deleteFileTool,
  deleteSectionTool,
  editFileTool,
  editLinesTool,
  findUsagesTool,
  grepSearchTool,
  insertAtLineTool,
  listDirectoryTool,
  readFileTool,
  searchFilesTool,
  smartReplaceTool,
  validateEditTool,
};
