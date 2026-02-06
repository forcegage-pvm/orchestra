/**
 * WorkflowStage Component
 *
 * Displays the current workflow stage/purpose based on agent role.
 * Shows human-readable descriptions of what the agent is doing.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.2-3.3
 */

import type { AgentRole } from "../../../agents/sessions/types.js";

export interface WorkflowStageProps {
  /** Agent role type */
  role: AgentRole;
  /** Optional status message from the session (e.g., workflow chain description) */
  statusMessage?: string;
}

/**
 * Get the default workflow stage description based on agent role
 */
function getDefaultStageDescription(role: AgentRole): string {
  switch (role) {
    case "orchestrator":
      return "Preparing handover";
    case "implementor":
      return "Implementing";
    case "controller":
      return "Reviewing";
    default:
      return "Processing";
  }
}

/**
 * Parse a workflow chain description into a short stage label
 *
 * Workflow chain messages are like:
 * - "Handover ready - invoking Controller for review..."
 * - "Implementation complete - invoking Orchestrator for verification..."
 * - "Verification passed - invoking Controller for code review..."
 */
function parseWorkflowDescription(message: string): string {
  // Extract the first part before the dash
  const match = message.match(/^([^-]+)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return message;
}

/**
 * WorkflowStage - Shows current workflow stage/purpose
 *
 * Displays a compact label indicating what phase of the workflow
 * the agent is currently working on.
 *
 * @example
 * ```tsx
 * <WorkflowStage role="orchestrator" statusMessage="Verification failed - invoking Implementor..." />
 * // Renders: "Verification failed"
 * ```
 */
export function WorkflowStage(props: WorkflowStageProps) {
  const stageLabel = () => {
    if (props.statusMessage) {
      return parseWorkflowDescription(props.statusMessage);
    }
    return getDefaultStageDescription(props.role);
  };

  return <span class="text-sm text-amber-400 font-medium">{stageLabel()}</span>;
}
