/**
 * useKeyboardNav Hook
 *
 * Keyboard navigation for timeline events with arrow key navigation,
 * Enter to expand/collapse, and Escape to clear focus.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 5.3
 */

import { createEffect, createSignal, onCleanup } from "solid-js";

/**
 * Hook options
 */
export interface UseKeyboardNavOptions {
  /** Total number of events in the timeline */
  eventCount: () => number;

  /** Callback when Enter is pressed on focused event */
  onToggleExpand?: (eventIndex: number) => void;

  /** Whether keyboard navigation is enabled */
  enabled?: boolean;
}

/**
 * Hook return value
 */
export interface UseKeyboardNavReturn {
  /** Currently focused event index (-1 if none) */
  focusedEventIndex: () => number;

  /** Move focus up (decrement index) */
  moveFocusUp: () => void;

  /** Move focus down (increment index) */
  moveFocusDown: () => void;

  /** Toggle expand/collapse on focused event */
  toggleExpand: () => void;

  /** Clear focus */
  clearFocus: () => void;
}

/**
 * useKeyboardNav - Keyboard navigation for timeline events
 *
 * Handles arrow key navigation (↑/↓), Enter to expand/collapse focused event,
 * and Escape to clear focus. Respects event count boundaries to prevent
 * out-of-bounds navigation.
 *
 * @example
 * ```tsx
 * const keyboardNav = useKeyboardNav({
 *   eventCount: () => events.length,
 *   onToggleExpand: (index) => toggleEventExpanded(index),
 * });
 *
 * return (
 *   <div>
 *     {events.map((event, index) => (
 *       <div class={keyboardNav.focusedEventIndex() === index ? 'focused-event' : ''}>
 *         {event}
 *       </div>
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useKeyboardNav(
  options: UseKeyboardNavOptions,
): UseKeyboardNavReturn {
  const { eventCount, onToggleExpand, enabled = true } = options;

  // -1 means no focus
  const [focusedEventIndex, setFocusedEventIndex] = createSignal(-1);

  /**
   * Move focus up (decrement index)
   */
  const moveFocusUp = () => {
    const currentIndex = focusedEventIndex();
    const count = eventCount();

    // If no focus yet, focus the last event
    if (currentIndex === -1) {
      if (count > 0) {
        setFocusedEventIndex(count - 1);
      }
      return;
    }

    // Decrement but don't go below 0
    if (currentIndex > 0) {
      setFocusedEventIndex(currentIndex - 1);
    }
  };

  /**
   * Move focus down (increment index)
   */
  const moveFocusDown = () => {
    const currentIndex = focusedEventIndex();
    const count = eventCount();

    // If no focus yet, focus the first event
    if (currentIndex === -1) {
      if (count > 0) {
        setFocusedEventIndex(0);
      }
      return;
    }

    // Increment but don't go beyond last event
    if (currentIndex < count - 1) {
      setFocusedEventIndex(currentIndex + 1);
    }
  };

  /**
   * Toggle expand/collapse on focused event
   */
  const toggleExpand = () => {
    const currentIndex = focusedEventIndex();
    if (currentIndex !== -1 && onToggleExpand) {
      onToggleExpand(currentIndex);
    }
  };

  /**
   * Clear focus
   */
  const clearFocus = () => {
    setFocusedEventIndex(-1);
  };

  /**
   * Handle keyboard events
   */
  const handleKeyDown = (event: KeyboardEvent) => {
    if (!enabled) return;

    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        moveFocusUp();
        break;

      case "ArrowDown":
        event.preventDefault();
        moveFocusDown();
        break;

      case "Enter":
        if (focusedEventIndex() !== -1) {
          event.preventDefault();
          toggleExpand();
        }
        break;

      case "Escape":
        event.preventDefault();
        clearFocus();
        break;
    }
  };

  /**
   * Set up keyboard event listener
   */
  createEffect(() => {
    if (!enabled) return;

    window.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  /**
   * Reset focus when event count changes to invalid index
   */
  createEffect(() => {
    const count = eventCount();
    const currentIndex = focusedEventIndex();

    // If focused index is now out of bounds, clear focus
    if (currentIndex >= count) {
      clearFocus();
    }
  });

  return {
    focusedEventIndex,
    moveFocusUp,
    moveFocusDown,
    toggleExpand,
    clearFocus,
  };
}
