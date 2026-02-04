/**
 * RoleBadge Component
 *
 * Displays the agent's role with an icon and label.
 * Icons: Bot (Orchestrator), Hammer (Implementor), Search (Controller).
 * Shows an animated spinner when active/running.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.2-3.3
 */

import { Icon } from "@iconify-icon/solid";
import { Show } from "solid-js";
import type { AgentRole } from "../../../agents/sessions/types.js";

export interface RoleBadgeProps {
  /** Agent role type */
  role: AgentRole;
  /** Whether the agent is currently active/running */
  isActive?: boolean;
}

/**
 * RoleBadge - Displays agent role with icon and name
 *
 * Maps each role to a specific Lucide icon and displays the role name.
 * Shows an animated spinner next to the role when active.
 *
 * @example
 * ```tsx
 * <RoleBadge role="orchestrator" isActive={true} />
 * // Renders: 🤖 Orchestrator ⟳ (with spinning loader)
 * ```
 */
export function RoleBadge(props: RoleBadgeProps) {
  const roleConfig = () => {
    switch (props.role) {
      case "orchestrator":
        return {
          icon: "lucide:bot",
          label: "Orchestrator",
        };
      case "implementor":
        return {
          icon: "lucide:hammer",
          label: "Implementor",
        };
      case "controller":
        return {
          icon: "lucide:search",
          label: "Controller",
        };
      default:
        // Fallback for unexpected role values
        return {
          icon: "lucide:help-circle",
          label: props.role ?? "Unknown",
        };
    }
  };

  return (
    <div class="flex items-center gap-2">
      <Icon icon={roleConfig().icon} class="w-5 h-5 text-gray-400" />
      <span class="text-sm font-medium text-gray-200">
        {roleConfig().label}
      </span>
      <Show when={props.isActive}>
        <Icon
          icon="lucide:loader-2"
          class="w-4 h-4 text-green-400 animate-spin"
        />
      </Show>
    </div>
  );
}
