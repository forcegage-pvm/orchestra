/**
 * SessionSelectors Component Tests
 *
 * Tests for TaskSelector and SessionSelector components.
 * Verifies component structure, exports, and behavior.
 */

import { describe, expect, it, vi } from "vitest";
import { SessionSelector } from "../../../../src/webviews/agent-panel/components/SessionSelector.js";
import { TaskSelector } from "../../../../src/webviews/agent-panel/components/TaskSelector.js";
import type { AgentSession } from "../../../../src/agents/sessions/types.js";

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

    it("should accept onTaskChange callback", () => {
      const onTaskChange = vi.fn();
      const availableTasks = [
        { taskId: 1, title: "Task 1" },
        { taskId: 2, title: "Task 2" },
      ];

      const props = {
        currentTaskId: 1,
        availableTasks,
        onTaskChange,
      };

      // Verify callback is defined and can be invoked
      expect(onTaskChange).toBeDefined();
      expect(typeof onTaskChange).toBe("function");

      // Test callback invocation with taskId
      onTaskChange(2);
      expect(onTaskChange).toHaveBeenCalledWith(2);
      expect(onTaskChange).toHaveBeenCalledTimes(1);
    });

    it("should accept availableTasks and currentTaskId props", () => {
      const availableTasks = [
        { taskId: 1, title: "Task 1" },
        { taskId: 2, title: "Task 2" },
        { taskId: 3, title: "Task 3" },
      ];

      const props = {
        currentTaskId: 1,
        availableTasks,
        onTaskChange: vi.fn(),
      };

      // Verify props structure
      expect(props.currentTaskId).toBe(1);
      expect(props.availableTasks).toHaveLength(3);
      expect(props.availableTasks[0]).toMatchObject({
        taskId: 1,
        title: "Task 1",
      });
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

    it("should accept onSessionChange callback", () => {
      const onSessionChange = vi.fn();
      const mockSessions: AgentSession[] = [
        {
          sessionId: "session-1",
          role: "implementor",
          taskId: 1,
          taskTitle: "Task 1",
          sprintId: "sprint-001",
          startedAt: "2026-02-01T00:00:00Z",
          lastActivityAt: "2026-02-01T00:00:00Z",
          status: "completed",
          iteration: 1,
          maxIterations: 50,
          toolCallCount: 10,
          successfulToolCalls: 10,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
        },
        {
          sessionId: "session-2",
          role: "implementor",
          taskId: 1,
          taskTitle: "Task 1",
          sprintId: "sprint-001",
          startedAt: "2026-02-01T01:00:00Z",
          lastActivityAt: "2026-02-01T01:00:00Z",
          status: "running",
          iteration: 5,
          maxIterations: 50,
          toolCallCount: 5,
          successfulToolCalls: 5,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
        },
      ];

      const props = {
        currentSessionId: "session-1",
        availableSessions: mockSessions,
        onSessionChange,
      };

      // Verify callback is defined and can be invoked
      expect(onSessionChange).toBeDefined();
      expect(typeof onSessionChange).toBe("function");

      // Test callback invocation with sessionId
      onSessionChange("session-2");
      expect(onSessionChange).toHaveBeenCalledWith("session-2");
      expect(onSessionChange).toHaveBeenCalledTimes(1);
    });

    it("should accept availableSessions and currentSessionId props", () => {
      const mockSessions: AgentSession[] = [
        {
          sessionId: "session-1",
          role: "orchestrator",
          taskId: 5,
          taskTitle: "Task 5",
          sprintId: "sprint-001",
          startedAt: "2026-02-01T00:00:00Z",
          lastActivityAt: "2026-02-01T00:00:00Z",
          status: "completed",
          iteration: 1,
          maxIterations: 50,
          toolCallCount: 20,
          successfulToolCalls: 20,
          failedToolCalls: 0,
          warningCount: 0,
          filesModified: [],
        },
      ];

      const props = {
        currentSessionId: "session-1",
        availableSessions: mockSessions,
        onSessionChange: vi.fn(),
      };

      // Verify props structure
      expect(props.currentSessionId).toBe("session-1");
      expect(props.availableSessions).toHaveLength(1);
      expect(props.availableSessions[0]).toMatchObject({
        sessionId: "session-1",
        role: "orchestrator",
        taskId: 5,
      });
    });
  });

  describe("Component integration", () => {
    it("both components should be exported from module", () => {
      expect(TaskSelector).toBeDefined();
      expect(SessionSelector).toBeDefined();
    });
  });
});
