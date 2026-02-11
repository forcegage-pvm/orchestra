/**
 * Stores Barrel Export
 *
 * Centralized export for all Agent Panel stores.
 * Provides clean import interface for consuming components.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 8.1
 */

export {
  addEvent,
  clearEvents,
  clearToolCalls,
  eventKeys,
  events,
  getEventsArray,
  persistState,
  session,
  sessionMetas,
  setEventKeys,
  setEvents,
  setSession,
  setToolCall,
  setToolCalls,
  toolCallKeys,
  toolCalls,
  tryRestoreState,
} from "./sessionStore.js";

export type { SessionMeta } from "./sessionStore.js";

export { aggregateToolCalls, updateToolCallAggregate } from "./aggregation.js";

export { setUi, ui } from "./uiStore.js";

export type { TabId, UiState, VerbosityLevel } from "./uiStore.js";

export { filteredEvents, highlightMatches } from "./eventsStore.js";
