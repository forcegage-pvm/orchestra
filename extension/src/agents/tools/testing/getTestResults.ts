/**
 * getTestResults tool - Read-only access to test results from TestResultStore
 *
 * Retrieves and re-formats results from the most recent test run without
 * re-executing tests. Supports multiple output formats and filtering.
 *
 * Aligned with specs/013-test-runner-tools/contracts/get-test-results.md
 */

import { ToolErrorCode } from "../errors.js";
import type {
  AgentTool,
  ToolInvocationContext,
  ToolInputSchema,
  ToolResult,
} from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";
import { sharedResultStore } from "./sharedStore.js";
import type {
  GetTestResultsInput,
  RunTestsResult,
  TestOutcome,
} from "./types.js";
import { GetTestResultsInputSchema } from "./types.js";

const TOOL_NAME = "get_test_results";

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
 * Get status indicator character for a test.
 */
function getStatusIndicator(status: "passed" | "failed" | "skipped"): string {
  switch (status) {
    case "passed":
      return "✓";
    case "failed":
      return "✗";
    case "skipped":
      return "○";
  }
}

/**
 * Format a single-line summary for a test result.
 * Format: "Last run (timestamp): STATUS | N passed, N failed, N skipped | Xs"
 */
function formatSummaryLine(result: RunTestsResult): string {
  const status = result.failed > 0 ? "FAIL" : "PASS";
  const durationSec = (result.duration / 1000).toFixed(1);
  return `Last run (${result.timestamp}): ${status} | ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped | ${durationSec}s`;
}

/**
 * Format the scope/fingerprint line.
 */
function formatScopeLine(result: RunTestsResult): string {
  const scopePart = result.target
    ? `${result.scope}/${result.target}`
    : result.scope;
  const fpShort = result.fingerprint.slice(0, 8);
  return `Scope: ${scopePart} | Fingerprint: ${fpShort}...`;
}

/**
 * Format the 'summary' output format.
 */
function formatSummary(result: RunTestsResult): string {
  const lines: string[] = [];
  lines.push(`✓ get_test_results [format=summary]`);
  lines.push("");
  lines.push(formatSummaryLine(result));
  lines.push(formatScopeLine(result));
  return lines.join("\n");
}

/**
 * Format the 'failures' output format.
 */
function formatFailures(result: RunTestsResult, tests: TestOutcome[]): string {
  const lines: string[] = [];
  lines.push(`✓ get_test_results [format=failures]`);
  lines.push("");
  lines.push(formatSummaryLine(result));
  lines.push("");

  const failures = tests.filter((t) => t.status === "failed");
  if (failures.length === 0) {
    lines.push("No failures.");
  } else {
    lines.push("Failures:");
    for (const test of failures) {
      lines.push(`  ✗ ${test.name}`);
      lines.push(`    ${test.file}:${test.line}`);
      if (test.failure) {
        if (test.failure.expected) {
          lines.push(`    Expected: ${test.failure.expected}`);
        }
        if (test.failure.actual) {
          lines.push(`    Actual:   ${test.failure.actual}`);
        }
        if (!test.failure.expected && !test.failure.actual && test.failure.message) {
          lines.push(`    Error: ${test.failure.message}`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}

/**
 * Format the 'full' output format.
 */
function formatFull(
  result: RunTestsResult,
  tests: TestOutcome[],
  nameFilter?: string,
): string {
  const lines: string[] = [];

  const filterInfo = nameFilter
    ? `, name_filter=${nameFilter}`
    : "";
  lines.push(`✓ get_test_results [format=full${filterInfo}]`);
  lines.push("");

  if (nameFilter) {
    lines.push(
      `Filtered ${tests.length} of ${result.total} tests matching "${nameFilter}":`,
    );
  } else {
    lines.push(`All ${tests.length} tests:`);
  }

  for (const test of tests) {
    const indicator = getStatusIndicator(test.status);
    const durationPart = test.status !== "skipped"
      ? `(${test.duration}ms)`
      : "(skipped)";
    lines.push(`  ${indicator} ${test.name} ${durationPart}`);
  }

  return lines.join("\n");
}

/**
 * Format the 'structured' output format (JSON).
 */
function formatStructured(result: RunTestsResult, tests: TestOutcome[]): string {
  const lines: string[] = [];
  lines.push(`✓ get_test_results [format=structured]`);
  lines.push("");

  // Build a filtered result object if tests were filtered
  const outputResult = {
    runId: result.runId,
    scope: result.scope,
    target: result.target,
    timestamp: result.timestamp,
    cached: result.cached,
    total: result.total,
    passed: result.passed,
    failed: result.failed,
    skipped: result.skipped,
    duration: result.duration,
    tests: tests,
  };

  lines.push(JSON.stringify(outputResult, null, 2));

  return lines.join("\n");
}

/**
 * Filter tests by status and/or name pattern.
 */
function filterTests(
  tests: TestOutcome[],
  status?: "passed" | "failed" | "skipped",
  nameFilter?: string,
): TestOutcome[] {
  let filtered = tests;

  // Filter by status
  if (status) {
    filtered = filtered.filter((t) => t.status === status);
  }

  // Filter by name pattern (regex)
  if (nameFilter) {
    try {
      const regex = new RegExp(nameFilter, "i");
      filtered = filtered.filter((t) => regex.test(t.name));
    } catch {
      // If regex is invalid, treat as literal string match
      const lowerFilter = nameFilter.toLowerCase();
      filtered = filtered.filter((t) =>
        t.name.toLowerCase().includes(lowerFilter),
      );
    }
  }

  return filtered;
}

/**
 * Execute the get_test_results tool.
 */
async function getTestResults(
  input: GetTestResultsInput,
  _context: ToolInvocationContext,
): Promise<ToolResult> {
  // Validate input with Zod schema
  const parseResult = GetTestResultsInputSchema.safeParse(input);
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
  const { format, status, name_filter, run_id } = validatedInput;

  // 1. Retrieve result from store
  let result: RunTestsResult | undefined;

  if (run_id) {
    // Look up by specific run ID
    result = sharedResultStore.getByRunId(run_id);
    if (!result) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          `Run ID "${run_id}" not found.`,
          "Use without run_id to get the most recent results.",
        ),
      );
    }
  } else {
    // Get most recent result
    result = sharedResultStore.getLatest();
    if (!result) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.NO_OUTPUT,
          "No test results available.",
          "Run tests first using the run_tests tool.",
        ),
      );
    }
  }

  // 2. Filter tests
  const filteredTests = filterTests(result.tests, status, name_filter);

  // 3. Format output based on format parameter
  let output: string;

  switch (format) {
    case "summary":
      output = formatSummary(result);
      break;
    case "failures":
      output = formatFailures(result, filteredTests);
      break;
    case "full":
      output = formatFull(result, filteredTests, name_filter);
      break;
    case "structured":
      output = formatStructured(result, filteredTests);
      break;
    default: {
      // Should never happen due to Zod validation, but handle defensively
      const _exhaustive: never = format;
      output = formatSummary(result);
    }
  }

  return buildToolResult(successResult(TOOL_NAME, output));
}

/**
 * Input schema for the get_test_results tool in JSON Schema format.
 */
const getTestResultsInputSchema: ToolInputSchema = {
  type: "object",
  properties: {
    format: {
      type: "string",
      description:
        "Output format: 'summary' (one-line), 'failures' (summary + failure details), 'full' (all tests), 'structured' (JSON data). Default: 'summary'.",
      enum: ["summary", "failures", "full", "structured"],
      default: "summary",
    },
    status: {
      type: "string",
      description: "Filter to tests with this status only.",
      enum: ["passed", "failed", "skipped"],
    },
    name_filter: {
      type: "string",
      description: "Regex to filter test names. Only matching tests are included.",
    },
    run_id: {
      type: "string",
      description: "Specific run ID to retrieve. Defaults to the most recent run.",
    },
  },
  required: [],
};

/**
 * get_test_results AgentTool - Retrieve and re-format test results.
 *
 * Provides read-only access to the TestResultStore with multiple output formats:
 * - summary: One-line pass/fail count with duration
 * - failures: Summary plus full failure details
 * - full: All test results with status indicators
 * - structured: JSON data for programmatic access
 *
 * Supports filtering by status (passed/failed/skipped) and name pattern (regex).
 */
export const getTestResultsTool: AgentTool<GetTestResultsInput> = {
  name: TOOL_NAME,
  description:
    "Retrieve and re-format results from the most recent test run " +
    "without re-executing tests. Supports multiple output formats " +
    "(summary, failures, full, structured) and filtering by status or name pattern.",
  inputSchema: getTestResultsInputSchema,
  invoke: getTestResults,
};
