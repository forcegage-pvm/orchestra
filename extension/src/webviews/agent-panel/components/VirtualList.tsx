/**
 * VirtualList Component
 *
 * Generic virtual scrolling list component wrapping @tanstack/solid-virtual.
 * Renders only visible items plus overscan buffer for optimal performance.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.1, 9
 */

import { createVirtualizer } from "@tanstack/solid-virtual";
import { For, JSX, createSignal } from "solid-js";

export interface VirtualListProps<T> {
  /** Array of items to render */
  items: T[];

  /** Height estimation function for variable-sized rows */
  estimateSize: (index: number) => number;

  /** Render function for each item */
  renderItem: (item: T, index: number) => JSX.Element;

  /** Container height in pixels */
  height: number;

  /** Optional CSS class for the container */
  class?: string;
}

/**
 * VirtualList - Efficient virtual scrolling list component
 *
 * Renders only ~50 DOM nodes at a time while supporting up to 1000 items in memory.
 * Uses @tanstack/solid-virtual for virtualization with 5-item overscan buffer.
 *
 * @example
 * ```tsx
 * <VirtualList
 *   items={events()}
 *   estimateSize={() => 80}
 *   renderItem={(event) => <EventCard event={event} />}
 *   height={600}
 * />
 * ```
 */
export function VirtualList<T>(props: VirtualListProps<T>) {
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement>();

  const virtualizer = createVirtualizer({
    get count() {
      return props.items.length;
    },
    getScrollElement: () => containerRef(),
    estimateSize: props.estimateSize,
    overscan: 5, // Render 5 extra items above/below viewport for smooth scrolling
  });

  /**
   * Programmatically scroll to a specific item index
   */
  const scrollToIndex = (
    index: number,
    options?: {
      align?: "start" | "center" | "end" | "auto";
      behavior?: ScrollBehavior;
    },
  ) => {
    virtualizer.scrollToIndex(index, options);
  };

  // Expose scrollToIndex via ref pattern (callable by parent)
  (VirtualList as any).scrollToIndex = scrollToIndex;

  return (
    <div
      ref={setContainerRef}
      class={props.class}
      style={{
        height: `${props.height}px`,
        overflow: "auto",
        position: "relative",
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        <For each={virtualizer.getVirtualItems()}>
          {(virtualItem) => (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {props.renderItem(
                props.items[virtualItem.index],
                virtualItem.index,
              )}
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
