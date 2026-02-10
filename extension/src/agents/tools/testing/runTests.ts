/**
 * runTests tool - Execute scoped test runs via the testing pipeline
 *
 * Wires the pipeline: TestConfigLoader → ScopeResolver → VitestRunner → ResultFormatter
 * Implements execution locking (FR-026), timeout handling, fingerprint caching (US3),
 * and proper result formatting.
 *
 * Aligned with specs/013-test-runner-tools/data-model.md
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import { ToolErrorCode } from "../errors.js";
import type {
  AgentTool,
  ToolInvocationContext,
  ToolInputSchema,
  ToolResult,
} from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";
import { FingerprintComputer } from "./FingerprintComputer.js";
import { setLastRedPhaseResult } from "./promoteTests.js";
import { ResultFormatter } from "./ResultFormatter.js";
import { ScopeResolver } from "./ScopeResolver.js";
import { TestConfigLoader } from "./TestConfigLoader.js";
import { TestResultStore } from "./TestResultStore.js";
import type { CacheKey, RunTestsInput, RunTestsResult, TestScope } from "./types.js";
import { ExecutionLock, RunTestsInputSchema } from "./types.js";
import { VitestRunner } from "./VitestRunner.js";

const TOOL_NAME = "run_tests";

// Module-level execution lock singleton (FR-026: reject concurrent runs)
const executionLock = new ExecutionLock();

// Module-level singletons for caching (US3: fingerprint-based result caching)
const fingerprintComputer = new FingerprintComputer();
const testResultStore = new TestResultStore();

// Track last config fingerprint for invalidation
let lastConfigFingerprint: string | undefined;

/**
 * Build a complete ToolResult from a partial result.
 */
function buildToolResult(partial: Partial<ToolResult>): ToolResult {
  return {
    success: partial.success ?? false,
    content: partial.content ?? [],
    error: partial.error,
    metadata: partial.metadata ?? {
      toolName: TOOL_NAME,
      callId: "",
      durationMs: 0,
    },
  };
}

/**
 * Resolve working directory from input, config, or workspace root.
 * @param workspaceRoot Absolute workspace root path
 * @param inputWorkingDir Optional working_dir from input
 * @param configWorkingDir Optional workingDir from config
 * @returns Absolute working directory path
 */
function resolveWorkingDir(
  workspaceRoot: string,
  inputWorkingDir: string | undefined,
  configWorkingDir: string | undefined,
): string {
  const relativePath = inputWorkingDir ?? configWorkingDir;
  if (relativePath) {
    return path.resolve(workspaceRoot, relativePath);
  }
  return workspaceRoot;
}

/**
 * Resolve simple glob patterns to file paths.
 * Supports basic patterns like "vitest.config.*" or exact file names.
 * @param patterns Array of glob patterns
 * @param workspaceRoot Absolute workspace root path
 * @returns Array of resolved absolute file paths
 */
async function resolveGlobPatterns(
  patterns: string[],
  workspaceRoot: string,
): Promise<string[]> {
  const resolvedFiles: string[] = [];

  for (const pattern of patterns) {
    // Check if pattern contains wildcards
    if (pattern.includes("*")) {
      // Extract directory and pattern from the glob
      const lastSlash = pattern.lastIndexOf("/");
      const dir = lastSlash >= 0 ? pattern.slice(0, lastSlash) : ".";
      const filePattern = lastSlash >= 0 ? pattern.slice(lastSlash + 1) : pattern;

      // Convert glob wildcard to regex
      const regexPattern = filePattern.replace(/\./g, "\\.").replace(/\*/g, ".*");
      const regex = new RegExp(`^${regexPattern}$`);

      const dirPath = path.resolve(workspaceRoot, dir);
      try {
        const entries = await fs.readdir(dirPath);
        for (const entry of entries) {
          if (regex.test(entry)) {
            resolvedFiles.push(path.resolve(dirPath, entry));
          }
        }
      } catch {
        // Directory doesn't exist or can't be read - skip
      }
    } else {
      // Exact file name
      const filePath = path.resolve(workspaceRoot, pattern);
      try {
        await fs.access(filePath);
        resolvedFiles.push(filePath);
      } catch {
        // File doesn't exist - skip
      }
    }
  }

  return resolvedFiles;
}

/**
 * Compute config fingerprint and check for invalidation.
 * If config has changed, invalidates all cached test results.
 * @param configPatterns Array of glob patterns for config files
 * @param workspaceRoot Absolute workspace root path
 * @returns The current config fingerprint
 */
async function checkConfigInvalidation(
  configPatterns: string[],
  workspaceRoot: string,
): Promise<string> {
  // Resolve config file patterns to actual file paths
  const configFiles = await resolveGlobPatterns(configPatterns, workspaceRoot);

  // Compute fingerprint of config files
  const configFingerprintResult = await fingerprintComputer.compute(configFiles);
  const currentConfigFingerprint = configFingerprintResult.hash;

  // Check if config has changed since last run
  if (lastConfigFingerprint !== undefined && lastConfigFingerprint !== currentConfigFingerprint) {
    // Config changed - invalidate all cached results
    testResultStore.invalidateAll();
  }

  // Update stored config fingerprint
  lastConfigFingerprint = currentConfigFingerprint;

  return currentConfigFingerprint;
}

/**
 * Input schema for the run_tests tool in JSON Schema format.
 * Matches the RunTestsInputSchema Zod schema from types.ts.
 */
const runTestsInputSchema: ToolInputSchema = {
  type: "object",
  properties: {
    scope: {
      type: "string",
      description:
        "Scope of test execution: 'file' (specific file), 'pattern' (name regex), 'suite' (tier name), 'related' (changed files), 'red' (TDD), 'failed' (retry failures), 'all' (everything except red)",
      enum: ["file", "pattern", "suite", "related", "red", "failed", "all"],
    },
    target: {
      type: "string",
      description:
        "Target for scope — file path for 'file', regex for 'pattern', tier name for 'suite'. Unused for 'related'/'red'/'failed'/'all'.",
    },
    change_source: {
      type: "string",
      description:
        "Source of change detection for 'related' scope: 'working-tree', 'commit-range', or 'file-list'",
      enum: ["working-tree", "commit-range", "file-list"],
    },
    commit_range: {
      type: "string",
      description:
        "For commit-range change source: base..head range (e.g., 'main..HEAD')",
    },
    file_list: {
      type: "string",
      description:
        "For file-list change source: comma-separated file paths (parsed as array)",
    },
    working_dir: {
      type: "string",
      description:
        "Working directory override relative to workspace root (e.g., 'extension/')",
    },
    force: {
      type: "boolean",
      description:
        "Force re-execution, bypassing fingerprint cache (default: false)",
    },
    timeout: {
      type: "number",
      description:
        "Timeout override in milliseconds (overrides tier and config defaults)",
    },
    max_failure_lines: {
      type: "number",
      description: "Maximum failure detail lines per test (default: from config)",
    },
  },
  required: ["scope"],
};

/**
 * Execute the run_tests pipeline.
 */
async function runTests(
  input: RunTestsInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  // Validate input with Zod schema
  const parseResult = RunTestsInputSchema.safeParse(input);
  if (!parseResult.success) {
    const errors = parseResult.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.INVALID_INPUT,
        `Invalid input: ${errors}`,
        "Check the input parameters against the tool schema.",
      ),
    );
  }

  const validatedInput = parseResult.data;

  // 1. Load config
  const loader = new TestConfigLoader(context.workspaceRoot);
  const configResult = await loader.load();
  if (!configResult.success) {
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        configResult.error.code,
        configResult.error.message,
        configResult.error.suggestion,
        configResult.error.details,
      ),
    );
  }
  const config = configResult.config;
  const configWarnings = configResult.warnings;

  // 2. Acquire execution lock (FR-026: reject concurrent runs)
  const lockScope = `${validatedInput.scope}:${validatedInput.target ?? ""}`;
  if (!executionLock.acquire(lockScope)) {
    const currentScope = executionLock.getCurrentScope();
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.TEST_RUN_IN_PROGRESS,
        `Another test run is already in progress: ${currentScope ?? "unknown"}`,
        "Wait for the current test run to complete before starting another.",
        { currentScope },
      ),
    );
  }

  try {
    // 3. Check config fingerprint and invalidate cache if config changed
    await checkConfigInvalidation(config.configFingerprint, context.workspaceRoot);

    // 4. Resolve working directory early (needed for 'failed' scope and cache key)
    const workingDir = resolveWorkingDir(
      context.workspaceRoot,
      validatedInput.working_dir,
      config.workingDir,
    );

    // 5. Resolve scope to file list or pattern
    const resolver = new ScopeResolver(context.workspaceRoot);
    const scopeResult = await resolver.resolve(
      validatedInput.scope,
      validatedInput.target,
      config,
      {
        getLastFailedTests: (dir: string) => testResultStore.getLastFailedTests(dir),
        workingDir,
      },
    );

    // Check for error (ToolError has 'code' property)
    if ("code" in scopeResult) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          scopeResult.code,
          scopeResult.message,
          scopeResult.suggestion,
          scopeResult.details,
        ),
      );
    }

    // 6. Handle empty scope (no tests found)
    if (scopeResult.files.length === 0 && !scopeResult.pattern) {
      const message = scopeResult.message ?? "No tests found for the specified scope.";
      return buildToolResult(
        successResult(TOOL_NAME, `No tests to run. ${message}`, configWarnings),
      );
    }

    // 7. Compute fingerprint for cache lookup
    // For pattern-only scopes (pattern, failed), we use an empty fingerprint since
    // there are no resolved files - but we still want to check/use cache keyed by scope+target+workingDir
    let scopeFingerprint = "";
    let fingerprintFileCount = 0;
    let fingerprintedFiles: string[] = [];

    if (scopeResult.files.length > 0) {
      // Resolve glob patterns to actual file paths for fingerprinting
      const resolvedFiles = await resolveGlobPatterns(scopeResult.files, workingDir);
      const fingerprintResult = await fingerprintComputer.compute(resolvedFiles);
      scopeFingerprint = fingerprintResult.hash;
      fingerprintFileCount = fingerprintResult.fileCount;
      fingerprintedFiles = fingerprintResult.files;
    } else if (scopeResult.pattern) {
      // For pattern-only scopes, fingerprint is based on the pattern itself
      // This provides some caching for repeated pattern runs
      scopeFingerprint = scopeResult.pattern;
    }

    // 8. Build cache key
    const cacheKey: CacheKey = {
      scope: validatedInput.scope,
      target: validatedInput.target ?? "",
      workingDir,
    };

    // 9. Check cache (unless force=true)
    if (!validatedInput.force && scopeFingerprint) {
      const cachedResult = testResultStore.get(cacheKey, scopeFingerprint);
      if (cachedResult) {
        // Cache hit - return cached result immediately
        const output = `✓ run_tests [scope=${validatedInput.scope}${validatedInput.target ? `, target=${validatedInput.target}` : ""}] (cached, ${fingerprintFileCount} files checked)\n\n${cachedResult.summary}`;

        // Combine config warnings with any other warnings
        const warnings = configWarnings.length > 0 ? configWarnings : undefined;

        return buildToolResult(successResult(TOOL_NAME, output, warnings));
      }
    }

    // 10. Resolve timeout: input override > tier timeout > config default
    let timeout = validatedInput.timeout;
    if (timeout === undefined) {
      // Check if scope is 'suite' and tier has a timeout
      if (validatedInput.scope === "suite" && validatedInput.target) {
        const tier = config.tiers.find((t) => t.name === validatedInput.target);
        if (tier?.timeout !== undefined) {
          timeout = tier.timeout;
        }
      }
    }
    if (timeout === undefined) {
      timeout = config.defaultTimeout;
    }

    // 11. Execute vitest
    const runner = new VitestRunner();
    const executeOptions: Parameters<typeof runner.execute>[0] = {
      files: scopeResult.files,
      workingDir,
      timeout,
    };
    // Only add pattern if defined (exactOptionalPropertyTypes compliance)
    if (scopeResult.pattern !== undefined) {
      executeOptions.pattern = scopeResult.pattern;
    }
    const vitestResult = await runner.execute(executeOptions);

    // Check for error (ToolError has 'code' property)
    if ("code" in vitestResult) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          vitestResult.code,
          vitestResult.message,
          vitestResult.suggestion,
          vitestResult.details,
        ),
      );
    }

    // 12. Format results
    const formatter = new ResultFormatter();
    const maxFailureLines =
      validatedInput.max_failure_lines ?? config.maxFailureLines;
    const result: RunTestsResult = formatter.format(vitestResult.vitestJson, {
      maxFailureLines,
    });

    // Override fields not known by ResultFormatter
    result.scope = validatedInput.scope as TestScope;
    result.workingDir = workingDir;
    result.fingerprint = scopeFingerprint;
    if (validatedInput.target) {
      result.target = validatedInput.target;
    }

    // 13. Store result in cache
    if (scopeFingerprint) {
      testResultStore.set(cacheKey, scopeFingerprint, result, fingerprintedFiles);
    }

    // 14. Record failures for 'failed' scope re-runs
    const failedTestNames = result.tests
      .filter((t) => t.status === "failed")
      .map((t) => t.name);
    testResultStore.recordFailures(workingDir, failedTestNames);

    // 15. Handle red-phase scope: invert interpretation and attach redPhase result
    if (validatedInput.scope === "red") {
      result.redPhase = formatter.invertRedPhase(result, config);
      // Store result for promote_tests to use
      setLastRedPhaseResult(result);
    }

    // 16. Build output string
    let output = `✓ run_tests [scope=${validatedInput.scope}${validatedInput.target ? `, target=${validatedInput.target}` : ""}]\n\n${result.summary}`;

    // For red-phase runs, add inverted interpretation to output
    if (validatedInput.scope === "red" && result.redPhase) {
      const rp = result.redPhase;
      output += `\n\nRed-Phase Interpretation:`;
      output += `\n  Correctly failing: ${rp.correctlyFailing}`;
      output += `\n  Unexpectedly passing: ${rp.unexpectedlyPassing}`;
      output += `\n  Ready for promotion: ${rp.readyForPromotion ? "Yes" : "No"}`;
      
      if (rp.promotionTargets.length > 0) {
        output += `\n\nPromotion Targets:`;
        for (const target of rp.promotionTargets) {
          const status = target.eligible ? "✓ eligible" : "✗ not eligible";
          output += `\n  ${target.source} → ${target.destination} [${target.tier}] (${status})`;
        }
      }
    }

    if (result.failed > 0 && validatedInput.scope !== "red") {
      // For non-red scopes, show failure details
      const failureDetails = formatter.formatFailures(
        result.tests,
        maxFailureLines,
      );
      output += `\n\n${failureDetails}`;
    } else if (result.failed > 0 && validatedInput.scope === "red") {
      // For red scope, failures are expected - show them as "correctly failing"
      output += `\n\nCorrectly Failing Tests (TDD Red Phase):`;
      const failedTests = result.tests.filter((t) => t.status === "failed");
      for (const test of failedTests.slice(0, 10)) {
        output += `\n  ✓ ${test.name}`;
        if (test.failure) {
          output += ` — ${test.failure.message.slice(0, 60)}${test.failure.message.length > 60 ? "..." : ""}`;
        }
      }
      if (failedTests.length > 10) {
        output += `\n  ... and ${failedTests.length - 10} more`;
      }
    }

    // Combine config warnings with any other warnings
    const warnings =
      configWarnings.length > 0 ? configWarnings : undefined;

    return buildToolResult(successResult(TOOL_NAME, output, warnings));
  } finally {
    // Always release the lock, even if errors occur
    executionLock.release();
  }
}

/**
 * run_tests AgentTool - Execute scoped test runs via the testing pipeline.
 *
 * Implements the full pipeline:
 * 1. Load .agent-test-config.json
 * 2. Validate input and acquire execution lock
 * 3. Check config fingerprint for cache invalidation
 * 4. Resolve scope to file list or pattern
 * 5. Compute fingerprint and check cache (skip if force=true)
 * 6. Execute vitest with JSON output (or return cached result)
 * 7. Format results into token-efficient summary
 * 8. Store result in cache and record failures
 * 9. Release lock and return result
 */
export const runTestsTool: AgentTool<RunTestsInput> = {
  name: TOOL_NAME,
  description: `Execute scoped test runs using the testing pipeline. Supports scopes: 'file' (specific test file), 'pattern' (test name regex), 'suite' (tier from .agent-test-config.json), 'failed' (re-run previous failures), 'all' (all non-red tiers). Implements fingerprint-based caching - identical test runs return cached results instantly. Use force=true to bypass cache. Requires .agent-test-config.json in workspace root. Returns token-efficient summary with pass/fail counts and failure details.`,
  inputSchema: runTestsInputSchema,
  invoke: runTests,
};
