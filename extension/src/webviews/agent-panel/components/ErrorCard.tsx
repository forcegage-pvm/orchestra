/**
 * ErrorCard Component
 *
 * Displays error and warning events with severity-based styling, icon, code,
 * message, and optional suggestion for recovery.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.2, 3.5
 */

import { Icon } from "@iconify-icon/solid";
import { Show } from "solid-js";
import type { ErrorEvent } from "../../../agents/sessions/types.js";

export interface ErrorCardProps {
  /** Error event to display */
  event: ErrorEvent;
}

/**
 * ErrorCard - Displays errors and warnings with severity-based styling
 *
 * Shows appropriate icon (error/warning), error code, message, and optional
 * suggestion. Color coding:
 * - Red: error severity
 * - Yellow: warning severity
 *
 * @example
 * ```tsx
 * <ErrorCard event={errorEvent} />
 * ```
 */
export function ErrorCard(props: ErrorCardProps) {
  const severityConfig = () => {
    switch (props.event.severity) {
      case "error":
        return {
          icon: "lucide:alert-circle",
          iconColor: "text-red-400",
          borderColor: "border-red-900",
          bgColor: "bg-red-950/20",
          label: "Error",
          labelColor: "text-red-400",
        };
      case "warning":
        return {
          icon: "lucide:alert-triangle",
          iconColor: "text-yellow-400",
          borderColor: "border-yellow-900",
          bgColor: "bg-yellow-950/20",
          label: "Warning",
          labelColor: "text-yellow-400",
        };
      default:
        // Fallback for unexpected severity values
        return {
          icon: "lucide:help-circle",
          iconColor: "text-gray-400",
          borderColor: "border-gray-700",
          bgColor: "bg-gray-900/20",
          label: "Unknown",
          labelColor: "text-gray-400",
        };
    }
  };

  return (
    <div
      class={`border rounded-lg p-4 animate-fadeIn ${severityConfig().borderColor} ${severityConfig().bgColor}`}
    >
      <div class="flex items-start gap-3">
        <Icon
          icon={severityConfig().icon}
          class={`w-5 h-5 ${severityConfig().iconColor} flex-shrink-0 mt-0.5`}
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-2">
            <span class={`text-sm font-medium ${severityConfig().labelColor}`}>
              {severityConfig().label}
            </span>
            <Show when={props.event.code}>
              <span class="text-xs text-gray-500 font-mono">
                [{props.event.code}]
              </span>
            </Show>
          </div>

          <div class="text-sm text-gray-300 mb-1">{props.event.message}</div>

          {/* Optional suggestion for recovery */}
          <Show when={props.event.suggestion}>
            <div class="mt-3 pt-3 border-t border-gray-800">
              <div class="flex items-start gap-2">
                <Icon
                  icon="lucide:lightbulb"
                  class="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5"
                />
                <div class="text-sm text-blue-300">
                  {props.event.suggestion}
                </div>
              </div>
            </div>
          </Show>

          {/* Recoverable indicator */}
          <Show when={props.event.recoverable !== undefined}>
            <div class="mt-2 text-xs text-gray-600">
              {props.event.recoverable ? "Recoverable" : "Non-recoverable"}
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
