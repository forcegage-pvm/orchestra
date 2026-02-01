/**
 * Timeline Cards Component Tests
 *
 * Verifies PromptCard, ThinkingCard, ErrorCard component exports and module structure.
 */

import { describe, expect, it } from "vitest";

describe("PromptCard Component", () => {
  it("should export PromptCard function component", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/components/PromptCard.js");
    expect(module.PromptCard).toBeDefined();
    expect(typeof module.PromptCard).toBe("function");
  });

  it("should be exported from components barrel", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/components/index.js");
    expect(module.PromptCard).toBeDefined();
    expect(typeof module.PromptCard).toBe("function");
  });

  it("should have correct module structure", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/components/PromptCard.js");

    // Verify named export
    expect(module.PromptCard).toBeDefined();
    expect(module.PromptCard.name).toBe("PromptCard");

    // Should not have default export
    expect(module.default).toBeUndefined();
  });

  it("should be accessible from components index", async () => {
    const indexModule =
      await import("../../../../src/webviews/agent-panel/components/index.js");
    const promptCardModule =
      await import("../../../../src/webviews/agent-panel/components/PromptCard.js");

    // Verify same reference exported through barrel
    expect(indexModule.PromptCard).toBe(promptCardModule.PromptCard);
  });
});

describe("ThinkingCard Component", () => {
  it("should export ThinkingCard function component", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/components/ThinkingCard.js");
    expect(module.ThinkingCard).toBeDefined();
    expect(typeof module.ThinkingCard).toBe("function");
  });

  it("should be exported from components barrel", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/components/index.js");
    expect(module.ThinkingCard).toBeDefined();
    expect(typeof module.ThinkingCard).toBe("function");
  });

  it("should have correct module structure", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/components/ThinkingCard.js");

    // Verify named export
    expect(module.ThinkingCard).toBeDefined();
    expect(module.ThinkingCard.name).toBe("ThinkingCard");

    // Should not have default export
    expect(module.default).toBeUndefined();
  });

  it("should be accessible from components index", async () => {
    const indexModule =
      await import("../../../../src/webviews/agent-panel/components/index.js");
    const thinkingCardModule =
      await import("../../../../src/webviews/agent-panel/components/ThinkingCard.js");

    // Verify same reference exported through barrel
    expect(indexModule.ThinkingCard).toBe(thinkingCardModule.ThinkingCard);
  });
});

describe("ErrorCard Component", () => {
  it("should export ErrorCard function component", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/components/ErrorCard.js");
    expect(module.ErrorCard).toBeDefined();
    expect(typeof module.ErrorCard).toBe("function");
  });

  it("should be exported from components barrel", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/components/index.js");
    expect(module.ErrorCard).toBeDefined();
    expect(typeof module.ErrorCard).toBe("function");
  });

  it("should have correct module structure", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/components/ErrorCard.js");

    // Verify named export
    expect(module.ErrorCard).toBeDefined();
    expect(module.ErrorCard.name).toBe("ErrorCard");

    // Should not have default export
    expect(module.default).toBeUndefined();
  });

  it("should be accessible from components index", async () => {
    const indexModule =
      await import("../../../../src/webviews/agent-panel/components/index.js");
    const errorCardModule =
      await import("../../../../src/webviews/agent-panel/components/ErrorCard.js");

    // Verify same reference exported through barrel
    expect(indexModule.ErrorCard).toBe(errorCardModule.ErrorCard);
  });
});

describe("TimelineView Component", () => {
  it("should export TimelineView function component", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/views/TimelineView.js");
    expect(module.TimelineView).toBeDefined();
    expect(typeof module.TimelineView).toBe("function");
  });

  it("should be exported from views barrel", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/views/index.js");
    expect(module.TimelineView).toBeDefined();
    expect(typeof module.TimelineView).toBe("function");
  });

  it("should have correct module structure", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/views/TimelineView.js");

    // Verify named export
    expect(module.TimelineView).toBeDefined();
    expect(module.TimelineView.name).toBe("TimelineView");

    // Should not have default export
    expect(module.default).toBeUndefined();
  });

  it("should be accessible from views index", async () => {
    const indexModule =
      await import("../../../../src/webviews/agent-panel/views/index.js");
    const timelineViewModule =
      await import("../../../../src/webviews/agent-panel/views/TimelineView.js");

    // Verify same reference exported through barrel
    expect(indexModule.TimelineView).toBe(timelineViewModule.TimelineView);
  });
});
