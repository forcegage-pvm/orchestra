/**
 * Tests for Aggregate Updater
 *
 * Verifies incremental computation of session aggregate updates from events.
 * Covers all event types, edge cases, and deduplication logic.
 */

import { describe, expect, it } from "vitest";
import { updateAggregatesFromEvent } from "../../../../src/agents/sessions/aggregateUpdater.js";
import type {
  AgentEvent,
  ErrorEvent,
  PromptEvent,
  StatusChangeEvent,
  ThinkingEvent,
  ToolCallEvent,
  ToolFileOperationEvent,
  ToolMetadataEvent,
  ToolOutputEvent,
  ToolProgressEvent,
  ToolResultEvent,
} from "../../../../src/agents/sessions/types.js";

describe("updateAggregatesFromEvent", () => {
  const SESSION_ID = "session-123";
  const TOOL_CALL_ID = "tool-call-456";

  describe("tool_call events", () => {
    it("should increment toolCallCount on tool_call event", () => {
      const event: ToolCallEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "tool_call",
        toolCallId: TOOL_CALL_ID,
        toolName: "read_file",
        toolCategory: "filesystem",
        arguments: { filePath: "/path/to/file.ts" },
      };

      const update = updateAggregatesFromEvent(event, []);

      expect(update).toEqual({
        toolCallCount: 1,
      });
    });

    it("should return only toolCallCount increment for tool_call", () => {
      const event: ToolCallEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "tool_call",
        toolCallId: TOOL_CALL_ID,
        toolName: "run_in_terminal",
        toolCategory: "system",
        arguments: { command: "npm test" },
      };

      const update = updateAggregatesFromEvent(event, []);

      // Should not include other aggregate fields
      expect(update.successfulToolCalls).toBeUndefined();
      expect(update.failedToolCalls).toBeUndefined();
      expect(update.warningCount).toBeUndefined();
      expect(update.filesModified).toBeUndefined();
    });
  });

  describe("tool_result events", () => {
    it("should increment successfulToolCalls on successful tool result", () => {
      const event: ToolResultEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "tool_result",
        toolCallId: TOOL_CALL_ID,
        toolName: "read_file",
        success: true,
        output: "File contents",
        error: undefined,
        durationMs: 50,
      };

      const update = updateAggregatesFromEvent(event, []);

      expect(update).toEqual({
        successfulToolCalls: 1,
      });
    });

    it("should increment failedToolCalls on failed tool result", () => {
      const event: ToolResultEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "tool_result",
        toolCallId: TOOL_CALL_ID,
        toolName: "read_file",
        success: false,
        output: "",
        error: {
          code: "FILE_NOT_FOUND",
          message: "File not found",
          suggestion: undefined,
          details: undefined,
        },
        durationMs: 25,
      };

      const update = updateAggregatesFromEvent(event, []);

      expect(update).toEqual({
        failedToolCalls: 1,
      });
    });

    it("should not increment both success and failure counts", () => {
      const successEvent: ToolResultEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "tool_result",
        toolCallId: TOOL_CALL_ID,
        toolName: "read_file",
        success: true,
        output: "Success",
        error: undefined,
        durationMs: 50,
      };

      const successUpdate = updateAggregatesFromEvent(successEvent, []);

      expect(successUpdate.successfulToolCalls).toBe(1);
      expect(successUpdate.failedToolCalls).toBeUndefined();

      const failEvent: ToolResultEvent = {
        ...successEvent,
        id: "event-2",
        success: false,
        output: "",
        error: {
          code: "EXECUTION_ERROR",
          message: "Failed",
          suggestion: undefined,
          details: undefined,
        },
      };

      const failUpdate = updateAggregatesFromEvent(failEvent, []);

      expect(failUpdate.failedToolCalls).toBe(1);
      expect(failUpdate.successfulToolCalls).toBeUndefined();
    });
  });

  describe("error events", () => {
    it("should increment warningCount on warning event", () => {
      const event: ErrorEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "error",
        severity: "warning",
        code: "DEPRECATED_API",
        message: "Using deprecated API",
        recoverable: true,
        details: undefined,
        suggestion: undefined,
      };

      const update = updateAggregatesFromEvent(event, []);

      expect(update).toEqual({
        warningCount: 1,
      });
    });

    it("should not increment warningCount on error severity event", () => {
      const event: ErrorEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "error",
        severity: "error",
        code: "FATAL_ERROR",
        message: "Critical error occurred",
        recoverable: false,
        details: undefined,
        suggestion: undefined,
      };

      const update = updateAggregatesFromEvent(event, []);

      expect(update).toEqual({});
    });

    it("should distinguish between warning and error severity", () => {
      const warningEvent: ErrorEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "error",
        severity: "warning",
        code: "WARN_CODE",
        message: "Warning message",
        recoverable: true,
        details: undefined,
        suggestion: undefined,
      };

      const errorEvent: ErrorEvent = {
        ...warningEvent,
        id: "event-2",
        severity: "error",
        code: "ERROR_CODE",
        message: "Error message",
        recoverable: false,
      };

      const warningUpdate = updateAggregatesFromEvent(warningEvent, []);
      const errorUpdate = updateAggregatesFromEvent(errorEvent, []);

      expect(warningUpdate.warningCount).toBe(1);
      expect(errorUpdate.warningCount).toBeUndefined();
      expect(Object.keys(errorUpdate)).toHaveLength(0);
    });
  });

  describe("tool_file_operation events", () => {
    it("should add unique file paths to filesModified", () => {
      const event: ToolFileOperationEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "tool_file_operation",
        toolCallId: TOOL_CALL_ID,
        toolName: "create_file",
        operation: {
          operation: "create",
          path: "/src/utils/helper.ts",
          targetPath: undefined,
          size: 1024,
          linesChanged: undefined,
          linesInserted: undefined,
          linesDeleted: undefined,
        },
      };

      const update = updateAggregatesFromEvent(event, []);

      expect(update.filesModified).toEqual(["/src/utils/helper.ts"]);
    });

    it("should not add duplicate file paths", () => {
      const event: ToolFileOperationEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "tool_file_operation",
        toolCallId: TOOL_CALL_ID,
        toolName: "replace_string_in_file",
        operation: {
          operation: "update",
          path: "/src/utils/helper.ts",
          targetPath: undefined,
          size: 1024,
          linesChanged: 5,
          linesInserted: 3,
          linesDeleted: 2,
        },
      };

      const currentFiles = ["/src/utils/helper.ts", "/src/utils/other.ts"];

      const update = updateAggregatesFromEvent(event, currentFiles);

      // Should return undefined (no change) since path already exists
      expect(update).toEqual({});
    });

    it("should add new path to existing filesModified array", () => {
      const event: ToolFileOperationEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "tool_file_operation",
        toolCallId: TOOL_CALL_ID,
        toolName: "create_file",
        operation: {
          operation: "create",
          path: "/src/utils/newFile.ts",
          targetPath: undefined,
          size: 512,
          linesChanged: undefined,
          linesInserted: undefined,
          linesDeleted: undefined,
        },
      };

      const currentFiles = [
        "/src/utils/existing1.ts",
        "/src/utils/existing2.ts",
      ];

      const update = updateAggregatesFromEvent(event, currentFiles);

      expect(update.filesModified).toEqual([
        "/src/utils/existing1.ts",
        "/src/utils/existing2.ts",
        "/src/utils/newFile.ts",
      ]);
    });

    it("should handle empty currentFilesModified array", () => {
      const event: ToolFileOperationEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "tool_file_operation",
        toolCallId: TOOL_CALL_ID,
        toolName: "create_file",
        operation: {
          operation: "create",
          path: "/src/first.ts",
          targetPath: undefined,
          size: 256,
          linesChanged: undefined,
          linesInserted: undefined,
          linesDeleted: undefined,
        },
      };

      const update = updateAggregatesFromEvent(event, []);

      expect(update.filesModified).toEqual(["/src/first.ts"]);
    });

    it("should handle different file operation types", () => {
      const operations: Array<
        ToolFileOperationEvent["operation"]["operation"]
      > = ["create", "update", "delete", "move", "copy", "read"];

      operations.forEach((opType) => {
        const event: ToolFileOperationEvent = {
          id: `event-${opType}`,
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_file_operation",
          toolCallId: TOOL_CALL_ID,
          toolName: "file_tool",
          operation: {
            operation: opType,
            path: `/src/${opType}.ts`,
            targetPath:
              opType === "move" || opType === "copy" ? "/dest.ts" : undefined,
            size: 100,
            linesChanged: undefined,
            linesInserted: undefined,
            linesDeleted: undefined,
          },
        };

        const update = updateAggregatesFromEvent(event, []);

        expect(update.filesModified).toEqual([`/src/${opType}.ts`]);
      });
    });
  });

  describe("non-modifying events", () => {
    it("should return no updates for prompt events", () => {
      const event: PromptEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "prompt",
        text: "User prompt text",
        attachments: undefined,
      };

      const update = updateAggregatesFromEvent(event, []);

      expect(update).toEqual({});
    });

    it("should return no updates for thinking events", () => {
      const event: ThinkingEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "thinking",
        text: "Agent is thinking...",
        tokenCount: 150,
      };

      const update = updateAggregatesFromEvent(event, []);

      expect(update).toEqual({});
    });

    it("should return no updates for status_change events", () => {
      const event: StatusChangeEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "status_change",
        previousStatus: "initializing",
        newStatus: "running",
        message: undefined,
      };

      const update = updateAggregatesFromEvent(event, []);

      expect(update).toEqual({});
    });

    it("should return no updates for tool_progress events", () => {
      const event: ToolProgressEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "tool_progress",
        toolCallId: TOOL_CALL_ID,
        toolName: "run_in_terminal",
        message: "Running command...",
        percent: 50,
      };

      const update = updateAggregatesFromEvent(event, []);

      expect(update).toEqual({});
    });

    it("should return no updates for tool_output events", () => {
      const event: ToolOutputEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "tool_output",
        toolCallId: TOOL_CALL_ID,
        toolName: "run_in_terminal",
        chunk: "Test output line\n",
        isStderr: false,
      };

      const update = updateAggregatesFromEvent(event, []);

      expect(update).toEqual({});
    });

    it("should return no updates for tool_metadata events", () => {
      const event: ToolMetadataEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "tool_metadata",
        toolCallId: TOOL_CALL_ID,
        toolName: "run_in_terminal",
        key: "exitCode",
        value: 0,
      };

      const update = updateAggregatesFromEvent(event, []);

      expect(update).toEqual({});
    });

    it("should return no updates for non-aggregate-affecting events", () => {
      const nonModifyingEvents: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Prompt",
          attachments: undefined,
        } as PromptEvent,
        {
          id: "event-2",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:01Z",
          iteration: 0,
          type: "thinking",
          text: "Thinking",
          tokenCount: 100,
        } as ThinkingEvent,
        {
          id: "event-3",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:02Z",
          iteration: 0,
          type: "status_change",
          previousStatus: "initializing",
          newStatus: "running",
          message: undefined,
        } as StatusChangeEvent,
        {
          id: "event-4",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:03Z",
          iteration: 0,
          type: "tool_progress",
          toolCallId: TOOL_CALL_ID,
          toolName: "test_tool",
          message: "Progress",
          percent: 50,
        } as ToolProgressEvent,
        {
          id: "event-5",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:04Z",
          iteration: 0,
          type: "tool_output",
          toolCallId: TOOL_CALL_ID,
          toolName: "test_tool",
          chunk: "Output",
          isStderr: false,
        } as ToolOutputEvent,
        {
          id: "event-6",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:05Z",
          iteration: 0,
          type: "tool_metadata",
          toolCallId: TOOL_CALL_ID,
          toolName: "test_tool",
          key: "meta",
          value: "data",
        } as ToolMetadataEvent,
      ];

      nonModifyingEvents.forEach((event) => {
        const update = updateAggregatesFromEvent(event, []);
        expect(update).toEqual({});
      });
    });
  });

  describe("edge cases and boundary conditions", () => {
    it("should handle undefined currentFilesModified parameter", () => {
      const event: ToolFileOperationEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "tool_file_operation",
        toolCallId: TOOL_CALL_ID,
        toolName: "create_file",
        operation: {
          operation: "create",
          path: "/src/file.ts",
          targetPath: undefined,
          size: 100,
          linesChanged: undefined,
          linesInserted: undefined,
          linesDeleted: undefined,
        },
      };

      // Call without providing currentFilesModified (uses default [])
      const update = updateAggregatesFromEvent(event);

      expect(update.filesModified).toEqual(["/src/file.ts"]);
    });

    it("should return object with only affected fields", () => {
      const toolCallEvent: ToolCallEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "tool_call",
        toolCallId: TOOL_CALL_ID,
        toolName: "test_tool",
        toolCategory: "system",
        arguments: {},
      };

      const update = updateAggregatesFromEvent(toolCallEvent, []);

      // Should only have toolCallCount
      expect(Object.keys(update)).toHaveLength(1);
      expect(update.toolCallCount).toBe(1);
    });

    it("should be idempotent for the same event", () => {
      const event: ToolCallEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "tool_call",
        toolCallId: TOOL_CALL_ID,
        toolName: "test_tool",
        toolCategory: "system",
        arguments: {},
      };

      const update1 = updateAggregatesFromEvent(event, []);
      const update2 = updateAggregatesFromEvent(event, []);

      expect(update1).toEqual(update2);
    });

    it("should handle file paths with special characters", () => {
      const specialPaths = [
        "/src/file with spaces.ts",
        "/src/file-with-dashes.ts",
        "/src/file_with_underscores.ts",
        "/src/file.multiple.dots.ts",
        "/src/UPPERCASE.TS",
      ];

      specialPaths.forEach((path) => {
        const event: ToolFileOperationEvent = {
          id: `event-${path}`,
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_file_operation",
          toolCallId: TOOL_CALL_ID,
          toolName: "create_file",
          operation: {
            operation: "create",
            path,
            targetPath: undefined,
            size: 100,
            linesChanged: undefined,
            linesInserted: undefined,
            linesDeleted: undefined,
          },
        };

        const update = updateAggregatesFromEvent(event, []);

        expect(update.filesModified).toEqual([path]);
      });
    });
  });

  describe("incremental update pattern", () => {
    it("should return values suitable for incremental updates", () => {
      const toolCallEvent: ToolCallEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "tool_call",
        toolCallId: TOOL_CALL_ID,
        toolName: "test_tool",
        toolCategory: "system",
        arguments: {},
      };

      const update = updateAggregatesFromEvent(toolCallEvent, []);

      // Each counter field should increment by 1 (not replace)
      expect(update.toolCallCount).toBe(1);

      // The caller should add this to the existing count:
      // newCount = currentCount + update.toolCallCount
    });

    it("should preserve existing filesModified when adding new path", () => {
      const event: ToolFileOperationEvent = {
        id: "event-1",
        sessionId: SESSION_ID,
        timestamp: "2026-02-01T10:00:00Z",
        iteration: 0,
        type: "tool_file_operation",
        toolCallId: TOOL_CALL_ID,
        toolName: "create_file",
        operation: {
          operation: "create",
          path: "/src/new.ts",
          targetPath: undefined,
          size: 100,
          linesChanged: undefined,
          linesInserted: undefined,
          linesDeleted: undefined,
        },
      };

      const existingFiles = ["/src/old1.ts", "/src/old2.ts"];
      const update = updateAggregatesFromEvent(event, existingFiles);

      // Should include all existing files plus the new one
      expect(update.filesModified).toEqual([
        "/src/old1.ts",
        "/src/old2.ts",
        "/src/new.ts",
      ]);
    });
  });
});
