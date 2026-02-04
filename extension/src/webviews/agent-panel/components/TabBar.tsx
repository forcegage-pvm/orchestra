/**
 * TabBar Component
 *
 * Navigation bar with four tabs: Timeline, Tools, Files, Errors.
 * Shows badge counts on tabs and highlights active tab.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.4
 */

import { Icon } from "@iconify-icon/solid";
import { session } from "../stores/sessionStore.js";
import { setUi, ui, type TabId } from "../stores/uiStore.js";

/**
 * Tab configuration type
 */
interface TabConfig {
  id: TabId;
  label: string;
  icon: string;
  getBadgeCount: () => number | null;
}

/**
 * Tab configurations with icons and badge count sources
 */
const tabs: TabConfig[] = [
  {
    id: "timeline",
    label: "Timeline",
    icon: "lucide:clock",
    getBadgeCount: () => null, // No badge for Timeline
  },
  {
    id: "tools",
    label: "Tools",
    icon: "lucide:wrench",
    getBadgeCount: () => session?.toolCallCount ?? 0,
  },
  {
    id: "files",
    label: "Files",
    icon: "lucide:file-text",
    getBadgeCount: () => session?.filesModified?.length ?? 0,
  },
  {
    id: "errors",
    label: "Errors",
    icon: "lucide:alert-circle",
    getBadgeCount: () => session?.warningCount ?? 0,
  },
];

/**
 * TabBar - Navigation tabs for Agent Panel views
 *
 * Four-tab layout with icons and optional badge counts:
 * - Timeline (no badge)
 * - Tools (shows toolCallCount)
 * - Files (shows filesModified.length)
 * - Errors (shows warningCount)
 *
 * Visual layout:
 * ```
 * ┌────────────┬─────────────┬───────────────┬──────────────┐
 * │  Timeline  │  Tools (12) │  Files (4)    │  Errors (2)  │
 * └────────────┴─────────────┴───────────────┴──────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <TabBar />
 * ```
 */
export function TabBar() {
  const handleTabClick = (tabId: TabId) => {
    setUi("activeTab", tabId);
  };

  return (
    <div class="flex border-b border-gray-700 bg-zinc-900">
      {tabs.map((tab) => {
        const isActive = () => ui.activeTab === tab.id;
        const badgeCount = () => {
          const count = tab.getBadgeCount();
          return count !== null && count > 0 ? count : null;
        };

        return (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            class={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              isActive()
                ? "border-blue-500 text-white bg-gray-900/50"
                : "border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
            }`}
            aria-current={isActive() ? "page" : undefined}
            role="tab"
            aria-selected={isActive()}
          >
            <Icon icon={tab.icon} class="w-4 h-4" />
            <span class="text-sm font-medium">{tab.label}</span>
            {badgeCount() !== null && (
              <span class="bg-gray-600 text-gray-200 text-xs rounded-full px-2 py-0.5 min-w-[1.5rem] text-center">
                {badgeCount()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
