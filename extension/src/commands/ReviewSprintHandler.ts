/**
 * ReviewSprintHandler - Launch Controller agent for sprint review
 *
 * Opens a fresh Controller agent session with a comprehensive sprint review prompt.
 * Used when sprint is in PENDING_SPEC_REVIEW or SPEC_REVIEW_FAILED status.
 */

import * as vscode from "vscode";
import type { Sprint } from "../database/queries.js";
import { getLatestSprintReview } from "../database/queries.js";
import { getSessionManager } from "../extension.js";
import { PromptBuilder } from "../prompts/PromptBuilder.js";
import { getLogger } from "../utils/logger.js";

/**
 * Handle launching the Controller agent for sprint configuration review
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param sprint Sprint data from tree view
 */
export async function handleReviewSprint(
  workspaceRoot: string,
  sprint: Sprint,
): Promise<void> {
  const logger = getLogger();

  try {
    logger.info("Launching controller for sprint review", {
      sprintId: sprint.id,
      sprintName: sprint.name,
      status: sprint.status,
    });

    // Get review attempt count from database
    let reviewAttempt = 1;
    if (sprint.status === "SPEC_REVIEW_FAILED") {
      const previousReview = getLatestSprintReview(workspaceRoot, sprint.id);
      if (previousReview) {
        reviewAttempt = (previousReview.revision_count || 0) + 1;
      }
    }

    // Build context for prompt
    const context = {
      sprint: {
        sprint_id: sprint.id,
        title: sprint.name,
        status: sprint.status,
      },
      reviewAttempt,
    };

    // Create instances
    const promptBuilder = new PromptBuilder({ workspaceRoot });
    const sessionManager = getSessionManager();

    // Build the sprint review prompt
    const prompt = promptBuilder.buildSprintReviewPrompt(context);

    // Invoke controller in a new editor tab with fresh context
    await sessionManager.invokeController(prompt, []);

    logger.info("Controller agent launched successfully for sprint review", {
      sprintId: sprint.id,
      reviewAttempt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to launch controller for sprint review - ${message}`,
    );
    logger.error("Failed to launch controller for sprint review", error);
  }
}
