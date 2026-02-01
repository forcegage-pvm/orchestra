/**
 * eventsStore Tests
 *
 * Unit tests for eventsStore filtering functionality and highlightMatches utility.
 */

import { createRoot } from "solid-js";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  AgentEvent,
  ErrorEvent,
  PromptEvent,
  ThinkingEvent,
  ToolCallEvent,
  ToolOutputEvent,
} from "../../../../src/agents/sessions/types.js";
import { setEvents } from "../../../../src/webviews/agent-panel/stores/sessionStore.js";
import { setUi } from "../../../../src/webviews/agent-panel/stores/uiStore.js";

describe("eventsStore", () => {
  beforeEach(() => {
    // Clear stores before each test
    setEvents({});
    setUi("filterText", "");
  });

  it("should export filteredEvents signal", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/stores/eventsStore.js");
    expect(module).toHaveProperty("filteredEvents");
    expect(typeof module.filteredEvents).toBe("function");
  });

  it("should export highlightMatches function", async () => {
    const module =
      await import("../../../../src/webviews/agent-panel/stores/eventsStore.js");
    expect(module).toHaveProperty("highlightMatches");
    expect(typeof module.highlightMatches).toBe("function");
  });

  it("filteredEvents should return all events when filter is empty", async () => {
    await createRoot(async (dispose) => {
      const { filteredEvents } =
        await import("../../../../src/webviews/agent-panel/stores/eventsStore.js");

      const mockEvents: Record<string, AgentEvent> = {
        "1": {
          id: "1",
          sessionId: "sess-1",
          timestamp: "2024-01-01T00:00:00Z",
          iteration: 1,
          type: "prompt",
          text: "Hello world",
          attachments: undefined,
        } as PromptEvent,
        "2": {
          id: "2",
          sessionId: "sess-1",
          timestamp: "2024-01-01T00:00:01Z",
          iteration: 1,
          type: "thinking",
          text: "Processing request",
          tokenCount: undefined,
        } as ThinkingEvent,
      };

      setEvents(mockEvents);
      setUi("filterText", "");

      const filtered = filteredEvents();
      expect(filtered.length).toBe(2);

      dispose();
    });
  });

  it("filteredEvents should filter by prompt text", async () => {
    await createRoot(async (dispose) => {
      const { filteredEvents } =
        await import("../../../../src/webviews/agent-panel/stores/eventsStore.js");

      const mockEvents: Record<string, AgentEvent> = {
        "1": {
          id: "1",
          sessionId: "sess-1",
          timestamp: "2024-01-01T00:00:00Z",
          iteration: 1,
          type: "prompt",
          text: "Hello world",
          attachments: undefined,
        } as PromptEvent,
        "2": {
          id: "2",
          sessionId: "sess-1",
          timestamp: "2024-01-01T00:00:01Z",
          iteration: 1,
          type: "prompt",
          text: "Goodbye",
          attachments: undefined,
        } as PromptEvent,
      };

      setEvents(mockEvents);
      setUi("filterText", "hello");

      const filtered = filteredEvents();
      expect(filtered.length).toBe(1);
      expect((filtered[0] as PromptEvent).text).toBe("Hello world");

      dispose();
    });
  });

  it("filteredEvents should filter by tool name", async () => {
    await createRoot(async (dispose) => {
      const { filteredEvents } =
        await import("../../../../src/webviews/agent-panel/stores/eventsStore.js");

      const mockEvents: Record<string, AgentEvent> = {
        "1": {
          id: "1",
          sessionId: "sess-1",
          timestamp: "2024-01-01T00:00:00Z",
          iteration: 1,
          type: "tool_call",
          toolCallId: "tc-1",
          toolName: "read_file",
          toolCategory: "filesystem",
          arguments: {},
        } as ToolCallEvent,
        "2": {
          id: "2",
          sessionId: "sess-1",
          timestamp: "2024-01-01T00:00:01Z",
          iteration: 1,
          type: "tool_call",
          toolCallId: "tc-2",
          toolName: "create_file",
          toolCategory: "filesystem",
          arguments: {},
        } as ToolCallEvent,
      };

      setEvents(mockEvents);
      setUi("filterText", "read");

      const filtered = filteredEvents();
      expect(filtered.length).toBe(1);
      expect((filtered[0] as ToolCallEvent).toolName).toBe("read_file");

      dispose();
    });
  });

  it("filteredEvents should filter by file path", async () => {
    await createRoot(async (dispose) => {
      const { filteredEvents } =
        await import("../../../../src/webviews/agent-panel/stores/eventsStore.js");

      const mockEvents: Record<string, AgentEvent> = {
        "1": {
          id: "1",
          sessionId: "sess-1",
          timestamp: "2024-01-01T00:00:00Z",
          iteration: 1,
          type: "prompt",
          text: "Read this",
          attachments: [
            { path: "/src/file.ts", name: "file.ts", mimeType: undefined },
          ],
        } as PromptEvent,
        "2": {
          id: "2",
          sessionId: "sess-1",
          timestamp: "2024-01-01T00:00:01Z",
          iteration: 1,
          type: "prompt",
          text: "Read that",
          attachments: [
            { path: "/test/spec.ts", name: "spec.ts", mimeType: undefined },
          ],
        } as PromptEvent,
      };

      setEvents(mockEvents);
      setUi("filterText", "test");

      const filtered = filteredEvents();
      expect(filtered.length).toBe(1);
      expect((filtered[0] as PromptEvent).attachments?.[0].path).toContain(
        "test",
      );

      dispose();
    });
  });

  it("filteredEvents should filter by output content", async () => {
    await createRoot(async (dispose) => {
      const { filteredEvents } =
        await import("../../../../src/webviews/agent-panel/stores/eventsStore.js");

      const mockEvents: Record<string, AgentEvent> = {
        "1": {
          id: "1",
          sessionId: "sess-1",
          timestamp: "2024-01-01T00:00:00Z",
          iteration: 1,
          type: "tool_output",
          toolCallId: "tc-1",
          toolName: "run_command",
          chunk: "File created successfully",
          isStderr: undefined,
        } as ToolOutputEvent,
        "2": {
          id: "2",
          sessionId: "sess-1",
          timestamp: "2024-01-01T00:00:01Z",
          iteration: 1,
          type: "tool_output",
          toolCallId: "tc-2",
          toolName: "run_command",
          chunk: "Error occurred",
          isStderr: true,
        } as ToolOutputEvent,
      };

      setEvents(mockEvents);
      setUi("filterText", "created");

      const filtered = filteredEvents();
      expect(filtered.length).toBe(1);
      expect((filtered[0] as ToolOutputEvent).chunk).toContain("created");

      dispose();
    });
  });

  it("filteredEvents should filter by error message", async () => {
    await createRoot(async (dispose) => {
      const { filteredEvents } =
        await import("../../../../src/webviews/agent-panel/stores/eventsStore.js");

      const mockEvents: Record<string, AgentEvent> = {
        "1": {
          id: "1",
          sessionId: "sess-1",
          timestamp: "2024-01-01T00:00:00Z",
          iteration: 1,
          type: "error",
          severity: "error",
          code: "FILE_NOT_FOUND",
          message: "File does not exist",
          recoverable: true,
          details: undefined,
          suggestion: undefined,
        } as ErrorEvent,
        "2": {
          id: "2",
          sessionId: "sess-1",
          timestamp: "2024-01-01T00:00:01Z",
          iteration: 1,
          type: "error",
          severity: "warning",
          code: "TIMEOUT",
          message: "Request timed out",
          recoverable: true,
          details: undefined,
          suggestion: undefined,
        } as ErrorEvent,
      };

      setEvents(mockEvents);
      setUi("filterText", "not found");

      const filtered = filteredEvents();
      expect(filtered.length).toBe(1);
      expect((filtered[0] as ErrorEvent).code).toBe("FILE_NOT_FOUND");

      dispose();
    });
  });

  it("filteredEvents should be case-insensitive", async () => {
    await createRoot(async (dispose) => {
      const { filteredEvents } =
        await import("../../../../src/webviews/agent-panel/stores/eventsStore.js");

      const mockEvents: Record<string, AgentEvent> = {
        "1": {
          id: "1",
          sessionId: "sess-1",
          timestamp: "2024-01-01T00:00:00Z",
          iteration: 1,
          type: "prompt",
          text: "Hello World",
          attachments: undefined,
        } as PromptEvent,
      };

      setEvents(mockEvents);

      // Test with lowercase
      setUi("filterText", "hello");
      let filtered = filteredEvents();
      expect(filtered.length).toBe(1);

      // Test with uppercase
      setUi("filterText", "WORLD");
      filtered = filteredEvents();
      expect(filtered.length).toBe(1);

      // Test with mixed case
      setUi("filterText", "HeLLo WoRLd");
      filtered = filteredEvents();
      expect(filtered.length).toBe(1);

      dispose();
    });
  });

  it("highlightMatches should wrap matched text with mark tags", async () => {
    const { highlightMatches } =
      await import("../../../../src/webviews/agent-panel/stores/eventsStore.js");

    const result = highlightMatches("Tool call completed", "call");
    expect(result).toBe("Tool <mark>call</mark> completed");
  });

  it("highlightMatches should be case-insensitive", async () => {
    const { highlightMatches } =
      await import("../../../../src/webviews/agent-panel/stores/eventsStore.js");

    const result = highlightMatches("Tool Call Completed", "call");
    expect(result).toContain("<mark>");
    expect(result.toLowerCase()).toContain("call");
  });

  it("highlightMatches should handle empty search term", async () => {
    const { highlightMatches } =
      await import("../../../../src/webviews/agent-panel/stores/eventsStore.js");

    const result = highlightMatches("Tool call completed", "");
    expect(result).toBe("Tool call completed");
  });

  it("highlightMatches should handle empty text", async () => {
    const { highlightMatches } =
      await import("../../../../src/webviews/agent-panel/stores/eventsStore.js");

    const result = highlightMatches("", "call");
    expect(result).toBe("");
  });

  it("highlightMatches should highlight multiple matches", async () => {
    const { highlightMatches } =
      await import("../../../../src/webviews/agent-panel/stores/eventsStore.js");

    const result = highlightMatches("call the call function", "call");
    expect(result).toBe("<mark>call</mark> the <mark>call</mark> function");
  });

  it("highlightMatches should escape special regex characters", async () => {
    const { highlightMatches } =
      await import("../../../../src/webviews/agent-panel/stores/eventsStore.js");

    // Periods are special regex chars
    const result = highlightMatches("file.ts is a file", "file.ts");
    expect(result).toBe("<mark>file.ts</mark> is a file");
  });
});
