/**
 * Dashboard Webview Panel (Stub)
 *
 * Main dashboard panel displaying sprint overview, current task, and timeline.
 * Full implementation in Task 10-13.
 */

import type Database from "better-sqlite3";
import * as vscode from "vscode";
import type { DatabaseWatcher } from "../../database/watcher.js";

export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    _extensionUri: vscode.Uri,
    private readonly _db: Database.Database,
    private readonly dbWatcher: DatabaseWatcher
  ) {
    this._panel = panel;
    void this._db; // Reserved for Task 10-13 implementation

    // Subscribe to database changes
    this.dbWatcher.onDidChange(() => this.update());

    // Handle panel disposal
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Initial content
    this._panel.webview.html = this.getHtmlContent();
  }

  /**
   * Create or show dashboard panel (singleton)
   */
  public static createOrShow(
    extensionUri: vscode.Uri,
    db: Database.Database,
    dbWatcher: DatabaseWatcher
  ): void {
    // Show existing panel
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      "orchestraDashboard",
      "Orchestra Dashboard",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    DashboardPanel.currentPanel = new DashboardPanel(
      panel,
      extensionUri,
      db,
      dbWatcher
    );
  }

  /**
   * Update dashboard content (called on DB change)
   */
  private update(): void {
    // Stub: Will query DB and post message to webview (Task 10-13)
    this._panel.webview.postMessage({ type: "update", data: {} });
  }

  /**
   * Get HTML content for webview (stub)
   */
  private getHtmlContent(): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Orchestra Dashboard</title>
      <style>
        body {
          font-family: var(--vscode-font-family);
          color: var(--vscode-foreground);
          background-color: var(--vscode-editor-background);
          padding: 20px;
        }
        h1 { color: var(--vscode-textLink-foreground); }
      </style>
    </head>
    <body>
      <h1>Orchestra Dashboard (Coming Soon)</h1>
      <p>Dashboard implementation in Task 10-13</p>
    </body>
    </html>`;
  }

  /**
   * Dispose panel and cleanup
   */
  private dispose(): void {
    DashboardPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      disposable?.dispose();
    }
  }
}
