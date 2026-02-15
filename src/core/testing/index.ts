/**
 * Shared testing pipeline — barrel exports
 *
 * This is the canonical location for the test execution pipeline.
 * Both the VS Code extension and the MCP pre-signal executor consume these modules.
 *
 * Pipeline: TestConfigLoader → ScopeResolver → VitestRunner → ResultFormatter
 */

// Error types (canonical source)
export { ToolErrorCode, createToolError, type ToolError } from "./errors.js";

// Configuration
export { TestConfigLoader } from "./TestConfigLoader.js";
export type {
  LoadConfigFailure,
  LoadConfigResult,
  LoadConfigSuccess,
  TestConfig,
  TestTier,
} from "./TestConfigLoader.js";

// Scope resolution
export { ScopeResolver } from "./ScopeResolver.js";
export type {
  GetLastFailedTestsFn,
  ResolveOptions,
  ScopeResult,
} from "./ScopeResolver.js";

// Change detection
export { ChangeResolver } from "./ChangeResolver.js";
export type { ChangeResult } from "./ChangeResolver.js";

// Test execution
export { VitestRunner } from "./VitestRunner.js";
export type { VitestRunOptions, VitestRunResult } from "./VitestRunner.js";

// Result formatting
export { ResultFormatter } from "./ResultFormatter.js";
export type { FormatOptions } from "./ResultFormatter.js";

// Fingerprinting
export { FingerprintComputer } from "./FingerprintComputer.js";
export type { FingerprintResult } from "./FingerprintComputer.js";

// Result storage
export { TestResultStore } from "./TestResultStore.js";

// Command interception
export { TestCommandInterceptor } from "./TestCommandInterceptor.js";

// Types (Zod schemas + TypeScript interfaces)
export {
  ChangeSourceSchema,
  ExecutionLock,
  GetTestResultsInputSchema,
  ListTestSuitesInputSchema,
  PromoteTestsInputSchema,
  ResultFormatSchema,
  RunTestsInputSchema,
  SuiteDetailLevelSchema,
  TestScopeSchema,
} from "./types.js";

export type {
  CacheEntry,
  CacheKey,
  ChangeSource,
  GetTestResultsInput,
  ListTestSuitesInput,
  ListTestSuitesResult,
  PromoteTestsInput,
  PromoteTestsResult,
  PromotionBlockedRecord,
  PromotionRecord,
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
  TestSelectionInfo,
  TierSummary,
} from "./types.js";
