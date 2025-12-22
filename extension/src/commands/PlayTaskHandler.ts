/**
 * PlayTaskHandler - Context-aware Play Button handler
 *
 * Routes task execution based on task status. When user clicks Play on a task,
 * this handler determines what action to take: prepare, implement, retry, show escalation,
 * or inform that task is already complete.
 */

import * as vscode from "vscode";
import {
  getCurrentSprint,
  getEscalation,
  getFeedback,
  getTaskById,
} from "../database/queries.js";
import { getContextFileResolver, getSessionManager } from "../extension.js";
import { PromptBuilder } from "../prompts/PromptBuilder.js";
import { OrchestraLogger } from "../utils/logger.js";

/**
 * Handle Play button click for a task
 *
 * Routes to appropriate action based on task status:
 * - PENDING → invokePrepare (orchestrator prepares the task)
 * - IMPLEMENT → invokeImplement (implementor works on the task)
 * - VERIFY_FAILED → invokeRetry (implementor retries with feedback)
 * - VERIFY/GATE_CHECK → invokeVerify (orchestrator runs verification)
 * - ESCALATED → invokeEscalationReview (orchestrator reviews escalation)
 * - COMPLETE → showInfoMessage (task already done)
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

    case "VERIFY":
    case "GATE_CHECK":
      await invokeVerify(workspaceRoot, taskId);
      break;

    case "ESCALATED":
      await invokeEscalationReview(workspaceRoot, taskId);
      break;

    case "COMPLETE":
      vscode.window.showInformationMessage(
        `Task ${taskId}: ${task.title} is already complete`
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
    const sessionManager = getSessionManager();

    // Build the prepare prompt
    const prompt = promptBuilder.buildPreparePrompt(context);

    // Invoke orchestrator agent directly via SessionManager
    await sessionManager.invokeOrchestrator(prompt, []);

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
    const sessionManager = getSessionManager();

    // Get context file resolver from extension
    const contextFileResolver = getContextFileResolver();

    // Resolve context files from handover
    const contextFiles = contextFileResolver.getContextFiles(taskId);

    // Build the implement prompt
    const prompt = promptBuilder.buildImplementPrompt(context);

    // Invoke implementor agent directly via SessionManager
    await sessionManager.invokeImplementor(prompt, contextFiles);

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
    const sessionManager = getSessionManager();

    // Get context file resolver from extension
    const contextFileResolver = getContextFileResolver();

    // Resolve context files from handover
    const contextFiles = contextFileResolver.getContextFiles(taskId);

    // Build the retry prompt
    const prompt = promptBuilder.buildRetryPrompt(context);

    // Invoke implementor agent directly via SessionManager
    await sessionManager.invokeImplementor(prompt, contextFiles);

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
 * Invoke orchestrator to verify a VERIFY or GATE_CHECK task
 *
 * Builds a VERIFY prompt with task context and opens chat with orchestrator agent.
 * The orchestrator will run verification checks and submit judgment.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 */
async function invokeVerify(
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
        sprint_id: task.sprint_id,
        title: "Current Sprint",
      },
    };

    // Create instances
    const logger = new OrchestraLogger();
    const promptBuilder = new PromptBuilder();
    const sessionManager = getSessionManager();

    // Build the verify prompt
    const prompt = promptBuilder.buildVerifyPrompt(context);

    // Invoke orchestrator agent for verification
    await sessionManager.invokeOrchestrator(prompt, []);

    logger.info(`Invoked orchestrator to verify task ${taskId}`, {
      taskId,
      taskTitle: task.title,
      taskStatus: task.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to invoke verification for task ${taskId} - ${message}`
    );
  }
}

/**
 * Invoke orchestrator to review an ESCALATED task
 *
 * Builds a prompt with escalation context and opens chat with orchestrator agent.
 * The orchestrator can then decide to de-escalate, provide guidance, or escalate further.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 */
async function invokeEscalationReview(
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

    // Get escalation details
    const escalation = getEscalation(workspaceRoot, taskId);

    if (!escalation) {
      vscode.window.showErrorMessage(
        `Orchestra: No escalation found for task ${taskId}`
      );
      return;
    }

    // Create instances
    const logger = new OrchestraLogger();
    const sessionManager = getSessionManager();

    // Build the escalation review prompt
    const prompt = `As Orchestrator, review the escalated Task ${task.id}: "${
      task.title
    }".

## Escalation Details
- **Reason**: ${escalation.reason}
- **Attempts Summary**: ${escalation.attempts_summary}
${
  escalation.recommended_action
    ? `- **Recommended Action**: ${escalation.recommended_action}`
    : ""
}

## Your Options
1. **De-escalate**: If you can resolve the blocker, use \`orchestra.moveToImplement\` to return to implementation
2. **Provide Guidance**: Add enhanced feedback to help the implementor
3. **Request Human Help**: If this requires human intervention, explain what is needed

Use your MCP tools to investigate and resolve this escalation.`;

    // Invoke orchestrator agent for escalation review
    await sessionManager.invokeOrchestrator(prompt, []);

    logger.info(`Invoked orchestrator to review escalated task ${taskId}`, {
      taskId,
      taskTitle: task.title,
      escalationReason: escalation.reason,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to invoke escalation review for task ${taskId} - ${message}`
    );
  }
}

