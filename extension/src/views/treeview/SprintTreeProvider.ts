/**
 * Sprint TreeView Provider
 *
 * Implements TreeDataProvider for Sprint → Phase → Task hierarchy.
 * Shows sprint structure in VS Code's activity bar with status-based icons.
 */

import type Database from "better-sqlite3";
import * as vscode from "vscode";
import {
  getCurrentSprint,
  getPhases,
  getTasksForSprint,
  type Phase,
  type Sprint,
  type Task,
} from "../../database/queries.js";
import type { DatabaseWatcher } from "../../database/watcher.js";
import { findOrchestraRoot } from "../../workspace/detector.js";

/**
 * Tree item types for hierarchy
 */
type TreeElement = SprintItem | PhaseItem | TaskItem;

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
    }
  }

  getChildren(element?: TreeElement): TreeElement[] {
    const workspaceRoot = findOrchestraRoot();
    if (!workspaceRoot) {
      return [];
    }

    // Root level: return sprint
    if (!element) {
      const sprint = getCurrentSprint(workspaceRoot);
      if (!sprint) {
        return [];
      }
      return [{ type: "sprint", sprint }];
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
      return phaseTasks.map((task) => ({ type: "task", task }));
    }

    // Task level: no children
    return [];
  }

  private _createSprintItem(sprint: Sprint): vscode.TreeItem {
    const item = new vscode.TreeItem(
      sprint.name,
      vscode.TreeItemCollapsibleState.Expanded
    );
    item.iconPath = new vscode.ThemeIcon("rocket");
    item.tooltip = `Sprint: ${sprint.name}\nStatus: ${sprint.workflow_step}`;
    item.contextValue = "sprint";
    return item;
  }

  private _createPhaseItem(phase: Phase): vscode.TreeItem {
    const item = new vscode.TreeItem(
      phase.phase_name,
      vscode.TreeItemCollapsibleState.Expanded
    );
    item.iconPath = new vscode.ThemeIcon("folder");
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

    // Click opens task detail
    item.command = {
      command: "orchestra.openTaskDetail",
      title: "Open Task Detail",
      arguments: [task.task_id],
    };

    // Context value for menus - include status for conditional menus
    item.contextValue = `task-${task.status.toLowerCase()}`;

    // Add warning color for escalated/failed tasks
    if (task.status === "ESCALATED") {
      item.description = "⚠️ ESCALATED";
    } else if (task.status === "VERIFY_FAILED") {
      item.description = "❌ FAILED";
    }

    return item;
  }

  private _getIconForStatus(status: string): vscode.ThemeIcon {
    switch (status) {
      case "PENDING":
        return new vscode.ThemeIcon("circle-outline");
      case "IMPLEMENT":
        return new vscode.ThemeIcon("sync~spin");
      case "GATE_CHECK":
        return new vscode.ThemeIcon("clock");
      case "VERIFY":
        return new vscode.ThemeIcon("eye");
      case "COMPLETE":
        return new vscode.ThemeIcon("check");
      case "ESCALATED":
        return new vscode.ThemeIcon(
          "warning",
          new vscode.ThemeColor("editorWarning.foreground")
        );
      case "VERIFY_FAILED":
        return new vscode.ThemeIcon(
          "error",
          new vscode.ThemeColor("editorError.foreground")
        );
      default:
        return new vscode.ThemeIcon("question");
    }
  }
}
