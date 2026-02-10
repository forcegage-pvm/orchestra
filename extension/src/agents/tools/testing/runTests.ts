/**
 * runTests tool - Execute scoped test runs via the testing pipeline
 *
 * Wires the pipeline: TestConfigLoader → ScopeResolver → VitestRunner → ResultFormatter
 * Implements execution locking (FR-026), timeout handling, and proper result formatting.
 *
 * Aligned with specs/013-test-runner-tools/data-model.md
 */

import * as path from "node:path";

import { ToolErrorCode } from "../errors.js";
import type {
  AgentTool,
  ToolInvocationContext,
  ToolInputSchema,
  ToolResult,
} from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";
import { ResultFormatter } from "./ResultFormatter.js";
import { ScopeResolver } from "./ScopeResolver.js";
import { TestConfigLoader } from "./TestConfigLoader.js";
import type { RunTestsInput, RunTestsResult, TestScope } from "./types.js";
import { ExecutionLock, RunTestsInputSchema } from "./types.js";
import { VitestRunner } from "./VitestRunner.js";

const TOOL_NAME = "run_tests";

// Module-level execution lock singleton (FR-026: reject concurrent runs)
const executionLock = new ExecutionLock();

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
    // 3. Resolve scope to file list or pattern
    const resolver = new ScopeResolver(context.workspaceRoot);
    const scopeResult = await resolver.resolve(
      validatedInput.scope,
      validatedInput.target,
      config,
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

    // 4. Handle empty scope (no tests found)
    if (scopeResult.files.length === 0 && !scopeResult.pattern) {
      const message = scopeResult.message ?? "No tests found for the specified scope.";
      return buildToolResult(
        successResult(TOOL_NAME, `No tests to run. ${message}`, configWarnings),
      );
    }

    // 5. Resolve working directory
    const workingDir = resolveWorkingDir(
      context.workspaceRoot,
      validatedInput.working_dir,
      config.workingDir,
    );

    // 6. Resolve timeout: input override > tier timeout > config default
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

    // 7. Execute vitest
    const runner = new VitestRunner();
    const vitestResult = await runner.execute({
      files: scopeResult.files,
      pattern: scopeResult.pattern,
      workingDir,
      timeout,
    });

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

    // 8. Format results
    const formatter = new ResultFormatter();
    const maxFailureLines =
      validatedInput.max_failure_lines ?? config.maxFailureLines;
    const result: RunTestsResult = formatter.format(vitestResult.vitestJson, {
      maxFailureLines,
    });

    // Override fields not known by ResultFormatter
    result.scope = validatedInput.scope as TestScope;
    result.workingDir = workingDir;
    if (validatedInput.target) {
      result.target = validatedInput.target;
    }

    // 9. Build output string
    let output = `✓ run_tests [scope=${validatedInput.scope}${validatedInput.target ? `, target=${validatedInput.target}` : ""}]\n\n${result.summary}`;

    if (result.failed > 0) {
      const failureDetails = formatter.formatFailures(
        result.tests,
        maxFailureLines,
      );
      output += `\n\n${failureDetails}`;
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
 * 3. Resolve scope to file list or pattern
 * 4. Execute vitest with JSON output
 * 5. Format results into token-efficient summary
 * 6. Release lock and return result
 */
export const runTestsTool: AgentTool<RunTestsInput> = {
  name: TOOL_NAME,
  description: `Execute scoped test runs using the testing pipeline. Supports scopes: 'file' (specific test file), 'pattern' (test name regex), 'suite' (tier from .agent-test-config.json), 'all' (all non-red tiers). Requires .agent-test-config.json in workspace root. Returns token-efficient summary with pass/fail counts and failure details.`,
  inputSchema: runTestsInputSchema,
  invoke: runTests,
};
