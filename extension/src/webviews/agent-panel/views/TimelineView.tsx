/**
 * TimelineView Component
 *
 * Main timeline view displaying chronological event stream.
 * Maps event types to appropriate card components for rendering.
 * Includes smart auto-scroll that pauses when user scrolls up.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.5, 4.2
 */

import { Icon } from "@iconify-icon/solid";
import type { Accessor } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
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
import { getEventsArray, toolCalls } from "../stores/index.js";

export interface TimelineViewProps {
  /** Currently focused event index for keyboard navigation */
  focusedEventIndex: Accessor<number>;
}

/**
 * Timeline item can be either a regular event or an aggregated tool call
 */
type TimelineItem =
  | { type: "event"; event: AgentEvent; timestamp: string }
  | { type: "toolCall"; toolCall: ToolCallAggregate; timestamp: string };
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

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
 * ToolCallEventCard - Displays a tool invocation
 */
function ToolCallEventCard(props: { event: ToolCallEvent }) {
  const argsPreview = () => {
    const args = props.event.arguments;
    const keys = Object.keys(args);
    if (keys.length === 0) return "";
    // Show first arg value truncated
    const firstKey = keys[0];
    const firstVal = String(args[firstKey]);
    const preview =
      firstVal.length > 60 ? firstVal.slice(0, 60) + "..." : firstVal;
    return preview;
  };

  return (
    <div class="group rounded-md hover:bg-zinc-900/40 transition-colors fade-in">
      <div class="px-3 py-1.5 flex gap-3">
        <ToolIcon
          toolName={props.event.toolName}
          class="w-[14px] h-[14px] text-blue-400 flex-shrink-0 mt-0.5"
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-[13px] font-medium text-blue-300">
              {props.event.toolName}
            </span>
            <span class="text-[10px] text-zinc-600 ml-auto">
              {props.event.toolCategory}
            </span>
          </div>
          <Show when={argsPreview()}>
            <div class="text-[11px] text-zinc-500 font-mono mt-1 truncate">
              {argsPreview()}
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}

/**
 * ToolProgressCard - Displays tool execution progress
 */
function ToolProgressCard(props: { event: ToolProgressEvent }) {
  return (
    <div class="group rounded-md hover:bg-zinc-900/40 transition-colors fade-in">
      <div class="px-3 py-1.5 flex items-center gap-3">
        <Icon
          icon="lucide:loader"
          class="w-[14px] h-[14px] text-yellow-400 animate-spin flex-shrink-0"
        />
        <span class="text-[13px] text-zinc-300">{props.event.message}</span>
        <Show when={props.event.percent !== undefined}>
          <span class="text-[11px] text-zinc-500 ml-auto">
            {props.event.percent}%
          </span>
        </Show>
      </div>
    </div>
  );
}

/**
 * ToolFileOperationCard - Displays file operations
 */
function ToolFileOperationCard(props: { event: ToolFileOperationEvent }) {
  return (
    <div class="group rounded-md hover:bg-zinc-900/40 transition-colors fade-in">
      <div class="px-3 py-1.5 flex items-center gap-3">
        <FileOperationBadge operation={props.event.operation} />
        <span class="text-[13px] text-zinc-300 font-mono truncate flex-1">
          {props.event.operation.path}
        </span>
        <Show when={props.event.operation.linesChanged}>
          <span class="text-[11px] text-zinc-500">
            {props.event.operation.linesChanged} lines
          </span>
        </Show>
      </div>
    </div>
  );
}

/**
 * ToolResultCard - Displays tool completion result
 */
function ToolResultCard(props: { event: ToolResultEvent }) {
  const statusColor = () =>
    props.event.success ? "text-emerald-400" : "text-rose-400";
  const borderColor = () =>
    props.event.success ? "border-emerald-900/20" : "border-rose-500/10";
  const bgColor = () =>
    props.event.success ? "bg-zinc-900/20" : "bg-rose-500/5";
  const icon = () =>
    props.event.success ? "lucide:check-circle" : "lucide:x-circle";

  return (
    <div
      class={`group rounded-md ${bgColor()} hover:bg-zinc-900/40 transition-colors border ${borderColor()} fade-in`}
    >
      <div class="px-3 py-2 flex gap-3">
        <Icon
          icon={icon()}
          class={`w-[14px] h-[14px] ${statusColor()} flex-shrink-0 mt-0.5`}
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1.5">
            <span class={`text-[13px] font-medium ${statusColor()}`}>
              {props.event.success ? "Success" : "Failed"}
            </span>
            <span class="text-[11px] text-zinc-500">
              {props.event.toolName}
            </span>
            <span class="text-[11px] text-zinc-500 ml-auto">
              {formatDuration(props.event.durationMs)}
            </span>
          </div>
          <Show when={props.event.output && props.event.output.length > 0}>
            <div class="text-[11px] text-zinc-400 font-mono bg-zinc-900/50 px-2 py-1.5 rounded max-h-32 overflow-auto border border-zinc-800/50">
              {props.event.output.slice(0, 500)}
              {props.event.output.length > 500 && "..."}
            </div>
          </Show>
          <Show when={props.event.error}>
            <div class="text-[11px] text-rose-400 mt-2">
              {props.event.error?.message}
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}

/**
 * ToolMetadataCard - Displays tool metadata
 */
function ToolMetadataCard(props: { event: ToolMetadataEvent }) {
  return (
    <div class="group rounded-md hover:bg-zinc-900/40 transition-colors fade-in">
      <div class="px-3 py-1.5 flex items-center gap-3">
        <Icon
          icon="lucide:info"
          class="w-[14px] h-[14px] text-zinc-500 flex-shrink-0"
        />
        <span class="text-[11px] text-zinc-500">{props.event.toolName}</span>
        <span class="text-[11px] text-zinc-400">
          {props.event.key}: {String(props.event.value).slice(0, 100)}
        </span>
      </div>
    </div>
  );
}

/**
 * TimelineView - Chronological event timeline with smart auto-scroll
 */
export function TimelineView(props: TimelineViewProps) {
  // Container ref for scroll management
  const [containerRef, setContainerRef] = createSignal<HTMLElement>();

  /**
   * Convert events record to sorted array by timestamp
   * Uses getEventsArray() for proper SolidJS reactivity
   */
  const sortedEvents = createMemo(() => {
    const eventArray = getEventsArray();
    console.log(
      "[TimelineView] sortedEvents recalculating, count:",
      eventArray.length,
    );
    return eventArray.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  });

  // Smart auto-scroll: pauses when user scrolls up, resumes at bottom
  const autoScroll = useAutoScroll({
    containerRef,
    eventCount: () => sortedEvents().length,
    enabled: true,
  });

  /**
   * Render appropriate card component based on event type
   */
  const renderEvent = (event: AgentEvent, index: number) => {
    const isFocused = props.focusedEventIndex() === index;
    const focusClass = isFocused ? "focused-event ring-2 ring-blue-500" : "";

    // Staggered animation delay (matching reference design pattern)
    const animationDelay = `${index * 0.05}s`;

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

      case "status_change":
        eventCard = <StatusChangeCard event={event} />;
        break;

      case "tool_call":
        eventCard = <ToolCallEventCard event={event} />;
        break;

      case "tool_progress":
        eventCard = <ToolProgressCard event={event} />;
        break;

      case "tool_file_operation":
        eventCard = <ToolFileOperationCard event={event} />;
        break;

      case "tool_result":
        eventCard = <ToolResultCard event={event} />;
        break;

      case "tool_metadata":
        eventCard = <ToolMetadataCard event={event} />;
        break;

      case "tool_output":
        // Use StreamingOutput component for proper output display
        eventCard = (
          <div class="group rounded-md hover:bg-zinc-900/40 transition-colors fade-in">
            <div class="px-3 py-1.5">
              <StreamingOutput
                outputChunks={[event.chunk]}
                isStderr={event.stream === "stderr"}
              />
            </div>
          </div>
        );
        break;

      default:
        eventCard = (
          <div class="group rounded-md hover:bg-zinc-900/40 transition-colors fade-in">
            <div class="px-3 py-2">
              <div class="text-[11px] text-zinc-600">Unknown event type</div>
            </div>
          </div>
        );
    }

    return (
      <div class={focusClass} style={{ "animation-delay": animationDelay }}>
        {eventCard}
      </div>
    );
  };

  return (
    <div class="h-full relative">
      {/* Scroll container - matching reference design */}
      <div
        ref={setContainerRef}
        class="h-full overflow-y-auto px-2 pb-2 pt-1 space-y-0.5 scroll-smooth"
      >
        <Show
          when={sortedEvents().length > 0}
          fallback={
            <EmptyState
              icon="lucide:loader"
              message="No events yet. Waiting for agent to start..."
            />
          }
        >
          <For each={sortedEvents()}>
            {(event, index) => renderEvent(event, index())}
          </For>
        </Show>
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
