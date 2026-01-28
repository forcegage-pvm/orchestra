/**
 * Tool loader helpers for agent roles
 */

import { ToolRegistry } from "./ToolRegistry.js";
import { registerCodingTools } from "./tools/coding/index.js";
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
 * Controller has LIMITED tools: read-only + judgment (approve/reject).
 */
export function loadControllerTools(registry: ToolRegistry): void {
  // Controller gets system tools for file reading
  registerSystemTools(registry);
  // Controller gets ONLY controller-specific Orchestra tools (no coding tools)
  registerOrchestraControllerTools(registry);
}
