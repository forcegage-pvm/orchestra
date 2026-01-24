/**
 * Orchestra implementor tools index
 *
 * Barrel exports and registration helper for all Orchestra tools.
 */

import { ToolRegistry } from "../../ToolRegistry.js";
import { escalateTaskTool } from "./escalateTask.js";
import { getCurrentTaskTool } from "./getCurrentTask.js";
import { getFeedbackTool } from "./getFeedback.js";
import { getProgressTool } from "./getProgress.js";
import { signalCompletionTool } from "./signalCompletion.js";

export const orchestraImplementorTools = [
  getCurrentTaskTool,
  getFeedbackTool,
  signalCompletionTool,
  getProgressTool,
  escalateTaskTool,
] as const;

export function registerOrchestraImplementorTools(
  registry: ToolRegistry,
): void {
  registry.registerAll([...orchestraImplementorTools]);
}

export {
  escalateTaskTool,
  getCurrentTaskTool,
  getFeedbackTool,
  getProgressTool,
  signalCompletionTool,
};
