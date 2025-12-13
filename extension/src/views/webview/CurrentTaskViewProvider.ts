/**
 * Current Task WebviewView Provider
 *
 * Displays the current in-progress task in the Orchestra sidebar panel.
 * Implements vscode.WebviewViewProvider for embedding in the Explorer container.
 * Provides real-time updates via DatabaseWatcher and bidirectional message passing.
 */

import * as vscode from "vscode";
import { getCurrentTask } from "../../database/queries.js";
import type { DatabaseWatcher } from "../../database/watcher.js";
import { OrchestraLogger } from "../../utils/logger.js";
import { getStatusDisplay } from "../statusTranslation.js";

const logger = new OrchestraLogger();

/**
 * Current Task WebviewView Provider
 *
 * Implements vscode.WebviewViewProvider to display current task in sidebar.
 * Automatically refreshes when database changes occur.
 */
export class CurrentTaskViewProvider implements vscode.WebviewViewProvider {
  private _view: vscode.WebviewView | undefined;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _workspaceRoot: string,
    private readonly _dbWatcher: DatabaseWatcher
  ) {
    // Listen for database changes and refresh view
    this._disposables.push(
      this._dbWatcher.onDidChange(() => {
        this._refresh();
      })
    );
  }

  /**
   * VS Code calls this when the view becomes visible for the first time.
   * This is where we configure the webview and set its initial content.
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;

    // Configure webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // Set initial HTML content
    webviewView.webview.html = this._getHtmlContent(webviewView.webview);

    // Handle messages from the webview
    this._disposables.push(
      webviewView.webview.onDidReceiveMessage((message) => {
        this._handleMessage(message);
      })
    );

    // Clean up when view is disposed
    this._disposables.push(
      webviewView.onDidDispose(() => {
        this._view = undefined;
      })
    );

    logger.debug("CurrentTaskViewProvider resolved");
  }

  /**
   * Refresh the webview content with current task data
   */
  private _refresh(): void {
    if (!this._view) {
      return;
    }

    try {
      const currentTask = getCurrentTask(this._workspaceRoot);

      // Send updated data to webview
      void this._view.webview.postMessage({
        command: "update",
        data: currentTask
          ? {
              id: currentTask.id,
              title: currentTask.title,
              description: currentTask.description,
              status: currentTask.status,
              priority: currentTask.handover.priority,
              category: currentTask.category,
              updated_at: currentTask.updated_at,
              statusDisplay: getStatusDisplay(currentTask.status),
            }
          : null,
      });

      logger.debug("CurrentTaskViewProvider refreshed");
    } catch (error) {
      logger.error("Failed to refresh current task view", error);
    }
  }

  /**
   * Handle messages received from the webview
   */
  private _handleMessage(message: { command: string; [key: string]: unknown }): void {
    switch (message.command) {
      case "refresh":
        this._refresh();
        break;

      case "openTask":
        if (typeof message.taskId === "number") {
          void vscode.commands.executeCommand(
            "orchestra.openTaskDetail",
            message.taskId
          );
        }
        break;

      default:
        logger.warn(`Unknown webview command: ${message.command}`);
    }
  }

  /**
   * Generate HTML content for the webview
   */
  private _getHtmlContent(webview: vscode.Webview): string {
    // Get CSP source
    const cspSource = webview.cspSource;

    // Get current task data for initial render
    const currentTask = getCurrentTask(this._workspaceRoot);
    const taskData = currentTask
      ? {
          id: currentTask.id,
          title: currentTask.title,
          description: currentTask.description,
          status: currentTask.status,
          priority: currentTask.handover.priority,
          category: currentTask.category,
          updated_at: currentTask.updated_at,
          statusDisplay: getStatusDisplay(currentTask.status),
        }
      : null;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline';">
    <title>Current Task</title>
    <style>
        body {
            padding: 0;
            margin: 0;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
        }
        .container {
            padding: 12px;
        }
        .task-card {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 12px;
            background: var(--vscode-editor-background);
        }
        .task-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }
        .task-id {
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
        }
        .task-status {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 11px;
            font-weight: 500;
        }
        .task-title {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .task-description {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 12px;
            line-height: 1.4;
        }
        .task-meta {
            display: flex;
            gap: 12px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .meta-item {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .no-task {
            padding: 12px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }
        .action-button {
            margin-top: 12px;
            padding: 6px 12px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }
        .action-button:hover {
            background: var(--vscode-button-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="container" id="content">
        ${taskData ? `
            <div class="task-card">
                <div class="task-header">
                    <span class="task-id">Task ${taskData.id}</span>
                    <span class="task-status">
                        <span class="codicon codicon-${taskData.statusDisplay.icon}"></span>
                        ${taskData.statusDisplay.label}
                    </span>
                </div>
                <div class="task-title">${this._escapeHtml(taskData.title)}</div>
                <div class="task-description">${this._escapeHtml(taskData.description)}</div>
                <div class="task-meta">
                    <div class="meta-item">
                        <span class="codicon codicon-tag"></span>
                        ${this._escapeHtml(taskData.priority)}
                    </div>
                    <div class="meta-item">
                        <span class="codicon codicon-folder"></span>
                        ${this._escapeHtml(taskData.category)}
                    </div>
                </div>
                <button class="action-button" onclick="openTask(${taskData.id})">
                    View Details
                </button>
            </div>
        ` : `
            <div class="no-task">
                <p>No task currently in progress</p>
                <button class="action-button" onclick="refresh()">
                    Refresh
                </button>
            </div>
        `}
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'update':
                    updateContent(message.data);
                    break;
            }
        });
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        function renderTaskCard(task) {
            return \`
                <div class="task-card">
                    <div class="task-header">
                        <span class="task-id">Task \${task.id}</span>
                        <span class="task-status">
                            <span class="codicon codicon-\${task.statusDisplay.icon}"></span>
                            \${task.statusDisplay.label}
                        </span>
                    </div>
                    <div class="task-title">\${escapeHtml(task.title)}</div>
                    <div class="task-description">\${escapeHtml(task.description)}</div>
                    <div class="task-meta">
                        <div class="meta-item">
                            <span class="codicon codicon-tag"></span>
                            \${escapeHtml(task.priority)}
                        </div>
                        <div class="meta-item">
                            <span class="codicon codicon-folder"></span>
                            \${escapeHtml(task.category)}
                        </div>
                    </div>
                    <button class="action-button" onclick="openTask(\${task.id})">
                        View Details
                    </button>
                </div>
            \`;
        }
        
        function renderNoTask() {
            return \`
                <div class="no-task">
                    <p>No task currently in progress</p>
                    <button class="action-button" onclick="refresh()">
                        Refresh
                    </button>
                </div>
            \`;
        }
        
        function updateContent(taskData) {
            const content = document.getElementById('content');
            if (taskData) {
                content.innerHTML = renderTaskCard(taskData);
            } else {
                content.innerHTML = renderNoTask();
            }
        }
        
        function openTask(taskId) {
            vscode.postMessage({
                command: 'openTask',
                taskId: taskId
            });
        }
        
        function refresh() {
            vscode.postMessage({
                command: 'refresh'
            });
        }
    </script>
</body>
</html>`;
  }

  /**
   * Escape HTML to prevent XSS
   */
  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      disposable?.dispose();
    }
  }
}
