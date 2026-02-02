/**
 * Session Store
 *
 * Manages core agent session data using SolidJS reactive stores.
 * Co-locates related data (session, events, toolCalls) for performance.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 8.1
 */

import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import type {
  AgentEvent,
  AgentSession,
  ToolCallAggregate,
} from "../../../agents/sessions/types.js";

/**
 * Current active agent session (null when no session)
 */
export const [session, setSession] = createStore<AgentSession | null>(null);

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
 * Add a single event to the store and update the keys signal
 */
export function addEvent(event: AgentEvent): void {
  setEvents(event.id, event);
  // Update keys signal to trigger reactivity
  setEventKeys((prev) => [...prev, event.id]);
}

/**
 * Clear all events from the store
 */
export function clearEvents(): void {
  setEvents({});
  setEventKeys([]);
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
 * Tool call aggregates indexed by toolCallId
 */
export const [toolCalls, setToolCalls] = createStore<
  Record<string, ToolCallAggregate>
>({});
