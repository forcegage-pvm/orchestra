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

/**
 * Tool call keys signal for reactivity tracking
 */
export const [toolCallKeys, setToolCallKeys] = createSignal<string[]>([]);

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
}

/**
 * Clear all tool calls
 */
export function clearToolCalls(): void {
  setToolCalls({});
  setToolCallKeys([]);
}
