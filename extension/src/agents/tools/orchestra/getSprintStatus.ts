/**
 * getSprintStatus tool - Fetch sprint status summary for orchestrator
 */

import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";
import {
  getCurrentSprint,
  getPhases,
  getTasksForSprint,
} from "../../../database/queries.js";

const ACTIVE_TASK_STATUSES = new Set(["IMPLEMENT", "GATE_CHECK", "VERIFY"]);

function getPhaseStatus(taskStatuses: string[]): "PENDING" | "ACTIVE" | "COMPLETED" {
  if (taskStatuses.length === 0) {
    return "PENDING";
  }

  if (taskStatuses.every((status) => status === "COMPLETE")) {
    return "COMPLETED";
  }

  if (taskStatuses.some((status) => ACTIVE_TASK_STATUSES.has(status))) {
    return "ACTIVE";
  }

  return "PENDING";
}

export const getSprintStatusTool: AgentTool = {
  name: "get_sprint_status",
  description: "Get status summary for the active sprint.",
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
      const phases = getPhases(context.workspaceRoot, sprint.id);

      const total = tasks.length;
      const completed = tasks.filter((task) => task.status === "COMPLETE").length;
      const pending = tasks.filter((task) => task.status === "PENDING").length;
      const inProgress = total - completed - pending;

      const activeTask = tasks.find((task) =>
        ACTIVE_TASK_STATUSES.has(task.status),
      );

      const phaseSummaries = phases.map((phase) => {
        const phaseTasks = tasks.filter((task) => task.phase_id === phase.id);
        const phaseStatus = getPhaseStatus(
          phaseTasks.map((task) => task.status),
        );

        return {
          phase_id: phase.phase_id,
          phase_name: phase.phase_name,
          status: phaseStatus,
          task_count: phaseTasks.length,
        };
      });

      const payload = {
        sprint_id: sprint.id,
        sprint_name: sprint.name,
        status: sprint.status,
        workflow_step: sprint.workflow_step,
        summary: {
          total,
          completed,
          pending,
          in_progress: inProgress,
        },
        phases: phaseSummaries,
        active_task: activeTask
          ? {
              id: activeTask.id,
              task_id: activeTask.task_id,
              title: activeTask.title,
              status: activeTask.status,
            }
          : null,
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
        error: `Failed to get sprint status: ${message}`,
      };
    }
  },
};
