/**
 * TerminalOutput Component
 *
 * Renders terminal output with ANSI color code support.
 * Converts ANSI escape sequences to styled HTML.
 * Supports max-height constraints with scrollable overflow.
 */

import AnsiToHtml from "ansi-to-html";
import { createMemo } from "solid-js";

export interface TerminalOutputProps {
  /** Raw terminal output text (may contain ANSI codes) */
  output: string;

  /** Optional CSS class */
  class?: string;

  /** Max height in pixels. Adds overflow-y-auto when set. */
  maxHeight?: number;

  /** Callback to expose the scrollable pre element ref externally */
  onScrollRef?: (el: HTMLPreElement) => void;
}

// Configure the ANSI to HTML converter
const ansiConverter = new AnsiToHtml({
  fg: "#d4d4d4", // Default foreground (gray-300 equivalent)
  bg: "transparent", // Transparent background
  newline: true, // Convert newlines to <br>
  escapeXML: true, // Escape HTML entities
  colors: {
    // Standard ANSI colors mapped to modern palette
    0: "#1e1e1e", // Black
    1: "#f87171", // Red (red-400)
    2: "#4ade80", // Green (green-400)
    3: "#facc15", // Yellow (yellow-400)
    4: "#60a5fa", // Blue (blue-400)
    5: "#c084fc", // Magenta (purple-400)
    6: "#22d3ee", // Cyan (cyan-400)
    7: "#d4d4d4", // White (gray-300)
    // Bright variants
    8: "#71717a", // Bright Black (gray-500)
    9: "#fca5a5", // Bright Red (red-300)
    10: "#86efac", // Bright Green (green-300)
    11: "#fde047", // Bright Yellow (yellow-300)
    12: "#93c5fd", // Bright Blue (blue-300)
    13: "#d8b4fe", // Bright Magenta (purple-300)
    14: "#67e8f9", // Bright Cyan (cyan-300)
    15: "#f4f4f5", // Bright White (gray-100)
  },
});

/**
 * Strip VS Code shell integration sequences (OSC 633)
 * These are escape sequences used by VS Code for shell integration
 * and should not be displayed to the user.
 */
function stripShellIntegrationSequences(text: string): string {
  // OSC 633 sequences: \x1b]633;....\x07 or \x1b]633;....\x1b\\
  // Also strip other common OSC sequences
  return text
    .replace(/\x1b\]633;[^\x07\x1b]*(?:\x07|\x1b\\)/g, "") // OSC 633 (VS Code shell integration)
    .replace(/\x1b\]0;[^\x07\x1b]*(?:\x07|\x1b\\)/g, "") // OSC 0 (window title)
    .replace(/\x1b\]7;[^\x07\x1b]*(?:\x07|\x1b\\)/g, "") // OSC 7 (current directory)
    .replace(/\x1b\[\?25[hl]/g, "") // Show/hide cursor
    .replace(/\x1b\[\?2004[hl]/g, "") // Bracketed paste mode
    .replace(/\x1b\[[\d;]*[HfABCDJKsu]/g, "") // Cursor movement and clear sequences
    .replace(/\r(?!\n)/g, ""); // Carriage return without newline (overwrite mode)
}

/**
 * TerminalOutput - Renders terminal output with color support
 *
 * @example
 * ```tsx
 * <TerminalOutput output="\x1b[32mSuccess\x1b[0m" />
 * ```
 */
export function TerminalOutput(props: TerminalOutputProps) {
  const html = createMemo(() => {
    // First strip shell integration sequences
    const cleaned = stripShellIntegrationSequences(props.output);
    // Then convert remaining ANSI codes to HTML
    return ansiConverter.toHtml(cleaned);
  });

  const scrollStyle = () =>
    props.maxHeight
      ? { "max-height": `${props.maxHeight}px`, "overflow-y": "auto" as const }
      : undefined;

  return (
    <div class={`terminal-output ${props.class || ""}`}>
      <pre
        ref={(el) => props.onScrollRef?.(el)}
        class="border border-zinc-800/30 rounded p-2 overflow-x-auto text-[10px] font-mono leading-tight bg-zinc-900/50 whitespace-pre-wrap break-words output-scroll"
        style={scrollStyle()}
        innerHTML={html()}
      />
    </div>
  );
}
