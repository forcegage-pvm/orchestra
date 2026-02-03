/**
 * Markdown Component
 *
 * Renders markdown text as HTML with syntax highlighting support.
 */

import { marked } from "marked";
import { createMemo } from "solid-js";

export interface MarkdownProps {
  /** Markdown text to render */
  content: string;

  /** Optional CSS class */
  class?: string;
}

/**
 * Markdown - Renders markdown text as formatted HTML
 *
 * @example
 * ```tsx
 * <Markdown content="# Hello\nThis is **bold**" />
 * ```
 */
export function Markdown(props: MarkdownProps) {
  const html = createMemo(() => {
    try {
      return marked.parse(props.content, {
        breaks: true,
        gfm: true,
      }) as string;
    } catch (error) {
      console.error("Markdown parsing error:", error);
      return `<pre>${props.content}</pre>`;
    }
  });

  return (
    <div
      class={`markdown-content ${props.class || ""}`}
      innerHTML={html()}
    />
  );
}
