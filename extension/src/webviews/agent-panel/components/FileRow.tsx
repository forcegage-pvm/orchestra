/**
 * FileRow Component
 *
 * Individual file row displaying file path, line change statistics,
 * and action buttons (Open File, View Diff).
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.7
 */

import { Show } from "solid-js";
import type { FileOperation } from "../../../agents/sessions/types.js";

export interface FileRowProps {
  /** File operation to display */
  file: FileOperation;
  /** Operation type for display context */
  operationType: "modified" | "created" | "deleted" | "read";
}

/**
 * FileRow - Individual file operation row
 *
 * Displays a single file operation with:
 * - File path (clickable to open file)
 * - Line change stats for modified files (+N -M lines)
 * - Action buttons:
 *   - "View Diff" for modified files
 *   - "Open File" for created files
 *
 * Visual layout:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ src/auth/auth.ts              +15 -3 lines    [View Diff]       │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <FileRow
 *   file={{
 *     operation: "update",
 *     path: "src/auth.ts",
 *     linesInserted: 15,
 *     linesDeleted: 3
 *   }}
 *   operationType="modified"
 * />
 * ```
 */
export function FileRow(props: FileRowProps) {
  /**
   * Handle file path click - open file in editor
   */
  const handleFileClick = () => {
    window.vscode.postMessage({
      type: "open_file",
      path: props.file.path,
    });
  };

  /**
   * Handle View Diff button click
   */
  const handleDiffClick = (e: MouseEvent) => {
    e.stopPropagation(); // Prevent file click
    window.vscode.postMessage({
      type: "open_diff",
      path: props.file.path,
    });
  };

  /**
   * Format line change stats
   */
  const lineStats = () => {
    if (props.operationType !== "modified") {
      return null;
    }
    const inserted = props.file.linesInserted ?? 0;
    const deleted = props.file.linesDeleted ?? 0;
    return `+${inserted} -${deleted} lines`;
  };

  return (
    <div class="flex items-center gap-3 px-3 py-1.5 hover:bg-zinc-900 border-t border-gray-800 first:border-t-0">
      {/* File Path (clickable) */}
      <button
        class="flex-1 text-left text-[11px] font-mono text-gray-300 hover:text-blue-400 transition-colors cursor-pointer truncate"
        onClick={handleFileClick}
        title={props.file.path}
      >
        {props.file.path}
      </button>

      {/* Line Stats (for modified files) */}
      <Show when={lineStats()}>
        <span class="text-[11px] text-gray-500 whitespace-nowrap">
          {lineStats()}
        </span>
      </Show>

      {/* Action Button */}
      <Show when={props.operationType === "modified"}>
        <button
          class="text-[11px] text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:border-blue-400/50 rounded px-2 py-1 transition-colors whitespace-nowrap"
          onClick={handleDiffClick}
        >
          View Diff
        </button>
      </Show>

      <Show when={props.operationType === "created"}>
        <button
          class="text-[11px] text-green-400 hover:text-green-300 border border-green-500/30 hover:border-green-400/50 rounded px-2 py-1 transition-colors whitespace-nowrap"
          onClick={handleFileClick}
        >
          Open File
        </button>
      </Show>
    </div>
  );
}
