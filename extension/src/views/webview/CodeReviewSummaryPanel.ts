/**
 * Code Review Summary Webview Panel
 *
 * Displays code review status totals, open issues list with severity filters,
 * and review history in a webview panel.
 * Implements singleton pattern for single panel instance.
 */

import * as vscode from "vscode";
import {
  getCodeReviewById,
  getCodeReviewHistory,
  getCodeReviewSummary,
  getOpenCodeReviewIssues,
  resolveCodeReviewIssue,
  type CodeReviewHistoryEntry,
  type CodeReviewSummary,
  type OpenCodeReviewIssue,
} from "../../database/queries.js";
import type { DatabaseWatcher } from "../../database/watcher.js";

/**
 * Code Review Summary Panel
 *
 * Singleton webview panel for displaying code review status and issues.
 */
export class CodeReviewSummaryPanel {
  private static _instance: CodeReviewSummaryPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  private constructor(
    extensionUri: vscode.Uri,
    private readonly _workspaceRoot: string,
    private readonly _dbWatcher: DatabaseWatcher,
  ) {
    // Create webview panel
    this._panel = vscode.window.createWebviewPanel(
      "orchestra.codeReviewSummary",
      "Code Review Summary",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
      },
    );

    // Set initial HTML
    this._update();

    // Listen to database changes
    this._disposables.push(
      this._dbWatcher.onDidChange(() => {
        this._update();
      }),
    );

    // Handle panel disposal
    this._disposables.push(
      this._panel.onDidDispose(() => {
        this.dispose();
      }),
    );

    // Handle messages from webview
    this._disposables.push(
      this._panel.webview.onDidReceiveMessage((message) => {
        this._handleMessage(message);
      }),
    );
  }

  /**
   * Create or show the singleton panel instance
   */
  public static createOrShow(
    extensionUri: vscode.Uri,
    workspaceRoot: string,
    dbWatcher: DatabaseWatcher,
  ): CodeReviewSummaryPanel {
    if (CodeReviewSummaryPanel._instance) {
      CodeReviewSummaryPanel._instance._panel.reveal(vscode.ViewColumn.One);
      return CodeReviewSummaryPanel._instance;
    }

    CodeReviewSummaryPanel._instance = new CodeReviewSummaryPanel(
      extensionUri,
      workspaceRoot,
      dbWatcher,
    );
    return CodeReviewSummaryPanel._instance;
  }

  /**
   * Refresh the webview content
   */
  public refresh(): void {
    this._update();
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    CodeReviewSummaryPanel._instance = undefined;

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      disposable?.dispose();
    }

    this._panel.dispose();
  }

  private _update(): void {
    // Guard: Don't update if panel is disposed
    if (!this._panel || this._panel.visible === undefined) {
      return;
    }

    const summary = getCodeReviewSummary(this._workspaceRoot);
    const issues = getOpenCodeReviewIssues(this._workspaceRoot);
    const history = getCodeReviewHistory(this._workspaceRoot);

    this._panel.webview.html = this._getHtmlContent(
      this._panel.webview,
      summary,
      issues,
      history,
    );
  }

  private _handleMessage(message: {
    command: string;
    [key: string]: unknown;
  }): void {
    switch (message.command) {
      case "openIssue":
        // Handle opening an issue in the editor
        if (message.file && typeof message.file === "string") {
          const line =
            typeof message.line === "number" ? message.line : undefined;
          void this._openFile(message.file, line);
        }
        break;
      case "filterBySeverity":
        // Severity filtering is handled client-side in the webview
        break;
      case "viewReviewDetails":
        if (typeof message.reviewId === "number") {
          const review = getCodeReviewById(
            this._workspaceRoot,
            message.reviewId,
          );
          if (review) {
            void vscode.commands.executeCommand(
              "orchestra.openTaskDetail",
              review.task_id,
            );
          } else {
            void vscode.window.showErrorMessage(
              `Code review ${message.reviewId} not found`,
            );
          }
        }
        break;
      case "resolveIssue":
        if (typeof message.issueId === "number") {
          const resolved = resolveCodeReviewIssue(
            this._workspaceRoot,
            message.issueId,
            "user",
          );
          if (resolved) {
            void vscode.window.showInformationMessage(
              `Issue ${message.issueId} marked as resolved.`,
            );
            this._update();
          } else {
            void vscode.window.showWarningMessage(
              `Issue ${message.issueId} was not open or could not be resolved.`,
            );
          }
        }
        break;
      default:
        break;
    }
  }

  private async _openFile(filePath: string, line?: number): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);

      if (line !== undefined && line > 0) {
        const position = new vscode.Position(line - 1, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter,
        );
      }
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Failed to open file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private _getHtmlContent(
    webview: vscode.Webview,
    summary: CodeReviewSummary,
    issues: OpenCodeReviewIssue[],
    history: CodeReviewHistoryEntry[],
  ): string {
    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline';">
  <title>Code Review Summary</title>
  <style>
    body {
      padding: 20px;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.6;
    }
    
    h1 {
      color: var(--vscode-foreground);
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 10px;
      margin-bottom: 20px;
    }
    
    h2 {
      color: var(--vscode-foreground);
      margin-top: 30px;
      margin-bottom: 15px;
    }
    
    .status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    
    .status-card {
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 15px;
      text-align: center;
    }
    
    .status-label {
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 5px;
    }
    
    .status-value {
      font-size: 2em;
      font-weight: bold;
      color: var(--vscode-foreground);
    }
    
    .filter-controls {
      margin-bottom: 20px;
      display: flex;
      gap: 10px;
      align-items: center;
    }
    
    .filter-controls label {
      color: var(--vscode-foreground);
    }
    
    .filter-controls select {
      background-color: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border);
      padding: 5px 10px;
      border-radius: 3px;
    }
    
    .issue-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    
    .issue-item {
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 15px;
      margin-bottom: 10px;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    
    .issue-item:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    
    .issue-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    
    .severity-badge {
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 0.85em;
      font-weight: bold;
      text-transform: uppercase;
    }
    
    .severity-BLOCKING {
      background-color: var(--vscode-testing-iconFailed);
      color: var(--vscode-editor-background);
    }
    
    .severity-MAJOR {
      background-color: var(--vscode-editorWarning-foreground);
      color: var(--vscode-editor-background);
    }
    
    .severity-MINOR {
      background-color: var(--vscode-editorInfo-foreground);
      color: var(--vscode-editor-background);
    }
    
    .severity-INFO {
      background-color: var(--vscode-editorHint-foreground);
      color: var(--vscode-editor-background);
    }
    
    .category-badge {
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 0.85em;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    
    .issue-description {
      color: var(--vscode-foreground);
      margin-bottom: 10px;
    }
    
    .issue-location {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
      margin-bottom: 10px;
    }
    
    .issue-recommendation {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      font-size: 0.9em;
      padding-left: 15px;
      border-left: 3px solid var(--vscode-panel-border);
    }

    .issue-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }

    .btn {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 3px;
      padding: 4px 8px;
      font-size: 0.85em;
      cursor: pointer;
    }

    .btn.secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    
    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: var(--vscode-descriptionForeground);
    }
    
    .history-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    
    .history-item {
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      padding: 12px;
      margin-bottom: 8px;
    }
    
    .history-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 5px;
    }
    
    .history-task {
      font-weight: bold;
      color: var(--vscode-foreground);
    }
    
    .history-status, .status-pill {
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.8em;
      background-color: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    
    .history-meta {
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }
  </style>
</head>
<body>
  <h1>Code Review Summary</h1>
  
  <h2>Status Totals</h2>
  <div class="status-grid">
    <div class="status-card">
      <div class="status-label">Total Reviews</div>
      <div class="status-value">${summary.totalReviews}</div>
    </div>
    <div class="status-card">
      <div class="status-label">Pending</div>
      <div class="status-value">${summary.byStatus.PENDING}</div>
    </div>
    <div class="status-card">
      <div class="status-label">Approved</div>
      <div class="status-value">${summary.byStatus.APPROVED}</div>
    </div>
    <div class="status-card">
      <div class="status-label">Needs Revision</div>
      <div class="status-value">${summary.byStatus.NEEDS_REVISION}</div>
    </div>
    <div class="status-card">
      <div class="status-label">Rejected</div>
      <div class="status-value">${summary.byStatus.REJECTED}</div>
    </div>
    <div class="status-card">
      <div class="status-label">Open Issues</div>
      <div class="status-value">${summary.openIssuesCount}</div>
    </div>
  </div>
  
  <h2>Open Issues</h2>
  <div class="filter-controls">
    <label for="severity-filter">Filter by Severity:</label>
    <select id="severity-filter" onchange="filterBySeverity(this.value)">
      <option value="BLOCKING">BLOCKING and above</option>
      <option value="MAJOR">MAJOR and above</option>
      <option value="MINOR">MINOR and above</option>
      <option value="all">All</option>
    </select>
  </div>
  
  ${
    issues.length === 0
      ? '<div class="empty-state">No open issues</div>'
      : `<ul class="issue-list" id="issue-list">
    ${issues
      .map(
        (issue) => `
      <li class="issue-item" data-severity="${issue.severity}" onclick="openIssue('${this._escapeHtml(issue.file_path ?? "")}', ${issue.line_number ?? 0})">
        <div class="issue-header">
          <span class="severity-badge severity-${issue.severity}">${issue.severity}</span>
          <span class="category-badge">${issue.category}</span>
        </div>
        <div class="issue-description">${this._escapeHtml(issue.description)}</div>
        ${
          issue.file_path
            ? `<div class="issue-location">${this._escapeHtml(issue.file_path)}${issue.line_number ? `:${issue.line_number}` : ""}</div>`
            : ""
        }
        ${
          issue.recommendation
            ? `<div class="issue-recommendation">💡 ${this._escapeHtml(issue.recommendation)}</div>`
            : ""
        }
        <div class="issue-actions">
          <button class="btn" onclick="resolveIssue(event, ${issue.issue_id})">Mark Resolved</button>
          <button class="btn secondary" onclick="openIssue('${this._escapeHtml(issue.file_path ?? "")}', ${issue.line_number ?? 0}); event.stopPropagation();">Open File</button>
        </div>
      </li>
    `,
      )
      .join("")}
  </ul>`
  }
  
  <h2>Review History</h2>
  ${
    history.length === 0
      ? '<div class="empty-state">No review history</div>'
      : `<ul class="history-list">
    ${history
      .map(
        (entry) => `
      <li class="history-item">
        <div class="history-header">
          <span class="history-task">Task ${entry.task_id}: ${this._escapeHtml(entry.task_title)}</span>
          <span class="history-status">${entry.status}</span>
        </div>
        <div class="history-meta">
          Risk: ${entry.risk} | Issues: ${entry.issues_count}
          ${entry.reviewed_by ? ` | Reviewed by: ${entry.reviewed_by}` : ""}
          ${entry.reviewed_at ? ` | ${new Date(entry.reviewed_at).toLocaleString()}` : ""}
        </div>
        ${entry.summary ? `<div class="history-summary">${this._escapeHtml(entry.summary)}</div>` : ""}
        <a href="#" class="details-link" onclick="viewReviewDetails(${(entry as any).review_id}); return false;">View details</a>
      </li>
    `,
      )
      .join("")}
  </ul>`
  }
  
  <script>
    const vscode = acquireVsCodeApi();
    
    function viewReviewDetails(reviewId) {
      vscode.postMessage({
        command: 'viewReviewDetails',
        reviewId: reviewId
      });
    }
    
    function filterBySeverity(severity) {
      const items = document.querySelectorAll('.issue-item');
      const severityOrder = { BLOCKING: 1, MAJOR: 2, MINOR: 3, INFO: 4 };
      
      items.forEach(item => {
        const itemSeverity = item.getAttribute('data-severity');
        const itemOrder = severityOrder[itemSeverity] || 999;
        const filterOrder = severityOrder[severity] || 999;
        
        if (severity === 'all' || itemOrder <= filterOrder) {
          item.style.display = '';
        } else {
          item.style.display = 'none';
        }
      });
    }
    
    function openIssue(file, line) {
      vscode.postMessage({
        command: 'openIssue',
        file: file,
        line: line
      });
    }

    function resolveIssue(event, issueId) {
      event.stopPropagation();
      vscode.postMessage({
        command: 'resolveIssue',
        issueId: issueId
      });
    }
  </script>
</body>
</html>`;
  }

  private _escapeHtml(text: string | null | undefined): string {
    if (!text) {
      return "";
    }
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
