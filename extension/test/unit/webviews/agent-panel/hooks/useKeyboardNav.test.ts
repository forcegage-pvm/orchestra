/**
 * useKeyboardNav Hook Tests
 *
 * Unit tests for useKeyboardNav hook verifying keyboard event handling,
 * navigation boundary checks, expand/collapse, and focus management.
 */

import { createRoot, createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";

describe("useKeyboardNav Hook", () => {
  it("should export useKeyboardNav function", async () => {
    const module =
      await import("../../../../../src/webviews/agent-panel/hooks/index.js");
    expect(module).toHaveProperty("useKeyboardNav");
    expect(typeof module.useKeyboardNav).toBe("function");
  });

  it("should return all required functions and signals", async () => {
    await createRoot(async (dispose) => {
      const { useKeyboardNav } =
        await import("../../../../../src/webviews/agent-panel/hooks/useKeyboardNav.js");

      const [eventCount] = createSignal(0);

      const result = useKeyboardNav({ eventCount });

      expect(result).toHaveProperty("focusedEventIndex");
      expect(result).toHaveProperty("moveFocusUp");
      expect(result).toHaveProperty("moveFocusDown");
      expect(result).toHaveProperty("toggleExpand");
      expect(result).toHaveProperty("clearFocus");

      expect(typeof result.focusedEventIndex).toBe("function");
      expect(typeof result.moveFocusUp).toBe("function");
      expect(typeof result.moveFocusDown).toBe("function");
      expect(typeof result.toggleExpand).toBe("function");
      expect(typeof result.clearFocus).toBe("function");

      dispose();
    });
  });

  it("should initialize with no focus (-1)", async () => {
    await createRoot(async (dispose) => {
      const { useKeyboardNav } =
        await import("../../../../../src/webviews/agent-panel/hooks/useKeyboardNav.js");

      const [eventCount] = createSignal(5);

      const result = useKeyboardNav({ eventCount });

      expect(result.focusedEventIndex()).toBe(-1);

      dispose();
    });
  });

  it("should move focus down from -1 to 0", async () => {
    await createRoot(async (dispose) => {
      const { useKeyboardNav } =
        await import("../../../../../src/webviews/agent-panel/hooks/useKeyboardNav.js");

      const [eventCount] = createSignal(5);

      const result = useKeyboardNav({ eventCount });

      expect(result.focusedEventIndex()).toBe(-1);

      result.moveFocusDown();
      expect(result.focusedEventIndex()).toBe(0);

      dispose();
    });
  });

  it("should move focus up from -1 to last event", async () => {
    await createRoot(async (dispose) => {
      const { useKeyboardNav } =
        await import("../../../../../src/webviews/agent-panel/hooks/useKeyboardNav.js");

      const [eventCount] = createSignal(5);

      const result = useKeyboardNav({ eventCount });

      expect(result.focusedEventIndex()).toBe(-1);

      result.moveFocusUp();
      expect(result.focusedEventIndex()).toBe(4); // Last event

      dispose();
    });
  });

  it("should increment focus with moveFocusDown", async () => {
    await createRoot(async (dispose) => {
      const { useKeyboardNav } =
        await import("../../../../../src/webviews/agent-panel/hooks/useKeyboardNav.js");

      const [eventCount] = createSignal(5);

      const result = useKeyboardNav({ eventCount });

      result.moveFocusDown(); // 0
      expect(result.focusedEventIndex()).toBe(0);

      result.moveFocusDown(); // 1
      expect(result.focusedEventIndex()).toBe(1);

      result.moveFocusDown(); // 2
      expect(result.focusedEventIndex()).toBe(2);

      dispose();
    });
  });

  it("should decrement focus with moveFocusUp", async () => {
    await createRoot(async (dispose) => {
      const { useKeyboardNav } =
        await import("../../../../../src/webviews/agent-panel/hooks/useKeyboardNav.js");

      const [eventCount] = createSignal(5);

      const result = useKeyboardNav({ eventCount });

      result.moveFocusDown(); // 0
      result.moveFocusDown(); // 1
      result.moveFocusDown(); // 2

      expect(result.focusedEventIndex()).toBe(2);

      result.moveFocusUp(); // 1
      expect(result.focusedEventIndex()).toBe(1);

      result.moveFocusUp(); // 0
      expect(result.focusedEventIndex()).toBe(0);

      dispose();
    });
  });

  it("should not go below 0 with moveFocusUp", async () => {
    await createRoot(async (dispose) => {
      const { useKeyboardNav } =
        await import("../../../../../src/webviews/agent-panel/hooks/useKeyboardNav.js");

      const [eventCount] = createSignal(5);

      const result = useKeyboardNav({ eventCount });

      result.moveFocusDown(); // 0
      expect(result.focusedEventIndex()).toBe(0);

      result.moveFocusUp(); // Should stay at 0
      expect(result.focusedEventIndex()).toBe(0);

      result.moveFocusUp(); // Should stay at 0
      expect(result.focusedEventIndex()).toBe(0);

      dispose();
    });
  });

  it("should not go beyond last event with moveFocusDown", async () => {
    await createRoot(async (dispose) => {
      const { useKeyboardNav } =
        await import("../../../../../src/webviews/agent-panel/hooks/useKeyboardNav.js");

      const [eventCount] = createSignal(3);

      const result = useKeyboardNav({ eventCount });

      result.moveFocusDown(); // 0
      result.moveFocusDown(); // 1
      result.moveFocusDown(); // 2 (last)

      expect(result.focusedEventIndex()).toBe(2);

      result.moveFocusDown(); // Should stay at 2
      expect(result.focusedEventIndex()).toBe(2);

      result.moveFocusDown(); // Should stay at 2
      expect(result.focusedEventIndex()).toBe(2);

      dispose();
    });
  });

  it("should clear focus with clearFocus", async () => {
    await createRoot(async (dispose) => {
      const { useKeyboardNav } =
        await import("../../../../../src/webviews/agent-panel/hooks/useKeyboardNav.js");

      const [eventCount] = createSignal(5);

      const result = useKeyboardNav({ eventCount });

      result.moveFocusDown(); // 0
      result.moveFocusDown(); // 1
      expect(result.focusedEventIndex()).toBe(1);

      result.clearFocus();
      expect(result.focusedEventIndex()).toBe(-1);

      dispose();
    });
  });

  it("should call onToggleExpand when toggleExpand is called", async () => {
    await createRoot(async (dispose) => {
      const { useKeyboardNav } =
        await import("../../../../../src/webviews/agent-panel/hooks/useKeyboardNav.js");

      const [eventCount] = createSignal(5);
      const onToggleExpand = vi.fn();

      const result = useKeyboardNav({ eventCount, onToggleExpand });

      result.moveFocusDown(); // Focus on event 0
      result.toggleExpand();

      expect(onToggleExpand).toHaveBeenCalledTimes(1);
      expect(onToggleExpand).toHaveBeenCalledWith(0);

      dispose();
    });
  });

  it("should not call onToggleExpand when no event is focused", async () => {
    await createRoot(async (dispose) => {
      const { useKeyboardNav } =
        await import("../../../../../src/webviews/agent-panel/hooks/useKeyboardNav.js");

      const [eventCount] = createSignal(5);
      const onToggleExpand = vi.fn();

      const result = useKeyboardNav({ eventCount, onToggleExpand });

      // No focus yet
      expect(result.focusedEventIndex()).toBe(-1);

      result.toggleExpand();

      expect(onToggleExpand).not.toHaveBeenCalled();

      dispose();
    });
  });

  it("should handle empty event list", async () => {
    await createRoot(async (dispose) => {
      const { useKeyboardNav } =
        await import("../../../../../src/webviews/agent-panel/hooks/useKeyboardNav.js");

      const [eventCount] = createSignal(0);

      const result = useKeyboardNav({ eventCount });

      expect(result.focusedEventIndex()).toBe(-1);

      // Should not change focus when no events
      result.moveFocusDown();
      expect(result.focusedEventIndex()).toBe(-1);

      result.moveFocusUp();
      expect(result.focusedEventIndex()).toBe(-1);

      dispose();
    });
  });

  it("should respect enabled flag when disabled", async () => {
    await createRoot(async (dispose) => {
      const { useKeyboardNav } =
        await import("../../../../../src/webviews/agent-panel/hooks/useKeyboardNav.js");

      const [eventCount] = createSignal(5);

      const result = useKeyboardNav({ eventCount, enabled: false });

      // Manual calls should still work
      result.moveFocusDown();
      expect(result.focusedEventIndex()).toBe(0);

      result.clearFocus();
      expect(result.focusedEventIndex()).toBe(-1);

      dispose();
    });
  });

  it("should handle multiple toggle expand calls on same event", async () => {
    await createRoot(async (dispose) => {
      const { useKeyboardNav } =
        await import("../../../../../src/webviews/agent-panel/hooks/useKeyboardNav.js");

      const [eventCount] = createSignal(5);
      const onToggleExpand = vi.fn();

      const result = useKeyboardNav({ eventCount, onToggleExpand });

      result.moveFocusDown(); // Focus on event 0

      result.toggleExpand();
      result.toggleExpand();
      result.toggleExpand();

      expect(onToggleExpand).toHaveBeenCalledTimes(3);
      expect(onToggleExpand).toHaveBeenNthCalledWith(1, 0);
      expect(onToggleExpand).toHaveBeenNthCalledWith(2, 0);
      expect(onToggleExpand).toHaveBeenNthCalledWith(3, 0);

      dispose();
    });
  });
});
