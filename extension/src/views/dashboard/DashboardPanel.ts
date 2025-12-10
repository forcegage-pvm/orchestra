/**
 * Dashboard Webview Panel
 *
 * Main dashboard panel displaying sprint overview, current task, and timeline.
 * Provides reactive updates via DatabaseWatcher and message passing with webview.
 */

import type Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { getCurrentSprint, getCurrentTask } from "../../database/queries.js";
import type { DatabaseWatcher } from "../../database/watcher.js";
import { OrchestraLogger } from "../../utils/logger.js";

const logger = new OrchestraLogger();

interface DashboardData {
  sprint?: {
    id: string;
    name: string;
    status: string;
  };
  taskCounts?: {
    total: number;
    completed: number;
    percentage: number;
  };
  phaseBreakdown?: Array<{
    phaseId: string;
    phaseName: string;
    total: number;
    completed: number;
  }>;
  statusDistribution?: {
    pending: number;
    inProgress: number;
    completed: number;
  };
  currentTask?: {
    id: number;
    title: string;
    description: string;
    priority: string;
    status: string;
    category: string;
    updated_at: string;
  };
  recentTasks?: Array<{
    id: number;
    title: string;
    priority: string;
    status: string;
  }>;
}

export class DashboardPanel {
  public static currentPanel: DashboardPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly _db: Database.Database,
    private readonly dbWatcher: DatabaseWatcher
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Subscribe to database changes
    this.dbWatcher.onDidChange(() => this.update());

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.type) {
          case "ready":
            // Webview is ready, send initial data
            this.update();
            break;
          case "openTask":
            // Handle task open request
            void vscode.commands.executeCommand(
              "orchestra.openTaskDetail",
              message.taskId
            );
            break;
        }
      },
      null,
      this._disposables
    );

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
    try {
      const data = this.fetchDashboardData();
      this._panel.webview.postMessage({ type: "update", data });
    } catch (error) {
      logger.error("Failed to update dashboard", error);
      this._panel.webview.postMessage({
        type: "error",
        error:
          error instanceof Error ? error.message : "Failed to load dashboard",
      });
    }
  }

  /**
   * Fetch dashboard data from database
   */
  private fetchDashboardData(): DashboardData {
    const data: DashboardData = {};

    // Get workspace root for query layer
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return data;
    }

    // Get sprint information using query layer
    const currentSprint = getCurrentSprint(workspaceRoot);
    const sprint = currentSprint
      ? {
          id: currentSprint.id,
          name: currentSprint.name,
          workflow_step: currentSprint.workflow_step,
        }
      : undefined;

    if (sprint) {
      data.sprint = {
        id: sprint.id,
        name: sprint.name,
        status: sprint.workflow_step,
      };

      // Get task counts
      const counts = this._db
        .prepare(
          `SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'COMPLETE' THEN 1 ELSE 0 END) as completed
          FROM tasks 
          WHERE sprint_id = ?`
        )
        .get(sprint.id) as { total: number; completed: number } | undefined;

      if (counts) {
        data.taskCounts = {
          total: counts.total,
          completed: counts.completed,
          percentage:
            counts.total > 0
              ? Math.round((counts.completed / counts.total) * 100)
              : 0,
        };
      }

      // Get status distribution
      const statusCounts = this._db
        .prepare(
          `SELECT 
            SUM(CASE WHEN status = 'PENDING' OR status = 'PREPARED' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'IMPLEMENT' OR status = 'VERIFY' THEN 1 ELSE 0 END) as in_progress,
            SUM(CASE WHEN status = 'COMPLETE' THEN 1 ELSE 0 END) as completed
          FROM tasks 
          WHERE sprint_id = ?`
        )
        .get(sprint.id) as
        | { pending: number; in_progress: number; completed: number }
        | undefined;

      if (statusCounts) {
        data.statusDistribution = {
          pending: statusCounts.pending || 0,
          inProgress: statusCounts.in_progress || 0,
          completed: statusCounts.completed || 0,
        };
      }

      // Get phase breakdown
      const phaseBreakdown = this._db
        .prepare(
          `SELECT 
            p.phase_id,
            p.phase_name,
            COUNT(t.id) as total,
            SUM(CASE WHEN t.status = 'COMPLETE' THEN 1 ELSE 0 END) as completed
          FROM phases p
          LEFT JOIN tasks t ON t.phase_id = p.phase_id AND t.sprint_id = p.sprint_id
          WHERE p.sprint_id = ?
          GROUP BY p.phase_id, p.phase_name
          ORDER BY p.phase_id`
        )
        .all(sprint.id) as Array<{
        phase_id: string;
        phase_name: string;
        total: number;
        completed: number;
      }>;

      data.phaseBreakdown = phaseBreakdown.map((phase) => ({
        phaseId: phase.phase_id,
        phaseName: phase.phase_name,
        total: phase.total,
        completed: phase.completed,
      }));

      // Get current task (in progress) using query layer
      const currentTaskData = getCurrentTask(workspaceRoot);

      if (currentTaskData) {
        data.currentTask = {
          id: currentTaskData.task_id,
          title: currentTaskData.title,
          description: currentTaskData.description,
          priority: currentTaskData.handover.priority,
          status: currentTaskData.status,
          category: currentTaskData.category,
          updated_at: currentTaskData.updated_at,
        };
      }

      // Get recent tasks (last 5 tasks, excluding current)
      const recentTasks = this._db
        .prepare(
          `SELECT id, task_id, title, category, status
          FROM tasks 
          WHERE sprint_id = ? AND status != 'PENDING'
          ORDER BY updated_at DESC
          LIMIT 5`
        )
        .all(sprint.id) as Array<{
        id: number;
        task_id: number;
        title: string;
        category: string;
        status: string;
      }>;

      data.recentTasks = recentTasks.map((task) => ({
        id: task.task_id,
        title: task.title,
        priority: task.category,
        status: task.status,
      }));
    }

    return data;
  }

  /**
   * Get HTML content for webview
   */
  private getHtmlContent(): string {
    // Read HTML template from file
    const htmlPath = path.join(
      this._extensionUri.fsPath,
      "src",
      "views",
      "dashboard",
      "index.html"
    );

    let html = fs.readFileSync(htmlPath, "utf8");

    // Generate nonce for security
    const nonce = this.getNonce();

    // Get webview URI for CSP
    const cspSource = this._panel.webview.cspSource;

    // Replace placeholders
    html = html.replace(/\{\{nonce\}\}/g, nonce);
    html = html.replace(/\{\{cspSource\}\}/g, cspSource);

    return html;
  }

  /**
   * Generate a cryptographically secure nonce for CSP
   */
  private getNonce(): string {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
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
