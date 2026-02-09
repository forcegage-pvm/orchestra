/**
 * Tests for protocol message handler
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionMessage } from "../../../../src/webviews/agent-panel/protocol/types.js";

// Mock store imports
vi.mock("../../../../src/webviews/agent-panel/stores/sessionStore.js", () => ({
  session: undefined,
  setSession: vi.fn(),
  replaceSession: vi.fn(),
  resetSession: vi.fn(),
  setEvents: vi.fn(),
  setToolCalls: vi.fn(),
  // New/auxiliary exports used by protocol handler
  persistState: vi.fn(),
  addEvent: vi.fn(),
  clearAfter: vi.fn(() => null),
  clearEvents: vi.fn(),
  clearSessionHistory: vi.fn(),
  setToolCall: vi.fn(),
  tryRestoreState: vi.fn(() => false),
  syncSessionStatusFromEvents: vi.fn(),
  toolCalls: {},
}));

// Import mocked stores
import {
  addEvent,
  clearEvents,
  clearSessionHistory,
  replaceSession,
  resetSession,
} from "../../../../src/webviews/agent-panel/stores/sessionStore.js";
import { setUi } from "../../../../src/webviews/agent-panel/stores/uiStore.js";

// Import handler AFTER mocking dependent stores so imports are mocked
import {
  handleExtensionMessage,
  initializeMessageHandler,
} from "../../../../src/webviews/agent-panel/protocol/handler.js";

vi.mock("../../../../src/webviews/agent-panel/stores/uiStore.js", () => ({
  setUi: vi.fn(),
}));

// Import mocked stores

describe("protocol/handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("handleExtensionMessage", () => {
    it("should handle session_update messages", () => {
      const mockSession = {
        sessionId: "test-session",
        role: "implementor" as const,
        taskId: 1,
        taskTitle: "Test Task",
        sprintId: "sprint-001",
        startedAt: "2026-02-01T00:00:00Z",
        lastActivityAt: "2026-02-01T00:00:00Z",
        endedAt: undefined,
        status: "running" as const,
        statusMessage: undefined,
        iteration: 1,
        maxIterations: 50,
        toolCallCount: 0,
        successfulToolCalls: 0,
        failedToolCalls: 0,
        warningCount: 0,
        filesModified: [],
        durationMs: undefined,
      };

      const message: ExtensionMessage = {
        type: "session_update",
        session: mockSession,
      };

      handleExtensionMessage(message);

      expect(replaceSession).toHaveBeenCalledWith(mockSession);
      expect(replaceSession).toHaveBeenCalledTimes(1);
    });

    it("should handle event messages", () => {
      const mockEvent = {
        id: "event-1",
        sessionId: "test-session",
        timestamp: "2026-02-01T00:00:00Z",
        iteration: 1,
        type: "prompt" as const,
        text: "Test prompt",
        attachments: undefined,
      };

      const message: ExtensionMessage = {
        type: "event",
        event: mockEvent,
      };

      handleExtensionMessage(message);

      expect(addEvent).toHaveBeenCalledWith(mockEvent);
      expect(addEvent).toHaveBeenCalledTimes(1);
    });

    it("should handle events_batch messages", () => {
      const mockEvents = [
        {
          id: "event-1",
          sessionId: "test-session",
          timestamp: "2026-02-01T00:00:00Z",
          iteration: 1,
          type: "prompt" as const,
          text: "Test prompt 1",
          attachments: undefined,
        },
        {
          id: "event-2",
          sessionId: "test-session",
          timestamp: "2026-02-01T00:01:00Z",
          iteration: 1,
          type: "thinking" as const,
          text: "Thinking...",
          tokenCount: 100,
        },
      ];

      const message: ExtensionMessage = {
        type: "events_batch",
        events: mockEvents,
      };

      handleExtensionMessage(message);

      expect(addEvent).toHaveBeenCalledTimes(2);
      expect(addEvent).toHaveBeenCalledWith(mockEvents[0]);
      expect(addEvent).toHaveBeenCalledWith(mockEvents[1]);
    });

    it("should handle clear messages", () => {
      const message: ExtensionMessage = {
        type: "clear",
      };

      handleExtensionMessage(message);

      expect(clearSessionHistory).toHaveBeenCalledTimes(1);
    });

    it("should handle set_verbosity messages", () => {
      const message: ExtensionMessage = {
        type: "set_verbosity",
        level: "debug",
      };

      handleExtensionMessage(message);

      expect(setUi).toHaveBeenCalledWith("verbosity", "debug");
    });

    it("should handle load_session messages", () => {
      const mockEvents = [
        {
          id: "event-1",
          sessionId: "loaded-session",
          timestamp: "2026-02-01T00:00:00Z",
          iteration: 1,
          type: "prompt" as const,
          text: "Loaded event",
          attachments: undefined,
        },
      ];

      const message: ExtensionMessage = {
        type: "load_session",
        sessionId: "loaded-session",
        events: mockEvents,
      };

      handleExtensionMessage(message);

      expect(resetSession).toHaveBeenCalledTimes(1);
      expect(clearEvents).toHaveBeenCalledTimes(1);
      expect(addEvent).toHaveBeenCalledWith(mockEvents[0]);
    });

    it("should handle session_list messages", () => {
      const mockSessions = [
        {
          sessionId: "session-1",
          role: "orchestrator" as const,
          taskId: 1,
          taskTitle: "Task 1",
          sprintId: "sprint-001",
          startedAt: "2026-02-01T00:00:00Z",
          lastActivityAt: "2026-02-01T00:00:00Z",
          endedAt: undefined,
          status: "completed" as const,
          statusMessage: undefined,
          iteration: 10,
          maxIterations: 50,
          toolCallCount: 5,
          successfulToolCalls: 5,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
          durationMs: 5000,
        },
      ];

      const message: ExtensionMessage = {
        type: "session_list",
        sessions: mockSessions,
      };

      // Should not throw
      expect(() => handleExtensionMessage(message)).not.toThrow();
    });
  });

  describe("initializeMessageHandler", () => {
    let mockPostMessage: ReturnType<typeof vi.fn>;
    let messageListeners: Array<(event: MessageEvent) => void>;

    beforeEach(() => {
      mockPostMessage = vi.fn();
      messageListeners = [];

      // Mock globalThis.addEventListener
      vi.stubGlobal(
        "addEventListener",
        (type: string, listener: (event: MessageEvent) => void) => {
          if (type === "message") {
            messageListeners.push(listener);
          }
        },
      );

      // Mock window.vscode
      vi.stubGlobal("window", {
        vscode: {
          postMessage: mockPostMessage,
        },
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("should set up message listener", () => {
      initializeMessageHandler();

      expect(messageListeners).toHaveLength(1);
    });

    it("should send ready message on initialization", () => {
      initializeMessageHandler();

      expect(mockPostMessage).toHaveBeenCalledWith({ type: "ready" });
    });

    it("should handle incoming messages via listener", () => {
      initializeMessageHandler();

      const mockSession = {
        sessionId: "test-session",
        role: "implementor" as const,
        taskId: 1,
        taskTitle: "Test Task",
        sprintId: "sprint-001",
        startedAt: "2026-02-01T00:00:00Z",
        lastActivityAt: "2026-02-01T00:00:00Z",
        endedAt: undefined,
        status: "running" as const,
        statusMessage: undefined,
        iteration: 1,
        maxIterations: 50,
        toolCallCount: 0,
        successfulToolCalls: 0,
        failedToolCalls: 0,
        warningCount: 0,
        filesModified: [],
        durationMs: undefined,
      };

      const message: ExtensionMessage = {
        type: "session_update",
        session: mockSession,
      };

      const messageEvent = new MessageEvent("message", { data: message });
      messageListeners[0](messageEvent);

      expect(replaceSession).toHaveBeenCalledWith(mockSession);
    });
  });
});
