/**
 * FileGroup Component
 *
 * Collapsible section displaying files grouped by operation type.
 * Shows header with operation icon, label, count badge, and expandable file list.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.7
 */

import { Icon } from "@iconify-icon/solid";
import { createSignal, For, Show } from "solid-js";
import type { FileOperation } from "../../../agents/sessions/types.js";
import { FileRow } from "./FileRow.js";

export interface FileGroupProps {
  /** Operation type determining the group */
  operationType: "modified" | "created" | "read";
  /** Files in this group */
  files: FileOperation[];
}

/**
 * Operation type to icon mapping
 */
const OPERATION_ICONS: Record<FileGroupProps["operationType"], string> = {
  modified: "file-edit",
  created: "sparkles",
  read: "eye",
};

/**
 * Operation type to display label mapping
 */
const OPERATION_LABELS: Record<FileGroupProps["operationType"], string> = {
  modified: "Modified",
  created: "Created",
  read: "Read",
};

/**
 * Operation type to color mapping
 */
const OPERATION_COLORS: Record<FileGroupProps["operationType"], string> = {
  modified: "text-blue-400",
  created: "text-green-400",
  read: "text-gray-400",
};

/**
 * FileGroup - Collapsible section for file operations by type
 *
 * Displays a group of file operations (Modified, Created, or Read) with:
 * - Header showing operation icon, label, and count badge
 * - Collapsible list of FileRow components
 * - Special handling for Read group (collapsed list when >3 files)
 *
 * Visual layout:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ [▼] 📝 Modified (4)                                             │
 * │   └─ src/auth/auth.ts              +15 -3 lines    [View Diff]  │
 * │   └─ src/auth/validators.ts        +42 -0 lines    [View Diff]  │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <FileGroup
 *   operationType="modified"
 *   files={[
 *     { operation: "update", path: "src/auth.ts", linesInserted: 15, linesDeleted: 3 }
 *   ]}
 * />
 * ```
 */
export function FileGroup(props: FileGroupProps) {
  const [isExpanded, setIsExpanded] = createSignal(
    props.operationType !== "read",
  );

  const iconName = OPERATION_ICONS[props.operationType];
  const label = OPERATION_LABELS[props.operationType];
  const colorClass = OPERATION_COLORS[props.operationType];

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded());
  };

  /**
   * For Read group, show first 3 files inline when collapsed
   */
  const collapsedReadPreview = () => {
    if (props.operationType !== "read" || isExpanded()) {
      return null;
    }
    const preview = props.files.slice(0, 3).map((f) => {
      const parts = f.path.split(/[/\\]/);
      return parts[parts.length - 1];
    });
    const remaining = props.files.length - 3;
    if (remaining > 0) {
      preview.push(`+${remaining} more`);
    }
    return preview.join(", ");
  };

  return (
    <div class="border-b border-gray-700">
      {/* Group Header */}
      <button
        class="w-full flex items-center gap-2 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer text-left"
        onClick={toggleExpanded}
        aria-expanded={isExpanded()}
        aria-label={`Toggle ${label} files`}
      >
        <Icon
          icon={`lucide:chevron-${isExpanded() ? "down" : "right"}`}
          class="w-4 h-4 text-gray-400"
        />
        <Icon icon={`lucide:${iconName}`} class={`w-4 h-4 ${colorClass}`} />
        <span class="text-sm font-medium text-gray-200">{label}</span>
        <span class="text-xs text-gray-400 bg-gray-800 rounded-full px-2 py-0.5">
          {props.files.length}
        </span>
        <Show when={collapsedReadPreview()}>
          <span class="text-xs text-gray-500 ml-2 truncate flex-1">
            {collapsedReadPreview()}
          </span>
        </Show>
      </button>

      {/* File List */}
      <Show when={isExpanded()}>
        <div class="bg-zinc-950">
          <For each={props.files}>
            {(file) => (
              <FileRow file={file} operationType={props.operationType} />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
