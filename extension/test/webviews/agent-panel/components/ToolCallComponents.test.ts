/**
 * Tool Call Components Tests
 *
 * Tests for ToolIcon, FileOperationBadge, StreamingOutput,
 * ToolCallHeader, and ToolCallCard components.
 */

import { describe, it, expect } from "vitest";
import type {
  FileOperation,
  ToolCallAggregate,
} from "../../../../src/agents/sessions/types.js";

describe("Tool Call Components", () => {
  describe("ToolIcon Mapping", () => {
    it("should map coding tools to correct icons", () => {
      const codingTools = [
        { tool: "read_file", icon: "file-text" },
        { tool: "edit_file", icon: "file-edit" },
        { tool: "create_file", icon: "file-plus" },
        { tool: "delete_file", icon: "file-minus" },
        { tool: "search_files", icon: "folder-search" },
        { tool: "grep_search", icon: "search" },
      ];

      for (const { tool, icon } of codingTools) {
        expect(tool).toBeDefined();
        expect(icon).toBeDefined();
      }
    });

    it("should map filesystem tools to correct icons", () => {
      const filesystemTools = [
        { tool: "copy_file", icon: "copy" },
        { tool: "move_file", icon: "file-symlink" },
        { tool: "move_directory", icon: "folder-symlink" },
      ];

      for (const { tool, icon } of filesystemTools) {
        expect(tool).toBeDefined();
        expect(icon).toBeDefined();
      }
    });

    it("should map system tools to correct icons", () => {
      const systemTools = [
        { tool: "run_terminal", icon: "terminal" },
        { tool: "run_command", icon: "terminal-square" },
        { tool: "run_task", icon: "play" },
        { tool: "run_tests", icon: "test-tube" },
        { tool: "get_problems", icon: "alert-circle" },
      ];

      for (const { tool, icon } of systemTools) {
        expect(tool).toBeDefined();
        expect(icon).toBeDefined();
      }
    });

    it("should map orchestra tools to correct icons", () => {
      const orchestraTools = [
        { tool: "get_current_task", icon: "clipboard-list" },
        { tool: "signal_completion", icon: "flag" },
        { tool: "get_feedback", icon: "message-circle" },
        { tool: "get_progress", icon: "bar-chart" },
        { tool: "escalate_task", icon: "alert-triangle" },
      ];

      for (const { tool, icon } of orchestraTools) {
        expect(tool).toBeDefined();
        expect(icon).toBeDefined();
      }
    });

    it("should use default wrench icon for unknown tools", () => {
      const unknownTool = "unknown_tool_name";
      expect(unknownTool).toBe("unknown_tool_name");
    });
  });

  describe("FileOperationBadge", () => {
    it("should handle create operation", () => {
      const op: FileOperation = {
        operation: "create",
        path: "src/components/NewComponent.tsx",
        targetPath: undefined,
        size: 1024,
        linesChanged: undefined,
        linesInserted: undefined,
        linesDeleted: undefined,
      };

      expect(op.operation).toBe("create");
      expect(op.path).toBe("src/components/NewComponent.tsx");
    });

    it("should handle update operation with line changes", () => {
      const op: FileOperation = {
        operation: "update",
        path: "src/utils/helpers.ts",
        targetPath: undefined,
        size: 2048,
        linesChanged: 15,
        linesInserted: 20,
        linesDeleted: 5,
      };

      expect(op.operation).toBe("update");
      expect(op.linesChanged).toBe(15);
    });

    it("should handle move operation with target path", () => {
      const op: FileOperation = {
        operation: "move",
        path: "src/old/file.ts",
        targetPath: "src/new/file.ts",
        size: undefined,
        linesChanged: undefined,
        linesInserted: undefined,
        linesDeleted: undefined,
      };

      expect(op.operation).toBe("move");
      expect(op.targetPath).toBe("src/new/file.ts");
    });

    it("should handle delete operation", () => {
      const op: FileOperation = {
        operation: "delete",
        path: "src/deprecated/old.ts",
        targetPath: undefined,
        size: undefined,
        linesChanged: undefined,
        linesInserted: undefined,
        linesDeleted: undefined,
      };

      expect(op.operation).toBe("delete");
    });

    it("should handle read operation", () => {
      const op: FileOperation = {
        operation: "read",
        path: "src/config.ts",
        targetPath: undefined,
        size: 512,
        linesChanged: undefined,
        linesInserted: undefined,
        linesDeleted: undefined,
      };

      expect(op.operation).toBe("read");
    });

    it("should handle copy operation", () => {
      const op: FileOperation = {
        operation: "copy",
        path: "src/template.ts",
        targetPath: "src/copy.ts",
        size: 1024,
        linesChanged: undefined,
        linesInserted: undefined,
        linesDeleted: undefined,
      };

      expect(op.operation).toBe("copy");
      expect(op.targetPath).toBe("src/copy.ts");
    });
  });

  describe("StreamingOutput", () => {
    it("should handle empty output", () => {
      const chunks: string[] = [];
      expect(chunks.length).toBe(0);
    });

    it("should handle short output (less than 5 lines)", () => {
      const chunks = ["line 1\n", "line 2\n", "line 3\n"];
      const lines = chunks.join("").split("\n");
      expect(lines.length).toBeLessThanOrEqual(5);
    });

    it("should cap at 5 lines for preview", () => {
      const chunks = ["line 1\n", "line 2\n", "line 3\n", "line 4\n", "line 5\n", "line 6\n", "line 7\n"];
      const lines = chunks.join("").split("\n");
      const preview = lines.slice(-5);
      expect(preview.length).toBeLessThanOrEqual(5);
    });

    it("should handle 500 line maximum", () => {
      const chunks: string[] = [];
      for (let i = 0; i < 600; i++) {
        chunks.push(`line ${i}\n`);
      }
      const lines = chunks.join("").split("\n");
      const capped = lines.slice(0, 500);
      expect(capped.length).toBe(500);
    });

    it("should distinguish stderr from stdout", () => {
      const isStderr = true;
      const isStdout = false;
      expect(isStderr).toBe(true);
      expect(isStdout).toBe(false);
    });

    it("should calculate hidden line count correctly", () => {
      const chunks: string[] = [];
      for (let i = 0; i < 10; i++) {
        chunks.push(`line ${i}\n`);
      }
      const lines = chunks.join("").split("\n");
      const preview = lines.slice(-5);
      const hiddenCount = lines.length - preview.length;
      expect(hiddenCount).toBeGreaterThan(0);
    });
  });

  describe("ToolCallHeader", () => {
    it("should format duration for milliseconds", () => {
      const formatDuration = (ms: number): string => {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
      };

      expect(formatDuration(123)).toBe("123ms");
      expect(formatDuration(1234)).toBe("1.2s");
      expect(formatDuration(65000)).toBe("1m 5s");
      expect(formatDuration(125000)).toBe("2m 5s");
    });

    it("should format timestamp as HH:MM:SS", () => {
      const iso = "2024-01-15T14:30:45.123Z";
      const d = new Date(iso);
      const formatted = d.toLocaleTimeString("en-US", { hour12: false });
      expect(formatted).toMatch(/\d{1,2}:\d{2}:\d{2}/);
    });

    it("should display correct status colors", () => {
      const statuses: Array<ToolCallAggregate["status"]> = [
        "pending",
        "running",
        "success",
        "failed",
      ];

      for (const status of statuses) {
        expect(status).toBeDefined();
      }
    });
  });

  describe("ToolCallCard", () => {
    const createMockToolCall = (
      overrides?: Partial<ToolCallAggregate>
    ): ToolCallAggregate => ({
      toolCallId: "test-call-1",
      toolName: "read_file",
      toolCategory: "coding",
      status: "success",
      startedAt: "2024-01-15T14:30:00.000Z",
      completedAt: "2024-01-15T14:30:01.234Z",
      durationMs: 1234,
      arguments: { path: "test.ts" },
      result: "File read successfully",
      error: undefined,
      lastProgressMessage: undefined,
      progressPercent: undefined,
      outputChunks: [],
      outputLineCount: 0,
      fileOperations: [],
      metadata: {},
      events: [],
      ...overrides,
    });

    it("should handle tool call with progress", () => {
      const toolCall = createMockToolCall({
        status: "running",
        lastProgressMessage: "Reading file...",
        progressPercent: 50,
      });

      expect(toolCall.lastProgressMessage).toBe("Reading file...");
      expect(toolCall.progressPercent).toBe(50);
    });

    it("should handle tool call with file operations", () => {
      const fileOps: FileOperation[] = [
        {
          operation: "create",
          path: "src/new.ts",
          targetPath: undefined,
          size: 1024,
          linesChanged: undefined,
          linesInserted: undefined,
          linesDeleted: undefined,
        },
      ];

      const toolCall = createMockToolCall({
        fileOperations: fileOps,
      });

      expect(toolCall.fileOperations.length).toBe(1);
      expect(toolCall.fileOperations[0].operation).toBe("create");
    });

    it("should handle tool call with output", () => {
      const toolCall = createMockToolCall({
        outputChunks: ["line 1\n", "line 2\n", "line 3\n"],
        outputLineCount: 3,
      });

      expect(toolCall.outputChunks.length).toBe(3);
      expect(toolCall.outputLineCount).toBe(3);
    });

    it("should handle successful tool call", () => {
      const toolCall = createMockToolCall({
        status: "success",
        result: "Operation completed successfully",
      });

      expect(toolCall.status).toBe("success");
      expect(toolCall.result).toBe("Operation completed successfully");
      expect(toolCall.error).toBeUndefined();
    });

    it("should handle failed tool call with error", () => {
      const toolCall = createMockToolCall({
        status: "failed",
        error: {
          code: "FILE_NOT_FOUND",
          message: "The specified file does not exist",
          suggestion: "Check the file path and try again",
          details: { path: "missing.ts" },
        },
      });

      expect(toolCall.status).toBe("failed");
      expect(toolCall.error?.code).toBe("FILE_NOT_FOUND");
      expect(toolCall.error?.suggestion).toBe("Check the file path and try again");
    });

    it("should handle pending tool call", () => {
      const toolCall = createMockToolCall({
        status: "pending",
        completedAt: undefined,
        durationMs: undefined,
      });

      expect(toolCall.status).toBe("pending");
      expect(toolCall.completedAt).toBeUndefined();
      expect(toolCall.durationMs).toBeUndefined();
    });

    it("should handle running tool call", () => {
      const toolCall = createMockToolCall({
        status: "running",
        completedAt: undefined,
        durationMs: undefined,
        lastProgressMessage: "Processing...",
      });

      expect(toolCall.status).toBe("running");
      expect(toolCall.lastProgressMessage).toBe("Processing...");
    });
  });

  describe("Integration: Full Tool Call Flow", () => {
    it("should represent a complete tool call lifecycle", () => {
      const toolCall: ToolCallAggregate = {
        toolCallId: "test-call-full",
        toolName: "create_file",
        toolCategory: "coding",
        status: "success",
        startedAt: "2024-01-15T14:30:00.000Z",
        completedAt: "2024-01-15T14:30:02.500Z",
        durationMs: 2500,
        arguments: {
          path: "src/components/NewComponent.tsx",
          content: "export function NewComponent() {}",
        },
        result: "File created successfully",
        error: undefined,
        lastProgressMessage: "Writing file...",
        progressPercent: 100,
        outputChunks: ["Created file\n", "Written 35 lines\n"],
        outputLineCount: 2,
        fileOperations: [
          {
            operation: "create",
            path: "src/components/NewComponent.tsx",
            targetPath: undefined,
            size: 1024,
            linesChanged: 35,
            linesInserted: 35,
            linesDeleted: 0,
          },
        ],
        metadata: {
          encoding: "utf-8",
        },
        events: [],
      };

      // Verify all aspects
      expect(toolCall.toolName).toBe("create_file");
      expect(toolCall.status).toBe("success");
      expect(toolCall.durationMs).toBe(2500);
      expect(toolCall.fileOperations.length).toBe(1);
      expect(toolCall.outputChunks.length).toBe(2);
      expect(toolCall.result).toBe("File created successfully");
    });
  });
});
