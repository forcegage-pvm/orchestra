/**
 * FileOperationBadge Component
 *
 * Displays a file operation with an icon and file path.
 * Shows the type of operation (create, update, delete, move, copy, read)
 * with an appropriate icon and the affected file path.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 4.1
 */

import { Icon } from "@iconify-icon/solid";
import type { FileOperation } from "../../../agents/sessions/types.js";

export interface FileOperationBadgeProps {
  /** File operation to display */
  operation: FileOperation;
}

/**
 * Operation type to icon mapping
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
 * Operation type to color mapping
 */
const OPERATION_COLORS: Record<FileOperation["operation"], string> = {
  create: "text-green-400",
  update: "text-blue-400",
  delete: "text-red-400",
  move: "text-yellow-400",
  copy: "text-purple-400",
  read: "text-gray-400",
};

/**
 * FileOperationBadge - Displays a file operation with icon and path
 *
 * Shows the operation type (create, update, delete, etc.) with a color-coded
 * icon and the file path. For move/copy operations, also displays the target path.
 *
 * @example
 * ```tsx
 * <FileOperationBadge
 *   operation={{
 *     operation: "create",
 *     path: "src/components/MyComponent.tsx",
 *     size: 1024
 *   }}
 * />
 * ```
 */
export function FileOperationBadge(props: FileOperationBadgeProps) {
  const iconName = OPERATION_ICONS[props.operation.operation];
  const colorClass = OPERATION_COLORS[props.operation.operation];

  return (
    <div class="flex items-center gap-2 text-xs bg-zinc-800 border border-gray-700 rounded px-2 py-1">
      <Icon icon={`lucide:${iconName}`} class={`w-3 h-3 ${colorClass}`} />
      <span class="text-gray-300 font-mono truncate">
        {props.operation.path}
      </span>
      {props.operation.targetPath && (
        <>
          <Icon icon="lucide:arrow-right" class="w-3 h-3 text-gray-500" />
          <span class="text-gray-300 font-mono truncate">
            {props.operation.targetPath}
          </span>
        </>
      )}
      {props.operation.linesChanged !== undefined && (
        <span class="text-gray-500 ml-1">
          {props.operation.linesChanged > 0 && "+"}
          {props.operation.linesChanged === 0 && "±"}
          {props.operation.linesChanged}
        </span>
      )}
    </div>
  );
}
