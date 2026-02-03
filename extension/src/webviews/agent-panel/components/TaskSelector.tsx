/**
 * TaskSelector Component
 *
 * Dropdown selector for switching between different tasks.
 * Emits switch_session messages to the extension when task selection changes.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.2-3.3, T065
 */

import { For } from "solid-js";

export interface TaskSelectorProps {
  /** Current task ID being viewed */
  currentTaskId?: number;

  /** Available tasks to select from */
  availableTasks?: Array<{ taskId: number; title: string }>;

  /** Handler for task change - emits switch_session */
  onTaskChange?: (taskId: number) => void;
}

/**
 * TaskSelector - Dropdown for switching task context
 *
 * Displays current task and allows switching to other tasks.
 * Emits switch_session message via postMessage when selection changes.
 *
 * @example
 * ```tsx
 * <TaskSelector
 *   currentTaskId={42}
 *   availableTasks={[{taskId: 42, title: "Task 42"}, {taskId: 43, title: "Task 43"}]}
 *   onTaskChange={(taskId) => window.vscode.postMessage({type: 'switch_session', sessionId: getSessionIdForTask(taskId)})}
 * />
 * ```
 */
export function TaskSelector(props: TaskSelectorProps) {
  const handleChange = (event: Event) => {
    const target = event.target as HTMLSelectElement;
    const taskId = parseInt(target.value, 10);
    if (!isNaN(taskId) && props.onTaskChange) {
      props.onTaskChange(taskId);
    }
  };

  return (
    <div class="flex items-center gap-2">
      <select
        class="bg-gray-800 text-gray-200 text-sm px-2 py-1 rounded border border-gray-700 focus:outline-none focus:border-blue-500 cursor-pointer"
        value={props.currentTaskId ?? ""}
        onChange={handleChange}
        disabled={!props.availableTasks || props.availableTasks.length === 0}
      >
        <option value="" disabled>
          Select Task
        </option>
        <For each={props.availableTasks}>
          {(task) => (
            <option value={task.taskId}>
              Task {task.taskId}: {task.title}
            </option>
          )}
        </For>
      </select>
    </div>
  );
}
