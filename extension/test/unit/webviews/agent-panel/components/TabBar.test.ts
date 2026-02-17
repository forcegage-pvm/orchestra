/**
 * TabBar Component Tests
 *
 * Verifies tab structure, exports, and module contract.
 */

import { describe, expect, it } from "vitest";

describe("TabBar Component", () => {
  it("should export TabBar function component", async () => {
    const module =
      await import("../../../../../src/webviews/agent-panel/components/TabBar.js");
    expect(module.TabBar).toBeDefined();
    expect(typeof module.TabBar).toBe("function");
  });

  it("should be exported from components barrel", async () => {
    const module =
      await import("../../../../../src/webviews/agent-panel/components/index.js");
    expect(module.TabBar).toBeDefined();
    expect(typeof module.TabBar).toBe("function");
  });

  it("should have correct module structure", async () => {
    const module =
      await import("../../../../../src/webviews/agent-panel/components/TabBar.js");

    // Verify named export
    expect(module.TabBar).toBeDefined();
    expect(module.TabBar.name).toBe("TabBar");

    // Should not have default export
    expect(module.default).toBeUndefined();
  });

  it("should be accessible from components index", async () => {
    const indexModule =
      await import("../../../../../src/webviews/agent-panel/components/index.js");
    const tabBarModule =
      await import("../../../../../src/webviews/agent-panel/components/TabBar.js");

    // Verify same reference exported through barrel
    expect(indexModule.TabBar).toBe(tabBarModule.TabBar);
  });
});
