/**
 * EmptyState Component
 *
 * Configurable empty state display for when no content exists.
 * Supports 5 different contexts: Timeline, Tools, Files, Errors, and Filter results.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.9 Empty States
 */

import { Icon } from "@iconify-icon/solid";

export interface EmptyStateProps {
  /** Iconify icon name (e.g., "lucide:loader", "lucide:wrench") */
  icon: string;
  /** Context-specific message to display */
  message: string;
}

/**
 * EmptyState - Configurable empty state display
 *
 * Renders a centered icon and message when no content exists (not the same as loading state).
 * Used across all views with context-specific icons and messages:
 * - Timeline: "No events yet. Waiting for agent to start..." with loader icon
 * - Tools: "No tool calls recorded in this session" with wrench icon
 * - Files: "No files modified in this session" with folder-open icon
 * - Errors: "No errors or warnings — looking good! ✓" with check-circle icon
 * - Filter: "No events match '{filterText}'" with search-x icon
 *
 * Visual layout:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                                                                  │
 * │                          [ICON]                                  │
 * │                          Message                                 │
 * │                                                                  │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <Show when={hasData} fallback={
 *   <EmptyState icon="lucide:wrench" message="No tool calls recorded" />
 * }>
 *   <ActualContent />
 * </Show>
 * ```
 */
export function EmptyState(props: EmptyStateProps) {
  return (
    <div class="flex flex-col items-center justify-center h-full text-gray-500 p-8">
      <Icon icon={props.icon} class="w-12 h-12 mb-3 text-gray-600" />
      <p class="text-sm text-center">{props.message}</p>
    </div>
  );
}
