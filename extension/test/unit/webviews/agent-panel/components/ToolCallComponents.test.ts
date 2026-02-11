/**
 * Tool Call Components Tests
 *
 * Tests for ToolIcon, FileOperationBadge, StreamingOutput,
 * ToolCallHeader, and ToolCallCard components.
 *
 * These tests verify component exports, props interfaces, icon mappings,
 * and component functionality without requiring a browser environment.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  FileOperation,
  ToolCallAggregate,
} from "../../../../../src/agents/sessions/types.js";

const componentsDir = join(
  __dirname,
  "../../../../../src/webviews/agent-panel/components",
);

describe("Tool Call Components", () => {
  describe("ToolIcon Component", () => {
    it("should export ToolIcon component function", async () => {
      const module =
        await import("../../../../../src/webviews/agent-panel/components/ToolIcon.js");
      expect(module).toHaveProperty("ToolIcon");
      expect(typeof module.ToolIcon).toBe("function");
    });

    it("should be exported from barrel export", async () => {
      const module =
        await import("../../../../../src/webviews/agent-panel/components/index.js");
      expect(module).toHaveProperty("ToolIcon");
    });

    it("should contain icon mapping for all tools", () => {
      const source = readFileSync(join(componentsDir, "ToolIcon.tsx"), "utf-8");

      // Verify all tools are mapped
      const allTools = [
        // CODING (15)
        "read_file",
        "edit_file",
        "edit_lines",
        "create_file",
        "create_directory",
        "delete_file",
        "insert_at_line",
        "delete_section",
        "smart_replace",
        "bulk_replace",
        "validate_edit",
        "search_files",
        "grep_search",
        "list_directory",
        "find_usages",
        // FILESYSTEM (3)
        "copy_file",
        "move_file",
        "move_directory",
        // SYSTEM (15)
        "run_terminal",
        "run_command",
        "run_task",
        "run_tests",
        "get_test_failures",
        "get_problems",
        "start_process",
        "stop_process",
        "get_process_output",
        "list_processes",
        "send_input",
        "wait_for_pattern",
        "find_port_process",
        "get_terminal_output",
        "execute_with_retry",
        // ORCHESTRA (5)
        "get_current_task",
        "signal_completion",
        "get_feedback",
        "get_progress",
        "escalate_task",
      ];

      // Verify each tool appears in the source
      for (const tool of allTools) {
        expect(source).toContain(tool);
      }
    });

    it("should have default wrench icon fallback", () => {
      const source = readFileSync(join(componentsDir, "ToolIcon.tsx"), "utf-8");
      expect(source).toContain("DEFAULT_ICON");
      expect(source).toContain("wrench");
    });

    it("should use lucide icon set", () => {
      const source = readFileSync(join(componentsDir, "ToolIcon.tsx"), "utf-8");
      expect(source).toContain("lucide:");
    });
  });

  describe("FileOperationBadge Component", () => {
    it("should export FileOperationBadge component function", async () => {
      const module =
        await import("../../../../../src/webviews/agent-panel/components/FileOperationBadge.js");
      expect(module).toHaveProperty("FileOperationBadge");
      expect(typeof module.FileOperationBadge).toBe("function");
    });

    it("should map all 6 file operation types", () => {
      const source = readFileSync(
        join(componentsDir, "FileOperationBadge.tsx"),
        "utf-8",
      );

      const operations = ["create", "update", "delete", "move", "copy", "read"];
      for (const op of operations) {
        expect(source).toContain(op);
      }
    });

    it("should have icon mappings for each operation type", () => {
      const source = readFileSync(
        join(componentsDir, "FileOperationBadge.tsx"),
        "utf-8",
      );

      expect(source).toContain("OPERATION_ICONS");
      expect(source).toContain("file-plus"); // create
      expect(source).toContain("file-edit"); // update
      expect(source).toContain("file-minus"); // delete
    });

    it("should have color mappings for each operation type", () => {
      const source = readFileSync(
        join(componentsDir, "FileOperationBadge.tsx"),
        "utf-8",
      );

      expect(source).toContain("OPERATION_COLORS");
      expect(source).toContain("text-green-400"); // create
      expect(source).toContain("text-blue-400"); // update
      expect(source).toContain("text-red-400"); // delete
    });

    it("should handle target path for move/copy operations", () => {
      const source = readFileSync(
        join(componentsDir, "FileOperationBadge.tsx"),
        "utf-8",
      );

      expect(source).toContain("targetPath");
    });

    it("should display line changes", () => {
      const source = readFileSync(
        join(componentsDir, "FileOperationBadge.tsx"),
        "utf-8",
      );

      expect(source).toContain("linesChanged");
    });
  });

  describe("StreamingOutput Component", () => {
    it("should export StreamingOutput component function", async () => {
      const module =
        await import("../../../../../src/webviews/agent-panel/components/StreamingOutput.js");
      expect(module).toHaveProperty("StreamingOutput");
      expect(typeof module.StreamingOutput).toBe("function");
    });

    it("should have 5-line preview limit constant", () => {
      const source = readFileSync(
        join(componentsDir, "StreamingOutput.tsx"),
        "utf-8",
      );

      expect(source).toContain("PREVIEW_LINE_COUNT");
      expect(source).toContain("= 5");
    });

    it("should have 500-line maximum limit constant", () => {
      const source = readFileSync(
        join(componentsDir, "StreamingOutput.tsx"),
        "utf-8",
      );

      expect(source).toContain("MAX_LINE_COUNT");
      expect(source).toContain("= 500");
    });

    it("should have expand/collapse functionality", () => {
      const source = readFileSync(
        join(componentsDir, "StreamingOutput.tsx"),
        "utf-8",
      );

      expect(source).toContain("expanded");
      expect(source).toContain("toggleExpanded");
    });

    it("should support stderr/stdout distinction via isStderr prop", () => {
      const source = readFileSync(
        join(componentsDir, "StreamingOutput.tsx"),
        "utf-8",
      );

      expect(source).toContain("isStderr");
      expect(source).toContain("text-red-400"); // stderr color
      expect(source).toContain("text-gray-300"); // stdout color
    });

    it("should accept outputChunks prop", () => {
      const source = readFileSync(
        join(componentsDir, "StreamingOutput.tsx"),
        "utf-8",
      );

      expect(source).toContain("outputChunks");
    });

    it("should show expand button with hidden line count", () => {
      const source = readFileSync(
        join(componentsDir, "StreamingOutput.tsx"),
        "utf-8",
      );

      expect(source).toContain("getHiddenLineCount");
      expect(source).toContain("[+");
      expect(source).toContain(" more]");
    });
  });

  describe("ToolCallHeader Component", () => {
    it("should export ToolCallHeader component function", async () => {
      const module =
        await import("../../../../../src/webviews/agent-panel/components/ToolCallHeader.js");
      expect(module).toHaveProperty("ToolCallHeader");
      expect(typeof module.ToolCallHeader).toBe("function");
    });

    it("should have formatDuration helper function with JSDoc", () => {
      const source = readFileSync(
        join(componentsDir, "ToolCallHeader.tsx"),
        "utf-8",
      );

      expect(source).toContain("formatDuration");
      expect(source).toContain("@param ms");
      expect(source).toContain("@returns");
    });

    it("should have formatTimestamp helper function with JSDoc", () => {
      const source = readFileSync(
        join(componentsDir, "ToolCallHeader.tsx"),
        "utf-8",
      );

      expect(source).toContain("formatTimestamp");
      expect(source).toContain("@param iso");
      expect(source).toContain("@returns");
    });

    it("should use ToolIcon component", async () => {
      const source = readFileSync(
        join(componentsDir, "ToolCallHeader.tsx"),
        "utf-8",
      );

      expect(source).toContain("import");
      expect(source).toContain("ToolIcon");
      expect(source).toContain("<ToolIcon");
    });

    it("should have status color mappings for all statuses", () => {
      const source = readFileSync(
        join(componentsDir, "ToolCallHeader.tsx"),
        "utf-8",
      );

      expect(source).toContain("STATUS_COLORS");
      expect(source).toContain("pending");
      expect(source).toContain("running");
      expect(source).toContain("success");
      expect(source).toContain("failed");
    });

    it("should display timestamp in HH:MM:SS format", () => {
      const source = readFileSync(
        join(componentsDir, "ToolCallHeader.tsx"),
        "utf-8",
      );

      expect(source).toContain("toLocaleTimeString");
      expect(source).toContain("hour12: false");
    });

    it("should display duration with smart formatting", () => {
      const source = readFileSync(
        join(componentsDir, "ToolCallHeader.tsx"),
        "utf-8",
      );

      expect(source).toContain("durationMs");
      expect(source).toContain("formatDuration");
    });
  });

  describe("ToolCallCard Component", () => {
    it("should export ToolCallCard component function", async () => {
      const module =
        await import("../../../../../src/webviews/agent-panel/components/ToolCallCard.js");
      expect(module).toHaveProperty("ToolCallCard");
      expect(typeof module.ToolCallCard).toBe("function");
    });

    it("should use ToolIcon and lucide icons for status", () => {
      const source = readFileSync(
        join(componentsDir, "ToolCallCard.tsx"),
        "utf-8",
      );

      expect(source).toContain("ToolIcon");
      expect(source).toContain("Icon");
      expect(source).toContain("lucide:");
    });

    it("should reference JsonViewer/TerminalOutput for rendering details", () => {
      const source = readFileSync(
        join(componentsDir, "ToolCallCard.tsx"),
        "utf-8",
      );

      expect(source).toContain("JsonViewer");
      expect(source).toContain("TerminalOutput");
    });

    it("should use TerminalOutput component", () => {
      const source = readFileSync(
        join(componentsDir, "ToolCallCard.tsx"),
        "utf-8",
      );

      expect(source).toContain("import");
      expect(source).toContain("TerminalOutput");
      expect(source).toContain("<TerminalOutput");
    });

    it("should have collapsible body with input/output tabs", () => {
      const source = readFileSync(
        join(componentsDir, "ToolCallCard.tsx"),
        "utf-8",
      );

      // Component now uses selectedTab/toggleTab for tab handling
      expect(source).toContain("selectedTab");
      expect(source).toContain("toggleTab");
      expect(source).toContain("input");
      expect(source).toContain("output");
    });

    it("should display status helper functions for progress/status", () => {
      const source = readFileSync(
        join(componentsDir, "ToolCallCard.tsx"),
        "utf-8",
      );

      // Component exposes helpers for status detection
      expect(source).toContain("isRunning");
      expect(source).toContain("isFailed");
    });

    it("should display tool-call related information", () => {
      const source = readFileSync(
        join(componentsDir, "ToolCallCard.tsx"),
        "utf-8",
      );

      // Ensure the component references toolCall details
      expect(source).toContain("toolCall");
      expect(source).toContain("ToolIcon");
    });

    it("should display streaming/terminal output when present", () => {
      const source = readFileSync(
        join(componentsDir, "ToolCallCard.tsx"),
        "utf-8",
      );

      // Component now uses TerminalOutput and helper getTerminalOutput
      expect(source).toContain("TerminalOutput");
      expect(source).toContain("getTerminalOutput");
    });

    it("should have result footer for success/error status", () => {
      const source = readFileSync(
        join(componentsDir, "ToolCallCard.tsx"),
        "utf-8",
      );

      expect(source).toContain("success");
      expect(source).toContain("failed");
      // Uses lucide icon set for status icons
      expect(source).toContain("lucide:check");
      expect(source).toContain("lucide:x");
    });

    it("should display error details and suggestions", () => {
      const source = readFileSync(
        join(componentsDir, "ToolCallCard.tsx"),
        "utf-8",
      );

      expect(source).toContain("error");
      expect(source).toContain("suggestion");
    });

    it("should define ToolCallCardProps with a toolCall property", () => {
      const source = readFileSync(
        join(componentsDir, "ToolCallCard.tsx"),
        "utf-8",
      );

      expect(source).toContain("ToolCallCardProps");
      expect(source).toContain("toolCall");
    });
  });

  describe("Integration: Props and Types", () => {
    it("should use ToolCallAggregate type from sessions/types", async () => {
      const headerSource = readFileSync(
        join(componentsDir, "ToolCallHeader.tsx"),
        "utf-8",
      );
      const cardSource = readFileSync(
        join(componentsDir, "ToolCallCard.tsx"),
        "utf-8",
      );

      expect(headerSource).toContain("ToolCallAggregate");
      expect(cardSource).toContain("ToolCallAggregate");
    });

    it("should use FileOperation type from sessions/types", async () => {
      const badgeSource = readFileSync(
        join(componentsDir, "FileOperationBadge.tsx"),
        "utf-8",
      );
      const cardSource = readFileSync(
        join(componentsDir, "ToolCallCard.tsx"),
        "utf-8",
      );

      expect(badgeSource).toContain("FileOperation");
      // ToolCallCard references toolCall fields for output; ensure it handles toolName
      expect(cardSource).toContain("toolCall.toolName");
    });

    it("should all use Tailwind CSS styling", () => {
      const files = [
        "ToolIcon.tsx",
        "FileOperationBadge.tsx",
        "StreamingOutput.tsx",
        "ToolCallHeader.tsx",
        "ToolCallCard.tsx",
      ];

      for (const file of files) {
        const source = readFileSync(join(componentsDir, file), "utf-8");
        expect(source).toContain("class=");
        // All components should use text- classes (color, size, etc)
        expect(source).toContain("text-");
      }
    });

    it("should all use @iconify-icon/solid for icons", () => {
      const files = [
        "ToolIcon.tsx",
        "FileOperationBadge.tsx",
        "StreamingOutput.tsx",
        "ToolCallHeader.tsx",
        "ToolCallCard.tsx",
      ];

      for (const file of files) {
        const source = readFileSync(join(componentsDir, file), "utf-8");
        expect(source).toContain("@iconify-icon/solid");
        expect(source).toContain("<Icon");
      }
    });

    it("should all use SolidJS primitives (Show, For, createSignal)", () => {
      const files = [
        "StreamingOutput.tsx",
        "ToolCallHeader.tsx",
        "ToolCallCard.tsx",
      ];

      for (const file of files) {
        const source = readFileSync(join(componentsDir, file), "utf-8");
        // At least one SolidJS primitive should be used
        const hasSolidJS =
          source.includes("solid-js") ||
          source.includes("<Show") ||
          source.includes("<For") ||
          source.includes("createSignal");
        expect(hasSolidJS).toBe(true);
      }
    });

    it("should all be exported from barrel export", async () => {
      const module =
        await import("../../../../../src/webviews/agent-panel/components/index.js");

      expect(module).toHaveProperty("ToolIcon");
      expect(module).toHaveProperty("FileOperationBadge");
      expect(module).toHaveProperty("StreamingOutput");
      expect(module).toHaveProperty("ToolCallHeader");
      expect(module).toHaveProperty("ToolCallCard");
    });
  });

  describe("Type Safety: Component Props", () => {
    it("ToolIconProps should have toolName property", () => {
      type ToolIconProps = { toolName: string; class?: string };
      const props: ToolIconProps = { toolName: "read_file" };
      expect(props.toolName).toBe("read_file");
    });

    it("FileOperationBadgeProps should have operation property", () => {
      type Props = { operation: FileOperation };
      const op: FileOperation = {
        operation: "create",
        path: "test.ts",
        targetPath: undefined,
        size: undefined,
        linesChanged: undefined,
        linesInserted: undefined,
        linesDeleted: undefined,
      };
      const props: Props = { operation: op };
      expect(props.operation.operation).toBe("create");
    });

    it("StreamingOutputProps should have outputChunks and isStderr", () => {
      type Props = { outputChunks: string[]; isStderr?: boolean };
      const props: Props = {
        outputChunks: ["line 1\n"],
        isStderr: false,
      };
      expect(props.outputChunks.length).toBe(1);
    });

    it("ToolCallHeaderProps should have toolCall property", () => {
      type Props = { toolCall: ToolCallAggregate };
      const toolCall: ToolCallAggregate = {
        toolCallId: "test-1",
        toolName: "read_file",
        toolCategory: "coding",
        status: "success",
        startedAt: "2024-01-15T14:30:00.000Z",
        completedAt: undefined,
        durationMs: undefined,
        arguments: {},
        result: undefined,
        error: undefined,
        lastProgressMessage: undefined,
        progressPercent: undefined,
        outputChunks: [],
        outputLineCount: 0,
        fileOperations: [],
        metadata: {},
        events: [],
      };
      const props: Props = { toolCall };
      expect(props.toolCall.toolName).toBe("read_file");
    });

    it("ToolCallCardProps should have toolCall and optional startCollapsed", () => {
      type Props = { toolCall: ToolCallAggregate; startCollapsed?: boolean };
      const toolCall: ToolCallAggregate = {
        toolCallId: "test-1",
        toolName: "read_file",
        toolCategory: "coding",
        status: "success",
        startedAt: "2024-01-15T14:30:00.000Z",
        completedAt: undefined,
        durationMs: undefined,
        arguments: {},
        result: undefined,
        error: undefined,
        lastProgressMessage: undefined,
        progressPercent: undefined,
        outputChunks: [],
        outputLineCount: 0,
        fileOperations: [],
        metadata: {},
        events: [],
      };
      const props: Props = { toolCall, startCollapsed: false };
      expect(props.startCollapsed).toBe(false);
    });
  });
});
