/**
 * System tools index
 *
 * Barrel exports and registration helper for system tools.
 */

import { ToolRegistry } from "../../ToolRegistry.js";
import { executeWithRetryTool } from "./executeWithRetry.js";
import { findPortProcessTool } from "./findPortProcess.js";
import { getProblemsTool } from "./getProblems.js";
import { getProcessOutputTool } from "./getProcessOutput.js";
import { getTerminalOutputTool } from "./getTerminalOutput.js";
import { getTestFailuresTool } from "./getTestFailures.js";
import { listProcessesTool } from "./listProcesses.js";
import { runCommandTool } from "./runCommand.js";
import { runTaskTool } from "./runTask.js";
import { runTerminalTool } from "./runTerminal.js";
import { runTestsTool } from "./runTests.js";
import { sendInputTool } from "./sendInput.js";
import { startProcessTool } from "./startProcess.js";
import { stopProcessTool } from "./stopProcess.js";
import { waitForInputTool } from "./waitForInput.js";
import { waitForPatternTool } from "./waitForPattern.js";

export const systemTools = [
  startProcessTool,
  stopProcessTool,
  getProcessOutputTool,
  listProcessesTool,
  sendInputTool,
  waitForPatternTool,
  waitForInputTool,
  findPortProcessTool,
  executeWithRetryTool,
  runCommandTool,
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
  executeWithRetryTool,
  findPortProcessTool,
  getProblemsTool,
  getProcessOutputTool,
  getTerminalOutputTool,
  getTestFailuresTool,
  listProcessesTool,
  runCommandTool,
  runTaskTool,
  runTerminalTool,
  runTestsTool,
  sendInputTool,
  startProcessTool,
  stopProcessTool,
  waitForInputTool,
  waitForPatternTool,
};
