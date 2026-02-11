/**
 * SystemPromptCard Component
 *
 * Displays system prompts (agent instructions, coding standards, environment context)
 * with a distinct visual style. Collapsed by default with type indicator.
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
 * Color and icon mapping for different system prompt types
 */
const typeStyles: Record<
  string,
  { icon: string; colorClass: string; bgClass: string }
> = {
  "System Prompt": {
    icon: "lucide:scroll-text",
    colorClass: "text-purple-400",
    bgClass: "bg-purple-500/10 border-purple-500/20",
  },
  "Coding Standards": {
    icon: "lucide:book-check",
    colorClass: "text-blue-400",
    bgClass: "bg-blue-500/10 border-blue-500/20",
  },
  "Environment Context": {
    icon: "lucide:settings-2",
    colorClass: "text-amber-400",
    bgClass: "bg-amber-500/10 border-amber-500/20",
  },
  "Retry Context": {
    icon: "lucide:refresh-cw",
    colorClass: "text-orange-400",
    bgClass: "bg-orange-500/10 border-orange-500/20",
  },
};

const defaultStyle = {
  icon: "lucide:file-text",
  colorClass: "text-zinc-400",
  bgClass: "bg-zinc-500/10 border-zinc-500/20",
};

/**
 * SystemPromptCard - Displays system prompts with distinct styling
 *
 * Shows a collapsible card with type badge, icon, and full content.
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

  // Get style for this type
  const style = () => typeStyles[props.typeLabel] ?? defaultStyle;

  // Get content without the type prefix
  const getContent = () => {
    // Remove the [Type]\n\n prefix from the text
    const prefixPattern = /^\[.*?\]\n\n/;
    return props.event.text.replace(prefixPattern, "");
  };

  // Get preview (first 3 lines)
  const getPreview = () => {
    const content = getContent();
    const lines = content.split("\n");
    return lines.slice(0, 3).join("\n");
  };

  // Count extra lines beyond preview
  const getExtraLineCount = () => {
    const content = getContent();
    const lines = content.split("\n");
    return Math.max(0, lines.length - 3);
  };

  return (
    <div
      class={`rounded-md border transition-colors ${style().bgClass} fade-in`}
    >
      {/* Header row: icon + type badge + expand/collapse */}
      <button
        onClick={toggleExpanded}
        class="w-full px-3 py-2 flex items-center gap-2 hover:bg-white/5 transition-colors rounded-t-md"
      >
        <Icon icon={style().icon} class={`w-4 h-4 ${style().colorClass}`} />
        <span
          class={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${style().colorClass} border-current/30`}
        >
          {props.typeLabel}
        </span>
        <span class="flex-1" />
        <span class="text-[10px] text-zinc-500">
          {expanded() ? "Collapse" : `+${getExtraLineCount()} lines`}
        </span>
        <Icon
          icon={expanded() ? "lucide:chevron-up" : "lucide:chevron-down"}
          class="w-3 h-3 text-zinc-500"
        />
      </button>

      {/* Content */}
      <div class="px-3 pb-2">
        <Show when={!expanded()}>
          <div class="text-[12px] text-zinc-500 leading-relaxed line-clamp-3">
            <Markdown content={getPreview()} class="text-zinc-500" />
          </div>
        </Show>
        <Show when={expanded()}>
          <Markdown
            content={getContent()}
            class="text-[12px] text-zinc-400 leading-relaxed"
          />
        </Show>
      </div>
    </div>
  );
}
