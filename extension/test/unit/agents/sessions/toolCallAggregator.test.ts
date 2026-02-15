/**
 * Tests for Tool Call Aggregator
 *
 * Verifies aggregation of tool call events into structured ToolCallAggregate.
 * Covers all event types, status transitions, and edge cases.
 */

import { describe, expect, it } from "vitest";
import { aggregateToolCall } from "../../../../src/agents/sessions/toolCallAggregator.js";
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

describe("aggregateToolCall", () => {
  const SESSION_ID = "session-123";
  const TOOL_CALL_ID = "tool-call-456";

  describe("Basic Aggregation", () => {
    it("should return null when no matching ToolCallEvent found", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Test prompt",
          attachments: undefined,
        } as PromptEvent,
      ];

      const result = aggregateToolCall(events, "nonexistent-tool-call");

      expect(result).toBeNull();
    });

    it("should aggregate basic tool call with minimal events", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "read_file",
          toolCategory: "filesystem",
          arguments: { filePath: "/path/to/file.ts" },
        } as ToolCallEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      expect(result).not.toBeNull();
      expect(result!.toolCallId).toBe(TOOL_CALL_ID);
      expect(result!.toolName).toBe("read_file");
      expect(result!.toolCategory).toBe("filesystem");
      expect(result!.arguments).toEqual({ filePath: "/path/to/file.ts" });
      expect(result!.startedAt).toBe("2026-02-01T10:00:00Z");
      expect(result!.status).toBe("pending");
    });

    it("should extract toolName, toolCategory, and arguments from ToolCallEvent", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          toolCategory: "system",
          arguments: {
            command: "npm test",
            explanation: "Run tests",
            isBackground: false,
          },
        } as ToolCallEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      expect(result!.toolName).toBe("run_in_terminal");
      expect(result!.toolCategory).toBe("system");
      expect(result!.arguments).toEqual({
        command: "npm test",
        explanation: "Run tests",
        isBackground: false,
      });
    });

    it("should include only relevant events in events array", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "Unrelated prompt",
          attachments: undefined,
        } as PromptEvent,
        {
          id: "event-2",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:01Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "read_file",
          toolCategory: "filesystem",
          arguments: {},
        } as ToolCallEvent,
        {
          id: "event-3",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:02Z",
          iteration: 0,
          type: "thinking",
          text: "Unrelated thinking",
          tokenCount: 100,
        } as ThinkingEvent,
        {
          id: "event-4",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:03Z",
          iteration: 0,
          type: "tool_result",
          toolCallId: TOOL_CALL_ID,
          toolName: "read_file",
          success: true,
          output: "File contents",
          error: undefined,
          durationMs: 50,
        } as ToolResultEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      expect(result!.events).toHaveLength(2);
      expect(result!.events[0].type).toBe("tool_call");
      expect(result!.events[1].type).toBe("tool_result");
    });
  });

  describe("Status Computation", () => {
    it("should compute status as 'pending' when no result or progress events exist", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "read_file",
          toolCategory: "filesystem",
          arguments: {},
        } as ToolCallEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      expect(result!.status).toBe("pending");
      expect(result!.completedAt).toBeUndefined();
      expect(result!.durationMs).toBeUndefined();
    });

    it("should compute status as 'running' when progress events exist but no result", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          toolCategory: "system",
          arguments: {},
        } as ToolCallEvent,
        {
          id: "event-2",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:01Z",
          iteration: 0,
          type: "tool_progress",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          message: "Running command...",
          percent: 50,
        } as ToolProgressEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      expect(result!.status).toBe("running");
      expect(result!.lastProgressMessage).toBe("Running command...");
      expect(result!.progressPercent).toBe(50);
    });

    it("should compute status as 'success' when result.success is true", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "read_file",
          toolCategory: "filesystem",
          arguments: {},
        } as ToolCallEvent,
        {
          id: "event-2",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:05Z",
          iteration: 0,
          type: "tool_result",
          toolCallId: TOOL_CALL_ID,
          toolName: "read_file",
          success: true,
          output: "File read successfully",
          error: undefined,
          durationMs: 150,
        } as ToolResultEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      expect(result!.status).toBe("success");
      expect(result!.completedAt).toBe("2026-02-01T10:00:05Z");
      expect(result!.durationMs).toBe(150);
      expect(result!.result).toBe("File read successfully");
      expect(result!.error).toBeUndefined();
    });

    it("should compute status as 'failed' when result.success is false", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "read_file",
          toolCategory: "filesystem",
          arguments: {},
        } as ToolCallEvent,
        {
          id: "event-2",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:02Z",
          iteration: 0,
          type: "tool_result",
          toolCallId: TOOL_CALL_ID,
          toolName: "read_file",
          success: false,
          output: "",
          error: {
            code: "FILE_NOT_FOUND",
            message: "File does not exist",
            suggestion: "Check the file path",
            details: undefined,
          },
          durationMs: 25,
        } as ToolResultEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      expect(result!.status).toBe("failed");
      expect(result!.error).toBeDefined();
      expect(result!.error!.code).toBe("FILE_NOT_FOUND");
      expect(result!.error!.message).toBe("File does not exist");
      expect(result!.error!.suggestion).toBe("Check the file path");
    });
  });

  describe("Output Aggregation", () => {
    it("should collect output chunks in order", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          toolCategory: "system",
          arguments: {},
        } as ToolCallEvent,
        {
          id: "event-2",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:01Z",
          iteration: 0,
          type: "tool_output",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          chunk: "Line 1\n",
          isStderr: false,
        } as ToolOutputEvent,
        {
          id: "event-3",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:02Z",
          iteration: 0,
          type: "tool_output",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          chunk: "Line 2\n",
          isStderr: false,
        } as ToolOutputEvent,
        {
          id: "event-4",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:03Z",
          iteration: 0,
          type: "tool_output",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          chunk: "Line 3",
          isStderr: false,
        } as ToolOutputEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      expect(result!.outputChunks).toEqual(["Line 1\n", "Line 2\n", "Line 3"]);
    });

    it("should compute outputLineCount from joined chunks", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          toolCategory: "system",
          arguments: {},
        } as ToolCallEvent,
        {
          id: "event-2",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:01Z",
          iteration: 0,
          type: "tool_output",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          chunk: "Line 1\nLine 2\n",
          isStderr: false,
        } as ToolOutputEvent,
        {
          id: "event-3",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:02Z",
          iteration: 0,
          type: "tool_output",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          chunk: "Line 3",
          isStderr: false,
        } as ToolOutputEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      // "Line 1\nLine 2\nLine 3" has 3 lines
      expect(result!.outputLineCount).toBe(3);
    });

    it("should handle empty output chunks array", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "read_file",
          toolCategory: "filesystem",
          arguments: {},
        } as ToolCallEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      expect(result!.outputChunks).toEqual([]);
      expect(result!.outputLineCount).toBe(1); // Empty string has 1 line
    });
  });

  describe("File Operations", () => {
    it("should collect all file operations from events", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "replace_string_in_file",
          toolCategory: "coding",
          arguments: {},
        } as ToolCallEvent,
        {
          id: "event-2",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:01Z",
          iteration: 0,
          type: "tool_file_operation",
          toolCallId: TOOL_CALL_ID,
          toolName: "replace_string_in_file",
          operation: {
            operation: "update",
            path: "/path/to/file1.ts",
            targetPath: undefined,
            size: 1024,
            linesChanged: 5,
            linesInserted: 3,
            linesDeleted: 2,
          },
        } as ToolFileOperationEvent,
        {
          id: "event-3",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:02Z",
          iteration: 0,
          type: "tool_file_operation",
          toolCallId: TOOL_CALL_ID,
          toolName: "replace_string_in_file",
          operation: {
            operation: "update",
            path: "/path/to/file2.ts",
            targetPath: undefined,
            size: 2048,
            linesChanged: 10,
            linesInserted: 7,
            linesDeleted: 3,
          },
        } as ToolFileOperationEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      expect(result!.fileOperations).toHaveLength(2);
      expect(result!.fileOperations[0].path).toBe("/path/to/file1.ts");
      expect(result!.fileOperations[0].operation).toBe("update");
      expect(result!.fileOperations[1].path).toBe("/path/to/file2.ts");
    });

    it("should handle empty file operations array", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "read_file",
          toolCategory: "filesystem",
          arguments: {},
        } as ToolCallEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      expect(result!.fileOperations).toEqual([]);
    });
  });

  describe("Metadata Aggregation", () => {
    it("should merge metadata from multiple events", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          toolCategory: "system",
          arguments: {},
        } as ToolCallEvent,
        {
          id: "event-2",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:01Z",
          iteration: 0,
          type: "tool_metadata",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          key: "pid",
          value: 12345,
        } as ToolMetadataEvent,
        {
          id: "event-3",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:02Z",
          iteration: 0,
          type: "tool_metadata",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          key: "exitCode",
          value: 0,
        } as ToolMetadataEvent,
        {
          id: "event-4",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:03Z",
          iteration: 0,
          type: "tool_metadata",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          key: "terminal",
          value: "pwsh",
        } as ToolMetadataEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      expect(result!.metadata).toEqual({
        pid: 12345,
        exitCode: 0,
        terminal: "pwsh",
      });
    });

    it("should overwrite duplicate metadata keys with latest value", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          toolCategory: "system",
          arguments: {},
        } as ToolCallEvent,
        {
          id: "event-2",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:01Z",
          iteration: 0,
          type: "tool_metadata",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          key: "status",
          value: "starting",
        } as ToolMetadataEvent,
        {
          id: "event-3",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:02Z",
          iteration: 0,
          type: "tool_metadata",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          key: "status",
          value: "running",
        } as ToolMetadataEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      expect(result!.metadata.status).toBe("running");
    });

    it("should handle empty metadata object", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "read_file",
          toolCategory: "filesystem",
          arguments: {},
        } as ToolCallEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      expect(result!.metadata).toEqual({});
    });
  });

  describe("Progress Tracking", () => {
    it("should capture most recent progress message and percent", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          toolCategory: "system",
          arguments: {},
        } as ToolCallEvent,
        {
          id: "event-2",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:01Z",
          iteration: 0,
          type: "tool_progress",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          message: "Starting...",
          percent: 0,
        } as ToolProgressEvent,
        {
          id: "event-3",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:02Z",
          iteration: 0,
          type: "tool_progress",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          message: "In progress...",
          percent: 50,
        } as ToolProgressEvent,
        {
          id: "event-4",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:03Z",
          iteration: 0,
          type: "tool_progress",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          message: "Almost done...",
          percent: 90,
        } as ToolProgressEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      // Should use LAST progress event
      expect(result!.lastProgressMessage).toBe("Almost done...");
      expect(result!.progressPercent).toBe(90);
    });

    it("should handle undefined progress values", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "run_in_terminal",
          toolCategory: "system",
          arguments: {},
        } as ToolCallEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      expect(result!.lastProgressMessage).toBeUndefined();
      expect(result!.progressPercent).toBeUndefined();
    });
  });

  describe("Complete Tool Call Lifecycle", () => {
    it("should aggregate complete tool call with all event types", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "multi_replace_string_in_file",
          toolCategory: "coding",
          arguments: {
            replacements: [
              { filePath: "file1.ts", oldString: "old", newString: "new" },
            ],
          },
        } as ToolCallEvent,
        {
          id: "event-2",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:01Z",
          iteration: 0,
          type: "tool_progress",
          toolCallId: TOOL_CALL_ID,
          toolName: "multi_replace_string_in_file",
          message: "Processing file 1 of 1",
          percent: 50,
        } as ToolProgressEvent,
        {
          id: "event-3",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:02Z",
          iteration: 0,
          type: "tool_output",
          toolCallId: TOOL_CALL_ID,
          toolName: "multi_replace_string_in_file",
          chunk: "Replacing string in file1.ts\n",
          isStderr: false,
        } as ToolOutputEvent,
        {
          id: "event-4",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:03Z",
          iteration: 0,
          type: "tool_file_operation",
          toolCallId: TOOL_CALL_ID,
          toolName: "multi_replace_string_in_file",
          operation: {
            operation: "update",
            path: "file1.ts",
            targetPath: undefined,
            size: 512,
            linesChanged: 1,
            linesInserted: 1,
            linesDeleted: 1,
          },
        } as ToolFileOperationEvent,
        {
          id: "event-5",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:04Z",
          iteration: 0,
          type: "tool_metadata",
          toolCallId: TOOL_CALL_ID,
          toolName: "multi_replace_string_in_file",
          key: "filesModified",
          value: 1,
        } as ToolMetadataEvent,
        {
          id: "event-6",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:05Z",
          iteration: 0,
          type: "tool_result",
          toolCallId: TOOL_CALL_ID,
          toolName: "multi_replace_string_in_file",
          success: true,
          output: "All replacements completed successfully",
          error: undefined,
          durationMs: 250,
        } as ToolResultEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      expect(result).not.toBeNull();
      expect(result!.toolCallId).toBe(TOOL_CALL_ID);
      expect(result!.toolName).toBe("multi_replace_string_in_file");
      expect(result!.toolCategory).toBe("coding");
      expect(result!.status).toBe("success");
      expect(result!.startedAt).toBe("2026-02-01T10:00:00Z");
      expect(result!.completedAt).toBe("2026-02-01T10:00:05Z");
      expect(result!.durationMs).toBe(250);
      expect(result!.lastProgressMessage).toBe("Processing file 1 of 1");
      expect(result!.progressPercent).toBe(50);
      expect(result!.outputChunks).toEqual(["Replacing string in file1.ts\n"]);
      expect(result!.fileOperations).toHaveLength(1);
      expect(result!.fileOperations[0].path).toBe("file1.ts");
      expect(result!.metadata).toEqual({ filesModified: 1 });
      expect(result!.result).toBe("All replacements completed successfully");
      expect(result!.events).toHaveLength(6);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty events array", () => {
      const result = aggregateToolCall([], TOOL_CALL_ID);

      expect(result).toBeNull();
    });

    it("should filter out non-tool events correctly", () => {
      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "prompt",
          text: "User prompt",
          attachments: undefined,
        } as PromptEvent,
        {
          id: "event-2",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:01Z",
          iteration: 0,
          type: "thinking",
          text: "Agent thinking",
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
          type: "error",
          severity: "warning",
          code: "WARN_001",
          message: "Warning message",
          recoverable: true,
          details: undefined,
          suggestion: undefined,
        } as ErrorEvent,
        {
          id: "event-5",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:04Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "read_file",
          toolCategory: "filesystem",
          arguments: {},
        } as ToolCallEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      expect(result).not.toBeNull();
      expect(result!.events).toHaveLength(1);
      expect(result!.events[0].type).toBe("tool_call");
    });

    it("should handle multiple tool calls and only aggregate the requested one", () => {
      const OTHER_TOOL_CALL_ID = "tool-call-789";

      const events: AgentEvent[] = [
        {
          id: "event-1",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:00Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: TOOL_CALL_ID,
          toolName: "read_file",
          toolCategory: "filesystem",
          arguments: { filePath: "file1.ts" },
        } as ToolCallEvent,
        {
          id: "event-2",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:01Z",
          iteration: 0,
          type: "tool_call",
          toolCallId: OTHER_TOOL_CALL_ID,
          toolName: "run_in_terminal",
          toolCategory: "system",
          arguments: { command: "npm test" },
        } as ToolCallEvent,
        {
          id: "event-3",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:02Z",
          iteration: 0,
          type: "tool_result",
          toolCallId: TOOL_CALL_ID,
          toolName: "read_file",
          success: true,
          output: "File contents",
          error: undefined,
          durationMs: 50,
        } as ToolResultEvent,
        {
          id: "event-4",
          sessionId: SESSION_ID,
          timestamp: "2026-02-01T10:00:03Z",
          iteration: 0,
          type: "tool_result",
          toolCallId: OTHER_TOOL_CALL_ID,
          toolName: "run_in_terminal",
          success: true,
          output: "Tests passed",
          error: undefined,
          durationMs: 1000,
        } as ToolResultEvent,
      ];

      const result = aggregateToolCall(events, TOOL_CALL_ID);

      expect(result).not.toBeNull();
      expect(result!.toolCallId).toBe(TOOL_CALL_ID);
      expect(result!.toolName).toBe("read_file");
      expect(result!.events).toHaveLength(2);
      expect(result!.durationMs).toBe(50);
      expect(result!.result).toBe("File contents");

      // Should NOT include events from OTHER_TOOL_CALL_ID
      expect(result!.events.every((e) => {
        if (e.type === "tool_call" || e.type === "tool_result") {
          return (e as { toolCallId: string }).toolCallId === TOOL_CALL_ID;
        }
        return true;
      })).toBe(true);
    });
  });
});
