/**
 * TimelineView Component
 *
 * Main timeline view displaying chronological mixed stream of:
 * - Regular events (prompt, thinking, error, status_change)
 * - Aggregated tool calls (ToolCallCard combining all tool events)
 *
 * Includes smart auto-scroll that pauses when user scrolls up.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.5, 4.1, 4.2
 */

import { Icon } from "@iconify-icon/solid";
import type { Accessor } from "solid-js";
import { createMemo, createSignal, Index, Show } from "solid-js";
import type {
  AgentEvent,
  StatusChangeEvent,
  ToolCallAggregate,
} from "../../../agents/sessions/types.js";
import {
  EmptyState,
  ErrorCard,
  NewEventsIndicator,
  PromptCard,
  ThinkingCard,
  ToolCallCard,
} from "../components/index.js";
import { useAutoScroll } from "../hooks/index.js";
import { getEventsArray, session, toolCalls } from "../stores/index.js";

export interface TimelineViewProps {
  /** Currently focused event index for keyboard navigation */
  focusedEventIndex: Accessor<number>;
}

/**
 * Timeline item can be either a regular event or an aggregated tool call
 */
type TimelineItem =
  | { type: "event"; event: AgentEvent; timestamp: string; id: string }
  | {
      type: "toolCall";
      toolCall: ToolCallAggregate;
      timestamp: string;
      id: string;
    };

/**
 * StatusChangeCard - Displays session status transitions
 */
function StatusChangeCard(props: { event: StatusChangeEvent }) {
  return (
    <div class="group rounded-md hover:bg-zinc-900/40 transition-colors fade-in">
      <div class="px-3 py-1.5 flex gap-3">
        <Icon
          icon="lucide:activity"
          class="w-[14px] h-[14px] text-blue-400 flex-shrink-0 mt-0.5"
        />
        <span class="text-[13px] text-zinc-300">
          Status:{" "}
          <span class="text-zinc-500">{props.event.previousStatus}</span>
          <Icon
            icon="lucide:arrow-right"
            class="w-3 h-3 mx-2 inline text-zinc-600"
          />
          <span class="text-blue-400 font-medium">{props.event.newStatus}</span>
        </span>
        <Show when={props.event.message}>
          <span class="text-[11px] text-zinc-500">— {props.event.message}</span>
        </Show>
      </div>
    </div>
  );
}

/**
 * TimelineView - Chronological event timeline with smart auto-scroll
 *
 * Displays a mixed timeline of:
 * - Regular events (prompt, thinking, error, status_change)
 * - Aggregated tool calls (ToolCallCard with all tool events grouped)
 */
export function TimelineView(props: TimelineViewProps) {
  // Container ref for scroll management
  const [containerRef, setContainerRef] = createSignal<HTMLElement>();

  /**
   * Build timeline items by merging non-tool events with tool call aggregates
   *
   * Timeline should show:
   * 1. prompt events
   * 2. thinking events
   * 3. ToolCallCard (replaces individual tool_call/tool_progress/tool_output/tool_result events)
   * 4. error events
   * 5. status_change events
   *
   * Tool-related events are filtered out since they're shown within ToolCallCard
   */
  const timelineItems = createMemo(() => {
    const eventArray = getEventsArray();
    const toolCallsMap = toolCalls;

    const items: TimelineItem[] = [];
    const processedToolCalls = new Set<string>();

    // First pass: add non-tool events and mark tool calls to process
    for (const event of eventArray) {
      // Skip tool-related events - they're aggregated in ToolCallCard
      // Skip status_change events - they update the status bar
      if (
        event.type === "tool_call" ||
        event.type === "tool_progress" ||
        event.type === "tool_output" ||
        event.type === "tool_file_operation" ||
        event.type === "tool_metadata" ||
        event.type === "tool_result" ||
        event.type === "status_change"
      ) {
        // For tool_call events, add the aggregate to timeline
        if (event.type === "tool_call") {
          const toolCallId = (event as any).toolCallId;
          if (
            toolCallId &&
            toolCallsMap[toolCallId] &&
            !processedToolCalls.has(toolCallId)
          ) {
            items.push({
              type: "toolCall",
              toolCall: toolCallsMap[toolCallId],
              timestamp: toolCallsMap[toolCallId].startedAt,
              id: `tool-${toolCallId}`,
            });
            processedToolCalls.add(toolCallId);
          }
        }
        continue;
      }

      // Add non-tool events
      items.push({
        type: "event",
        event,
        timestamp: event.timestamp,
        id: `event-${event.type}-${event.timestamp}`,
      });
    }

    // Sort by timestamp
    return items.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  });

  // Smart auto-scroll: pauses when user scrolls up, resumes at bottom
  const autoScroll = useAutoScroll({
    containerRef,
    eventCount: () => timelineItems().length,
    enabled: true,
  });

  // Check if agent is running
  const isRunning = () => {
    return (
      session?.status === "running" ||
      session?.status === "thinking" ||
      session?.status === "waiting_for_tool"
    );
  };

  /**
   * Render appropriate card component based on timeline item type
   */
  const renderItem = (item: TimelineItem, index: number) => {
    const isFocused = props.focusedEventIndex() === index;
    const focusClass = isFocused ? "focused-event ring-2 ring-blue-500" : "";

    // Staggered animation delay (matching reference design pattern)
    const animationDelay = `${index * 0.05}s`;

    let itemCard;

    if (item.type === "toolCall") {
      // Render aggregated tool call card
      itemCard = (
        <ToolCallCard toolCall={item.toolCall} startCollapsed={false} />
      );
    } else {
      // Render regular event
      const event = item.event;
      switch (event.type) {
        case "prompt":
          itemCard = <PromptCard event={event} />;
          break;

        case "thinking":
          itemCard = (
            <ThinkingCard
              event={event}
              isStreaming={false}
              autoCollapse={true}
            />
          );
          break;

        case "error":
          itemCard = <ErrorCard event={event} />;
          break;

        case "status_change":
          itemCard = <StatusChangeCard event={event} />;
          break;

        default:
          itemCard = (
            <div class="group rounded-md hover:bg-zinc-900/40 transition-colors fade-in">
              <div class="px-3 py-2">
                <div class="text-[11px] text-zinc-600">
                  Unknown event type: {event.type}
                </div>
              </div>
            </div>
          );
      }
    }

    return (
      <div class={focusClass} style={{ "animation-delay": animationDelay }}>
        {itemCard}
      </div>
    );
  };

  return (
    <div class="h-full relative">
      {/* Scroll container - matching reference design */}
      <div
        ref={setContainerRef}
        class="h-full overflow-y-auto pb-20 pt-1 space-y-0.5 scroll-smooth"
      >
        <Show
          when={timelineItems().length > 0}
          fallback={
            <EmptyState
              icon="lucide:loader"
              message="No events yet. Waiting for agent to start..."
            />
          }
        >
          <Index each={timelineItems()}>
            {(item) => renderItem(item(), 0)}
          </Index>
        </Show>

        {/* Ball-beat loading indicator - always in DOM, visibility controlled by CSS */}
        <div
          class="flex justify-start px-8 py-3 transition-opacity duration-200"
          style={{
            opacity: isRunning() ? 1 : 0,
            "pointer-events": isRunning() ? "auto" : "none",
          }}
        >
          <div class="flex items-center gap-1">
            <div class="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-ballBeat1" />
            <div class="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-ballBeat2" />
            <div class="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-ballBeat3" />
          </div>
        </div>
      </div>

      {/* New events indicator - shown when auto-scroll is paused */}
      <NewEventsIndicator
        count={autoScroll.newEventCount()}
        visible={autoScroll.isPaused()}
        onScrollToBottom={() => autoScroll.resumeAutoScroll()}
      />
    </div>
  );
}
