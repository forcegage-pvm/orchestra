/**
 * Agent Panel WebviewView Provider
 *
 * Manages the Agent Panel webview lifecycle and bidirectional communication
 * between the extension host and the SolidJS webview.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 8.2
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { AgentSession as AgentSessionClass } from "../agents/AgentSession.js";
import { getAgentEventBus } from "../agents/sessions/eventBus.js";
import {
  deleteEventsForSession,
  getEventsForSession,
} from "../agents/sessions/eventRepository.js";
import { exportSession } from "../agents/sessions/exporter.js";
import {
  getRecentSessions,
  getSession,
  getSessionsForTask,
} from "../agents/sessions/sessionRepository.js";
import type {
  AgentSession,
  AgentSessionInfo,
  EventBusPayload,
} from "../agents/sessions/types.js";
import {
  getLatestCodeReviewForTask,
  getTaskById,
} from "../database/queries.js";
import { getAgentRunner } from "../extension.js";
import { highlightRange } from "../utils/fileHighlight.js";
import { getLogger } from "../utils/logger.js";
import type {
  ExtensionMessage,
  VerbosityLevel,
  WebviewMessage,
} from "../webviews/agent-panel/protocol/index.js";

const logger = getLogger();

/**
 * Convert AgentSession class instance to AgentSession interface
 *
 * The AgentRunner uses an AgentSession CLASS with field `id`,
 * but the webview protocol expects the AgentSession INTERFACE with field `sessionId`.
 * This helper bridges that gap.
 */
/**
 * Get a human-readable status message based on task state and agent role
 *
 * Maps task status + code review status to descriptive messages matching
 * the workflow state machine (see docs/WORKFLOW_TRANSITIONS.md).
 */
function getStatusMessageFromTask(
  workspaceRoot: string,
  role: AgentSession["role"],
  taskId: number | undefined,
): string | undefined {
  if (!taskId) {
    return undefined;
  }

  const task = getTaskById(workspaceRoot, taskId);
  if (!task) {
    return undefined;
  }

  // Get code review status for code review-related states
  const codeReview = getLatestCodeReviewForTask(workspaceRoot, taskId);
  const codeReviewStatus = codeReview?.status;

  // Map task status + role to appropriate message
  switch (task.status) {
    case "PENDING":
      if (role === "orchestrator") return "Preparing handover";
      break;

    case "PENDING_HANDOVER_REVIEW":
      if (role === "controller") return "Reviewing handover";
      if (role === "orchestrator") return "Awaiting handover review";
      break;

    case "HANDOVER_REVIEW_FAILED":
      if (role === "orchestrator") return "Fixing handover";
      break;

    case "IMPLEMENT":
      if (role === "implementor") return "Implementing";
      break;

    case "GATE_CHECK":
    case "VERIFY":
      if (role === "orchestrator") return "Verifying";
      if (role === "implementor") return "Awaiting verification";
      break;

    case "VERIFY_FAILED":
      if (role === "implementor") return "Fixing implementation";
      if (role === "orchestrator") return "Verification failed";
      break;

    case "VERIFIED":
      if (codeReviewStatus === "PENDING") {
        if (role === "controller") return "Code reviewing";
        return "Awaiting code review";
      }
      if (codeReviewStatus === "PENDING_VERIFICATION") {
        if (role === "controller") return "Re-reviewing code";
        return "Awaiting re-review";
      }
      break;

    case "PENDING_CODE_REVIEW":
      if (role === "controller") return "Code reviewing";
      return "Awaiting code review";

    case "CODE_REVIEW_CHANGES_REQUESTED":
      if (codeReviewStatus === "PENDING_VERIFICATION") {
        if (role === "controller") return "Re-reviewing code";
        return "Awaiting re-review";
      }
      if (role === "implementor") return "Fixing code review issues";
      break;

    case "CODE_REVIEW_FAILED":
      if (role === "implementor") return "Fixing code review issues";
      break;

    case "ESCALATED":
      if (role === "orchestrator") return "Reviewing escalation";
      return "Escalated";

    case "COMPLETE":
      if (codeReviewStatus === "PENDING") {
        if (role === "controller") return "Code reviewing";
        return "Awaiting code review";
      }
      return "Complete";
  }

  return undefined;
}

function sessionClassToInterface(
  workspaceRoot: string,
  session: AgentSessionClass,
): AgentSession {
  return {
    sessionId: session.id,
    role: session.role,
    taskId: session.taskId ?? 0,
    taskNumber: session.taskNumber,
    taskTitle: undefined, // Not stored in the class
    sprintId: session.sprintId,
    startedAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    endedAt: undefined, // Will be set when session ends
    status: session.status,
    statusMessage: getStatusMessageFromTask(
      workspaceRoot,
      session.role,
      session.taskId ?? undefined,
    ),
    iteration: session.currentIteration,
    maxIterations: session.maxIterations,
    toolCallCount: session.toolCalls.length,
    successfulToolCalls: session.toolCalls.filter((tc) => tc.success).length,
    failedToolCalls: session.toolCalls.filter((tc) => !tc.success).length,
    warningCount: 0,
    filesModified: session.fileChanges.map((fc) => fc.path),
    durationMs: undefined,
  };
}

/**
 * Convert AgentSessionInfo (from EventBus) to partial AgentSession interface
 *
 * AgentSessionInfo has minimal fields; we create a partial session for UI display.
 */
function sessionInfoToInterface(
  workspaceRoot: string,
  info: AgentSessionInfo,
): AgentSession {
  return {
    sessionId: info.id,
    role: info.role,
    taskId: info.taskId ?? 0,
    taskNumber: info.taskNumber,
    taskTitle: info.taskTitle,
    sprintId: "",
    startedAt: info.startedAt,
    lastActivityAt: info.startedAt,
    endedAt: undefined,
    status: info.status,
    statusMessage: getStatusMessageFromTask(
      workspaceRoot,
      info.role,
      info.taskId,
    ),
    iteration: 0,
    maxIterations: 80,
    toolCallCount: 0,
    successfulToolCalls: 0,
    failedToolCalls: 0,
    warningCount: 0,
    filesModified: [],
    durationMs: undefined,
  };
}

/**
 * Agent Panel WebviewView Provider
 *
 * Implements vscode.WebviewViewProvider to display the Agent Panel in sidebar.
 * Handles Webview → Extension messages and provides postMessage for Extension → Webview.
 */
export class AgentPanelProvider implements vscode.WebviewViewProvider {
  private _view: vscode.WebviewView | undefined;
  private readonly _disposables: vscode.Disposable[] = [];
  private _currentSessionId: string | null = null;
  private _isWebviewReady = false;
  private _pendingMessages: ExtensionMessage[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _workspaceRoot: string,
  ) {
    // Subscribe to EventBus for real-time session updates
    this._disposables.push(
      getAgentEventBus().onEvent((payload) => {
        logger.info(
          `[AgentPanelProvider] EventBus payload received: ${payload.type}`,
        );
        this._handleEventBusPayload(payload);
      }),
    );
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

    // With retainContextWhenHidden: true, the webview stays alive when hidden.
    // State restoration happens via the 'ready' message handler which is the
    // only reliable path (it waits for webview JS to be initialized).

    // Sync verbosity when configuration changes
    if (typeof vscode.workspace.onDidChangeConfiguration === "function") {
      this._disposables.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
          if (event.affectsConfiguration("orchestra.agentPanel.verbosity")) {
            const level = this._getVerbositySetting();
            this.postMessage({ type: "set_verbosity", level });
          }
        }),
      );
    }

    // Clean up when view is disposed
    this._disposables.push(
      webviewView.onDidDispose(() => {
        this._view = undefined;
        this._isWebviewReady = false;
        this._pendingMessages = [];
      }),
    );

    logger.info(
      "[AgentPanelProvider] Webview resolved, waiting for 'ready' message",
    );

    // Note: We do NOT call _restoreSessionState() here because the webview
    // JS hasn't initialized yet. Messages sent now would be lost.
    // Instead, we wait for the webview to send 'ready', then restore.
  }

  /**
   * Send message to webview
   *
   * Public method for other components to send ExtensionMessages to the webview.
   * If webview isn't ready yet, messages are buffered and sent after "ready" message is received.
   */
  public postMessage(message: ExtensionMessage): void {
    if (!this._view) {
      logger.warn("Cannot post message - webview not initialized");
      return;
    }

    // Buffer messages until webview sends "ready" signal
    if (!this._isWebviewReady) {
      logger.debug(`[AgentPanelProvider] Buffering message: ${message.type}`);
      this._pendingMessages.push(message);
      return;
    }

    void this._view.webview.postMessage(message);
  }

  /**
   * Clear the agent panel and delete session events from database
   *
   * This completely clears the panel state:
   * 1. Deletes all events for the current session from the database
   * 2. Clears internal session tracking
   * 3. Notifies the webview to clear its state
   */
  public clearPanel(): void {
    logger.info("[AgentPanelProvider] Clearing agent panel");

    // Delete events from database if we have a current session
    if (this._currentSessionId) {
      try {
        const deletedCount = deleteEventsForSession(
          this._workspaceRoot,
          this._currentSessionId,
        );
        logger.info(
          `[AgentPanelProvider] Deleted ${deletedCount} events for session ${this._currentSessionId}`,
        );
      } catch (error) {
        logger.error(
          "[AgentPanelProvider] Failed to delete session events",
          error,
        );
      }
    }

    // Clear internal tracking
    this._currentSessionId = null;

    // Notify webview to clear its state
    this.postMessage({ type: "clear" });

    logger.info("[AgentPanelProvider] Agent panel cleared");
  }

  /**
   * Poll for new events and send to webview
   */
  private _pollForEvents(): void {
    if (!this._view) {
      logger.info(
        "[AgentPanelProvider] _pollForEvents called but view not initialized",
      );
      return;
    }

    try {
      // Get current active session from AgentRunner
      const runner = getAgentRunner();
      const session = runner.getSession();

      logger.info(
        `[AgentPanelProvider] Polling for events. Session: ${session ? session.id : "none"}, Status: ${session ? session.status : "n/a"}`,
      );

      if (!session) {
        // No active session
        if (this._currentSessionId !== null) {
          // Session ended, send session_end message
          logger.debug("[AgentPanelProvider] Session ended");
          this._currentSessionId = null;
        }
        return;
      }

      // Check if this is a new session
      if (this._currentSessionId !== session.id) {
        logger.info(`[AgentPanelProvider] New session detected: ${session.id}`);
        this._currentSessionId = session.id;

        // Send full session data for new session
        const events = getEventsForSession(this._workspaceRoot, session.id);
        logger.info(
          `[AgentPanelProvider] Sending session_update with ${events.length} events`,
        );
        // Convert class to interface format
        const sessionData = sessionClassToInterface(
          this._workspaceRoot,
          session,
        );
        this.postMessage({
          type: "session_update",
          session: sessionData,
        });
        // Also send events batch
        this.postMessage({
          type: "events_batch",
          sessionId: session.id,
          events,
        });
      } else {
        // Same session, send incremental events
        const events = getEventsForSession(this._workspaceRoot, session.id);
        logger.info(
          `[AgentPanelProvider] Sending events_batch with ${events.length} events`,
        );
        this.postMessage({
          type: "events_batch",
          sessionId: session.id,
          events,
        });
      }
    } catch (error) {
      logger.error("[AgentPanelProvider] Failed to poll for events", error);
    }
  }

  /**
   * Restore session state when view becomes visible again
   *
   * Unlike _pollForEvents which checks for new sessions, this method
   * always sends the full session state to ensure the webview is in sync.
   */
  private _restoreSessionState(): void {
    if (!this._view) {
      return;
    }

    try {
      // Send current verbosity setting
      this.postMessage({
        type: "set_verbosity",
        level: this._getVerbositySetting(),
      });

      // Get current active session from AgentRunner (for live sessions)
      const runner = getAgentRunner();
      const activeSession = runner.getSession();

      if (activeSession) {
        logger.info(
          `[AgentPanelProvider] Restoring active session: ${activeSession.id}, status: ${activeSession.status}`,
        );

        // Update tracked session ID
        this._currentSessionId = activeSession.id;

        // Send full session data
        const sessionData = sessionClassToInterface(
          this._workspaceRoot,
          activeSession,
        );
        this.postMessage({
          type: "session_update",
          session: sessionData,
        });

        // Send all events for the session
        const events = getEventsForSession(
          this._workspaceRoot,
          activeSession.id,
        );
        logger.info(
          `[AgentPanelProvider] Restoring ${events.length} events for active session`,
        );
        this.postMessage({
          type: "events_batch",
          sessionId: activeSession.id,
          events,
        });
        return;
      }

      // No active session - try to load most recent session from database
      // This handles VS Code reload where in-memory state is lost
      const recentSessions = getRecentSessions(this._workspaceRoot, 1);
      if (recentSessions.length > 0) {
        const dbSession = recentSessions[0];
        logger.info(
          `[AgentPanelProvider] Restoring recent session from DB: ${dbSession.sessionId}, status: ${dbSession.status}`,
        );

        // Update tracked session ID
        this._currentSessionId = dbSession.sessionId;

        // Send session data (already in interface format from DB)
        this.postMessage({
          type: "session_update",
          session: dbSession,
        });

        // Send all events for the session
        const events = getEventsForSession(
          this._workspaceRoot,
          dbSession.sessionId,
        );
        logger.info(
          `[AgentPanelProvider] Restoring ${events.length} events from DB`,
        );
        this.postMessage({
          type: "events_batch",
          sessionId: dbSession.sessionId,
          events,
        });
        return;
      }

      logger.info("[AgentPanelProvider] No session to restore");
    } catch (error) {
      logger.error(
        "[AgentPanelProvider] Failed to restore session state",
        error,
      );
    }
  }

  /**
   * Handle EventBus payloads
   */
  private _handleEventBusPayload(payload: EventBusPayload): void {
    if (!this._view) {
      return;
    }

    switch (payload.type) {
      case "session_start":
        this._currentSessionId = payload.session.id;
        // Convert AgentSessionInfo to full AgentSession interface
        const sessionData = sessionInfoToInterface(
          this._workspaceRoot,
          payload.session,
        );
        this.postMessage({
          type: "session_update",
          session: sessionData,
        });
        break;

      case "session_event":
        if (payload.event.sessionId !== this._currentSessionId) {
          return;
        }
        this.postMessage({
          type: "event",
          event: payload.event,
        });
        break;

      case "session_end":
        // For session end, we need to update the current session's status
        // Get the full session from the runner if available
        const runner = getAgentRunner();
        const currentSession = runner.getSession();
        if (currentSession && currentSession.id === payload.sessionId) {
          const endedSession = sessionClassToInterface(
            this._workspaceRoot,
            currentSession,
          );
          endedSession.status = payload.status;
          endedSession.endedAt = new Date().toISOString();
          this.postMessage({
            type: "session_update",
            session: endedSession,
          });
        } else {
          const storedSession = getSession(
            this._workspaceRoot,
            payload.sessionId,
          );
          if (storedSession) {
            const endedSession = {
              ...storedSession,
              status: payload.status,
              endedAt: new Date().toISOString(),
            };
            this.postMessage({
              type: "session_update",
              session: endedSession,
            });
          }
        }
        break;

      default: {
        const _exhaustive: never = payload;
        logger.warn("Unknown EventBus payload:", _exhaustive);
      }
    }
  }

  /**
   * Handle messages received from the webview
   */
  private _handleMessage(message: WebviewMessage): void {
    switch (message.type) {
      case "ready":
        logger.info(
          "[AgentPanelProvider] Received 'ready' message from webview",
        );
        logger.debug("Agent Panel webview ready");

        // Mark webview as ready
        this._isWebviewReady = true;

        // Initialize webview state - always restore full session state on ready
        // This handles both first-time init and visibility restoration
        const restoreStart = Date.now();
        this._restoreSessionState();
        const restoreTime = Date.now() - restoreStart;
        logger.info(
          `[AgentPanelProvider] Session state restored (${restoreTime}ms)`,
        );

        // Flush any buffered messages that arrived before "ready"
        if (this._pendingMessages.length > 0) {
          logger.info(
            `[AgentPanelProvider] Flushing ${this._pendingMessages.length} buffered messages`,
          );
          for (const msg of this._pendingMessages) {
            void this._view?.webview.postMessage(msg);
          }
          this._pendingMessages = [];
        }
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

      case "pause_agent":
        void this._handlePauseAgent();
        break;

      case "resume_agent":
        void this._handleResumeAgent();
        break;

      case "retry_agent":
        void this._handleRetryAgent();
        break;

      case "continue_session":
        void this._handleContinueSession(message.sessionId);
        break;

      case "switch_session":
        void this._handleSwitchSession(message.sessionId);
        break;

      case "switch_task":
        void this._handleSwitchTask(message.taskId);
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
    filePath: string,
    line?: number,
    endLine?: number,
  ): Promise<void> {
    try {
      // Resolve relative paths against workspace root
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(this._workspaceRoot, filePath);

      const uri = vscode.Uri.file(absolutePath);
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

      const editor = await vscode.window.showTextDocument(document, options);

      // Apply temporary highlight if line positioning was provided
      if (line !== undefined) {
        highlightRange(editor, line, endLine);
      }
    } catch (error) {
      // Use the original filePath parameter in error logging to avoid referencing
      // a variable that may be out of scope if the error occurs before absolutePath
      logger.error(`Failed to open file: ${filePath}`, error);
      void vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
    }
  }

  /**
   * Open diff view for file
   */
  private async _handleOpenDiff(path: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(path);
      await vscode.commands.executeCommand("git.openChange", uri);
    } catch (error) {
      logger.error(`Failed to open diff for: ${path}`, error);
      void vscode.window.showErrorMessage(`Failed to open diff for: ${path}`);
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
      const runner = getAgentRunner();
      const session = runner.getSession();

      if (
        !session ||
        (session.status !== "running" && session.status !== "paused")
      ) {
        void vscode.window.showWarningMessage("No agent is currently running");
        return;
      }

      // Store session info before stopping (stop() may clear it)
      const _sessionId = session.id;

      await runner.stop();

      // Immediately update webview with stopped status
      // (EventBus path may not work if session is cleared)
      const stoppedSession = sessionClassToInterface(
        this._workspaceRoot,
        session,
      );
      stoppedSession.status = "cancelled";
      stoppedSession.endedAt = new Date().toISOString();
      this.postMessage({
        type: "session_update",
        session: stoppedSession,
      });

      void vscode.window.showInformationMessage("Agent stopped successfully");
    } catch (error) {
      logger.error("Failed to stop agent", error);
      void vscode.window.showErrorMessage(
        `Failed to stop agent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Pause currently running agent
   */
  private async _handlePauseAgent(): Promise<void> {
    try {
      logger.info("Pause agent requested");
      const runner = getAgentRunner();
      const session = runner.getSession();

      if (!session || session.status !== "running") {
        void vscode.window.showWarningMessage("No agent is currently running");
        return;
      }

      await runner.pause();

      // Update webview with paused status
      const pausedSession = sessionClassToInterface(
        this._workspaceRoot,
        session,
      );
      pausedSession.status = "paused";
      this.postMessage({
        type: "session_update",
        session: pausedSession,
      });
    } catch (error) {
      logger.error("Failed to pause agent", error);
      void vscode.window.showErrorMessage(
        `Failed to pause agent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Resume a paused agent
   */
  private async _handleResumeAgent(): Promise<void> {
    try {
      logger.info("Resume agent requested");
      const runner = getAgentRunner();
      const session = runner.getSession();

      // Case 1: Active in-memory session that is paused
      if (session && session.status === "paused") {
        await runner.resume();

        // Update webview with running status
        const resumedSession = sessionClassToInterface(
          this._workspaceRoot,
          session,
        );
        resumedSession.status = "running";
        this.postMessage({
          type: "session_update",
          session: resumedSession,
        });
        return;
      }

      // Case 2: No in-memory session, but we have a displayed session ID
      // This happens after VS Code restart when session is only in database
      if (!session && this._currentSessionId) {
        await runner.resumeFromDatabase(this._currentSessionId);
        void vscode.window.showInformationMessage(
          "Orchestra: Session resumed from database",
        );
        return;
      }

      // No session to resume
      void vscode.window.showWarningMessage("No paused agent to resume");
    } catch (error) {
      logger.error("Failed to resume agent", error);
      void vscode.window.showErrorMessage(
        `Failed to resume agent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Retry a failed/completed/cancelled agent session.
   *
   * Re-enters the agent loop using the existing conversation history,
   * injecting a user message if the conversation ends with an assistant turn
   * (required by the LLM API).
   */
  private async _handleRetryAgent(): Promise<void> {
    try {
      logger.info("Retry agent requested");
      const runner = getAgentRunner();
      const session = runner.getSession();

      if (!session) {
        void vscode.window.showWarningMessage("No agent session to retry");
        return;
      }

      const retryableStatuses = new Set([
        "failed",
        "completed",
        "stopped",
        "cancelled",
      ]);
      if (!retryableStatuses.has(session.status)) {
        void vscode.window.showWarningMessage(
          `Cannot retry agent in '${session.status}' state. Only failed, completed, or cancelled sessions can be retried.`,
        );
        return;
      }

      await runner.retry();

      // Update webview with running status
      const retriedSession = sessionClassToInterface(
        this._workspaceRoot,
        session,
      );
      retriedSession.status = "running";
      this.postMessage({
        type: "session_update",
        session: retriedSession,
      });
    } catch (error) {
      logger.error("Failed to retry agent", error);
      void vscode.window.showErrorMessage(
        `Failed to retry agent: ${error instanceof Error ? error.message : String(error)}`,
      );
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

      // Get workspace root from current workspace folders
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        logger.error("No workspace folder found");
        void vscode.window.showErrorMessage("No workspace folder found");
        return;
      }
      const workspaceRoot = workspaceFolders[0].uri.fsPath;

      // Fetch session from database
      const session = getSession(workspaceRoot, sessionId);
      if (!session) {
        logger.error(`Session not found: ${sessionId}`);
        void vscode.window.showErrorMessage(`Session not found: ${sessionId}`);
        return;
      }

      // Fetch all events for this session
      const events = getEventsForSession(workspaceRoot, sessionId);

      // Post load_session message to webview
      this.postMessage({
        type: "load_session",
        sessionId,
        events,
      });

      // Post session_update message to update the session header
      this.postMessage({
        type: "session_update",
        session,
      });

      logger.info(`Loaded session ${sessionId} with ${events.length} events`);
    } catch (error) {
      logger.error(`Failed to switch session: ${sessionId}`, error);
      void vscode.window.showErrorMessage(
        `Failed to switch session: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Handle switch_task message - fetches sessions for a task and loads the most recent one
   */
  private async _handleSwitchTask(taskId: number): Promise<void> {
    try {
      logger.info(`Switch task requested: ${taskId}`);

      // Get workspace root from current workspace folders
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        logger.error("No workspace folder found");
        void vscode.window.showErrorMessage("No workspace folder found");
        return;
      }
      const workspaceRoot = workspaceFolders[0].uri.fsPath;

      // Fetch sessions for this task
      const sessions = getSessionsForTask(workspaceRoot, taskId);

      // Send session list to webview
      this.postMessage({
        type: "session_list",
        sessions,
      });

      // If there are sessions, load the most recent one
      if (sessions.length > 0) {
        const mostRecentSession = sessions[0];
        const events = getEventsForSession(
          workspaceRoot,
          mostRecentSession.sessionId,
        );

        // Post load_session message to webview
        this.postMessage({
          type: "load_session",
          sessionId: mostRecentSession.sessionId,
          events,
        });

        // Post session_update message to update the session header
        this.postMessage({
          type: "session_update",
          session: mostRecentSession,
        });

        logger.info(
          `Loaded most recent session for task ${taskId}: ${mostRecentSession.sessionId} with ${events.length} events`,
        );
      } else {
        // No sessions for this task - clear the view
        this.postMessage({ type: "clear" });
        logger.info(`No sessions found for task ${taskId}`);
      }
    } catch (error) {
      logger.error(`Failed to switch task: ${taskId}`, error);
      void vscode.window.showErrorMessage(
        `Failed to switch task: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Export session to JSON
   */
  private async _handleExportSession(sessionId: string): Promise<void> {
    try {
      logger.info(`Export session requested: ${sessionId}`);

      // Get workspace root from current workspace folders
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        void vscode.window.showErrorMessage("No workspace folder open");
        return;
      }
      const workspaceRoot = workspaceFolders[0].uri.fsPath;

      // Export session data
      const exportData = exportSession(workspaceRoot, sessionId);

      // Generate filename with timestamp (sanitize: remove colons and dots)
      const isoTimestamp = new Date().toISOString(); // e.g., "2026-02-01T14:35:42.123Z"
      const sanitized = isoTimestamp
        .replace(/:/g, "") // Remove colons from time
        .replace(/\./g, ""); // Remove millisecond separator and keep trailing Z
      const defaultFilename = `session-${sessionId}-${sanitized}.json`;

      // Show save dialog
      const saveUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultFilename),
        filters: {
          JSON: ["json"],
        },
        title: "Export Session",
      });

      if (!saveUri) {
        // User cancelled the save dialog
        logger.debug("Export cancelled by user");
        return;
      }

      // Write JSON to file with 2-space indentation
      const jsonContent = JSON.stringify(exportData, null, 2);
      await vscode.workspace.fs.writeFile(
        saveUri,
        Buffer.from(jsonContent, "utf-8"),
      );

      void vscode.window.showInformationMessage(
        `Session exported to ${saveUri.fsPath}`,
      );
      logger.info(`Session ${sessionId} exported to ${saveUri.fsPath}`);
    } catch (error) {
      logger.error(`Failed to export session: ${sessionId}`, error);
      void vscode.window.showErrorMessage(
        `Failed to export session: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Set verbosity level
   */
  private async _handleSetVerbosity(level: VerbosityLevel): Promise<void> {
    try {
      logger.debug(`Set verbosity requested: ${level}`);
      // Update global configuration
      await vscode.workspace
        .getConfiguration("orchestra")
        .update(
          "agentPanel.verbosity",
          level,
          vscode.ConfigurationTarget.Global,
        );

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
      const runner = getAgentRunner();
      const session = runner.getSession();

      if (!session) {
        void vscode.window.showWarningMessage(
          "Cannot send message: no agent session exists",
        );
        return;
      }

      if (session.status === "failed") {
        void vscode.window.showWarningMessage(
          "Cannot continue a failed session. Please start a new session.",
        );
        return;
      }

      // Use continueWithMessage for both running and stopped sessions
      // It internally handles the logic:
      // - If running: uses redirect() to inject the message
      // - If paused/completed/etc: resumes the session with the new message
      await runner.continueWithMessage(text);
      logger.debug("User message sent to agent successfully");
    } catch (error) {
      logger.error("Failed to handle user message", error);
      void vscode.window.showErrorMessage(
        `Failed to send message to agent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get current verbosity setting with fallback
   */
  private _getVerbositySetting(): VerbosityLevel {
    const config = vscode.workspace.getConfiguration("orchestra");
    const level = config.get<VerbosityLevel>("agentPanel.verbosity");

    if (
      level === "minimal" ||
      level === "normal" ||
      level === "verbose" ||
      level === "debug"
    ) {
      return level;
    }

    return "normal";
  }

  /**
   * Generate HTML content for the webview
   */
  private _getHtmlContent(webview: vscode.Webview): string {
    const cspSource = webview.cspSource;

    // Read the bundled SolidJS webview script directly from disk
    // This avoids the VS Code resource proxy (file+.vscode-resource.vscode-cdn.net)
    // which can take 60+ seconds to serve the file, blocking all rendering.
    const scriptPath = vscode.Uri.joinPath(
      this._extensionUri,
      "dist",
      "webviews",
      "agent-panel",
      "index.js",
    ).fsPath;

    let scriptContent: string;
    try {
      scriptContent = fs.readFileSync(scriptPath, "utf-8");
      // Escape </script> tags in the content to prevent breaking the inline script block
      scriptContent = scriptContent.replace(/<\/script>/gi, "<\\/script>");
      logger.info(
        `[AgentPanel] Loaded inline script (${(scriptContent.length / 1024).toFixed(1)} KB)`,
      );
    } catch (err) {
      logger.error(`[AgentPanel] Failed to read script from disk: ${err}`);
      // Fallback to external script URI if disk read fails
      const fallbackUri = webview.asWebviewUri(
        vscode.Uri.joinPath(
          this._extensionUri,
          "dist",
          "webviews",
          "agent-panel",
          "index.js",
        ),
      );
      scriptContent = "";
      return this._getFallbackHtml(cspSource, fallbackUri.toString());
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    #root { width: 100%; height: 100%; padding-left: 5px; padding-right: 5px; box-sizing: border-box; }
    .loading-container { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 12px; }
    .loading-spinner { width: 24px; height: 24px; border: 2px solid rgba(255,255,255,0.1); border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading-text { color: #71717a; font-size: 12px; font-family: system-ui, -apple-system, sans-serif; }
    .error-container { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 12px; padding: 20px; }
    .error-text { color: #ef4444; font-size: 12px; font-family: system-ui, -apple-system, sans-serif; text-align: center; }
    .error-detail { color: #71717a; font-size: 11px; font-family: monospace; margin-top: 8px; white-space: pre-wrap; max-height: 200px; overflow-y: auto; }
  </style>
  <title>Agent Panel</title>
</head>
<body>
  <div id="root">
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <div class="loading-text">Loading agent panel...</div>
    </div>
  </div>
  <script>
    // Track load status for diagnostics
    window.agentPanelLoadStatus = 'initializing';
    window.agentPanelErrors = [];
    
    // Capture console errors
    var originalError = console.error;
    console.error = function() {
      window.agentPanelErrors.push(Array.prototype.join.call(arguments, ' '));
      originalError.apply(console, arguments);
    };
    
    // Show error if JavaScript doesn't load within 10 seconds
    var loadTimeout = setTimeout(function() {
      if (window.agentPanelLoadStatus !== 'loaded') {
        var root = document.getElementById('root');
        var errors = window.agentPanelErrors.length > 0 
          ? window.agentPanelErrors.slice(-5).join('\\n')
          : 'No errors logged';
        if (root) {
          root.innerHTML = '<div class="error-container"><div class="error-text">Failed to load Agent Panel</div><div class="error-detail">Status: ' + window.agentPanelLoadStatus + '\\n\\nErrors:\\n' + errors + '</div></div>';
        }
      }
    }, 10000);
    
    console.log('[AgentPanel] Preload script ready');
  </script>
  <script>${scriptContent}</script>
  <script>
    window.agentPanelLoadStatus = 'loaded';
    clearTimeout(loadTimeout);
    console.log('[AgentPanel] Main script loaded successfully');
  </script>
</body>
</html>`;
  }

  /**
   * Generate fallback HTML that uses external script URI (if disk read fails)
   */
  private _getFallbackHtml(cspSource: string, scriptUri: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline';">
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    #root { width: 100%; height: 100%; padding-left: 5px; padding-right: 5px; box-sizing: border-box; }
    .loading-container { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 12px; }
    .loading-spinner { width: 24px; height: 24px; border: 2px solid rgba(255,255,255,0.1); border-top-color: #3b82f6; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loading-text { color: #71717a; font-size: 12px; font-family: system-ui, -apple-system, sans-serif; }
  </style>
  <title>Agent Panel</title>
</head>
<body>
  <div id="root">
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <div class="loading-text">Loading agent panel...</div>
    </div>
  </div>
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
