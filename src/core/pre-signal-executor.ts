/**
 * Pre-Signal Executor
 *
 * Executes actual build, test, and lint commands before allowing signal completion.
 * This replaces the trust-based approach where agents claim pass/fail status.
 *
 * Per GAP-01: Pre-signal checks must execute real commands, not trust claims.
 */

import { executeCommand, ExecuteResult } from "./command-executor.js";

/**
 * Configuration for pre-signal checks
 */
export interface PreSignalConfig {
  /** Workspace directory to run commands in */
  workspacePath: string;
  /** Build command (default: "npm run build") */
  buildCommand?: string;
  /** Test command (default: "npm test") */
  testCommand?: string;
  /** Lint command (default: undefined - skipped unless specified) */
  lintCommand?: string;
  /** Command timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
  /** Skip build check */
  skipBuild?: boolean;
  /** Skip test check */
  skipTest?: boolean;
  /** Skip lint check */
  skipLint?: boolean;
}

/**
 * Result of a single pre-signal check
 */
export interface PreSignalCheckResult {
  /** Whether the check passed */
  passed: boolean;
  /** Command output (stdout or stderr on failure) */
  output?: string;
  /** Execution duration in milliseconds */
  duration_ms: number;
  /** Whether the check timed out */
  timedOut?: boolean;
  /** Whether the check was skipped */
  skipped?: boolean;
}

/**
 * Combined result of all pre-signal checks
 */
export interface PreSignalResult {
  /** Build check result */
  build: PreSignalCheckResult;
  /** Test check result */
  test: PreSignalCheckResult;
  /** Lint check result */
  lint: PreSignalCheckResult;
  /** Whether all checks passed */
  allPassed: boolean;
}

/** Default build command */
const DEFAULT_BUILD_COMMAND = "npm run build";

/** Default test command */
const DEFAULT_TEST_COMMAND = "npm test";

/** Default timeout (5 minutes) */
const DEFAULT_TIMEOUT = 300000;

/**
 * Run pre-signal checks by executing actual commands
 *
 * @param config - Configuration for pre-signal checks
 * @returns Combined result of all checks
 *
 * @example
 * ```typescript
 * const result = await runPreSignalChecks({
 *   workspacePath: "/path/to/project",
 *   buildCommand: "npm run build",
 *   testCommand: "npm test",
 * });
 *
 * if (result.allPassed) {
 *   // Allow signal completion
 * } else {
 *   // Block with specific failures
 * }
 * ```
 */
export async function runPreSignalChecks(
  config: PreSignalConfig
): Promise<PreSignalResult> {
  const timeout = config.timeout ?? DEFAULT_TIMEOUT;
  const execOptions = {
    cwd: config.workspacePath,
    timeout,
  };

  // Run build check
  const buildResult = await runCheck(
    config.buildCommand ?? DEFAULT_BUILD_COMMAND,
    execOptions,
    config.skipBuild
  );

  // Run test check
  const testResult = await runCheck(
    config.testCommand ?? DEFAULT_TEST_COMMAND,
    execOptions,
    config.skipTest
  );

  // Run lint check (only if command is specified and not skipped)
  const lintResult = await runCheck(
    config.lintCommand,
    execOptions,
    config.skipLint || !config.lintCommand
  );

  const allPassed =
    buildResult.passed && testResult.passed && lintResult.passed;

  return {
    build: buildResult,
    test: testResult,
    lint: lintResult,
    allPassed,
  };
}

/**
 * Run a single check command
 */
async function runCheck(
  command: string | undefined,
  options: { cwd: string; timeout: number },
  skip?: boolean
): Promise<PreSignalCheckResult> {
  // Skip if requested or no command
  if (skip || !command) {
    return {
      passed: true,
      duration_ms: 0,
      skipped: true,
    };
  }

  const result = await executeCommand(command, options);

  return mapExecuteResult(result);
}

/**
 * Map ExecuteResult to PreSignalCheckResult
 */
function mapExecuteResult(result: ExecuteResult): PreSignalCheckResult {
  const checkResult: PreSignalCheckResult = {
    passed: result.success,
    duration_ms: result.duration,
  };

  // Include output on failure
  if (!result.success) {
    // Prefer stderr, fall back to stdout
    const output =
      result.stderr?.trim() || result.stdout?.trim() || result.error;
    if (output) {
      checkResult.output = output;
    }
  }

  // Include timeout flag
  if (result.timedOut) {
    checkResult.timedOut = true;
  }

  return checkResult;
}
