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

  // Get first 3 lines and remaining line count for collapsed view
  const getCollapsedPreview = () => {
    const lines = props.event.text.split("\n");
    const previewLines = lines.slice(0, 3).join("\n");
    const remainingLines = Math.max(0, lines.length - 3);
    return { previewLines, remainingLines };
  };

  return (
    <div class="group rounded-md hover:bg-zinc-900/40 transition-colors fade-in">
      <div class="px-3 py-2 flex gap-3">
        <Icon
          icon="lucide:brain"
          class="w-[14px] h-[14px] text-purple-400 flex-shrink-0 mt-0.5"
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between mb-1.5">
            <div class="text-xs font-semibold text-zinc-300 tracking-tight">
              Thinking
            </div>
            <Show when={shouldAutoCollapse()}>
              <button
                onClick={toggleExpanded}
                class="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {isCollapsed() ? (
                  <>
                    <Show when={getCollapsedPreview().remainingLines > 0}>
                      <span>+{getCollapsedPreview().remainingLines} more</span>
                    </Show>
                    <Icon icon="lucide:chevron-down" class="w-3 h-3" />
                  </>
                ) : (
                  <>
                    <span>Collapse</span>
                    <Icon icon="lucide:chevron-up" class="w-3 h-3" />
                  </>
                )}
              </button>
            </Show>
          </div>

          <Show when={!isCollapsed()}>
            <div class="text-[13px] text-zinc-400 whitespace-pre-wrap break-words leading-relaxed">
              {props.event.text}
              {/* Animated cursor during streaming */}
              <Show when={props.isStreaming}>
                <span class="inline-block w-0.5 h-4 ml-1 bg-purple-400 animate-blink" />
              </Show>
            </div>

            {/* Token count if available */}
            <Show when={props.event.tokenCount !== undefined}>
              <div class="mt-2 text-[10px] text-zinc-600">
                {props.event.tokenCount} tokens
              </div>
            </Show>
          </Show>

          <Show when={isCollapsed()}>
            <div class="text-[13px] text-zinc-400 whitespace-pre-wrap break-words leading-relaxed">
              {getCollapsedPreview().previewLines}
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
