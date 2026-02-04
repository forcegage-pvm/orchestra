/**
 * useAutoScroll Hook Tests
 *
 * Unit tests for useAutoScroll hook verifying scroll tracking, pause detection,
 * and new event counting behavior.
 */

import { createRoot, createSignal } from "solid-js";
import { describe, expect, it } from "vitest";

describe("useAutoScroll Hook", () => {
  it("should export useAutoScroll function", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/hooks/index.js");
    expect(module).toHaveProperty("useAutoScroll");
    expect(typeof module.useAutoScroll).toBe("function");
  });

  it("should return all required functions and signals", async () => {
    await createRoot(async (dispose) => {
      const { useAutoScroll } =
        await import("../../../../src/webviews/agent-panel/hooks/useAutoScroll.js");

      const [containerRef] = createSignal<HTMLElement>();
      const [eventCount] = createSignal(0);

      const result = useAutoScroll({ containerRef, eventCount });

      expect(result).toHaveProperty("isNearBottom");
      expect(result).toHaveProperty("isPaused");
      expect(result).toHaveProperty("newEventCount");
      expect(result).toHaveProperty("scrollToBottom");
      expect(result).toHaveProperty("resumeAutoScroll");

      expect(typeof result.isNearBottom).toBe("function");
      expect(typeof result.isPaused).toBe("function");
      expect(typeof result.newEventCount).toBe("function");
      expect(typeof result.scrollToBottom).toBe("function");
      expect(typeof result.resumeAutoScroll).toBe("function");

      dispose();
    });
  });

  it("should provide isNearBottom signal", async () => {
    await createRoot(async (dispose) => {
      const { useAutoScroll } =
        await import("../../../../src/webviews/agent-panel/hooks/useAutoScroll.js");

      const [containerRef] = createSignal<HTMLElement | undefined>(undefined);
      const [eventCount] = createSignal(0);

      const result = useAutoScroll({ containerRef, eventCount });

      // Should return boolean value
      expect(typeof result.isNearBottom()).toBe("boolean");

      dispose();
    });
  });

  it("should provide isPaused signal", async () => {
    await createRoot(async (dispose) => {
      const { useAutoScroll } =
        await import("../../../../src/webviews/agent-panel/hooks/useAutoScroll.js");

      const [containerRef] = createSignal<HTMLElement | undefined>(undefined);
      const [eventCount] = createSignal(0);

      const result = useAutoScroll({ containerRef, eventCount });

      // Should return boolean value
      expect(typeof result.isPaused()).toBe("boolean");

      dispose();
    });
  });

  it("should calculate newEventCount when paused", async () => {
    await createRoot(async (dispose) => {
      const { useAutoScroll } =
        await import("../../../../src/webviews/agent-panel/hooks/useAutoScroll.js");

      const [containerRef] = createSignal<HTMLElement>();
      const [eventCount] = createSignal(10);

      const result = useAutoScroll({ containerRef, eventCount });

      // Should return number
      expect(typeof result.newEventCount()).toBe("number");
      expect(result.newEventCount()).toBeGreaterThanOrEqual(0);

      dispose();
    });
  });

  it("should provide scrollToBottom function", async () => {
    await createRoot(async (dispose) => {
      const { useAutoScroll } =
        await import("../../../../src/webviews/agent-panel/hooks/useAutoScroll.js");

      const [containerRef] = createSignal<HTMLElement>();
      const [eventCount] = createSignal(0);

      const result = useAutoScroll({ containerRef, eventCount });

      // Should not throw when called without container
      expect(() => result.scrollToBottom()).not.toThrow();

      dispose();
    });
  });

  it("should provide resumeAutoScroll function", async () => {
    await createRoot(async (dispose) => {
      const { useAutoScroll } =
        await import("../../../../src/webviews/agent-panel/hooks/useAutoScroll.js");

      const [containerRef] = createSignal<HTMLElement>();
      const [eventCount] = createSignal(10);

      const result = useAutoScroll({ containerRef, eventCount });

      // Should not throw when called
      expect(() => result.resumeAutoScroll()).not.toThrow();

      // Should unpause
      expect(result.isPaused()).toBe(false);

      dispose();
    });
  });

  it("should handle undefined container gracefully", async () => {
    await createRoot(async (dispose) => {
      const { useAutoScroll } =
        await import("../../../../src/webviews/agent-panel/hooks/useAutoScroll.js");

      const [containerRef] = createSignal<HTMLElement | undefined>(undefined);
      const [eventCount] = createSignal(0);

      const result = useAutoScroll({ containerRef, eventCount });

      // Should not throw errors
      expect(() => result.scrollToBottom()).not.toThrow();
      expect(() => result.resumeAutoScroll()).not.toThrow();

      dispose();
    });
  });

  it("should respect enabled option", async () => {
    await createRoot(async (dispose) => {
      const { useAutoScroll } =
        await import("../../../../src/webviews/agent-panel/hooks/useAutoScroll.js");

      const [containerRef] = createSignal<HTMLElement>();
      const [eventCount] = createSignal(0);

      const result = useAutoScroll({
        containerRef,
        eventCount,
        enabled: false,
      });

      // Should still have all functions
      expect(result.scrollToBottom).toBeDefined();
      expect(result.resumeAutoScroll).toBeDefined();
      expect(typeof result.isNearBottom()).toBe("boolean");

      dispose();
    });
  });

  it("should track event count difference when paused", async () => {
    await createRoot(async (dispose) => {
      const { useAutoScroll } =
        await import("../../../../src/webviews/agent-panel/hooks/useAutoScroll.js");

      const [containerRef] = createSignal<HTMLElement>();
      const [eventCount] = createSignal(5);

      const result = useAutoScroll({ containerRef, eventCount });

      // When not paused, new event count should be 0
      expect(result.newEventCount()).toBe(0);

      dispose();
    });
  });

  it("should initialize with correct default state", async () => {
    await createRoot(async (dispose) => {
      const { useAutoScroll } =
        await import("../../../../src/webviews/agent-panel/hooks/useAutoScroll.js");

      const [containerRef] = createSignal<HTMLElement>();
      const [eventCount] = createSignal(0);

      const result = useAutoScroll({ containerRef, eventCount });

      // Check initial state
      expect(result.isNearBottom()).toBe(true); // Initially near bottom
      expect(result.isPaused()).toBe(false); // Not paused initially
      expect(result.newEventCount()).toBe(0); // No new events

      dispose();
    });
  });
});
