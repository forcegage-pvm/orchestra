/**
 * Orchestra Next Service
 *
 * Aligned with Orchestra Bible v0.7.0
 * Provides workflow guidance based on current state.
 * Read-only: Does not modify any state.
 */

import type { WorkflowStep } from "./types.js";
import { detectWorkflowState, type WorkflowState } from "./workflow-state.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Guidance for what to do next
 */
export interface StepGuidance {
  /** The recommended action */
  action: string;
  /** CLI command to run (if applicable) */
  command?: string;
  /** Detailed explanation */
  explanation: string;
  /** Additional context or tips */
  tips?: string[];
}

/**
 * Options for the next operation
 */
export interface NextOptions {
  /** Output JSON format (for CLI) */
  json?: boolean;
  /** Verbose output with detailed state info */
  verbose?: boolean;
  /** Override the detected root */
  cwd?: string;
}

/**
 * Result of next operation
 */
export interface NextResult {
  /** Current workflow step */
  currentStep: WorkflowStep;
  /** Guidance for what to do next */
  guidance: StepGuidance;
  /** Current task context (if applicable) */
  task?: {
    id: number;
    title: string;
    status: string;
  };
  /** Sprint context */
  sprint?: {
    id: string;
    status: string;
  };
  /** Full workflow state (for verbose/debug) */
  state?: WorkflowState;
}

// =============================================================================
// Step Guidance Registry
// =============================================================================

/**
 * Get guidance for a workflow step
 */
function getGuidanceForStep(
  step: WorkflowStep,
  state: WorkflowState,
): StepGuidance {
  switch (step) {
    case "INIT":
      return {
        action: "Initialize Orchestra",
        command: "orchestra init",
        explanation:
          "Orchestra is not initialized in this directory. Run init to create the .orchestra folder structure.",
        tips: [
          "Use --sprint-id to set a custom sprint identifier",
          "This creates the folder structure and manifest.yaml",
        ],
      };

    case "CONFIGURE":
      return {
        action: "Configure Orchestra",
        explanation:
          "Orchestra is initialized but configuration is incomplete. Edit orchestra.yaml to set up your workflow.",
        tips: [
          "Set roles.implementor and roles.orchestrator",
          "Configure verification settings",
          "Define any custom templates",
        ],
      };

    case "SPEC_REVIEW":
      return {
        action: "Await sprint specification review",
        explanation:
          "The sprint configuration is awaiting Controller review. Wait for approval or address review feedback if rejected.",
        tips: [
          "If rejected, update the sprint configuration and resubmit",
          "Use the Controller review feedback to align with the spec",
        ],
      };

    case "SELECT_TASK":
      return {
        action: "Select a task to work on",
        command: "orchestra prepare",
        explanation:
          "No task is currently in progress. Run prepare to select and prepare the next available task.",
        tips: [
          "Use --task <id> to prepare a specific task",
          "Tasks are prepared in dependency order by default",
        ],
      };

    case "PREPARE":
      return {
        action: "Prepare task handover",
        command: `orchestra prepare${
          state.currentTaskId ? ` --task ${state.currentTaskId}` : ""
        }`,
        explanation:
          "Current task needs handover preparation. Generate the handover document for the implementor.",
        tips: [
          "Handover will be created in .orchestra/implementor/handovers/",
          "Include clear acceptance criteria",
        ],
      };

    case "HANDOVER_REVIEW":
      return {
        action: "Await handover review",
        explanation:
          "The task handover is awaiting Controller review. Address feedback if it is rejected and resubmit.",
        tips: [
          "Revise acceptance criteria to match the spec",
          "Resubmit the handover after corrections",
        ],
      };

    case "IMPLEMENT":
      return {
        action: "Implement the task",
        explanation: state.currentTask
          ? `Work on task ${state.currentTaskId}: ${state.currentTask.title}. Follow the handover instructions.`
          : "Implement the current task following the handover instructions.",
        tips: [
          "Read the handover document carefully",
          "Signal completion when ready: orchestra complete --signal",
          "Use orchestra status to check progress",
        ],
      };

    case "SIGNAL":
      return {
        action: "Signal task completion",
        command: "orchestra complete --signal",
        explanation:
          "Implementation is complete. Signal that you're ready for verification.",
        tips: [
          "Review your changes before signaling",
          "The signal includes a summary of what was done",
        ],
      };

    case "CODE_REVIEW":
      return {
        action: "Await code review decision",
        explanation:
          "Code review is in progress. Wait for Controller approval or address requested changes.",
        tips: [
          "If changes are requested, address issues and resubmit",
          "Check review history for decision context",
        ],
      };

    case "VERIFY":
      return {
        action: "Verify task completion",
        command: `orchestra verify${
          state.currentTaskId ? ` --task ${state.currentTaskId}` : ""
        }`,
        explanation:
          "Implementor has signaled completion. Verify the work against acceptance criteria.",
        tips: [
          "Check both automated and manual verification criteria",
          "Use --auto for automated checks only",
          "Mark verification result with --pass or --fail",
        ],
      };

    case "COMPLETE":
      return {
        action: "Complete the task",
        command: `orchestra complete${
          state.currentTaskId ? ` --task ${state.currentTaskId}` : ""
        }`,
        explanation:
          "Verification passed. Complete the task to finalize and move to the next one.",
        tips: [
          "This updates the manifest and progress",
          "The next task will be automatically identified",
        ],
      };

    case "RETRY":
      return {
        action: "Address verification feedback and retry",
        explanation: state.feedbackExists
          ? "Verification failed. Review feedback at .orchestra/handover/feedback.md and make corrections."
          : "Verification failed. Check the verification report for what needs to be fixed.",
        tips: [
          `Current retry attempt: ${state.retryCount + 1}/${state.maxRetries}`,
          state.feedbackExists
            ? "Read feedback.md for specific issues to address"
            : "Run 'orchestra feedback' to generate feedback from last verification",
          "Run 'orchestra pre-signal-check' before signaling again",
        ],
      };

    case "ESCALATED":
      return {
        action: "Handle escalated task",
        explanation:
          "This task has been escalated and requires human intervention.",
        tips: [
          "Review the escalation reason in the manifest",
          "Use orchestra escalate --resolve to mark as resolved",
          "Consider if the task scope needs adjustment",
        ],
      };

    case "SPRINT_COMPLETE":
      return {
        action: "Sprint complete!",
        command: "orchestra closeout",
        explanation:
          "All tasks in the sprint are complete. Run closeout to finalize the sprint.",
        tips: [
          "Review the sprint summary",
          "Archive completed handovers and signals",
          "Consider lessons learned for next sprint",
        ],
      };

    default: {
      // Exhaustive check - should never reach here
      const _exhaustive: never = step;
      return {
        action: "Unknown state",
        explanation: `Unexpected workflow step: ${_exhaustive}`,
      };
    }
  }
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Get guidance for the next workflow step
 *
 * This is a read-only operation that analyzes the current state
 * and provides guidance on what to do next.
 *
 * @param options - Next options
 * @returns NextResult with current step and guidance
 */
export function runNext(options: NextOptions = {}): NextResult {
  // Detect current workflow state
  const state = detectWorkflowState(options.cwd);

  // Get guidance for the current step
  const guidance = getGuidanceForStep(state.inferredStep, state);

  // Build result
  const result: NextResult = {
    currentStep: state.inferredStep,
    guidance,
  };

  // Add task context if available
  if (state.currentTaskId && state.currentTask) {
    result.task = {
      id: state.currentTaskId,
      title: state.currentTask.title,
      status: state.currentTaskStatus ?? "UNKNOWN",
    };
  }

  // Add sprint context if available
  if (state.sprintId) {
    result.sprint = {
      id: state.sprintId,
      status: state.sprintStatus ?? "UNKNOWN",
    };
  }

  // Add full state for verbose output
  if (options.verbose) {
    result.state = state;
  }

  return result;
}
