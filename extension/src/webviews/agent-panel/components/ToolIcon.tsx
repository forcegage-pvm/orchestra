/**
 * ToolIcon Component
 *
 * Displays the appropriate icon for a tool based on its name.
 * Maps 37 tools across 4 categories (coding, filesystem, system, orchestra)
 * to their corresponding Lucide icons.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 7
 */

import { Icon } from "@iconify-icon/solid";

export interface ToolIconProps {
  /** Name of the tool (e.g., 'read_file', 'get_current_task') */
  toolName: string;

  /** Optional CSS class for sizing/styling */
  class?: string;
}

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

  // ORCHESTRA (5)
  get_current_task: "clipboard-list",
  signal_completion: "flag",
  get_feedback: "message-circle",
  get_progress: "bar-chart",
  escalate_task: "alert-triangle",
};

const DEFAULT_ICON = "wrench";

/**
 * ToolIcon - Displays the appropriate icon for a tool
 *
 * Maps tool names to Lucide icons based on the tool's category and function.
 * Uses a default wrench icon for unknown/unmapped tools.
 *
 * @example
 * ```tsx
 * <ToolIcon toolName="read_file" class="w-5 h-5 text-blue-400" />
 * <ToolIcon toolName="get_current_task" class="w-4 h-4" />
 * ```
 */
export function ToolIcon(props: ToolIconProps) {
  const iconName = TOOL_ICON_MAP[props.toolName] || DEFAULT_ICON;

  return <Icon icon={`lucide:${iconName}`} class={props.class || "w-5 h-5"} />;
}
