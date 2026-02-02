/**
 * Tests for AgentEventBus
 *
 * Verifies emit/subscribe behavior, multiple subscribers, and dispose cleanup.
 */

import { describe, expect, it, vi } from "vitest";
import { AgentEventBus } from "../../../src/agents/sessions/eventBus.js";
import type { EventBusPayload } from "../../../src/agents/sessions/types.js";

describe("AgentEventBus", () => {
  it("should emit payload to a single listener", () => {
    const bus = new AgentEventBus();
    const handler = vi.fn();
    const subscription = bus.onEvent(handler);

    const payload: EventBusPayload = {
      type: "session_start",
      session: {
        id: "session-1",
        role: "implementor",
        status: "running",
        startedAt: "2026-02-01T10:00:00Z",
        taskId: 3,
        taskTitle: "EventBus test",
      },
    };

    bus.emit(payload);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(payload);

    subscription.dispose();
    bus.dispose();
  });

  it("should notify multiple subscribers for a single emit", () => {
    const bus = new AgentEventBus();
    const handlerOne = vi.fn();
    const handlerTwo = vi.fn();

    const subscriptionOne = bus.onEvent(handlerOne);
    const subscriptionTwo = bus.onEvent(handlerTwo);

    const payload: EventBusPayload = {
      type: "session_end",
      sessionId: "session-2",
      status: "completed",
    };

    bus.emit(payload);

    expect(handlerOne).toHaveBeenCalledTimes(1);
    expect(handlerOne).toHaveBeenCalledWith(payload);
    expect(handlerTwo).toHaveBeenCalledTimes(1);
    expect(handlerTwo).toHaveBeenCalledWith(payload);

    subscriptionOne.dispose();
    subscriptionTwo.dispose();
    bus.dispose();
  });

  it("should stop notifying listeners after dispose", () => {
    const bus = new AgentEventBus();
    const handler = vi.fn();
    const subscription = bus.onEvent(handler);

    const payload: EventBusPayload = {
      type: "session_end",
      sessionId: "session-3",
      status: "cancelled",
    };

    bus.emit(payload);
    expect(handler).toHaveBeenCalledTimes(1);

    bus.dispose();

    const secondPayload: EventBusPayload = {
      type: "session_end",
      sessionId: "session-3",
      status: "completed",
    };

    bus.emit(secondPayload);

    expect(handler).toHaveBeenCalledTimes(1);

    subscription.dispose();
  });
});
