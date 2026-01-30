/**
 * System tools index
 *
 * Barrel exports and registration helper for system tools.
 */

import { ToolRegistry } from "../../ToolRegistry.js";
import { getProblemsTool } from "./getProblems.js";
import { getTerminalOutputTool } from "./getTerminalOutput.js";
import { getTestFailuresTool } from "./getTestFailures.js";
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
  getProblemsTool,
] as const;

export function registerSystemTools(registry: ToolRegistry): void {
  registry.registerAll([...systemTools]);
}

export {
  getProblemsTool,
  getTerminalOutputTool,
  getTestFailuresTool,
  runCommandsTool,
  runTaskTool,
  runTerminalTool,
  runTestsTool,
};
