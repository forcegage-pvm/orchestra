/**
 * Testing tools index
 *
 * Barrel exports and registration helper for testing tools.
 * Provides the scoped test execution pipeline for agents.
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
export { runTestsTool, promoteTestsTool, getTestResultsTool, listTestSuitesTool };

// Re-export types for convenience
export type {
  RunTestsInput,
  RunTestsResult,
  TestScope,
  TestOutcome,
  TestFailureDetail,
  PromoteTestsInput,
  PromoteTestsResult,
  PromotionTarget,
  RedPhaseResult,
  GetTestResultsInput,
  ListTestSuitesInput,
  ListTestSuitesResult,
  TierSummary,
  TestFileEntry,
  TestEntry,
  SuiteDetailLevel,
  ResultFormat,
} from "./types.js";

// Re-export pipeline modules for advanced usage
export { TestConfigLoader } from "./TestConfigLoader.js";
export { ScopeResolver } from "./ScopeResolver.js";
export { VitestRunner } from "./VitestRunner.js";
export { ResultFormatter } from "./ResultFormatter.js";
export { sharedResultStore } from "./sharedStore.js";
