/**
 * PlayTaskHandler - Context-aware Play Button handler
 *
 * Routes task execution based on task status. When user clicks Play on a task,
 * this handler determines what action to take: prepare, implement, retry, show escalation,
 * or inform that task is already complete.
 */

import * as vscode from "vscode";
import { getTaskById } from "../database/queries.js";

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
 * TODO: Implement using ChatInvoker with orchestrator mode
 *
 * @param _workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 */
async function invokePrepare(
  _workspaceRoot: string,
  taskId: number
): Promise<void> {
  // TODO: Task 5 - Implement with ChatInvoker
  vscode.window.showInformationMessage(
    `[STUB] Would invoke orchestrator to prepare task ${taskId}`
  );
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
