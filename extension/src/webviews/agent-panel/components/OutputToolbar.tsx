/**
 * OutputToolbar Component
 *
 * Provides scroll-to-top, scroll-to-bottom, and copy-to-clipboard buttons
 * for content panels (JsonViewer, TerminalOutput).
 */

import { Icon } from "@iconify-icon/solid";
import { createSignal } from "solid-js";

export interface OutputToolbarProps {
  /** Accessor for the scrollable container element */
  scrollContainerRef: () => HTMLElement | undefined;
  /** Accessor for the text content to copy to clipboard */
  copyText: () => string;
}

export function OutputToolbar(props: OutputToolbarProps) {
  const [copied, setCopied] = createSignal(false);

  const scrollToTop = () => {
    const el = props.scrollContainerRef();
    if (el) el.scrollTop = 0;
  };

  const scrollToBottom = () => {
    const el = props.scrollContainerRef();
    if (el) el.scrollTop = el.scrollHeight;
  };

  const handleCopy = async () => {
    const text = props.copyText();
    if (!text) return;
    try {
      await window.navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API fails in VS Code webviews — fall back to postMessage
      window.vscode.postMessage({ type: "copy_text", text });
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div class="flex items-center justify-end gap-1.5 mb-1">
      <button
        onClick={scrollToTop}
        class="p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors rounded"
        title="Scroll to top"
      >
        <Icon icon="lucide:chevron-up" class="w-3.5 h-3.5" />
      </button>
      <button
        onClick={scrollToBottom}
        class="p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors rounded"
        title="Scroll to bottom"
      >
        <Icon icon="lucide:chevron-down" class="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => void handleCopy()}
        class="p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors rounded"
        title={copied() ? "Copied!" : "Copy to clipboard"}
      >
        <Icon
          icon={copied() ? "lucide:check" : "lucide:copy"}
          class="w-3.5 h-3.5"
        />
      </button>
    </div>
  );
}
