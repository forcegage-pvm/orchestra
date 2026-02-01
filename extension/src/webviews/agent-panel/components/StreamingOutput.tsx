/**
 * StreamingOutput Component
 *
 * Displays streaming tool output with preview/expand functionality.
 * Shows last 5 lines by default, caps at 500 lines total, and provides
 * an expand button when content exceeds preview.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 4.1, Decision #8
 */

import { Icon } from "@iconify-icon/solid";
import { createSignal, Show } from "solid-js";

export interface StreamingOutputProps {
  /** Array of output chunks to display */
  outputChunks: string[];

  /** Whether the output is from stderr (affects styling) */
  isStderr?: boolean;
}

const PREVIEW_LINE_COUNT = 5;
const MAX_LINE_COUNT = 500;

/**
 * StreamingOutput - Displays tool output with preview/expand functionality
 *
 * Joins output chunks into lines, shows last 5 lines by default,
 * caps at 500 lines total, and provides expand/collapse functionality
 * when content exceeds the preview limit.
 *
 * @example
 * ```tsx
 * <StreamingOutput
 *   outputChunks={["line 1\n", "line 2\n", "line 3\n"]}
 *   isStderr={false}
 * />
 * ```
 */
export function StreamingOutput(props: StreamingOutputProps) {
  const [expanded, setExpanded] = createSignal(false);

  // Join chunks and split into lines
  const getLines = () => {
    const fullText = props.outputChunks.join("");
    return fullText.split("\n");
  };

  // Get capped lines (max 500)
  const getCappedLines = () => {
    const lines = getLines();
    return lines.slice(0, MAX_LINE_COUNT);
  };

  // Get preview lines (last 5)
  const getPreviewLines = () => {
    const lines = getCappedLines();
    if (lines.length <= PREVIEW_LINE_COUNT) {
      return lines;
    }
    return lines.slice(-PREVIEW_LINE_COUNT);
  };

  // Calculate hidden line count
  const getHiddenLineCount = () => {
    const totalLines = getCappedLines().length;
    if (totalLines <= PREVIEW_LINE_COUNT) {
      return 0;
    }
    return totalLines - PREVIEW_LINE_COUNT;
  };

  // Determine if max lines were exceeded
  const isMaxExceeded = () => {
    return getLines().length > MAX_LINE_COUNT;
  };

  const toggleExpanded = () => {
    setExpanded(!expanded());
  };

  const displayLines = () => {
    return expanded() ? getCappedLines() : getPreviewLines();
  };

  const textColorClass = () => {
    return props.isStderr ? "text-red-400" : "text-gray-300";
  };

  const showExpandButton = () => {
    return getHiddenLineCount() > 0;
  };

  return (
    <div class="bg-zinc-800 border border-gray-700 rounded p-3">
      <div class="flex items-center justify-between mb-2">
        <div class="text-xs text-gray-500 font-medium">
          {props.isStderr ? "stderr" : "stdout"}
        </div>
        <Show when={showExpandButton()}>
          <button
            onClick={toggleExpanded}
            class="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {expanded() ? (
              <>
                <span>Collapse</span>
                <Icon icon="lucide:chevron-up" class="w-3 h-3" />
              </>
            ) : (
              <>
                <span>[+{getHiddenLineCount()} more]</span>
                <Icon icon="lucide:chevron-down" class="w-3 h-3" />
              </>
            )}
          </button>
        </Show>
      </div>

      <pre class={`text-xs font-mono ${textColorClass()} whitespace-pre-wrap break-words`}>
        {displayLines().join("\n")}
      </pre>

      <Show when={isMaxExceeded()}>
        <div class="mt-2 text-xs text-yellow-500">
          Output truncated at {MAX_LINE_COUNT} lines
        </div>
      </Show>
    </div>
  );
}
