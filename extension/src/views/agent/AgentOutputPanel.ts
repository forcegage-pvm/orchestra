/**
 * Agent Output Panel
 *
 * WebviewPanel for displaying agent execution output in real-time.
 */

import * as vscode from "vscode";
import type { AgentRunner } from "../../agents/AgentRunner.js";
import { AgentError } from "../../agents/errors.js";
import { bindAgentOutput } from "./agentOutputConverter.js";
import {
  generateAgentOutputHtml,
  type AgentOutputItem,
} from "./templates/agentOutputTemplate.js";

export class AgentOutputPanel {
  public static currentPanel: AgentOutputPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _pendingMessages: Array<{ type: string; [key: string]: unknown }> =
    [];
  private _messageQueue: Array<{ type: string; [key: string]: unknown }> = [];
  private _batchTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly _batchIntervalMs = 50;
  private readonly _maxItems = 500;
  private _itemCount = 0;
  private _ready = false;
  private _outputSubscription: { dispose(): void } | undefined;
  private _stateSubscription: vscode.Disposable | undefined;
  private _runner: AgentRunner | undefined;

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      (message) => {
        if (message?.type === "ready") {
          this._ready = true;
          this.flushPendingMessages();
          return;
        }

        void this.handleControlMessage(message);
      },
      null,
      this._disposables,
    );

    this._panel.webview.html = this.getHtmlContent();
  }

  /**
   * Create or show panel (singleton)
   */
  public static createOrShow(_extensionUri: vscode.Uri): AgentOutputPanel {
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

    AgentOutputPanel.currentPanel = new AgentOutputPanel(panel);
    return AgentOutputPanel.currentPanel;
  }

  /**
   * Add output item to panel
   */
  public addOutput(output: AgentOutputItem): void {
    this._itemCount += 1;
    const overflow = this._itemCount - this._maxItems;
    if (overflow > 0) {
      this._itemCount = this._maxItems;
      this.enqueueMessage({ type: "prune", count: overflow });
    }

    this.enqueueMessage({ type: "addOutput", output });
  }

  /**
   * Clear all output items
   */
  public clear(): void {
    this._itemCount = 0;
    this.enqueueMessage({ type: "clear" });
  }

  /**
   * Update status badge in header
   */
  public updateStatus(status: string): void {
    this.enqueueMessage({ type: "updateStatus", status });
  }

  /**
   * Bind the panel to an AgentRunner output stream
   */
  public bindToRunner(runner: AgentRunner): void {
    this._outputSubscription?.dispose();
    this._stateSubscription?.dispose();
    this._runner = runner;
    this._outputSubscription = bindAgentOutput(runner.onOutput, {
      addOutput: (output) => this.addOutput(output),
      updateStatus: (status) => this.updateStatus(status),
    });
    this._stateSubscription = runner.onStateChange((state) => {
      this.updateStatus(this.mapStatus(state.status));
    });

    const initialState = runner.getState();
    if (initialState) {
      this.updateStatus(this.mapStatus(initialState.status));
    }
  }

  /**
   * Unbind the panel from the agent output stream
   */
  public unbindRunner(): void {
    this._outputSubscription?.dispose();
    this._outputSubscription = undefined;
    this._stateSubscription?.dispose();
    this._stateSubscription = undefined;
    this._runner = undefined;
  }

  private mapStatus(status: string): string {
    switch (status) {
      case "running":
        return "Running";
      case "paused":
        return "Paused";
      case "stopped":
        return "Stopped";
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      default:
        return status;
    }
  }

  private async handleControlMessage(message: {
    type?: string;
    instruction?: unknown;
  }): Promise<void> {
    if (!message?.type) {
      return;
    }

    if (!this._runner) {
      vscode.window.showErrorMessage(
        "Orchestra: No active agent session to control.",
      );
      return;
    }

    const action = message.type;

    try {
      if (action === "pause") {
        await this._runner.pause();
        return;
      }

      if (action === "resume") {
        await this._runner.resume();
        return;
      }

      if (action === "stop") {
        await this._runner.stop();
        return;
      }

      if (action === "redirect") {
        const instruction =
          typeof message.instruction === "string"
            ? message.instruction.trim()
            : "";
        if (!instruction) {
          vscode.window.showErrorMessage(
            "Orchestra: Redirect instruction cannot be empty.",
          );
          return;
        }
        await this._runner.redirect(instruction);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const prefix = error instanceof AgentError ? "Orchestra" : "Orchestra";
      const actionLabel =
        action === "redirect"
          ? "Redirect"
          : action.charAt(0).toUpperCase() + action.slice(1);
      vscode.window.showErrorMessage(
        `${prefix}: ${actionLabel} failed - ${errorMessage}`,
      );
    }
  }

  private enqueueMessage(message: {
    type: string;
    [key: string]: unknown;
  }): void {
    if (!this._ready) {
      this._pendingMessages.push(message);
      return;
    }

    this._messageQueue.push(message);
    this.ensureBatchTimer();
  }

  private ensureBatchTimer(): void {
    if (this._batchTimer) {
      return;
    }

    this._batchTimer = setTimeout(() => {
      this.flushMessageBatch();
    }, this._batchIntervalMs);
  }

  private flushMessageBatch(): void {
    this._batchTimer = undefined;
    if (!this._messageQueue.length) {
      return;
    }

    const batch = [...this._messageQueue];
    this._messageQueue = [];
    void this._panel.webview.postMessage({ type: "batch", messages: batch });

    if (this._messageQueue.length) {
      this.ensureBatchTimer();
    }
  }

  private flushPendingMessages(): void {
    if (!this._pendingMessages.length) {
      return;
    }

    const messages = [...this._pendingMessages];
    this._pendingMessages = [];
    this._messageQueue.push(...messages);
    this.ensureBatchTimer();
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
    if (this._batchTimer) {
      clearTimeout(this._batchTimer);
      this._batchTimer = undefined;
    }
    this._outputSubscription?.dispose();
    this._stateSubscription?.dispose();
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      disposable?.dispose();
    }
  }
}
