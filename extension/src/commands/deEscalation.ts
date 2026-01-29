/**
 * De-escalation Commands
 *
 * VS Code commands for human supervisors to de-escalate tasks.
 * These commands bypass MCP entirely, providing a clean separation between
 * agent-callable tools and supervisor-only actions.
 *
 * CRITICAL: These are HUMAN SUPERVISOR ONLY operations. Agents cannot
 * de-escalate tasks themselves - this is enforced by the Orchestra security model.
 */

import * as vscode from "vscode";
import type { DatabaseWatcher } from "../database/watcher.js";
import { OrchestraLogger } from "../utils/logger.js";
import type { SprintTreeProvider } from "../views/treeview/SprintTreeProvider.js";

const logger = new OrchestraLogger();

/**
 * Handle de-escalating a task with proper workflow
 *
 * Shows escalation details and lets supervisor choose target status.
 * Updates the escalations table with resolution info.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 * @param treeProvider Sprint tree provider for UI updates
 * @param dbWatcher Optional database watcher for change notification
 */
export async function handleDeEscalateTask(
  workspaceRoot: string,
  taskId: number,
  treeProvider: SprintTreeProvider,
  dbWatcher?: DatabaseWatcher,
): Promise<void> {
  const { resolveEscalation, getEscalationDetails } =
    await import("../database/mutations.js");

  try {
    // Get escalation details to show to supervisor
    const escalation = getEscalationDetails(workspaceRoot, taskId);

    if (!escalation) {
      vscode.window.showErrorMessage(
        `Orchestra: No escalation record found for Task ${taskId}`,
      );
      return;
    }

    // Build escalation context summary for display
    const escalationSummary = [
      `Reason: ${escalation.reason}`,
      `Attempts: ${escalation.attempts_summary}`,
      escalation.recommended_action
        ? `Recommended: ${escalation.recommended_action}`
        : "",
    ]
      .filter(Boolean)
      .join(" | ");

    // Let supervisor choose target status
    const choices: vscode.QuickPickItem[] = [
      {
        label: "$(debug-restart) VERIFY_FAILED",
        description: "Retry implementation with feedback",
        detail: "Task goes back to implementor for another attempt",
        picked: escalation.recommended_target_status === "VERIFY_FAILED",
      },
      {
        label: "$(refresh) PENDING",
        description: "Full restart from preparation",
        detail: "Task restarts from scratch with new handover",
        picked: escalation.recommended_target_status === "PENDING",
      },
      {
        label: "$(eye) GATE_CHECK",
        description: "Re-run verification checks",
        detail: "Skip to verification (e.g., if spec was fixed)",
        picked: false,
      },
    ];

    // Show escalation context in quick pick
    const selected = await vscode.window.showQuickPick(choices, {
      title: `De-escalate Task ${taskId}`,
      placeHolder: escalationSummary.substring(0, 150),
      ignoreFocusOut: true,
    });

    if (!selected) {
      return; // User cancelled
    }

    // Extract status from selection
    const statusMatch = selected.label.match(/\) (\w+)$/);
    const targetStatus = statusMatch?.[1] as
      | "VERIFY_FAILED"
      | "PENDING"
      | "GATE_CHECK"
      | undefined;

    if (!targetStatus) {
      return;
    }

    // Get resolution notes from supervisor
    const notes = await vscode.window.showInputBox({
      title: "Resolution Notes",
      prompt: "Provide notes explaining how the escalation was resolved",
      placeHolder: "e.g., Fixed verification criteria, implementation is valid",
      validateInput: (value) =>
        value.length < 10 ? "Notes must be at least 10 characters" : undefined,
    });

    if (!notes) {
      return; // User cancelled
    }

    // Resolve the escalation
    resolveEscalation(workspaceRoot, taskId, targetStatus, notes, dbWatcher);

    treeProvider.refresh();
    vscode.window.showInformationMessage(
      `Orchestra: Task ${taskId} de-escalated to ${targetStatus}`,
    );
    logger.info(
      `Task ${taskId} de-escalated to ${targetStatus} by human supervisor: ${notes}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to de-escalate task - ${message}`,
    );
    logger.error(`Failed to de-escalate task ${taskId}`, error);
  }
}

/**
 * Handle moving a task to GATE_CHECK for re-verification
 *
 * Creates a resolution signal and moves the task to GATE_CHECK status,
 * triggering re-verification with current criteria.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 * @param treeProvider Sprint tree provider for UI updates
 * @param dbWatcher Optional database watcher for change notification
 */
export async function handleMoveToGateCheck(
  workspaceRoot: string,
  taskId: number,
  treeProvider: SprintTreeProvider,
  dbWatcher?: DatabaseWatcher,
): Promise<void> {
  const { updateTaskStatus, createResolutionSignal } =
    await import("../database/mutations.js");

  const confirm = await vscode.window.showWarningMessage(
    `Move Task ${taskId} to Gate Check? This will trigger re-verification with current criteria.`,
    { modal: true },
    "Move to Gate Check",
  );

  if (confirm !== "Move to Gate Check") {
    return;
  }

  try {
    // Create a resolution signal for re-verification
    createResolutionSignal(
      workspaceRoot,
      taskId,
      "Escalation resolved - moving to Gate Check for re-verification",
      dbWatcher,
    );

    // Update task status
    updateTaskStatus(
      workspaceRoot,
      taskId,
      "GATE_CHECK",
      "Escalation resolved by human supervisor - re-verification requested",
      dbWatcher,
    );

    treeProvider.refresh();
    vscode.window.showInformationMessage(
      `Orchestra: Task ${taskId} moved to Gate Check. Run verification via MCP.`,
    );
    logger.info(`Task ${taskId} moved to GATE_CHECK by human supervisor`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to move task - ${message}`,
    );
    logger.error(`Failed to move task ${taskId} to GATE_CHECK`, error);
  }
}

/**
 * Handle moving a task back to IMPLEMENT for re-implementation
 *
 * Updates task status to IMPLEMENT, allowing the implementor to work
 * on the task again from scratch.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 * @param treeProvider Sprint tree provider for UI updates
 * @param dbWatcher Optional database watcher for change notification
 */
export async function handleMoveToImplement(
  workspaceRoot: string,
  taskId: number,
  treeProvider: SprintTreeProvider,
  dbWatcher?: DatabaseWatcher,
): Promise<void> {
  const { updateTaskStatus } = await import("../database/mutations.js");

  const confirm = await vscode.window.showWarningMessage(
    `Move Task ${taskId} back to Implement? The task will need to be re-implemented.`,
    { modal: true },
    "Move to Implement",
  );

  if (confirm !== "Move to Implement") {
    return;
  }

  try {
    updateTaskStatus(
      workspaceRoot,
      taskId,
      "IMPLEMENT",
      "Escalation resolved by human supervisor - re-implementation requested",
      dbWatcher,
    );

    treeProvider.refresh();
    vscode.window.showInformationMessage(
      `Orchestra: Task ${taskId} moved to Implement. Ready for implementor.`,
    );
    logger.info(`Task ${taskId} moved to IMPLEMENT by human supervisor`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to move task - ${message}`,
    );
    logger.error(`Failed to move task ${taskId} to IMPLEMENT`, error);
  }
}

/**
 * Handle force-completing a task (override)
 *
 * Bypasses verification and marks the task as complete with justification.
 * This is a supervisor override when verification criteria are incorrect
 * or when manual acceptance is required.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 * @param treeProvider Sprint tree provider for UI updates
 * @param dbWatcher Optional database watcher for change notification
 */
export async function handleForceComplete(
  workspaceRoot: string,
  taskId: number,
  treeProvider: SprintTreeProvider,
  dbWatcher?: DatabaseWatcher,
): Promise<void> {
  const { updateTaskStatus } = await import("../database/mutations.js");

  const justification = await vscode.window.showInputBox({
    prompt: "Provide justification for force-completing this task",
    placeHolder:
      "e.g., Verification criteria were incorrect, implementation is valid",
    validateInput: (value) => {
      if (!value || value.length < 20) {
        return "Justification must be at least 20 characters";
      }
      return null;
    },
  });

  if (!justification) {
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Force complete Task ${taskId}? This bypasses verification.`,
    { modal: true },
    "Force Complete",
  );

  if (confirm !== "Force Complete") {
    return;
  }

  try {
    updateTaskStatus(
      workspaceRoot,
      taskId,
      "COMPLETE",
      `Force completed by human supervisor: ${justification}`,
      dbWatcher,
    );

    treeProvider.refresh();
    vscode.window.showInformationMessage(
      `Orchestra: Task ${taskId} force-completed.`,
    );
    logger.info(
      `Task ${taskId} force-completed by human supervisor: ${justification}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to complete task - ${message}`,
    );
    logger.error(`Failed to force-complete task ${taskId}`, error);
  }
}

/**
 * Handle reopening a task (reset to PENDING)
 *
 * Allows any task to be reset to PENDING status for re-processing.
 * This is useful during testing or when a task needs to be re-done.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 * @param treeProvider Sprint tree provider for UI updates
 * @param dbWatcher Optional database watcher for change notification
 */
export async function handleReopenTask(
  workspaceRoot: string,
  taskId: number,
  treeProvider: SprintTreeProvider,
  dbWatcher?: DatabaseWatcher,
): Promise<void> {
  const { updateTaskStatus } = await import("../database/mutations.js");

  const confirm = await vscode.window.showWarningMessage(
    `Reopen Task ${taskId}? The task status will be reset to PENDING.`,
    { modal: true },
    "Reopen Task",
  );

  if (confirm !== "Reopen Task") {
    return;
  }

  try {
    updateTaskStatus(
      workspaceRoot,
      taskId,
      "PENDING",
      "Task reopened by human supervisor - reset to PENDING for re-processing",
      dbWatcher,
    );

    treeProvider.refresh();
    vscode.window.showInformationMessage(
      `Orchestra: Task ${taskId} reopened and reset to PENDING.`,
    );
    logger.info(
      `Task ${taskId} reopened (reset to PENDING) by human supervisor`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to reopen task - ${message}`,
    );
    logger.error(`Failed to reopen task ${taskId}`, error);
  }
}
