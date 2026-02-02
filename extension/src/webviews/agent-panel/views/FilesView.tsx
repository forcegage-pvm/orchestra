/**
 * FilesView Component
 *
 * Main Files tab view displaying all file operations from the agent session.
 * Groups files by operation type (Modified, Created, Read) and provides
 * quick actions to open files or view diffs.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.7
 */

import { Icon } from "@iconify-icon/solid";
import { createMemo, For, Show } from "solid-js";
import type { FileOperation } from "../../../agents/sessions/types.js";
import { EmptyState, FileGroup } from "../components/index.js";
import { toolCalls } from "../stores/sessionStore.js";

/**
 * FilesView - Aggregated view of all file operations
 *
 * Displays all file operations performed during the agent session,
 * grouped by operation type:
 * - Modified (update operations)
 * - Created (create operations)
 * - Read (read operations)
 *
 * Visual layout:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ [▼] 📝 Modified (4)                                             │
 * │   └─ src/auth/auth.ts              +15 -3 lines    [View Diff]  │
 * │   └─ src/auth/validators.ts        +42 -0 lines    [View Diff]  │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ [▼] ✨ Created (1)                                              │
 * │   └─ src/auth/loginForm.tsx                        [Open File]  │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ [▶] 👁 Read (6)                                                  │
 * │   config.ts, package.json, tsconfig.json... +3 more             │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * Empty state:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                   📁                                             │
 * │         No files modified in this session                        │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <FilesView />
 * ```
 */
export function FilesView() {
  /**
   * Aggregate all file operations from all tool calls
   */
  const allFileOperations = createMemo(() => {
    const operations: FileOperation[] = [];

    // Collect all file operations from all tool calls
    Object.values(toolCalls).forEach((toolCall) => {
      if (toolCall.fileOperations && toolCall.fileOperations.length > 0) {
        operations.push(...toolCall.fileOperations);
      }
    });

    return operations;
  });

  /**
   * Group and deduplicate file operations by type
   */
  const groupedFiles = createMemo(() => {
    const ops = allFileOperations();

    // Group by operation type
    const modified = new Map<string, FileOperation>();
    const created = new Map<string, FileOperation>();
    const deleted = new Map<string, FileOperation>();
    const read = new Map<string, FileOperation>();

    ops.forEach((op) => {
      // Deduplicate by path - keep the operation with most detail
      switch (op.operation) {
        case "update":
          if (
            !modified.has(op.path) ||
            (op.linesInserted !== undefined && op.linesDeleted !== undefined)
          ) {
            modified.set(op.path, op);
          }
          break;
        case "create":
          if (!created.has(op.path)) {
            created.set(op.path, op);
          }
          break;
        case "delete":
          if (!deleted.has(op.path)) {
            deleted.set(op.path, op);
          }
          break;
        case "read":
          if (!read.has(op.path)) {
            read.set(op.path, op);
          }
          break;
        // Note: move, copy operations are not displayed in separate groups
      }
    });

    return {
      modified: Array.from(modified.values()),
      created: Array.from(created.values()),
      deleted: Array.from(deleted.values()),
      read: Array.from(read.values()),
    };
  });

  /**
   * Check if there are any file operations
   */
  const hasAnyFiles = createMemo(() => {
    const groups = groupedFiles();
    return (
      groups.modified.length > 0 ||
      groups.created.length > 0 ||
      groups.deleted.length > 0 ||
      groups.read.length > 0
    );
  });

  return (
    <div class="flex flex-col h-full">
      {/* Empty State */}
      <Show when={!hasAnyFiles()}>
        <EmptyState
          icon="lucide:folder-open"
          message="No files modified in this session"
        />
      </Show>

      {/* File Groups */}
      <Show when={hasAnyFiles()}>
        <div class="flex-1 overflow-y-auto">
          <For
            each={[
              { type: "modified" as const, files: groupedFiles().modified },
              { type: "created" as const, files: groupedFiles().created },
              { type: "deleted" as const, files: groupedFiles().deleted },
              { type: "read" as const, files: groupedFiles().read },
            ]}
          >
            {(group) => (
              <Show when={group.files.length > 0}>
                <FileGroup operationType={group.type} files={group.files} />
              </Show>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
