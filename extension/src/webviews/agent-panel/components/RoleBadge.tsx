/**
 * RoleBadge Component
 *
 * Displays the agent's role with an icon and label.
 * Icons: Bot (Orchestrator), Hammer (Implementor), Search (Controller).
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.2-3.3
 */

import { Icon } from "@iconify-icon/solid";
import type { AgentRole } from "../../../agents/sessions/types.js";

export interface RoleBadgeProps {
  /** Agent role type */
  role: AgentRole;
}

/**
 * RoleBadge - Displays agent role with icon and name
 *
 * Maps each role to a specific Lucide icon and displays the role name.
 *
 * @example
 * ```tsx
 * <RoleBadge role="orchestrator" />
 * // Renders: 🤖 Orchestrator
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
    }
  };

  return (
    <div class="flex items-center gap-2">
      <Icon icon={roleConfig().icon} class="w-5 h-5 text-gray-400" />
      <span class="text-sm font-medium text-gray-200">
        {roleConfig().label}
      </span>
    </div>
  );
}
