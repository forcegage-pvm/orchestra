/**
 * ThinkingCard Component
 *
 * Displays agent thinking/reasoning events with streaming text, animated cursor,
 * and collapse/expand functionality. Collapsed by default; auto-expands during
 * streaming and auto-collapses when streaming completes.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.2, 3.5
 */

import { Icon } from "@iconify-icon/solid";
import { createEffect, createSignal, Show } from "solid-js";
import type { ThinkingEvent } from "../../../agents/sessions/types.js";
import { Markdown } from "./Markdown.js";

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
 * and collapse/expand functionality. Starts collapsed, auto-expands during
 * streaming, and auto-collapses when streaming completes.
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
  // Start collapsed by default
  const [expanded, setExpanded] = createSignal(false);

  const isCollapsed = () => !expanded();

  const toggleExpanded = () => {
    setExpanded(!expanded());
  };

  // Auto-expand when streaming starts, auto-collapse when it ends
  let wasStreaming = false;
  createEffect(() => {
    const streaming = props.isStreaming ?? false;
    if (streaming && !wasStreaming) {
      setExpanded(true);
    } else if (!streaming && wasStreaming) {
      setExpanded(false);
    }
    wasStreaming = streaming;
  });

  // Split text into first line (shown in header) and remaining lines
  const getFirstLine = () => {
    const lines = props.event.text.split("\n");
    return lines[0] || "";
  };

  const getRemainingText = () => {
    const lines = props.event.text.split("\n");
    if (lines.length <= 1) return "";
    return lines.slice(1).join("\n");
  };

  const getRemainingLineCount = () => {
    const lines = props.event.text.split("\n");
    return Math.max(0, lines.length - 1);
  };

  return (
    <div class="group rounded hover:bg-zinc-800/20 transition-colors fade-in">
      {/* Header row: icon + first line of thinking text + expand/collapse */}
      <div class="px-2 py-1.5 flex items-center gap-1.5">
        <Icon
          icon="lucide:brain"
          class="w-3 h-3 text-purple-400 flex-shrink-0"
        />
        <span class="text-[13px] text-zinc-400 truncate min-w-0 flex-1">
          {getFirstLine()}
          <Show when={props.isStreaming && getRemainingLineCount() === 0}>
            <span class="inline-block w-0.5 h-3.5 ml-1 bg-purple-400 animate-blink align-middle" />
          </Show>
        </span>
        <Show when={getRemainingLineCount() > 0}>
          <button
            onClick={toggleExpanded}
            class="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0"
          >
            {isCollapsed() ? (
              <>
                <span>+{getRemainingLineCount()} more</span>
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

      {/* Expanded: remaining lines below the first line */}
      <Show when={!isCollapsed() && getRemainingLineCount() > 0}>
        <div class="px-2 pb-1.5 pl-7">
          <Markdown
            content={getRemainingText()}
            class="text-[13px] text-zinc-400 leading-relaxed"
          />
          {/* Animated cursor during streaming */}
          <Show when={props.isStreaming}>
            <span class="inline-block w-0.5 h-4 ml-1 bg-purple-400 animate-blink" />
          </Show>

          {/* Token count if available */}
          <Show when={props.event.tokenCount !== undefined}>
            <div class="mt-2 text-[10px] text-zinc-600">
              {props.event.tokenCount} tokens
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
