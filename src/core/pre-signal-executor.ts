/**
 * Pre-Signal Executor
 *
 * Executes actual build, test, and lint commands before allowing signal completion.
 * This replaces the trust-based approach where agents claim pass/fail status.
 *
 * Per GAP-01: Pre-signal checks must execute real commands, not trust claims.
 */

import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import { getDb } from "../db/index.js";
import { tddRedRegistry, tddTaskRelationships } from "../db/schema.js";
import { executeCommand, ExecuteResult } from "./command-executor.js";
import {
  runAllNonInvertedTiers,
  runTestsCore,
} from "./pre-signal-test-adapter.js";
import { validateTddRedPhase } from "./tdd-validation.js";

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
  /** Task ID for TDD validation (required when tddRedPhase=true) */
  taskId?: number;
  /** Enable green-phase verification mode (runs only linked red task test files) */
  greenPhase?: boolean;
  /** Linked red task file paths (populated when greenPhase=true) */
  linkedRedTaskFiles?: string[];
  /** Sprint ID for updating tdd_task_relationships (required when greenPhase=true) */
  greenPhaseSprintId?: string;
  /** Internal task ID of the green task (required when greenPhase=true) */
  greenPhaseTaskId?: number;
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
  /** TDD validation result (only present when tddRedPhase=true) */
  tddValidation?: {
    success: boolean;
    errors: Array<{
      type: string;
      message: string;
      testIdentifier?: string;
      details?: string;
    }>;
    validatedCount: number;
  };
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
 * Detected project type for auto-configuring commands
 */
export type ProjectType =
  | "flutter"
  | "node"
  | "python"
  | "rust"
  | "go"
  | "unknown";

/**
 * Detect project type based on files present in workspace
 */
export function detectProjectType(workspacePath: string): ProjectType {
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
        // Exclude red-phase tests from normal runs via Flutter's tag system
        // Red-phase tests are only run explicitly via runTddRedPhaseTests
test: "flutter test --exclude-tags red",        lint: "dart format .",
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
  config: PreSignalConfig,
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
    config.skipBuild,
  );

  // Run test check - mode depends on task type:
  // - greenPhase=true: Run only linked red task test files (green phase verification)
  // - tdd_red_phase=true: Use TDD verification (red tests must FAIL)
  // - Otherwise: Use normal test mode (all tests must PASS)
  let testResult: PreSignalCheckResult;
  if (
    config.greenPhase &&
    config.linkedRedTaskFiles &&
    config.linkedRedTaskFiles.length > 0
  ) {
    // Green-phase: Run ONLY linked red task test files
    testResult = await runGreenPhaseVerification(
      config.workspacePath,
      config.linkedRedTaskFiles,
      config.skipTest,
    );
  } else if (config.tddRedPhase) {
    // TDD red-phase: Run red tier via runTestsCore with inverted logic
    const redResult = await runTddRedPhaseTests(
      config.workspacePath,
      config.skipTest,
    );
    // Also verify non-red tests still pass (no regressions from red-phase work)
    if (redResult.passed && !config.skipTest) {
      const nonRedResult = await runNormalTestsViaTiers(
        config.workspacePath,
        config.skipTest,
      );
      if (!nonRedResult.passed) {
        testResult = {
          passed: false,
          duration_ms: redResult.duration_ms + nonRedResult.duration_ms,
          output: `Red-phase tests correct (failing as expected), but non-red tests have regressions: ${nonRedResult.output ?? "Tests failed"}`,
        };
        if (nonRedResult.timedOut) {
          testResult.timedOut = true;
        }
      } else {
        // Both passed
        testResult = {
          passed: true,
          duration_ms: redResult.duration_ms + nonRedResult.duration_ms,
        };
      }
    } else {
      testResult = redResult;
    }
  } else {
    // Normal mode: Run all non-red tiers via runTestsCore
    testResult = await runNormalTestsViaTiers(
      config.workspacePath,
      config.skipTest,
    );
  }

  // Run lint check (use detected default if available, or explicit config)
  const lintCommand = config.lintCommand ?? defaults.lint;
  const lintResult = await runCheck(
    lintCommand,
    execOptions,
    config.skipLint || !lintCommand,
  );

  // Run TDD validation if tddRedPhase is enabled
  let tddValidation: PreSignalResult["tddValidation"];
  if (config.tddRedPhase && config.taskId !== undefined) {
    const tddResult = await validateTddRedPhase({
      taskId: config.taskId,
      workspaceRoot: config.workspacePath,
    });
    tddValidation = tddResult;
  }

  const allPassed =
    buildResult.passed &&
    testResult.passed &&
    lintResult.passed &&
    (tddValidation?.success ?? true);

  const result: PreSignalResult = {
    build: buildResult,
    test: testResult,
    lint: lintResult,
    allPassed,
  };

  if (tddValidation !== undefined) {
    result.tddValidation = tddValidation;
  }

  // FR-031: On green phase verification success, update tdd_task_relationships.completed_at
  if (
    allPassed &&
    config.greenPhase &&
    config.greenPhaseTaskId !== undefined &&
    config.greenPhaseSprintId !== undefined
  ) {
    await setGreenPhaseCompleted(
      config.greenPhaseSprintId,
      config.greenPhaseTaskId,
    );
  }

  return result;
}

/**
 * Run normal test verification using runAllNonInvertedTiers (FR-001: scope=all).
 *
 * Delegates to the shared runAllNonInvertedTiers helper which reads
 * .agent-test-config.json, filters out inverted tiers, and runs each tier
 * via runTestsCore. Aggregates results into a single PreSignalCheckResult.
 *
 * @param workspacePath - Workspace root path
 * @param skip - Whether to skip test execution
 * @returns Aggregated test check result
 */
async function runNormalTestsViaTiers(
  workspacePath: string,
  skip?: boolean,
): Promise<PreSignalCheckResult> {
  // Skip if requested
  if (skip) {
    return {
      passed: true,
      duration_ms: 0,
      skipped: true,
    };
  }

  // FR-001: Use shared runAllNonInvertedTiers (equivalent to run_tests scope=all)
  const tierResults = await runAllNonInvertedTiers(workspacePath);

  // No tiers configured — pass with warning
  if (tierResults.length === 0) {
    return {
      passed: true,
      duration_ms: 0,
      output: "No tests found",
    };
  }

  // Aggregate results
  let totalFailed = 0;
  let totalDuration = 0;
  let anyTimedOut = false;

  for (const tr of tierResults) {
    totalFailed += tr.failed;
    totalDuration += tr.duration_ms;
    if (tr.timedOut) {
      anyTimedOut = true;
    }
  }

  const passed = totalFailed === 0 && !anyTimedOut;

  const checkResult: PreSignalCheckResult = {
    passed,
    duration_ms: totalDuration,
  };

  if (anyTimedOut) {
    checkResult.timedOut = true;
    const timedOutTiers = tierResults
      .filter((tr) => tr.timedOut)
      .map((tr) => tr.tier)
      .join(", ");
    checkResult.output = `Test execution timed out for tier(s): ${timedOutTiers}`;
  } else if (!passed) {
    // FR-005: Minimal failure output with exact message
    checkResult.output =
      "Tests failed. Run 'run_tests scope=all' for detailed diagnostics.";
  }

  return checkResult;
}

/**
 * Run a single check command
 */
async function runCheck(
  command: string | undefined,
  options: { cwd: string; timeout: number },
  skip?: boolean,
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
  if (!result) {
    return {
      passed: false,
      duration_ms: 0,
      output: "Command execution failed: no result returned",
    };
  }

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
 * Run TDD red-phase tests using runTestsCore with inverted logic.
 *
 * Runs the "red" tier from .agent-test-config.json via runTestsCore.
 * Applies inverted result interpretation:
 * - If tests have failures (failed > 0) → PASS (failures expected in red phase)
 * - If ALL tests pass (failed === 0, total > 0) → FAIL (tests should be promoted)
 * - If no tests found (total === 0) → FAIL (red-phase task requires tests)
 *
 * @param workspacePath - Workspace root path
 * @param skip - Whether to skip test execution
 * @returns Test check result with inverted logic applied
 */
async function runTddRedPhaseTests(
  workspacePath: string,
  skip?: boolean,
): Promise<PreSignalCheckResult> {
  // Skip if requested
  if (skip) {
    return {
      passed: true,
      duration_ms: 0,
      skipped: true,
    };
  }

  // Run the "red" tier via runTestsCore
  const result = await runTestsCore({
    tier: "red",
    workspacePath,
  });

  // No tests found — fail with descriptive message
  // Include upstream diagnostic info so we can see WHY there are no tests
  if (result.total === 0) {
    const diagnostic = result.output
      ? ` (reason: ${result.output})`
      : ` (workspacePath: ${workspacePath})`;
    return {
      passed: false,
      duration_ms: result.duration_ms,
      output: `Task requires TDD red-phase tests but none found${diagnostic}`,
    };
  }

  // All tests pass — fail (tests need promotion out of red)
  if (result.failed === 0 && result.total > 0) {
    const checkResult: PreSignalCheckResult = {
      passed: false,
      duration_ms: result.duration_ms,
      output: "All red-phase tests pass. Promote tests from test/red/.",
    };
    return checkResult;
  }

  // Tests have failures — PASS (expected in red phase)
  return {
    passed: true,
    duration_ms: result.duration_ms,
  };
}

/**
 * Load test file paths linked to a red task from the tdd_red_registry.
 *
 * Queries the tdd_red_registry for all test files associated with the given
 * red_task_id (internal DB id). Returns an array of relative file paths.
 *
 * Per FR-026: This function loads test file paths from tdd_red_registry
 * for the linked red_task_id.
 *
 * @param redTaskId - Internal DB id of the red-phase task
 * @returns Array of relative test file paths
 */
export async function loadLinkedRedTaskFiles(
  redTaskId: number,
): Promise<string[]> {
  const db = getDb();

  const entries = await db
    .select({ test_file: tddRedRegistry.test_file })
    .from(tddRedRegistry)
    .where(eq(tddRedRegistry.red_task_id, redTaskId));

  return entries.map((e) => e.test_file);
}

/**
 * Run green-phase verification by executing ONLY the linked red task's test files.
 *
 * Per FR-028: Runs ONLY the linked red task's test files, not entire tiers.
 * Per FR-029: Pass if all linked tests pass (exit code 0).
 * Per FR-030: Fail with 'Linked red-phase tests still failing' if any test fails.
 *
 * Test files may have been promoted from test/red/{tier}/ to test/{tier}/,
 * so both locations are checked.
 *
 * @param workspacePath - Workspace root path
 * @param linkedFiles - Array of relative test file paths from the red registry
 * @param skip - Whether to skip test execution
 * @returns PreSignalCheckResult with pass/fail and appropriate message
 */
export async function runGreenPhaseVerification(
  workspacePath: string,
  linkedFiles: string[],
  skip?: boolean,
): Promise<PreSignalCheckResult> {
  if (skip) {
    return {
      passed: true,
      duration_ms: 0,
      skipped: true,
    };
  }

  if (linkedFiles.length === 0) {
    return {
      passed: false,
      duration_ms: 0,
      output: "No linked red-phase test files found for green verification",
    };
  }

  // Resolve actual file paths - check both original and promoted locations
  const resolvedFiles: string[] = [];
  for (const file of linkedFiles) {
    const absolutePath = path.join(workspacePath, file);
    if (fs.existsSync(absolutePath)) {
      resolvedFiles.push(file);
    } else {
      // Check if promoted from test/red/{tier}/ to test/{tier}/
      const promotedPath = file.replace(/test\/red\//, "test/");
      const promotedAbsolute = path.join(workspacePath, promotedPath);
      if (fs.existsSync(promotedAbsolute)) {
        resolvedFiles.push(promotedPath);
      }
      // If neither exists, the file is missing — it will cause test failure
    }
  }

  if (resolvedFiles.length === 0) {
    return {
      passed: false,
      duration_ms: 0,
      output:
        "Linked red-phase tests still failing: no test files found at expected paths",
    };
  }

  // Run tests via runTestsCore with specific file paths (FR-037, SC-003)
  const result = await runTestsCore({
    tier: "green",
    workspacePath,
    files: resolvedFiles,
  });

  if (result.failed === 0 && result.total > 0) {
    // All tests passed — green phase verification succeeds (FR-029)
    return {
      passed: true,
      duration_ms: result.duration_ms,
    };
  }

  // Handle total === 0 separately — Vitest found no tests, not a test failure
  if (result.total === 0) {
    return {
      passed: false,
      duration_ms: result.duration_ms,
      output: `Linked red-phase tests still failing: Vitest collected 0 tests for files: ${resolvedFiles.join(", ")}${result.output ? ` (${result.output})` : ""}`,
    };
  }

  // Tests failed — green phase verification fails (FR-030)
  return {
    passed: false,
    duration_ms: result.duration_ms,
    output: `Linked red-phase tests still failing${result.output ? `: ${result.output}` : ""}`,
  };
}

/**
 * Update tdd_task_relationships.completed_at on green phase success.
 *
 * Per FR-031: On successful green phase verification, set completed_at
 * to the current timestamp for the relationship row matching the green task.
 *
 * @param sprintId - Sprint ID
 * @param greenTaskId - Internal DB id of the green task
 */
async function setGreenPhaseCompleted(
  _sprintId: string,
  greenTaskId: number,
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  await db
    .update(tddTaskRelationships)
    .set({ completed_at: now })
    .where(eq(tddTaskRelationships.green_task_id, greenTaskId));
}

/**
 * Get test command that EXCLUDES TDD red-phase tests.
 *
 * Uses directory-based exclusion (test/red/) for Node.js/vitest projects
 * and tag-based exclusion for other ecosystems (Flutter, Python, etc.).
 *
 * Used by fix_code_review.SUBMIT_FIXES for TDD-red phase tasks.
 * We only need to verify non-TDD-red tests pass when validating code review fixes.
 *
 * @param projectType - Detected project type
 * @param baseTestCommand - Base test command from sprint settings (e.g., "flutter test")
 * @returns Command string that runs tests excluding TDD red-phase tests
 */ export function getExcludeTddRedCommand(
  projectType: ProjectType,
  baseTestCommand?: string,
): string {
  switch (projectType) {
    case "flutter":
return "flutter test --exclude-tags red";
    case "node":
      // Use vitest --exclude flag to skip test/red/ directory
      if (baseTestCommand) {
        // Ensure `--` separator exists for npm/yarn/pnpm before vitest flags
        const needsSeparator = /^(npm|yarn|pnpm)\s+test(?:\s|$)/.test(
          baseTestCommand,
        );
        if (needsSeparator && !baseTestCommand.includes(" -- ")) {
          return `${baseTestCommand} -- --exclude "test/red/**"`;
        }
        return `${baseTestCommand} --exclude "test/red/**"`;
      }
      return 'npm test -- --exclude "test/red/**"';
    case "python":
      return "pytest --ignore=tests/tdd_red";

    case "rust":
      return "cargo test --exclude tdd_red";

    case "go":
      return "go test $(go list ./... | grep -v tdd-red)";

    case "unknown":
    default:
      // Fallback to Node.js pattern with directory-based exclusion
      return 'npm test -- --exclude "test/red/**"';
  }
}
