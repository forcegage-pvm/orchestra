/**
 * CSS styles for Message History view
 * Uses VS Code theme variables for consistent theming.
 */

export function getMessageHistoryStyles(): string {
  return `
    :root {
      color-scheme: light dark;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }

    .container {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
      gap: 12px;
    }

    .title {
      font-weight: 600;
      font-size: 13px;
      color: var(--vscode-foreground);
    }

    .header-actions {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .action-button {
      border-radius: 4px;
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
    }

    .action-button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .action-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Stats Container */
    .stats-container {
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-inactiveSelectionBackground);
      padding: 12px 14px;
    }

    .stats-header {
      font-weight: 600;
      font-size: 12px;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 12px;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .stat-item.stat-wide {
      grid-column: span 2;
    }

    .stat-label {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .stat-value {
      font-size: 14px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .stat-timestamp {
      font-size: 11px;
      font-weight: 400;
      font-family: var(--vscode-editor-font-family);
    }

    /* Content */
    .content {
      flex: 1;
      overflow-y: auto;
      padding: 12px 14px 20px;
    }

    #message-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .message-item {
      border-radius: 6px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
      padding: 12px;
    }

    .message-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    .role-pill {
      display: inline-flex;
      align-items: center;
      padding: 3px 8px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .role-pill.role-system {
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-purple, #a855f7);
    }

    .role-pill.role-user {
      background: var(--vscode-inputValidation-successBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-green);
    }

    .role-pill.role-assistant {
      background: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-blue);
    }

    .message-iteration {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }

    .message-timestamp {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family);
    }

    .token-badge {
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 8px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .tool-calls-badge {
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 8px;
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-yellow);
    }

    .message-content {
      margin-top: 6px;
    }

    .message-text {
      line-height: 1.5;
      font-size: 12px;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    /* Structured Content Parts */
    .content-part {
      margin-bottom: 8px;
      border-radius: 4px;
      padding: 8px;
    }

    .content-text {
      background: var(--vscode-textBlockQuote-background);
      border: 1px solid var(--vscode-panel-border);
      line-height: 1.5;
      font-size: 12px;
      white-space: pre-wrap;
    }

    .content-tool-call {
      background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-charts-yellow);
    }

    .tool-call-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      font-size: 11px;
    }

    .tool-call-icon {
      font-size: 14px;
    }

    .tool-call-name {
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .tool-call-id {
      font-family: var(--vscode-editor-font-family);
      font-size: 9px;
      color: var(--vscode-descriptionForeground);
    }

    .tool-call-input {
      margin: 0;
      padding: 6px 8px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      overflow-x: auto;
      line-height: 1.4;
    }

    .content-tool-result {
      background: var(--vscode-inputValidation-successBackground);
      border: 1px solid var(--vscode-charts-green);
    }

    .tool-result-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      font-size: 11px;
    }

    .tool-result-icon {
      font-size: 14px;
    }

    .tool-result-id {
      font-family: var(--vscode-editor-font-family);
      font-size: 9px;
      color: var(--vscode-descriptionForeground);
    }

    .tool-result-value {
      margin: 0;
      padding: 6px 8px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      overflow-x: auto;
      line-height: 1.4;
      max-height: 300px;
      overflow-y: auto;
    }

    /* Pagination */
    .pagination-controls {
      display: flex;
      justify-content: center;
      padding: 16px 0;
      margin-top: 12px;
    }

    .load-more-button {
      border-radius: 4px;
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      padding: 8px 16px;
      font-size: 12px;
      cursor: pointer;
    }

    .load-more-button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .load-more-button:disabled {
      opacity: 0.5;
      cursor: wait;
    }

    /* Empty State */
    .empty-state {
      text-align: center;
      margin-top: 40px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
  `;
}
