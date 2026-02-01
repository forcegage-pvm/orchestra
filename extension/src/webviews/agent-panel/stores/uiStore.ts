/**
 * UI Store
 *
 * Manages UI-specific state for the Agent Panel webview.
 * Handles tab navigation, filters, scroll positions, and display preferences.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 8.1
 */

import { createStore } from "solid-js/store";

/**
 * Tab identifier type
 */
export type TabId = "timeline" | "tools" | "files" | "errors";

/**
 * Display verbosity level type
 */
export type VerbosityLevel = "minimal" | "normal" | "verbose" | "debug";

/**
 * UI state shape
 */
export interface UiState {
  activeTab: TabId;
  expandedEvents: Set<string>;
  filterText: string;
  verbosity: VerbosityLevel;
  autoScroll: boolean;
  scrollPositions: Record<string, number>;
}

/**
 * UI state store with display and interaction state
 */
export const [ui, setUi] = createStore<UiState>({
  activeTab: "timeline",
  expandedEvents: new Set(),
  filterText: "",
  verbosity: "normal",
  autoScroll: true,
  scrollPositions: {},
});
