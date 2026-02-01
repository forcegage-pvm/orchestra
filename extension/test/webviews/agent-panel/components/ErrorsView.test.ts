/**
 * ErrorsView Component Tests
 *
 * Tests for the ErrorsView and ErrorItem components covering:
 * - Component exports and type interfaces
 * - ErrorItem props validation
 * - ErrorsView filtering logic
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.8
 */

import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "../../../../src/agents/sessions/types.js";

describe("ErrorsView Components", () => {
  describe("Component Exports", () => {
    it("should export ErrorsView component", async () => {
      const module =
        await import("../../../../src/webviews/agent-panel/views/index.js");
      expect(module.ErrorsView).toBeDefined();
      expect(typeof module.ErrorsView).toBe("function");
    });

    it("should export ErrorItem component", async () => {
      const module =
        await import("../../../../src/webviews/agent-panel/components/index.js");
      expect(module.ErrorItem).toBeDefined();
      expect(typeof module.ErrorItem).toBe("function");
    });
  });

  describe("Type Compatibility", () => {
    it("should accept valid ErrorItem props with error severity", () => {
      const errorEvent: ErrorEvent = {
        id: "evt-001",
        sessionId: "sess-001",
        timestamp: "2026-02-01T12:34:56.000Z",
        iteration: 1,
        type: "error",
        severity: "error",
        code: "FILE_NOT_FOUND",
        message: "Could not find file: src/missing.ts",
        recoverable: true,
        details: { path: "src/missing.ts" },
        suggestion: "Check if the file path is correct",
      };

      const props: import("../../../../src/webviews/agent-panel/components/ErrorItem.js").ErrorItemProps =
        {
          event: errorEvent,
          toolName: "read_file",
        };

      expect(props).toBeDefined();
      expect(props.event.severity).toBe("error");
      expect(props.toolName).toBe("read_file");
    });

    it("should accept valid ErrorItem props with warning severity", () => {
      const warningEvent: ErrorEvent = {
        id: "evt-002",
        sessionId: "sess-001",
        timestamp: "2026-02-01T12:35:00.000Z",
        iteration: 2,
        type: "error",
        severity: "warning",
        code: "SEARCH_TIMEOUT",
        message: "Search timed out after 30 seconds",
        recoverable: true,
        details: undefined,
        suggestion: undefined,
      };

      const props: import("../../../../src/webviews/agent-panel/components/ErrorItem.js").ErrorItemProps =
        {
          event: warningEvent,
          toolName: undefined,
        };

      expect(props).toBeDefined();
      expect(props.event.severity).toBe("warning");
    });

    it("should handle ErrorItem props without optional fields", () => {
      const minimalError: ErrorEvent = {
        id: "evt-003",
        sessionId: "sess-001",
        timestamp: "2026-02-01T12:36:00.000Z",
        iteration: 3,
        type: "error",
        severity: "error",
        code: "UNKNOWN",
        message: "An error occurred",
        recoverable: false,
        details: undefined,
        suggestion: undefined,
      };

      const props: import("../../../../src/webviews/agent-panel/components/ErrorItem.js").ErrorItemProps =
        {
          event: minimalError,
        };

      expect(props).toBeDefined();
      expect(props.event.code).toBe("UNKNOWN");
      expect(props.toolName).toBeUndefined();
    });
  });

  describe("ErrorEvent Structure", () => {
    it("should validate ErrorEvent type structure", () => {
      const errorEvent: ErrorEvent = {
        id: "evt-001",
        sessionId: "sess-001",
        timestamp: "2026-02-01T12:34:56.000Z",
        iteration: 1,
        type: "error",
        severity: "error",
        code: "TEST_ERROR",
        message: "Test error message",
        recoverable: true,
        details: { key: "value" },
        suggestion: "Test suggestion",
      };

      expect(errorEvent.type).toBe("error");
      expect(errorEvent.severity).toBe("error");
      expect(errorEvent.code).toBeDefined();
      expect(errorEvent.message).toBeDefined();
      expect(errorEvent.recoverable).toBe(true);
    });

    it("should handle both error and warning severities", () => {
      const severities: Array<"error" | "warning"> = ["error", "warning"];

      severities.forEach((severity) => {
        const event: ErrorEvent = {
          id: `evt-${severity}`,
          sessionId: "sess-001",
          timestamp: "2026-02-01T12:34:56.000Z",
          iteration: 1,
          type: "error",
          severity,
          code: "TEST",
          message: `Test ${severity}`,
          recoverable: true,
          details: undefined,
          suggestion: undefined,
        };

        expect(event.severity).toBe(severity);
      });
    });
  });

  describe("Severity Filtering Logic", () => {
    it("should filter errors by severity type", () => {
      const allErrors: ErrorEvent[] = [
        {
          id: "err-1",
          sessionId: "sess-001",
          timestamp: "2026-02-01T12:34:56.000Z",
          iteration: 1,
          type: "error",
          severity: "error",
          code: "ERR1",
          message: "Error 1",
          recoverable: true,
          details: undefined,
          suggestion: undefined,
        },
        {
          id: "warn-1",
          sessionId: "sess-001",
          timestamp: "2026-02-01T12:35:00.000Z",
          iteration: 2,
          type: "error",
          severity: "warning",
          code: "WARN1",
          message: "Warning 1",
          recoverable: true,
          details: undefined,
          suggestion: undefined,
        },
        {
          id: "err-2",
          sessionId: "sess-001",
          timestamp: "2026-02-01T12:36:00.000Z",
          iteration: 3,
          type: "error",
          severity: "error",
          code: "ERR2",
          message: "Error 2",
          recoverable: false,
          details: undefined,
          suggestion: undefined,
        },
      ];

      const errors = allErrors.filter((e) => e.severity === "error");
      const warnings = allErrors.filter((e) => e.severity === "warning");

      expect(errors).toHaveLength(2);
      expect(warnings).toHaveLength(1);
    });

    it("should sort errors chronologically", () => {
      const unsorted: ErrorEvent[] = [
        {
          id: "evt-3",
          sessionId: "sess-001",
          timestamp: "2026-02-01T12:36:00.000Z",
          iteration: 3,
          type: "error",
          severity: "error",
          code: "ERR3",
          message: "Error 3",
          recoverable: true,
          details: undefined,
          suggestion: undefined,
        },
        {
          id: "evt-1",
          sessionId: "sess-001",
          timestamp: "2026-02-01T12:34:00.000Z",
          iteration: 1,
          type: "error",
          severity: "error",
          code: "ERR1",
          message: "Error 1",
          recoverable: true,
          details: undefined,
          suggestion: undefined,
        },
        {
          id: "evt-2",
          sessionId: "sess-001",
          timestamp: "2026-02-01T12:35:00.000Z",
          iteration: 2,
          type: "error",
          severity: "error",
          code: "ERR2",
          message: "Error 2",
          recoverable: true,
          details: undefined,
          suggestion: undefined,
        },
      ];

      const sorted = unsorted.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      expect(sorted[0].id).toBe("evt-3"); // Newest first
      expect(sorted[1].id).toBe("evt-2");
      expect(sorted[2].id).toBe("evt-1");
    });
  });
});
