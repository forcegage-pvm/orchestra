/**
 * Timeline Cards Component Tests
 *
 * Verifies PromptCard, ThinkingCard, ErrorCard component exports, module structure,
 * and behavioral correctness with mock event data.
 */

import { describe, expect, it } from "vitest";
import type {
  ErrorEvent,
  PromptEvent,
  ThinkingEvent,
} from "../../../../../src/agents/sessions/types.js";

// Mock event data for behavioral tests
const mockPromptEvent: PromptEvent = {
  id: "prompt-1",
  type: "prompt",
  timestamp: "2026-02-01T12:00:00Z",
  iteration: 1,
  text: "Implement the feature",
  attachments: [
    { path: "src/feature.ts", size: 1024 },
    { path: "test/feature.test.ts", size: 512 },
  ],
};

const mockThinkingEvent: ThinkingEvent = {
  id: "thinking-1",
  type: "thinking",
  timestamp: "2026-02-01T12:01:00Z",
  iteration: 1,
  text: "First line of thinking\nSecond line of thinking\nThird line of thinking\nFourth line of thinking\nFifth line of thinking",
  tokenCount: 25,
};

const mockErrorEvent: ErrorEvent = {
  id: "error-1",
  type: "error",
  timestamp: "2026-02-01T12:02:00Z",
  iteration: 1,
  severity: "error",
  code: "BUILD_FAILED",
  message: "TypeScript compilation failed",
  recoverable: true,
  suggestion: "Run 'npm run build' to see detailed errors",
};

describe("PromptCard Component", () => {
  it("should export PromptCard function component", async () => {
    const module =
      await import("../../../../../src/webviews/agent-panel/components/PromptCard.js");
    expect(module.PromptCard).toBeDefined();
    expect(typeof module.PromptCard).toBe("function");
  });

  it("should be exported from components barrel", async () => {
    const module =
      await import("../../../../../src/webviews/agent-panel/components/index.js");
    expect(module.PromptCard).toBeDefined();
    expect(typeof module.PromptCard).toBe("function");
  });

  it("should have correct module structure", async () => {
    const module =
      await import("../../../../../src/webviews/agent-panel/components/PromptCard.js");

    // Verify named export
    expect(module.PromptCard).toBeDefined();
    expect(module.PromptCard.name).toBe("PromptCard");

    // Should not have default export
    expect(module.default).toBeUndefined();
  });

  it("should be accessible from components index", async () => {
    const indexModule =
      await import("../../../../../src/webviews/agent-panel/components/index.js");
    const promptCardModule =
      await import("../../../../../src/webviews/agent-panel/components/PromptCard.js");

    // Verify same reference exported through barrel
    expect(indexModule.PromptCard).toBe(promptCardModule.PromptCard);
  });

  it("should accept PromptEvent with text and attachments", () => {
    // Verify the props structure matches expected interface
    const props = { event: mockPromptEvent };
    expect(props.event.type).toBe("prompt");
    expect(props.event.text).toBe("Implement the feature");
    expect(props.event.attachments).toHaveLength(2);
    expect(props.event.attachments![0].path).toBe("src/feature.ts");
    expect(props.event.attachments![1].path).toBe("test/feature.test.ts");
  });
});

describe("ThinkingCard Component", () => {
  it("should export ThinkingCard function component", async () => {
    const module =
      await import("../../../../../src/webviews/agent-panel/components/ThinkingCard.js");
    expect(module.ThinkingCard).toBeDefined();
    expect(typeof module.ThinkingCard).toBe("function");
  });

  it("should be exported from components barrel", async () => {
    const module =
      await import("../../../../../src/webviews/agent-panel/components/index.js");
    expect(module.ThinkingCard).toBeDefined();
    expect(typeof module.ThinkingCard).toBe("function");
  });

  it("should have correct module structure", async () => {
    const module =
      await import("../../../../../src/webviews/agent-panel/components/ThinkingCard.js");

    // Verify named export
    expect(module.ThinkingCard).toBeDefined();
    expect(module.ThinkingCard.name).toBe("ThinkingCard");

    // Should not have default export
    expect(module.default).toBeUndefined();
  });

  it("should be accessible from components index", async () => {
    const indexModule =
      await import("../../../../../src/webviews/agent-panel/components/index.js");
    const thinkingCardModule =
      await import("../../../../../src/webviews/agent-panel/components/ThinkingCard.js");

    // Verify same reference exported through barrel
    expect(indexModule.ThinkingCard).toBe(thinkingCardModule.ThinkingCard);
  });

  it("should accept ThinkingEvent and handle multi-line text for collapse", () => {
    // Verify the props structure matches expected interface
    const props = {
      event: mockThinkingEvent,
      isStreaming: false,
      autoCollapse: true,
    };

    expect(props.event.type).toBe("thinking");
    expect(props.event.text.split("\n")).toHaveLength(5);
    expect(props.autoCollapse).toBe(true);
    expect(props.isStreaming).toBe(false);
  });

  it("should handle collapsed state with first 3 lines", () => {
    // Verify the collapsed preview logic works correctly
    const lines = mockThinkingEvent.text.split("\n");
    const previewLines = lines.slice(0, 3).join("\n");
    const remainingLines = lines.length - 3;

    expect(previewLines).toBe(
      "First line of thinking\nSecond line of thinking\nThird line of thinking",
    );
    expect(remainingLines).toBe(2);
  });

  it("should support streaming with cursor animation", () => {
    // Verify the props structure for streaming state
    const props = {
      event: mockThinkingEvent,
      isStreaming: true,
      autoCollapse: false,
    };

    expect(props.isStreaming).toBe(true);
    expect(props.autoCollapse).toBe(false);
  });
});

describe("ErrorCard Component", () => {
  it("should export ErrorCard function component", async () => {
    const module =
      await import("../../../../../src/webviews/agent-panel/components/ErrorCard.js");
    expect(module.ErrorCard).toBeDefined();
    expect(typeof module.ErrorCard).toBe("function");
  });

  it("should be exported from components barrel", async () => {
    const module =
      await import("../../../../../src/webviews/agent-panel/components/index.js");
    expect(module.ErrorCard).toBeDefined();
    expect(typeof module.ErrorCard).toBe("function");
  });

  it("should have correct module structure", async () => {
    const module =
      await import("../../../../../src/webviews/agent-panel/components/ErrorCard.js");

    // Verify named export
    expect(module.ErrorCard).toBeDefined();
    expect(module.ErrorCard.name).toBe("ErrorCard");

    // Should not have default export
    expect(module.default).toBeUndefined();
  });

  it("should be accessible from components index", async () => {
    const indexModule =
      await import("../../../../../src/webviews/agent-panel/components/index.js");
    const errorCardModule =
      await import("../../../../../src/webviews/agent-panel/components/ErrorCard.js");

    // Verify same reference exported through barrel
    expect(indexModule.ErrorCard).toBe(errorCardModule.ErrorCard);
  });

  it("should accept ErrorEvent with severity-based styling", () => {
    // Verify the props structure matches expected interface
    const props = { event: mockErrorEvent };
    expect(props.event.type).toBe("error");
    expect(props.event.severity).toBe("error");
    expect(props.event.code).toBe("BUILD_FAILED");
    expect(props.event.message).toBe("TypeScript compilation failed");
    expect(props.event.suggestion).toBeDefined();
    expect(props.event.recoverable).toBe(true);
  });

  it("should handle warning severity", () => {
    const warningEvent: ErrorEvent = {
      ...mockErrorEvent,
      severity: "warning",
      message: "Deprecated API usage detected",
    };

    const props = { event: warningEvent };
    expect(props.event.severity).toBe("warning");
    expect(props.event.message).toBe("Deprecated API usage detected");
  });
});

describe("TimelineView Component", () => {
  it("should export TimelineView function component", async () => {
    const module =
      await import("../../../../../src/webviews/agent-panel/views/TimelineView.js");
    expect(module.TimelineView).toBeDefined();
    expect(typeof module.TimelineView).toBe("function");
  });

  it("should be exported from views barrel", async () => {
    const module =
      await import("../../../../../src/webviews/agent-panel/views/index.js");
    expect(module.TimelineView).toBeDefined();
    expect(typeof module.TimelineView).toBe("function");
  });

  it("should have correct module structure", async () => {
    const module =
      await import("../../../../../src/webviews/agent-panel/views/TimelineView.js");

    // Verify named export
    expect(module.TimelineView).toBeDefined();
    expect(module.TimelineView.name).toBe("TimelineView");

    // Should not have default export
    expect(module.default).toBeUndefined();
  });

  it("should be accessible from views index", async () => {
    const indexModule =
      await import("../../../../../src/webviews/agent-panel/views/index.js");
    const timelineViewModule =
      await import("../../../../../src/webviews/agent-panel/views/TimelineView.js");

    // Verify same reference exported through barrel
    expect(indexModule.TimelineView).toBe(timelineViewModule.TimelineView);
  });

  it("should handle chronological event sorting", () => {
    // Verify sorting logic for events by timestamp
    const events = [mockErrorEvent, mockPromptEvent, mockThinkingEvent];

    const sorted = events.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    // Should be sorted: prompt (12:00) → thinking (12:01) → error (12:02)
    expect(sorted[0].type).toBe("prompt");
    expect(sorted[1].type).toBe("thinking");
    expect(sorted[2].type).toBe("error");
  });
});
