/**
 * NewEventsIndicator Component
 *
 * Badge component showing count of new events with scroll-to-bottom action.
 * Appears when auto-scroll is paused (user scrolled up).
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.2, 4.2
 */

import { Show } from "solid-js";

export interface NewEventsIndicatorProps {
  /** Count of new events since scroll pause */
  count: number;

  /** Callback to scroll to bottom and resume auto-scroll */
  onScrollToBottom: () => void;

  /** Whether indicator is visible */
  visible: boolean;
}

/**
 * NewEventsIndicator - Floating badge for new events
 *
 * Displays "↓ N new events" badge when auto-scroll is paused.
 * Click to scroll to bottom and resume auto-scroll.
 *
 * @example
 * ```tsx
 * <NewEventsIndicator
 *   count={autoScroll.newEventCount()}
 *   onScrollToBottom={autoScroll.resumeAutoScroll}
 *   visible={autoScroll.isPaused()}
 * />
 * ```
 */
export function NewEventsIndicator(props: NewEventsIndicatorProps) {
  return (
    <Show when={props.visible && props.count > 0}>
      <div class="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-50">
        <button
          class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 transition-colors"
          onClick={props.onScrollToBottom}
          aria-label={`Scroll to bottom (${props.count} new events)`}
        >
          <svg
            class="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
          <span class="font-medium">
            {props.count} new event{props.count !== 1 ? "s" : ""}
          </span>
        </button>
      </div>
    </Show>
  );
}
