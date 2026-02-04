/**
 * Aggregate Updater
 *
 * Computes incremental updates to session aggregate fields based on events.
 * Used by the event pipeline to maintain accurate session statistics.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 1.1
 */

import type {
  AgentEvent,
  ErrorEvent,
  ToolFileOperationEvent,
  ToolResultEvent,
} from "./types.js";

/**
 * Aggregate update object returned by updateAggregatesFromEvent
 */
export interface AggregateUpdate {
  toolCallCount?: number;
  successfulToolCalls?: number;
  failedToolCalls?: number;
  warningCount?: number;
  filesModified?: string[];
}

/**
 * Computes session aggregate updates from a single event
 *
 * This function is pure and deterministic - given the same event and current
 * aggregate values, it returns the same update object. Updates are incremental
 * and can be applied directly to the session via sessionRepository.updateSession.
 *
 * @param event - The event to process
 * @param currentFilesModified - Current array of modified file paths (for deduplication)
 * @returns Partial update object with fields to increment/update, or empty object if no changes
 *
 * @example
 * ```typescript
 * const update = updateAggregatesFromEvent(event, session.filesModified);
 * if (Object.keys(update).length > 0) {
 *   await sessionRepository.updateSession(workspaceRoot, sessionId, update);
 * }
 * ```
 */
export function updateAggregatesFromEvent(
  event: AgentEvent,
  currentFilesModified: string[] = [],
): AggregateUpdate {
  const update: AggregateUpdate = {};

  switch (event.type) {
    case "tool_call": {
      // Increment toolCallCount when a new tool call is initiated
      update.toolCallCount = 1;
      break;
    }

    case "tool_result": {
      const resultEvent = event as ToolResultEvent;
      if (resultEvent.success) {
        // Increment successfulToolCalls for successful completions
        update.successfulToolCalls = 1;
      } else {
        // Increment failedToolCalls for failed completions
        update.failedToolCalls = 1;
      }
      break;
    }

    case "error": {
      const errorEvent = event as ErrorEvent;
      if (errorEvent.severity === "warning") {
        // Increment warningCount only for warning-severity errors
        update.warningCount = 1;
      }
      // Do NOT increment for error-severity errors
      break;
    }

    case "tool_file_operation": {
      const fileOpEvent = event as ToolFileOperationEvent;
      const filePath = fileOpEvent.operation.path;

      // Add unique file paths to filesModified array
      if (!currentFilesModified.includes(filePath)) {
        update.filesModified = [...currentFilesModified, filePath];
      }
      break;
    }

    // Non-modifying event types: prompt, thinking, status_change,
    // tool_progress, tool_output, tool_metadata
    // Return empty update object (no changes)
    default:
      break;
  }

  return update;
}
