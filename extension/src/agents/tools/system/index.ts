/**
 * System tools index
 *
 * Barrel exports and registration helper for system tools.
 */

import { ToolRegistry } from "../../ToolRegistry.js";
import { fetchTool } from "./fetch.js";
import { getTerminalOutputTool } from "./getTerminalOutput.js";
import { getTestFailuresTool } from "./getTestFailures.js";
import { problemsTool } from "./problems.js";
import { runCommandsTool } from "./runCommands.js";
import { runTaskTool } from "./runTask.js";
import { runTerminalTool } from "./runTerminal.js";
import { runTestsTool } from "./runTests.js";

export const systemTools = [
  runCommandsTool,
  runTerminalTool,
  getTerminalOutputTool,
  runTaskTool,
  runTestsTool,
  getTestFailuresTool,
  problemsTool,
  fetchTool,
] as const;

export function registerSystemTools(registry: ToolRegistry): void {
  registry.registerAll([...systemTools]);
}

export {
  fetchTool,
  getTerminalOutputTool,
  getTestFailuresTool,
  problemsTool,
  runCommandsTool,
  runTaskTool,
  runTerminalTool,
  runTestsTool,
};
