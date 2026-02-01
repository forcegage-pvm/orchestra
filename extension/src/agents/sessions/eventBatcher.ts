/**
 * Event Batcher
 *
 * Debounces rapid event streams by batching events within 50ms windows.
 * Reduces database write overhead by persisting events in batches.
 *
 * Specification: specs/011-agent-panel-rework/tasks.md T018, Section 9
 */

import type { AgentEvent } from "./types.js";
import { insertEventBatch } from "./eventRepository.js";

/**
 * Batches events within a 50ms window to reduce database writes
 *
 * Usage:
 * ```typescript
 * const batcher = new EventBatcher(workspaceRoot);
 * batcher.queue(event1);
 * batcher.queue(event2); // Batched with event1 if within 50ms
 * // ... events are automatically flushed after 50ms
 * batcher.dispose(); // Ensure final flush on cleanup
 * ```
 */
export class EventBatcher {
  private readonly workspaceRoot: string;
  private readonly batchWindowMs = 50;
  private queuedEvents: AgentEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Queue an event for batched persistence
   *
   * First event starts a 50ms timer. Subsequent events within the window
   * are queued without rescheduling the timer.
   *
   * @param event Event to queue
   */
  queue(event: AgentEvent): void {
    this.queuedEvents.push(event);

    // Start timer on first event in batch
    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => {
        this.flush();
      }, this.batchWindowMs);
    }
  }

  /**
   * Flush all queued events to database immediately
   *
   * Clears the queue and cancels any pending timer.
   * No-op if queue is empty.
   */
  flush(): void {
    // Cancel pending timer
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    // No-op if queue is empty
    if (this.queuedEvents.length === 0) {
      return;
    }

    // Persist events in batch
    const eventsToFlush = this.queuedEvents;
    this.queuedEvents = [];
    insertEventBatch(this.workspaceRoot, eventsToFlush);
  }

  /**
   * Dispose of batcher and ensure all events are persisted
   *
   * Flushes any pending events and cancels timers.
   * Call this when session ends to prevent event loss.
   */
  dispose(): void {
    this.flush();
  }
}
