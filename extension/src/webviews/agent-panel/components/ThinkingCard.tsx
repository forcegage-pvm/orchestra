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
 * Shows thinking text with optional streaming cursor animation
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

  const PREVIEW_LINES = 2;

  // Get preview text (first N lines) for collapsed state
  const getPreviewText = () => {
    const lines = props.event.text.split("\n");
    return lines.slice(0, PREVIEW_LINES).join("\n");
  };

  // Count lines beyond the preview
  const getExtraLineCount = () => {
    const lines = props.event.text.split("\n");
    return Math.max(0, lines.length - PREVIEW_LINES);
  };

  return (
    <div class="group rounded hover:bg-zinc-800/20 transition-colors fade-in">
      {/* Header row: text + expand/collapse button */}
      <div class="px-2 pt-1.5 flex items-start gap-1.5">
        <div class="flex-1 min-w-0">
          {/* Collapsed: show preview lines as markdown */}
          <Show when={isCollapsed()}>
            <Markdown
              content={getPreviewText()}
              class="text-[13px] text-zinc-400 leading-relaxed"
            />
          </Show>

          {/* Expanded: show full text as markdown */}
          <Show when={!isCollapsed()}>
            <Markdown
              content={props.event.text}
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
          </Show>
        </div>

        {/* Expand/collapse button */}
        <Show when={getExtraLineCount() > 0}>
          <button
            onClick={toggleExpanded}
            class="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors flex-shrink-0 mt-0.5"
          >
            {isCollapsed() ? (
              <>
                <span>+{getExtraLineCount()} more</span>
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
        <Show when={props.isStreaming && getExtraLineCount() === 0}>
          <span class="inline-block w-0.5 h-3.5 mt-1 bg-purple-400 animate-blink flex-shrink-0" />
        </Show>
      </div>
      <div class="h-1" />
    </div>
  );
}
