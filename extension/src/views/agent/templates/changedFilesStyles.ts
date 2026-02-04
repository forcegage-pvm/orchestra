/**
 * CSS styles for ChangedFilesPanel webview
 * Uses VS Code theme variables for consistent theming.
 */

export function getChangedFilesStyles(): string {
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

    .action-primary {
      border-radius: 4px;
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
    }

    .action-primary:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .action-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .content {
      flex: 1;
      overflow-y: auto;
      padding: 12px 14px 20px;
    }

    .file-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      margin-bottom: 10px;
      border-radius: 6px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
    }

    .file-row.undone {
      opacity: 0.6;
    }

    .file-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .file-path {
      font-weight: 600;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .file-meta {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }

    .file-actions {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .action-button {
      border-radius: 4px;
      border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      padding: 4px 10px;
      font-size: 11px;
      cursor: pointer;
    }

    .action-button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .action-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .operation-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .operation-create {
      background: var(--vscode-inputValidation-successBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-green);
    }

    .operation-modify {
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-blue);
    }

    .operation-delete {
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-red);
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .empty-state {
      text-align: center;
      margin-top: 40px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
  `;
}
