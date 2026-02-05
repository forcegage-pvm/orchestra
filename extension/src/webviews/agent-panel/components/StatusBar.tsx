/**
 * StatusBar Component
 *
 * Top status bar showing agent session information, current status,
 * and control buttons (Stop, Pause, Retry).
 *
 * Specification: specs/011-agent-panel-rework/spec.md
 */

import { Icon } from "@iconify-icon/solid";
import { createMemo, Show } from "solid-js";
import type { SessionStatus } from "../../../agents/sessions/types.js";
import { session } from "../stores/sessionStore.js";

interface StatusConfig {
  icon: string;
  label: string;
  color: string;
  dotColor: string;
}

function getStatusConfig(status: SessionStatus | undefined): StatusConfig {
  if (!status) {
    return {
      icon: "lucide:circle",
      label: "Ready",
      color: "text-zinc-500",
      dotColor: "bg-zinc-500",
    };
  }

  switch (status) {
    case "initializing":
      return {
        icon: "lucide:loader",
        label: "Initializing",
        color: "text-blue-400",
        dotColor: "bg-blue-400",
      };
    case "running":
      return {
        icon: "lucide:play",
        label: "Running",
        color: "text-green-400",
        dotColor: "bg-green-400",
      };
    case "waiting_for_tool":
      return {
        icon: "lucide:clock",
        label: "Waiting",
        color: "text-yellow-400",
        dotColor: "bg-yellow-400",
      };
    case "thinking":
      return {
        icon: "lucide:brain",
        label: "Thinking",
        color: "text-purple-400",
        dotColor: "bg-purple-400",
      };
    case "paused":
      return {
        icon: "lucide:pause",
        label: "Paused",
        color: "text-orange-400",
        dotColor: "bg-orange-400",
      };
    case "completed":
      return {
        icon: "lucide:check",
        label: "Completed",
        color: "text-green-500",
        dotColor: "bg-green-500",
      };
    case "failed":
      return {
        icon: "lucide:x",
        label: "Failed",
        color: "text-red-500",
        dotColor: "bg-red-500",
      };
    case "cancelled":
      return {
        icon: "lucide:ban",
        label: "Cancelled",
        color: "text-zinc-500",
        dotColor: "bg-zinc-500",
      };
    default:
      return {
        icon: "lucide:circle",
        label: status,
        color: "text-zinc-400",
        dotColor: "bg-zinc-400",
      };
  }
}

/**
 * Send message to extension host
 */
function postMessage(type: string, data?: Record<string, unknown>): void {
  if (typeof window !== "undefined" && window.vscode) {
    window.vscode.postMessage({ type, ...data });
  }
}

export function StatusBar() {
  const statusConfig = createMemo(() => getStatusConfig(session?.status));

  const isActive = createMemo(() => {
    const status = session?.status;
    return (
      status === "initializing" ||
      status === "running" ||
      status === "waiting_for_tool" ||
      status === "thinking"
    );
  });

  const isPaused = createMemo(() => session?.status === "paused");

  const canRetry = createMemo(() => {
    const status = session?.status;
    return (
      status === "failed" || status === "completed" || status === "cancelled"
    );
  });

  const formatActionText = (text: string): string => {
    if (!text) return "";
    return text.charAt(0).toLowerCase() + text.slice(1);
  };

  // Get workflow stage based on role
  const workflowStage = createMemo(() => {
    if (session?.statusMessage) {
      // Extract first part before dash from workflow chain messages
      const match = session.statusMessage.match(/^([^-]+)/);
      if (match && match[1]) {
        return match[1].trim();
      }
      return session.statusMessage;
    }
    // Default based on role
    switch (session?.role) {
      case "orchestrator":
        return "Preparing handover";
      case "implementor":
        return "Implementing";
      case "controller":
        return "Reviewing";
      default:
        return "";
    }
  });

  const handleStop = () => {
    postMessage("stop_agent");
  };

  const handlePause = () => {
    postMessage("pause_agent");
  };

  const handleResume = () => {
    postMessage("resume_agent");
  };

  const handleRetry = () => {
    postMessage("retry_agent");
  };

  return (
    <div class="flex items-center justify-between px-3 py-2 border-b border-zinc-800/30">
      {/* Left side - Status icon, agent, action, task */}
      <div class="flex items-center gap-2">
        {/* Spinner first (or status icon when idle) */}
        <Show
          when={isActive()}
          fallback={
            <span
              class={`w-2 h-2 rounded-full ${statusConfig().dotColor}`}
              aria-label={statusConfig().label}
            />
          }
        >
          <Icon
            icon="lucide:loader-2"
            class="w-3.5 h-3.5 text-green-400 animate-spin"
          />
        </Show>

        {/* Agent role */}
        <span class="text-xs font-medium text-zinc-300">
          {session?.role === "orchestrator"
            ? "Orchestrator"
            : session?.role === "implementor"
              ? "Implementor"
              : session?.role === "controller"
                ? "Controller"
                : "Agent"}
        </span>

        {/* Workflow stage (action) */}
        <Show when={session && workflowStage()}>
          <span class="text-[10px] text-zinc-500 italic">
            {formatActionText(workflowStage())}
          </span>
        </Show>

        {/* Task number badge */}
        <Show when={session?.taskNumber}>
          <span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800/50 text-zinc-400 border border-zinc-700/50">
            TASK-{session?.taskNumber}
          </span>
        </Show>
      </div>

      {/* Center - Compact status indicator (only when NOT running) */}
      <div class="flex items-center gap-4">
        <Show when={!isActive()}>
          <div class={`flex items-center gap-1.5 ${statusConfig().color}`}>
            <span class={`w-2 h-2 rounded-full ${statusConfig().dotColor}`} />
            <span class="text-xs font-medium">
              {statusConfig().label.toLowerCase()}
            </span>
          </div>
        </Show>

        {/* Iteration counter */}
        <Show when={session?.iteration && session?.maxIterations}>
          <div class="flex items-center gap-1.5 text-zinc-500">
            <span class="text-xs">
              {session?.iteration}/{session?.maxIterations}
            </span>
          </div>
        </Show>
      </div>

      {/* Right side - Control buttons */}
      <div class="flex items-center gap-2">
        {/* Pause/Resume button */}
        <Show when={isActive() || isPaused()}>
          <button
            onClick={isPaused() ? handleResume : handlePause}
            class="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
            title={isPaused() ? "Resume" : "Pause"}
          >
            <Icon
              icon={isPaused() ? "lucide:play" : "lucide:pause"}
              class="w-3.5 h-3.5"
            />
            <span>{isPaused() ? "Resume" : "Pause"}</span>
          </button>
        </Show>

        {/* Stop button */}
        <Show when={isActive() || isPaused()}>
          <button
            onClick={handleStop}
            class="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-red-400 hover:text-red-300 hover:bg-red-950/30 transition-colors"
            title="Stop"
          >
            <Icon icon="lucide:square" class="w-3.5 h-3.5" />
            <span>Stop</span>
          </button>
        </Show>

        {/* Retry button */}
        <Show when={canRetry()}>
          <button
            onClick={handleRetry}
            class="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-950/30 transition-colors"
            title="Retry"
          >
            <Icon icon="lucide:refresh-cw" class="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </Show>
      </div>
    </div>
  );
}
