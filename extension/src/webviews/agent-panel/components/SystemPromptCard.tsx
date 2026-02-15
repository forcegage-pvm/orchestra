/**
 * SystemPromptCard Component
 *
 * Displays system prompts (agent instructions, coding standards, environment context)
 * as simple collapsible text entries. Collapsed by default with type indicator.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.2
 */

import { Icon } from "@iconify-icon/solid";
import { createSignal, Show } from "solid-js";
import type { PromptEvent } from "../../../agents/sessions/types.js";
import { Markdown } from "./Markdown.js";

export interface SystemPromptCardProps {
  /** Prompt event to display */
  event: PromptEvent;
  /** Type label extracted from prefix (e.g., "System Prompt", "Coding Standards") */
  typeLabel: string;
}

/**
 * Icon mapping for different system prompt types
 * NOTE: Icons must be registered in iconRegistry.ts to work offline
 */
const typeIcons: Record<string, string> = {
  "System Prompt": "lucide:scroll-text",
  "Coding Standards": "lucide:book-open",
  "Environment Context": "lucide:terminal",
  "Retry Context": "lucide:refresh-cw",
};

const defaultIcon = "lucide:file-text";

/**
 * SystemPromptCard - Displays system prompts as simple collapsible text
 *
 * Shows a minimal header with icon and label, expandable to show full content.
 * Collapsed by default to reduce visual noise.
 *
 * @example
 * ```tsx
 * <SystemPromptCard event={promptEvent} typeLabel="System Prompt" />
 * ```
 */
export function SystemPromptCard(props: SystemPromptCardProps) {
  // Start collapsed by default for system prompts
  const [expanded, setExpanded] = createSignal(false);
  const toggleExpanded = () => setExpanded(!expanded());

  // Get icon for this type
  const icon = () => typeIcons[props.typeLabel] ?? defaultIcon;

  // Get content without the type prefix
  const getContent = () => {
    // Remove the [Type]\n\n prefix from the text
    const prefixPattern = /^\[.*?\]\n\n/;
    return props.event.text.replace(prefixPattern, "");
  };

  // Count total lines for the expand indicator
  const getLineCount = () => {
    const content = getContent();
    const lines = content.split("\n");
    return lines.length;
  };

  return (
    <div class="group rounded fade-in">
      {/* Header row: icon + label + line count - matches PromptCard alignment */}
      <button
        onClick={toggleExpanded}
        class="w-full px-2 py-1.5 flex items-center gap-1.5 hover:bg-zinc-800/30 transition-colors rounded text-left"
      >
        <Icon icon={icon()} class="w-3 h-3 text-zinc-500 flex-shrink-0" />
        <span class="text-[12px] text-zinc-400">{props.typeLabel}</span>
        <span class="flex-1" />
        <span class="text-[10px] text-zinc-600">+{getLineCount()} lines</span>
        <Icon
          icon={expanded() ? "lucide:chevron-up" : "lucide:chevron-down"}
          class="w-3 h-3 text-zinc-600 flex-shrink-0"
        />
      </button>

      {/* Content - only shown when expanded */}
      <Show when={expanded()}>
        <div class="ml-5 mr-2 mb-2 px-2 py-2 rounded bg-zinc-800/30 border border-zinc-700/30">
          <Markdown
            content={getContent()}
            class="text-[12px] text-zinc-400 leading-relaxed"
          />
        </div>
      </Show>
    </div>
  );
}
