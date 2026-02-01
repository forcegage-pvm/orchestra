/**
 * ToolCallHeader Component
 *
 * Displays the header for a tool call with icon, name, timestamp, status, and duration.
 * Shows formatted timestamp (HH:MM:SS), status badge with appropriate color,
 * and smart-formatted duration.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 4.1, 6.1, 6.2
 */

import { Icon } from "@iconify-icon/solid";
import { Show } from "solid-js";
import type { ToolCallAggregate } from "../../../agents/sessions/types.js";
import { ToolIcon } from "./ToolIcon.js";

export interface ToolCallHeaderProps {
  /** Tool call aggregate data */
  toolCall: ToolCallAggregate;
}

/**
 * Format duration in milliseconds to human-readable string
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string:
 * - < 1000ms: "123ms"
 * - < 60s: "12.3s"
 * - >= 60s: "2m 15s"
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Format ISO timestamp to HH:MM:SS format
 *
 * @param iso - ISO 8601 timestamp string
 * @returns Formatted time string in HH:MM:SS format (24-hour)
 */
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour12: false });
}

/**
 * Status to color mapping
 */
const STATUS_COLORS: Record<ToolCallAggregate["status"], string> = {
  pending: "text-gray-400 bg-gray-800",
  running: "text-blue-400 bg-blue-900/30 animate-pulse",
  success: "text-green-400 bg-green-900/30",
  failed: "text-red-400 bg-red-900/30",
};

/**
 * Status to icon mapping
 */
const STATUS_ICONS: Record<ToolCallAggregate["status"], string> = {
  pending: "clock",
  running: "loader-2",
  success: "check-circle",
  failed: "x-circle",
};

/**
 * ToolCallHeader - Displays tool call header with icon, name, timestamp, status, duration
 *
 * Shows tool icon, tool name, formatted timestamp (HH:MM:SS), status badge with
 * appropriate color and animation, and smart-formatted duration.
 *
 * @example
 * ```tsx
 * <ToolCallHeader toolCall={toolCallAggregate} />
 * ```
 */
export function ToolCallHeader(props: ToolCallHeaderProps) {
  const statusColorClass = () => STATUS_COLORS[props.toolCall.status];
  const statusIcon = () => STATUS_ICONS[props.toolCall.status];

  return (
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <ToolIcon
          toolName={props.toolCall.toolName}
          class="w-5 h-5 text-gray-400"
        />
        <div class="flex flex-col">
          <div class="text-sm font-medium text-gray-300">
            {props.toolCall.toolName}
          </div>
          <div class="text-xs text-gray-500">
            {formatTimestamp(props.toolCall.startedAt)}
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <Show when={props.toolCall.durationMs !== undefined}>
          <div class="text-xs text-gray-500">
            {formatDuration(props.toolCall.durationMs!)}
          </div>
        </Show>

        <div
          class={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${statusColorClass()}`}
        >
          <Icon icon={`lucide:${statusIcon()}`} class="w-3 h-3" />
          <span>{props.toolCall.status}</span>
        </div>
      </div>
    </div>
  );
}
