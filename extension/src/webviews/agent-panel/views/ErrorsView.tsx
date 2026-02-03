/**
 * ErrorsView Component
 *
 * Main Errors tab view displaying all errors and warnings from the agent session.
 * Features:
 * - Header with error/warning counts as toggle buttons
 * - Severity filtering (error/warning toggles)
 * - Chronological error list using ErrorItem components
 * - Empty state with check icon when no errors
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.8
 */

import { Icon } from "@iconify-icon/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { ErrorEvent } from "../../../agents/sessions/types.js";
import { EmptyState, ErrorItem } from "../components/index.js";
import { events, toolCalls } from "../stores/sessionStore.js";

/**
 * ErrorsView - Aggregated view of all errors and warnings
 *
 * Displays all error events from the session with severity filtering:
 * - Toggle between errors and warnings
 * - Chronological list (newest first)
 * - Click-to-copy functionality on each error
 * - Empty state when no errors/warnings
 *
 * Visual layout:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ [●] Errors (3)    [●] Warnings (1)                              │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ [!] 12:34:56 • read_file                                         │
 * │ Error: FILE_NOT_FOUND                                            │
 * │ Could not find file: src/missing.ts                              │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ [▲] 12:33:42 • semantic_search                                   │
 * │ Warning: SEARCH_TIMEOUT                                          │
 * │ Search timed out after 30 seconds                                │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * Empty state:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                   ✓                                              │
 * │         No errors or warnings — looking good! ✓                  │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <ErrorsView />
 * ```
 */
export function ErrorsView() {
  // Toggle state for severity filters (both enabled by default)
  const [showErrors, setShowErrors] = createSignal(true);
  const [showWarnings, setShowWarnings] = createSignal(true);

  /**
   * Get all error events from the events store
   */
  const allErrors = createMemo(() => {
    const errorEvents: ErrorEvent[] = [];

    Object.values(events).forEach((event) => {
      if (event.type === "error") {
        errorEvents.push(event);
      }
    });

    // Sort chronologically (newest first)
    return errorEvents.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  });

  /**
   * Count errors by severity
   */
  const errorCount = createMemo(() => {
    return allErrors().filter((e) => e.severity === "error").length;
  });

  const warningCount = createMemo(() => {
    return allErrors().filter((e) => e.severity === "warning").length;
  });

  /**
   * Filter errors based on severity toggles
   */
  const filteredErrors = createMemo(() => {
    return allErrors().filter((error) => {
      if (error.severity === "error" && showErrors()) return true;
      if (error.severity === "warning" && showWarnings()) return true;
      return false;
    });
  });

  /**
   * Get tool name for an error event (if error originated from tool)
   */
  const getToolName = (error: ErrorEvent): string | undefined => {
    // Find tool call that matches this error's timing/context
    // For now, we can enhance this by looking at toolCalls store
    // to find which tool was executing when the error occurred
    const toolCallsArray = Object.values(toolCalls);

    // Find tool call with matching session context
    const matchingTool = toolCallsArray.find(
      (tc) =>
        tc.error &&
        tc.completedAt &&
        Math.abs(
          new Date(tc.completedAt).getTime() -
            new Date(error.timestamp).getTime(),
        ) < 1000,
    );

    return matchingTool?.toolName;
  };

  return (
    <div class="flex flex-col h-full">
      {/* Header with Severity Toggle Buttons */}
      <div class="flex items-center gap-2 p-4 border-b border-gray-800">
        {/* Errors Toggle */}
        <button
          onClick={() => setShowErrors(!showErrors())}
          class={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
            showErrors()
              ? "bg-red-950/20 border-red-900 text-red-400"
              : "bg-gray-800 border-gray-700 text-gray-500"
          }`}
          title={`${showErrors() ? "Hide" : "Show"} errors`}
        >
          <Icon
            icon="lucide:alert-circle"
            class={`w-4 h-4 ${showErrors() ? "text-red-400" : "text-gray-500"}`}
          />
          <span class="text-sm font-medium">Errors ({errorCount()})</span>
        </button>

        {/* Warnings Toggle */}
        <button
          onClick={() => setShowWarnings(!showWarnings())}
          class={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
            showWarnings()
              ? "bg-yellow-950/20 border-yellow-900 text-yellow-400"
              : "bg-gray-800 border-gray-700 text-gray-500"
          }`}
          title={`${showWarnings() ? "Hide" : "Show"} warnings`}
        >
          <Icon
            icon="lucide:alert-triangle"
            class={`w-4 h-4 ${showWarnings() ? "text-yellow-400" : "text-gray-500"}`}
          />
          <span class="text-sm font-medium">Warnings ({warningCount()})</span>
        </button>
      </div>

      {/* Empty State */}
      <Show when={filteredErrors().length === 0}>
        <EmptyState
          icon="lucide:check-circle"
          message="No errors or warnings — looking good! ✓"
        />
      </Show>

      {/* Error List */}
      <Show when={filteredErrors().length > 0}>
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <For each={filteredErrors()}>
            {(error) => (
              <ErrorItem event={error} toolName={getToolName(error)} />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
