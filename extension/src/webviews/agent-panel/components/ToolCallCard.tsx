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
import { OutputToolbar } from "./OutputToolbar.js";
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

function getBaseName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || filePath;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function extractStringValue(args: unknown, keys: string[]): string | null {
  if (!args || typeof args !== "object") return null;
  const record = args as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function extractFilePath(args: unknown): string | null {
  if (!args || typeof args !== "object") return null;
  const record = args as Record<string, unknown>;
  const candidates = ["filePath", "path", "file", "file_path"];
  for (const key of candidates) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
    if (Array.isArray(value) && typeof value[0] === "string") {
      return value[0];
    }
  }
  const filePaths = record.filePaths;
  if (Array.isArray(filePaths) && typeof filePaths[0] === "string") {
    return filePaths[0];
  }
  return null;
}

function getSearchCount(result: unknown): number | null {
  if (result === undefined || result === null) return null;

  let parsed: unknown = result;
  if (typeof result === "string") {
    const match = result.match(/(\d+)\s+matches?/i);
    if (match) return Number(match[1]);
    try {
      parsed = JSON.parse(result);
    } catch {
      return null;
    }
  }

  if (typeof parsed === "object" && parsed !== null) {
    // Direct array of matches (e.g. grep_search returns JSON array)
    if (Array.isArray(parsed)) return parsed.length;
    const record = parsed as Record<string, unknown>;
    const directCount = record.totalMatches ?? record.count;
    if (typeof directCount === "number") return directCount;
    const matches = record.matches;
    if (Array.isArray(matches)) return matches.length;
    const results = record.results;
    if (Array.isArray(results)) return results.length;
  }

  return null;
}

function buildSearchQuery(args: unknown): string | null {
  const query = extractStringValue(args, ["query"]);
  if (!query) return null;
  const includePattern = extractStringValue(args, ["includePattern"]);
  const normalizedQuery = query.replace(/\s+/g, " ").trim();
  const normalizedInclude = includePattern
    ? includePattern.replace(/\s+/g, " ").trim()
    : null;
  if (normalizedInclude) {
    return `"${normalizedQuery}" in ${normalizedInclude}`;
  }
  return `"${normalizedQuery}"`;
}

function buildSearchCountLabel(result: unknown): string {
  const count = getSearchCount(result);
  const countValue = count ?? "?";
  const matchLabel = count === 1 ? "match" : "matches";
  return `${countValue} ${matchLabel}`;
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
  const [outputScrollRef, setOutputScrollRef] = createSignal<
    HTMLElement | undefined
  >();

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

  const toolDetailLabel = () => {
    const toolName = props.toolCall.toolName;
    if (toolName === "read_file" || toolName === "read_spec_file") {
      const filePath = extractFilePath(props.toolCall.arguments);
      return filePath ? getBaseName(filePath) : null;
    }
    if (toolName === "create_file" || toolName === "edit_file") {
      const filePath = extractFilePath(props.toolCall.arguments);
      return filePath ? getBaseName(filePath) : null;
    }
    if (toolName === "grep_search") {
      return buildSearchQuery(props.toolCall.arguments);
    }
    if (toolName === "run_command") {
      const command = extractStringValue(props.toolCall.arguments, ["command"]);
      return command ? truncateText(command, 40) : null;
    }
    return null;
  };

  const isGrepLabel = () => props.toolCall.toolName === "grep_search";

  const grepCountLabel = () => {
    if (!isGrepLabel()) return "";
    return buildSearchCountLabel(props.toolCall.result);
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

  const getOutputCopyText = (): string => {
    const terminalText = getTerminalOutput();
    if (isCommandOutput() && terminalText) return terminalText;
    const output = getOutputDisplay();
    if (output === null || output === undefined) return "";
    if (typeof output === "string") return output;
    try {
      return JSON.stringify(output, null, 2);
    } catch {
      return String(output);
    }
  };

  return (
    <div class="rounded animate-fadeIn">
      {/* Header Row */}
      <div class="flex items-center gap-1.5 px-2 py-1">
        {/* Tool Icon - slightly smaller with top padding for alignment */}
        <ToolIcon
          toolName={props.toolCall.toolName}
          class="w-3 h-3 flex-shrink-0 mt-0.5"
        />

        {/* Status Icon - Spinner / Check / X (before tool name) */}
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

        {/* Tool Name */}
        <span class="text-xs text-gray-400 leading-none">
          {props.toolCall.toolName}
        </span>
        {/* Non-grep detail label */}
        <Show when={!isGrepLabel() && toolDetailLabel()}>
          <span class="text-xs text-gray-500 leading-none truncate max-w-[280px]">
            {toolDetailLabel()}
          </span>
        </Show>

        {/* Grep search: query fills space (truncates), count never truncates */}
        <Show when={isGrepLabel()}>
          <span class="text-xs text-orange-400 leading-none truncate min-w-0 flex-1">
            {toolDetailLabel() || ""}
          </span>
          <span class="text-xs text-orange-400/60 leading-none flex-shrink-0 whitespace-nowrap pl-2">
            - {grepCountLabel()}
          </span>
        </Show>

        {/* Spacer (not needed for grep — query is flex-1) */}
        <Show when={!isGrepLabel()}>
          <div class="flex-1" />
        </Show>

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
          class={`flex items-center gap-1 text-[11px] transition-colors ${
            !hasInput()
              ? "text-gray-600 cursor-not-allowed"
              : selectedTab() === "input"
                ? "text-gray-300"
                : "text-gray-500 hover:text-gray-400"
          }`}
        >
          <Icon icon="lucide:log-in" class="w-3.5 h-3.5" />
          <span>input</span>
        </button>

        {/* Output Tab */}
        <button
          onClick={() => toggleTab("output")}
          disabled={!hasOutput() && !hasError()}
          class={`flex items-center gap-1 text-[11px] transition-colors ${
            !hasOutput() && !hasError()
              ? "text-gray-600 cursor-not-allowed"
              : selectedTab() === "output"
                ? "text-gray-300"
                : "text-gray-500 hover:text-gray-400"
          }`}
        >
          <Icon icon="lucide:log-out" class="w-3.5 h-3.5" />
          <span>output</span>
        </button>
      </div>

      {/* Expandable Content Panel */}
      <Show when={selectedTab() !== "none"}>
        <div class="mx-2 mb-1.5 border-l-2 border-violet-500/60 pl-2">
          {/* Input Panel */}
          <Show when={selectedTab() === "input" && hasInput()}>
            <JsonViewer data={getInputDisplay()} maxHeight={300} />
          </Show>

          {/* Output Panel */}
          <Show when={selectedTab() === "output"}>
            <Show
              when={!isFailed()}
              fallback={
                <div class="text-xs space-y-1 py-1 max-h-48 overflow-y-auto">
                  <div class="text-red-400 whitespace-pre-wrap break-words">
                    {props.toolCall.error?.message || "Tool execution failed"}
                  </div>
                  <Show when={props.toolCall.error?.suggestion}>
                    <div class="text-yellow-400 text-[10px]">
                      {props.toolCall.error!.suggestion}
                    </div>
                  </Show>
                </div>
              }
            >
              {/* Toolbar for output content */}
              <OutputToolbar
                scrollContainerRef={outputScrollRef}
                copyText={getOutputCopyText}
              />
              {/* Use TerminalOutput for command tools with stdout */}
              <Show
                when={isCommandOutput() && getTerminalOutput()}
                fallback={
                  <JsonViewer
                    data={getOutputDisplay()}
                    maxHeight={300}
                    onScrollRef={setOutputScrollRef}
                  />
                }
              >
                <TerminalOutput
                  output={getTerminalOutput()!}
                  maxHeight={300}
                  onScrollRef={setOutputScrollRef}
                />
              </Show>
            </Show>
          </Show>
        </div>
      </Show>
    </div>
  );
}
