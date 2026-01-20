/**
 * Sprint TreeView Provider
 *
 * Implements TreeDataProvider for Sprint → Phase → Task hierarchy.
 * Shows sprint structure in VS Code's activity bar with status-based icons.
 * TD-016: Uses FileDecorationProvider for rich status styling.
 */

import type Database from "better-sqlite3";
import * as vscode from "vscode";
import {
  getAllSprints,
  getLatestCodeReviewStatusForSprint,
  getPhases,
  getTasksForSprint,
  type Phase,
  type Sprint,
  type Task,
} from "../../database/queries.js";
import type { DatabaseWatcher } from "../../database/watcher.js";
import { findOrchestraRoot } from "../../workspace/detector.js";
import { createTaskDecorationUri } from "../providers/ViewDecorationProvider.js";
import { getStatusDisplay } from "../statusTranslation.js";

/**
 * Tree item types for hierarchy
 */
type TreeElement = SprintItem | PhaseItem | TaskItem | MessageItem;

interface SprintItem {
  type: "sprint";
  sprint: Sprint;
}

interface PhaseItem {
  type: "phase";
  phase: Phase;
  sprintId: string;
  tasks: Task[];
}

interface TaskItem {
  type: "task";
  task: Task;
}

interface MessageItem {
  type: "message";
  message: string;
  messageType: "empty" | "error" | "info";
}

export class SprintTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TreeElement | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _codeReviewStatusByTaskId: Map<number, string> = new Map();
  private _codeReviewStatusSprintId: string | null = null;

  constructor(
    private readonly _db: Database.Database,
    private readonly _dbWatcher: DatabaseWatcher,
  ) {
    void this._db; // Keep for potential future direct use

    // Subscribe to database changes
    this._dbWatcher.onDidChange(() => this.refresh());
  }

  refresh(): void {
    // Invalidate cached code review status so refresh reflects latest reviews
    this._codeReviewStatusByTaskId = new Map();
    this._codeReviewStatusSprintId = null;

    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    switch (element.type) {
      case "sprint":
        return this._createSprintItem(element.sprint);
      case "phase":
        return this._createPhaseItem(element.phase, element.tasks);
      case "task":
        return this._createTaskItem(element.task);
      case "message":
        return this._createMessageTreeItem(
          element.message,
          element.messageType,
        );
    }
  }

  getChildren(element?: TreeElement): TreeElement[] {
    try {
      const workspaceRoot = findOrchestraRoot();
      if (!workspaceRoot) {
        return [this._createMessageItem("No Orchestra workspace", "info")];
      }

      // Root level: return all sprints
      if (!element) {
        const sprints = getAllSprints(workspaceRoot);
        if (sprints.length === 0) {
          return [this._createMessageItem("No sprints found", "empty")];
        }
        return sprints.map((sprint) => ({ type: "sprint", sprint }));
      }

      // Sprint level: return phases
      if (element.type === "sprint") {
        this._ensureCodeReviewStatusMap(workspaceRoot, element.sprint.id);
        const phases = getPhases(workspaceRoot, element.sprint.id);
        const allTasks = getTasksForSprint(workspaceRoot, element.sprint.id);
        return phases.map((phase) => ({
          type: "phase",
          phase,
          sprintId: element.sprint.id,
          tasks: allTasks.filter((task) => task.phase_id === phase.id),
        }));
      }

      // Phase level: return tasks for this phase
      if (element.type === "phase") {
        this._ensureCodeReviewStatusMap(workspaceRoot, element.sprintId);
        const allTasks = getTasksForSprint(workspaceRoot, element.sprintId);
        // Filter tasks that belong to this phase
        const phaseTasks = allTasks.filter(
          (task) => task.phase_id === element.phase.id,
        );
        if (phaseTasks.length === 0) {
          return [this._createMessageItem("No tasks in this phase", "empty")];
        }
        return phaseTasks.map((task) => ({ type: "task", task }));
      }

      // Task level: no children
      return [];
    } catch (error) {
      // Handle database errors gracefully
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return [this._createMessageItem(`Error: ${errorMessage}`, "error")];
    }
  }

  private _createSprintItem(sprint: Sprint): vscode.TreeItem {
    const isActive = sprint.is_active;
    const item = new vscode.TreeItem(
      sprint.name,
      isActive
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed,
    );

    // Sprint 004: Check review status and display visual indicators
    const sprintStatus = sprint.status || "ACTIVE";
    let description = isActive ? "" : "(inactive)";

    if (sprintStatus === "PENDING_SPEC_REVIEW") {
      // Pending review: clock icon with blue color
      item.iconPath = new vscode.ThemeIcon(
        "clock",
        new vscode.ThemeColor("charts.blue"),
      );
      description = "⏳ Pending Review";
    } else if (sprintStatus === "SPEC_REVIEW_FAILED") {
      // Failed review: warning icon with orange color
      item.iconPath = new vscode.ThemeIcon(
        "warning",
        new vscode.ThemeColor("charts.orange"),
      );
      description = "⚠️ Review Failed";
    } else if (isActive) {
      // Active: rocket icon with green color for active sprint
      item.iconPath = new vscode.ThemeIcon(
        "rocket",
        new vscode.ThemeColor("charts.green"),
      );
    } else {
      // Inactive: project icon with muted color
      item.iconPath = new vscode.ThemeIcon(
        "project",
        new vscode.ThemeColor("descriptionForeground"),
      );
    }

    item.description = description;
    item.tooltip = `Sprint: ${
      sprint.name
    }\nStatus: ${sprintStatus}\nWorkflow: ${sprint.workflow_step}\n${
      isActive
        ? "Active Sprint"
        : "Right-click → 'Set as Active Sprint' to switch"
    }`;

    // Set context value based on status for different menu options
    if (
      sprintStatus === "PENDING_SPEC_REVIEW" ||
      sprintStatus === "SPEC_REVIEW_FAILED"
    ) {
      item.contextValue = isActive
        ? "sprint-pending-review"
        : "sprint-pending-review-inactive";
    } else {
      item.contextValue = isActive ? "sprint-active" : "sprint-inactive";
    }

    return item;
  }

  private _createPhaseItem(phase: Phase, tasks: Task[]): vscode.TreeItem {
    const item = new vscode.TreeItem(
      phase.phase_name,
      vscode.TreeItemCollapsibleState.Expanded,
    );

    // Calculate progress
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(
      (task) => task.status === "COMPLETE",
    ).length;
    const hasEscalated = tasks.some((task) => task.status === "ESCALATED");

    // Set icon based on phase state
    if (totalTasks > 0 && completedTasks === totalTasks) {
      // All tasks complete: check icon with success color
      item.iconPath = new vscode.ThemeIcon(
        "pass",
        new vscode.ThemeColor("testing.iconPassed"),
      );
    } else if (hasEscalated) {
      // Has escalated tasks: warning icon with warning color
      item.iconPath = new vscode.ThemeIcon(
        "warning",
        new vscode.ThemeColor("editorWarning.foreground"),
      );
    } else {
      // In progress: layers icon with namespace color
      item.iconPath = new vscode.ThemeIcon(
        "layers",
        new vscode.ThemeColor("symbolIcon.namespaceForeground"),
      );
    }

    // Set progress in description
    if (totalTasks > 0) {
      item.description = `${completedTasks}/${totalTasks} complete`;
    }

    item.tooltip = `Phase ${phase.phase_id}: ${phase.phase_name}\n${completedTasks}/${totalTasks} tasks complete`;
    item.contextValue = "phase";
    return item;
  }

  private _createTaskItem(task: Task): vscode.TreeItem {
    const item = new vscode.TreeItem(
      `Task ${task.task_id}: ${task.title}`,
      vscode.TreeItemCollapsibleState.None,
    );

    // Status-based icons
    item.iconPath = this._getIconForStatus(task.status);

    // TD-016: Set resourceUri for FileDecorationProvider styling
    const codeReviewStatus = this._codeReviewStatusByTaskId.get(task.id);
    item.resourceUri = createTaskDecorationUri(
      task.task_id,
      task.status,
      task.retry_count,
      task.max_retries,
      codeReviewStatus,
    );

    // Tooltip shows description and status (using translated label)
    const statusDisplay = getStatusDisplay(task.status);
    item.tooltip = new vscode.MarkdownString();
    item.tooltip.appendMarkdown(`**${task.title}**\n\n`);
    item.tooltip.appendMarkdown(`Status: ${statusDisplay.label}\n\n`);
    if (codeReviewStatus) {
      item.tooltip.appendMarkdown(
        `Code Review: ${codeReviewStatus.replace(/_/g, " ")}\n\n`,
      );
    }
    if (task.status === "ESCALATED" || task.status === "VERIFY_FAILED") {
      item.tooltip.appendMarkdown(`*Right-click for remediation options*\n\n`);
    }
    item.tooltip.appendMarkdown(task.description);

    // Click opens task detail (use internal id, not task_id)
    item.command = {
      command: "orchestra.openTaskDetail",
      title: "Open Task Detail",
      arguments: [task.id],
    };

    // Context value for menus - include status and code review status for conditional menus
    const reviewSuffix = codeReviewStatus
      ? `-review-${codeReviewStatus.toLowerCase()}`
      : "";
    item.contextValue = `task-${task.status.toLowerCase()}${reviewSuffix}`;

    // Add description for escalated/failed tasks (kept for accessibility)
    if (task.status === "ESCALATED") {
      item.description = "ESCALATED";
    } else if (task.status === "VERIFY_FAILED") {
      item.description = "FAILED";
    }

    return item;
  }

  private _ensureCodeReviewStatusMap(
    workspaceRoot: string,
    sprintId: string,
  ): void {
    if (this._codeReviewStatusSprintId === sprintId) {
      return;
    }

    this._codeReviewStatusByTaskId = getLatestCodeReviewStatusForSprint(
      workspaceRoot,
      sprintId,
    );
    this._codeReviewStatusSprintId = sprintId;
  }

  private _getIconForStatus(status: string): vscode.ThemeIcon {
    const display = getStatusDisplay(status);
    return new vscode.ThemeIcon(display.icon, display.color);
  }

  private _createMessageItem(
    message: string,
    messageType: "empty" | "error" | "info",
  ): MessageItem {
    return { type: "message", message, messageType };
  }

  private _createMessageTreeItem(
    message: string,
    messageType: "empty" | "error" | "info",
  ): vscode.TreeItem {
    const item = new vscode.TreeItem(
      message,
      vscode.TreeItemCollapsibleState.None,
    );

    switch (messageType) {
      case "error":
        item.iconPath = new vscode.ThemeIcon(
          "error",
          new vscode.ThemeColor("editorError.foreground"),
        );
        break;
      case "empty":
        item.iconPath = new vscode.ThemeIcon(
          "info",
          new vscode.ThemeColor("descriptionForeground"),
        );
        break;
      case "info":
        item.iconPath = new vscode.ThemeIcon("info");
        break;
    }

    item.contextValue = `message-${messageType}`;
    return item;
  }
}
