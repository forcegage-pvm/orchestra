/**
 * ToolsTable Component
 *
 * Virtual scrolling table displaying tool calls with Status/Tool/Duration/Files/Summary columns.
 * Uses VirtualList for performance with large numbers of tool calls.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.6, Task T054
 */

import { Icon } from "@iconify-icon/solid";
import { Show } from "solid-js";
import type { ToolCallAggregate } from "../../../agents/sessions/types.js";
import { VirtualList } from "./VirtualList.js";

export interface ToolsTableProps {
  /** Array of tool call aggregates to display */
  toolCalls: ToolCallAggregate[];
  /** Callback when a row is clicked */
  onRowClick: (toolCall: ToolCallAggregate) => void;
  /** Table height in pixels */
  height: number;
}

/**
 * ToolsTable - Virtual scrolling table of tool calls
 *
 * Displays tool calls in a 5-column table:
 * - Status: Icon (✓/✗/⏳) based on tool status
 * - Tool: Tool name
 * - Duration: Formatted execution time (ms/s)
 * - Files: Count of file operations
 * - Summary: Brief description of the operation
 *
 * Visual layout:
 * ```
 * ┌────────┬──────────────┬──────────┬────────┬─────────────────────┐
 * │ Status │ Tool         │ Duration │ Files  │ Summary             │
 * ├────────┼──────────────┼──────────┼────────┼─────────────────────┤
 * │   ✓    │ read_file    │    45ms  │   1    │ src/auth/auth.ts    │
 * │   ✓    │ edit_lines   │   123ms  │   1    │ +15 -3 lines        │
 * │   ✗    │ run_tests    │  2,341ms │   0    │ 2 tests failed      │
 * └────────┴──────────────┴──────────┴────────┴─────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <ToolsTable
 *   toolCalls={filteredTools()}
 *   onRowClick={(tool) => navigateToToolEvent(tool)}
 *   height={600}
 * />
 * ```
 */
export function ToolsTable(props: ToolsTableProps) {
  /**
   * Format duration in milliseconds to human-readable string
   */
  const formatDuration = (ms: number | undefined): string => {
    if (ms === undefined || ms === null) return "-";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  /**
   * Get status icon and color based on tool call status
   */
  const getStatusIcon = (
    status: "pending" | "running" | "success" | "failed",
  ): { icon: string; color: string } => {
    switch (status) {
      case "success":
        return { icon: "lucide:check", color: "text-green-500" };
      case "failed":
        return { icon: "lucide:x", color: "text-red-500" };
      case "pending":
      case "running":
        return { icon: "lucide:hourglass", color: "text-yellow-500" };
      default:
        // Fallback for unexpected status values
        return { icon: "lucide:help-circle", color: "text-gray-400" };
    }
  };

  /**
   * Generate summary text from tool call aggregate
   */
  const getSummary = (toolCall: ToolCallAggregate): string => {
    // If there's a result string, use that
    if (toolCall.result) {
      // Truncate long output
      const output = toolCall.result;
      return output.length > 50 ? `${output.slice(0, 50)}...` : output;
    }

    // For file operations, show first file path
    if (toolCall.fileOperations.length > 0) {
      const firstOp = toolCall.fileOperations[0];
      return firstOp?.path || "-";
    }

    // Show error message if failed
    if (toolCall.status === "failed" && toolCall.error) {
      return toolCall.error.message;
    }

    // For running/pending
    if (toolCall.status === "running" || toolCall.status === "pending") {
      return "Executing...";
    }

    return "-";
  };

  /**
   * Render a single tool call row
   */
  const renderRow = (toolCall: ToolCallAggregate, _index: number) => {
    const statusInfo = getStatusIcon(toolCall.status);

    return (
      <div
        onClick={() => props.onRowClick(toolCall)}
        class="grid grid-cols-[60px_150px_100px_60px_1fr] gap-4 px-4 py-3 border-b border-gray-700 hover:bg-gray-800/50 cursor-pointer transition-colors"
        role="row"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            props.onRowClick(toolCall);
          }
        }}
      >
        {/* Status Column */}
        <div class="flex items-center justify-center">
          <Icon
            icon={statusInfo.icon}
            class={`w-5 h-5 ${statusInfo.color}`}
            aria-label={`Status: ${toolCall.status}`}
          />
        </div>

        {/* Tool Column */}
        <div class="text-sm text-gray-200 truncate" title={toolCall.toolName}>
          {toolCall.toolName}
        </div>

        {/* Duration Column */}
        <div class="text-sm text-gray-400 text-right">
          {formatDuration(toolCall.durationMs)}
        </div>

        {/* Files Column */}
        <div class="text-sm text-gray-400 text-center">
          <Show when={toolCall.fileOperations.length > 0} fallback={"-"}>
            {toolCall.fileOperations.length}
          </Show>
        </div>

        {/* Summary Column */}
        <div
          class="text-sm text-gray-400 truncate"
          title={getSummary(toolCall)}
        >
          {getSummary(toolCall)}
        </div>
      </div>
    );
  };

  return (
    <div class="bg-zinc-900">
      {/* Table Header */}
      <div
        class="grid grid-cols-[60px_150px_100px_60px_1fr] gap-4 px-4 py-2 bg-gray-800 border-b border-gray-600 text-xs font-medium text-gray-400 uppercase tracking-wider sticky top-0 z-10"
        role="row"
      >
        <div class="text-center">Status</div>
        <div>Tool</div>
        <div class="text-right">Duration</div>
        <div class="text-center">Files</div>
        <div>Summary</div>
      </div>

      {/* Table Body with Virtual Scrolling */}
      <Show
        when={props.toolCalls.length > 0}
        fallback={
          <div class="flex items-center justify-center py-12 text-gray-500 text-sm">
            <Icon icon="lucide:inbox" class="w-6 h-6 mr-2" />
            No tool calls to display
          </div>
        }
      >
        <VirtualList
          items={props.toolCalls}
          estimateSize={() => 52} // Row height: 48px content + 4px padding
          renderItem={renderRow}
          height={props.height}
        />
      </Show>
    </div>
  );
}
