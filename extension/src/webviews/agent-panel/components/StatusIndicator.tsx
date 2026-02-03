/**
 * StatusIndicator Component
 *
 * Displays session status with an animated dot and status text.
 * The dot pulses when status is 'running' or 'thinking'.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.2-3.3
 */

import { Show } from "solid-js";
import type { SessionStatus } from "../../../agents/sessions/types.js";

export interface StatusIndicatorProps {
  /** Current session status */
  status: SessionStatus;
}

/**
 * StatusIndicator - Shows session status with animated dot
 *
 * Displays a colored dot (animated when active) and status text.
 * Color coding:
 * - Green: running/thinking
 * - Yellow: paused/waiting_for_tool
 * - Blue: completed
 * - Red: failed/cancelled
 * - Gray: initializing
 *
 * @example
 * ```tsx
 * <StatusIndicator status="running" />
 * // Renders: ● Running (with pulsing green dot)
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
          animate: true,
        };
      case "paused":
      case "waiting_for_tool":
        return {
          dotColor: "bg-yellow-400",
          textColor: "text-yellow-400",
          label: props.status === "paused" ? "Paused" : "Waiting for Tool",
          animate: false,
        };
      case "completed":
        return {
          dotColor: "bg-blue-400",
          textColor: "text-blue-400",
          label: "Completed",
          animate: false,
        };
      case "failed":
      case "cancelled":
        return {
          dotColor: "bg-red-400",
          textColor: "text-red-400",
          label: props.status === "failed" ? "Failed" : "Cancelled",
          animate: false,
        };
      case "initializing":
        return {
          dotColor: "bg-gray-400",
          textColor: "text-gray-400",
          label: "Initializing",
          animate: false,
        };
      default:
        // Fallback for unexpected status values
        return {
          dotColor: "bg-gray-400",
          textColor: "text-gray-400",
          label: props.status ?? "Unknown",
          animate: false,
        };
    }
  };

  const isAnimating = () => {
    return props.status === "running" || props.status === "thinking";
  };

  return (
    <div class="flex items-center gap-2">
      <Show
        when={isAnimating()}
        fallback={
          <div class={`w-2.5 h-2.5 rounded-full ${statusConfig().dotColor}`} />
        }
      >
        {/* Spinning ring when running/thinking */}
        <div class="w-4 h-4 relative flex items-center justify-center">
          <div class="w-3.5 h-3.5 border-2 border-green-400/30 rounded-full" />
          <div class="absolute w-3.5 h-3.5 border-2 border-transparent border-t-green-400 rounded-full animate-spin" />
        </div>
      </Show>
      <span class={`text-base font-semibold ${statusConfig().textColor}`}>
        {statusConfig().label}
      </span>
    </div>
  );
}
