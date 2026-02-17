/**
 * promoteTests tool - Promote passing TDD red-phase tests into standard tier directories
 *
 * Validates files are in red directory, verifies all tests pass,
 * infers destination from subdirectory structure, uses 'git mv' to preserve history.
 *
 * Aligned with specs/013-test-runner-tools/contracts/promote-tests.md
 */

import { spawn } from "node:child_process";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import * as path from "node:path";

import { ResultFormatter } from "../../../../../src/core/testing/ResultFormatter.js";
import type {
  TestConfig,
  TestTier,
} from "../../../../../src/core/testing/TestConfigLoader.js";
import { TestConfigLoader } from "../../../../../src/core/testing/TestConfigLoader.js";
import type {
  PromoteTestsInput,
  PromoteTestsResult,
  PromotionBlockedRecord,
  PromotionRecord,
  RunTestsResult,
} from "../../../../../src/core/testing/types.js";
import { PromoteTestsInputSchema } from "../../../../../src/core/testing/types.js";
import { TestRunnerFactory } from "../../../../../src/core/testing/TestRunnerFactory.js";import { ToolErrorCode } from "../errors.js";
import type {
  AgentTool,
  ToolInputSchema,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

const TOOL_NAME = "promote_tests";

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
 * Pattern matching // @orchestra-task: N or # @orchestra-task: N lines.
 * Used to strip the task annotation from files during promotion (FR-018a).
 */
const ORCHESTRA_TASK_LINE_PATTERN =
  /^[ \t]*(?:\/\/|#)\s*@orchestra-task:\s*\d+\s*$/;

/**
 * Remove // @orchestra-task: N comment lines from file content.
 * Called during promotion to strip the task linking annotation.
 */
function removeOrchestraTaskComment(content: string): string {
  const lines = content.split("\n");
  const filtered = lines.filter(
    (line) => !ORCHESTRA_TASK_LINE_PATTERN.test(line.replace(/\r$/, "")),
  );
  return filtered.join("\n");
}

/**
 * Adjust relative import paths after moving a file up by one directory level.
 *
 * When promote_tests moves files from test/red/{tier}/ to test/{tier}/, the
 * directory depth decreases by 1. All relative imports starting with "../"
 * need one fewer "../" prefix. For example:
 *   "../../../src/core/foo.js" → "../../src/core/foo.js"
 *
 * Handles ES import/export, dynamic import(), and require() patterns.
 * Only adjusts paths that start with "../" (already going up).
 */
function adjustRelativeImports(
  content: string,
  depthReduction: number,
): string {
  if (depthReduction <= 0) return content;

  // Match: from "...path...", from '...path...', import("...path..."), require("...path...")
  // Captures the relative path inside quotes that starts with ../
  const importPattern =
    /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'](\.\.\/[^"']+)["']/g;

  return content.replace(importPattern, (match, relativePath: string) => {
    // Count leading ../
    let upCount = 0;
    let rest = relativePath;
    while (rest.startsWith("../")) {
      upCount++;
      rest = rest.slice(3);
    }

    // Reduce by depthReduction, but never below 1 (must still go up at least once
    // to escape test/{tier}/ into workspace root)
    const newUpCount = Math.max(1, upCount - depthReduction);
    const newPath = "../".repeat(newUpCount) + rest;
    return match.replace(relativePath, newPath);
  });
}

/**
 * Extract directory prefix from a glob pattern.
 * Example: "test/red/**\/*.test.ts" becomes "test/red/"
 */
function extractDirectoryFromGlob(globPattern: string): string {
  const wildcardIndex = globPattern.search(/[*?]/);
  if (wildcardIndex === -1) {
    return globPattern.endsWith("/") ? globPattern : `${globPattern}/`;
  }

  const beforeWildcard = globPattern.substring(0, wildcardIndex);
  const lastSlash = beforeWildcard.lastIndexOf("/");
  if (lastSlash === -1) {
    return "";
  }

  return beforeWildcard.substring(0, lastSlash + 1);
}

/**
 * Infer the destination path and tier for a red-phase test file.
 */
function inferDestination(
  sourcePath: string,
  redTier: TestTier,
  config: TestConfig,
): { destination: string; tier: string } | null {
  const redBasePath = extractDirectoryFromGlob(redTier.path);

  // Normalize paths to use forward slashes
  const normalizedSource = sourcePath.replace(/\\/g, "/");
  const normalizedRedBase = redBasePath.replace(/\\/g, "/");

  // Check if file is in red directory
  if (!normalizedSource.startsWith(normalizedRedBase)) {
    return null;
  }

  // Extract the path after the red directory
  const relativePath = normalizedSource.slice(normalizedRedBase.length);

  // Infer tier from the first subdirectory
  const firstSlash = relativePath.indexOf("/");
  if (firstSlash === -1) {
    // File is directly in red directory without tier subdirectory
    return null;
  }

  const inferredTierName = relativePath.slice(0, firstSlash);
  const restPath = relativePath.slice(firstSlash + 1);

  // Find the declared tier with this name (must be non-inverted)
  const targetTier = config.tiers.find(
    (t) => t.name === inferredTierName && !t.inverted,
  );

  if (targetTier) {
    const targetBasePath = extractDirectoryFromGlob(targetTier.path);
    return {
      destination: `${targetBasePath}${restPath}`,
      tier: inferredTierName,
    };
  }

  // No matching tier found - use default path structure
  return {
    destination: `test/${inferredTierName}/${restPath}`,
    tier: inferredTierName,
  };
}

/**
 * Execute git mv command.
 */
async function executeGitMv(
  source: string,
  destination: string,
  workspaceRoot: string,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", ["mv", source, destination], {
      cwd: workspaceRoot,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      resolve({ success: false, error: error.message });
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({
          success: false,
          error: stderr.trim() || `Exit code ${code}`,
        });
      }
    });
  });
}

/**
 * Check if a file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    const statResult = await stat(filePath);
    return statResult.isFile();
  } catch {
    return false;
  }
}

/**
 * Ensure parent directory exists for destination path.
 */
async function ensureParentDir(filePath: string): Promise<void> {
  const parentDir = path.dirname(filePath);
  try {
    await access(parentDir);
  } catch {
    // We'll let git mv handle directory creation (it may fail if parent doesn't exist)
    // In practice, git mv creates parent directories
  }
}

/**
 * Module-level cache for the last red-phase test results.
 * In a real implementation, this would use TestResultStore,
 * but for now we'll check if all tests in the redPhase result are passing.
 */
let lastRedPhaseResult: RunTestsResult | undefined;

/**
 * Set the last red-phase result (called by runTests when scope='red').
 */
export function setLastRedPhaseResult(result: RunTestsResult): void {
  lastRedPhaseResult = result;
}

/**
 * Get the last red-phase result.
 */
export function getLastRedPhaseResult(): RunTestsResult | undefined {
  return lastRedPhaseResult;
}

/**
 * Clear the cached red-phase result.
 * Called after successful non-dry-run promotion to prevent stale cache issues.
 */
export function clearLastRedPhaseResult(): void {
  lastRedPhaseResult = undefined;
}

/**
 * Execute the promote_tests tool.
 */
async function promoteTests(
  input: PromoteTestsInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  // Validate input with Zod schema
  const parseResult = PromoteTestsInputSchema.safeParse(input);
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

  // 2. Find the red tier
  const redTier = config.tiers.find((t) => t.inverted === true);
  if (!redTier) {
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.TIER_NOT_CONFIGURED,
        "No red-phase tier configured.",
        "Add a tier with 'inverted: true' in .agent-test-config.json to enable TDD red-phase testing.",
      ),
    );
  }

  const redBasePath = extractDirectoryFromGlob(redTier.path);

  // 3. Determine dry_run mode (default from config)
  const dryRun = validatedInput.dry_run ?? config.promotion.dryRun;

  // 4. Run fresh tests for the specified files (ALWAYS - never use cached results)
  //    This ensures we don't have stale data from previous run_tests calls.
  const runner = TestRunnerFactory.create(config.framework);  const formatter = new ResultFormatter();

  let testRunResult: RunTestsResult;
  try {
    const runOutput = await runner.execute({
      files: validatedInput.files,
      workingDir: context.workspaceRoot,
      timeout: config.defaultTimeout,
    });

    testRunResult = formatter.format(runOutput.tests, {
      maxFailureLines: config.maxFailureLines,
      framework: runner.framework,
    });
  } catch (err) {    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.TEST_EXECUTION_ERROR,
        `Failed to run tests for promotion check: ${err instanceof Error ? err.message : String(err)}`,
        "Ensure tests can be executed before attempting promotion.",
      ),
    );
  }

  // Build a map of file paths to their test status from fresh results.
  // IMPORTANT: Vitest reports absolute file paths in test results (testResult.name),
  // but agents pass workspace-relative paths. We normalize all keys to
  // workspace-relative with forward slashes so lookups match.
  const wsRootNorm = context.workspaceRoot
    .replace(/\\/g, "/")
    .replace(/\/$/, "");
  const wsRootLower = (wsRootNorm + "/").toLowerCase();
  const fileTestStatus = new Map<
    string,
    { passing: number; failing: number }
  >();
  for (const test of testRunResult.tests) {
    let normalizedFile = test.file.replace(/\\/g, "/");
    // Strip workspace root prefix to get workspace-relative path (case-insensitive for Windows drive letters)
    if (normalizedFile.toLowerCase().startsWith(wsRootLower)) {
      normalizedFile = normalizedFile.slice(wsRootLower.length);
    }
    const status = fileTestStatus.get(normalizedFile) || {
      passing: 0,
      failing: 0,
    };
    if (test.status === "passed") {
      status.passing++;
    } else if (test.status === "failed") {
      status.failing++;
    }
    fileTestStatus.set(normalizedFile, status);
  }

  // 5. Process each file
  const promoted: PromotionRecord[] = [];
  const blocked: PromotionBlockedRecord[] = [];

  const normalizedRedBase = redBasePath.replace(/\\/g, "/");

  for (const filePath of validatedInput.files) {
    // Normalize input path: convert backslashes to forward slashes,
    // and strip workspace root prefix to get workspace-relative form.
    // Agents may pass absolute paths, backslash paths, or relative paths.
    let normalizedPath = filePath.replace(/\\/g, "/");
    if (normalizedPath.toLowerCase().startsWith(wsRootLower)) {
      normalizedPath = normalizedPath.slice(wsRootLower.length);
    }
    const absolutePath = path.resolve(context.workspaceRoot, normalizedPath);

    // Check if file is in red directory
    if (!normalizedPath.startsWith(normalizedRedBase)) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          `File "${filePath}" is not in the red-phase directory.`,
          `Only files in the configured red tier path (${redBasePath}) can be promoted. Provide a workspace-relative path starting with "${redBasePath}".`,
          {
            file: filePath,
            normalizedAs: normalizedPath,
            redDirectory: redBasePath,
          },
        ),
      );
    }

    // Check if file exists
    if (!(await fileExists(absolutePath))) {
      blocked.push({
        source: filePath,
        destination: "",
        reason: "file-missing",
        message: `File "${filePath}" not found. It may have been deleted or renamed since the last red-phase run.`,
      });
      continue;
    }

    // Infer destination
    const destInfo = inferDestination(normalizedPath, redTier, config);
    if (!destInfo) {
      blocked.push({
        source: filePath,
        destination: "",
        reason: "still-failing",
        message: `Cannot infer destination for "${filePath}". File must be in a tier subdirectory (e.g., test/red/unit/...).`,
      });
      continue;
    }

    const destination = destInfo.destination;
    const tier = destInfo.tier;

    // Check test status
    const testStatus = fileTestStatus.get(normalizedPath);
    if (!testStatus) {
      // No test results available - we can't verify status
      // For safety, block promotion without test verification
      blocked.push({
        source: filePath,
        destination,
        reason: "file-missing", // Use file-missing to indicate pre-condition not met (no test data)
        message: `No test results found for "${filePath}". Run tests with scope "red" first to verify test status.`,
      });
      continue;
    }

    if (testStatus.failing > 0) {
      blocked.push({
        source: filePath,
        destination,
        reason: "still-failing",
        message: `${testStatus.failing} of ${testStatus.passing + testStatus.failing} tests still failing. Cannot promote until all tests pass.`,
      });
      continue;
    }

    // Check if destination exists — fail-fast on conflict (FR-018b)
    const destAbsolutePath = path.resolve(context.workspaceRoot, destination);
    if (await fileExists(destAbsolutePath)) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          `Promotion conflict: destination already exists: ${destination} (source: ${filePath}). ` +
            `${promoted.length} file(s) were already promoted before this conflict.`,
          "Resolve the conflict manually before promoting.",
          { source: filePath, destination, alreadyPromoted: promoted.length },
        ),
      );
    }

    // Ready to promote
    const testCount = testStatus.passing;

    if (dryRun) {
      // Dry run - just record what would happen
      promoted.push({
        source: filePath,
        destination,
        tier,
        testCount,
      });
    } else {
      // Actual promotion - use git mv
      await ensureParentDir(destAbsolutePath);
      const mvResult = await executeGitMv(
        filePath,
        destination,
        context.workspaceRoot,
      );
      if (mvResult.success) {
        // Strip // @orchestra-task: N annotation from promoted file (FR-018a)
        try {
          let content = await readFile(destAbsolutePath, "utf-8");
          const cleaned = removeOrchestraTaskComment(content);
          if (cleaned !== content) {
            content = cleaned;
          }
          // Adjust relative imports: test/red/{tier}/ → test/{tier}/ removes
          // one directory level, so ../../../x becomes ../../x
          const adjusted = adjustRelativeImports(content, 1);
          if (adjusted !== content) {
            await writeFile(destAbsolutePath, adjusted, "utf-8");
          } else if (cleaned !== (await readFile(destAbsolutePath, "utf-8"))) {
            // Only annotation was cleaned, no import adjustment needed
            await writeFile(destAbsolutePath, content, "utf-8");
          }
        } catch {
          // Non-fatal: file was promoted but post-processing failed
        }

        promoted.push({
          source: filePath,
          destination,
          tier,
          testCount,
        });
      } else {
        // Fail-fast on git mv failure (FR-018b)
        return buildToolResult(
          errorResult(
            TOOL_NAME,
            ToolErrorCode.INVALID_INPUT,
            `git mv failed for "${filePath}": ${mvResult.error}. ` +
              `${promoted.length} file(s) were already promoted before this failure.`,
            "Check file status and git state.",
            { source: filePath, destination, alreadyPromoted: promoted.length },
          ),
        );
      }
    }
  }

  // 6. Build result
  const result: PromoteTestsResult = {
    dryRun,
    promoted,
    blocked,
    summary: buildSummary(dryRun, promoted, blocked),
  };

  // 7. Check if all files were blocked due to all tests actually failing
  if (promoted.length === 0 && blocked.length > 0) {
    // Check if all blocks are due to tests still failing AND no tests are passing
    const allBlockedDueToFailingTests = blocked.every(
      (b) => b.reason === "still-failing",
    );

    if (allBlockedDueToFailingTests) {
      // Check if there are any passing tests across all blocked files
      let anyPassingTests = false;
      for (const [, status] of fileTestStatus) {
        if (status.passing > 0) {
          anyPassingTests = true;
          break;
        }
      }

      // Return error only if literally ALL tests in ALL files are failing
      if (!anyPassingTests) {
        return buildToolResult(
          errorResult(
            TOOL_NAME,
            ToolErrorCode.PROMOTION_BLOCKED,
            "All specified files have failing tests and cannot be promoted.",
            'Run tests with scope "red" to see current failure status.',
            {
              blocked: blocked.map((b) => ({
                source: b.source,
                message: b.message,
              })),
            },
          ),
        );
      }
    }
  }

  // 8. Clear cache after successful non-dry-run promotion
  //    This prevents stale cache issues if promote_tests is called again
  //    without re-running tests first (the promoted files are no longer in test/red/)
  if (!dryRun && promoted.length > 0) {
    clearLastRedPhaseResult();
  }

  // 9. Build output string
  const output = formatPromoteOutput(result);

  return buildToolResult(successResult(TOOL_NAME, output));
}

/**
 * Build summary message for PromoteTestsResult.
 */
function buildSummary(
  dryRun: boolean,
  promoted: PromotionRecord[],
  blocked: PromotionBlockedRecord[],
): string {
  const promotedCount = promoted.length;
  const blockedCount = blocked.length;

  if (dryRun) {
    if (promotedCount === 0 && blockedCount === 0) {
      return "No files to process.";
    } else if (blockedCount === 0) {
      return `DRY RUN: Would promote ${promotedCount} file(s).`;
    } else if (promotedCount === 0) {
      return `DRY RUN: All ${blockedCount} file(s) blocked from promotion.`;
    } else {
      return `DRY RUN: Would promote ${promotedCount} file(s), ${blockedCount} blocked.`;
    }
  } else {
    if (promotedCount === 0 && blockedCount === 0) {
      return "No files processed.";
    } else if (blockedCount === 0) {
      return `Promoted ${promotedCount} file(s) successfully.`;
    } else if (promotedCount === 0) {
      return `All ${blockedCount} file(s) blocked from promotion.`;
    } else {
      return `${promotedCount} promoted, ${blockedCount} blocked.`;
    }
  }
}

/**
 * Format the promote_tests output string.
 */
function formatPromoteOutput(result: PromoteTestsResult): string {
  const lines: string[] = [];

  lines.push(`✓ promote_tests [dry_run=${result.dryRun}]`);
  lines.push("");

  if (result.dryRun) {
    lines.push("DRY RUN — No files moved.");
    lines.push("");
  }

  if (result.promoted.length > 0) {
    const header = result.dryRun
      ? `Would promote ${result.promoted.length} file(s):`
      : `Promoted ${result.promoted.length} file(s):`;
    lines.push(header);

    for (const record of result.promoted) {
      lines.push(`  ✓ ${record.source} → ${record.destination}`);
      const suffix = result.dryRun
        ? `(${record.testCount} test(s), all passing)`
        : `(${record.testCount} test(s), git mv preserved history)`;
      lines.push(`    ${suffix}`);
    }
    lines.push("");
  }

  if (result.blocked.length > 0) {
    lines.push(`Blocked (${result.blocked.length} file(s)):`);

    for (const record of result.blocked) {
      lines.push(`  ✗ ${record.source} — ${record.message}`);
    }
    lines.push("");
  }

  lines.push(result.summary);

  if (result.dryRun && result.promoted.length > 0) {
    lines.push("");
    lines.push("Run again with dry_run=false to execute the promotion.");
  }

  return lines.join("\n");
}

/**
 * Input schema for the promote_tests tool in JSON Schema format.
 * Uses `as ToolInputSchema` cast to preserve `items` (ToolInputSchema type strips it).
 */
const promoteTestsInputSchema = {
  type: "object",
  properties: {
    files: {
      type: "array",
      items: { type: "string" },
      description:
        "Array of file paths within the red-phase directory to promote. Paths must be workspace-relative.",
    },
    dry_run: {
      type: "boolean",
      description:
        "Preview mode — show what would happen without making changes. Default: true (from config).",
    },
  },
  required: ["files"],
} as ToolInputSchema;

/**
 * promote_tests AgentTool - Promote passing TDD red-phase tests into standard tier directories.
 *
 * Dry-run by default — shows what would be moved without making changes.
 * Uses 'git mv' to preserve version control history.
 * Blocks promotion of tests that are still failing.
 */
export const promoteTestsTool: AgentTool<PromoteTestsInput> = {
  name: TOOL_NAME,
  description:
    "Promote passing TDD red-phase tests into standard test tier directories. " +
    "Dry-run by default — shows what would be moved without making changes. " +
    "Uses 'git mv' to preserve version control history. " +
    "Blocks promotion of tests that are still failing.",
  inputSchema: promoteTestsInputSchema,
  invoke: promoteTests,
};
