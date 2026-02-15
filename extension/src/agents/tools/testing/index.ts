/**
 * Testing tools index
 *
 * Barrel exports and registration helper for testing tools.
 * Provides the scoped test execution pipeline for agents.
 *
 * Pipeline modules live in src/core/testing/ (shared with MCP pre-signal executor).
 * Tool wrappers (AgentTool implementations) live here in the extension.
 */

import type { ToolRegistry } from "../../ToolRegistry.js";
import { getTestResultsTool } from "./getTestResults.js";
import { listTestSuitesTool } from "./listTestSuites.js";
import { promoteTestsTool } from "./promoteTests.js";
import { runTestsTool } from "./runTests.js";

/**
 * All testing tools available for registration.
 */
export const testingTools = [
  runTestsTool,
  promoteTestsTool,
  getTestResultsTool,
  listTestSuitesTool,
] as const;

/**
 * Register all testing tools with the given registry.
 * @param registry ToolRegistry instance to register tools with
 */
export function registerTestingTools(registry: ToolRegistry): void {
  registry.registerAll([...testingTools]);
}

// Export individual tools for direct access
export {
  getTestResultsTool,
  listTestSuitesTool,
  promoteTestsTool,
  runTestsTool,
};

// Re-export types for convenience (from shared pipeline)
export type {
  GetTestResultsInput,
  ListTestSuitesInput,
  ListTestSuitesResult,
  PromoteTestsInput,
  PromoteTestsResult,
  PromotionTarget,
  RedPhaseResult,
  ResultFormat,
  RunTestsInput,
  RunTestsResult,
  SuiteDetailLevel,
  TestEntry,
  TestFailureDetail,
  TestFileEntry,
  TestOutcome,
  TestScope,
  TierSummary,
} from "../../../../../src/core/testing/types.js";

// Re-export pipeline modules for advanced usage (from shared pipeline)
export { ResultFormatter } from "../../../../../src/core/testing/ResultFormatter.js";
export { ScopeResolver } from "../../../../../src/core/testing/ScopeResolver.js";
export { TestConfigLoader } from "../../../../../src/core/testing/TestConfigLoader.js";
export { VitestRunner } from "../../../../../src/core/testing/VitestRunner.js";
export { sharedResultStore } from "./sharedStore.js";
