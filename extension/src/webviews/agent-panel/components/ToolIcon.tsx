/**
 * ToolIcon Component
 *
 * Displays the appropriate icon for a tool based on its name.
 * Maps 37 tools across 4 categories (coding, filesystem, system, orchestra)
 * to their corresponding Lucide icons with category-specific colors.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 7
 */

import { Icon } from "@iconify-icon/solid";

export interface ToolIconProps {
  /** Name of the tool (e.g., 'read_file', 'get_current_task') */
  toolName: string;

  /** Optional CSS class for sizing/styling (color will be added automatically) */
  class?: string;

  /** Override automatic category color */
  colorOverride?: string;
}

/**
 * Tool category type for color mapping
 */
type ToolCategory =
  | "coding"
  | "filesystem"
  | "system"
  | "orchestra"
  | "unknown";

/**
 * Category-specific colors for tool icons
 */
const CATEGORY_COLORS: Record<ToolCategory, string> = {
  coding: "text-sky-400", // Blue for file/code operations
  filesystem: "text-amber-400", // Amber for filesystem operations
  system: "text-emerald-400", // Green for system/process operations
  orchestra: "text-violet-400", // Purple for Orchestra workflow tools
  unknown: "text-gray-400", // Gray for unknown tools
};

/**
 * Tool name to Lucide icon mapping
 *
 * Categories:
 * - CODING (15 tools): File and code manipulation tools
 * - FILESYSTEM (3 tools): File system operations
 * - SYSTEM (15 tools): System and process management
 * - ORCHESTRA (5 tools): Orchestra workflow tools
 */
const TOOL_ICON_MAP: Record<string, string> = {
  // CODING (15)
  read_file: "file-text",
  edit_file: "file-edit",
  edit_lines: "file-pen",
  create_file: "file-plus",
  create_directory: "folder-plus",
  delete_file: "file-minus",
  insert_at_line: "text-cursor-input",
  delete_section: "scissors",
  smart_replace: "replace",
  bulk_replace: "replace-all",
  validate_edit: "check-square",
  search_files: "folder-search",
  grep_search: "search",
  list_directory: "folder-open",
  find_usages: "link",

  // FILESYSTEM (3)
  copy_file: "copy",
  move_file: "file-symlink",
  move_directory: "folder-symlink",

  // SYSTEM (15)
  run_terminal: "terminal",
  run_command: "terminal-square",
  run_task: "play",
  run_tests: "test-tube",
  get_test_failures: "test-tube-2",
  get_problems: "alert-circle",
  start_process: "play-circle",
  stop_process: "stop-circle",
  get_process_output: "scroll-text",
  list_processes: "list",
  send_input: "keyboard",
  wait_for_pattern: "clock",
  find_port_process: "network",
  get_terminal_output: "square-terminal",
  execute_with_retry: "repeat",

  // ORCHESTRA (5+)
  get_current_task: "clipboard-list",
  signal_completion: "flag",
  get_feedback: "message-circle",
  get_progress: "bar-chart",
  escalate_task: "alert-triangle",
  prepare_task: "clipboard-check",
  get_sprint_status: "layout-list",
  get_task: "file-check",
  get_handover: "file-output",
  get_amendments: "file-diff",
  approve_sprint: "check-circle",
  reject_sprint: "x-circle",
  approve_handover: "badge-check",
  reject_handover: "badge-x",
  get_code_review: "code-2",
  get_code_review_summary: "file-code",
  submit_code_review: "badge",
  read_spec_file: "book-open",
};

/**
 * Get tool category from tool name
 */
function getToolCategory(toolName: string): ToolCategory {
  // CODING tools
  if (
    [
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
    ].includes(toolName)
  ) {
    return "coding";
  }

  // FILESYSTEM tools
  if (["copy_file", "move_file", "move_directory"].includes(toolName)) {
    return "filesystem";
  }

  // SYSTEM tools
  if (
    [
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
    ].includes(toolName)
  ) {
    return "system";
  }

  // ORCHESTRA tools
  if (
    [
      "get_current_task",
      "signal_completion",
      "get_feedback",
      "get_progress",
      "escalate_task",
      "prepare_task",
      "get_sprint_status",
      "get_task",
      "get_handover",
      "get_amendments",
      "approve_sprint",
      "reject_sprint",
      "approve_handover",
      "reject_handover",
      "get_code_review",
      "get_code_review_summary",
      "submit_code_review",
      "read_spec_file",
    ].includes(toolName)
  ) {
    return "orchestra";
  }

  return "unknown";
}

const DEFAULT_ICON = "wrench";

/**
 * ToolIcon - Displays the appropriate icon for a tool
 *
 * Maps tool names to Lucide icons based on the tool's category and function.
 * Uses a default wrench icon for unknown/unmapped tools.
 * Automatically applies category-specific colors.
 *
 * @example
 * ```tsx
 * <ToolIcon toolName="read_file" class="w-3 h-3" />
 * <ToolIcon toolName="get_current_task" class="w-3 h-3" />
 * ```
 */
export function ToolIcon(props: ToolIconProps) {
  const iconName = TOOL_ICON_MAP[props.toolName] || DEFAULT_ICON;
  const category = getToolCategory(props.toolName);
  const colorClass = props.colorOverride || CATEGORY_COLORS[category];

  // Combine size class with color class
  const sizeClass = props.class || "w-4 h-4";

  return (
    <Icon icon={`lucide:${iconName}`} class={`${sizeClass} ${colorClass}`} />
  );
}
