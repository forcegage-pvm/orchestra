/**
 * FilterInput Component
 *
 * Search input for filtering events with keyboard shortcuts.
 * Supports Ctrl+F/Cmd+F to focus, Escape to clear.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 4.4, 5.3
 */

import { createEffect, onCleanup, onMount } from "solid-js";
import { setUi, ui } from "../stores/index.js";

export interface FilterInputProps {
  /** Placeholder text */
  placeholder?: string;

  /** Optional CSS class */
  class?: string;
}

/**
 * FilterInput - Search input with keyboard shortcuts
 *
 * Filters events by text match across tool names, messages, file paths, and output.
 * Keyboard shortcuts:
 * - Ctrl+F/Cmd+F: Focus input
 * - Escape: Clear filter
 *
 * @example
 * ```tsx
 * <FilterInput placeholder="Filter events..." />
 * ```
 */
export function FilterInput(props: FilterInputProps) {
  let inputRef: HTMLInputElement | undefined;

  /**
   * Handle input change
   */
  const handleInput = (e: InputEvent) => {
    const target = e.target as HTMLInputElement;
    setUi("filterText", target.value);
  };

  /**
   * Handle key down events
   */
  const handleKeyDown = (e: KeyboardEvent) => {
    // Escape: Clear filter
    if (e.key === "Escape") {
      setUi("filterText", "");
      if (inputRef) {
        inputRef.value = "";
        inputRef.blur();
      }
      e.preventDefault();
    }
  };

  /**
   * Global keyboard shortcut handler
   */
  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    // Ctrl+F or Cmd+F: Focus input
    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      inputRef?.focus();
      e.preventDefault();
    }
  };

  /**
   * Set up global keyboard listener
   */
  onMount(() => {
    document.addEventListener("keydown", handleGlobalKeyDown);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleGlobalKeyDown);
  });

  /**
   * Sync input value with store
   */
  createEffect(() => {
    if (inputRef && ui.filterText !== inputRef.value) {
      inputRef.value = ui.filterText;
    }
  });

  return (
    <div class={`relative ${props.class || ""}`}>
      <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg
          class="h-4 w-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <input
        ref={inputRef}
        type="text"
        class="bg-zinc-800 border border-gray-700 text-white rounded-lg pl-10 pr-10 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm placeholder-gray-500"
        placeholder={props.placeholder || "Filter events... (Ctrl+F)"}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        aria-label="Filter events"
      />
      {ui.filterText && (
        <button
          class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"
          onClick={() => {
            setUi("filterText", "");
            if (inputRef) {
              inputRef.value = "";
              inputRef.focus();
            }
          }}
          aria-label="Clear filter"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
