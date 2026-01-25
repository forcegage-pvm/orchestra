/**
 * Database File Watcher
 *
 * Watches .orchestra/.signal file for instant database change notifications.
 * The MCP server writes a timestamp to this file after any database mutation,
 * providing near-instant (~50ms) UI updates instead of 2-second polling.
 *
 * Polling is kept as a fallback at reduced frequency (10s) in case the signal
 * file mechanism fails or is not yet implemented in all handlers.
 *
 * This solves TD-016: Cross-process change notification for SQLite databases.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export class DatabaseWatcher implements vscode.Disposable {
  private readonly signalWatcher: vscode.FileSystemWatcher;
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
    this.pollInterval = 10000; // Poll every 10 seconds as fallback (reduced from 2s)

    this.dbPath = path.join(workspaceRoot, ".orchestra", "orchestra.db");
    this.walPath = path.join(workspaceRoot, ".orchestra", "orchestra.db-wal");

    // Watch .orchestra/.signal file for instant notifications
    // Signal files are small text files that trigger file watchers reliably
    const signalPattern = new vscode.RelativePattern(
      workspaceRoot,
      ".orchestra/.signal",
    );
    this.signalWatcher =
      vscode.workspace.createFileSystemWatcher(signalPattern);

    // Register change handler for signal file
    this.signalWatcher.onDidChange((uri) => {
      console.log(`[Orchestra] Signal file changed: ${uri.fsPath}`);
      this.handleChange("signal");
    });
    this.signalWatcher.onDidCreate((uri) => {
      console.log(`[Orchestra] Signal file created: ${uri.fsPath}`);
      this.handleChange("signal");
    });

    // Initialize last mtime
    this.updateLastMtime();

    // Start polling as fallback (reduced frequency since signal file is primary)
    this.startPolling();
    console.log(
      "[Orchestra] Database watcher initialized (signal file + 10s polling fallback)",
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
        console.log(
          "[Orchestra] Fallback poll detected database change (signal may have been missed)",
        );
        this.lastMtime = currentMtime;
        this.handleChange("poll");
      }
    }, this.pollInterval);
  }

  /**
   * Handle database change (debounced)
   */
  private handleChange(source: "signal" | "poll" | "manual" = "signal"): void {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Update mtime to prevent duplicate triggers
    this.updateLastMtime();

    console.log(
      `[Orchestra] Scheduling database change event (source: ${source})`,
    );

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
    this.handleChange("manual");
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
    this.signalWatcher.dispose();
    this.emitter.dispose();
  }
}
