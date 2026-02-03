/**
 * WorkflowChain - Automatic Agent Workflow Chaining
 *
 * Listens for agent session completion events and automatically
 * invokes the next agent in the Orchestra workflow:
 *
 * prepare_task (Orchestrator) → verify_handover (Controller) → implement (Implementor)
 *                                                             → verify_task (Orchestrator)
 *                                                             → code_review (Controller)
 *
 * This is the core automation that makes Orchestra self-driving.
 */

import * as vscode from "vscode";
import { handlePlayTask } from "../commands/PlayTaskHandler.js";
import {
  getLatestCodeReviewForTask,
  getNextPendingTask,
  getTaskById,
} from "../database/queries.js";
import { getAgentRunner } from "../extension.js";
import { OrchestraLogger } from "../utils/logger.js";
import { getAgentEventBus } from "./sessions/eventBus.js";
import type { AgentRole, EventBusPayload } from "./sessions/types.js";

const logger = new OrchestraLogger();

/**
 * Tracking data for a session's starting state
 */
interface SessionStartInfo {
  role: AgentRole;
  taskId: number;
  startingStatus: string;
  retryCount: number;
}

/**
 * WorkflowChain manages automatic transitions between agent roles.
 *
 * When an agent completes successfully, it checks if the next step
 * in the workflow should be automatically triggered.
 */
export class WorkflowChain implements vscode.Disposable {
  private readonly workspaceRoot: string;
  private subscription: vscode.Disposable | undefined;
  private isEnabled: boolean = true;

  /**
   * Track session starting states to detect "lost" agents that complete
   * without advancing task status. Key is sessionId.
   */
  private sessionStartStates: Map<string, SessionStartInfo> = new Map();

  /**
   * Pending retry counts for tasks that are about to be retried.
   * Used to pass retry count to the next session. Key is taskId.
   */
  private pendingRetryCount: Map<number, number> = new Map();

  /**
   * Maximum number of times to retry when an agent completes without
   * advancing task status before giving up and notifying the user.
   */
  private static readonly MAX_LOST_AGENT_RETRIES = 2;

  /**
   * Create a new WorkflowChain instance
   *
   * @param workspaceRoot Workspace root directory
   */
  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Start listening for session completion events
   */
  start(): void {
    if (this.subscription) {
      return; // Already started
    }

    const eventBus = getAgentEventBus();
    this.subscription = eventBus.onEvent(this.handleEvent.bind(this));
    logger.info("[WorkflowChain] Started - listening for session completions");
  }

  /**
   * Stop listening for events
   */
  stop(): void {
    this.subscription?.dispose();
    this.subscription = undefined;
    logger.info("[WorkflowChain] Stopped");
  }

  /**
   * Enable or disable automatic workflow chaining
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    logger.info(`[WorkflowChain] ${enabled ? "Enabled" : "Disabled"}`);
  }

  /**
   * Handle incoming event bus payloads
   */
  private async handleEvent(payload: EventBusPayload): Promise<void> {
    // Handle session_start: record the starting task status
    if (payload.type === "session_start") {
      await this.handleSessionStart(payload.session);
      return;
    }

    if (payload.type !== "session_end") {
      return;
    }

    if (payload.status !== "completed") {
      logger.info(
        `[WorkflowChain] Session ended with status ${payload.status}, no chaining`,
      );
      // Clean up tracking data for non-completed sessions
      this.sessionStartStates.delete(payload.sessionId);
      return;
    }

    if (!this.isEnabled) {
      logger.info("[WorkflowChain] Chaining disabled, skipping");
      this.sessionStartStates.delete(payload.sessionId);
      return;
    }

    // Get the session that just completed
    const runner = getAgentRunner();
    const session = runner.getSession();

    if (!session) {
      logger.warn("[WorkflowChain] No session found after completion");
      this.sessionStartStates.delete(payload.sessionId);
      return;
    }

    logger.info(
      `[WorkflowChain] Session completed: role=${session.role}, taskId=${session.taskId}`,
    );

    // Route based on the role that just completed
    await this.handleCompletedSession(
      session.role,
      session.taskId,
      payload.sessionId,
    );
  }

  /**
   * Handle session start: record initial task status for "lost agent" detection
   */
  private async handleSessionStart(session: {
    id: string;
    role: AgentRole;
    taskId?: number;
  }): Promise<void> {
    if (!session.taskId) {
      logger.debug(
        "[WorkflowChain] Session started without taskId, not tracking",
      );
      return;
    }

    // Get current task status
    const task = getTaskById(this.workspaceRoot, session.taskId);
    if (!task) {
      logger.warn(
        `[WorkflowChain] Task ${session.taskId} not found for tracking`,
      );
      return;
    }

    // Check if there's a pending retry count from a lost agent retry
    const pendingRetry = this.pendingRetryCount.get(session.taskId);
    const retryCount = pendingRetry ?? 0;

    this.sessionStartStates.set(session.id, {
      role: session.role,
      taskId: session.taskId,
      startingStatus: task.status,
      retryCount,
    });

    logger.info(
      `[WorkflowChain] Tracking session ${session.id}: task ${session.taskId} starting at status ${task.status} (retry: ${retryCount})`,
    );
  }

  /**
   * Handle a completed session and determine next action
   */
  private async handleCompletedSession(
    role: "orchestrator" | "implementor" | "controller",
    taskId: number | null,
    sessionId: string,
  ): Promise<void> {
    // Retrieve and clean up session tracking
    const startInfo = this.sessionStartStates.get(sessionId);
    this.sessionStartStates.delete(sessionId);

    if (!taskId) {
      logger.info("[WorkflowChain] No task ID, cannot chain");
      return;
    }

    // Get current task status from database
    const task = getTaskById(this.workspaceRoot, taskId);
    if (!task) {
      logger.warn(`[WorkflowChain] Task ${taskId} not found`);
      return;
    }

    logger.info(
      `[WorkflowChain] Task ${taskId} status: ${task.status} (completed by ${role})`,
    );

    // Check for "lost agent" - session completed but task status unchanged
    if (startInfo && task.status === startInfo.startingStatus) {
      await this.handleLostAgent(taskId, task.status, role, startInfo);
      return;
    }

    // Check for pending code review (task might be COMPLETE but review pending)
    const codeReview = getLatestCodeReviewForTask(this.workspaceRoot, taskId);
    const hasPendingCodeReview =
      codeReview !== null && codeReview.status === "PENDING";
    const hasPendingVerification =
      codeReview !== null && codeReview.status === "PENDING_VERIFICATION";

    // Determine next action based on role and task status
    const nextAction = this.determineNextAction(
      role,
      task.status,
      hasPendingCodeReview,
      hasPendingVerification,
    );

    if (!nextAction) {
      // No next action for current task - check if task is complete and there's a next task
      if (task.status === "COMPLETE" && !hasPendingCodeReview) {
        await this.handleTaskCompleteCheckNext(taskId);
      } else {
        logger.info("[WorkflowChain] No next action for this state");
      }
      return;
    }

    logger.info(
      `[WorkflowChain] Chaining to next action: ${nextAction.description}`,
    );

    // Small delay to allow UI to update and user to see completion
    await this.delay(1500);

    // Show notification about automatic chaining
    vscode.window.showInformationMessage(
      `Orchestra: ${nextAction.description}`,
    );

    // Invoke the next agent via PlayTaskHandler
    try {
      await handlePlayTask(this.workspaceRoot, taskId);
      logger.info(
        `[WorkflowChain] Successfully invoked next agent for task ${taskId}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`[WorkflowChain] Failed to invoke next agent: ${message}`);
      vscode.window.showErrorMessage(
        `Orchestra: Failed to continue workflow - ${message}`,
      );
    }
  }

  /**
   * Handle when a task is complete - check for next pending task
   */
  private async handleTaskCompleteCheckNext(
    completedTaskId: number,
  ): Promise<void> {
    logger.info(
      `[WorkflowChain] Task ${completedTaskId} is complete, checking for next task...`,
    );

    // Get the next pending task
    const nextTask = getNextPendingTask(this.workspaceRoot);

    if (!nextTask) {
      logger.info(
        "[WorkflowChain] No more pending tasks - sprint may be complete!",
      );
      vscode.window.showInformationMessage(
        `Orchestra: Task ${completedTaskId} complete! No more pending tasks in sprint.`,
      );
      return;
    }

    logger.info(
      `[WorkflowChain] Next task found: ${nextTask.task_id} - ${nextTask.title}`,
    );

    // Small delay to allow UI to update
    await this.delay(1500);

    // Show notification about moving to next task
    vscode.window.showInformationMessage(
      `Orchestra: Task ${completedTaskId} complete! Moving to Task ${nextTask.task_id}: ${nextTask.title}...`,
    );

    // Invoke the next task
    try {
      await handlePlayTask(this.workspaceRoot, nextTask.task_id);
      logger.info(
        `[WorkflowChain] Successfully invoked next task ${nextTask.task_id}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`[WorkflowChain] Failed to invoke next task: ${message}`);
      vscode.window.showErrorMessage(
        `Orchestra: Failed to start next task - ${message}`,
      );
    }
  }

  /**
   * Determine the next action based on completed role and current task status
   *
   * Returns null if no automatic chaining should occur.
   */
  private determineNextAction(
    completedRole: "orchestrator" | "implementor" | "controller",
    taskStatus: string,
    hasPendingCodeReview: boolean = false,
    hasPendingVerification: boolean = false,
  ): { description: string } | null {
    // Orchestrator completed prepare_task → Controller reviews handover
    if (
      completedRole === "orchestrator" &&
      taskStatus === "PENDING_HANDOVER_REVIEW"
    ) {
      return {
        description: "Handover ready - invoking Controller for review...",
      };
    }

    // Controller rejected handover → Orchestrator fixes handover
    if (
      completedRole === "controller" &&
      taskStatus === "HANDOVER_REVIEW_FAILED"
    ) {
      return {
        description:
          "Handover rejected - invoking Orchestrator to fix issues...",
      };
    }

    // Controller approved handover → Implementor implements
    if (completedRole === "controller" && taskStatus === "IMPLEMENT") {
      return {
        description: "Handover approved - invoking Implementor...",
      };
    }

    // Implementor completed → Orchestrator verifies
    // Task goes to GATE_CHECK after signal_completion, then may transition to VERIFY
    if (
      completedRole === "implementor" &&
      (taskStatus === "VERIFY" || taskStatus === "GATE_CHECK")
    ) {
      return {
        description:
          "Implementation complete - invoking Orchestrator for verification...",
      };
    }

    // Orchestrator verified → Controller code review
    // Task might be VERIFIED or COMPLETE with pending code review
    if (
      completedRole === "orchestrator" &&
      (taskStatus === "VERIFIED" ||
        (taskStatus === "COMPLETE" && hasPendingCodeReview))
    ) {
      return {
        description:
          "Verification passed - invoking Controller for code review...",
      };
    }

    // Controller approved code review → Task complete, check for next task
    if (
      completedRole === "controller" &&
      taskStatus === "COMPLETE" &&
      !hasPendingCodeReview
    ) {
      // Return null here - we'll handle next task lookup separately
      return null;
    }

    // Implementor submitted code review fixes → Controller re-reviews
    if (
      completedRole === "implementor" &&
      taskStatus === "CODE_REVIEW_CHANGES_REQUESTED" &&
      hasPendingVerification
    ) {
      return {
        description:
          "Code review fixes submitted - invoking Controller for re-review...",
      };
    }

    // Controller requested changes on code review → Implementor fixes
    if (
      completedRole === "controller" &&
      taskStatus === "CODE_REVIEW_CHANGES_REQUESTED"
    ) {
      return {
        description:
          "Code review requested changes - invoking Implementor to fix issues...",
      };
    }

    // No automatic chaining for other states
    return null;
  }

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Handle a "lost" agent that completed without advancing task status.
   *
   * This can happen when the agent forgets to call the appropriate tool
   * (signal_completion, prepare_task, etc.) or gets sidetracked.
   *
   * We'll retry up to MAX_LOST_AGENT_RETRIES times before giving up.
   */
  private async handleLostAgent(
    taskId: number,
    currentStatus: string,
    role: AgentRole,
    startInfo: SessionStartInfo,
  ): Promise<void> {
    const retryCount = startInfo.retryCount + 1;

    logger.warn(
      `[WorkflowChain] Lost agent detected: ${role} completed but task ${taskId} still at ${currentStatus} (attempt ${retryCount}/${WorkflowChain.MAX_LOST_AGENT_RETRIES})`,
    );

    if (retryCount >= WorkflowChain.MAX_LOST_AGENT_RETRIES) {
      // Give up after max retries - notify user
      logger.error(
        `[WorkflowChain] Agent repeatedly failed to advance task after ${retryCount} attempts`,
      );
      vscode.window
        .showWarningMessage(
          `Orchestra: Agent completed without advancing the task after ${retryCount} attempts. ` +
            `Task ${taskId} is still in ${currentStatus} status. Please review manually.`,
          "Retry",
          "Dismiss",
        )
        .then((selection) => {
          if (selection === "Retry") {
            // Reset retry count and try again
            this.retryLostAgent(taskId, currentStatus, role, 0);
          }
        });
      return;
    }

    // Show notification and auto-retry
    vscode.window.showInformationMessage(
      `Orchestra: Agent completed but task didn't advance. Continuing automatically... (attempt ${retryCount})`,
    );

    await this.retryLostAgent(taskId, currentStatus, role, retryCount);
  }

  /**
   * Retry a lost agent by re-invoking the task handler
   */
  private async retryLostAgent(
    taskId: number,
    _currentStatus: string,
    _role: AgentRole,
    retryCount: number,
  ): Promise<void> {
    // Small delay before retry
    await this.delay(2000);

    try {
      // Pre-populate retry count for the next session
      // We need to track this for when the session starts
      this.pendingRetryCount.set(taskId, retryCount);

      await handlePlayTask(this.workspaceRoot, taskId);
      logger.info(
        `[WorkflowChain] Re-invoked agent for task ${taskId} (retry ${retryCount})`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(`[WorkflowChain] Failed to retry lost agent: ${message}`);
      vscode.window.showErrorMessage(
        `Orchestra: Failed to continue - ${message}`,
      );
    } finally {
      // Clean up pending retry count after a delay to ensure session picks it up
      setTimeout(() => {
        this.pendingRetryCount.delete(taskId);
      }, 5000);
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.stop();
  }
}

// Singleton instance
let workflowChainInstance: WorkflowChain | undefined;

/**
 * Get or create the WorkflowChain singleton
 */
export function getWorkflowChain(workspaceRoot: string): WorkflowChain {
  if (!workflowChainInstance) {
    workflowChainInstance = new WorkflowChain(workspaceRoot);
  }
  return workflowChainInstance;
}

/**
 * Dispose the WorkflowChain singleton
 */
export function disposeWorkflowChain(): void {
  workflowChainInstance?.dispose();
  workflowChainInstance = undefined;
}
