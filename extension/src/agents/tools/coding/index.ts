/**
 * Coding tools index
 *
 * Barrel exports and registration helper for all coding tools.
 */

import { ToolRegistry } from "../../ToolRegistry.js";
import { deleteFileTool } from "./deleteFile.js";
import { editFileTool } from "./editFile.js";
import { grepSearchTool } from "./grepSearch.js";
import { listDirectoryTool } from "./listDirectory.js";
import { newFileTool } from "./newFile.js";
import { readFileTool } from "./readFile.js";
import { searchTool } from "./search.js";
import { testFailureTool } from "./testFailure.js";
import { usagesTool } from "./usages.js";

export const codingTools = [
  readFileTool,
  editFileTool,
  newFileTool,
  deleteFileTool,
  searchTool,
  grepSearchTool,
  listDirectoryTool,
  usagesTool,
  testFailureTool,
] as const;

export function registerCodingTools(registry: ToolRegistry): void {
  registry.registerAll([...codingTools]);
}

export {
  deleteFileTool,
  editFileTool,
  grepSearchTool,
  listDirectoryTool,
  newFileTool,
  readFileTool,
  searchTool,
  testFailureTool,
  usagesTool,
};
