/**
 * Pre-Signal Executor
 *
 * Executes actual build, test, and lint commands before allowing signal completion.
 * This replaces the trust-based approach where agents claim pass/fail status.
 *
 * Per GAP-01: Pre-signal checks must execute real commands, not trust claims.
 */

import * as fs from "node:fs";
import * as path from "node:path";
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
  /** Enable TDD red-phase test validation mode (expects test failures) */
  tddRedPhase?: boolean;
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

/** Default test command - excludes tdd-red directory for TDD red-phase support */
const DEFAULT_TEST_COMMAND = 'npm test -- --exclude="**/tdd-red/**"';

/** Default timeout (5 minutes) */
const DEFAULT_TIMEOUT = 300000;

/**
 * Detected project type for auto-configuring commands
 */
type ProjectType = "flutter" | "node" | "python" | "rust" | "go" | "unknown";

/**
 * Detect project type based on files present in workspace
 */
function detectProjectType(workspacePath: string): ProjectType {
  const exists = (file: string) =>
    fs.existsSync(path.join(workspacePath, file));

  if (exists("pubspec.yaml")) return "flutter";
  if (exists("package.json")) return "node";
  if (
    exists("pyproject.toml") ||
    exists("setup.py") ||
    exists("requirements.txt")
  )
    return "python";
  if (exists("Cargo.toml")) return "rust";
  if (exists("go.mod")) return "go";

  return "unknown";
}

/**
 * Get default commands for a project type
 */
function getDefaultCommands(projectType: ProjectType): {
  build: string;
  test: string;
  lint?: string;
} {
  switch (projectType) {
    case "flutter":
      return {
        build: "flutter analyze",
        // Always exclude tdd-red tests from normal test runs
        // TDD red-phase tests are only run explicitly via runTddRedPhaseTests
        test: "flutter test --exclude-tags tdd-red",
        lint: "dart format --set-exit-if-changed .",
      };
    case "python":
      return {
        build: "python -m py_compile .", // Basic syntax check
        test: "pytest",
        lint: "ruff check .",
      };
    case "rust":
      return {
        build: "cargo build",
        test: "cargo test",
        lint: "cargo clippy",
      };
    case "go":
      return {
        build: "go build ./...",
        test: "go test ./...",
        lint: "golangci-lint run",
      };
    case "node":
    default:
      return {
        build: DEFAULT_BUILD_COMMAND,
        test: DEFAULT_TEST_COMMAND,
      };
  }
}

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

  // Auto-detect project type if no commands specified
  const projectType = detectProjectType(config.workspacePath);
  const defaults = getDefaultCommands(projectType);

  // Run build check
  const buildResult = await runCheck(
    config.buildCommand ?? defaults.build,
    execOptions,
    config.skipBuild
  );

  // Run test check - ALWAYS use dual-command mode for TDD verification
  // This ensures:
  // 1. tdd-red tagged tests FAIL (they should be red phase tests)
  // 2. non-tdd-red tests PASS (all regular tests must pass)
  //
  // For tdd_red_phase=true: Implementor is creating failing tests (mandatory)
  // For tdd_red_phase=false: Any leftover tdd-red tests must still fail
  //                          (if they pass, tag should be removed)
  const testResult = await runTddRedPhaseTests(
    projectType,
    config.testCommand,
    execOptions,
    config.skipTest
  );

  // Run lint check (use detected default if available, or explicit config)
  const lintCommand = config.lintCommand ?? defaults.lint;
  const lintResult = await runCheck(
    lintCommand,
    execOptions,
    config.skipLint || !lintCommand
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

/**
 * Check if test output indicates no tests were found
 *
 * This handles the case where tagged tests don't exist (which is OK).
 * Different test frameworks have different output for "no tests found".
 *
 * @param result - Execution result from running tests
 * @param projectType - Project type for framework-specific detection
 * @returns true if the output indicates no tests were found
 */
function isNoTestsFoundOutput(
  result: ExecuteResult,
  projectType: ProjectType
): boolean {
  const output = (result.stdout || "") + (result.stderr || "");
  const outputLower = output.toLowerCase();

  switch (projectType) {
    case "flutter":
      // Flutter: "No tests ran" or "0 tests passed"
      return (
        outputLower.includes("no tests ran") ||
        outputLower.includes("no test files found") ||
        /0 tests? passed/i.test(output) ||
        /all tests passed.*0 tests/i.test(output)
      );

    case "node":
      // Jest/Vitest: "No tests found" or similar
      return (
        outputLower.includes("no tests found") ||
        outputLower.includes("no test files found") ||
        outputLower.includes("no tests to run") ||
        /tests?:\s*0\s*(passed|total)/i.test(output)
      );

    case "python":
      // Pytest: "no tests ran" or "collected 0 items"
      return (
        outputLower.includes("no tests ran") ||
        outputLower.includes("collected 0 items")
      );

    default:
      // Generic check for common patterns
      return (
        outputLower.includes("no tests") || outputLower.includes("0 tests")
      );
  }
}

/**
 * Run TDD red-phase tests with dual-command execution
 *
 * Executes two test commands:
 * 1. Tagged tests (expect FAILURE - exit code 1, OR no tests found)
 * 2. Non-tagged tests (expect SUCCESS - exit code 0)
 *
 * The key invariant: tdd-red tagged tests must FAIL if they exist.
 * If they pass, verification fails (tag should be removed or test is wrong).
 *
 * @param projectType - Detected project type (determines commands)
 * @param customTestCommand - Optional custom test command (overrides defaults)
 * @param options - Execution options (cwd, timeout)
 * @param skip - Whether to skip test execution
 * @returns Test check result (passed only if both commands match expectations)
 */
async function runTddRedPhaseTests(
  projectType: ProjectType,
  customTestCommand: string | undefined,
  options: { cwd: string; timeout: number },
  skip?: boolean
): Promise<PreSignalCheckResult> {
  // Skip if requested
  if (skip) {
    return {
      passed: true,
      duration_ms: 0,
      skipped: true,
    };
  }

  // Get TDD-specific commands for the project type
  const tddCommands = getTddCommands(projectType, customTestCommand);

  // Run tagged tests (expect FAILURE or no tests found)
  const taggedResult = await executeCommand(tddCommands.tagged, options);

  // Run non-tagged tests (expect SUCCESS)
  const nonTaggedResult = await executeCommand(tddCommands.nonTagged, options);

  // Validate results match expectations
  // Tagged tests: MUST fail OR have no tests (exit 0 with "no tests" output is OK)
  // The key rule: if tdd-red tests PASS (with actual tests), that's a verification failure
  const taggedTestsPassed =
    taggedResult.success && !isNoTestsFoundOutput(taggedResult, projectType);
  const taggedExpectation = !taggedTestsPassed; // Expect failure OR no tests

  const nonTaggedExpectation = nonTaggedResult.success; // Expect success (exit code 0)

  const passed = taggedExpectation && nonTaggedExpectation;
  const totalDuration = taggedResult.duration + nonTaggedResult.duration;

  // Build output message on failure
  let output: string | undefined;
  if (!passed) {
    const messages: string[] = [];

    if (!taggedExpectation) {
      messages.push(
        `TDD verification failed: Tests tagged with 'tdd-red' PASSED but should FAIL.\n` +
          `This indicates either:\n` +
          `  - The test was implemented but the tdd-red tag wasn't removed\n` +
          `  - The test was written incorrectly (passes when it shouldn't)\n` +
          `Action: Remove the tdd-red tag from tests that pass, or fix the test.\n` +
          `Command: ${tddCommands.tagged}\n` +
          `Output: ${
            taggedResult.stdout || taggedResult.stderr || "(no output)"
          }`
      );
    }

    if (!nonTaggedExpectation) {
      messages.push(
        `Test verification failed: Non-tagged tests FAILED but should PASS.\n` +
          `Action: Fix the failing tests or add tdd-red tag if creating RED phase tests.\n` +
          `Command: ${tddCommands.nonTagged}\n` +
          `Output: ${
            nonTaggedResult.stderr || nonTaggedResult.stdout || "(no output)"
          }`
      );
    }

    output = messages.join("\n\n");
  }

  // Build result object conditionally to comply with exactOptionalPropertyTypes
  const result: PreSignalCheckResult = {
    passed,
    duration_ms: totalDuration,
  };

  if (output !== undefined) {
    result.output = output;
  }

  if (taggedResult.timedOut || nonTaggedResult.timedOut) {
    result.timedOut = true;
  }

  return result;
}

/**
 * Get TDD-specific test commands for a project type
 *
 * Returns commands for:
 * - Tagged tests (run TDD red-phase tests only)
 * - Non-tagged tests (run all tests except TDD red-phase)
 *
 * @param projectType - Detected project type
 * @param customTestCommand - Optional custom base test command
 * @returns Object with tagged and nonTagged command strings
 */
function getTddCommands(
  projectType: ProjectType,
  customTestCommand?: string
): { tagged: string; nonTagged: string } {
  switch (projectType) {
    case "flutter":
      return {
        tagged: "flutter test --tags tdd-red",
        nonTagged: "flutter test --exclude-tags tdd-red",
      };

    case "node":
      // If custom command provided, use it as base
      if (customTestCommand) {
        return {
          tagged: `${customTestCommand} --testNamePattern="\\[tdd-red\\]"`,
          nonTagged: `${customTestCommand} --exclude="**/tdd-red/**"`,
        };
      }
      return {
        tagged: 'npm test -- --testNamePattern="\\[tdd-red\\]"',
        nonTagged: 'npm test -- --exclude="**/tdd-red/**"',
      };

    case "python":
      return {
        tagged: "pytest tests/tdd_red",
        nonTagged: "pytest --ignore=tests/tdd_red",
      };

    case "rust":
      return {
        tagged: "cargo test tdd_red",
        nonTagged: "cargo test --exclude tdd_red",
      };

    case "go":
      return {
        tagged: "go test ./tdd-red/...",
        nonTagged: "go test $(go list ./... | grep -v tdd-red)",
      };

    case "unknown":
    default:
      // Fallback to Node.js pattern (Vitest compatible)
      return {
        tagged: 'npm test -- --testNamePattern="\\[tdd-red\\]"',
        nonTagged: 'npm test -- --exclude="**/tdd-red/**"',
      };
  }
}
