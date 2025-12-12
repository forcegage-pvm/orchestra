/**
 * Database File Watcher
 *
 * Watches orchestra.db for changes and emits events.
 * Uses both file system watcher AND polling as fallback since
 * SQLite WAL mode and cross-process writes often don't trigger
 * file system events reliably on Windows.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export class DatabaseWatcher implements vscode.Disposable {
  private readonly watcher: vscode.FileSystemWatcher;
  private readonly emitter = new vscode.EventEmitter<void>();
  private debounceTimer: NodeJS.Timeout | undefined;
  private pollTimer: NodeJS.Timeout | undefined;
  private readonly debounceDelay: number;
  private readonly pollInterval: number;
  private lastMtime: number = 0;
  private readonly dbPath: string;
  private readonly walPath: string;

  /**
   * Event fired when database changes (debounced)
   */
  readonly onDidChange = this.emitter.event;

  constructor(workspaceRoot: string) {
    // Get debounce delay from configuration
    const config = vscode.workspace.getConfiguration("orchestra");
    this.debounceDelay = config.get<number>("updateInterval", 500);
    this.pollInterval = 2000; // Poll every 2 seconds as fallback

    this.dbPath = path.join(workspaceRoot, ".orchestra", "orchestra.db");
    this.walPath = path.join(workspaceRoot, ".orchestra", "orchestra.db-wal");

    // Watch orchestra.db file AND WAL files (SQLite WAL mode writes to separate files)
    const dbPattern = new vscode.RelativePattern(
      workspaceRoot,
      ".orchestra/orchestra.db*" // Matches .db, .db-wal, .db-shm
    );
    this.watcher = vscode.workspace.createFileSystemWatcher(dbPattern);

    // Register change handler for all file events
    this.watcher.onDidChange((uri) => {
      console.log(`[Orchestra] DB file changed: ${uri.fsPath}`);
      this.handleChange();
    });
    this.watcher.onDidCreate((uri) => {
      console.log(`[Orchestra] DB file created: ${uri.fsPath}`);
      this.handleChange();
    });
    this.watcher.onDidDelete((uri) => {
      console.log(`[Orchestra] DB file deleted: ${uri.fsPath}`);
      this.handleChange();
    });

    // Initialize last mtime
    this.updateLastMtime();

    // Start polling as fallback (file watchers are unreliable for SQLite on Windows)
    this.startPolling();
    console.log(
      "[Orchestra] Database watcher initialized with polling fallback"
    );
  }

  /**
   * Get the latest mtime from db or wal file
   */
  private getLatestMtime(): number {
    let mtime = 0;
    try {
      if (fs.existsSync(this.dbPath)) {
        mtime = Math.max(mtime, fs.statSync(this.dbPath).mtimeMs);
      }
      if (fs.existsSync(this.walPath)) {
        mtime = Math.max(mtime, fs.statSync(this.walPath).mtimeMs);
      }
    } catch {
      // Ignore stat errors
    }
    return mtime;
  }

  /**
   * Update the last known mtime
   */
  private updateLastMtime(): void {
    this.lastMtime = this.getLatestMtime();
  }

  /**
   * Start polling for database changes
   */
  private startPolling(): void {
    this.pollTimer = setInterval(() => {
      const currentMtime = this.getLatestMtime();
      if (currentMtime > this.lastMtime) {
        console.log("[Orchestra] Poll detected database change");
        this.lastMtime = currentMtime;
        this.handleChange();
      }
    }, this.pollInterval);
  }

  /**
   * Handle database change (debounced)
   */
  private handleChange(): void {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Update mtime to prevent duplicate triggers
    this.updateLastMtime();

    // Set new timer
    this.debounceTimer = setTimeout(() => {
      console.log("[Orchestra] Firing database change event (debounced)");
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
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    this.watcher.dispose();
    this.emitter.dispose();
  }
}
