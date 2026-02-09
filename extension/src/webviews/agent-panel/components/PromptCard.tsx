/**
 * PromptCard Component
 *
 * Displays user or system prompt events with text content and optional file attachments.
 * Collapsed by default with a 4-line preview; expandable to see full content.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.2, 3.5
 */

import { Icon } from "@iconify-icon/solid";
import { createSignal, For, Show } from "solid-js";
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
  const [expanded, setExpanded] = createSignal(false);
  const isCollapsed = () => !expanded();
  const toggleExpanded = () => setExpanded(!expanded());

  const getCollapsedPreview = () => {
    const lines = props.event.text.split("\n");
    const previewLines = lines.slice(0, 4).join("\n");
    const remainingLines = Math.max(0, lines.length - 4);
    return { previewLines, remainingLines };
  };

  return (
    <div class="group rounded fade-in">
      <div class="px-2 py-1.5 flex gap-1.5">
        <Icon
          icon="lucide:message-square"
          class="w-3 h-3 text-zinc-400 flex-shrink-0 mt-0.5"
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-end mb-0.5">
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
          </div>

          <Show when={!isCollapsed()}>
            <Markdown
              content={props.event.text}
              class="text-xs text-zinc-400 leading-snug"
            />
          </Show>

          <Show when={isCollapsed()}>
            <Markdown
              content={getCollapsedPreview().previewLines}
              class="text-xs text-zinc-400 leading-snug"
            />
          </Show>

          {/* File Attachments - always visible */}
          <Show
            when={props.event.attachments && props.event.attachments.length > 0}
          >
            <div class="mt-2 pt-2 border-t border-zinc-800/50">
              <div class="text-[9px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
                Attachments ({props.event.attachments!.length})
              </div>
              <div class="space-y-0.5">
                <For each={props.event.attachments}>
                  {(attachment) => (
                    <div class="flex items-center gap-1.5 text-[10px] text-zinc-500">
                      <Icon icon="lucide:paperclip" class="w-2.5 h-2.5" />
                      <span class="truncate font-mono">{attachment.path}</span>
                      <span class="text-zinc-600">
                        ({attachment.size} bytes)
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
