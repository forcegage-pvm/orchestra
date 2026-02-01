/**
 * Session Store
 *
 * Manages core agent session data using SolidJS reactive stores.
 * Co-locates related data (session, events, toolCalls) for performance.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 8.1
 */

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
 * Tool call aggregates indexed by toolCallId
 */
export const [toolCalls, setToolCalls] = createStore<
  Record<string, ToolCallAggregate>
>({});
