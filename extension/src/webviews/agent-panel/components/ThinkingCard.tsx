/**
 * ThinkingCard Component
 *
 * Displays agent thinking/reasoning events with streaming text, animated cursor,
 * and collapse/expand functionality with auto-collapse when thinking completes.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.2, 3.5
 */

import { Icon } from "@iconify-icon/solid";
import { createSignal, Show } from "solid-js";
import type { ThinkingEvent } from "../../../agents/sessions/types.js";

export interface ThinkingCardProps {
  /** Thinking event to display */
  event: ThinkingEvent;

  /** Whether thinking is still in progress (shows animated cursor) */
  isStreaming?: boolean;

  /** Auto-collapse when thinking completes */
  autoCollapse?: boolean;
}

/**
 * ThinkingCard - Displays agent thinking with streaming text and cursor
 *
 * Shows brain icon, thinking text with optional streaming cursor animation,
 * and collapse/expand functionality. Auto-collapses when thinking completes
 * if autoCollapse prop is true.
 *
 * @example
 * ```tsx
 * <ThinkingCard
 *   event={thinkingEvent}
 *   isStreaming={true}
 *   autoCollapse={true}
 * />
 * ```
 */
export function ThinkingCard(props: ThinkingCardProps) {
  const [expanded, setExpanded] = createSignal(!props.autoCollapse);

  // Auto-collapse when streaming ends if autoCollapse is enabled
  const shouldAutoCollapse = () => {
    return props.autoCollapse && !props.isStreaming;
  };

  // Determine if card should be collapsed
  const isCollapsed = () => {
    return shouldAutoCollapse() && !expanded();
  };

  const toggleExpanded = () => {
    setExpanded(!expanded());
  };

  return (
    <div class="bg-zinc-900 border border-gray-700 rounded-lg p-4">
      <div class="flex items-start gap-3">
        <Icon
          icon="lucide:brain"
          class="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5"
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between mb-2">
            <div class="text-sm font-medium text-gray-300">Thinking</div>
            <Show when={shouldAutoCollapse()}>
              <button
                onClick={toggleExpanded}
                class="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                {isCollapsed() ? "Expand" : "Collapse"}
              </button>
            </Show>
          </div>

          <Show when={!isCollapsed()}>
            <div class="text-sm text-gray-400 whitespace-pre-wrap break-words">
              {props.event.text}
              {/* Animated cursor during streaming */}
              <Show when={props.isStreaming}>
                <span class="inline-block w-1 h-4 ml-1 bg-purple-400 animate-blink" />
              </Show>
            </div>

            {/* Token count if available */}
            <Show when={props.event.tokenCount !== undefined}>
              <div class="mt-2 text-xs text-gray-600">
                {props.event.tokenCount} tokens
              </div>
            </Show>
          </Show>

          <Show when={isCollapsed()}>
            <div class="text-sm text-gray-600 italic">
              Thinking... (click Expand to view)
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
