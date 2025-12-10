/**
 * Database File Watcher
 *
 * Watches orchestra.db for changes and emits events.
 * Debounces rapid changes to prevent excessive updates.
 */

import * as vscode from "vscode";

export class DatabaseWatcher implements vscode.Disposable {
  private readonly watcher: vscode.FileSystemWatcher;
  private readonly emitter = new vscode.EventEmitter<void>();
  private debounceTimer: NodeJS.Timeout | undefined;
  private readonly debounceDelay: number;

  /**
   * Event fired when database changes (debounced)
   */
  readonly onDidChange = this.emitter.event;

  constructor(workspaceRoot: string) {
    // Get debounce delay from configuration
    const config = vscode.workspace.getConfiguration("orchestra");
    this.debounceDelay = config.get<number>("updateInterval", 500);

    // Watch orchestra.db file
    const dbPattern = new vscode.RelativePattern(
      workspaceRoot,
      ".orchestra/orchestra.db"
    );
    this.watcher = vscode.workspace.createFileSystemWatcher(dbPattern);

    // Register change handler
    this.watcher.onDidChange(() => this.handleChange());
    this.watcher.onDidCreate(() => this.handleChange());
  }

  /**
   * Handle database change (debounced)
   */
  private handleChange(): void {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer
    this.debounceTimer = setTimeout(() => {
      this.emitter.fire();
      this.debounceTimer = undefined;
    }, this.debounceDelay);
  }

  /**
   * Manually trigger change event (for testing/refresh)
   */
  trigger(): void {
    this.handleChange();
  }

  /**
   * Dispose watcher and cleanup
   */
  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.watcher.dispose();
    this.emitter.dispose();
  }
}
