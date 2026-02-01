/**
 * Events Store
 *
 * Event-specific store operations for the Agent Panel.
 * This module provides event management functionality alongside sessionStore.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 8.1
 */

import { createStore } from "solid-js/store";
import type { AgentEvent } from "../../../agents/sessions/types.js";

/**
 * Events store for event-specific operations
 * (Note: Primary events store is in sessionStore.ts for co-location performance)
 */
export const [eventOperations, setEventOperations] = createStore<
  Record<string, AgentEvent>
>({});
