/**
 * Tool loader helpers for agent roles
 */

import { ToolRegistry } from "./ToolRegistry.js";
import {
  findUsagesTool,
  grepSearchTool,
  listDirectoryTool,
  readFileTool,
  readFilesTool,
  registerCodingTools,
  searchFilesTool,
} from "./tools/coding/index.js";
import { registerFilesystemTools } from "./tools/filesystem/index.js";
import { registerOrchestraControllerTools } from "./tools/orchestra/controllerIndex.js";
import { registerOrchestraImplementorTools } from "./tools/orchestra/index.js";
import { registerOrchestraOrchestratorTools } from "./tools/orchestra/orchestratorIndex.js";
import { registerSystemTools } from "./tools/system/index.js";
import { registerTestingTools } from "./tools/testing/index.js";

/**
 * Register all tools available to the implementor role.
 */
export function loadImplementorTools(registry: ToolRegistry): void {
  registerCodingTools(registry);
  registerFilesystemTools(registry);
  registerOrchestraImplementorTools(registry);
  registerSystemTools(registry);
  registerTestingTools(registry);
}

/**
 * Register all tools available to the orchestrator role.
 */
export function loadOrchestratorTools(registry: ToolRegistry): void {
  registerCodingTools(registry);
  registerFilesystemTools(registry);
  registerOrchestraOrchestratorTools(registry);
  registerSystemTools(registry);
  registerTestingTools(registry);
}

/**
 * Register all tools available to the controller role.
 * Controller has LIMITED tools: read-only file access + judgment (approve/reject).
 */
export function loadControllerTools(registry: ToolRegistry): void {
  // Controller gets system tools for running commands/tests
  registerSystemTools(registry);
  // Controller gets read-only coding tools for file inspection
  registry.registerAll([
    readFileTool,
    readFilesTool,
    listDirectoryTool,
    searchFilesTool,
    grepSearchTool,
    findUsagesTool,
  ]);
  // Controller gets ONLY controller-specific Orchestra tools (approve/reject)
  registerOrchestraControllerTools(registry);
  // Controller gets testing tools for running scoped tests
  registerTestingTools(registry);
}
