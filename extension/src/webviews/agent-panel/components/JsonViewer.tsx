/**
 * JsonViewer Component
 *
 * Displays JSON data with syntax highlighting and formatting.
 */

import { createMemo } from "solid-js";

export interface JsonViewerProps {
  /** JSON string or object to display */
  data: string | object;

  /** Optional CSS class */
  class?: string;
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
    } catch (error) {
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

  return (
    <div class={`json-viewer ${props.class || ""}`}>
      {isValidJson() ? (
        <pre class="border border-zinc-800/30 rounded p-2 overflow-x-auto text-[10px] font-mono text-zinc-300 leading-tight">
          {formatted()}
        </pre>
      ) : (
        <pre class="border border-zinc-800/30 rounded p-2 overflow-x-auto text-[10px] font-mono text-zinc-400 leading-tight">
          {String(props.data)}
        </pre>
      )}
    </div>
  );
}
