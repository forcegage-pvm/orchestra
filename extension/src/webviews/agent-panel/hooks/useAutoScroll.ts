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
 * useAutoScroll - Smart auto-scroll with pause detection
 *
 * Tracks scroll position and automatically scrolls to bottom when new events
 * arrive, unless the user has scrolled up. Shows new event count when paused.
 *
 * @example
 * ```tsx
 * const [containerRef, setContainerRef] = createSignal<HTMLElement>();
 * const autoScroll = useAutoScroll({
 *   containerRef,
 *   eventCount: () => events.length,
 * });
 *
 * return (
 *   <div ref={setContainerRef}>
 *     {autoScroll.isPaused() && (
 *       <NewEventsIndicator count={autoScroll.newEventCount()} />
 *     )}
 *   </div>
 * );
 * ```
 */
export function useAutoScroll(
  options: UseAutoScrollOptions,
): UseAutoScrollReturn {
  const { containerRef, eventCount, enabled = true } = options;

  const [isNearBottom, setIsNearBottom] = createSignal(true);
  const [isPaused, setIsPaused] = createSignal(false);
  const [eventCountWhenPaused, setEventCountWhenPaused] = createSignal(0);

  /**
   * Calculate if scroll position is near bottom
   */
  const checkIfNearBottom = (container: HTMLElement): boolean => {
    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    return distanceFromBottom <= NEAR_BOTTOM_THRESHOLD;
  };

  /**
   * Scroll to bottom of container
   */
  const scrollToBottom = () => {
    const container = containerRef();
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "smooth",
    });
  };

  /**
   * Resume auto-scroll and reset counters
   */
  const resumeAutoScroll = () => {
    setIsPaused(false);
    setEventCountWhenPaused(eventCount());
    scrollToBottom();
  };

  /**
   * Handle scroll events to track position
   */
  const handleScroll = () => {
    const container = containerRef();
    if (!container || !enabled) return;

    const nearBottom = checkIfNearBottom(container);
    setIsNearBottom(nearBottom);

    // If user scrolled near bottom, consider it a manual resume
    if (nearBottom && isPaused()) {
      setIsPaused(false);
      setEventCountWhenPaused(eventCount());
    }
    // If user scrolled up from bottom, pause auto-scroll
    else if (!nearBottom && !isPaused()) {
      setIsPaused(true);
      setEventCountWhenPaused(eventCount());
    }
  };

  /**
   * Auto-scroll when new events arrive (if not paused)
   */
  createEffect(() => {
    const count = eventCount(); // Track dependency
    const paused = isPaused();
    const nearBottom = isNearBottom();

    if (!enabled || !containerRef()) return;

    // Auto-scroll if near bottom and not paused
    if (nearBottom && !paused) {
      scrollToBottom();
    }
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
   * Initialize on mount
   */
  createEffect(() => {
    const container = containerRef();
    if (container && enabled) {
      // Check initial scroll position
      const nearBottom = checkIfNearBottom(container);
      setIsNearBottom(nearBottom);
      setEventCountWhenPaused(eventCount());
    }
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
