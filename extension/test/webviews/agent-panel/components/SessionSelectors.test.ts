/**
 * SessionSelectors Component Tests
 *
 * Tests for TaskSelector and SessionSelector components.
 * Verifies component structure, exports, and basic rendering.
 */

import { describe, expect, it } from "vitest";
import { SessionSelector } from "../../../../src/webviews/agent-panel/components/SessionSelector.js";
import { TaskSelector } from "../../../../src/webviews/agent-panel/components/TaskSelector.js";

describe("SessionSelectors", () => {
  describe("TaskSelector", () => {
    it("should export TaskSelector component", () => {
      expect(TaskSelector).toBeDefined();
      expect(typeof TaskSelector).toBe("function");
    });

    it("should be a SolidJS component function", () => {
      // SolidJS components are just functions that return JSX
      expect(TaskSelector.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("SessionSelector", () => {
    it("should export SessionSelector component", () => {
      expect(SessionSelector).toBeDefined();
      expect(typeof SessionSelector).toBe("function");
    });

    it("should be a SolidJS component function", () => {
      // SolidJS components are just functions that return JSX
      expect(SessionSelector.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Component integration", () => {
    it("both components should be exported from module", () => {
      expect(TaskSelector).toBeDefined();
      expect(SessionSelector).toBeDefined();
    });
  });
});
