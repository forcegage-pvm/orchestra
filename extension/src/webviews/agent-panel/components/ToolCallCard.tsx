/**
 * ToolCallCard Component
 *
 * Composite component displaying a complete tool call with all its data.
 * Includes collapsible body with progress messages, file operations,
 * streaming output, and result footer.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 4.1
 */

import { Icon } from "@iconify-icon/solid";
import { createSignal, For, Show } from "solid-js";
import type { ToolCallAggregate } from "../../../agents/sessions/types.js";
import { FileOperationBadge } from "./FileOperationBadge.js";
import { JsonViewer } from "./JsonViewer.js";
import { StreamingOutput } from "./StreamingOutput.js";
import { ToolCallHeader } from "./ToolCallHeader.js";

export interface ToolCallCardProps {
  /** Tool call aggregate data */
  toolCall: ToolCallAggregate;

  /** Whether to start collapsed (default: false) */
  startCollapsed?: boolean;
}

/**
 * ToolCallCard - Composite tool call display with collapsible body
 *
 * Displays a complete tool call with:
 * - Header: tool icon, name, timestamp, status, duration
 * - Collapsible Body:
 *   - Progress messages (if any)
 *   - File operations (if any)
 *   - Streaming output (if any)
 * - Result Footer: success/error status and output
 *
 * @example
 * ```tsx
 * <ToolCallCard toolCall={toolCallAggregate} startCollapsed={false} />
 * ```
 */
export function ToolCallCard(props: ToolCallCardProps) {
  const [expanded, setExpanded] = createSignal(!props.startCollapsed);
  const [resultExpanded, setResultExpanded] = createSignal(false);

  const toggleExpanded = () => {
    setExpanded(!expanded());
  };

  const toggleResultExpanded = () => {
    setResultExpanded(!resultExpanded());
  };

  const isRunning = () => {
    return props.toolCall.status === "pending" || props.toolCall.status === "running";
  };

  const hasProgressMessages = () => {
    return isRunning() && props.toolCall.lastProgressMessage !== undefined;
  };

  const hasFileOperations = () => {
    return props.toolCall.fileOperations.length > 0;
  };

  const hasOutput = () => {
    return props.toolCall.outputChunks.length > 0;
  };

  const hasBodyContent = () => {
    return hasProgressMessages() || hasFileOperations() || hasOutput();
  };

  const hasResult = () => {
    return (
      props.toolCall.status === "success" || props.toolCall.status === "failed"
    );
  };

  const isJsonResult = () => {
    if (!props.toolCall.result) return false;
    const trimmed = props.toolCall.result.trim();
    return trimmed.startsWith("{") || trimmed.startsWith("[");
  };

  return (
    <div class="bg-zinc-900 border border-gray-700 rounded-lg p-4 animate-fadeIn">
      {/* Header */}
      <div class="flex items-center justify-between mb-3">
        <ToolCallHeader toolCall={props.toolCall} />
        <Show when={hasBodyContent()}>
          <button
            onClick={toggleExpanded}
            class="ml-3 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <Icon
              icon={expanded() ? "lucide:chevron-up" : "lucide:chevron-down"}
              class="w-4 h-4"
            />
          </button>
        </Show>
      </div>

      {/* Collapsible Body */}
      <Show when={expanded() && hasBodyContent()}>
        <div class="border-t border-gray-700 pt-3 space-y-3">
          {/* Progress Messages */}
          <Show when={hasProgressMessages()}>
            <div class="space-y-2">
              <div class="text-xs text-gray-500 font-medium">Progress</div>
              <div class="flex items-start gap-2">
                <Icon
                  icon="lucide:arrow-right"
                  class="w-3 h-3 text-blue-400 flex-shrink-0 mt-0.5"
                />
                <div class="text-sm text-gray-400">
                  {props.toolCall.lastProgressMessage}
                </div>
              </div>
              <Show when={props.toolCall.progressPercent !== undefined}>
                <div class="flex items-center gap-2">
                  <div class="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      class="h-full bg-blue-500 transition-all duration-300"
                      style={{
                        width: `${props.toolCall.progressPercent}%`,
                      }}
                    />
                  </div>
                  <div class="text-xs text-gray-500">
                    {props.toolCall.progressPercent}%
                  </div>
                </div>
              </Show>
            </div>
          </Show>

          {/* File Operations */}
          <Show when={hasFileOperations()}>
            <div class="space-y-2">
              <div class="text-xs text-gray-500 font-medium">
                File Operations
              </div>
              <div class="space-y-1">
                <For each={props.toolCall.fileOperations}>
                  {(op) => <FileOperationBadge operation={op} />}
                </For>
              </div>
            </div>
          </Show>

          {/* Streaming Output */}
          <Show when={hasOutput()}>
            <div class="space-y-2">
              <div class="text-xs text-gray-500 font-medium">Output</div>
              <StreamingOutput
                outputChunks={props.toolCall.outputChunks}
                isStderr={false}
              />
            </div>
          </Show>
        </div>
      </Show>

      {/* Result Footer */}
      <Show when={hasResult()}>
        <div class="border-t border-gray-700 mt-3 pt-3">
          <Show when={props.toolCall.status === "success"}>
            <div class="flex items-start gap-2">
              <Icon
                icon="lucide:check-circle"
                class="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between mb-2">
                  <div class="text-xs text-gray-500 font-medium">Result</div>
                  <Show when={props.toolCall.result}>
                    <button
                      onClick={toggleResultExpanded}
                      class="text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      <Icon
                        icon={
                          resultExpanded()
                            ? "lucide:chevron-up"
                            : "lucide:chevron-down"
                        }
                        class="w-3 h-3"
                      />
                    </button>
                  </Show>
                </div>
                <Show when={resultExpanded() && props.toolCall.result}>
                  <Show
                    when={isJsonResult()}
                    fallback={
                      <pre class="text-sm text-gray-400 break-words whitespace-pre-wrap bg-zinc-950 border border-zinc-800 rounded p-3 overflow-x-auto">
                        {props.toolCall.result}
                      </pre>
                    }
                  >
                    <JsonViewer data={props.toolCall.result!} />
                  </Show>
                </Show>
                <Show when={!resultExpanded() && props.toolCall.result}>
                  <div class="text-xs text-gray-500 italic">
                    Click to expand result
                  </div>
                </Show>
                <Show when={!props.toolCall.result}>
                  <div class="text-sm text-gray-400">Success</div>
                </Show>
              </div>
            </div>
          </Show>

          <Show when={props.toolCall.status === "failed"}>
            <div class="flex items-start gap-2">
              <Icon
                icon="lucide:x-circle"
                class="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5"
              />
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-red-400 mb-1">
                  {props.toolCall.error?.code || "Error"}
                </div>
                <div class="text-sm text-gray-400 break-words">
                  {props.toolCall.error?.message || "Tool execution failed"}
                </div>
                <Show when={props.toolCall.error?.suggestion}>
                  <div class="mt-2 text-sm text-yellow-400">
                    💡 {props.toolCall.error!.suggestion}
                  </div>
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
