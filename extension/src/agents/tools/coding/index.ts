/**
 * Coding tools index
 *
 * Barrel exports and registration helper for all coding tools.
 */

import { ToolRegistry } from "../../ToolRegistry.js";
import { deleteFileTool } from "./deleteFile.js";
import { editTool } from "./edit.js";
import { grepSearchTool } from "./grepSearch.js";
import { listDirectoryTool } from "./listDirectory.js";
import { newFileTool } from "./newFile.js";
import { readFileTool } from "./readFile.js";
import { searchTool } from "./search.js";
import { testFailureTool } from "./testFailure.js";
import { usagesTool } from "./usages.js";

export const codingTools = [
  readFileTool,
  editTool,
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
  readFileTool,
  editTool,
  newFileTool,
  deleteFileTool,
  searchTool,
  grepSearchTool,
  listDirectoryTool,
  usagesTool,
  testFailureTool,
};
