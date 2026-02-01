/**
 * ToolsFilter Component
 *
 * Filter controls for the Tools View with category dropdown and text search.
 * Allows filtering by tool category (All/Coding/System/Filesystem/Orchestra)
 * and by tool name text.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.6, Task T053
 */

import { Icon } from "@iconify-icon/solid";
import type { ToolCategory } from "../../../agents/sessions/types.js";

export interface ToolsFilterProps {
  /** Current category filter value */
  category: "all" | ToolCategory;
  /** Current text filter value */
  filterText: string;
  /** Callback when category changes */
  onCategoryChange: (category: "all" | ToolCategory) => void;
  /** Callback when filter text changes */
  onFilterTextChange: (text: string) => void;
}

/**
 * ToolsFilter - Filter controls for Tools View
 *
 * Provides two filter mechanisms:
 * 1. Category dropdown: All, Coding, System, Filesystem, Orchestra
 * 2. Text input: Filter by tool name
 *
 * Visual layout:
 * ```
 * [All ▼] [Filter: _______]
 * ```
 *
 * @example
 * ```tsx
 * <ToolsFilter
 *   category={selectedCategory()}
 *   filterText={filterText()}
 *   onCategoryChange={(cat) => setCategory(cat)}
 *   onFilterTextChange={(text) => setFilterText(text)}
 * />
 * ```
 */
export function ToolsFilter(props: ToolsFilterProps) {
  const categories: Array<{ value: "all" | ToolCategory; label: string }> = [
    { value: "all", label: "All" },
    { value: "coding", label: "Coding" },
    { value: "system", label: "System" },
    { value: "filesystem", label: "Filesystem" },
    { value: "orchestra", label: "Orchestra" },
  ];

  return (
    <div class="flex items-center gap-3 p-3 bg-zinc-900 border-b border-gray-700">
      {/* Category Dropdown */}
      <div class="relative">
        <select
          value={props.category}
          onChange={(e) =>
            props.onCategoryChange(
              e.currentTarget.value as "all" | ToolCategory,
            )
          }
          class="appearance-none bg-gray-800 text-gray-200 text-sm rounded px-3 py-2 pr-8 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          aria-label="Filter by category"
        >
          {categories.map((cat) => (
            <option value={cat.value}>{cat.label}</option>
          ))}
        </select>
        <Icon
          icon="lucide:chevron-down"
          class="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
        />
      </div>

      {/* Text Filter Input */}
      <div class="relative flex-1">
        <Icon
          icon="lucide:search"
          class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
        />
        <input
          type="text"
          value={props.filterText}
          onInput={(e) => props.onFilterTextChange(e.currentTarget.value)}
          placeholder="Filter by tool name..."
          class="w-full bg-gray-800 text-gray-200 text-sm rounded pl-10 pr-3 py-2 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Filter by tool name"
        />
        {props.filterText && (
          <button
            onClick={() => props.onFilterTextChange("")}
            class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
            aria-label="Clear filter"
          >
            <Icon icon="lucide:x" class="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
