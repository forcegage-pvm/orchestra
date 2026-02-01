/**
 * Session Header Components Test
 *
 * Verifies component exports, prop interfaces, and basic type compatibility
 * for RoleBadge, StatusIndicator, ProgressStats, and SessionHeader.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.2-3.3
 */

import { describe, expect, it } from "vitest";
import type {
  AgentRole,
  AgentSession,
  SessionStatus,
} from "../../../../src/agents/sessions/types.js";
import type {
  ProgressStats,
  ProgressStatsProps,
  RoleBadge,
  RoleBadgeProps,
  SessionHeader,
  SessionHeaderProps,
  StatusIndicator,
  StatusIndicatorProps,
} from "../../../../src/webviews/agent-panel/components/index.js";

describe("Session Header Components", () => {
  describe("Component Exports", () => {
    it("should export RoleBadge component", async () => {
      const module =
        await import("../../../../src/webviews/agent-panel/components/index.js");
      expect(module.RoleBadge).toBeDefined();
      expect(typeof module.RoleBadge).toBe("function");
    });

    it("should export StatusIndicator component", async () => {
      const module =
        await import("../../../../src/webviews/agent-panel/components/index.js");
      expect(module.StatusIndicator).toBeDefined();
      expect(typeof module.StatusIndicator).toBe("function");
    });

    it("should export ProgressStats component", async () => {
      const module =
        await import("../../../../src/webviews/agent-panel/components/index.js");
      expect(module.ProgressStats).toBeDefined();
      expect(typeof module.ProgressStats).toBe("function");
    });

    it("should export SessionHeader component", async () => {
      const module =
        await import("../../../../src/webviews/agent-panel/components/index.js");
      expect(module.SessionHeader).toBeDefined();
      expect(typeof module.SessionHeader).toBe("function");
    });
  });

  describe("Component Prop Interfaces", () => {
    it("RoleBadgeProps should accept all AgentRole values", () => {
      const roles: AgentRole[] = ["orchestrator", "implementor", "controller"];

      roles.forEach((role) => {
        const props: RoleBadgeProps = { role };
        expect(props.role).toBe(role);
      });
    });

    it("StatusIndicatorProps should accept all SessionStatus values", () => {
      const statuses: SessionStatus[] = [
        "initializing",
        "running",
        "waiting_for_tool",
        "thinking",
        "paused",
        "completed",
        "failed",
        "cancelled",
      ];

      statuses.forEach((status) => {
        const props: StatusIndicatorProps = { status };
        expect(props.status).toBe(status);
      });
    });

    it("ProgressStatsProps should accept required numeric and array properties", () => {
      const props: ProgressStatsProps = {
        iteration: 5,
        maxIterations: 50,
        durationMs: 154320,
        toolCallCount: 12,
        successfulToolCalls: 11,
        failedToolCalls: 1,
        filesModified: ["src/a.ts", "src/b.ts"],
      };

      expect(props.iteration).toBe(5);
      expect(props.maxIterations).toBe(50);
      expect(props.durationMs).toBe(154320);
      expect(props.toolCallCount).toBe(12);
      expect(props.successfulToolCalls).toBe(11);
      expect(props.failedToolCalls).toBe(1);
      expect(props.filesModified).toHaveLength(2);
    });

    it("ProgressStatsProps should accept undefined durationMs", () => {
      const props: ProgressStatsProps = {
        iteration: 1,
        maxIterations: 10,
        durationMs: undefined,
        toolCallCount: 0,
        successfulToolCalls: 0,
        failedToolCalls: 0,
        filesModified: [],
      };

      expect(props.durationMs).toBeUndefined();
    });

    it("SessionHeaderProps should accept AgentSession or null", () => {
      const sessionProps: SessionHeaderProps = {
        session: {
          sessionId: "test-123",
          role: "orchestrator",
          taskId: 5,
          taskTitle: "Test Task",
          sprintId: "sprint-001",
          startedAt: "2026-02-01T10:00:00Z",
          lastActivityAt: "2026-02-01T10:05:00Z",
          endedAt: undefined,
          status: "running",
          statusMessage: undefined,
          iteration: 3,
          maxIterations: 50,
          toolCallCount: 8,
          successfulToolCalls: 7,
          failedToolCalls: 1,
          warningCount: 0,
          filesModified: ["src/test.ts"],
          durationMs: 300000,
        },
        onStop: () => {},
      };

      expect(sessionProps.session).toBeDefined();
      expect(sessionProps.onStop).toBeDefined();

      const nullProps: SessionHeaderProps = {
        session: null,
      };

      expect(nullProps.session).toBeNull();
    });

    it("SessionHeaderProps should accept optional onStop handler", () => {
      const withHandler: SessionHeaderProps = {
        session: null,
        onStop: () => console.log("stopped"),
      };

      const withoutHandler: SessionHeaderProps = {
        session: null,
      };

      expect(withHandler.onStop).toBeDefined();
      expect(withoutHandler.onStop).toBeUndefined();
    });
  });

  describe("Type Compatibility", () => {
    it("should allow RoleBadge to be typed as a component", () => {
      type Component = (props: RoleBadgeProps) => unknown;
      const _: Component = undefined as unknown as typeof RoleBadge;
      expect(_).toBeUndefined(); // Type assertion only
    });

    it("should allow StatusIndicator to be typed as a component", () => {
      type Component = (props: StatusIndicatorProps) => unknown;
      const _: Component = undefined as unknown as typeof StatusIndicator;
      expect(_).toBeUndefined(); // Type assertion only
    });

    it("should allow ProgressStats to be typed as a component", () => {
      type Component = (props: ProgressStatsProps) => unknown;
      const _: Component = undefined as unknown as typeof ProgressStats;
      expect(_).toBeUndefined(); // Type assertion only
    });

    it("should allow SessionHeader to be typed as a component", () => {
      type Component = (props: SessionHeaderProps) => unknown;
      const _: Component = undefined as unknown as typeof SessionHeader;
      expect(_).toBeUndefined(); // Type assertion only
    });
  });

  describe("AgentSession Compatibility", () => {
    it("should map AgentSession fields to ProgressStats props", () => {
      const session: AgentSession = {
        sessionId: "test-456",
        role: "implementor",
        taskId: 10,
        taskTitle: "Test Implementation",
        sprintId: "sprint-002",
        startedAt: "2026-02-01T11:00:00Z",
        lastActivityAt: "2026-02-01T11:10:00Z",
        endedAt: undefined,
        status: "running",
        statusMessage: undefined,
        iteration: 7,
        maxIterations: 30,
        toolCallCount: 15,
        successfulToolCalls: 14,
        failedToolCalls: 1,
        warningCount: 2,
        filesModified: ["src/impl.ts", "test/impl.test.ts"],
        durationMs: 600000,
      };

      const progressProps: ProgressStatsProps = {
        iteration: session.iteration,
        maxIterations: session.maxIterations,
        durationMs: session.durationMs,
        toolCallCount: session.toolCallCount,
        successfulToolCalls: session.successfulToolCalls,
        failedToolCalls: session.failedToolCalls,
        filesModified: session.filesModified,
      };

      expect(progressProps.iteration).toBe(7);
      expect(progressProps.maxIterations).toBe(30);
      expect(progressProps.durationMs).toBe(600000);
      expect(progressProps.toolCallCount).toBe(15);
      expect(progressProps.successfulToolCalls).toBe(14);
      expect(progressProps.failedToolCalls).toBe(1);
      expect(progressProps.filesModified).toHaveLength(2);
    });
  });
});
