/**
 * Coding tools index
 *
 * Barrel exports and registration helper for all coding tools.
 */

import { ToolRegistry } from "../../ToolRegistry.js";
import { autoFixFileTool } from "./autoFixFile.js";
import { bulkReplaceTool } from "./bulkReplace.js";
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
import { readFilesTool } from "./readFiles.js";
import { searchFilesTool } from "./searchFiles.js";
import { smartReplaceTool } from "./smartReplace.js";
import { smartReplacesTool } from "./smartReplaces.js";
import { validateEditTool } from "./validateEdit.js";

export const codingTools = [
  readFileTool,
  readFilesTool,
  editFileTool,
  createFileTool,
  createDirectoryTool,
  deleteFileTool,
  searchFilesTool,
  grepSearchTool,
  listDirectoryTool,
  findUsagesTool,
  smartReplaceTool,
  smartReplacesTool,
  editLinesTool,
  insertAtLineTool,
  deleteSectionTool,
  validateEditTool,
  bulkReplaceTool,
  autoFixFileTool,
] as const;

export function registerCodingTools(registry: ToolRegistry): void {
  registry.registerAll([...codingTools]);
}

export {
  autoFixFileTool,
  bulkReplaceTool,
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
  readFilesTool,
  readFileTool,
  searchFilesTool,
  smartReplacesTool,
  smartReplaceTool,
  validateEditTool,
};
