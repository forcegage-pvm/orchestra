/**
 * FileActivityPanel Component
 *
 * A floating/sticky panel that shows files touched by the agent in real-time.
 * Displays files that were READ, CREATED, MODIFIED, or DELETED.
 * Does NOT show files from search results or directory listings.
 *
 * Specification: User-requested feature for file activity visibility
 */

import { Icon } from "@iconify-icon/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import type { FileOperation } from "../../../agents/sessions/types.js";
import { toolCallKeys, toolCalls } from "../stores/sessionStore.js";

/**
 * Operation type to icon mapping (matching FileOperationBadge pattern)
 */
const OPERATION_ICONS: Record<FileOperation["operation"], string> = {
  create: "file-plus",
  update: "file-edit",
  delete: "file-minus",
  move: "file-symlink",
  copy: "copy",
  read: "file-text",
};

/**
 * Operation type to color mapping (matching FileOperationBadge pattern)
 */
const OPERATION_COLORS: Record<FileOperation["operation"], string> = {
  create: "text-green-400",
  update: "text-blue-400",
  delete: "text-red-400",
  move: "text-yellow-400",
  copy: "text-purple-400",
  read: "text-zinc-500",
};

/**
 * Operation priority for display (higher priority = shown as primary operation)
 */
const OPERATION_PRIORITY: Record<FileOperation["operation"], number> = {
  delete: 5,
  create: 4,
  update: 3,
  move: 2,
  copy: 1,
  read: 0,
};

/**
 * Get the filename from a path
 */
function getFileName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

/**
 * Get directory from a path
 */
function getDirectory(path: string): string {
  const parts = path.split(/[/\\]/);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

/**
 * FileActivityPanel - Floating panel showing files touched by the agent
 *
 * Features:
 * - Collapsible (click header to toggle)
 * - Only visible when files are touched
 * - Shows operation type with icons
 * - Clickable files to open in editor
 * - Compact, non-intrusive design
 *
 * @example
 * ```tsx
 * <FileActivityPanel />
 * ```
 */
export function FileActivityPanel() {
  const [isCollapsed, setIsCollapsed] = createSignal(false);

  /**
   * Aggregate all file operations from all tool calls
   * Deduplicate by path, keeping the highest priority operation
   */
  const fileOperations = createMemo(() => {
    const operationsMap = new Map<
      string,
      { operation: FileOperation; priority: number }
    >();

    // Access toolCallKeys() to establish reactivity tracking
    // This ensures the memo re-runs when new tool calls are added
    const keys = toolCallKeys();

    // Collect all file operations from all tool calls
    keys.forEach((toolCallId) => {
      const toolCall = toolCalls[toolCallId];
      if (toolCall?.fileOperations && toolCall.fileOperations.length > 0) {
        toolCall.fileOperations.forEach((op) => {
          const existing = operationsMap.get(op.path);
          const priority = OPERATION_PRIORITY[op.operation];

          // Keep the highest priority operation for each path
          if (!existing || priority > existing.priority) {
            operationsMap.set(op.path, { operation: op, priority });
          }
        });
      }
    });

    // Convert to array and sort: write operations first, then by path
    return Array.from(operationsMap.values())
      .map((v) => v.operation)
      .sort((a, b) => {
        // Sort by priority (descending), then by path (ascending)
        const priorityDiff =
          OPERATION_PRIORITY[b.operation] - OPERATION_PRIORITY[a.operation];
        if (priorityDiff !== 0) return priorityDiff;
        return a.path.localeCompare(b.path);
      });
  });

  /**
   * Count of files by operation type
   */
  const operationCounts = createMemo(() => {
    const counts = {
      create: 0,
      update: 0,
      delete: 0,
      move: 0,
      copy: 0,
      read: 0,
    };
    fileOperations().forEach((op) => {
      counts[op.operation]++;
    });
    return counts;
  });

  /**
   * Total file count
   */
  /**
   * Check if there are any file operations
   */
  const hasFiles = createMemo(() => fileOperations().length > 0);

  /**
   * Handle file click - open file in editor
   */
  const handleFileClick = (path: string) => {
    window.vscode.postMessage({
      type: "open_file",
      path,
    });
  };

  /**
   * Toggle collapsed state
   */
  const toggleCollapsed = () => {
    setIsCollapsed(!isCollapsed());
  };

  // Use <Show> for reactive conditional rendering - do NOT use early return in SolidJS
  return (
    <Show when={hasFiles()}>
      <div class="bg-[#7728CC]/10">
        {/* Header */}
        <button
          class="w-full flex items-center gap-2 px-5 py-1 hover:bg-white/10 transition-colors cursor-pointer text-left"
          onClick={toggleCollapsed}
          aria-expanded={!isCollapsed()}
          aria-label="Toggle file activity panel"
        >
          <Icon icon="lucide:files" class="w-3 h-3 text-gray-400" />
          <span class="text-[11px] font-medium text-gray-200">
            Files Touched
          </span>

          {/* Summary badges */}
          <div class="flex items-center gap-1 ml-auto">
            <Show when={operationCounts().create > 0}>
              <span class="flex items-center gap-0.5 text-[11px] text-green-400 bg-gray-800 px-1.5 py-0.5 rounded-full">
                <Icon icon="lucide:plus" class="w-2.5 h-2.5" />
                {operationCounts().create}
              </span>
            </Show>
            <Show when={operationCounts().update > 0}>
              <span class="flex items-center gap-0.5 text-[11px] text-blue-400 bg-gray-800 px-1.5 py-0.5 rounded-full">
                <Icon icon="lucide:edit-3" class="w-2.5 h-2.5" />
                {operationCounts().update}
              </span>
            </Show>
            <Show when={operationCounts().delete > 0}>
              <span class="flex items-center gap-0.5 text-[11px] text-red-400 bg-gray-800 px-1.5 py-0.5 rounded-full">
                <Icon icon="lucide:trash-2" class="w-2.5 h-2.5" />
                {operationCounts().delete}
              </span>
            </Show>
            <Show when={operationCounts().read > 0}>
              <span class="flex items-center gap-0.5 text-[11px] text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded-full">
                <Icon icon="lucide:eye" class="w-2.5 h-2.5" />
                {operationCounts().read}
              </span>
            </Show>
          </div>
          <Icon
            icon={`lucide:chevron-${isCollapsed() ? "down" : "up"}`}
            class="w-3.5 h-3.5 text-gray-400 ml-2"
          />
        </button>

        {/* File List */}
        <Show when={!isCollapsed()}>
          <div class="max-h-32 overflow-y-auto">
            <For each={fileOperations()}>
              {(op) => (
                <button
                  class="w-full flex items-center gap-3 px-5 py-0.5 hover:bg-white/10 transition-colors cursor-pointer text-left"
                  onClick={() => handleFileClick(op.path)}
                  title={op.path}
                >
                  <Icon
                    icon={`lucide:${OPERATION_ICONS[op.operation]}`}
                    class={`w-3 h-3 flex-shrink-0 ${OPERATION_COLORS[op.operation]}`}
                  />
                  <span class="flex-1 text-[11px] font-mono text-gray-300 hover:text-blue-400 transition-colors truncate">
                    {getFileName(op.path)}
                  </span>
                  <Show when={getDirectory(op.path)}>
                    <span class="text-[10px] text-gray-500 truncate max-w-[50%] text-right">
                      {getDirectory(op.path)}
                    </span>
                  </Show>
                  <Show
                    when={
                      op.linesInserted !== undefined ||
                      op.linesDeleted !== undefined
                    }
                  >
                    <span class="text-[10px] text-gray-500 flex-shrink-0 whitespace-nowrap">
                      <Show when={op.linesInserted !== undefined}>
                        <span class="text-green-500">+{op.linesInserted}</span>
                      </Show>
                      <Show when={op.linesDeleted !== undefined}>
                        <span class="text-red-500 ml-1">
                          -{op.linesDeleted}
                        </span>
                      </Show>
                    </span>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}
