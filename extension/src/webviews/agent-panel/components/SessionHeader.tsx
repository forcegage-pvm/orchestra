/**
 * SessionHeader Component
 *
 * Main header component composing RoleBadge, StatusIndicator, ProgressStats,
 * task/session selectors (placeholders), and stop button.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.2-3.3
 */

import { Icon } from "@iconify-icon/solid";
import type { AgentSession } from "../../../agents/sessions/types.js";
import { ProgressStats } from "./ProgressStats.js";
import { RoleBadge } from "./RoleBadge.js";
import { SessionSelector } from "./SessionSelector.js";
import { StatusIndicator } from "./StatusIndicator.js";
import { TaskSelector } from "./TaskSelector.js";
import { VerbosityDropdown } from "./VerbosityDropdown.js";

export interface SessionHeaderProps {
  /** Current agent session (null when no active session) */
  session: AgentSession | null;

  /** Available tasks for TaskSelector */
  availableTasks?: Array<{ taskId: number; title: string }>;

  /** Available sessions for SessionSelector */
  availableSessions?: AgentSession[];

  /** Stop button click handler */
  onStop?: () => void;

  /** Task change handler */
  onTaskChange?: (taskId: number) => void;

  /** Session change handler */
  onSessionChange?: (sessionId: string) => void;
}

/**
 * SessionHeader - Agent panel header with session info and controls
 *
 * Two-row layout:
 * Row 1: RoleBadge, Task selector (placeholder), Session selector (placeholder), Stop button
 * Row 2: StatusIndicator, ProgressStats
 *
 * Visual layout:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ 🤖 Orchestrator │ Task N ▼ │ Session M/K ▼ │    [⏹]            │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ ● Running   Iteration 5/50   Duration: 2m 34s                   │
 * │ Tools: 12 calls (11 ✓ 1 ✗)   Files: 4 modified                 │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <SessionHeader
 *   session={currentSession()}
 *   onStop={() => handleStopAgent()}
 * />
 * ```
 */
export function SessionHeader(props: SessionHeaderProps) {
  const isRunning = () => {
    return (
      props.session?.status === "running" ||
      props.session?.status === "thinking" ||
      props.session?.status === "waiting_for_tool"
    );
  };

  return (
    <div class="border-b border-gray-700 bg-zinc-900">
      {/* Top row: Role, selectors, stop button */}
      <div class="flex items-center justify-between px-4 py-3">
        <div class="flex items-center gap-4">
          {props.session && <RoleBadge role={props.session.role} />}

          {/* Task selector */}
          <TaskSelector
            currentTaskId={props.session?.taskId}
            availableTasks={props.availableTasks}
            onTaskChange={props.onTaskChange}
          />

          {/* Session selector */}
          <SessionSelector
            currentSessionId={props.session?.sessionId}
            availableSessions={props.availableSessions}
            onSessionChange={props.onSessionChange}
          />

          {/* Verbosity selector */}
          <VerbosityDropdown label="Verbosity" />
        </div>

        {/* Stop button */}
        <button
          onClick={props.onStop}
          disabled={!isRunning()}
          class={`p-2 rounded ${
            isRunning()
              ? "hover:bg-gray-800 text-gray-400 hover:text-gray-200"
              : "text-gray-600 cursor-not-allowed"
          } transition-colors`}
          title={isRunning() ? "Stop agent" : "Agent not running"}
        >
          <Icon icon="lucide:square" class="w-4 h-4" />
        </button>
      </div>

      {/* Bottom row: Status and progress stats */}
      {props.session && (
        <div class="flex items-center gap-4 px-4 py-2 bg-gray-900/50">
          <StatusIndicator status={props.session.status} />
          <ProgressStats
            iteration={props.session.iteration}
            maxIterations={props.session.maxIterations}
            durationMs={props.session.durationMs}
            toolCallCount={props.session.toolCallCount}
            successfulToolCalls={props.session.successfulToolCalls}
            failedToolCalls={props.session.failedToolCalls}
            filesModified={props.session.filesModified}
          />
        </div>
      )}
    </div>
  );
}
