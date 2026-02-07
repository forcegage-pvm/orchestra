/**
 * Status Bar Manager
 *
 * Displays current task status in VS Code status bar with color coding,
 * tooltip, and click handler for dashboard access.
 */

import type Database from "better-sqlite3";
import * as vscode from "vscode";
import { getCurrentSprint, getCurrentTask } from "../../database/queries.js";
import type { DatabaseWatcher } from "../../database/watcher.js";
import { findOrchestraRoot } from "../../workspace/detector.js";
import { getStatusDisplay } from "../statusTranslation.js";

export class StatusBarManager implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly dbSubscription: vscode.Disposable;

  constructor(
    private readonly _db: Database.Database,
    private readonly dbWatcher: DatabaseWatcher,
  ) {
    void this._db; // Keep for potential future direct use

    // Create status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.statusBarItem.command = "orchestra.openDashboard";

    // Subscribe to database changes (store for cleanup)
    this.dbSubscription = this.dbWatcher.onDidChange(() => this.refresh());

    // Initial update
    this.refresh();
  }

  /**
   * Refresh status bar display based on current task
   */
  refresh(): void {
    try {
      const workspaceRoot = findOrchestraRoot();
      if (!workspaceRoot) {
        this.statusBarItem.hide();
        return;
      }

      // Check for active sprint
      const sprint = getCurrentSprint(workspaceRoot);
      if (!sprint) {
        this.statusBarItem.hide();
        return;
      }

      // Get current task
      const currentTask = getCurrentTask(workspaceRoot);
      if (!currentTask) {
        // No active task - show sprint status
        this.statusBarItem.text = "$(rocket) Orchestra";
        this.statusBarItem.tooltip =
          "No task currently in progress\nClick to open Dashboard";
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command = "orchestra.openDashboard";
        this.statusBarItem.show();
        return;
      }

      // Format status bar text: $(icon) Task N: STATUS
      const taskNum = currentTask.task_id;
      const status = currentTask.status;
      const statusDisplay = getStatusDisplay(status);
      this.statusBarItem.text = `$(${statusDisplay.icon}) Task ${taskNum}: ${statusDisplay.label}`;

      // Set color based on status
      this.statusBarItem.backgroundColor = statusDisplay.color;

      // Set tooltip with task title and phase, including Play action hint
      const phaseName = this.getPhaseNameFromTaskId(currentTask.phase_id);
      this.statusBarItem.tooltip = `${currentTask.title}\nPhase: ${phaseName}\nStatus: ${statusDisplay.label}\n\nClick to Play task`;

      // Set command to playTask with current task context
      this.statusBarItem.command = {
        command: "orchestra.playTask",
        title: "Play Task",
        arguments: [{ type: "task", task: { id: currentTask.id } }],
      };

      this.statusBarItem.show();
    } catch (error) {
      // Handle errors gracefully - show error state
      this.statusBarItem.text = "$(error) Orchestra Error";
      this.statusBarItem.tooltip =
        error instanceof Error
          ? `Error: ${error.message}\nClick to open Dashboard`
          : "Error loading Orchestra data\nClick to open Dashboard";
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground",
      );
      this.statusBarItem.show();
    }
  }

  /**
   * Get phase name from phase ID
   * Phase IDs follow pattern: P1, P2, P3, etc.
   */
  private getPhaseNameFromTaskId(phaseId: number): string {
    // Simple mapping - could be enhanced to query from database
    return `Phase ${phaseId}`;
  }

  /**
   * Dispose status bar item
   */
  dispose(): void {
    this.dbSubscription.dispose();
    this.statusBarItem.dispose();
  }
}
