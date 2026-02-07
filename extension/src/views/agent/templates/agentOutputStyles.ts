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
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      padding: 4px 10px;
      border-radius: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      text-transform: uppercase;
      letter-spacing: 0.4px;
      font-weight: 500;
    }

    .status::before {
      content: '';
      display: none;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 2px solid var(--vscode-badge-foreground);
      border-top-color: transparent;
      animation: spin 0.8s linear infinite;
    }

    body[data-agent-status="running"] .status::before {
      display: block;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .loading-indicator {
      display: none;
      position: sticky;
      bottom: 0;
      padding: 16px 0;
      text-align: center;
      background: var(--vscode-editor-background);
      border-top: 1px solid transparent;
      margin-top: auto;
    }

    body[data-agent-status="running"] .loading-indicator {
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .ball-beat {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .ball-beat .ball {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--vscode-badge-background);
      animation: ball-beat 0.7s ease-in-out infinite;
    }

    .ball-beat .ball:nth-child(1) {
      animation-delay: 0s;
    }

    .ball-beat .ball:nth-child(2) {
      animation-delay: 0.15s;
    }

    .ball-beat .ball:nth-child(3) {
      animation-delay: 0.3s;
    }

    @keyframes ball-beat {
      0%, 60%, 100% {
        transform: scale(1);
        opacity: 1;
      }
      30% {
        transform: scale(1.5);
        opacity: 0.7;
      }
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

    .control-divider {
      width: 1px;
      height: 16px;
      background: var(--vscode-panel-border);
      margin: 0 2px;
    }

    .control-button.copy {
      display: inline-flex;
    }

    .control-button.copy.copied {
      background: var(--vscode-inputValidation-infoBackground);
      border-color: var(--vscode-inputValidation-infoBorder, var(--vscode-charts-blue));
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

    .output-debug {
      margin: -2px 0 6px;
      font-size: 10px;
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

    .pill-prompt {
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-purple, #a855f7);
    }

    .pill-unknown {
      background: var(--vscode-inputValidation-warningBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-orange, #f97316);
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

    .pill-progress {
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-blue);
    }

    .pill-stream {
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-blue);
    }

    .pill-file-op {
      background: var(--vscode-inputValidation-successBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-green);
    }

    .pill-metadata {
      background: var(--vscode-inputValidation-infoBackground);
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-charts-purple, #a855f7);
    }

    /* Progress output styles */
    .output-tool-progress {
      border-left-color: var(--vscode-charts-blue);
    }

    .progress-content {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .progress-content .tool-name {
      font-weight: 600;
      font-size: 12px;
      color: var(--vscode-foreground);
    }

    .progress-content .progress-message {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .progress-bar {
      height: 4px;
      background: var(--vscode-progressBar-background);
      border-radius: 2px;
      overflow: hidden;
      margin-top: 4px;
    }

    .progress-fill {
      height: 100%;
      background: var(--vscode-charts-blue);
      border-radius: 2px;
      transition: width 0.2s ease;
    }

    /* Stream output styles */
    .output-tool-stream {
      border-left-color: var(--vscode-charts-blue);
    }

    .stream-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .stream-content .tool-name {
      font-weight: 600;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .stream-chunk {
      margin: 0;
      padding: 6px 8px;
      background: var(--vscode-textCodeBlock-background);
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 200px;
      overflow-y: auto;
    }

    /* File operation styles */
    .output-file-operation {
      border-left-color: var(--vscode-charts-green);
    }

    .file-op-content {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .file-op-content .file-path {
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      color: var(--vscode-textLink-foreground);
    }

    .file-op-content .file-meta {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
    }

    /* Metadata output styles */
    .output-tool-metadata {
      border-left-color: var(--vscode-charts-purple, #a855f7);
    }

    .metadata-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .metadata-content .tool-name {
      font-weight: 600;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .metadata-json {
      margin: 0;
      max-height: 150px;
      overflow-y: auto;
    }

    .prompt-attachments {
      margin-bottom: 8px;
      padding: 8px 12px;
      border-radius: 4px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-panel-border);
    }

    .attachments-header {
      font-size: 11px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }

    .attachments-list {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .attachment-item {
      font-size: 12px;
      font-family: var(--vscode-editor-font-family);
      color: var(--vscode-textLink-foreground);
      padding: 2px 0;
      cursor: default;
    }

    .attachment-item:hover {
      text-decoration: underline;
    }

    .prompt-text {
      line-height: 1.5;
      font-size: 12px;
      white-space: pre-wrap;
      padding: 8px;
      border-radius: 4px;
      background: var(--vscode-textBlockQuote-background);
      border: 1px solid var(--vscode-panel-border);
      max-height: 300px;
      overflow-y: auto;
    }

    .unknown-text {
      line-height: 1.5;
      font-size: 11px;
      white-space: pre-wrap;
      padding: 8px;
      border-radius: 4px;
      background: var(--vscode-inputValidation-warningBackground);
      border: 1px solid var(--vscode-charts-orange, #f97316);
      max-height: 200px;
      overflow-y: auto;
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

    /* Markdown-rendered tool output */
    .tool-output-markdown {
      font-size: 12px;
      padding: 10px 12px;
      border-radius: 4px;
      background: var(--vscode-textBlockQuote-background);
      border: 1px solid var(--vscode-panel-border);
      line-height: 1.6;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .tool-output-markdown .md-h1 {
      font-size: 14px;
      font-weight: 700;
      margin: 4px 0 6px;
      color: var(--vscode-foreground);
    }

    .tool-output-markdown .md-h2 {
      font-size: 13px;
      font-weight: 600;
      margin: 4px 0 4px;
      color: var(--vscode-foreground);
    }

    .tool-output-markdown .md-h3 {
      font-size: 12px;
      font-weight: 600;
      margin: 2px 0;
      color: var(--vscode-foreground);
    }

    .tool-output-markdown .md-text {
      margin: 2px 0;
    }

    .tool-output-markdown .md-spacer {
      height: 6px;
    }

    .tool-output-markdown .md-list {
      margin: 4px 0;
      padding-left: 20px;
      list-style: disc;
    }

    .tool-output-markdown .md-list li {
      margin: 2px 0;
    }

    .tool-output-markdown .md-code {
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      padding: 1px 4px;
      border-radius: 3px;
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-panel-border);
    }

    .tool-output-markdown strong {
      font-weight: 700;
      color: var(--vscode-foreground);
    }

    /* Error-specific markdown styling */
    .output-tool-result .pill-tool-result.error ~ details .tool-output-markdown {
      border-color: var(--vscode-charts-red);
      background: var(--vscode-inputValidation-errorBackground);
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
