/**
 * PlayTaskHandler - Context-aware Play Button handler
 *
 * Routes task execution based on task status. When user clicks Play on a task,
 * this handler determines what action to take: prepare, implement, retry, show escalation,
 * or inform that task is already complete.
 */

import * as vscode from "vscode";
import { ChatInvoker } from "../chat/ChatInvoker.js";
import { getConfigService } from "../extension.js";
import { getTaskById, getCurrentSprint } from "../database/queries.js";
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
 * TODO: Implement using ChatInvoker with implementor mode
 *
 * @param _workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 */
async function invokeImplement(
  _workspaceRoot: string,
  taskId: number
): Promise<void> {
  // TODO: Task 6 - Implement with ChatInvoker
  vscode.window.showInformationMessage(
    `[STUB] Would invoke implementor to work on task ${taskId}`
  );
}

/**
 * Invoke implementor to retry a VERIFY_FAILED task with feedback
 *
 * TODO: Implement using ChatInvoker with implementor mode and feedback context
 *
 * @param _workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 */
async function invokeRetry(
  _workspaceRoot: string,
  taskId: number
): Promise<void> {
  // TODO: Task 6 - Implement with ChatInvoker and feedback
  vscode.window.showInformationMessage(
    `[STUB] Would invoke implementor to retry task ${taskId} with feedback`
  );
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
