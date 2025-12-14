/**
 * HTML/CSS template for the Current Task webview panel
 *
 * Provides template generation functions for rendering the current in-progress task
 * in the VS Code sidebar. Uses VS Code CSS variables for theme integration and
 * includes interactive elements for task management.
 */

import type { StatusDisplay } from "../statusTranslation.js";

/**
 * Task data for rendering in the webview
 */
export interface TaskData {
  id: number;
  task_id: number; // Sprint-relative task number for display
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  updated_at: string;
  statusDisplay: StatusDisplay;
  isNextPending?: boolean; // True if this is the next pending task (not in progress)
}

/**
 * Escape HTML to prevent XSS attacks
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generate CSS styles for the webview
 * Uses VS Code CSS variables for theme integration
 */
function getStyles(): string {
  return `
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
    .action-buttons {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    .action-button {
      padding: 6px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
      flex: 1;
    }
    .action-button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .action-button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .action-button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
  `;
}

/**
 * Generate JavaScript for the webview
 */
function getScript(): string {
  return `
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
      const actionButton = task.isNextPending
        ? \`<button class="action-button" onclick="prepareTask(\${task.id})">Prepare Task</button>\`
        : \`<button class="action-button secondary" onclick="signalCompletion(\${task.id})">Signal Completion</button>\`;
      
      return \`
        <div class="task-card">
          <div class="task-header">
            <span class="task-id">Task \${task.task_id}</span>
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
          <div class="action-buttons">
            <button class="action-button" onclick="openTask(\${task.id})">
              View Details
            </button>
            \${actionButton}
          </div>
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
    
    function signalCompletion(taskId) {
      vscode.postMessage({
        command: 'signalCompletion',
        taskId: taskId
      });
    }
    
    function prepareTask(taskId) {
      vscode.postMessage({
        command: 'prepareTask',
        taskId: taskId
      });
    }
    
    function refresh() {
      vscode.postMessage({
        command: 'refresh'
      });
    }
  `;
}

/**
 * Render a task card with all task information
 */
function renderTaskCard(task: TaskData): string {
  return `
    <div class="task-card">
      <div class="task-header">
        <span class="task-id">Task ${task.task_id}</span>
        <span class="task-status">
          <span class="codicon codicon-${task.statusDisplay.icon}"></span>
          ${task.statusDisplay.label}
        </span>
      </div>
      <div class="task-title">${escapeHtml(task.title)}</div>
      <div class="task-description">${escapeHtml(task.description)}</div>
      <div class="task-meta">
        <div class="meta-item">
          <span class="codicon codicon-tag"></span>
          ${escapeHtml(task.priority)}
        </div>
        <div class="meta-item">
          <span class="codicon codicon-folder"></span>
          ${escapeHtml(task.category)}
        </div>
      </div>
      <div class="action-buttons">
        <button class="action-button" onclick="openTask(${task.id})">
          View Details
        </button>
        <button class="action-button secondary" onclick="signalCompletion(${
          task.id
        })">
          Signal Completion
        </button>
      </div>
    </div>
  `;
}

/**
 * Render a no-task placeholder
 */
function renderNoTask(): string {
  return `
    <div class="no-task">
      <p>No task currently in progress</p>
      <button class="action-button" onclick="refresh()">
        Refresh
      </button>
    </div>
  `;
}

/**
 * Generate complete HTML document for the webview
 *
 * @param taskData - Current task data to render, or null if no task
 * @param cspSource - Content Security Policy source for the webview
 * @returns Complete HTML document as a string
 */
export function generateCurrentTaskHtml(
  taskData: TaskData | null,
  cspSource: string
): string {
  const content = taskData ? renderTaskCard(taskData) : renderNoTask();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline';">
  <title>Current Task</title>
  <style>${getStyles()}</style>
</head>
<body>
  <div class="container" id="content">
    ${content}
  </div>
  <script>${getScript()}</script>
</body>
</html>`;
}
