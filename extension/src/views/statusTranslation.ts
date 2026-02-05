/**
 * Status translation layer for user-friendly display
 *
 * Maps technical task statuses to professional, intuitive labels with appropriate
 * VS Code codicons and theme colors. This module serves as the single source of
 * truth for status display throughout the extension.
 */

import { ThemeColor } from "vscode";

/**
 * Display properties for a task status
 */
export interface StatusDisplay {
  /** User-friendly label shown in the UI */
  label: string;
  /** VS Code codicon name (e.g., 'circle-outline', 'play-circle') */
  icon: string;
  /** VS Code theme color for the status */
  color: ThemeColor;
  /** Detailed description of what this status means */
  description: string;
  /** Optional action label for primary button (e.g., 'Start', 'Review') */
  actionLabel?: string;
}

/**
 * Complete mapping of task statuses to display properties
 *
 * Status Flow:
 * PENDING → PREPARE → PENDING_HANDOVER_REVIEW → IMPLEMENT → VERIFY → (VERIFY_FAILED → retry)
 *                   ↓                                              ↓
 *           HANDOVER_REVIEW_FAILED                              VERIFIED/PENDING_CODE_REVIEW
 *                                                                      ↓
 *                                                              Code Review → (CHANGES_REQUESTED/FAILED → fix → re-review)
 *                                                                      ↓
 *                                                                  COMPLETE
 *
 * Gate/Escalation:
 * GATE_CHECK → ESCALATED (requires human intervention)
 */
export const STATUS_DISPLAY: Record<string, StatusDisplay> = {
  PENDING: {
    label: "Ready",
    icon: "circle-outline",
    color: new ThemeColor("charts.blue"),
    description: "Task is ready to be started",
    actionLabel: "Start",
  },

  PREPARE: {
    label: "Preparing",
    icon: "edit",
    color: new ThemeColor("charts.blue"),
    description: "Task is being prepared by orchestrator",
    actionLabel: "Continue Preparation",
  },

  PENDING_HANDOVER_REVIEW: {
    label: "Pending Handover Review",
    icon: "shield",
    color: new ThemeColor("charts.yellow"),
    description: "Handover requires controller review before implementation",
    actionLabel: "Review Handover",
  },

  HANDOVER_REVIEW_FAILED: {
    label: "Handover Review Failed",
    icon: "warning",
    color: new ThemeColor("charts.orange"),
    description: "Handover review found issues - requires revision",
    actionLabel: "Review Feedback",
  },

  IMPLEMENT: {
    label: "In Progress",
    icon: "play-circle",
    color: new ThemeColor("charts.purple"),
    description: "Task is currently being implemented",
    actionLabel: "Continue",
  },

  VERIFY: {
    label: "Verifying",
    icon: "sync~spin",
    color: new ThemeColor("charts.yellow"),
    description: "Implementation is being verified against acceptance criteria",
    actionLabel: "View Progress",
  },

  VERIFY_FAILED: {
    label: "Needs Attention",
    icon: "warning",
    color: new ThemeColor("charts.orange"),
    description: "Verification failed - requires fixes based on feedback",
    actionLabel: "Review Feedback",
  },

  VERIFIED: {
    label: "Verified",
    icon: "check",
    color: new ThemeColor("charts.green"),
    description: "Verification passed - awaiting code review",
    actionLabel: "Start Code Review",
  },

  PENDING_CODE_REVIEW: {
    label: "Pending Code Review",
    icon: "code-review",
    color: new ThemeColor("charts.yellow"),
    description: "Implementation verified - awaiting code review",
    actionLabel: "Review Code",
  },

  CODE_REVIEW_CHANGES_REQUESTED: {
    label: "Changes Requested",
    icon: "request-changes",
    color: new ThemeColor("charts.orange"),
    description: "Code review requested changes - requires fixes",
    actionLabel: "Fix Issues",
  },

  CODE_REVIEW_FAILED: {
    label: "Code Review Failed",
    icon: "error",
    color: new ThemeColor("charts.red"),
    description: "Code review rejected - requires significant fixes",
    actionLabel: "Fix Issues",
  },

  GATE_CHECK: {
    label: "Pending Review",
    icon: "shield",
    color: new ThemeColor("charts.yellow"),
    description: "Task requires human review before proceeding",
    actionLabel: "Review",
  },

  ESCALATED: {
    label: "Escalated",
    icon: "alert",
    color: new ThemeColor("charts.red"),
    description: "Task has been escalated to human supervisor for assistance",
    actionLabel: "Resolve",
  },

  COMPLETE: {
    label: "Complete",
    icon: "check-all",
    color: new ThemeColor("charts.green"),
    description: "Task has been successfully verified and completed",
  },
};

/**
 * Get status display properties with fallback for unknown statuses
 *
 * @param status - The technical status string (e.g., 'VERIFY_FAILED')
 * @returns StatusDisplay object with user-friendly properties
 *
 * @example
 * const display = getStatusDisplay('VERIFY_FAILED');
 * console.log(display.label); // "Needs Attention"
 * console.log(display.icon);  // "warning"
 */
export function getStatusDisplay(status: string): StatusDisplay {
  const display = STATUS_DISPLAY[status];

  if (display) {
    return display;
  }

  // Fallback for unknown statuses
  return {
    label: status,
    icon: "question",
    color: new ThemeColor("charts.gray"),
    description: `Unknown status: ${status}`,
  };
}
