/**
 * Framework-agnostic test runner contract.
 */

/**
 * Supported test frameworks.
 */
export type TestFramework = "vitest" | "dart" | "flutter";

/**
 * Single normalized test outcome.
 */
export interface NormalizedTestOutcome {
  name: string;
  file: string;
  line?: number;
  status: "passed" | "failed" | "skipped";
  duration?: number;
  failure?: {
    message: string;
    expected?: string;
    actual?: string;
    stack: string[];
  };
}

/**
 * Framework-agnostic run options.
 */
export interface TestRunOptions {
  files: string[];
  pattern?: string;
  workingDir: string;
  timeout?: number;
  relatedFiles?: string[];
  excludeTags?: string[];
  includeTags?: string[];
}

/**
 * Standardized output from any runner.
 */
export interface TestRunOutput {
  exitCode: number;
  duration: number;
  tests: NormalizedTestOutcome[];
  frameworkDuration?: number;
  rawOutput?: string;
}

/**
 * Framework-agnostic test runner interface.
 */
export interface TestRunner {
  readonly framework: TestFramework;
  execute(options: TestRunOptions): Promise<TestRunOutput>;
  buildCommand(options: TestRunOptions): string[];
}
