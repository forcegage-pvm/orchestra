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
  getTaskById,
} from "../database/queries.js";
import { getAgentRunner } from "../extension.js";
import { OrchestraLogger } from "../utils/logger.js";
import { getAgentEventBus } from "./sessions/eventBus.js";
import type { EventBusPayload } from "./sessions/types.js";

const logger = new OrchestraLogger();

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
    if (payload.type !== "session_end") {
      return;
    }

    if (payload.status !== "completed") {
      logger.info(
        `[WorkflowChain] Session ended with status ${payload.status}, no chaining`,
      );
      return;
    }

    if (!this.isEnabled) {
      logger.info("[WorkflowChain] Chaining disabled, skipping");
      return;
    }

    // Get the session that just completed
    const runner = getAgentRunner();
    const session = runner.getSession();

    if (!session) {
      logger.warn("[WorkflowChain] No session found after completion");
      return;
    }

    logger.info(
      `[WorkflowChain] Session completed: role=${session.role}, taskId=${session.taskId}`,
    );

    // Route based on the role that just completed
    await this.handleCompletedSession(session.role, session.taskId);
  }

  /**
   * Handle a completed session and determine next action
   */
  private async handleCompletedSession(
    role: "orchestrator" | "implementor" | "controller",
    taskId: number | null,
  ): Promise<void> {
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

    // Check for pending code review (task might be COMPLETE but review pending)
    const codeReview = getLatestCodeReviewForTask(this.workspaceRoot, taskId);
    const hasPendingCodeReview =
      codeReview !== null && codeReview.status === "PENDING";

    // Determine next action based on role and task status
    const nextAction = this.determineNextAction(
      role,
      task.status,
      hasPendingCodeReview,
    );

    if (!nextAction) {
      logger.info("[WorkflowChain] No next action for this state");
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
   * Determine the next action based on completed role and current task status
   *
   * Returns null if no automatic chaining should occur.
   */
  private determineNextAction(
    completedRole: "orchestrator" | "implementor" | "controller",
    taskStatus: string,
    hasPendingCodeReview: boolean = false,
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

    // Controller approved code review → Task complete (no pending review)
    if (
      completedRole === "controller" &&
      taskStatus === "COMPLETE" &&
      !hasPendingCodeReview
    ) {
      return {
        description: "Code review approved - task complete!",
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
