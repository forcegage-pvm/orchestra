/**
 * Agent Panel WebviewView Provider
 *
 * Manages the Agent Panel webview lifecycle and bidirectional communication
 * between the extension host and the SolidJS webview.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 8.2
 */

import * as vscode from "vscode";
import type { ExtensionMessage, WebviewMessage } from "../webviews/agent-panel/protocol/index.js";
import { OrchestraLogger } from "../utils/logger.js";

const logger = new OrchestraLogger();

/**
 * Agent Panel WebviewView Provider
 *
 * Implements vscode.WebviewViewProvider to display the Agent Panel in sidebar.
 * Handles Webview → Extension messages and provides postMessage for Extension → Webview.
 */
export class AgentPanelProvider implements vscode.WebviewViewProvider {
  private _view: vscode.WebviewView | undefined;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    _workspaceRoot: string, // Future use - not stored
  ) {
    void _workspaceRoot; // Explicitly mark as intentionally unused
  }

  /**
   * VS Code calls this when the view becomes visible for the first time
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void | Thenable<void> {
    this._view = webviewView;

    // Configure webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // Set HTML content from bundled webview
    webviewView.webview.html = this._getHtmlContent(webviewView.webview);

    // Handle messages from the webview
    this._disposables.push(
      webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
        this._handleMessage(message);
      }),
    );

    // Clean up when view is disposed
    this._disposables.push(
      webviewView.onDidDispose(() => {
        this._view = undefined;
      }),
    );

    logger.debug("AgentPanelProvider resolved");
  }

  /**
   * Send message to webview
   *
   * Public method for other components to send ExtensionMessages to the webview.
   */
  public postMessage(message: ExtensionMessage): void {
    if (!this._view) {
      logger.warn("Cannot post message - webview not initialized");
      return;
    }

    void this._view.webview.postMessage(message);
  }

  /**
   * Handle messages received from the webview
   */
  private _handleMessage(message: WebviewMessage): void {
    switch (message.type) {
      case "ready":
        logger.debug("Agent Panel webview ready");
        // Initialize webview state if needed
        break;

      case "open_file":
        void this._handleOpenFile(message.path, message.line, message.endLine);
        break;

      case "open_diff":
        void this._handleOpenDiff(message.path);
        break;

      case "copy_text":
        void this._handleCopyText(message.text);
        break;

      case "stop_agent":
        void this._handleStopAgent();
        break;

      case "continue_session":
        void this._handleContinueSession(message.sessionId);
        break;

      case "switch_session":
        void this._handleSwitchSession(message.sessionId);
        break;

      case "export_session":
        void this._handleExportSession(message.sessionId);
        break;

      case "set_verbosity":
        void this._handleSetVerbosity(message.level);
        break;

      case "user_message":
        void this._handleUserMessage(message.text);
        break;

      default:
        // Exhaustive check
        const _exhaustive: never = message;
        logger.warn(`Unknown webview message type:`, _exhaustive);
    }
  }

  /**
   * Open file in editor with optional line positioning
   */
  private async _handleOpenFile(
    path: string,
    line?: number,
    endLine?: number,
  ): Promise<void> {
    try {
      const uri = vscode.Uri.file(path);
      const document = await vscode.workspace.openTextDocument(uri);

      const options: vscode.TextDocumentShowOptions = {
        preview: false,
      };

      // Add line positioning if provided
      if (line !== undefined) {
        const startPos = new vscode.Position(Math.max(0, line - 1), 0);
        const endPos = new vscode.Position(
          Math.max(0, (endLine ?? line) - 1),
          Number.MAX_SAFE_INTEGER,
        );
        options.selection = new vscode.Range(startPos, endPos);
      }

      await vscode.window.showTextDocument(document, options);
    } catch (error) {
      logger.error(`Failed to open file: ${path}`, error);
      void vscode.window.showErrorMessage(
        `Failed to open file: ${path}`,
      );
    }
  }

  /**
   * Open diff view for file
   */
  private async _handleOpenDiff(path: string): Promise<void> {
    try {
      // Diff view implementation - placeholder for future enhancement
      logger.info(`Open diff requested for: ${path}`);
      void vscode.window.showInformationMessage(
        `Diff view not yet implemented for: ${path}`,
      );
    } catch (error) {
      logger.error(`Failed to open diff for: ${path}`, error);
    }
  }

  /**
   * Copy text to clipboard
   */
  private async _handleCopyText(text: string): Promise<void> {
    try {
      await vscode.env.clipboard.writeText(text);
      void vscode.window.showInformationMessage("Copied to clipboard");
    } catch (error) {
      logger.error("Failed to copy text", error);
      void vscode.window.showErrorMessage("Failed to copy to clipboard");
    }
  }

  /**
   * Stop currently running agent
   */
  private async _handleStopAgent(): Promise<void> {
    try {
      logger.info("Stop agent requested");
      // Agent cancellation will be implemented in agent execution tasks
      void vscode.window.showInformationMessage(
        "Agent stop functionality not yet implemented",
      );
    } catch (error) {
      logger.error("Failed to stop agent", error);
    }
  }

  /**
   * Continue a previous session
   */
  private async _handleContinueSession(sessionId: string): Promise<void> {
    try {
      logger.info(`Continue session requested: ${sessionId}`);
      // Session continuation will be implemented in agent execution tasks
      void vscode.window.showInformationMessage(
        `Session continuation not yet implemented: ${sessionId}`,
      );
    } catch (error) {
      logger.error(`Failed to continue session: ${sessionId}`, error);
    }
  }

  /**
   * Switch to viewing a different session
   */
  private async _handleSwitchSession(sessionId: string): Promise<void> {
    try {
      logger.info(`Switch session requested: ${sessionId}`);
      // Session switching will be implemented in session management tasks
      void vscode.window.showInformationMessage(
        `Session switching not yet implemented: ${sessionId}`,
      );
    } catch (error) {
      logger.error(`Failed to switch session: ${sessionId}`, error);
    }
  }

  /**
   * Export session to JSON
   */
  private async _handleExportSession(sessionId: string): Promise<void> {
    try {
      logger.info(`Export session requested: ${sessionId}`);
      // Session export will be implemented in export functionality tasks
      void vscode.window.showInformationMessage(
        `Session export not yet implemented: ${sessionId}`,
      );
    } catch (error) {
      logger.error(`Failed to export session: ${sessionId}`, error);
    }
  }

  /**
   * Set verbosity level
   */
  private async _handleSetVerbosity(
    level: "minimal" | "normal" | "verbose" | "debug",
  ): Promise<void> {
    try {
      logger.debug(`Set verbosity requested: ${level}`);
      // Update workspace configuration
      await vscode.workspace
        .getConfiguration("orchestra")
        .update("agentPanel.verbosity", level, vscode.ConfigurationTarget.Workspace);
      
      // Echo back to webview
      this.postMessage({ type: "set_verbosity", level });
    } catch (error) {
      logger.error(`Failed to set verbosity: ${level}`, error);
    }
  }

  /**
   * Handle user message to agent
   */
  private async _handleUserMessage(text: string): Promise<void> {
    try {
      logger.info(`User message: ${text.substring(0, 50)}...`);
      // Route to AgentRunner - will be implemented in agent execution tasks
      void vscode.window.showInformationMessage(
        "Agent messaging not yet implemented",
      );
    } catch (error) {
      logger.error("Failed to handle user message", error);
    }
  }

  /**
   * Generate HTML content for the webview
   */
  private _getHtmlContent(webview: vscode.Webview): string {
    const cspSource = webview.cspSource;

    // In production, this would load from the Vite build output
    // For now, return a basic HTML structure that loads the bundled JS
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "out", "webviews", "agent-panel", "index.js"),
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource};">
  <title>Agent Panel</title>
</head>
<body>
  <div id="root"></div>
  <script>
    // Provide VS Code API to webview
    const vscode = acquireVsCodeApi();
    window.vscode = vscode;
  </script>
  <script src="${scriptUri}"></script>
</body>
</html>`;
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
