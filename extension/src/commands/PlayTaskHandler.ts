/**
 * PlayTaskHandler - Context-aware Play Button handler
 *
 * Routes task execution based on task status. When user clicks Play on a task,
 * this handler determines what action to take: prepare, implement, retry, show escalation,
 * or inform that task is already complete.
 */

import * as vscode from "vscode";
import { ChatInvoker } from "../chat/ChatInvoker.js";
import {
  getCurrentSprint,
  getFeedback,
  getTaskById,
} from "../database/queries.js";
import { getConfigService, getContextFileResolver } from "../extension.js";
import { PromptBuilder } from "../prompts/PromptBuilder.js";
import { OrchestraLogger } from "../utils/logger.js";

/**
 * Handle Play button click for a task
 *
 * Routes to appropriate action based on task status:
 * - PENDING → invokePrepare (orchestrator prepares the task)
 * - IMPLEMENT → invokeImplement (implementor works on the task)
 * - VERIFY_FAILED → invokeRetry (implementor retries with feedback)
 * - ESCALATED → showEscalation (show escalation details)
 * - VERIFY/COMPLETE → showInfoMessage (task already done)
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 */
export async function handlePlayTask(
  workspaceRoot: string,
  taskId: number
): Promise<void> {
  const task = getTaskById(workspaceRoot, taskId);

  if (!task) {
    vscode.window.showErrorMessage(`Task ${taskId} not found`);
    return;
  }

  switch (task.status) {
    case "PENDING":
      await invokePrepare(workspaceRoot, taskId);
      break;

    case "IMPLEMENT":
      await invokeImplement(workspaceRoot, taskId);
      break;

    case "VERIFY_FAILED":
      await invokeRetry(workspaceRoot, taskId);
      break;

    case "ESCALATED":
      await showEscalation(workspaceRoot, taskId);
      break;

    case "VERIFY":
    case "COMPLETE":
      vscode.window.showInformationMessage(
        `Task ${taskId}: ${task.title} is already ${task.status.toLowerCase()}`
      );
      break;

    default:
      vscode.window.showWarningMessage(
        `Task ${taskId} has unexpected status: ${task.status}`
      );
  }
}

/**
 * Invoke orchestrator to prepare a PENDING task
 *
 * Builds a PREPARE prompt with task context and opens chat with orchestrator agent.
 * Uses PromptBuilder to generate structured prompt and ChatInvoker to open chat.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 */
async function invokePrepare(
  workspaceRoot: string,
  taskId: number
): Promise<void> {
  try {
    // Get task and sprint data from database
    const task = getTaskById(workspaceRoot, taskId);
    const sprint = getCurrentSprint(workspaceRoot);

    if (!task) {
      vscode.window.showErrorMessage(`Task ${taskId} not found`);
      return;
    }

    if (!sprint) {
      vscode.window.showErrorMessage(
        "No active sprint found. Cannot prepare task."
      );
      return;
    }

    // Build prompt context
    const context = {
      task: {
        task_id: task.id,
        title: task.title,
        description: task.description,
        category: task.category,
        phase_id: `phase-${task.phase_id}`,
      },
      sprint: {
        sprint_id: sprint.id,
        title: sprint.name,
      },
    };

    // Create instances
    const logger = new OrchestraLogger();
    const promptBuilder = new PromptBuilder();
    const chatInvoker = new ChatInvoker(logger);

    // Build the prepare prompt
    const prompt = promptBuilder.buildPreparePrompt(context);

    // Get orchestrator model configuration
    const model = getConfigService().getModelForRole("orchestrator");

    // Invoke chat with orchestrator agent
    await chatInvoker.invokeChat({
      prompt,
      agentMode: "orchestrator",
      model,
    });

    logger.info(`Invoked orchestrator to prepare task ${taskId}`, {
      taskId,
      taskTitle: task.title,
      sprintId: sprint.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to prepare task ${taskId} - ${message}`
    );
  }
}

/**
 * Invoke implementor to work on an IMPLEMENT task
 *
 * Builds an IMPLEMENT prompt with task context and handover path, resolves context files,
 * and opens chat with implementor agent.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 */
async function invokeImplement(
  workspaceRoot: string,
  taskId: number
): Promise<void> {
  try {
    // Get task from database
    const task = getTaskById(workspaceRoot, taskId);

    if (!task) {
      vscode.window.showErrorMessage(`Task ${taskId} not found`);
      return;
    }

    // Build prompt context (no handoverPath field in database)
    const context = {
      task: {
        task_id: task.id,
        title: task.title,
        description: task.description,
        category: task.category,
        phase_id: `phase-${task.phase_id}`,
      },
      sprint: {
        sprint_id: task.sprint_id,
        title: "Current Sprint",
      },
    };

    // Create instances
    const logger = new OrchestraLogger();
    const promptBuilder = new PromptBuilder();
    const chatInvoker = new ChatInvoker(logger);

    // Get context file resolver from extension
    const contextFileResolver = getContextFileResolver();

    // Resolve context files from handover
    const contextFiles = contextFileResolver.getContextFiles(taskId);

    // Build the implement prompt
    const prompt = promptBuilder.buildImplementPrompt(context);

    // Get implementor model configuration
    const model = getConfigService().getModelForRole("implementor");

    // Invoke chat with implementor agent and context files
    await chatInvoker.invokeChat({
      prompt,
      agentMode: "implementor",
      model,
      files: contextFiles,
    });

    logger.info(`Invoked implementor to work on task ${taskId}`, {
      taskId,
      taskTitle: task.title,
      contextFileCount: contextFiles.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to invoke implementor for task ${taskId} - ${message}`
    );
  }
}

/**
 * Invoke implementor to retry a VERIFY_FAILED task with feedback
 *
 * Builds a RETRY prompt with task context and feedback path, resolves context files,
 * and opens chat with implementor agent. Uses getFeedback to retrieve the latest
 * verification failure feedback.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 */
async function invokeRetry(
  workspaceRoot: string,
  taskId: number
): Promise<void> {
  try {
    // Get task from database
    const task = getTaskById(workspaceRoot, taskId);

    if (!task) {
      vscode.window.showErrorMessage(`Task ${taskId} not found`);
      return;
    }

    // Get latest feedback from database
    const feedback = getFeedback(workspaceRoot, taskId);

    if (!feedback) {
      vscode.window.showErrorMessage(
        `Orchestra: No feedback found for task ${taskId}. Cannot retry.`
      );
      return;
    }

    // Build prompt context with retry count from task
    const context = {
      task: {
        task_id: task.id,
        title: task.title,
        description: task.description,
        category: task.category,
        phase_id: `phase-${task.phase_id}`,
      },
      sprint: {
        sprint_id: task.sprint_id,
        title: "Current Sprint",
      },
      retryCount: task.retry_count,
      // feedbackPath is optional - implementor will use MCP tools to get feedback
    };

    // Create instances
    const logger = new OrchestraLogger();
    const promptBuilder = new PromptBuilder();
    const chatInvoker = new ChatInvoker(logger);

    // Get context file resolver from extension
    const contextFileResolver = getContextFileResolver();

    // Resolve context files from handover
    const contextFiles = contextFileResolver.getContextFiles(taskId);

    // Build the retry prompt
    const prompt = promptBuilder.buildRetryPrompt(context);

    // Get implementor model configuration
    const model = getConfigService().getModelForRole("implementor");

    // Invoke chat with implementor agent and context files
    await chatInvoker.invokeChat({
      prompt,
      agentMode: "implementor",
      model,
      files: contextFiles,
    });

    logger.info(`Invoked implementor to retry task ${taskId}`, {
      taskId,
      taskTitle: task.title,
      retryCount: task.retry_count,
      feedbackAttempt: feedback.attempt,
      contextFileCount: contextFiles.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to retry task ${taskId} - ${message}`
    );
  }
}

/**
 * Show escalation details for an ESCALATED task
 *
 * TODO: Display escalation reason, attempts summary, and recommended action
 *
 * @param _workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 */
async function showEscalation(
  _workspaceRoot: string,
  taskId: number
): Promise<void> {
  // TODO: Implement escalation details display
  vscode.window.showWarningMessage(
    `[STUB] Task ${taskId} is escalated - would show escalation details`
  );
}
