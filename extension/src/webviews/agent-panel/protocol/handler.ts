/**
 * Message Protocol Handler
 *
 * Processes Extension → Webview messages and updates SolidJS stores.
 * Sets up VS Code webview message listener.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 8.2
 */

import { setEvents, setSession, setToolCalls } from "../stores/sessionStore.js";
import { setUi } from "../stores/uiStore.js";
import type { ExtensionMessage } from "./types.js";

/**
 * Handle incoming message from extension host
 *
 * Dispatches to appropriate store setters based on message type.
 * Uses exhaustive switch for type safety.
 */
export function handleExtensionMessage(message: ExtensionMessage): void {
  switch (message.type) {
    case "session_update":
      setSession(message.session);
      break;

    case "session_list":
      // Session list handling will be added when session switching is implemented
      // For now, just log it
      console.log("[Protocol] Received session list", message.sessions);
      break;

    case "event":
      // Add single event to events store
      setEvents(message.event.id, message.event);
      break;

    case "events_batch":
      // Bulk add events for efficiency
      message.events.forEach((event) => {
        setEvents(event.id, event);
      });
      break;

    case "clear":
      // Reset all stores to initial state
      setSession(null);
      setEvents({});
      setToolCalls({});
      break;

    case "set_verbosity":
      // Update UI verbosity level
      setUi("verbosity", message.level);
      break;

    case "load_session":
      // Replace entire session state
      // Session will be updated via subsequent session_update message
      setSession(null);

      // Clear and rebuild events
      setEvents({});
      message.events.forEach((event) => {
        setEvents(event.id, event);
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
  // Use globalThis to access window in both browser and test environments
  globalThis.addEventListener("message", (event: MessageEvent) => {
    const message = event.data as ExtensionMessage;
    handleExtensionMessage(message);
  });

  // Notify extension that webview is ready
  // The vscode API is injected by VS Code at runtime via global.d.ts
  if (typeof window !== "undefined" && window.vscode) {
    window.vscode.postMessage({ type: "ready" });
  }
}
