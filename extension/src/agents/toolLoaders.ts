/**
 * Tool loader helpers for agent roles
 */

import { ToolRegistry } from "./ToolRegistry.js";
import {
  grepSearchTool,
  listDirectoryTool,
  readFileTool,
  registerCodingTools,
  searchTool,
} from "./tools/coding/index.js";
import { registerOrchestraControllerTools } from "./tools/orchestra/controllerIndex.js";
import { registerOrchestraImplementorTools } from "./tools/orchestra/index.js";
import { registerOrchestraOrchestratorTools } from "./tools/orchestra/orchestratorIndex.js";
import { registerSystemTools } from "./tools/system/index.js";

/**
 * Register all tools available to the implementor role.
 */
export function loadImplementorTools(registry: ToolRegistry): void {
  registerCodingTools(registry);
  registerOrchestraImplementorTools(registry);
  registerSystemTools(registry);
}

/**
 * Register all tools available to the orchestrator role.
 */
export function loadOrchestratorTools(registry: ToolRegistry): void {
  registerCodingTools(registry);
  registerOrchestraOrchestratorTools(registry);
  registerSystemTools(registry);
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
    listDirectoryTool,
    searchTool,
    grepSearchTool,
  ]);
  // Controller gets ONLY controller-specific Orchestra tools (approve/reject)
  registerOrchestraControllerTools(registry);
}
