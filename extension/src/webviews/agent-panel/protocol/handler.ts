/**
 * Message Protocol Handler
 *
 * Processes Extension → Webview messages and updates SolidJS stores.
 * Sets up VS Code webview message listener.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 8.2
 */

import type {
  SessionStage,
  StatusChangeEvent,
} from "../../../agents/sessions/types.js";
import { updateToolCallAggregate } from "../stores/aggregation.js";
import { flushPendingState } from "../stores/persistence.js";
import {
  addEvent,
  clearAfter,
  clearEvents,
  clearSessionHistory,
  clearToolCalls,
  persistState,
  replaceSession,
  resetSession,
  session,
  setSession,
  setSessionMetas,
  setToolCall,
  syncSessionStatusFromEvents,
  toolCalls,
  tryRestoreState,
} from "../stores/sessionStore.js";
import { setUi } from "../stores/uiStore.js";
import type { ExtensionMessage } from "./types.js";

/**
 * Check if an event is tool-related
 */
function isToolEvent(event: {
  type: string;
  toolCallId?: string;
}): event is { type: string; toolCallId: string } {
  return (
    event.toolCallId !== undefined &&
    [
      "tool_call",
      "tool_progress",
      "tool_output",
      "tool_file_operation",
      "tool_metadata",
      "tool_result",
    ].includes(event.type)
  );
}

function shouldIncludeEvent(event: { timestamp: string }): boolean {
  const cutoff = clearAfter();
  if (!cutoff) return true;
  return new Date(event.timestamp).getTime() >= new Date(cutoff).getTime();
}

/**
 * Handle incoming message from extension host
 *
 * Dispatches to appropriate store setters based on message type.
 * Uses exhaustive switch for type safety.
 */
export function handleExtensionMessage(message: ExtensionMessage): void {
  switch (message.type) {
    case "session_update": {
      console.log(
        `[AgentPanel] Session update:`,
        message.session?.sessionId,
        message.session?.status,
      );
      // Only clear events when the TASK changes, not when the session changes.
      // Within a task's workflow chain (prepare → controller → implement → verify),
      // events accumulate across all sessions to show full task history.
      const currentTaskId = session?.taskId;
      const isDifferentTask =
        currentTaskId !== undefined &&
        currentTaskId !== 0 &&
        message.session.taskId !== currentTaskId;
      if (isDifferentTask) {
        console.log(
          `[AgentPanel] New task detected (task ${currentTaskId} -> ${message.session.taskId}), clearing stale data`,
        );
        clearEvents();
        clearToolCalls();
      }
      // Use replaceSession for full diff-based replacement (not shallow merge)
      // This ensures a clean transition from empty store to full session object
      replaceSession(message.session);

      // Track session metadata for boundary rendering in timeline
      // Use conditional property to comply with exactOptionalPropertyTypes
      const _meta: { role: string; stage?: SessionStage } = {
        role: message.session.role,
      };
      if (message.session.stage !== undefined) {
        _meta.stage = message.session.stage;
      }
      setSessionMetas(message.session.sessionId, _meta);

      persistState();
      setUi("initialScrollPending", true);
      break;
    }

    case "session_list":
      // Session list handling will be added when session switching is implemented
      break;

    case "event":
      // Add single event to events store using reactive addEvent
      if (!shouldIncludeEvent(message.event)) {
        break;
      }
      addEvent(message.event);

      // Update session status from status_change events
      if (message.event.type === "status_change") {
        const statusEvent = message.event as StatusChangeEvent;
        if (session) {
          setSession("status", statusEvent.newStatus);
          if (statusEvent.message) {
            setSession("statusMessage", statusEvent.message);
          }
        }
      }

      // Update tool call aggregate if this is a tool-related event
      if (isToolEvent(message.event)) {
        const existingAggregate = toolCalls[message.event.toolCallId];
        const updatedAggregate = updateToolCallAggregate(
          existingAggregate,
          message.event,
        );
        if (updatedAggregate) {
          setToolCall(message.event.toolCallId, updatedAggregate);
        }
      }
      break;

    case "events_batch":
      // Bulk add events for efficiency

      message.events.forEach((event) => {
        if (!shouldIncludeEvent(event)) {
          return;
        }
        addEvent(event);

        // Update session status from status_change events
        if (event.type === "status_change") {
          const statusEvent = event as StatusChangeEvent;
          if (session) {
            setSession("status", statusEvent.newStatus);
            if (statusEvent.message) {
              setSession("statusMessage", statusEvent.message);
            }
          }
        }

        // Update tool call aggregate if this is a tool-related event
        if (isToolEvent(event)) {
          const existingAggregate = toolCalls[event.toolCallId];
          const updatedAggregate = updateToolCallAggregate(
            existingAggregate,
            event,
          );
          if (updatedAggregate) {
            setToolCall(event.toolCallId, updatedAggregate);
          }
        }
      });
      break;

    case "clear":
      // Reset all stores to initial state
      clearSessionHistory();
      break;

    case "set_verbosity":
      // Update UI verbosity level
      setUi("verbosity", message.level);
      break;

    case "load_session":
      // Replace entire session state
      // Session will be updated via subsequent session_update message
      resetSession();

      setUi("initialScrollPending", true);

      // Clear and rebuild events
      clearEvents();
      message.events.forEach((event) => {
        if (!shouldIncludeEvent(event)) {
          return;
        }
        addEvent(event);
      });
      break;

    default:
      // Exhaustive check - TypeScript will error if we missed a case
      const _exhaustive: never = message;
      void _exhaustive;
  }
}

/**
 * Initialize message listener for VS Code webview communication
 *
 * Call this once during webview startup to begin receiving messages
 * from the extension host.
 */
export function initializeMessageHandler(): void {
  // 'ready' was already sent by the preload script — don't send it again.
  // Register the real message handler now.
  globalThis.addEventListener("message", (event: MessageEvent) => {
    const message = event.data as ExtensionMessage;
    handleExtensionMessage(message);
  });

  // Signal to the preload early-handler that we've taken over
  if (typeof window !== "undefined") {
    (window as any)._agentPanelHandlerReady = true;
  }

  // Process any messages that were buffered by the preload script
  const queue = (window as any)?._agentPanelMessageQueue as
    | unknown[]
    | undefined;
  if (queue && queue.length > 0) {
    for (const msg of queue) {
      handleExtensionMessage(msg as ExtensionMessage);
    }
    queue.length = 0; // Clear the queue
  }

  // Flush pending state before the page is hidden (prevents state loss)
  globalThis.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      flushPendingState();
    }
  });

  // Also flush on beforeunload for extra safety
  globalThis.addEventListener("beforeunload", () => {
    flushPendingState();
  });

  // Restore persisted state asynchronously (after sending ready)
  // The extension will send fresh data anyway, but this provides immediate UI feedback
  try {
    const restored = tryRestoreState();
    if (restored) {
      syncSessionStatusFromEvents();
    }
  } catch (_error) {
    // State restoration failed - extension will send fresh data
  }
}
