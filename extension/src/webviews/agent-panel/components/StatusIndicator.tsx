/**
 * StatusIndicator Component
 *
 * Displays session status with a colored dot and optional status text.
 * Compact mode shows only the dot, used when spinner is shown elsewhere.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.2-3.3
 */

import { Show } from "solid-js";
import type { SessionStatus } from "../../../agents/sessions/types.js";

export interface StatusIndicatorProps {
  /** Current session status */
  status: SessionStatus;
  /** Compact mode - only show colored dot, no text */
  compact?: boolean;
}

/**
 * StatusIndicator - Shows session status with colored dot
 *
 * Displays a colored dot and status text.
 * In compact mode (when spinner is shown on RoleBadge), only shows the dot.
 * Color coding:
 * - Green: running/thinking
 * - Yellow: paused/waiting_for_tool
 * - Blue: completed
 * - Red: failed/cancelled
 * - Gray: initializing
 *
 * @example
 * ```tsx
 * <StatusIndicator status="running" compact={true} />
 * // Renders: ● (green dot only)
 *
 * <StatusIndicator status="failed" />
 * // Renders: ● Failed (red dot with text)
 * ```
 */
export function StatusIndicator(props: StatusIndicatorProps) {
  const statusConfig = () => {
    switch (props.status) {
      case "running":
      case "thinking":
        return {
          dotColor: "bg-green-400",
          textColor: "text-green-400",
          label: props.status === "running" ? "Running" : "Thinking",
        };
      case "paused":
      case "waiting_for_tool":
        return {
          dotColor: "bg-yellow-400",
          textColor: "text-yellow-400",
          label: props.status === "paused" ? "Paused" : "Waiting",
        };
      case "completed":
        return {
          dotColor: "bg-blue-400",
          textColor: "text-blue-400",
          label: "Completed",
        };
      case "failed":
      case "cancelled":
        return {
          dotColor: "bg-red-400",
          textColor: "text-red-400",
          label: props.status === "failed" ? "Failed" : "Cancelled",
        };
      case "initializing":
        return {
          dotColor: "bg-gray-400",
          textColor: "text-gray-400",
          label: "Initializing",
        };
      default:
        // Fallback for unexpected status values
        return {
          dotColor: "bg-gray-400",
          textColor: "text-gray-400",
          label: props.status ?? "Unknown",
        };
    }
  };

  const isActive = () => {
    return props.status === "running" || props.status === "thinking";
  };

  return (
    <div class="flex items-center gap-1.5" title={statusConfig().label}>
      <div
        class={`w-2 h-2 rounded-full ${statusConfig().dotColor} ${isActive() ? "animate-pulse" : ""}`}
      />
      {/* Show text only in non-compact mode OR when not actively running */}
      <Show when={!props.compact || !isActive()}>
        <span class={`text-xs font-medium ${statusConfig().textColor}`}>
          {statusConfig().label}
        </span>
      </Show>
    </div>
  );
}
