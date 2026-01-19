/**
 * Command validation for behavioral verification checks.
 *
 * Validates that commands in behavioral checks are likely to succeed by checking:
 * - Executable existence (npm, pnpm, yarn, flutter, cargo, etc.)
 * - npm/pnpm/yarn script definitions in package.json
 * - Working directory existence
 * - --prefix directory paths
 * - Workspace-relative path segments
 *
 * Used during task preparation (prepare_task) and verification updates
 * (update_verification) to catch configuration errors early.
 *
 * All validation is synchronous to keep calling code simple.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

/**
 * Error taxonomy for command validation failures.
 * These constants are used throughout Orchestra to provide consistent error messages.
 */
export const COMMAND_EMPTY = "COMMAND_EMPTY";
export const EXECUTABLE_NOT_FOUND = "EXECUTABLE_NOT_FOUND";
export const SCRIPT_NOT_FOUND = "SCRIPT_NOT_FOUND";
export const WORKDIR_NOT_FOUND = "WORKDIR_NOT_FOUND";
export const RUNNER_FLAG_INCOMPATIBLE = "RUNNER_FLAG_INCOMPATIBLE";

/**
 * Test runner types that can be detected from commands.
 */
export type RunnerType = "vitest" | "jest" | "flutter" | "pytest" | "cargo" | "unknown";

/**
 * Jest-specific flags that are incompatible with other test runners.
 */
export const JEST_ONLY_FLAGS = [
  "--testPathIgnorePatterns",
  "--runInBand",
  "--detectOpenHandles",
  "--forceExit",
  "--watchAll",
  "--bail",
  "--changedSince",
  "--ci",
  "--clearMocks",
  "--collectCoverageFrom",
  "--coverageDirectory",
  "--coveragePathIgnorePatterns",
  "--errorOnDeprecated",
  "--expand",
  "--findRelatedTests",
  "--json",
  "--lastCommit",
  "--listTests",
  "--logHeapUsage",
  "--maxConcurrency",
  "--maxWorkers",
  "--noStackTrace",
  "--notify",
  "--onlyChanged",
  "--passWithNoTests",
  "--projects",
  "--selectProjects",
  "--silent",
  "--testNamePattern",
  "--testLocationInResults",
  "--testTimeout",
  "--updateSnapshot",
  "--useStderr",
  "--verbose",
  "--watch",
  "--watchman",
];

/**
 * Vitest-specific flags that are incompatible with other test runners.
 */
export const VITEST_ONLY_FLAGS = [
  "--exclude",
  "--pool",
  "--poolOptions",
  "--poolOptions.threads.singleThread",
  "--poolOptions.forks.singleFork",
  "--isolate",
  "--globals",
  "--dom",
  "--browser",
  "--browser.enabled",
  "--browser.name",
  "--api",
  "--api.port",
  "--api.host",
  "--silent",
  "--hideSkippedTests",
  "--reporter",
  "--outputFile",
  "--coverage.enabled",
  "--coverage.provider",
  "--coverage.include",
  "--coverage.exclude",
  "--coverage.all",
  "--mode",
  "--workspace",
  "--isolate",
  "--run",
  "--singleThread",
  "--printConsoleTrace",
  "--allowOnly",
  "--passWithNoTests",
  "--changed",
  "--sequence",
];

/**
 * Flutter-specific test flags.
 */
export const FLUTTER_ONLY_FLAGS = [
  "--tags",
  "--exclude-tags",
  "--plain-name",
  "--name",
  // Note: --coverage is removed because it's shared across jest, vitest, flutter, pytest
  "--merge-coverage",
  "--test-randomize-ordering-seed",
  "--total-shards",
  "--shard-index",
  "--update-goldens",
  "--concurrency",
];

/**
 * Pytest-specific flags.
 */
export const PYTEST_ONLY_FLAGS = [
  "-m",
  "-k",
  "--ignore",
  "--ignore-glob",
  "--deselect",
  "--confcutdir",
  "--rootdir",
  "--fixtures",
  "--fixtures-per-test",
  "--pdb",
  "--pdbcls",
  "--trace",
  "--capture",
  "--runxfail",
  "--lf",
  "--ff",
  "--nf",
  "--cache-show",
  "--cache-clear",
  "--lfnf",
  "--sw",
  "--stepwise",
  "--stepwise-skip",
];

/**
 * Cargo test-specific flags.
 */
export const CARGO_ONLY_FLAGS = [
  "--lib",
  "--bin",
  "--bins",
  "--example",
  "--examples",
  "--test",
  "--tests",
  "--bench",
  "--benches",
  "--all-targets",
  "--doc",
  "--no-fail-fast",
  "--release",
  "--features",
  "--all-features",
  "--no-default-features",
];

/**
 * Result of command validation.
 */
export interface ValidationResult {
  isValid: boolean;
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
}

/**
 * Common executables that should be validated.
 */
const COMMON_EXECUTABLES = [
  "npm",
  "pnpm",
  "yarn",
  "node",
  "flutter",
  "dart",
  "cargo",
  "python",
  "python3",
  "pytest",
  "go",
  "rustc",
  "javac",
  "java",
  "mvn",
  "gradle",
  "dotnet",
  "php",
  "composer",
  "ruby",
  "bundle",
  "gem",
];

/**
 * Check if an executable exists on the system PATH.
 * Uses 'where' on Windows, 'which' on Unix-like systems.
 */
function isExecutableAvailable(executable: string): boolean {
  try {
    const command =
      process.platform === "win32" ? `where ${executable}` : `which ${executable}`;
    execSync(command, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract the package runner and script name from a command.
 * Examples:
 *   "npm test" -> { runner: "npm", script: "test" }
 *   "npm run build" -> { runner: "npm", script: "build" }
 *   "npm --prefix dir test" -> { runner: "npm", script: "test" }
 *   "pnpm test" -> { runner: "pnpm", script: "test" }
 *   "yarn test" -> { runner: "yarn", script: "test" }
 */
function extractPackageScript(
  command: string,
): { runner: string; script: string } | null {
  // For npm, handle --prefix and other flags before the script name
  // Pattern: npm [flags] [run] <script>
  const npmMatch = command.match(/^npm\s+(?:--\S+\s+\S+\s+)*(?:run\s+)?([a-zA-Z][^\s]*)/);
  if (npmMatch && npmMatch[1]) {
    return { runner: "npm", script: npmMatch[1] };
  }

  const pnpmMatch = command.match(/^pnpm\s+(?:run\s+)?(\S+)/);
  if (pnpmMatch && pnpmMatch[1]) {
    return { runner: "pnpm", script: pnpmMatch[1] };
  }

  const yarnMatch = command.match(/^yarn\s+(?:run\s+)?(\S+)/);
  if (yarnMatch && yarnMatch[1]) {
    return { runner: "yarn", script: yarnMatch[1] };
  }

  return null;
}

/**
 * Check if a script exists in package.json.
 */
function isScriptDefined(
  scriptName: string,
  workingDirectory?: string,
): boolean {
  const packageJsonPath = path.join(workingDirectory || ".", "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    return false;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    return Boolean(packageJson.scripts?.[scriptName]);
  } catch {
    return false;
  }
}

/**
 * Get the command that a package.json script will execute.
 * Returns null if script doesn't exist or package.json can't be read.
 */
function getScriptCommand(
  scriptName: string,
  workingDirectory?: string,
): string | null {
  const packageJsonPath = path.join(workingDirectory || ".", "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    return packageJson.scripts?.[scriptName] || null;
  } catch {
    return null;
  }
}

/**
 * Extract --prefix path from npm command.
 * Example: "npm --prefix subdir test" -> "subdir"
 */
function extractPrefixPath(command: string): string | null {
  const match = command.match(/--prefix\s+(\S+)/);
  return match && match[1] ? match[1] : null;
}

/**
 * Extract workspace-relative path segments from command.
 * Looks for paths that appear to be relative (not absolute, not URLs).
 */
function extractPathSegments(command: string): string[] {
  const segments: string[] = [];
  const tokens = command.split(/\s+/);

  for (const token of tokens) {
    // Skip flags and options
    if (token.startsWith("-")) continue;

    // Skip absolute paths (C:\, /usr, etc.)
    if (path.isAbsolute(token)) continue;

    // Skip URLs
    if (token.startsWith("http://") || token.startsWith("https://")) continue;

    // Check if it looks like a path (contains / or \)
    if (token.includes("/") || token.includes("\\")) {
      segments.push(token);
    }
  }

  return segments;
}

/**
 * Detect the test runner from a command string.
 *
 * Analyzes the command to determine which test runner it uses:
 * 1. Direct runner invocation: vitest, jest, flutter test, pytest, cargo test
 * 2. npx invocations: npx vitest, npx jest
 * 3. npm/pnpm/yarn script inspection: Check what the script actually runs in package.json
 *
 * @param command - The command string to analyze
 * @param workingDirectory - Optional working directory for package.json lookup
 * @returns RunnerType - The detected test runner, or "unknown" if not detected
 */
export function detectRunner(
  command: string,
  workingDirectory?: string,
): RunnerType {
  const trimmed = command.trim();

  // Direct runner detection
  if (trimmed.startsWith("vitest ") || trimmed === "vitest") return "vitest";
  if (trimmed.startsWith("jest ") || trimmed === "jest") return "jest";
  if (trimmed.startsWith("flutter test")) return "flutter";
  if (trimmed.startsWith("pytest ") || trimmed === "pytest") return "pytest";
  if (trimmed.startsWith("python -m pytest") || trimmed.startsWith("python3 -m pytest")) return "pytest";
  if (trimmed.startsWith("cargo test")) return "cargo";

  // npx invocations
  if (trimmed.startsWith("npx vitest")) return "vitest";
  if (trimmed.startsWith("npx jest")) return "jest";

  // npm/pnpm/yarn script inspection
  const scriptInfo = extractPackageScript(command);
  if (scriptInfo) {
    const { script } = scriptInfo;

    // Determine the directory to check for package.json
    let scriptCheckDir = workingDirectory;

    // If --prefix is present, use that directory instead
    const prefixPath = extractPrefixPath(command);
    if (prefixPath) {
      scriptCheckDir = path.join(workingDirectory || ".", prefixPath);
    }

    // Get the actual command from the script
    const scriptCommand = getScriptCommand(script, scriptCheckDir);
    if (scriptCommand) {
      // Recursively detect runner from the script command
      // Don't pass workingDirectory to avoid infinite recursion with --prefix
      return detectRunner(scriptCommand, scriptCheckDir);
    }
  }

  return "unknown";
}

/**
 * Check if flags in a command are compatible with the detected runner.
 *
 * @param command - The command string to check
 * @param runner - The detected test runner
 * @returns Array of incompatible flags found, empty if all flags are compatible
 */
export function checkRunnerFlagCompatibility(
  command: string,
  runner: RunnerType,
): string[] {
  if (runner === "unknown") {
    // Don't validate flags if we can't detect the runner
    return [];
  }

  const incompatibleFlags: string[] = [];

  // Define which flags are incompatible with which runner
  const incompatibilityRules: Record<RunnerType, string[]> = {
    vitest: JEST_ONLY_FLAGS.concat(FLUTTER_ONLY_FLAGS, PYTEST_ONLY_FLAGS, CARGO_ONLY_FLAGS),
    jest: VITEST_ONLY_FLAGS.concat(FLUTTER_ONLY_FLAGS, PYTEST_ONLY_FLAGS, CARGO_ONLY_FLAGS),
    flutter: JEST_ONLY_FLAGS.concat(VITEST_ONLY_FLAGS, PYTEST_ONLY_FLAGS, CARGO_ONLY_FLAGS),
    pytest: JEST_ONLY_FLAGS.concat(VITEST_ONLY_FLAGS, FLUTTER_ONLY_FLAGS, CARGO_ONLY_FLAGS),
    cargo: JEST_ONLY_FLAGS.concat(VITEST_ONLY_FLAGS, FLUTTER_ONLY_FLAGS, PYTEST_ONLY_FLAGS),
    unknown: [],
  };

  const incompatibleForRunner = incompatibilityRules[runner];

  // Check each incompatible flag
  for (const flag of incompatibleForRunner) {
    // Check if flag appears in command
    // Match flag followed by space, =, or end of string to avoid partial matches
    const escapedFlag = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flagRegex = new RegExp(`${escapedFlag}(?:\\s|=|$)`);
    if (flagRegex.test(command)) {
      incompatibleFlags.push(flag);
    }
  }

  return incompatibleFlags;
}

/**
 * Validate a behavioral command for common configuration errors.
 *
 * This function performs synchronous validation checks to catch errors early:
 * - Empty or whitespace-only commands
 * - Missing executables (npm, flutter, cargo, etc.)
 * - Missing npm/pnpm/yarn scripts in package.json
 * - Non-existent working directories
 * - Non-existent --prefix directories for npm
 * - Non-existent workspace-relative path segments
 * - Incompatible test runner flags (e.g., Jest flags with Vitest)
 *
 * @param command - The command string to validate
 * @param workingDirectory - Optional working directory where command will execute
 * @returns ValidationResult with isValid flag, errors array, and warnings array
 */
export function validateBehavioralCommand(
  command: string,
  workingDirectory?: string,
): ValidationResult {
  const errors: Array<{ code: string; message: string }> = [];
  const warnings: Array<{ code: string; message: string }> = [];

  // 1. Check for empty or whitespace-only command
  if (!command || command.trim().length === 0) {
    errors.push({
      code: COMMAND_EMPTY,
      message: "Command cannot be empty or whitespace-only",
    });
    return { isValid: false, errors, warnings };
  }

  // 2. Validate working directory exists
  if (workingDirectory && !fs.existsSync(workingDirectory)) {
    errors.push({
      code: WORKDIR_NOT_FOUND,
      message: `Working directory does not exist: ${workingDirectory}`,
    });
  }

  // 3. Extract the executable (first token in command)
  const tokens = command.trim().split(/\s+/);
  const executable = tokens[0];

  if (!executable) {
    // Should not happen after empty check, but be safe
    errors.push({
      code: COMMAND_EMPTY,
      message: "Command has no executable",
    });
    return { isValid: false, errors, warnings };
  }

  // 4. Check if executable is a common tool and validate its existence
  if (COMMON_EXECUTABLES.includes(executable)) {
    if (!isExecutableAvailable(executable)) {
      errors.push({
        code: EXECUTABLE_NOT_FOUND,
        message: `Executable not found: ${executable}. Ensure it is installed and in PATH.`,
      });
      // If the executable itself doesn't exist, skip further validation
      // (e.g., no point checking npm scripts if npm isn't installed)
      return { isValid: false, errors, warnings };
    }
  }

  // 5. Validate npm/pnpm/yarn script existence
  const scriptInfo = extractPackageScript(command);
  if (scriptInfo) {
    const { runner, script } = scriptInfo;

    // Determine the directory to check for package.json
    let scriptCheckDir = workingDirectory;

    // If --prefix is present, use that directory instead
    const prefixPath = extractPrefixPath(command);
    if (prefixPath) {
      scriptCheckDir = path.join(workingDirectory || ".", prefixPath);

      // Validate prefix directory exists
      if (!fs.existsSync(scriptCheckDir)) {
        errors.push({
          code: WORKDIR_NOT_FOUND,
          message: `npm --prefix directory does not exist: ${prefixPath}`,
        });
      }
    }

    // Check if script is defined
    if (!isScriptDefined(script, scriptCheckDir)) {
      errors.push({
        code: SCRIPT_NOT_FOUND,
        message: `Script "${script}" not found in package.json (runner: ${runner}, dir: ${scriptCheckDir || "."})`,
      });
    }
  }

  // 6. Validate workspace-relative path segments
  const pathSegments = extractPathSegments(command);
  for (const segment of pathSegments) {
    const fullPath = path.join(workingDirectory || ".", segment);
    if (!fs.existsSync(fullPath)) {
      warnings.push({
        code: "PATH_NOT_FOUND",
        message: `Path segment in command does not exist: ${segment}`,
      });
    }
  }

  // 7. Check runner flag compatibility
  const detectedRunner = detectRunner(command, workingDirectory);
  const incompatibleFlags = checkRunnerFlagCompatibility(command, detectedRunner);
  
  if (incompatibleFlags.length > 0) {
    const runnerName = detectedRunner.charAt(0).toUpperCase() + detectedRunner.slice(1);
    errors.push({
      code: RUNNER_FLAG_INCOMPATIBLE,
      message: `Incompatible flags for ${runnerName}: ${incompatibleFlags.join(", ")}. These flags are not supported by ${runnerName}.`,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
