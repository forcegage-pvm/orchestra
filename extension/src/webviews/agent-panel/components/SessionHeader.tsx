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
 * Compact single-row layout:
 * - RoleBadge with spinner (when running)
 * - Task selector + WorkflowStage
 * - Session selector
 * - Verbosity dropdown
 * - StatusIndicator (compact - just dot)
 * - ProgressStats (compact)
 * - Stop button
 *
 * Visual layout:
 * ```
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ 🤖 Orchestrator ⟳ │ Task N ▼ (Preparing) │ Sess │ Verb │ ● │ Stats │ [⏹] │
 * └─────────────────────────────────────────────────────────────────────────────┘
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
    <div class="flex-none h-12 border-b border-zinc-900/50 bg-[#09090b]/90 backdrop-blur-md">
      {/* Single row: Role with spinner, task + stage, selectors, status, stats, stop */}
      <div class="h-full flex items-center justify-between px-4">
        <div class="flex items-center gap-3">
          {props.session && (
            <RoleBadge role={props.session.role} isActive={isRunning()} />
          )}

          {/* Task selector with workflow stage */}
          <div class="flex items-center gap-2">
            <TaskSelector
              currentTaskId={props.session?.taskId}
              availableTasks={props.availableTasks}
              onTaskChange={props.onTaskChange}
            />
            {props.session && (
              <WorkflowStage
                role={props.session.role}
                statusMessage={props.session.statusMessage}
              />
            )}
          </div>

          {/* Session selector */}
          <SessionSelector
            currentSessionId={props.session?.sessionId}
            availableSessions={props.availableSessions}
            onSessionChange={props.onSessionChange}
          />

          {/* Verbosity selector */}
          <VerbosityDropdown label="Verbosity" />

          {/* Compact status and Progress Stats inline */}
          {props.session && (
            <>
              <div class="h-4 w-px bg-zinc-800 mx-1"></div>
              <StatusIndicator status={props.session.status} compact={true} />
              <ProgressStats
                iteration={props.session.iteration}
                maxIterations={props.session.maxIterations}
                durationMs={props.session.durationMs}
                toolCallCount={props.session.toolCallCount}
                successfulToolCalls={props.session.successfulToolCalls}
                failedToolCalls={props.session.failedToolCalls}
                filesModified={props.session.filesModified}
              />
            </>
          )}
        </div>

        {/* Stop button */}
        <button
          onClick={props.onStop}
          disabled={!isRunning()}
          class={`p-2 rounded-md ${
            isRunning()
              ? "hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300"
              : "text-zinc-600 cursor-not-allowed"
          } transition-colors`}
          title={isRunning() ? "Stop agent" : "Agent not running"}
        >
          <Icon icon="lucide:square" class="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
