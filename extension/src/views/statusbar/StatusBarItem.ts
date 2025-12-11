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

export class StatusBarManager implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor(
    private readonly _db: Database.Database,
    private readonly dbWatcher: DatabaseWatcher
  ) {
    void this._db; // Keep for potential future direct use

    // Create status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = "orchestra.openDashboard";

    // Subscribe to database changes
    this.dbWatcher.onDidChange(() => this.refresh());

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
        this.statusBarItem.show();
        return;
      }

      // Format status bar text: $(task) Task N: STATUS
      const taskNum = currentTask.task_id;
      const status = currentTask.status;
      this.statusBarItem.text = `$(task) Task ${taskNum}: ${status}`;

      // Set color based on status
      this.statusBarItem.backgroundColor = this.getStatusColor(status);

      // Set tooltip with task title and phase
      const phaseName = this.getPhaseNameFromTaskId(currentTask.phase_id);
      this.statusBarItem.tooltip = `${currentTask.title}\nPhase: ${phaseName}\nStatus: ${status}`;

      this.statusBarItem.show();
    } catch (error) {
      // Handle errors gracefully - show error state
      this.statusBarItem.text = "$(error) Orchestra Error";
      this.statusBarItem.tooltip =
        error instanceof Error
          ? `Error: ${error.message}\nClick to open Dashboard`
          : "Error loading Orchestra data\nClick to open Dashboard";
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground"
      );
      this.statusBarItem.show();
    }
  }

  /**
   * Get status bar color based on task status
   */
  private getStatusColor(status: string): vscode.ThemeColor | undefined {
    switch (status) {
      case "COMPLETE":
        return new vscode.ThemeColor("statusBarItem.prominentBackground"); // Green
      case "IMPLEMENT":
      case "GATE_CHECK":
        return new vscode.ThemeColor("statusBarItem.warningBackground"); // Yellow
      case "PENDING":
      case "VERIFY":
        return undefined; // White (default)
      default:
        return undefined;
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
    this.statusBarItem.dispose();
  }
}
