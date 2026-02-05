/**
 * State Persistence for Agent Panel
 *
 * Uses VS Code's webview getState/setState API to persist state
 * across visibility changes (collapse/expand, tab switching).
 *
 * This allows the webview to restore its previous state when it
 * becomes visible again, without requiring a round-trip to the extension.
 */

import type {
  AgentEvent,
  AgentSession,
  ToolCallAggregate,
} from "../../../agents/sessions/types.js";

/**
 * Shape of persisted state
 */
interface PersistedState {
  session: AgentSession | null;
  events: Record<string, AgentEvent>;
  eventKeys: string[];
  toolCalls: Record<string, ToolCallAggregate>;
  toolCallKeys: string[];
}

/**
 * Save current state to VS Code's webview state storage
 */
export function saveState(state: PersistedState): void {
  if (typeof window !== "undefined" && window.vscode?.setState) {
    window.vscode.setState(state);
  }
}

/**
 * Restore state from VS Code's webview state storage
 * Returns null if no state is saved or if restoration fails
 */
export function restoreState(): PersistedState | null {
  if (typeof window !== "undefined" && window.vscode?.getState) {
    const state = window.vscode.getState() as PersistedState | undefined;
    if (state && typeof state === "object" && "session" in state) {
      return state;
    }
  }
  return null;
}
