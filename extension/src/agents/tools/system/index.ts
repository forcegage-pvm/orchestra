/**
 * System tools index
 *
 * Barrel exports and registration helper for system tools.
 */

import { ToolRegistry } from "../../ToolRegistry.js";
import { getProblemsTool } from "./getProblems.js";
import { getProcessOutputTool } from "./getProcessOutput.js";
import { getTerminalOutputTool } from "./getTerminalOutput.js";
import { getTestFailuresTool } from "./getTestFailures.js";
import { listProcessesTool } from "./listProcesses.js";
import { runTaskTool } from "./runTask.js";
import { runTerminalTool } from "./runTerminal.js";
import { runTestsTool } from "./runTests.js";
import { startProcessTool } from "./startProcess.js";
import { stopProcessTool } from "./stopProcess.js";

// Placeholder structure for upcoming terminal tools:
// - startProcess
// - stopProcess
// - getProcessOutput
// - listProcesses
// - sendInput
// - waitForPattern

export const systemTools = [
  startProcessTool,
  stopProcessTool,
  getProcessOutputTool,
  listProcessesTool,
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
  getProcessOutputTool,
  getTerminalOutputTool,
  getTestFailuresTool,
  listProcessesTool,
  runTaskTool,
  runTerminalTool,
  runTestsTool,
  startProcessTool,
  stopProcessTool,
};
