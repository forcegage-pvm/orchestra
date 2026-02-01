/**
 * ToolsView Component
 *
 * Main view displaying filtered and sorted table of tool calls.
 * Composes ToolsFilter, sort dropdown, and ToolsTable. Clicking a row
 * navigates to the corresponding tool call event in the Timeline view.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.6, Task T055
 */

import { Icon } from "@iconify-icon/solid";
import { createMemo, createSignal } from "solid-js";
import type {
    ToolCallAggregate,
    ToolCategory,
} from "../../../agents/sessions/types.js";
import { ToolsFilter, ToolsTable } from "../components/index.js";
import { toolCalls } from "../stores/sessionStore.js";
import { setUi } from "../stores/uiStore.js";

/**
 * Sort option type
 */
type SortOption = "time" | "duration" | "name";

/**
 * ToolsView - Filterable, sortable table of tool calls
 *
 * Provides comprehensive view of all tool calls in the session:
 * - Category filter (All/Coding/System/Filesystem/Orchestra)
 * - Text filter by tool name
 * - Sort by Time/Duration/Name
 * - Virtual scrolling table
 * - Click row to navigate to tool call in Timeline
 *
 * Visual layout:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ [All ▼] [Filter: _______] [Sort: Time ▼]                       │
 * ├────────┬──────────────┬──────────┬────────┬─────────────────────┤
 * │ Status │ Tool         │ Duration │ Files  │ Summary             │
 * ├────────┼──────────────┼──────────┼────────┼─────────────────────┤
 * │   ✓    │ read_file    │    45ms  │   1    │ src/auth/auth.ts    │
 * │   ✓    │ edit_lines   │   123ms  │   1    │ +15 -3 lines        │
 * │   ✗    │ run_tests    │  2,341ms │   0    │ 2 tests failed      │
 * └────────┴──────────────┴──────────┴────────┴─────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <ToolsView />
 * ```
 */
export function ToolsView() {
  // Local filter and sort state
  const [category, setCategory] = createSignal<"all" | ToolCategory>("all");
  const [filterText, setFilterText] = createSignal("");
  const [sortBy, setSortBy] = createSignal<SortOption>("time");

  /**
   * Convert toolCalls record to array and apply filters
   */
  const filteredAndSortedTools = createMemo(() => {
    // Convert record to array
    const toolArray = Object.values(toolCalls);

    // Apply category filter
    let filtered = toolArray;
    if (category() !== "all") {
      filtered = filtered.filter((tool) => tool.toolCategory === category());
    }

    // Apply text filter
    const searchText = filterText().toLowerCase();
    if (searchText) {
      filtered = filtered.filter((tool) =>
        tool.toolName.toLowerCase().includes(searchText),
      );
    }

    // Apply sort
    const sorted = [...filtered];
    switch (sortBy()) {
      case "time":
        // Sort by timestamp (earliest first)
        sorted.sort((a, b) => {
          const timeA = new Date(a.startedAt).getTime();
          const timeB = new Date(b.startedAt).getTime();
          return timeA - timeB;
        });
        break;
      case "duration":
        // Sort by duration (longest first)
        sorted.sort((a, b) => {
          const durationA = a.durationMs ?? 0;
          const durationB = b.durationMs ?? 0;
          return durationB - durationA;
        });
        break;
      case "name":
        // Sort by tool name (alphabetical)
        sorted.sort((a, b) => a.toolName.localeCompare(b.toolName));
        break;
    }

    return sorted;
  });

  /**
   * Handle row click - navigate to tool call event in Timeline
   */
  const handleRowClick = (toolCall: ToolCallAggregate) => {
    // Switch to timeline tab
    setUi("activeTab", "timeline");

    // Post message to extension to scroll to the tool call event
    // The extension will handle finding the event by toolCallId and scrolling
    window.postMessage(
      {
        type: "scrollToEvent",
        eventId: toolCall.events[0]?.id, // Use first event (tool_call event)
        toolCallId: toolCall.toolCallId,
      },
      "*",
    );
  };

  return (
    <div class="flex flex-col h-full">
      {/* Filter and Sort Controls */}
      <div class="flex items-center gap-3 bg-zinc-900 border-b border-gray-700">
        <ToolsFilter
          category={category()}
          filterText={filterText()}
          onCategoryChange={setCategory}
          onFilterTextChange={setFilterText}
        />

        {/* Sort Dropdown */}
        <div class="relative pr-3">
          <select
            value={sortBy()}
            onChange={(e) => setSortBy(e.currentTarget.value as SortOption)}
            class="appearance-none bg-gray-800 text-gray-200 text-sm rounded px-3 py-2 pr-8 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            aria-label="Sort by"
          >
            <option value="time">Sort: Time</option>
            <option value="duration">Sort: Duration</option>
            <option value="name">Sort: Name</option>
          </select>
          <Icon
            icon="lucide:chevron-down"
            class="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          />
        </div>
      </div>

      {/* Tools Table */}
      <div class="flex-1 overflow-hidden">
        <ToolsTable
          toolCalls={filteredAndSortedTools()}
          onRowClick={handleRowClick}
          height={600} // Fixed height for virtual scrolling
        />
      </div>
    </div>
  );
}
