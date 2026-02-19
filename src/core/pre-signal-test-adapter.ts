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
import type { TestFramework } from "./testing/TestRunner.js"; /**
 * Normalize Windows drive letter to uppercase.
 * Vitest has issues with lowercase drive letters (e.g., x: vs X:).
 * Matches the normalizeWindowsPath in extension/src/agents/tools/testing/runTests.ts
 */
import { TestRunnerFactory } from "./testing/TestRunnerFactory.js";
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
  const defaultTimeout = input.fallbackTimeoutMs ?? 300_000; // 5 min default for pre-signal

  // Load config
  const loader = new TestConfigLoader(workspacePath);
  const configResult = await loader.load();

  if (!configResult.success) {
    // No config or invalid config — return zero-result with error output
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

  // If specific files are provided (green phase), run them directly
  if (input.files && input.files.length > 0) {
    return runFiles(
      input.files,
      tier,
      workspacePath,
      config.defaultTimeout ?? defaultTimeout,
      config.framework,
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

  // Check for error
  if ("code" in scopeResult) {
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

  // Execute tests via the runner factory
  const runner = TestRunnerFactory.create(config.framework);
  let runOutput;
  try {
    runOutput = await runner.execute({
      files: scopeResult.files,
      workingDir: workspacePath,
      timeout,
      ...(config.dartNoPub === true ? { dartNoPub: true } : {}),
    });
  } catch (error) {
    const toolError = error as { code?: string; message?: string };
    return {
      tier,
      passed: 0,
      failed: 0,
      total: 0,
      duration_ms: 0,
      output: `Runner error: ${toolError.message ?? String(error)}`,
      timedOut: toolError.code === "TIMEOUT",
    };
  }

  // Format results
  const formatter = new ResultFormatter();

  // Handle compilation failures for inverted (red) tiers:
  // In TDD red-phase, test files import source that doesn't exist yet, so
  // Flutter/Dart exits non-zero with 0 tests collected. This is expected —
  // synthesize "failed" test entries so downstream inverted logic sees them
  // as correctly failing tests (rather than "none found").
  if (isInverted && runOutput.exitCode !== 0 && runOutput.tests.length === 0) {
    const rawPreview = runOutput.rawOutput?.slice(0, 500) ?? "";
    const compileErrorMatch = rawPreview.match(/Error:.*$/m);
    const errorSummary = compileErrorMatch
      ? compileErrorMatch[0].slice(0, 120)
      : "Compilation error (source files not yet implemented)";

    // Synthesize one failed test per resolved file
    for (const f of scopeResult.files) {
      runOutput.tests.push({
        name: `[compile error] ${f}`,
        file: f,
        status: "failed" as const,
        duration: 0,
        failure: {
          message: errorSummary,
          stack: [],
        },
      });
    }
  }

  const formatted = formatter.format(runOutput.tests, {
    maxFailureLines: config.maxFailureLines,
    framework: runner.framework,
  });
  const result: TestRunResult = {
    tier,
    passed: formatted.passed,
    failed: formatted.failed,
    total: formatted.total,
    duration_ms: runOutput.duration,
  };

  // ALWAYS set output when total is 0 — helps diagnose "no tests found" issues
  if (formatted.total === 0) {
    result.output =
      `Runner returned 0 tests. exitCode=${runOutput.exitCode}, ` +
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
  framework: TestFramework = "vitest",
): Promise<TestRunResult> {
  const runner = TestRunnerFactory.create(framework);
  let runOutput;
  try {
    runOutput = await runner.execute({
      files,
      workingDir: workspacePath,
      timeout,
    });
  } catch (error) {
    const toolError = error as { code?: string; message?: string };
    return {
      tier,
      passed: 0,
      failed: 0,
      total: 0,
      duration_ms: 0,
      output: `Runner error: ${toolError.message ?? String(error)}`,
      timedOut: toolError.code === "TIMEOUT",
    };
  }

  const formatter = new ResultFormatter();
  const formatted = formatter.format(runOutput.tests, {
    maxFailureLines: 20,
    framework: runner.framework,
  });
  const result: TestRunResult = {
    tier,
    passed: formatted.passed,
    failed: formatted.failed,
    total: formatted.total,
    duration_ms: runOutput.duration,
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
