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
  priorityLabel: string; // Human-readable priority (e.g., "High Priority")
  category: string;
  updated_at: string;
  statusDisplay: StatusDisplay;
  isNextPending?: boolean; // True if this is the next pending task (not in progress)
  escalation?: {
    reason: string;
    attempts_summary: string;
    recommended_action: string | null;
    escalated_at: string;
  } | null;
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
      border-radius: 6px;
      padding: 14px;
      background: var(--vscode-editor-background);
    }
    .task-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-bottom: 10px;
    }
    .task-id {
      font-weight: 600;
      font-size: 13px;
      color: var(--vscode-textLink-foreground);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .pill-status {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .pill-status.pending { background: var(--vscode-charts-blue); color: #fff; }
    .pill-status.implement { background: var(--vscode-charts-purple); color: #fff; }
    .pill-status.verify { background: var(--vscode-charts-yellow); color: #000; }
    .pill-status.complete { background: var(--vscode-charts-green); color: #fff; }
    .pill-status.escalated { background: var(--vscode-charts-red); color: #fff; }
    .pill-status.verify_failed { background: var(--vscode-charts-orange); color: #000; }
    .pill-priority {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .pill-priority.p0 { background: var(--vscode-charts-red); color: #fff; }
    .pill-priority.p1 { background: var(--vscode-charts-orange); color: #000; }
    .pill-priority.p2 { background: var(--vscode-charts-blue); color: #fff; }
    .pill-priority.p3 { background: var(--vscode-descriptionForeground); color: var(--vscode-editor-background); }
    .pill-category {
      background: var(--vscode-textBlockQuote-background);
      color: var(--vscode-textBlockQuote-border);
      border: 1px solid var(--vscode-textBlockQuote-border);
    }
    .task-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
      line-height: 1.3;
    }
    .task-description {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 14px;
      line-height: 1.5;
    }
    .escalation-banner {
      background: var(--vscode-inputValidation-errorBackground);
      border: 2px solid var(--vscode-charts-red);
      border-radius: 4px;
      padding: 10px 12px;
      margin-bottom: 14px;
    }
    .escalation-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      font-weight: 600;
      font-size: 12px;
      color: var(--vscode-errorForeground);
      margin-bottom: 6px;
    }
    .escalation-header-title {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .escalation-actions {
      display: flex;
      justify-content: flex-start;
      gap: 2px;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--vscode-charts-red);
    }
    .escalation-actions .btn-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      padding: 0;
      background: transparent;
      border: none;
      border-radius: 3px;
      color: var(--vscode-errorForeground);
      cursor: pointer;
      font-size: 14px;
      opacity: 0.9;
    }
    .escalation-actions .btn-icon:hover {
      background: var(--vscode-toolbar-hoverBackground);
      opacity: 1;
    }
    .escalation-reason {
      font-size: 12px;
      line-height: 1.4;
      margin-bottom: 8px;
    }
    .escalation-details {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    .escalation-details summary {
      cursor: pointer;
      font-weight: 500;
    }
    .escalation-details pre {
      margin: 6px 0 0 0;
      padding: 8px;
      background: var(--vscode-textBlockQuote-background);
      border-radius: 3px;
      white-space: pre-wrap;
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
    }
    .no-task {
      padding: 20px 12px;
      text-align: center;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .action-buttons {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 14px;
    }
    .btn {
      padding: 5px 12px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
    }
    .btn-secondary {
      background: transparent;
      color: var(--vscode-textLink-foreground);
      border: 1px solid var(--vscode-textLink-foreground);
    }
    .btn-secondary:hover {
      background: var(--vscode-textLink-foreground);
      color: var(--vscode-editor-background);
    }
    .btn-primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      padding: 6px 16px;
      font-size: 12px;
    }
    .btn-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .btn-primary.escalated {
      background: var(--vscode-charts-red);
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
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    function renderTaskCard(task) {
      const statusClass = task.status.toLowerCase().replace('_', '-');
      const priorityClass = task.priority.toLowerCase();
      
      // Determine action button based on task state
      let actionButton = '';
      const btnClass = 'btn btn-primary';
      if (task.isNextPending) {
        actionButton = \`<button class="\${btnClass}" onclick="prepareTask(\${task.id})">Prepare Task</button>\`;
      } else if (task.status === 'ESCALATED') {
        actionButton = \`<button class="\${btnClass} escalated" onclick="resolveEscalation(\${task.id})">Resolve Escalation</button>\`;
      } else {
        actionButton = \`<button class="\${btnClass}" onclick="signalCompletion(\${task.id})">Signal Completion</button>\`;
      }

      // Render escalation banner if escalated
      let escalationBanner = '';
      if (task.escalation) {
        escalationBanner = \`
          <div class="escalation-banner">
            <div class="escalation-header">
              <span class="escalation-header-title">
                <span class="codicon codicon-warning"></span>
                Task Escalated - Requires Supervisor Action
              </span>
            </div>
            <div class="escalation-reason">\${escapeHtml(task.escalation.reason)}</div>
            <details class="escalation-details">
              <summary>View Details</summary>
              <pre>\${escapeHtml(task.escalation.attempts_summary)}</pre>
              \${task.escalation.recommended_action ? \`<p><strong>Recommended:</strong> \${escapeHtml(task.escalation.recommended_action)}</p>\` : ''}
            </details>
            <div class="escalation-actions">
              <button class="btn-icon" onclick="resolveEscalation(\${task.id})" title="De-escalate: Return task to previous state with supervisor notes">↩</button>
              <button class="btn-icon" onclick="moveToGateCheck(\${task.id})" title="Re-verify: Run verification checks again">⟳</button>
              <button class="btn-icon" onclick="moveToImplement(\${task.id})" title="Re-do: Send task back to implementation phase">↺</button>
              <button class="btn-icon" onclick="forceComplete(\${task.id})" title="Force Complete: Override and mark task as complete">✓</button>
            </div>
          </div>
        \`;
      }
      
      return \`
        <div class="task-card">
          <div class="task-header">
            <span class="task-id">Task \${task.task_id}</span>
            <span class="pill pill-status \${statusClass}">
              <span class="codicon codicon-\${task.statusDisplay.icon}"></span>
              \${task.statusDisplay.label}
            </span>
            <span class="pill pill-priority \${priorityClass}" title="\${task.priorityLabel}">\${task.priority}</span>
            <span class="pill pill-category">\${task.category}</span>
          </div>
          <div class="task-title">\${escapeHtml(task.title)}</div>
          \${escalationBanner}
          <div class="task-description">\${escapeHtml(task.description)}</div>
          <div class="action-buttons">
            <button class="btn btn-secondary" onclick="openTask(\${task.id})">View Details</button>
            \${actionButton}
          </div>
        </div>
      \`;
    }
    
    function renderNoTask() {
      return \`
        <div class="no-task">
          <p>No task currently in progress</p>
          <button class="btn btn-secondary" onclick="refresh()">Refresh</button>
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
    
    function resolveEscalation(taskId) {
      vscode.postMessage({
        command: 'resolveEscalation',
        taskId: taskId
      });
    }
    
    function moveToGateCheck(taskId) {
      vscode.postMessage({
        command: 'moveToGateCheck',
        taskId: taskId
      });
    }
    
    function moveToImplement(taskId) {
      vscode.postMessage({
        command: 'moveToImplement',
        taskId: taskId
      });
    }
    
    function forceComplete(taskId) {
      vscode.postMessage({
        command: 'forceComplete',
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
  const statusClass = task.status.toLowerCase().replace("_", "-");
  const priorityClass = task.priority.toLowerCase();

  // Determine action button based on task state
  let actionButton = "";
  const actionButtonClass = "btn btn-primary";
  if (task.isNextPending) {
    actionButton = `<button class="${actionButtonClass}" onclick="prepareTask(${task.id})">Prepare Task</button>`;
  } else if (task.status === "ESCALATED") {
    actionButton = `<button class="${actionButtonClass} escalated" onclick="resolveEscalation(${task.id})">Resolve Escalation</button>`;
  } else {
    actionButton = `<button class="${actionButtonClass}" onclick="signalCompletion(${task.id})">Signal Completion</button>`;
  }

  // Render escalation banner if escalated
  const escalationBanner = task.escalation
    ? `
    <div class="escalation-banner">
      <div class="escalation-header">
        <span class="escalation-header-title">
          <span class="codicon codicon-warning"></span>
          Task Escalated - Requires Supervisor Action
        </span>
      </div>
      <div class="escalation-reason">${escapeHtml(task.escalation.reason)}</div>
      <details class="escalation-details">
        <summary>View Details</summary>
        <pre>${escapeHtml(task.escalation.attempts_summary)}</pre>
        ${
          task.escalation.recommended_action
            ? `<p><strong>Recommended:</strong> ${escapeHtml(
                task.escalation.recommended_action
              )}</p>`
            : ""
        }
      </details>
      <div class="escalation-actions">
        <button class="btn-icon" onclick="resolveEscalation(${
          task.id
        })" title="De-escalate: Return task to previous state with supervisor notes">↩</button>
        <button class="btn-icon" onclick="moveToGateCheck(${
          task.id
        })" title="Re-verify: Run verification checks again">⟳</button>
        <button class="btn-icon" onclick="moveToImplement(${
          task.id
        })" title="Re-do: Send task back to implementation phase">↺</button>
        <button class="btn-icon" onclick="forceComplete(${
          task.id
        })" title="Force Complete: Override and mark task as complete">✓</button>
      </div>
    </div>
  `
    : "";

  return `
    <div class="task-card">
      <div class="task-header">
        <span class="task-id">Task ${task.task_id}</span>
        <span class="pill pill-status ${statusClass}">
          <span class="codicon codicon-${task.statusDisplay.icon}"></span>
          ${task.statusDisplay.label}
        </span>
        <span class="pill pill-priority ${priorityClass}" title="${escapeHtml(
    task.priorityLabel
  )}">${escapeHtml(task.priority)}</span>
        <span class="pill pill-category">${escapeHtml(task.category)}</span>
      </div>
      <div class="task-title">${escapeHtml(task.title)}</div>
      ${escalationBanner}
      <div class="task-description">${escapeHtml(task.description)}</div>
      <div class="action-buttons">
        <button class="btn btn-secondary" onclick="openTask(${
          task.id
        })">View Details</button>
        ${actionButton}
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
      <button class="btn btn-secondary" onclick="refresh()">Refresh</button>
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
