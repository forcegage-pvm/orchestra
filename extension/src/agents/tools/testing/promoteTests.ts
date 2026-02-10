/**
 * promoteTests tool - Promote passing TDD red-phase tests into standard tier directories
 *
 * Validates files are in red directory, verifies all tests pass,
 * infers destination from subdirectory structure, uses 'git mv' to preserve history.
 *
 * Aligned with specs/013-test-runner-tools/contracts/promote-tests.md
 */

import { spawn } from "node:child_process";
import { access, stat } from "node:fs/promises";
import * as path from "node:path";

import { ToolErrorCode } from "../errors.js";
import type {
  AgentTool,
  ToolInvocationContext,
  ToolInputSchema,
  ToolResult,
} from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";
import type { TestConfig, TestTier } from "./TestConfigLoader.js";
import { TestConfigLoader } from "./TestConfigLoader.js";
import type {
  PromoteTestsInput,
  PromoteTestsResult,
  PromotionBlockedRecord,
  PromotionRecord,
  RunTestsResult,
} from "./types.js";
import { PromoteTestsInputSchema } from "./types.js";

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
        resolve({ success: false, error: stderr.trim() || `Exit code ${code}` });
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

  // 4. Get last red-phase test results to check pass/fail status
  const lastResult = getLastRedPhaseResult();

  // Build a map of file paths to their test status
  const fileTestStatus = new Map<string, { passing: number; failing: number }>();
  if (lastResult) {
    for (const test of lastResult.tests) {
      const normalizedFile = test.file.replace(/\\/g, "/");
      const status = fileTestStatus.get(normalizedFile) || { passing: 0, failing: 0 };
      if (test.status === "passed") {
        status.passing++;
      } else if (test.status === "failed") {
        status.failing++;
      }
      fileTestStatus.set(normalizedFile, status);
    }
  }

  // 5. Process each file
  const promoted: PromotionRecord[] = [];
  const blocked: PromotionBlockedRecord[] = [];

  for (const filePath of validatedInput.files) {
    const normalizedPath = filePath.replace(/\\/g, "/");
    const absolutePath = path.resolve(context.workspaceRoot, filePath);

    // Check if file is in red directory
    if (!normalizedPath.startsWith(redBasePath.replace(/\\/g, "/"))) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          `File "${filePath}" is not in the red-phase directory.`,
          `Only files in the configured red tier path (${redBasePath}) can be promoted.`,
          { file: filePath, redDirectory: redBasePath },
        ),
      );
    }

    // Check if file exists
    if (!await fileExists(absolutePath)) {
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

    // Check if destination exists
    const destAbsolutePath = path.resolve(context.workspaceRoot, destination);
    if (await fileExists(destAbsolutePath)) {
      blocked.push({
        source: filePath,
        destination,
        reason: "destination-exists",
        message: `Destination file already exists: ${destination}. Resolve the conflict manually before promoting.`,
      });
      continue;
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
      const mvResult = await executeGitMv(filePath, destination, context.workspaceRoot);
      if (mvResult.success) {
        promoted.push({
          source: filePath,
          destination,
          tier,
          testCount,
        });
      } else {
        blocked.push({
          source: filePath,
          destination,
          reason: "file-missing", // Using closest available reason
          message: `git mv failed: ${mvResult.error}`,
        });
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
    const allBlockedDueToFailingTests = blocked.every((b) => b.reason === "still-failing");
    
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
            { blocked: blocked.map((b) => ({ source: b.source, message: b.message })) },
          ),
        );
      }
    }
  }

  // 8. Build output string
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
 */
const promoteTestsInputSchema: ToolInputSchema = {
  type: "object",
  properties: {
    files: {
      type: "string",
      description:
        "File paths within the red-phase directory to promote. Paths must be workspace-relative.",
    },
    dry_run: {
      type: "boolean",
      description:
        "Preview mode — show what would happen without making changes. Default: true (from config).",
    },
  },
  required: ["files"],
};

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
