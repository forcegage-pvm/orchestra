/**
 * ToolCallCard Component
 *
 * Compact tool call display with input/output tabs.
 * Shows status via icon only (spinner/check/x), duration on completion.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 4.1
 */

import { Icon } from "@iconify-icon/solid";
import { createEffect, createSignal, Show } from "solid-js";
import type { ToolCallAggregate } from "../../../agents/sessions/types.js";
import { JsonViewer } from "./JsonViewer.js";
import { TerminalOutput } from "./TerminalOutput.js";
import { ToolIcon } from "./ToolIcon.js";

export interface ToolCallCardProps {
  /** Tool call aggregate data */
  toolCall: ToolCallAggregate;
}

/** Tab selection state */
type TabSelection = "none" | "input" | "output";

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * ToolCallCard - Compact tool call display
 *
 * Layout:
 * - Row 1: [ToolIcon] [ToolName] [StatusIcon] ... [Duration]
 * - Row 2: [InputTab] [OutputTab]
 * - Row 3: [Expandable Content Panel]
 */
export function ToolCallCard(props: ToolCallCardProps) {
  // Start with no tab selected
  const [selectedTab, setSelectedTab] = createSignal<TabSelection>("none");

  // Auto-expand output tab when status changes to failed
  createEffect(() => {
    if (props.toolCall.status === "failed") {
      setSelectedTab("output");
    }
  });

  const isRunning = () =>
    props.toolCall.status === "pending" || props.toolCall.status === "running";

  const isSuccess = () => props.toolCall.status === "success";
  const isFailed = () => props.toolCall.status === "failed";
  const isCompleted = () => isSuccess() || isFailed();

  const toggleTab = (tab: "input" | "output") => {
    setSelectedTab((current) => (current === tab ? "none" : tab));
  };

  const hasInput = () => {
    const args = props.toolCall.arguments;
    return args !== undefined && args !== null && Object.keys(args).length > 0;
  };

  const hasOutput = () => {
    return (
      props.toolCall.result !== undefined && props.toolCall.result !== null
    );
  };

  const hasError = () => {
    return props.toolCall.error !== undefined;
  };

  const getInputDisplay = () => {
    const args = props.toolCall.arguments;
    if (args === undefined || args === null) return null;
    return args;
  };

  const getOutputDisplay = () => {
    // If failed, show error
    if (isFailed() && props.toolCall.error) {
      return {
        error: true,
        code: props.toolCall.error.code || "Error",
        message: props.toolCall.error.message || "Tool execution failed",
        suggestion: props.toolCall.error.suggestion,
      };
    }
    // Otherwise show result
    const result = props.toolCall.result;
    if (result === undefined || result === null) return null;
    if (typeof result === "string") {
      try {
        return JSON.parse(result);
      } catch {
        return result;
      }
    }
    return result;
  };

  // Check if this is a command/terminal tool with stdout
  const isCommandOutput = () => {
    const toolName = props.toolCall.toolName;
    return (
      toolName === "run_command" ||
      toolName === "run_terminal" ||
      toolName === "run_tests"
    );
  };

  // Get terminal output text (stdout from command result)
  const getTerminalOutput = (): string | null => {
    const result = props.toolCall.result;
    if (!result) return null;

    // Parse if string
    let parsed = result;
    if (typeof result === "string") {
      try {
        parsed = JSON.parse(result);
      } catch {
        return result; // If not JSON, treat the whole thing as output
      }
    }

    // Look for stdout field (run_command format)
    if (typeof parsed === "object" && parsed !== null) {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.stdout === "string") {
        return obj.stdout;
      }
      // Also check for output field
      if (typeof obj.output === "string") {
        return obj.output;
      }
    }

    return null;
  };

  return (
    <div class="rounded animate-fadeIn">
      {/* Header Row */}
      <div class="flex items-center gap-1.5 px-2 py-1">
        {/* Tool Icon - use leading-none to align with text baseline */}
        <ToolIcon
          toolName={props.toolCall.toolName}
          class="w-3.5 h-3.5 text-cyan-500 flex-shrink-0 self-center"
        />

        {/* Tool Name */}
        <span class="text-xs text-gray-400 leading-none">
          {props.toolCall.toolName}
        </span>

        {/* Status Icon - Spinner / Check / X (right after tool name) */}
        <Show when={isRunning()}>
          <Icon
            icon="lucide:loader-2"
            class="w-3.5 h-3.5 text-cyan-400 animate-spin flex-shrink-0"
          />
        </Show>
        <Show when={isSuccess()}>
          <Icon
            icon="lucide:check"
            class="w-3.5 h-3.5 text-green-400 flex-shrink-0"
          />
        </Show>
        <Show when={isFailed()}>
          <Icon
            icon="lucide:x"
            class="w-3.5 h-3.5 text-red-400 flex-shrink-0"
          />
        </Show>

        {/* Spacer */}
        <div class="flex-1" />

        {/* Duration - Only on completion */}
        <Show when={isCompleted() && props.toolCall.durationMs !== undefined}>
          <div class="flex items-center gap-0.5 text-[10px] text-gray-500 flex-shrink-0">
            <Icon icon="lucide:clock" class="w-2.5 h-2.5" />
            <span>{formatDuration(props.toolCall.durationMs!)}</span>
          </div>
        </Show>
      </div>

      {/* Tab Row - Always visible, aligned with tool name */}
      <div class="flex items-center gap-4 pl-7 pr-2 -mt-0.5 pb-1">
        {/* Input Tab */}
        <button
          onClick={() => toggleTab("input")}
          disabled={!hasInput()}
          class={`flex items-center gap-0.5 text-[10px] transition-colors ${
            !hasInput()
              ? "text-gray-600 cursor-not-allowed"
              : selectedTab() === "input"
                ? "text-gray-300"
                : "text-gray-500 hover:text-gray-400"
          }`}
        >
          <Icon icon="lucide:log-in" class="w-2.5 h-2.5" />
          <span>input</span>
        </button>

        {/* Output Tab */}
        <button
          onClick={() => toggleTab("output")}
          disabled={!hasOutput() && !hasError()}
          class={`flex items-center gap-0.5 text-[10px] transition-colors ${
            !hasOutput() && !hasError()
              ? "text-gray-600 cursor-not-allowed"
              : selectedTab() === "output"
                ? "text-gray-300"
                : "text-gray-500 hover:text-gray-400"
          }`}
        >
          <Icon icon="lucide:log-out" class="w-2.5 h-2.5" />
          <span>output</span>
        </button>
      </div>

      {/* Expandable Content Panel */}
      <Show when={selectedTab() !== "none"}>
        <div class="mx-2 mb-1.5 border-l-2 border-violet-500/60 pl-2">
          {/* Input Panel */}
          <Show when={selectedTab() === "input" && hasInput()}>
            <JsonViewer data={getInputDisplay()} />
          </Show>

          {/* Output Panel */}
          <Show when={selectedTab() === "output"}>
            <Show
              when={!isFailed()}
              fallback={
                <div class="text-xs space-y-1 py-1">
                  <div class="text-red-400">
                    {props.toolCall.error?.message || "Tool execution failed"}
                  </div>
                  <Show when={props.toolCall.error?.suggestion}>
                    <div class="text-yellow-400 text-[10px]">
                      💡 {props.toolCall.error!.suggestion}
                    </div>
                  </Show>
                </div>
              }
            >
              {/* Use TerminalOutput for command tools with stdout */}
              <Show
                when={isCommandOutput() && getTerminalOutput()}
                fallback={<JsonViewer data={getOutputDisplay()} />}
              >
                <TerminalOutput output={getTerminalOutput()!} />
              </Show>
            </Show>
          </Show>
        </div>
      </Show>
    </div>
  );
}
