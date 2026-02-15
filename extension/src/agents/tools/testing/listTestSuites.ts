/**
 * listTestSuites tool - Discover test suites, files, and individual tests
 *
 * Provides a drill-down view of test structure:
 * - suites: Tier overview with file counts
 * - files: File listing within a tier
 * - tests: Individual test names within a file
 *
 * Aligned with specs/013-test-runner-tools/contracts/list-test-suites.md
 */

import { readFile, readdir, stat } from "node:fs/promises";
import * as path from "node:path";

import type { TestTier } from "../../../../../src/core/testing/TestConfigLoader.js";
import { TestConfigLoader } from "../../../../../src/core/testing/TestConfigLoader.js";
import type {
  ListTestSuitesInput,
  TestEntry,
  TestFileEntry,
  TierSummary,
} from "../../../../../src/core/testing/types.js";
import { ListTestSuitesInputSchema } from "../../../../../src/core/testing/types.js";
import { ToolErrorCode } from "../errors.js";
import type {
  AgentTool,
  ToolInputSchema,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

const TOOL_NAME = "list_test_suites";

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
 * Extract directory path from a glob pattern.
 * Example: "test/unit/**\/*.test.ts" → "test/unit"
 */
function extractDirectoryFromGlob(globPattern: string): string {
  const wildcardIndex = globPattern.search(/[*?]/);
  if (wildcardIndex === -1) {
    return globPattern.endsWith("/") ? globPattern.slice(0, -1) : globPattern;
  }

  const beforeWildcard = globPattern.substring(0, wildcardIndex);
  const lastSlash = beforeWildcard.lastIndexOf("/");
  if (lastSlash === -1) {
    return "";
  }

  return beforeWildcard.substring(0, lastSlash);
}

/**
 * Extract file extension pattern from a glob.
 * Example: "test/unit/**\/*.test.ts" → ".test.ts"
 */
function extractFilePattern(globPattern: string): RegExp {
  // Extract the file matching part (after last **/)
  const lastSlash = globPattern.lastIndexOf("/");
  const filePattern =
    lastSlash >= 0 ? globPattern.slice(lastSlash + 1) : globPattern;

  // Convert glob to regex: *.test.ts → .*\.test\.ts$
  const regexPattern = filePattern.replace(/\./g, "\\.").replace(/\*/g, ".*");

  return new RegExp(`${regexPattern}$`);
}

/**
 * Recursively find all test files in a directory matching a pattern.
 */
async function findTestFiles(
  dirPath: string,
  pattern: RegExp,
  workspaceRoot: string,
): Promise<TestFileEntry[]> {
  const entries: TestFileEntry[] = [];

  try {
    const items = await readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(dirPath, item.name);

      if (item.isDirectory()) {
        // Recurse into subdirectories
        const subEntries = await findTestFiles(
          itemPath,
          pattern,
          workspaceRoot,
        );
        entries.push(...subEntries);
      } else if (item.isFile() && pattern.test(item.name)) {
        // This is a test file
        const relativePath = path
          .relative(workspaceRoot, itemPath)
          .replace(/\\/g, "/");
        const stats = await stat(itemPath);
        const testCount = await countTestsInFile(itemPath);

        entries.push({
          path: relativePath,
          testCount,
          lastModified: stats.mtime.toISOString(),
        });
      }
    }
  } catch {
    // Directory doesn't exist or can't be read - return empty
  }

  return entries;
}

/**
 * Count the number of tests in a file using simple regex matching.
 * Looks for describe(, it(, and test( patterns.
 */
async function countTestsInFile(filePath: string): Promise<number> {
  try {
    const content = await readFile(filePath, "utf-8");
    // Count test declarations: it(, test(
    // Don't count describe( as individual tests, but as suites
    const testPattern = /\b(it|test)\s*\(/g;
    const matches = content.match(testPattern);
    return matches?.length ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Parse test file to extract test names and line numbers.
 * Uses lightweight regex-based parsing for describe/it/test blocks.
 */
async function parseTestFile(filePath: string): Promise<TestEntry[]> {
  const entries: TestEntry[] = [];

  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");

    // Patterns to match: describe("...", it("...", test("...
    // Handle both single and double quotes, and template literals
    const describePattern = /\b(describe)\s*\(\s*["'`]([^"'`]+)["'`]/;
    const testPattern = /\b(it|test)\s*\(\s*["'`]([^"'`]+)["'`]/;

    // Track current describe context for building full names
    const describeStack: string[] = [];
    const indentStack: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const lineNum = i + 1;
      const indent = line.search(/\S/);
      if (indent === -1) continue;

      // Pop describe contexts when we dedent
      while (
        indentStack.length > 0 &&
        indent <= indentStack[indentStack.length - 1]!
      ) {
        indentStack.pop();
        describeStack.pop();
      }

      // Check for describe block
      const describeMatch = describePattern.exec(line);
      if (describeMatch) {
        const describeName = describeMatch[2];
        if (describeName !== undefined) {
          entries.push({
            name: `describe "${describeName}"`,
            line: lineNum,
          });
          describeStack.push(describeName);
          indentStack.push(indent);
        }
        continue;
      }

      // Check for test block
      const testMatch = testPattern.exec(line);
      if (testMatch) {
        const testName = testMatch[2];
        if (testName !== undefined) {
          entries.push({ name: `it "${testName}"`, line: lineNum });
        }
      }
    }
  } catch {
    // File can't be read - return empty
  }

  return entries;
}

/**
 * Get tier summary information.
 */
async function getTierSummary(
  tier: TestTier,
  workspaceRoot: string,
): Promise<TierSummary> {
  const dirPath = extractDirectoryFromGlob(tier.path);
  const pattern = extractFilePattern(tier.path);

  const absoluteDir = path.join(workspaceRoot, dirPath);
  const files = await findTestFiles(absoluteDir, pattern, workspaceRoot);

  const fileCount = files.length;
  const testCount = files.reduce((sum, f) => sum + f.testCount, 0);

  return {
    name: tier.name,
    fileCount,
    testCount,
    inverted: tier.inverted ?? false,
    path: tier.path,
  };
}

/**
 * Format suites overview output.
 */
function formatSuitesOutput(tiers: TierSummary[]): string {
  const lines: string[] = [];
  lines.push(`✓ list_test_suites [detail=suites]`);
  lines.push("");
  lines.push("Test Suites:");

  let totalFiles = 0;
  let totalTests = 0;

  for (const tier of tiers) {
    totalFiles += tier.fileCount;
    totalTests += tier.testCount;

    const fileCountStr = `${tier.fileCount} file${tier.fileCount !== 1 ? "s" : ""}`;
    const testCountStr = `~${tier.testCount} test${tier.testCount !== 1 ? "s" : ""}`;

    // Build flags
    const flags: string[] = [];
    if (tier.inverted) {
      flags.push("inverted assertions");
    }

    const flagStr = flags.length > 0 ? ` (${flags.join(", ")})` : "";

    // Pad name to align columns
    const paddedName = tier.name.padEnd(12);
    lines.push(
      `  ${paddedName} ${fileCountStr.padEnd(10)} ${testCountStr.padEnd(14)}${flagStr}`,
    );
  }

  lines.push("");
  lines.push(
    `Total: ${totalFiles} files, ~${totalTests} tests across ${tiers.length} configured tier${tiers.length !== 1 ? "s" : ""}`,
  );

  return lines.join("\n");
}

/**
 * Format files listing output.
 */
function formatFilesOutput(tierName: string, files: TestFileEntry[]): string {
  const lines: string[] = [];
  lines.push(`✓ list_test_suites [detail=files, tier=${tierName}]`);
  lines.push("");

  if (files.length === 0) {
    lines.push(`No test files found in "${tierName}" tier.`);
    return lines.join("\n");
  }

  lines.push(`Files in "${tierName}" tier (${files.length} files):`);

  // Show all files (no truncation - agents need full visibility)
  for (const file of files) {
    const testCountStr = `${file.testCount} test${file.testCount !== 1 ? "s" : ""}`;
    lines.push(`  ${file.path.padEnd(50)} ${testCountStr}`);
  }

  const totalTests = files.reduce((sum, f) => sum + f.testCount, 0);
  lines.push("");
  lines.push(`Total: ${files.length} files, ~${totalTests} tests`);

  return lines.join("\n");
}

/**
 * Format tests listing output.
 */
function formatTestsOutput(filePath: string, tests: TestEntry[]): string {
  const lines: string[] = [];
  lines.push(`✓ list_test_suites [detail=tests, file=${filePath}]`);
  lines.push("");

  if (tests.length === 0) {
    lines.push(`No tests found in ${filePath}.`);
    return lines.join("\n");
  }

  lines.push(`Tests in ${filePath} (${tests.length} entries):`);

  for (const test of tests) {
    const lineNum = `L${test.line}`.padEnd(5);
    lines.push(`  ${lineNum} ${test.name}`);
  }

  return lines.join("\n");
}

/**
 * Execute the list_test_suites tool.
 */
async function listTestSuites(
  input: ListTestSuitesInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  // Validate input with Zod schema
  const parseResult = ListTestSuitesInputSchema.safeParse(input);
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
  const { detail, tier, file } = validatedInput;

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

  // 2. Process based on detail level
  let output: string;
  switch (detail) {
    case "suites": {
      // Get summary for all tiers
      const tiers: TierSummary[] = [];
      for (const tierConfig of config.tiers) {
        const summary = await getTierSummary(tierConfig, context.workspaceRoot);
        tiers.push(summary);
      }

      output = formatSuitesOutput(tiers);
      break;
    }

    case "files": {
      // Require tier parameter
      if (!tier) {
        return buildToolResult(
          errorResult(
            TOOL_NAME,
            ToolErrorCode.INVALID_INPUT,
            "Tier parameter is required for 'files' detail level.",
            "Specify which tier to list files for: tier='unit'",
          ),
        );
      }

      // Find the tier in config
      const tierConfig = config.tiers.find((t) => t.name === tier);
      if (!tierConfig) {
        const availableTiers = config.tiers.map((t) => t.name).join(", ");
        return buildToolResult(
          errorResult(
            TOOL_NAME,
            ToolErrorCode.TIER_NOT_CONFIGURED,
            `Tier "${tier}" is not declared in .agent-test-config.json.`,
            `Available tiers: ${availableTiers}.`,
          ),
        );
      }

      // Get files in this tier
      const dirPath = extractDirectoryFromGlob(tierConfig.path);
      const pattern = extractFilePattern(tierConfig.path);
      const absoluteDir = path.join(context.workspaceRoot, dirPath);
      const files = await findTestFiles(
        absoluteDir,
        pattern,
        context.workspaceRoot,
      );

      output = formatFilesOutput(tier, files);
      break;
    }

    case "tests": {
      // Require tier and file parameters
      if (!tier) {
        return buildToolResult(
          errorResult(
            TOOL_NAME,
            ToolErrorCode.INVALID_INPUT,
            "Tier parameter is required for 'tests' detail level.",
            "Specify which tier and file to list tests for.",
          ),
        );
      }

      if (!file) {
        return buildToolResult(
          errorResult(
            TOOL_NAME,
            ToolErrorCode.INVALID_INPUT,
            "File parameter is required for 'tests' detail level.",
            "Specify which file to list tests for: file='test/unit/core/yaml.test.ts'",
          ),
        );
      }

      // Find the tier in config
      const tierConfig = config.tiers.find((t) => t.name === tier);
      if (!tierConfig) {
        const availableTiers = config.tiers.map((t) => t.name).join(", ");
        return buildToolResult(
          errorResult(
            TOOL_NAME,
            ToolErrorCode.TIER_NOT_CONFIGURED,
            `Tier "${tier}" is not declared in .agent-test-config.json.`,
            `Available tiers: ${availableTiers}.`,
          ),
        );
      }

      // Check if file exists
      const absolutePath = path.join(context.workspaceRoot, file);
      try {
        const stats = await stat(absolutePath);
        if (!stats.isFile()) {
          throw new Error("Not a file");
        }
      } catch {
        return buildToolResult(
          errorResult(
            TOOL_NAME,
            ToolErrorCode.FILE_NOT_FOUND,
            `File "${file}" not found.`,
            "Check the file path and ensure it exists.",
          ),
        );
      }

      // Parse the file to get test names
      const tests = await parseTestFile(absolutePath);

      output = formatTestsOutput(file, tests);
      break;
    }

    default: {
      // Should never happen due to Zod validation - exhaustiveness check
      output = ((_x: never): string => `Invalid detail level: ${_x}`)(detail);
    }
  }

  return buildToolResult(successResult(TOOL_NAME, output));
}

/**
 * Input schema for the list_test_suites tool in JSON Schema format.
 */
const listTestSuitesInputSchema: ToolInputSchema = {
  type: "object",
  properties: {
    detail: {
      type: "string",
      description:
        "Detail level: 'suites' (tier overview), 'files' (file listing in a tier), 'tests' (test names in a file). Default: 'suites'.",
      enum: ["suites", "files", "tests"],
      default: "suites",
    },
    tier: {
      type: "string",
      description:
        "Tier name to drill into. Required for 'files' and 'tests' detail levels.",
    },
    file: {
      type: "string",
      description:
        "File path to drill into. Required for 'tests' detail level.",
    },
  },
  required: [],
};

/**
 * list_test_suites AgentTool - Discover test suites, files, and tests.
 *
 * Provides a drill-down discovery mechanism:
 * - suites: Overview of all configured tiers with file counts
 * - files: List all test files in a specific tier
 * - tests: Parse a test file to show individual test names with line numbers
 *
 * Helps agents make informed scoping decisions before running tests.
 */
export const listTestSuitesTool: AgentTool<ListTestSuitesInput> = {
  name: TOOL_NAME,
  description:
    "Discover test suites, files, and individual tests in the workspace. " +
    "Drill down from tier summary → file listing → individual test names. " +
    "Helps agents make informed scoping decisions before running tests.",
  inputSchema: listTestSuitesInputSchema,
  invoke: listTestSuites,
};
