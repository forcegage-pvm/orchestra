/**
 * System tools index
 *
 * Barrel exports and registration helper for system tools.
 */

import { ToolRegistry } from "../../ToolRegistry.js";
import { fetchTool } from "./fetch.js";
import { problemsTool } from "./problems.js";
import { runCommandsTool } from "./runCommands.js";
import { runTasksTool } from "./runTasks.js";
import { runTestsTool } from "./runTests.js";

export const systemTools = [
  runCommandsTool,
  runTasksTool,
  runTestsTool,
  problemsTool,
  fetchTool,
] as const;

export function registerSystemTools(registry: ToolRegistry): void {
  registry.registerAll([...systemTools]);
}

export { fetchTool, problemsTool, runCommandsTool, runTasksTool, runTestsTool };
