/**
 * Current Task WebviewView Provider
 *
 * Displays the current in-progress task in the Orchestra sidebar panel.
 * Implements vscode.WebviewViewProvider for embedding in the Explorer container.
 * Provides real-time updates via DatabaseWatcher and bidirectional message passing.
 */

import * as vscode from "vscode";
import {
  getCurrentTask,
  getEscalatedTask,
  getEscalation,
  getNextPendingTask,
  type Handover,
  type Task,
} from "../../database/queries.js";
import type { DatabaseWatcher } from "../../database/watcher.js";
import { OrchestraLogger } from "../../utils/logger.js";
import { getStatusDisplay } from "../statusTranslation.js";
import {
  generateCurrentTaskHtml,
  type TaskData,
} from "./currentTaskTemplate.js";

const logger = new OrchestraLogger();

/**
 * Current Task WebviewView Provider
 *
 * Implements vscode.WebviewViewProvider to display current task in sidebar.
 * Automatically refreshes when database changes occur.
 */
export class CurrentTaskViewProvider implements vscode.WebviewViewProvider {
  private _view: vscode.WebviewView | undefined;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _workspaceRoot: string,
    private readonly _dbWatcher: DatabaseWatcher
  ) {
    // Listen for database changes and refresh view
    this._disposables.push(
      this._dbWatcher.onDidChange(() => {
        this._refresh();
      })
    );
  }

  /**
   * VS Code calls this when the view becomes visible for the first time.
   * This is where we configure the webview and set its initial content.
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;

    // Configure webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // Set initial HTML content
    webviewView.webview.html = this._getHtmlContent(webviewView.webview);

    // Handle messages from the webview
    this._disposables.push(
      webviewView.webview.onDidReceiveMessage((message) => {
        this._handleMessage(message);
      })
    );

    // Clean up when view is disposed
    this._disposables.push(
      webviewView.onDidDispose(() => {
        this._view = undefined;
      })
    );

    logger.debug("CurrentTaskViewProvider resolved");
  }

  /**
   * Refresh the webview content with current task data
   */
  private _refresh(): void {
    if (!this._view) {
      return;
    }

    try {
      // Try to get current in-progress task first
      let currentTask: (Task & { handover: Handover | null }) | null =
        getCurrentTask(this._workspaceRoot);
      let isNextPending = false;

      // If no task in progress, get the next pending task
      if (!currentTask) {
        currentTask = getNextPendingTask(this._workspaceRoot);
        isNextPending = currentTask !== null;
      }

      // Send updated data to webview
      void this._view.webview.postMessage({
        command: "update",
        data: this._getTaskData(currentTask, isNextPending),
      });

      logger.debug("CurrentTaskViewProvider refreshed");
    } catch (error) {
      logger.error("Failed to refresh current task view", error);
    }
  }

  /**
   * Convert database task to TaskData for template
   */
  private _getTaskData(
    currentTask: (Task & { handover: Handover | null }) | null,
    isNextPending: boolean = false
  ): TaskData | null {
    if (!currentTask) {
      return null;
    }

    const priority = currentTask.handover?.priority ?? "P2";

    // Get escalation details if task is escalated
    let escalation: TaskData["escalation"] = null;
    if (currentTask.status === "ESCALATED") {
      const esc = getEscalation(this._workspaceRoot, currentTask.id);
      if (esc) {
        escalation = {
          reason: esc.reason,
          attempts_summary: esc.attempts_summary,
          recommended_action: esc.recommended_action,
          escalated_at: esc.escalated_at,
        };
      }
    }

    return {
      id: currentTask.id,
      task_id: currentTask.task_id,
      title: currentTask.title,
      description: currentTask.description,
      status: currentTask.status,
      priority,
      priorityLabel: this._getPriorityLabel(priority),
      category: currentTask.category,
      updated_at: currentTask.updated_at,
      statusDisplay: getStatusDisplay(currentTask.status),
      isNextPending,
      escalation,
    };
  }

  /**
   * Get human-readable priority label
   */
  private _getPriorityLabel(priority: string): string {
    const labels: Record<string, string> = {
      P0: "Critical",
      P1: "High Priority",
      P2: "Medium Priority",
      P3: "Low Priority",
    };
    return labels[priority] ?? priority;
  }

  /**
   * Handle messages received from the webview
   */
  private _handleMessage(message: {
    command: string;
    [key: string]: unknown;
  }): void {
    switch (message.command) {
      case "refresh":
        this._refresh();
        break;

      case "openTask":
        if (typeof message.taskId === "number") {
          void vscode.commands.executeCommand(
            "orchestra.openTaskDetail",
            message.taskId
          );
        }
        break;

      case "prepareTask":
        if (typeof message.taskId === "number") {
          // Invoke playTask which handles preparation for PENDING tasks
          void vscode.commands.executeCommand("orchestra.playTask", {
            type: "task",
            task: { id: message.taskId },
          });
        }
        break;

      case "signalCompletion":
        if (typeof message.taskId === "number") {
          // TODO: Implement signal completion via MCP or CLI
          void vscode.window.showInformationMessage(
            `Signaling completion for task ${message.taskId}... (MCP integration pending)`
          );
        }
        break;

      case "playTask":
        if (typeof message.taskId === "number") {
          // Invoke the playTask command which routes based on task status
          // This is the same command used by the tree view play button
          void vscode.commands.executeCommand("orchestra.playTask", {
            type: "task",
            task: { id: message.taskId },
          });
        }
        break;

      case "resolveEscalation":
        if (typeof message.taskId === "number") {
          // Invoke de-escalate command with TreeItem-like structure
          void vscode.commands.executeCommand("orchestra.deEscalateTask", {
            type: "task",
            task: { id: message.taskId },
          });
        }
        break;

      case "moveToGateCheck":
        if (typeof message.taskId === "number") {
          // Invoke move to gate check command with TreeItem-like structure
          void vscode.commands.executeCommand("orchestra.moveToGateCheck", {
            type: "task",
            task: { id: message.taskId },
          });
        }
        break;

      case "moveToImplement":
        if (typeof message.taskId === "number") {
          // Invoke move to implement command with TreeItem-like structure
          void vscode.commands.executeCommand("orchestra.moveToImplement", {
            type: "task",
            task: { id: message.taskId },
          });
        }
        break;

      case "forceComplete":
        if (typeof message.taskId === "number") {
          // Invoke force complete command with TreeItem-like structure
          void vscode.commands.executeCommand("orchestra.forceComplete", {
            type: "task",
            task: { id: message.taskId },
          });
        }
        break;

      default:
        logger.warn(`Unknown webview command: ${message.command}`);
    }
  }

  /**
   * Generate HTML content for the webview
   */
  private _getHtmlContent(webview: vscode.Webview): string {
    const cspSource = webview.cspSource;

    // Priority order:
    // 1. Escalated tasks (need human attention)
    // 2. Current in-progress task
    // 3. Next pending task
    let currentTask: (Task & { handover: Handover | null }) | null = null;
    let isNextPending = false;

    // First check for escalated tasks - these need attention
    const escalatedTask = getEscalatedTask(this._workspaceRoot);
    logger.info(
      `getEscalatedTask returned: ${
        escalatedTask
          ? `Task ${escalatedTask.task_id} (${escalatedTask.status})`
          : "null"
      }`
    );
    if (escalatedTask) {
      currentTask = escalatedTask;
    }

    // Then check for in-progress tasks
    if (!currentTask) {
      currentTask = getCurrentTask(this._workspaceRoot);
      logger.info(
        `getCurrentTask returned: ${
          currentTask
            ? `Task ${currentTask.task_id} (${currentTask.status})`
            : "null"
        }`
      );
    }

    // If no task in progress, get the next pending task
    if (!currentTask) {
      currentTask = getNextPendingTask(this._workspaceRoot);
      isNextPending = currentTask !== null;
      logger.info(
        `getNextPendingTask returned: ${
          currentTask
            ? `Task ${currentTask.task_id} (${currentTask.status})`
            : "null"
        }`
      );
    }

    const taskData = this._getTaskData(currentTask, isNextPending);
    logger.info(
      `Rendering task: ${
        taskData ? `Task ${taskData.task_id} (${taskData.status})` : "null"
      }`
    );

    return generateCurrentTaskHtml(taskData, cspSource);
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
