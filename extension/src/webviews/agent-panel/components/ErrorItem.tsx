/**
 * ErrorItem Component
 *
 * Displays individual error/warning entries in the Errors view with full detail:
 * - Severity icon (error/warning)
 * - Timestamp in HH:MM:SS format
 * - Tool name (when error originated from tool)
 * - Error code and message
 * - Code block for error details
 * - Suggestion with lightbulb icon
 * - Click-to-copy functionality
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.8
 */

import { Icon } from "@iconify-icon/solid";
import { createSignal, Show } from "solid-js";
import type { ErrorEvent } from "../../../agents/sessions/types.js";

export interface ErrorItemProps {
  /** Error event to display */
  event: ErrorEvent;
  /** Optional tool name when error originated from tool */
  toolName?: string;
}

/**
 * ErrorItem - Individual error/warning display for Errors tab
 *
 * Shows complete error information with copy functionality.
 * Differs from ErrorCard (used in Timeline) by adding:
 * - Timestamp display
 * - Tool name display
 * - Click-to-copy functionality
 *
 * Visual layout:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ [!] 12:34:56 • read_file                                         │
 * │ Error: FILE_NOT_FOUND                                            │
 * │ Could not find file: src/missing.ts                              │
 * │                                                                   │
 * │ ┌─────────────────────────────────────────────────────────────┐ │
 * │ │ details: { path: "src/missing.ts", reason: "ENOENT" }       │ │
 * │ └─────────────────────────────────────────────────────────────┘ │
 * │                                                                   │
 * │ 💡 Check if the file path is correct and the file exists         │
 * │                                                          [Copy]   │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <ErrorItem event={errorEvent} toolName="read_file" />
 * ```
 */
export function ErrorItem(props: ErrorItemProps) {
  const [copied, setCopied] = createSignal(false);

  const severityConfig = () => {
    switch (props.event.severity) {
      case "error":
        return {
          icon: "lucide:alert-circle",
          iconColor: "text-red-400",
          borderColor: "border-red-900",
          bgColor: "bg-red-950/20",
          label: "Error",
        };
      case "warning":
        return {
          icon: "lucide:alert-triangle",
          iconColor: "text-yellow-400",
          borderColor: "border-yellow-900",
          bgColor: "bg-yellow-950/20",
          label: "Warning",
        };
    }
  };

  /**
   * Format ISO timestamp to HH:MM:SS
   */
  const formatTime = () => {
    try {
      const date = new Date(props.event.timestamp);
      return date.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return props.event.timestamp;
    }
  };

  /**
   * Copy error message to clipboard
   */
  const handleCopy = async () => {
    try {
      const textToCopy = `${severityConfig().label}: ${props.event.code ? `[${props.event.code}] ` : ""}${props.event.message}`;
      await window.navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  return (
    <div
      class={`border rounded-lg p-4 ${severityConfig().borderColor} ${severityConfig().bgColor}`}
    >
      {/* Header: Icon, Timestamp, Tool Name */}
      <div class="flex items-center gap-2 mb-2 text-sm">
        <Icon
          icon={severityConfig().icon}
          class={`w-4 h-4 ${severityConfig().iconColor} flex-shrink-0`}
        />
        <span class="text-gray-500 font-mono">{formatTime()}</span>
        <Show when={props.toolName}>
          <span class="text-gray-500">•</span>
          <span class="text-gray-400 font-mono text-xs">{props.toolName}</span>
        </Show>
      </div>

      {/* Error Code and Message */}
      <div class="mb-2">
        <div class="flex items-center gap-2 mb-1">
          <span class={`text-sm font-medium ${severityConfig().iconColor}`}>
            {severityConfig().label}
          </span>
          <Show when={props.event.code}>
            <span class="text-xs text-gray-500 font-mono">
              [{props.event.code}]
            </span>
          </Show>
        </div>
        <div class="text-sm text-gray-300">{props.event.message}</div>
      </div>

      {/* Details Code Block */}
      <Show when={props.event.details}>
        <div class="mb-3">
          <pre class="bg-black/30 border border-gray-800 rounded p-3 text-xs font-mono text-gray-400 overflow-x-auto">
            {JSON.stringify(props.event.details, null, 2)}
          </pre>
        </div>
      </Show>

      {/* Suggestion */}
      <Show when={props.event.suggestion}>
        <div class="mb-3 pt-3 border-t border-gray-800">
          <div class="flex items-start gap-2">
            <Icon
              icon="lucide:lightbulb"
              class="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5"
            />
            <div class="text-sm text-blue-300">{props.event.suggestion}</div>
          </div>
        </div>
      </Show>

      {/* Copy Button */}
      <div class="flex justify-end">
        <button
          onClick={handleCopy}
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-300 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded transition-colors"
          title="Copy error message to clipboard"
        >
          <Icon
            icon={copied() ? "lucide:check" : "lucide:copy"}
            class="w-3 h-3"
          />
          <span>{copied() ? "Copied!" : "Copy"}</span>
        </button>
      </div>
    </div>
  );
}
