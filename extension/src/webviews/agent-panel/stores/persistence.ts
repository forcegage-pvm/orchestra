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
  clearAfter: string | null;
}

/**
 * Debounce timer for state persistence
 */
let persistTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Pending state to persist
 */
let pendingState: PersistedState | undefined;

/**
 * Debounce delay in milliseconds
 * This significantly reduces CPU usage from excessive setState calls
 */
const PERSIST_DEBOUNCE_MS = 250;

/**
 * Save current state to VS Code's webview state storage (debounced)
 *
 * State is saved after a 250ms delay, coalescing multiple rapid updates
 * into a single write. This prevents CPU spikes during heavy tool activity.
 */
export function saveState(state: PersistedState): void {
  pendingState = state;

  if (persistTimer !== undefined) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    if (typeof window !== "undefined" && window.vscode?.setState && pendingState) {
      window.vscode.setState(pendingState);
      pendingState = undefined;
    }
    persistTimer = undefined;
  }, PERSIST_DEBOUNCE_MS);
}

/**
 * Flush pending state immediately (for visibility changes)
 */
export function flushPendingState(): void {
  if (persistTimer !== undefined) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }
  if (typeof window !== "undefined" && window.vscode?.setState && pendingState) {
    window.vscode.setState(pendingState);
    pendingState = undefined;
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
