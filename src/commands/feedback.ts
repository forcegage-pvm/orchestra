/**
 * Feedback Command
 *
 * CLI wrapper for orchestra feedback.
 * Generates actionable feedback for implementor after verification failure.
 *
 * Bible Section 8.5: generate-feedback
 */

import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "yaml";
import {
  getResolvedPaths,
  loadConfig,
  requireOrchestraRoot,
} from "../core/config.js";
import { isOrchestraError } from "../core/errors.js";
import { runFeedback, type FeedbackResult } from "../core/feedback.js";
import * as output from "../core/output.js";
import type { VerifyResult } from "../core/verification.js";

interface FeedbackCommandOptions {
  task?: string;
  json?: boolean;
}

/**
 * Create the feedback command
 */
export function createFeedbackCommand(): Command {
  const cmd = new Command("feedback")
    .description("Generate feedback for implementor after verification failure")
    .option("-t, --task <id>", "Task ID (defaults to current)")
    .option("--json", "Output as JSON")
    .action(async (options: FeedbackCommandOptions) => {
      await feedbackCommand(options);
    });

  return cmd;
}

/**
 * Execute the feedback command
 */
async function feedbackCommand(options: FeedbackCommandOptions): Promise<void> {
  try {
    // Try to load verification results from file
    const orchestraRoot = requireOrchestraRoot();
    const config = loadConfig(orchestraRoot);
    const paths = getResolvedPaths(orchestraRoot, config);

    // Determine task ID (same logic as runFeedback)
    let taskId: number;
    if (options.task) {
      taskId = parseInt(options.task, 10);
    } else {
      // Load from manifest or progress to get current task
      const { loadManifest } = await import("../core/manifest.js");
      const { loadProgress } = await import("../core/progress.js");

      const manifestResult = loadManifest(paths.manifest);
      if (manifestResult.success && manifestResult.data?.current_task_id) {
        taskId = manifestResult.data.current_task_id;
      } else {
        const progress = loadProgress(
          manifestResult.data?.sprint.id || "unknown",
          orchestraRoot
        );
        const lastEntry =
          progress.entries.length > 0
            ? progress.entries[progress.entries.length - 1]
            : undefined;
        if (lastEntry) {
          taskId = lastEntry.task_id;
        } else {
          throw new Error("No task specified and no current task found");
        }
      }
    }

    // Try to load verification results
    let verificationResult: VerifyResult | undefined;
    const verifyPath = path.join(
      paths.artifacts,
      `task-${taskId}-verification.yaml`
    );

    if (fs.existsSync(verifyPath)) {
      const content = fs.readFileSync(verifyPath, "utf-8");
      const report = yaml.parse(content);
      verificationResult = {
        report,
        exitCode: report.overallPassed ? 0 : 1,
      };
    }

    // Build options with exactOptionalPropertyTypes compliance
    const feedbackOptions: Parameters<typeof runFeedback>[0] = {
      orchestraRoot,
    };
    if (options.task !== undefined) {
      feedbackOptions.task = options.task;
    }
    // Note: attempt is now calculated from progress entries, not passed as option
    if (verificationResult !== undefined) {
      feedbackOptions.verificationResult = verificationResult;
    }

    const result = await runFeedback(feedbackOptions);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      showSuccess(result);
    }
  } catch (error) {
    const message = isOrchestraError(error)
      ? error.message
      : error instanceof Error
      ? error.message
      : String(error);

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            success: false,
            error: message,
          },
          null,
          2
        )
      );
    } else {
      output.print.error(message);
    }

    process.exit(1);
  }
}

/**
 * Display success output
 */
function showSuccess(result: FeedbackResult): void {
  output.print.success(
    `Feedback generated for task ${result.taskId} (attempt ${result.attempt} of ${result.maxAttempts})`
  );

  if (result.issues.length > 0) {
    console.log("\nIssues found:");
    result.issues.forEach((issue, i) => {
      console.log(
        `  ${i + 1}. [${issue.severity.toUpperCase()}] ${issue.problem}`
      );
    });
  }

  console.log(`\nFeedback written to: ${result.feedbackPath}`);

  if (!result.canRetry) {
    output.print.warning(
      "\nMaximum attempts reached. Consider escalating:\n" +
        `  orchestra escalate --task ${result.taskId} --reason "Persistent failure"`
    );
  } else {
    console.log("\nNext: Implementor should read feedback and retry");
  }
}
