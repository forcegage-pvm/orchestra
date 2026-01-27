/**
 * Orchestra orchestrator tools index
 *
 * Barrel exports and registration helper for all orchestrator tools.
 */

import { ToolRegistry } from "../../ToolRegistry.js";
import { getSprintStatusTool } from "./getSprintStatus.js";
import { prepareTaskTool } from "./prepareTask.js";
import { runVerificationChecksTool } from "./runVerificationChecks.js";
import { submitVerificationJudgmentTool } from "./submitVerificationJudgment.js";

export const orchestraOrchestratorTools = [
  getSprintStatusTool,
  prepareTaskTool,
  runVerificationChecksTool,
  submitVerificationJudgmentTool,
] as const;

export function registerOrchestraOrchestratorTools(
  registry: ToolRegistry,
): void {
  registry.registerAll([...orchestraOrchestratorTools]);
}

export {
  getSprintStatusTool,
  prepareTaskTool,
  runVerificationChecksTool,
  submitVerificationJudgmentTool,
};
