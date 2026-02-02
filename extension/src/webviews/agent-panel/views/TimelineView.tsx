/**
 * TimelineView Component
 *
 * Main timeline view displaying chronological event stream using VirtualList.
 * Maps event types to appropriate card components for efficient rendering.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.5
 */

import type { Accessor } from "solid-js";
import { createMemo, Show } from "solid-js";
import type { AgentEvent } from "../../../agents/sessions/types.js";
import {
    EmptyState,
    ErrorCard,
    PromptCard,
    ThinkingCard,
    VirtualList,
} from "../components/index.js";
import { events } from "../stores/index.js";

export interface TimelineViewProps {
  /** Currently focused event index for keyboard navigation */
  focusedEventIndex: Accessor<number>;
}

/**
 * TimelineView - Chronological event timeline with virtual scrolling
 *
 * Reads events from sessionStore, sorts chronologically, and renders using
 * VirtualList. Maps event types to card components:
 * - prompt → PromptCard
 * - thinking → ThinkingCard
 * - error → ErrorCard
 *
 * Applies visual focus indicator (focused-event CSS class) to the event
 * at focusedEventIndex for keyboard navigation.
 *
 * @example
 * ```tsx
 * <TimelineView focusedEventIndex={keyboardNav.focusedEventIndex} />
 * ```
 */
export function TimelineView(props: TimelineViewProps) {
  /**
   * Convert events record to sorted array by timestamp
   */
  const sortedEvents = createMemo(() => {
    const eventArray = Object.values(events);
    return eventArray.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  });

  /**
   * Estimate size for each event type (for VirtualList)
   */
  const estimateSize = (index: number): number => {
    const event = sortedEvents()[index];
    if (!event) return 80;

    switch (event.type) {
      case "prompt":
        // Base height + variable text height estimate
        return 80 + Math.min(event.text.length / 2, 200);
      case "thinking":
        // Collapsed: ~60px, expanded: ~200px (default to expanded)
        return 200;
      case "error":
        return 100;
      case "status_change":
        return 60;
      case "tool_call":
      case "tool_progress":
      case "tool_output":
      case "tool_result":
      case "tool_file_operation":
      case "tool_metadata":
        // Tool events will use ToolCallCard (future)
        return 120;
      default:
        return 80;
    }
  };

  /**
   * Render appropriate card component based on event type
   * Wraps each event in a div with conditional focused-event class
   */
  const renderEvent = (event: AgentEvent, index: number) => {
    const isFocused = props.focusedEventIndex() === index;
    const focusClass = isFocused ? "focused-event" : "";

    let eventCard;
    switch (event.type) {
      case "prompt":
        eventCard = <PromptCard event={event} />;
        break;

      case "thinking":
        eventCard = (
          <ThinkingCard event={event} isStreaming={false} autoCollapse={true} />
        );
        break;

      case "error":
        eventCard = <ErrorCard event={event} />;
        break;

      // Future: Add tool_call → ToolCallCard mapping
      case "status_change":
      case "tool_call":
      case "tool_progress":
      case "tool_output":
      case "tool_result":
      case "tool_file_operation":
      case "tool_metadata":
        // Placeholder for non-implemented event types
        eventCard = (
          <div class="bg-zinc-900 border border-gray-700 rounded-lg p-4">
            <div class="text-xs text-gray-600">
              Event type "{event.type}" not yet implemented
            </div>
          </div>
        );
        break;

      default:
        eventCard = (
          <div class="bg-zinc-900 border border-gray-700 rounded-lg p-4">
            <div class="text-xs text-gray-600">Unknown event type</div>
          </div>
        );
    }

    return <div class={focusClass}>{eventCard}</div>;
  };

  return (
    <div class="h-full">
      <Show
        when={sortedEvents().length > 0}
        fallback={
          <EmptyState
            icon="lucide:loader"
            message="No events yet. Waiting for agent to start..."
          />
        }
      >
        <VirtualList
          items={sortedEvents()}
          estimateSize={estimateSize}
          renderItem={renderEvent}
          height={600}
          class="p-4 space-y-3"
        />
      </Show>
    </div>
  );
}
