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
          iconColor: "text-rose-500",
          borderColor: "border-rose-500/10",
          bgColor: "bg-rose-500/5",
          label: "Error",
          labelColor: "text-rose-400",
        };
      case "warning":
        return {
          icon: "lucide:alert-triangle",
          iconColor: "text-yellow-400",
          borderColor: "border-yellow-500/10",
          bgColor: "bg-yellow-500/5",
          label: "Warning",
          labelColor: "text-yellow-400",
        };
      default:
        // Fallback for unexpected severity values
        return {
          icon: "lucide:help-circle",
          iconColor: "text-zinc-400",
          borderColor: "border-zinc-900/50",
          bgColor: "bg-zinc-900/20",
          label: "Unknown",
          labelColor: "text-zinc-400",
        };
    }
  };

  return (
    <div
      class={`group rounded border hover:bg-zinc-900/40 transition-colors fade-in ${severityConfig().borderColor} ${severityConfig().bgColor}`}
    >
      <div class="px-2 py-1.5 flex gap-1.5">
        <Icon
          icon={severityConfig().icon}
          class={`w-3 h-3 ${severityConfig().iconColor} flex-shrink-0 mt-0.5`}
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 mb-1">
            <span
              class={`text-[10px] font-semibold ${severityConfig().labelColor}`}
            >
              {severityConfig().label}
            </span>
            <Show when={props.event.code}>
              <span class="text-[9px] text-zinc-500 font-mono">
                [{props.event.code}]
              </span>
            </Show>
          </div>

          <div class="text-xs text-zinc-300 mb-0.5 leading-snug">
            {props.event.message}
          </div>

          {/* Optional suggestion for recovery */}
          <Show when={props.event.suggestion}>
            <div class="mt-1.5 pt-1.5 border-t border-zinc-800/50">
              <div class="flex items-start gap-1.5">
                <Icon
                  icon="lucide:lightbulb"
                  class="w-2.5 h-2.5 text-blue-400 flex-shrink-0 mt-0.5"
                />
                <div class="text-[10px] text-blue-300 leading-snug">
                  {props.event.suggestion}
                </div>
              </div>
            </div>
          </Show>

          {/* Recoverable indicator */}
          <Show when={props.event.recoverable !== undefined}>
            <div class="mt-1 text-[9px] text-zinc-600">
              {props.event.recoverable ? "Recoverable" : "Non-recoverable"}
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
