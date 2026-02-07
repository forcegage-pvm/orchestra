/**
 * Message Protocol Handler
 *
 * Processes Extension → Webview messages and updates SolidJS stores.
 * Sets up VS Code webview message listener.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 8.2
 */

import type { StatusChangeEvent } from "../../../agents/sessions/types.js";
import { updateToolCallAggregate } from "../stores/aggregation.js";
import { flushPendingState } from "../stores/persistence.js";
import {
  addEvent,
  clearAfter,
  clearEvents,
  clearSessionHistory,
  persistState,
  session,
  setSession,
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
  console.log("[Protocol] Received message:", message.type);
  switch (message.type) {
    case "session_update":
      console.log("[Protocol] Session update:", message.session?.sessionId);
      setSession(message.session);
      persistState();
      setUi("initialScrollPending", true);
      break;

    case "session_list":
      // Session list handling will be added when session switching is implemented
      console.log("[Protocol] Received session list", message.sessions);
      break;

    case "event":
      // Add single event to events store using reactive addEvent
      console.log(
        "[Protocol] Single event:",
        message.event.type,
        message.event.id,
      );
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
      console.log("[Protocol] Events batch:", message.events.length, "events");
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
      setSession(null);

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
      console.warn("[Protocol] Unknown message type:", _exhaustive);
  }
}

/**
 * Initialize message listener for VS Code webview communication
 *
 * Call this once during webview startup to begin receiving messages
 * from the extension host.
 */
export function initializeMessageHandler(): void {
  // Restore persisted state immediately (before 'ready' message)
  // This ensures UI is populated before we notify the extension
  const restored = tryRestoreState();
  if (restored) {
    console.log("[Protocol] Restored state from VS Code storage");
    syncSessionStatusFromEvents();
  }

  // Use globalThis to access window in both browser and test environments
  globalThis.addEventListener("message", (event: MessageEvent) => {
    const message = event.data as ExtensionMessage;
    handleExtensionMessage(message);
  });

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

  // Notify extension that webview is ready
  // The vscode API is injected by VS Code at runtime via global.d.ts
  if (typeof window !== "undefined" && window.vscode) {
    window.vscode.postMessage({ type: "ready" });
  }
}
