/**
 * Status Bar Manager (Stub)
 *
 * Displays current task status in VS Code status bar.
 * Full implementation in Task 20.
 */

import type Database from "better-sqlite3";
import * as vscode from "vscode";
import type { DatabaseWatcher } from "../../database/watcher.js";

export class StatusBarManager implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor(
    private readonly _db: Database.Database,
    private readonly dbWatcher: DatabaseWatcher
  ) {
    void this._db; // Reserved for Task 20 implementation

    // Create status bar item
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = "orchestra.openDashboard";
    this.statusBarItem.show();

    // Subscribe to database changes
    this.dbWatcher.onDidChange(() => this.refresh());

    // Initial update
    this.refresh();
  }

  /**
   * Refresh status bar (called on DB change)
   */
  refresh(): void {
    // Stub: Will query current task and update (Task 20)
    this.statusBarItem.text = "$(orchestra) Orchestra";
    this.statusBarItem.tooltip = "Open Orchestra Dashboard";
  }

  /**
   * Dispose status bar item
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
