/**
 * Session Store
 *
 * Manages core agent session data using SolidJS reactive stores.
 * Co-locates related data (session, events, toolCalls) for performance.
 * Persists state to VS Code webview state for visibility restoration.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 8.1
 */

import { createSignal } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import type {
  AgentEvent,
  AgentSession,
  SessionStage,
  StatusChangeEvent,
  ToolCallAggregate,
} from "../../../agents/sessions/types.js";
import { clearSearchableTextCache } from "./eventsStore.js";
import { restoreState, saveState } from "./persistence.js";

/**
 * Current active agent session.
 *
 * NOTE: createStore(null) internally creates a Proxy wrapping {}, NOT literal null.
 * SolidJS uses (store || {}) so the store is always an object.
 * Use reconcile() for full-object replacement (setSession does shallow merge by default).
 * Use resetSession() to clear session data (setSession(null) would be a no-op).
 */
export const [session, setSession] = createStore<AgentSession | null>(null);

/**
 * Session metadata map - tracks role and stage for each session in the current task.
 * Used by TimelineView to render session boundary markers with role/stage labels.
 */
export interface SessionMeta {
  role: string;
  stage?: SessionStage;
}
export const [sessionMetas, setSessionMetas] = createStore<
  Record<string, SessionMeta>
>({});

/**
 * Replace the entire session with a new session object.
 * Uses reconcile() for a full diff-based replacement instead of shallow merge.
 * This ensures properties removed in the new session are properly cleaned up.
 */
export function replaceSession(newSession: AgentSession): void {
  setSession(reconcile(newSession));
}

/**
 * Reset session to empty state.
 * setSession(null) is a no-op in SolidJS (null == undefined short-circuits),
 * so we use reconcile with an empty object to clear all properties.
 */
export function resetSession(): void {
  setSession(reconcile({} as AgentSession));
}

/**
 * All session events indexed by event ID
 */
export const [events, setEvents] = createStore<Record<string, AgentEvent>>({});

/**
 * Event keys signal for reactivity tracking
 * SolidJS stores don't track Object.values() reactively, so we use a signal
 * that gets updated whenever events are added/removed.
 */
export const [eventKeys, setEventKeys] = createSignal<string[]>([]);

/**
 * Tool call aggregates indexed by toolCallId
 */
export const [toolCalls, setToolCalls] = createStore<
  Record<string, ToolCallAggregate>
>({});

/**
 * Tool call keys signal for reactivity tracking
 */
export const [toolCallKeys, setToolCallKeys] = createSignal<string[]>([]);

/**
 * ISO timestamp after which events should be shown (used for clear history)
 */
export const [clearAfter, setClearAfter] = createSignal<string | null>(null);

/**
 * Persist current state to VS Code webview storage
 * Call this after any state mutation to enable restoration
 */
export function persistState(): void {
  saveState({
    session: unwrap(session),
    events: unwrap(events),
    eventKeys: eventKeys(),
    toolCalls: unwrap(toolCalls),
    toolCallKeys: toolCallKeys(),
    clearAfter: clearAfter(),
  });
}

/**
 * Restore state from VS Code webview storage
 * Call this on webview initialization before sending 'ready'
 * Returns true if state was restored
 */
export function tryRestoreState(): boolean {
  const saved = restoreState();
  if (saved) {
    if (saved.session) {
      replaceSession(saved.session);
    }
    if (saved.events) {
      setEvents(saved.events);
    }
    if (saved.eventKeys) {
      setEventKeys(saved.eventKeys);
    }
    if (saved.toolCalls) {
      setToolCalls(saved.toolCalls);
    }
    if (saved.toolCallKeys) {
      setToolCallKeys(saved.toolCallKeys);
    }
    if ("clearAfter" in saved) {
      setClearAfter(saved.clearAfter ?? null);
    }
    return true;
  }
  return false;
}

/**
 * Clear session history while keeping the current session header.
 */
export function clearSessionHistory(): void {
  setClearAfter(new Date().toISOString());
  setEvents({});
  setEventKeys([]);
  clearSearchableTextCache();
  setToolCalls({});
  setToolCallKeys([]);
  if (session) {
    setSession("toolCallCount", 0);
    setSession("successfulToolCalls", 0);
    setSession("failedToolCalls", 0);
    setSession("warningCount", 0);
    setSession("filesModified", []);
  }
  persistState();
}

/**
 * Sync session status from the latest status_change event.
 * Used when restoring state without a fresh session_update.
 */
export function syncSessionStatusFromEvents(): void {
  if (!session) return;

  const keys = eventKeys();
  let latest: StatusChangeEvent | undefined;

  keys.forEach((key) => {
    const event = events[key];
    if (event?.type !== "status_change") return;
    const statusEvent = event as StatusChangeEvent;
    if (!latest) {
      latest = statusEvent;
      return;
    }
    const currentTime = new Date(statusEvent.timestamp).getTime();
    const latestTime = new Date(latest.timestamp).getTime();
    if (currentTime >= latestTime) {
      latest = statusEvent;
    }
  });

  if (!latest) return;

  if (session.status !== latest.newStatus) {
    setSession("status", latest.newStatus);
  }

  if (latest.message && session.statusMessage !== latest.message) {
    setSession("statusMessage", latest.message);
  }

  persistState();
}

/**
 * Add a single event to the store and update the keys signal.
 * Deduplicates by event ID - if the event already exists, it updates the data
 * but doesn't add a duplicate key to the keys array.
 */
export function addEvent(event: AgentEvent): void {
  // Check if this event already exists (prevents duplicates from EventBus + polling)
  const existingKeys = eventKeys();
  const isNewEvent = !existingKeys.includes(event.id);

  // Always update the event data (in case of updates to existing event)
  setEvents(event.id, event);

  // Only add to keys array if this is a new event
  if (isNewEvent) {
    setEventKeys((prev) => [...prev, event.id]);
  }

  // Persist state for visibility restoration
  persistState();
}

/**
 * Clear all events from the store
 */
export function clearEvents(): void {
  setEvents({});
  setEventKeys([]);
  clearSearchableTextCache();
  setSessionMetas({});
  persistState();
}

/**
 * Get all events as a sorted array (reactive via eventKeys signal)
 * Use this instead of Object.values(events) for proper reactivity.
 */
export function getEventsArray(): AgentEvent[] {
  // Access eventKeys() to trigger reactivity tracking
  const keys = eventKeys();
  // Now access events - this is safe because we've tracked the keys
  return keys.map((key) => events[key]).filter(Boolean);
}

/**
 * Set or update a tool call aggregate
 */
export function setToolCall(
  toolCallId: string,
  aggregate: ToolCallAggregate,
): void {
  const isNew = !toolCalls[toolCallId];
  setToolCalls(toolCallId, aggregate);
  if (isNew) {
    setToolCallKeys((prev) => [...prev, toolCallId]);
  }
  persistState();
}

/**
 * Clear all tool calls
 */
export function clearToolCalls(): void {
  setToolCalls({});
  setToolCallKeys([]);
  persistState();
}
