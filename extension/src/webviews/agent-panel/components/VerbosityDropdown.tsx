/**
 * VerbosityDropdown Component
 *
 * Dropdown selector for timeline verbosity level.
 * Binds to uiStore verbosity and emits set_verbosity messages.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 4.3
 */

import { For } from "solid-js";
import type { VerbosityLevel } from "../stores/uiStore.js";
import { setUi, ui } from "../stores/uiStore.js";

export interface VerbosityDropdownProps {
  /** Optional label for accessibility */
  label?: string;
}

export interface VerbosityOption {
  value: VerbosityLevel;
  label: string;
}

export const verbosityOptions: VerbosityOption[] = [
  { value: "minimal", label: "Minimal" },
  { value: "normal", label: "Normal" },
  { value: "verbose", label: "Verbose" },
  { value: "debug", label: "Debug" },
];

/**
 * VerbosityDropdown - Selector for timeline verbosity
 */
export function VerbosityDropdown(props: VerbosityDropdownProps) {
  const handleChange = (event: Event) => {
    const target = event.target as HTMLSelectElement;
    const level = target.value as VerbosityLevel;

    if (level && level !== ui.verbosity) {
      setUi("verbosity", level);
      window.vscode.postMessage({
        type: "set_verbosity",
        level,
      });
    }
  };

  return (
    <div class="flex items-center gap-2">
      <select
        aria-label={props.label ?? "Verbosity"}
        class="bg-gray-800 text-gray-200 text-sm px-2 py-1 rounded border border-gray-700 focus:outline-none focus:border-blue-500 cursor-pointer"
        value={ui.verbosity}
        onChange={handleChange}
      >
        <For each={verbosityOptions}>
          {(option) => <option value={option.value}>{option.label}</option>}
        </For>
      </select>
    </div>
  );
}
