/**
 * Changed Files Panel
 *
 * WebviewPanel for displaying agent file changes and undo actions.
 */

import * as vscode from "vscode";
import type { IFileChangeTracker } from "../../agents/FileChangeTracker.js";
import type { FileChange, FileOperation } from "../../agents/types.js";
import {
  generateChangedFilesHtml,
  type ChangedFileItem,
} from "./templates/changedFilesTemplate.js";

export class ChangedFilesPanel {
  public static currentPanel: ChangedFilesPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _pendingMessages: Array<{ type: string; [key: string]: unknown }> =
    [];
  private _messageQueue: Array<{ type: string; [key: string]: unknown }> = [];
  private _batchTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly _batchIntervalMs = 50;
  private _ready = false;
  private _tracker: IFileChangeTracker | undefined;
  private _trackerSubscriptions: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message?.type === "ready") {
          this._ready = true;
          this.flushPendingMessages();
          return;
        }

        await this.handleControlMessage(message);
      },
      null,
      this._disposables,
    );

    this._panel.webview.html = this.getHtmlContent();
  }

  /**
   * Create or show panel (singleton)
   */
  public static createOrShow(_extensionUri: vscode.Uri): ChangedFilesPanel {
    if (ChangedFilesPanel.currentPanel) {
      ChangedFilesPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
      return ChangedFilesPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      "orchestraChangedFiles",
      "Changed Files",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    ChangedFilesPanel.currentPanel = new ChangedFilesPanel(panel);
    return ChangedFilesPanel.currentPanel;
  }

  /**
   * Bind the panel to a FileChangeTracker
   */
  public bindToTracker(tracker: IFileChangeTracker): void {
    this.unbindTracker();
    this._tracker = tracker;
    this._trackerSubscriptions = [
      tracker.onChangeTracked(() => this.refreshItems()),
      tracker.onChangeUndone(() => this.refreshItems()),
    ];

    this.refreshItems();
  }

  /**
   * Unbind the panel from the tracker
   */
  public unbindTracker(): void {
    for (const disposable of this._trackerSubscriptions) {
      disposable.dispose();
    }
    this._trackerSubscriptions = [];
    this._tracker = undefined;
  }

  private async handleControlMessage(message: {
    type?: string;
    changeId?: unknown;
  }): Promise<void> {
    if (!message?.type) {
      return;
    }

    if (!this._tracker) {
      vscode.window.showErrorMessage(
        "Orchestra: No file change tracker available.",
      );
      return;
    }

    try {
      if (message.type === "diff") {
        const changeId =
          typeof message.changeId === "string" ? message.changeId : "";
        if (!changeId) {
          return;
        }
        await this.openDiff(changeId);
        return;
      }

      if (message.type === "undo") {
        const changeId =
          typeof message.changeId === "string" ? message.changeId : "";
        if (!changeId) {
          return;
        }
        await this._tracker.undoChange(changeId);
        this.refreshItems();
        return;
      }

      if (message.type === "undoAll") {
        await this._tracker.undoAll();
        this.refreshItems();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(
        `Orchestra: Action failed - ${errorMessage}`,
      );
    }
  }

  private refreshItems(): void {
    if (!this._tracker) {
      return;
    }

    const items = this.toViewItems(this._tracker.getChanges());
    this.enqueueMessage({ type: "setItems", items });
  }

  private toViewItems(changes: FileChange[]): ChangedFileItem[] {
    return changes.map((change) => ({
      id: change.id,
      relativePath: change.relativePath,
      operation: change.operation as FileOperation,
      timestamp: change.timestamp,
      undone: change.undone,
    }));
  }

  private async openDiff(changeId: string): Promise<void> {
    if (!this._tracker) {
      return;
    }

    const diff = await this._tracker.getDiff(changeId);
    const beforeContent = diff.previousContent ?? "";
    const afterContent = diff.currentContent ?? "";

    const beforeDoc = await vscode.workspace.openTextDocument({
      content: beforeContent,
    });
    const afterDoc = await vscode.workspace.openTextDocument({
      content: afterContent,
    });

    const title = `${diff.relativePath} (Before ↔ After)`;
    await vscode.commands.executeCommand(
      "vscode.diff",
      beforeDoc.uri,
      afterDoc.uri,
      title,
    );
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

    return generateChangedFilesHtml([], cspSource, nonce);
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
    ChangedFilesPanel.currentPanel = undefined;
    if (this._batchTimer) {
      clearTimeout(this._batchTimer);
      this._batchTimer = undefined;
    }
    this.unbindTracker();
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      disposable?.dispose();
    }
  }
}
