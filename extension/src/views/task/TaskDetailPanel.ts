/**
 * Task Detail Webview Panel
 *
 * Displays detailed information for a specific task including handover, verification results,
 * feedback, and history timeline. Uses a singleton-per-task pattern to allow multiple task
 * detail panels to be open simultaneously.
 */

import type Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
  getEscalation,
  getFeedback,
  getHandover,
  getLatestCodeReviewForTask,
  getSignal,
  getTaskById,
  getTaskHistory,
  getVerificationChecks,
  getVerificationResults,
  type CodeReviewDetail,
  type Escalation,
  type Feedback,
  type Handover,
  type Progress,
  type Signal,
  type Task,
  type VerificationCheck,
  type VerificationResult,
} from "../../database/queries.js";
import type { DatabaseWatcher } from "../../database/watcher.js";
import { getLogger } from "../../utils/logger.js";

const logger = getLogger();

/**
 * Format timestamp to human-readable relative time
 * @param timestamp ISO 8601 timestamp string
 * @returns Formatted relative time string (e.g., "2 hours ago")
 */
function formatRelativeTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60)
      return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;

    // For older timestamps, use toLocaleString
    return date.toLocaleDateString();
  } catch {
    return timestamp;
  }
}

interface TaskDetailData {
  task?: Task;
  handover?: Handover;
  verificationChecks?: VerificationCheck[]; // Criteria (always shown)
  verificationResults?: Array<
    VerificationResult & { check: VerificationCheck }
  >; // Results (when run)
  feedback?: Feedback;
  signal?: Signal; // Implementor's completion signal
  history?: Array<Progress & { formattedTimestamp: string }>;
  escalation?: Escalation; // TD-016: Escalation data when task is ESCALATED
  codeReview?: CodeReviewDetail | null;
}

export class TaskDetailPanel {
  private static panels: Map<number, TaskDetailPanel> = new Map();
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private readonly _db: Database.Database,
    private readonly dbWatcher: DatabaseWatcher,
    private readonly taskId: number,
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    void this._db; // Keep for potential future direct use

    // Subscribe to database changes (store in disposables for cleanup)
    this._disposables.push(this.dbWatcher.onDidChange(() => this.update()));

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.type) {
          case "ready":
            // Webview is ready, send initial data
            this.update();
            break;
        }
      },
      null,
      this._disposables,
    );

    // Handle panel disposal
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Initial content
    this._panel.webview.html = this.getHtmlContent();
  }

  /**
   * Create or show task detail panel for a specific task
   */
  public static createOrShow(
    extensionUri: vscode.Uri,
    db: Database.Database,
    dbWatcher: DatabaseWatcher,
    taskId: number,
  ): void {
    // Show existing panel for this task
    const existingPanel = TaskDetailPanel.panels.get(taskId);
    if (existingPanel) {
      existingPanel._panel.reveal(vscode.ViewColumn.One);
      return;
    }

    // Create new panel
    const panel = vscode.window.createWebviewPanel(
      `orchestraTaskDetail-${taskId}`,
      `Task ${taskId}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    const taskPanel = new TaskDetailPanel(
      panel,
      extensionUri,
      db,
      dbWatcher,
      taskId,
    );
    TaskDetailPanel.panels.set(taskId, taskPanel);
  }

  /**
   * Update task detail content (called on DB change)
   */
  private update(): void {
    // Guard: Don't update if panel is disposed
    if (!this._panel || this._panel.visible === undefined) {
      return;
    }

    try {
      const data = this.fetchTaskDetailData();
      this._panel.webview.postMessage({ type: "update", data });

      // Update panel title with task title if available
      if (data.task) {
        this._panel.title = `Task ${data.task.task_id}: ${data.task.title}`;
      }
    } catch (error) {
      logger.error(
        `Failed to update task detail for task ${this.taskId}`,
        error,
      );
      this._panel.webview.postMessage({
        type: "error",
        error:
          error instanceof Error
            ? error.message
            : "Failed to load task details",
      });
    }
  }

  /**
   * Fetch task detail data from database
   */
  private fetchTaskDetailData(): TaskDetailData {
    const data: TaskDetailData = {};

    // Get workspace root for query layer
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return data;
    }

    // Get task information
    const task = getTaskById(workspaceRoot, this.taskId);
    if (!task) {
      return data;
    }
    data.task = task;

    // Get handover data
    const handover = getHandover(workspaceRoot, this.taskId);
    if (handover) {
      data.handover = handover;
    }

    // Get verification checks (criteria) - always fetch
    const verificationChecks = getVerificationChecks(
      workspaceRoot,
      this.taskId,
    );
    if (verificationChecks.length > 0) {
      data.verificationChecks = verificationChecks;
    }

    // Get verification results (for latest attempt)
    const verificationResults = getVerificationResults(
      workspaceRoot,
      this.taskId,
      task.retry_count || 1,
    );
    if (verificationResults.length > 0) {
      data.verificationResults = verificationResults;
    }

    // Get feedback (latest)
    const feedback = getFeedback(workspaceRoot, this.taskId);
    if (feedback) {
      data.feedback = feedback;
    }

    // Get signal data (implementor's completion claim)
    const signal = getSignal(workspaceRoot, this.taskId);
    if (signal) {
      data.signal = signal;
    }

    // TD-016: Get escalation data when task is ESCALATED
    if (task.status === "ESCALATED") {
      const escalation = getEscalation(workspaceRoot, this.taskId);
      if (escalation) {
        data.escalation = escalation;
      }
    }

    // Get latest code review for this task
    data.codeReview = getLatestCodeReviewForTask(workspaceRoot, this.taskId);

    // Get history timeline
    const history = getTaskHistory(workspaceRoot, this.taskId);
    data.history = history.map((event) => ({
      ...event,
      formattedTimestamp: formatRelativeTime(event.changed_at),
    }));

    return data;
  }

  /**
   * Get HTML content for webview
   */
  private getHtmlContent(): string {
    // Read HTML template from resources folder (bundled with extension)
    const htmlPath = path.join(
      this._extensionUri.fsPath,
      "resources",
      "views",
      "task",
      "index.html",
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
    TaskDetailPanel.panels.delete(this.taskId);
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      disposable?.dispose();
    }
  }
}
