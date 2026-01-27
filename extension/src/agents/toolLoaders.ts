/**
 * Tool loader helpers for agent roles
 */

import { ToolRegistry } from "./ToolRegistry.js";
import { registerCodingTools } from "./tools/coding/index.js";
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
