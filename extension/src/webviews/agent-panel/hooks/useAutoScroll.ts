/**
 * useAutoScroll Hook
 *
 * Smart auto-scroll behavior for timeline view with scroll position tracking,
 * pause detection, and new event counting.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 4.2
 */

import { createEffect, createSignal, onCleanup } from "solid-js";

/**
 * Distance from bottom (in pixels) to consider "near bottom"
 */
const NEAR_BOTTOM_THRESHOLD = 100;

/**
 * Hook options
 */
export interface UseAutoScrollOptions {
  /** Scroll container element accessor */
  containerRef: () => HTMLElement | undefined;

  /** Current event count for tracking new events */
  eventCount: () => number;

  /** Whether auto-scroll is enabled globally */
  enabled?: boolean;
}

/**
 * Hook return value
 */
export interface UseAutoScrollReturn {
  /** Whether scroll position is near the bottom */
  isNearBottom: () => boolean;

  /** Whether auto-scroll is currently paused (user scrolled up) */
  isPaused: () => boolean;

  /** Count of new events received while paused */
  newEventCount: () => number;

  /** Scroll to bottom of container */
  scrollToBottom: () => void;

  /** Resume auto-scroll behavior */
  resumeAutoScroll: () => void;
}

/**
 * useAutoScroll - Simple auto-scroll that scrolls to bottom on new events
 */
export function useAutoScroll(
  options: UseAutoScrollOptions,
): UseAutoScrollReturn {
  const { containerRef, eventCount, enabled = true } = options;

  const [isPaused, setIsPaused] = createSignal(false);
  const [eventCountWhenPaused, setEventCountWhenPaused] = createSignal(0);
  let lastScrollTop = 0;
  let userScrolledUp = false;
  let lastEventCount = 0;

  /**
   * Scroll to bottom of container
   */
  const scrollToBottom = () => {
    const container = containerRef();
    if (!container) return;

    container.scrollTop = container.scrollHeight;
  };

  /**
   * Resume auto-scroll behavior
   */
  const resumeAutoScroll = () => {
    userScrolledUp = false;
    setIsPaused(false);
    setEventCountWhenPaused(eventCount());
    scrollToBottom();
  };

  /**
   * Check if near bottom
   */
  const isNearBottom = () => {
    const container = containerRef();
    if (!container) return true;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceFromBottom <= NEAR_BOTTOM_THRESHOLD;
  };

  /**
   * Handle scroll to detect user scrolling up
   */
  const handleScroll = () => {
    const container = containerRef();
    if (!container) return;

    const currentScrollTop = container.scrollTop;

    // User scrolled up
    if (currentScrollTop < lastScrollTop - 10) {
      userScrolledUp = true;
      setIsPaused(true);
      if (eventCountWhenPaused() === 0) {
        setEventCountWhenPaused(eventCount());
      }
    }

    // User scrolled to bottom manually
    if (isNearBottom() && userScrolledUp) {
      userScrolledUp = false;
      setIsPaused(false);
      setEventCountWhenPaused(eventCount());
    }

    lastScrollTop = currentScrollTop;
  };

  /**
   * Auto-scroll when new events arrive (only when count actually increases)
   */
  createEffect(() => {
    const count = eventCount();
    const container = containerRef();

    if (!enabled || !container || count === 0) return;

    // Only scroll if count actually increased (new items added)
    // This prevents jumping when existing tool calls are updated
    if (count > lastEventCount && !userScrolledUp) {
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }

    lastEventCount = count;
  });

  /**
   * Set up scroll event listener
   */
  createEffect(() => {
    const container = containerRef();
    if (!container || !enabled) return;

    container.addEventListener("scroll", handleScroll, { passive: true });

    onCleanup(() => {
      container.removeEventListener("scroll", handleScroll);
    });
  });

  /**
   * Calculate new event count
   */
  const newEventCount = () => {
    if (!isPaused()) return 0;
    return Math.max(0, eventCount() - eventCountWhenPaused());
  };

  return {
    isNearBottom,
    isPaused,
    newEventCount,
    scrollToBottom,
    resumeAutoScroll,
  };
}
