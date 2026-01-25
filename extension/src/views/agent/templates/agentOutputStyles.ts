/**
 * CSS styles for AgentOutputPanel webview
 * Uses VS Code theme variables for consistent theming.
 */

export function getAgentOutputStyles(): string {
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
    }

    .title {
      font-weight: 600;
      font-size: 13px;
      color: var(--vscode-foreground);
    }

    .status {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .content {
      flex: 1;
      overflow-y: auto;
      padding: 12px 14px 24px;
    }

    .output-item {
      margin-bottom: 12px;
      padding: 10px 12px;
      border-radius: 6px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
    }

    .output-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: var(--vscode-descriptionForeground);
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .pill-thinking {
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-blue);
    }

    .pill-tool-call {
      background: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-yellow);
    }

    .pill-tool-result {
      background: var(--vscode-inputValidation-successBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-green);
    }

    .pill-tool-result.error {
      background: var(--vscode-inputValidation-errorBackground);
      border-color: var(--vscode-charts-red);
    }

    .thinking-text {
      line-height: 1.5;
      font-size: 12px;
      white-space: pre-wrap;
    }

    .tool-call-title,
    .tool-result-title {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .tool-arguments,
    .tool-output,
    .tool-error {
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      padding: 8px;
      border-radius: 4px;
      background: var(--vscode-textBlockQuote-background);
      border: 1px solid var(--vscode-panel-border);
      white-space: pre-wrap;
      overflow-x: auto;
    }

    .tool-error {
      background: var(--vscode-inputValidation-errorBackground);
      border-color: var(--vscode-charts-red);
    }

    details.tool-result {
      padding: 0;
      border: none;
      background: transparent;
    }

    details.tool-result summary {
      cursor: pointer;
      list-style: none;
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 12px;
    }

    details.tool-result summary::marker {
      content: '';
    }

    details.tool-result summary::before {
      content: '\\eb7c';
      font-family: codicon;
      font-size: 12px;
      transition: transform 0.2s;
    }

    details.tool-result[open] summary::before {
      transform: rotate(90deg);
    }

    .empty-state {
      text-align: center;
      margin-top: 40px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
  `;
}
