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
      gap: 12px;
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

    .header-controls {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }

    .control-buttons {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .control-button {
      display: none;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 6px;
      border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
      padding: 0;
      transition: background 0.15s ease, border-color 0.15s ease;
    }

    .control-button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .control-button.stop {
      background: var(--vscode-inputValidation-errorBackground);
      border-color: var(--vscode-inputValidation-errorBorder, var(--vscode-charts-red));
      color: var(--vscode-foreground);
    }

    .control-button.stop:hover {
      background: var(--vscode-inputValidation-errorBackground);
    }

    body[data-agent-status="running"] .control-button.pause,
    body[data-agent-status="paused"] .control-button.resume,
    body[data-agent-status="running"] .control-button.stop,
    body[data-agent-status="paused"] .control-button.stop {
      display: inline-flex;
    }

    .content {
      flex: 1;
      overflow-y: auto;
      padding: 12px 14px 24px;
    }

    .redirect-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px 14px;
      border-top: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
    }

    .redirect-input {
      flex: 1;
      min-width: 0;
      border-radius: 4px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      padding: 6px 8px;
      font-family: var(--vscode-font-family);
      font-size: 12px;
    }

    .redirect-input:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }

    .redirect-send {
      border-radius: 4px;
      border: 1px solid var(--vscode-button-border, transparent);
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
    }

    .redirect-send:hover {
      background: var(--vscode-button-hoverBackground);
    }

    .output-list {
      display: flex;
      flex-direction: column;
      min-height: 100%;
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

    .code-block {
      line-height: 1.5;
    }

    .token-key {
      color: var(--vscode-charts-blue);
    }

    .token-string {
      color: var(--vscode-charts-orange);
    }

    .token-number {
      color: var(--vscode-charts-purple);
    }

    .token-boolean {
      color: var(--vscode-charts-yellow);
      font-weight: 600;
    }

    .token-null {
      color: var(--vscode-charts-red);
      font-weight: 600;
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
