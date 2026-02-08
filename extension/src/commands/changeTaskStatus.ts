/**
 * Change Task Status Command
 *
 * VS Code command for human supervisors to manually override task status.
 * This is an emergency/admin action that allows changing a task to ANY status.
 *
 * Use cases:
 * - Fix stuck tasks (e.g., PENDING_CODE_REVIEW with APPROVED review)
 * - Manual workflow corrections
 * - Testing and debugging
 */

import * as vscode from "vscode";
import type { DatabaseWatcher } from "../database/watcher.js";
import { getLogger } from "../utils/logger.js";
import type { SprintTreeProvider } from "../views/treeview/SprintTreeProvider.js";

const logger = getLogger();

/**
 * All possible task statuses (from TaskStatusSchema in src/core/types.ts)
 */
const TASK_STATUSES = [
  "PENDING",
  "PREPARE",
  "PENDING_HANDOVER_REVIEW",
  "HANDOVER_REVIEW_FAILED",
  "PENDING_CODE_REVIEW",
  "CODE_REVIEW_CHANGES_REQUESTED",
  "CODE_REVIEW_FAILED",
  "IMPLEMENT",
  "GATE_CHECK",
  "VERIFY",
  "VERIFY_FAILED",
  "VERIFIED",
  "COMPLETE",
  "RETRY",
  "ESCALATED",
] as const;

type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * Status descriptions for the quick pick
 */
const STATUS_DESCRIPTIONS: Record<TaskStatus, string> = {
  PENDING: "Task defined but not started",
  PREPARE: "Orchestrator preparing handover",
  PENDING_HANDOVER_REVIEW: "Awaiting Controller review of handover",
  HANDOVER_REVIEW_FAILED: "Controller rejected handover",
  PENDING_CODE_REVIEW: "Awaiting code review before verification",
  CODE_REVIEW_CHANGES_REQUESTED: "Code review requested changes",
  CODE_REVIEW_FAILED: "Code review failed or rejected",
  IMPLEMENT: "Implementor working",
  GATE_CHECK: "Automated verification running",
  VERIFY: "Orchestrator/human review",
  VERIFY_FAILED: "Verification failed, feedback generated",
  VERIFIED: "Verification passed, awaiting code review",
  COMPLETE: "Task finished successfully",
  RETRY: "Failed verification, retrying",
  ESCALATED: "Requires human intervention",
};

/**
 * Status icons for the quick pick
 */
const STATUS_ICONS: Record<TaskStatus, string> = {
  PENDING: "$(circle-outline)",
  PREPARE: "$(edit)",
  PENDING_HANDOVER_REVIEW: "$(clock)",
  HANDOVER_REVIEW_FAILED: "$(error)",
  PENDING_CODE_REVIEW: "$(eye)",
  CODE_REVIEW_CHANGES_REQUESTED: "$(warning)",
  CODE_REVIEW_FAILED: "$(error)",
  IMPLEMENT: "$(tools)",
  GATE_CHECK: "$(beaker)",
  VERIFY: "$(checklist)",
  VERIFY_FAILED: "$(x)",
  VERIFIED: "$(check)",
  COMPLETE: "$(check-all)",
  RETRY: "$(refresh)",
  ESCALATED: "$(alert)",
};

/**
 * Handle changing a task's status to any value
 *
 * Shows a quick pick with all possible statuses and updates the database directly.
 *
 * @param workspaceRoot Absolute path to workspace root
 * @param taskId Task ID (numeric primary key)
 * @param currentStatus Current task status (for highlighting)
 * @param treeProvider Sprint tree provider for UI updates
 * @param dbWatcher Optional database watcher for change notification
 */
export async function handleChangeTaskStatus(
  workspaceRoot: string,
  taskId: number,
  currentStatus: string | undefined,
  treeProvider: SprintTreeProvider,
  dbWatcher?: DatabaseWatcher,
): Promise<void> {
  const { updateTaskStatus } = await import("../database/mutations.js");

  try {
    // Build quick pick items for all statuses
    const choices: vscode.QuickPickItem[] = TASK_STATUSES.map((status) => {
      const item: vscode.QuickPickItem = {
        label: `${STATUS_ICONS[status]} ${status}`,
        description: STATUS_DESCRIPTIONS[status],
      };
      if (status === currentStatus) {
        item.detail = "← Current status";
      }
      return item;
    });

    // Show quick pick
    const selected = await vscode.window.showQuickPick(choices, {
      title: `Change Task ${taskId} Status`,
      placeHolder: `Current: ${currentStatus ?? "Unknown"} - Select new status`,
      ignoreFocusOut: true,
    });

    if (!selected) {
      return; // User cancelled
    }

    // Extract status from selection (strip icon prefix)
    const statusMatch = selected.label.match(/\) (.+)$/);
    const newStatus = statusMatch?.[1] as TaskStatus;

    if (!newStatus) {
      vscode.window.showErrorMessage(
        "Orchestra: Failed to parse selected status",
      );
      return;
    }

    if (newStatus === currentStatus) {
      vscode.window.showInformationMessage(
        `Orchestra: Task ${taskId} is already in ${newStatus} status`,
      );
      return;
    }

    // Confirm the change
    const confirm = await vscode.window.showWarningMessage(
      `Change Task ${taskId} from ${currentStatus ?? "Unknown"} to ${newStatus}?`,
      { modal: true },
      "Yes, Change Status",
    );

    if (confirm !== "Yes, Change Status") {
      return;
    }

    // Update the database
    const success = updateTaskStatus(
      workspaceRoot,
      taskId,
      newStatus,
      `Manual status change from ${currentStatus} to ${newStatus}`,
    );

    if (!success) {
      vscode.window.showErrorMessage(`Orchestra: Failed to update task status`);
      return;
    }

    // Notify database watcher for reactivity
    if (dbWatcher) {
      dbWatcher.trigger();
    }

    // Refresh tree view
    treeProvider.refresh();

    vscode.window.showInformationMessage(
      `Orchestra: Task ${taskId} status changed to ${newStatus}`,
    );

    logger.info(`Task ${taskId} status manually changed`, {
      taskId,
      from: currentStatus,
      to: newStatus,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to change task status - ${errorMessage}`,
    );
    logger.error("Failed to change task status", error);
  }
}
