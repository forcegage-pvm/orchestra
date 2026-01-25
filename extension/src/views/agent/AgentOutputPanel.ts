/**
 * Agent Output Panel
 *
 * WebviewPanel for displaying agent execution output in real-time.
 */

import * as vscode from "vscode";
import { generateAgentOutputHtml, type AgentOutputItem } from "./templates/agentOutputTemplate.js";

export class AgentOutputPanel {
  public static currentPanel: AgentOutputPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _pendingMessages: Array<{ type: string; [key: string]: unknown }> = [];
  private _ready = false;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      (message) => {
        if (message?.type === "ready") {
          this._ready = true;
          this.flushPendingMessages();
        }
      },
      null,
      this._disposables,
    );

    this._panel.webview.html = this.getHtmlContent();
  }

  /**
   * Create or show panel (singleton)
   */
  public static createOrShow(extensionUri: vscode.Uri): AgentOutputPanel {
    if (AgentOutputPanel.currentPanel) {
      AgentOutputPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      return AgentOutputPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      "orchestraAgentOutput",
      "Agent Output",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    AgentOutputPanel.currentPanel = new AgentOutputPanel(panel, extensionUri);
    return AgentOutputPanel.currentPanel;
  }

  /**
   * Add output item to panel
   */
  public addOutput(output: AgentOutputItem): void {
    this.postMessage({ type: "addOutput", output });
  }

  /**
   * Clear all output items
   */
  public clear(): void {
    this.postMessage({ type: "clear" });
  }

  /**
   * Update status badge in header
   */
  public updateStatus(status: string): void {
    this.postMessage({ type: "updateStatus", status });
  }

  private postMessage(message: { type: string; [key: string]: unknown }): void {
    if (this._ready) {
      void this._panel.webview.postMessage(message);
      return;
    }

    this._pendingMessages.push(message);
  }

  private flushPendingMessages(): void {
    if (!this._pendingMessages.length) {
      return;
    }

    const messages = [...this._pendingMessages];
    this._pendingMessages = [];
    for (const message of messages) {
      void this._panel.webview.postMessage(message);
    }
  }

  private getHtmlContent(): string {
    const nonce = this.getNonce();
    const cspSource = this._panel.webview.cspSource;

    return generateAgentOutputHtml([], cspSource, "Idle", nonce);
  }

  private getNonce(): string {
    let text = "";
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Dispose panel and cleanup
   */
  public dispose(): void {
    AgentOutputPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      disposable?.dispose();
    }
  }
}
