/**
 * CSS styles for Session Chain visualization
 * Uses VS Code theme variables for consistent theming.
 */

export function getSessionChainStyles(): string {
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

    .header-meta {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .chain-length {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      padding: 3px 8px;
      border-radius: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }

    .content {
      flex: 1;
      overflow-y: auto;
      padding: 16px 14px 20px;
    }

    #chain-list {
      display: flex;
      flex-direction: column;
    }

    /* Session Node */
    .session-node {
      display: flex;
      align-items: stretch;
      margin-bottom: 8px;
      position: relative;
    }

    .depth-connector {
      width: 24px;
      height: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      position: relative;
      flex-shrink: 0;
    }

    .depth-connector::before {
      content: '';
      position: absolute;
      left: 12px;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--vscode-panel-border);
    }

    .depth-connector::after {
      content: '';
      position: absolute;
      left: 12px;
      top: 50%;
      width: 12px;
      height: 2px;
      background: var(--vscode-panel-border);
    }

    .session-node.last-child .depth-connector::before {
      bottom: 50%;
    }

    .node-content {
      flex: 1;
      border-radius: 6px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .node-header {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .node-icon {
      font-size: 16px;
    }

    .node-id {
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .status-completed {
      background: var(--vscode-inputValidation-successBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-green);
    }

    .status-failed {
      background: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-red);
    }

    .status-running {
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-blue);
    }

    .status-paused {
      background: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-yellow);
    }

    .status-cancelled {
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border: 1px solid var(--vscode-panel-border);
    }

    .status-initializing {
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-purple, #a855f7);
    }

    .node-stage {
      font-size: 10px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      background: var(--vscode-badge-background);
      padding: 2px 6px;
      border-radius: 8px;
    }

    .node-attempt {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      padding: 2px 6px;
      border-radius: 8px;
      background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-charts-orange, #f97316);
    }

    .continued-badge {
      font-size: 10px;
      color: var(--vscode-foreground);
      padding: 2px 6px;
      border-radius: 8px;
      background: var(--vscode-inputValidation-infoBackground);
      border: 1px solid var(--vscode-charts-blue);
    }

    .node-duration {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family);
    }

    .node-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }

    .node-role {
      text-transform: capitalize;
    }

    .node-iteration {
      font-family: var(--vscode-editor-font-family);
    }

    /* Empty State */
    .empty-state {
      text-align: center;
      margin-top: 40px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }

    /* Depth-specific styling */
    .session-node.depth-0 .node-content {
      border-left: 3px solid var(--vscode-charts-blue);
    }

    .session-node.depth-1 .node-content {
      border-left: 3px solid var(--vscode-charts-green);
    }

    .session-node.depth-2 .node-content {
      border-left: 3px solid var(--vscode-charts-yellow);
    }

    .session-node.depth-3 .node-content {
      border-left: 3px solid var(--vscode-charts-orange, #f97316);
    }

    .session-node.depth-4 .node-content {
      border-left: 3px solid var(--vscode-charts-red);
    }
  `;
}
