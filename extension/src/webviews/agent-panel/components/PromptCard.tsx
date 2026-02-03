/**
 * PromptCard Component
 *
 * Displays user or system prompt events with text content and optional file attachments.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.2, 3.5
 */

import { Icon } from "@iconify-icon/solid";
import { For, Show } from "solid-js";
import type { PromptEvent } from "../../../agents/sessions/types.js";

export interface PromptCardProps {
  /** Prompt event to display */
  event: PromptEvent;
}

/**
 * PromptCard - Displays user or system prompt with text and attachments
 *
 * Shows prompt icon, text content, and optional file attachments list.
 * Distinguishes between user and system prompts visually.
 *
 * @example
 * ```tsx
 * <PromptCard event={promptEvent} />
 * ```
 */
export function PromptCard(props: PromptCardProps) {
  return (
    <div class="group rounded-md bg-zinc-900/20 border border-zinc-900/50 fade-in">
      <div class="px-3 py-2.5 flex gap-3">
        <Icon
          icon="lucide:message-square"
          class="w-[14px] h-[14px] text-zinc-400 flex-shrink-0 mt-0.5"
        />
        <div class="flex-1 min-w-0">
          <div class="text-xs font-semibold text-zinc-300 mb-1.5 tracking-tight">
            Prompt
          </div>
          <div class="text-[13px] text-zinc-400 whitespace-pre-wrap break-words leading-relaxed">
            {props.event.text}
          </div>

          {/* File Attachments */}
          <Show
            when={props.event.attachments && props.event.attachments.length > 0}
          >
            <div class="mt-3 pt-3 border-t border-zinc-800/50">
              <div class="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-2">
                Attachments ({props.event.attachments!.length})
              </div>
              <div class="space-y-1">
                <For each={props.event.attachments}>
                  {(attachment) => (
                    <div class="flex items-center gap-2 text-[11px] text-zinc-500">
                      <Icon icon="lucide:paperclip" class="w-3 h-3" />
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
