/**
 * PromptCard Component
 *
 * Displays user or system prompt events with text content and optional file attachments.
 * Collapsed by default with a 4-line preview; expandable to see full content.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.2, 3.5
 */

import { Icon } from "@iconify-icon/solid";
import { marked } from "marked";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import type { PromptEvent } from "../../../agents/sessions/types.js";
import { Markdown } from "./Markdown.js";

export interface PromptCardProps {
  /** Prompt event to display */
  event: PromptEvent;
}

/**
 * PromptCard - Displays user or system prompt with text and attachments
 *
 * Shows prompt icon, text content (collapsed by default with 4-line preview),
 * and optional file attachments list. Attachments always visible.
 *
 * @example
 * ```tsx
 * <PromptCard event={promptEvent} />
 * ```
 */
export function PromptCard(props: PromptCardProps) {
  // Start expanded, auto-collapse after 2s
  const [expanded, setExpanded] = createSignal(true);
  const isCollapsed = () => !expanded();
  const toggleExpanded = () => setExpanded(!expanded());

  // Auto-collapse after 2 seconds on mount
  onMount(() => {
    const timer = setTimeout(() => {
      setExpanded(false);
    }, 2000);
    return () => clearTimeout(timer);
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

  // Render first line as inline markdown (no wrapping <p> tags)
  const firstLineHtml = createMemo(() => {
    const line = getFirstLine();
    if (!line) return "";
    try {
      return marked.parseInline(line, { gfm: true }) as string;
    } catch {
      return line;
    }
  });

  return (
    <div class="group rounded fade-in">
      {/* Header row: icon + first line of prompt text + expand/collapse */}
      <div class="px-2 py-1.5 flex items-center gap-1.5">
        <Icon
          icon="lucide:message-square"
          class="w-3 h-3 text-zinc-400 flex-shrink-0"
        />
        <span
          class="text-xs text-zinc-400 truncate min-w-0 flex-1 markdown-content"
          innerHTML={firstLineHtml()}
        />
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
            class="text-xs text-zinc-400 leading-snug"
          />
        </div>
      </Show>

      {/* File Attachments - always visible */}
      <Show
        when={props.event.attachments && props.event.attachments.length > 0}
      >
        <div class="mx-2 mt-1 pt-2 pl-5 border-t border-zinc-800/50">
          <div class="text-[9px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
            Attachments ({props.event.attachments!.length})
          </div>
          <div class="space-y-0.5">
            <For each={props.event.attachments}>
              {(attachment) => (
                <div class="flex items-center gap-1.5 text-[10px] text-zinc-500">
                  <Icon icon="lucide:paperclip" class="w-2.5 h-2.5" />
                  <span class="truncate font-mono">{attachment.path}</span>
                  <span class="text-zinc-600">({attachment.size} bytes)</span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
