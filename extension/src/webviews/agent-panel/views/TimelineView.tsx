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
    ToolCallEvent,
    ToolFileOperationEvent,
    ToolMetadataEvent,
    ToolProgressEvent,
    ToolResultEvent,
} from "../../../agents/sessions/types.js";
import {
    EmptyState,
    ErrorCard,
    FileOperationBadge,
    NewEventsIndicator,
    PromptCard,
    StreamingOutput,
    ThinkingCard,
    ToolIcon,
} from "../components/index.js";
import { useAutoScroll } from "../hooks/index.js";
import { getEventsArray } from "../stores/index.js";

export interface TimelineViewProps {
  /** Currently focused event index for keyboard navigation */
  focusedEventIndex: Accessor<number>;
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
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
    <div class="bg-zinc-900 border border-gray-700 rounded-lg p-3 flex items-center gap-3">
      <Icon icon="lucide:activity" class="w-4 h-4 text-blue-400" />
      <span class="text-sm text-gray-300">
        Status: <span class="text-gray-500">{props.event.previousStatus}</span>
        <Icon
          icon="lucide:arrow-right"
          class="w-3 h-3 mx-2 inline text-gray-600"
        />
        <span class="text-blue-400 font-medium">{props.event.newStatus}</span>
      </span>
      <Show when={props.event.message}>
        <span class="text-xs text-gray-500">— {props.event.message}</span>
      </Show>
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
    <div class="bg-zinc-900 border border-blue-700/50 rounded-lg p-3">
      <div class="flex items-center gap-2 mb-2">
        <ToolIcon
          toolName={props.event.toolName}
          class="w-4 h-4 text-blue-400"
        />
        <span class="text-sm font-medium text-blue-300">
          {props.event.toolName}
        </span>
        <span class="text-xs text-gray-500 ml-auto">
          {props.event.toolCategory}
        </span>
      </div>
      <Show when={argsPreview()}>
        <div class="text-xs text-gray-400 font-mono bg-zinc-800 p-2 rounded truncate">
          {argsPreview()}
        </div>
      </Show>
    </div>
  );
}

/**
 * ToolProgressCard - Displays tool execution progress
 */
function ToolProgressCard(props: { event: ToolProgressEvent }) {
  return (
    <div class="bg-zinc-900 border border-gray-700 rounded-lg p-3 flex items-center gap-3">
      <Icon icon="lucide:loader" class="w-4 h-4 text-yellow-400 animate-spin" />
      <span class="text-sm text-gray-300">{props.event.message}</span>
      <Show when={props.event.percent !== undefined}>
        <span class="text-xs text-gray-500 ml-auto">
          {props.event.percent}%
        </span>
      </Show>
    </div>
  );
}

/**
 * ToolFileOperationCard - Displays file operations
 */
function ToolFileOperationCard(props: { event: ToolFileOperationEvent }) {
  return (
    <div class="bg-zinc-900 border border-gray-700 rounded-lg p-3 flex items-center gap-3">
      <FileOperationBadge operation={props.event.operation} />
      <span class="text-sm text-gray-300 font-mono truncate flex-1">
        {props.event.operation.path}
      </span>
      <Show when={props.event.operation.linesChanged}>
        <span class="text-xs text-gray-500">
          {props.event.operation.linesChanged} lines
        </span>
      </Show>
    </div>
  );
}

/**
 * ToolResultCard - Displays tool completion result
 */
function ToolResultCard(props: { event: ToolResultEvent }) {
  const statusColor = () =>
    props.event.success ? "text-green-400" : "text-red-400";
  const borderColor = () =>
    props.event.success ? "border-green-700/50" : "border-red-700/50";
  const icon = () =>
    props.event.success ? "lucide:check-circle" : "lucide:x-circle";

  return (
    <div class={`bg-zinc-900 border ${borderColor()} rounded-lg p-3`}>
      <div class="flex items-center gap-2 mb-2">
        <Icon icon={icon()} class={`w-4 h-4 ${statusColor()}`} />
        <span class={`text-sm font-medium ${statusColor()}`}>
          {props.event.success ? "Success" : "Failed"}
        </span>
        <span class="text-xs text-gray-500">{props.event.toolName}</span>
        <span class="text-xs text-gray-500 ml-auto">
          {formatDuration(props.event.durationMs)}
        </span>
      </div>
      <Show when={props.event.output && props.event.output.length > 0}>
        <div class="text-xs text-gray-400 font-mono bg-zinc-800 p-2 rounded max-h-32 overflow-auto">
          {props.event.output.slice(0, 500)}
          {props.event.output.length > 500 && "..."}
        </div>
      </Show>
      <Show when={props.event.error}>
        <div class="text-xs text-red-400 mt-2">
          {props.event.error?.message}
        </div>
      </Show>
    </div>
  );
}

/**
 * ToolMetadataCard - Displays tool metadata
 */
function ToolMetadataCard(props: { event: ToolMetadataEvent }) {
  return (
    <div class="bg-zinc-900 border border-gray-700 rounded-lg p-3 flex items-center gap-3">
      <Icon icon="lucide:info" class="w-4 h-4 text-gray-500" />
      <span class="text-xs text-gray-500">{props.event.toolName}</span>
      <span class="text-xs text-gray-400">
        {props.event.key}: {String(props.event.value).slice(0, 100)}
      </span>
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
          <div class="bg-zinc-900 border border-gray-700 rounded-lg p-2">
            <StreamingOutput
              outputChunks={[event.chunk]}
              isStderr={event.stream === "stderr"}
            />
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
    <div class="h-full relative">
      {/* Scroll container */}
      <div ref={setContainerRef} class="h-full overflow-auto p-4 space-y-3">
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
