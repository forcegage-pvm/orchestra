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

export class SprintTreeProvider
  implements vscode.TreeDataProvider<TreeElement>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TreeElement | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly _db: Database.Database,
    private readonly _dbWatcher: DatabaseWatcher
  ) {
    void this._db; // Keep for potential future direct use

    // Subscribe to database changes
    this._dbWatcher.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    switch (element.type) {
      case "sprint":
        return this._createSprintItem(element.sprint);
      case "phase":
        return this._createPhaseItem(element.phase);
      case "task":
        return this._createTaskItem(element.task);
      case "message":
        return this._createMessageTreeItem(
          element.message,
          element.messageType
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
        const phases = getPhases(workspaceRoot, element.sprint.id);
        return phases.map((phase) => ({
          type: "phase",
          phase,
          sprintId: element.sprint.id,
        }));
      }

      // Phase level: return tasks for this phase
      if (element.type === "phase") {
        const allTasks = getTasksForSprint(workspaceRoot, element.sprintId);
        // Filter tasks that belong to this phase
        const phaseTasks = allTasks.filter(
          (task) => task.phase_id === element.phase.id
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
        : vscode.TreeItemCollapsibleState.Collapsed
    );

    if (isActive) {
      // Active: rocket icon with green color for active sprint
      item.iconPath = new vscode.ThemeIcon(
        "rocket",
        new vscode.ThemeColor("charts.green")
      );
    } else {
      // Inactive: project icon with muted color
      item.iconPath = new vscode.ThemeIcon(
        "project",
        new vscode.ThemeColor("descriptionForeground")
      );
      item.description = "(inactive)";
    }

    item.tooltip = `Sprint: ${sprint.name}\nStatus: ${sprint.workflow_step}\n${
      isActive
        ? "✓ Active Sprint"
        : "Right-click → 'Set as Active Sprint' to switch"
    }`;
    item.contextValue = isActive ? "sprint-active" : "sprint-inactive";
    return item;
  }

  private _createPhaseItem(phase: Phase): vscode.TreeItem {
    const item = new vscode.TreeItem(
      phase.phase_name,
      vscode.TreeItemCollapsibleState.Expanded
    );
    item.iconPath = new vscode.ThemeIcon(
      "layers",
      new vscode.ThemeColor("symbolIcon.namespaceForeground")
    );
    item.tooltip = `Phase ${phase.phase_id}: ${phase.phase_name}`;
    item.contextValue = "phase";
    return item;
  }

  private _createTaskItem(task: Task): vscode.TreeItem {
    const item = new vscode.TreeItem(
      `Task ${task.task_id}: ${task.title}`,
      vscode.TreeItemCollapsibleState.None
    );

    // Status-based icons
    item.iconPath = this._getIconForStatus(task.status);

    // TD-016: Set resourceUri for FileDecorationProvider styling
    item.resourceUri = createTaskDecorationUri(
      task.task_id,
      task.status,
      task.retry_count,
      task.max_retries
    );

    // Tooltip shows description and status
    item.tooltip = new vscode.MarkdownString();
    item.tooltip.appendMarkdown(`**${task.title}**\n\n`);
    item.tooltip.appendMarkdown(`Status: \`${task.status}\`\n\n`);
    if (task.status === "ESCALATED" || task.status === "VERIFY_FAILED") {
      item.tooltip.appendMarkdown(
        `⚠️ *Right-click for remediation options*\n\n`
      );
    }
    item.tooltip.appendMarkdown(task.description);

    // Click opens task detail (use internal id, not task_id)
    item.command = {
      command: "orchestra.openTaskDetail",
      title: "Open Task Detail",
      arguments: [task.id],
    };

    // Context value for menus - include status for conditional menus
    item.contextValue = `task-${task.status.toLowerCase()}`;

    // Add description for escalated/failed tasks (kept for accessibility)
    if (task.status === "ESCALATED") {
      item.description = "ESCALATED";
    } else if (task.status === "VERIFY_FAILED") {
      item.description = "FAILED";
    }

    return item;
  }

  private _getIconForStatus(status: string): vscode.ThemeIcon {
    const display = getStatusDisplay(status);
    return new vscode.ThemeIcon(display.icon, display.color);
  }

  private _createMessageItem(
    message: string,
    messageType: "empty" | "error" | "info"
  ): MessageItem {
    return { type: "message", message, messageType };
  }

  private _createMessageTreeItem(
    message: string,
    messageType: "empty" | "error" | "info"
  ): vscode.TreeItem {
    const item = new vscode.TreeItem(
      message,
      vscode.TreeItemCollapsibleState.None
    );

    switch (messageType) {
      case "error":
        item.iconPath = new vscode.ThemeIcon(
          "error",
          new vscode.ThemeColor("editorError.foreground")
        );
        break;
      case "empty":
        item.iconPath = new vscode.ThemeIcon(
          "info",
          new vscode.ThemeColor("descriptionForeground")
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
