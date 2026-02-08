/**
 * Agent Output Panel
 *
 * WebviewPanel for displaying agent execution output in real-time.
 */

import * as vscode from "vscode";
import type { AgentRunner } from "../../agents/AgentRunner.js";
import { AgentError } from "../../agents/errors.js";
import {
  getSessionMessages,
  getSessionStats,
} from "../../agents/sessions/sessionMessageRepository.js";
import { getSessionChain } from "../../agents/sessions/sessionRepository.js";
import type { VerbosityLevel } from "../../agents/types.js";
import { getVerbosity } from "../../config/settings.js";
import { bindAgentOutput } from "./agentOutputConverter.js";
import { exportConversationMarkdown } from "./messageHistoryExporter.js";
import {
  generateAgentOutputHtml,
  type AgentOutputItem,
} from "./templates/agentOutputTemplate.js";
import { generateMessageHistoryHtml } from "./templates/messageHistoryTemplate.js";
import { generateSessionChainHtml } from "./templates/sessionChainTemplate.js";
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

  // Message history state
  private _currentView: "event_stream" | "message_history" | "session_chain" =
    "event_stream";
  private _currentSessionId: string | undefined;
  private _currentWorkspaceRoot: string | undefined;
  private _messagesPagination = {
    offset: 0,
    limit: 50,
  };
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

        // Handle message history messages
        if (message?.type === "loadMoreMessages") {
          void this.handleLoadMoreMessages(message.offset);
          return;
        }

        if (message?.type === "exportMarkdown") {
          void this.handleExportMarkdown();
          return;
        }

        if (message?.type === "switchTab") {
          void this.handleSwitchTab(message.tab);
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
    const verbosity = getVerbosity();
    const preparedOutput = this.applyVerbosity(output, verbosity);
    if (!preparedOutput) {
      return;
    }

    this._itemCount += 1;
    const overflow = this._itemCount - this._maxItems;
    if (overflow > 0) {
      this._itemCount = this._maxItems;
      this.enqueueMessage({ type: "prune", count: overflow });
    }

    this.enqueueMessage({ type: "addOutput", output: preparedOutput });
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

  /**
   * Show message history for a session
   */
  public showMessageHistory(sessionId: string, workspaceRoot: string): void {
    this._currentView = "message_history";
    this._currentSessionId = sessionId;
    this._currentWorkspaceRoot = workspaceRoot;
    this._messagesPagination = { offset: 0, limit: 50 };

    this.renderMessageHistory();
  }

  /**
   * Show session chain visualization for a session
   */
  public showSessionChain(sessionId: string, workspaceRoot: string): void {
    this._currentView = "session_chain";
    this._currentSessionId = sessionId;
    this._currentWorkspaceRoot = workspaceRoot;

    this.renderSessionChain();
  }

  /**
   * Switch back to event stream view
   */
  public showEventStream(): void {
    this._currentView = "event_stream";
    this._currentSessionId = undefined;
    this._currentWorkspaceRoot = undefined;
    this._panel.webview.html = this.getHtmlContent();
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
    // Don't wait for ready - VS Code webview API handles message buffering
    // The "ready" message from webview was getting blocked by document.write errors
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

  private applyVerbosity(
    output: AgentOutputItem,
    verbosity: VerbosityLevel,
  ): AgentOutputItem | null {
    if (verbosity === "minimal" && output.type === "thinking") {
      return null;
    }

    if (verbosity !== "debug") {
      if (!output.debug) {
        return output;
      }

      const { debug: _debug, ...rest } = output;
      return rest;
    }

    const debugInfo = this.buildDebugInfo(output);
    if (!debugInfo) {
      return output;
    }

    return {
      ...output,
      debug: debugInfo,
    };
  }

  private buildDebugInfo(output: AgentOutputItem): AgentOutputItem["debug"] {
    const tokenCount = this.estimateTokenCount(output);
    const durationMs = output.debug?.durationMs;

    if (tokenCount === undefined && durationMs === undefined) {
      return undefined;
    }

    return {
      tokenCount,
      durationMs,
    };
  }

  private estimateTokenCount(output: AgentOutputItem): number | undefined {
    try {
      const text = this.getTextForTokenCount(output);
      if (!text) {
        return undefined;
      }
      // Rough token estimate: ~4 chars per token
      return Math.ceil(text.length / 4);
    } catch {
      return undefined;
    }
  }

  private getTextForTokenCount(output: AgentOutputItem): string {
    if (output.type === "thinking") {
      return (output.content as { text: string }).text ?? "";
    }

    if (output.type === "tool_call") {
      try {
        return JSON.stringify(
          (output.content as { arguments: Record<string, unknown> })
            .arguments ?? {},
        );
      } catch {
        return "";
      }
    }

    const content = output.content as {
      output: string;
      error?: string;
    };

    return [content.output, content.error].filter(Boolean).join("\n");
  }

  /**
   * Render message history view
   */
  private renderMessageHistory(): void {
    if (!this._currentSessionId || !this._currentWorkspaceRoot) {
      return;
    }

    try {
      const messages = getSessionMessages(
        this._currentWorkspaceRoot,
        this._currentSessionId,
        {
          offset: this._messagesPagination.offset,
          limit: this._messagesPagination.limit,
        },
      );

      const stats = getSessionStats(
        this._currentWorkspaceRoot,
        this._currentSessionId,
      );

      // Check if there are more messages beyond the current batch
      const totalMessages = stats.messageCount;
      const hasMore =
        this._messagesPagination.offset + messages.length < totalMessages;

      const nonce = this.getNonce();
      const cspSource = this._panel.webview.cspSource;

      this._panel.webview.html = generateMessageHistoryHtml(
        messages,
        stats,
        hasMore,
        cspSource,
        nonce,
      );
    } catch (error) {
      console.error(
        "[AgentOutputPanel] Error rendering message history:",
        error,
      );
      vscode.window.showErrorMessage(
        `Failed to load message history: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Render session chain view
   */
  private renderSessionChain(): void {
    if (!this._currentSessionId || !this._currentWorkspaceRoot) {
      return;
    }

    try {
      const chain = getSessionChain(
        this._currentWorkspaceRoot,
        this._currentSessionId,
      );

      const nonce = this.getNonce();
      const cspSource = this._panel.webview.cspSource;

      this._panel.webview.html = generateSessionChainHtml(
        chain,
        cspSource,
        nonce,
      );
    } catch (error) {
      console.error("[AgentOutputPanel] Error rendering session chain:", error);
      vscode.window.showErrorMessage(
        `Failed to load session chain: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Handle 'Load More' pagination request
   */
  private async handleLoadMoreMessages(offset: number): Promise<void> {
    if (!this._currentSessionId || !this._currentWorkspaceRoot) {
      return;
    }

    try {
      const messages = getSessionMessages(
        this._currentWorkspaceRoot,
        this._currentSessionId,
        {
          offset,
          limit: this._messagesPagination.limit,
        },
      );

      const stats = getSessionStats(
        this._currentWorkspaceRoot,
        this._currentSessionId,
      );

      const totalMessages = stats.messageCount;
      const hasMore = offset + messages.length < totalMessages;

      // Send the new messages to the webview
      void this._panel.webview.postMessage({
        type: "appendMessages",
        messages,
        hasMore,
      });

      // Update pagination offset
      this._messagesPagination.offset = offset;
    } catch (error) {
      console.error("[AgentOutputPanel] Error loading more messages:", error);
      vscode.window.showErrorMessage(
        `Failed to load more messages: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Handle Markdown export request
   */
  private async handleExportMarkdown(): Promise<void> {
    if (!this._currentSessionId || !this._currentWorkspaceRoot) {
      return;
    }

    try {
      // Get all messages for the session (no pagination for export)
      const messages = getSessionMessages(
        this._currentWorkspaceRoot,
        this._currentSessionId,
      );

      // Get session info if available (optional)
      const { getSession } =
        await import("../../agents/sessions/sessionRepository.js");
      const session = getSession(
        this._currentWorkspaceRoot,
        this._currentSessionId,
      );

      const markdown = exportConversationMarkdown(messages, session);

      // Prompt user for save location
      const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(
          `conversation-${this._currentSessionId.slice(0, 8)}.md`,
        ),
        filters: {
          Markdown: ["md"],
        },
      });

      if (uri) {
        await vscode.workspace.fs.writeFile(
          uri,
          Buffer.from(markdown, "utf-8"),
        );
        void vscode.window.showInformationMessage(
          `Conversation exported to ${uri.fsPath}`,
        );
      }
    } catch (error) {
      console.error("[AgentOutputPanel] Error exporting markdown:", error);
      vscode.window.showErrorMessage(
        `Failed to export conversation: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Handle tab switch request
   */
  private async handleSwitchTab(tab: string): Promise<void> {
    if (tab === "event_stream") {
      this.showEventStream();
    }
    // Additional tab types can be handled here in the future
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
