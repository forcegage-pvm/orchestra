/**
 * System tools index
 *
 * Barrel exports and registration helper for system tools.
 */

import { ToolRegistry } from "../../ToolRegistry.js";
import { fetchTool } from "./fetch.js";
import { getTerminalOutputTool } from "./getTerminalOutput.js";
import { problemsTool } from "./problems.js";
import { runCommandsTool } from "./runCommands.js";
import { runTasksTool } from "./runTasks.js";
import { runTerminalTool } from "./runTerminal.js";
import { runTestsTool } from "./runTests.js";

export const systemTools = [
  runCommandsTool,
  runTerminalTool,
  getTerminalOutputTool,
  runTasksTool,
  runTestsTool,
  problemsTool,
  fetchTool,
] as const;

export function registerSystemTools(registry: ToolRegistry): void {
  registry.registerAll([...systemTools]);
}

export {
  fetchTool,
  getTerminalOutputTool,
  problemsTool,
  runCommandsTool,
  runTasksTool,
  runTerminalTool,
  runTestsTool,
};
