/**
 * Events Store
 *
 * Event-specific store operations for the Agent Panel.
 * This module provides event management functionality alongside sessionStore.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 8.1
 */

import { createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import type { AgentEvent } from "../../../agents/sessions/types.js";
import { events } from "./sessionStore.js";
import { ui } from "./uiStore.js";

/**
 * Events store for event-specific operations
 * (Note: Primary events store is in sessionStore.ts for co-location performance)
 */
export const [eventOperations, setEventOperations] = createStore<
  Record<string, AgentEvent>
>({});

/**
 * Extract searchable text from an event for filtering
 */
function getSearchableText(event: AgentEvent): string {
  const parts: string[] = [];

  // Common fields
  parts.push(event.type);
  parts.push(event.id);

  // Type-specific fields
  switch (event.type) {
    case "prompt":
      parts.push(event.text);
      if (event.attachments) {
        event.attachments.forEach((att) => {
          parts.push(att.path);
          parts.push(att.name);
        });
      }
      break;

    case "thinking":
      parts.push(event.text);
      break;

    case "status_change":
      parts.push(event.previousStatus);
      parts.push(event.newStatus);
      if (event.message) parts.push(event.message);
      break;

    case "error":
      parts.push(event.severity);
      parts.push(event.code);
      parts.push(event.message);
      if (event.suggestion) parts.push(event.suggestion);
      break;

    case "tool_call":
      parts.push(event.toolName);
      parts.push(JSON.stringify(event.arguments));
      break;

    case "tool_progress":
      parts.push(event.toolName);
      parts.push(event.message);
      break;

    case "tool_output":
      parts.push(event.toolName);
      parts.push(event.chunk);
      break;

    case "tool_file_operation":
      parts.push(event.toolName);
      parts.push(event.operation.operation);
      parts.push(event.operation.path);
      if (event.operation.targetPath) parts.push(event.operation.targetPath);
      break;

    case "tool_metadata":
      parts.push(event.toolName);
      parts.push(event.key);
      parts.push(JSON.stringify(event.value));
      break;

    case "tool_result":
      parts.push(event.toolName);
      parts.push(event.output);
      if (event.error) {
        parts.push(event.error.code);
        parts.push(event.error.message);
      }
      break;
  }

  return parts.join(" ").toLowerCase();
}

/**
 * Filtered events derived signal
 *
 * Filters events based on uiStore.filterText. Searches across:
 * - Tool names
 * - Messages and text content
 * - File paths
 * - Output content
 * - Error messages
 *
 * Case-insensitive search with instant filtering (no debounce).
 */
export const filteredEvents = createMemo(() => {
  const filterText = ui.filterText.toLowerCase().trim();

  // If no filter, return all events
  if (!filterText) {
    return Object.values(events);
  }

  // Filter events by searchable text
  return Object.values(events).filter((event) => {
    const searchableText = getSearchableText(event);
    return searchableText.includes(filterText);
  });
});

/**
 * Highlight matches utility
 *
 * Wraps matched text substrings with <mark> elements for highlighting.
 * Case-insensitive matching.
 *
 * @param text - Text to highlight
 * @param searchTerm - Term to search for (from uiStore.filterText)
 * @returns HTML string with <mark> tags around matches
 *
 * @example
 * ```tsx
 * const highlighted = highlightMatches("Tool call completed", "call");
 * // Returns: "Tool <mark>call</mark> completed"
 * ```
 */
export function highlightMatches(text: string, searchTerm: string): string {
  if (!searchTerm || !text) return text;

  const term = searchTerm.trim();
  if (!term) return text;

  // Escape special regex characters
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedTerm})`, "gi");

  return text.replace(regex, "<mark>$1</mark>");
}
