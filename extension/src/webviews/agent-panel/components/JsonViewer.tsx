/**
 * JsonViewer Component
 *
 * Displays JSON data with syntax highlighting and formatting.
 * Supports max-height constraints with scrollable overflow.
 */

import { createMemo } from "solid-js";

export interface JsonViewerProps {
  /** JSON string or object to display */
  data: string | object;

  /** Optional CSS class */
  class?: string;

  /** Max height in pixels. Adds overflow-y-auto when set. */
  maxHeight?: number;

  /** Callback to expose the scrollable pre element ref externally */
  onScrollRef?: (el: HTMLPreElement) => void;
}

/**
 * Syntax-highlight a JSON string by wrapping tokens in colored spans.
 * Produces HTML safe for innerHTML rendering.
 *
 * Color scheme follows VS Code dark theme conventions:
 * - Keys: light blue (#9cdcfe)
 * - Strings: orange (#ce9178)
 * - Numbers: light green (#b5cea8)
 * - Booleans/null: blue (#569cd6)
 * - Brackets/braces/colons: dimmed gray (#808080)
 */
function highlightJson(json: string): string {
  const escaped = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped.replace(
    /("(?:\\.|[^"\\])*")\s*(:)|("(?:\\.|[^"\\])*")|(\b(?:true|false|null)\b)|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([\[\]{}])/g,
    (match, key, colon, str, bool, num, bracket) => {
      if (key) {
        return `<span style="color:#9cdcfe">${key}</span>${colon ? `<span style="color:#808080">:</span>` : ""}`;
      }
      if (str) {
        return `<span style="color:#ce9178">${str}</span>`;
      }
      if (bool) {
        return `<span style="color:#569cd6">${bool}</span>`;
      }
      if (num) {
        return `<span style="color:#b5cea8">${num}</span>`;
      }
      if (bracket) {
        return `<span style="color:#808080">${bracket}</span>`;
      }
      return match;
    },
  );
}

/**
 * JsonViewer - Displays formatted JSON with syntax highlighting
 *
 * @example
 * ```tsx
 * <JsonViewer data='{"key": "value"}' />
 * ```
 */
export function JsonViewer(props: JsonViewerProps) {
  const formatted = createMemo(() => {
    try {
      const obj =
        typeof props.data === "string" ? JSON.parse(props.data) : props.data;
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(props.data);
    }
  });

  const isValidJson = createMemo(() => {
    try {
      if (typeof props.data === "string") {
        JSON.parse(props.data);
        return true;
      }
      return typeof props.data === "object";
    } catch {
      return false;
    }
  });

  const highlighted = createMemo(() => {
    if (!isValidJson()) return null;
    return highlightJson(formatted());
  });

  const scrollStyle = () =>
    props.maxHeight
      ? { "max-height": `${props.maxHeight}px`, "overflow-y": "auto" as const }
      : undefined;

  return (
    <div class={`json-viewer ${props.class || ""}`}>
      {isValidJson() ? (
        <pre
          ref={(el) => props.onScrollRef?.(el)}
          class="border border-zinc-800/30 rounded p-2 overflow-x-auto text-[10px] font-mono leading-tight output-scroll"
          style={scrollStyle()}
          innerHTML={highlighted()!}
        />
      ) : (
        <pre
          ref={(el) => props.onScrollRef?.(el)}
          class="border border-zinc-800/30 rounded p-2 overflow-x-auto text-[10px] font-mono text-zinc-400 leading-tight output-scroll"
          style={scrollStyle()}
        >
          {String(props.data)}
        </pre>
      )}
    </div>
  );
}
