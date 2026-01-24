/**
 * getProgress tool - Fetch sprint progress summary
 */

import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";
import {
  getCurrentSprint,
  getTasksForSprint,
} from "../../../database/queries.js";

export const getProgressTool: AgentTool = {
  name: "get_progress",
  description: "Get sprint progress summary for the active sprint.",
  inputSchema: {
    type: "object",
    properties: {},
  },
  execute: async (
    _input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    try {
      const sprint = getCurrentSprint(context.workspaceRoot);
      if (!sprint) {
        return {
          success: false,
          output: "",
          error: "No active sprint found.",
        };
      }

      const tasks = getTasksForSprint(context.workspaceRoot, sprint.id);
      const total = tasks.length;
      const completed = tasks.filter(
        (task) => task.status === "COMPLETE",
      ).length;
      const pending = tasks.filter((task) => task.status === "PENDING").length;
      const inProgress = total - completed - pending;

      const byStatus = tasks.reduce<Record<string, number>>((acc, task) => {
        acc[task.status] = (acc[task.status] ?? 0) + 1;
        return acc;
      }, {});

      const payload = {
        sprint_id: sprint.id,
        sprint_name: sprint.name,
        total,
        completed,
        pending,
        in_progress: inProgress,
        by_status: byStatus,
      };

      return {
        success: true,
        output: JSON.stringify(payload),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        output: "",
        error: `Failed to get progress: ${message}`,
      };
    }
  },
};
