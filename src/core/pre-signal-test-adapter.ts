/**
 * Pre-Signal Test Adapter
 *
 * Thin adapter that wraps the shared testing pipeline (src/core/testing/) for
 * consumption by pre-signal-executor.ts. This replaces the broken test-runner-core.ts
 * which was a parallel reimplementation that passed quoted globs to vitest CLI.
 *
 * The shared pipeline uses:
 *   TestConfigLoader → ScopeResolver → VitestRunner → ResultFormatter
 *
 * This adapter exposes the same interface as the old test-runner-core.ts:
 *   - runTestsCore(input) → TestRunResult
 *   - runAllNonInvertedTiers(workspacePath) → TestRunResult[]
 */

import { ResultFormatter } from "./testing/ResultFormatter.js";
import { ScopeResolver } from "./testing/ScopeResolver.js";
import { TestConfigLoader } from "./testing/TestConfigLoader.js";
import { VitestRunner } from "./testing/VitestRunner.js";

/**
 * Normalize Windows drive letter to uppercase.
 * Vitest has issues with lowercase drive letters (e.g., x: vs X:).
 * Matches the normalizeWindowsPath in extension/src/agents/tools/testing/runTests.ts
 */
function normalizeWindowsPath(p: string): string {
  const driveLetter = p.charAt(0);
  const driveSeparator = p.charAt(1);

  if (process.platform === "win32" && driveSeparator === ":") {
    return driveLetter.toUpperCase() + p.slice(1);
  }

  return p;
}

/**
 * Result of a test tier execution.
 * Kept compatible with the original test-runner-core.ts interface
 * consumed by pre-signal-executor.ts.
 */
export interface TestRunResult {
  tier: string;
  passed: number;
  failed: number;
  total: number;
  duration_ms: number;
  output?: string;
  /** Whether the test execution timed out */
  timedOut?: boolean;
}

export interface RunTestsCoreInput {
  tier: string;
  workspacePath: string;
  fallbackCommand?: string;
  fallbackTimeoutMs?: number;
  /** Optional specific file paths to run instead of tier glob (used by green phase) */
  files?: string[];
}

/**
 * Run tests for a single tier (or set of files) using the shared pipeline.
 *
 * Replaces the old test-runner-core.ts runTestsCore which:
 *   ❌ Passed quoted globs to vitest CLI ("No test files found")
 *   ❌ Parsed JSON from stdout (fragile)
 *   ❌ Reimplemented config loading without Zod validation
 *
 * This adapter:
 *   ✅ Uses ScopeResolver to correctly resolve tier → directory
 *   ✅ Uses VitestRunner with --outputFile for reliable JSON
 *   ✅ Uses ResultFormatter for structured parsing
 *   ✅ Shares one codebase with the extension's run_tests tool
 */
export async function runTestsCore(
  input: RunTestsCoreInput,
): Promise<TestRunResult> {
  const { tier } = input;
  // FIX: Normalize Windows drive letter to match what run_tests does
  const workspacePath = normalizeWindowsPath(input.workspacePath);
  console.error(
    `[SIGNAL-DIAG] runTestsCore ENTRY: tier=${tier}, rawWorkspacePath=${input.workspacePath}, normalizedWorkspacePath=${workspacePath}`,
  );
  const defaultTimeout = input.fallbackTimeoutMs ?? 300_000; // 5 min default for pre-signal

  // Load config
  const loader = new TestConfigLoader(workspacePath);
  const configResult = await loader.load();

  if (!configResult.success) {
    // No config or invalid config — return zero-result with error output
    console.error(
      `[SIGNAL-DIAG] runTestsCore CONFIG FAILED: tier=${tier}, workspacePath=${workspacePath}, error=${configResult.error.message}`,
    );
    return {
      tier,
      passed: 0,
      failed: 0,
      total: 0,
      duration_ms: 0,
      output: `Config error: ${configResult.error.message}`,
    };
  }

  const config = configResult.config;
  console.error(
    `[SIGNAL-DIAG] runTestsCore CONFIG OK: tiers=${JSON.stringify(config.tiers.map((t) => ({ name: t.name, path: t.path, inverted: t.inverted })))}, defaultTimeout=${config.defaultTimeout}`,
  );

  // If specific files are provided (green phase), run them directly
  if (input.files && input.files.length > 0) {
    return runFiles(
      input.files,
      tier,
      workspacePath,
      config.defaultTimeout ?? defaultTimeout,
    );
  }

  // Resolve tier to file paths using ScopeResolver
  const resolver = new ScopeResolver(workspacePath);

  // For "red" tier, use the "red" scope; otherwise use "suite" scope
  const tierConfig = config.tiers.find((t) => t.name === tier);
  const isInverted = tierConfig?.inverted === true;
  const scope = isInverted ? ("red" as const) : ("suite" as const);
  const target = isInverted ? undefined : tier;

  // FIX: Pass workingDir option so ScopeResolver.resolveRed() can check for empty dirs
  const scopeResult = await resolver.resolve(scope, target, config, {
    workingDir: workspacePath,
  });
  console.error(
    `[SIGNAL-DIAG] runTestsCore SCOPE RESULT: scope=${scope}, target=${target}, files=${JSON.stringify("files" in scopeResult ? scopeResult.files : [])}, pattern=${"pattern" in scopeResult ? scopeResult.pattern : "none"}, message=${"message" in scopeResult ? scopeResult.message : "none"}, hasErrorCode=${"code" in scopeResult}`,
  );

  // Check for error
  if ("code" in scopeResult) {
    console.error(
      `[SIGNAL-DIAG] runTestsCore SCOPE ERROR: tier=${tier}, code=${(scopeResult as { code: string }).code}, message=${scopeResult.message}`,
    );
    return {
      tier,
      passed: 0,
      failed: 0,
      total: 0,
      duration_ms: 0,
      output: `Scope resolution error: ${scopeResult.message}`,
    };
  }

  // If no files to run, return empty result
  if (scopeResult.files.length === 0 && !scopeResult.pattern) {
    console.error(
      `[SIGNAL-DIAG] runTestsCore NO FILES: tier=${tier}, message=${scopeResult.message ?? "no message"}`,
    );
    return {
      tier,
      passed: 0,
      failed: 0,
      total: 0,
      duration_ms: 0,
      output: scopeResult.message ?? "No test files found for tier",
    };
  }

  // Determine timeout
  const timeout =
    tierConfig?.timeout ?? config.defaultTimeout ?? defaultTimeout;

  // Execute vitest via the shared runner
  console.error(
    `[SIGNAL-DIAG] runTestsCore VITEST EXEC: files=${JSON.stringify(scopeResult.files)}, workingDir=${workspacePath}, timeout=${timeout}`,
  );
  const runner = new VitestRunner();
  const vitestResult = await runner.execute({
    files: scopeResult.files,
    workingDir: workspacePath,
    timeout,
  });

  // Check for error
  if ("code" in vitestResult) {
    console.error(
      `[SIGNAL-DIAG] runTestsCore VITEST ERROR: tier=${tier}, code=${vitestResult.code}, message=${vitestResult.message}`,
    );
    return {
      tier,
      passed: 0,
      failed: 0,
      total: 0,
      duration_ms: 0,
      output: `Vitest error: ${vitestResult.message}`,
      timedOut: vitestResult.code === "TIMEOUT",
    };
  }

  // Log raw vitest output for debugging
  const jsonPreview =
    typeof vitestResult.vitestJson === "object" && vitestResult.vitestJson
      ? JSON.stringify({
          numTotalTests: (vitestResult.vitestJson as Record<string, unknown>)
            .numTotalTests,
          numPassedTests: (vitestResult.vitestJson as Record<string, unknown>)
            .numPassedTests,
          numFailedTests: (vitestResult.vitestJson as Record<string, unknown>)
            .numFailedTests,
          success: (vitestResult.vitestJson as Record<string, unknown>).success,
        })
      : String(vitestResult.vitestJson);
  console.error(
    `[SIGNAL-DIAG] runTestsCore VITEST JSON: tier=${tier}, ${jsonPreview}, exitCode=${vitestResult.exitCode}, duration=${vitestResult.duration}ms`,
  );
  if (vitestResult.stderr) {
    console.error(
      `[SIGNAL-DIAG] runTestsCore VITEST STDERR (500ch): ${vitestResult.stderr.slice(0, 500)}`,
    );
  }
  if (vitestResult.stdout) {
    console.error(
      `[SIGNAL-DIAG] runTestsCore VITEST STDOUT (500ch): ${vitestResult.stdout.slice(0, 500)}`,
    );
  }

  // Format results
  const formatter = new ResultFormatter();
  const formatted = formatter.format(vitestResult.vitestJson, {
    maxFailureLines: config.maxFailureLines,
  });

  const result: TestRunResult = {
    tier,
    passed: formatted.passed,
    failed: formatted.failed,
    total: formatted.total,
    duration_ms: vitestResult.duration,
  };

  // ALWAYS set output when total is 0 — helps diagnose "no tests found" issues
  if (formatted.total === 0) {
    result.output =
      `Vitest returned 0 tests. exitCode=${vitestResult.exitCode}, ` +
      `files=${JSON.stringify(scopeResult.files)}, workingDir=${workspacePath}`;
  } else if (formatted.failed > 0) {
    result.output = formatter.formatFailures(
      formatted.tests,
      config.maxFailureLines,
    );
  }

  return result;
}

/**
 * Run specific test files directly (used by green phase verification).
 */
async function runFiles(
  files: string[],
  tier: string,
  workspacePath: string,
  timeout: number,
): Promise<TestRunResult> {
  const runner = new VitestRunner();
  const vitestResult = await runner.execute({
    files,
    workingDir: workspacePath,
    timeout,
  });

  if ("code" in vitestResult) {
    return {
      tier,
      passed: 0,
      failed: 0,
      total: 0,
      duration_ms: 0,
      output: `Vitest error: ${vitestResult.message}`,
      timedOut: vitestResult.code === "TIMEOUT",
    };
  }

  const formatter = new ResultFormatter();
  const formatted = formatter.format(vitestResult.vitestJson, {
    maxFailureLines: 20,
  });

  const result: TestRunResult = {
    tier,
    passed: formatted.passed,
    failed: formatted.failed,
    total: formatted.total,
    duration_ms: vitestResult.duration,
  };

  if (formatted.failed > 0) {
    result.output = formatter.formatFailures(formatted.tests, 20);
  }

  return result;
}

/**
 * Run all non-inverted tiers from .agent-test-config.json.
 *
 * This is the shared implementation of "run_tests scope=all" (FR-001):
 * reads config, filters out inverted tiers (e.g., red), and runs each
 * remaining tier via the shared pipeline.
 *
 * @param workspacePath - Workspace root directory
 * @returns Array of TestRunResult, one per tier (empty if no config/tiers)
 */
export async function runAllNonInvertedTiers(
  workspacePath: string,
): Promise<TestRunResult[]> {
  // Load config via shared TestConfigLoader
  const loader = new TestConfigLoader(workspacePath);
  const configResult = await loader.load();

  if (!configResult.success) {
    return [];
  }

  const config = configResult.config;
  const nonInvertedTiers = config.tiers.filter((t) => !t.inverted);

  const results: TestRunResult[] = [];
  for (const tier of nonInvertedTiers) {
    const result = await runTestsCore({
      tier: tier.name,
      workspacePath,
    });
    results.push(result);
  }

  return results;
}
