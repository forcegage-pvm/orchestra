/**
 * prepareTask tool - Create task handover and move task into IMPLEMENT
 */

import {
  createHandover,
  updateTaskStatus,
} from "../../../database/mutations.js";
import {
  getCurrentSprint,
  getTaskById,
  getTasksForSprint,
} from "../../../database/queries.js";
import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";

interface PrepareTaskInput {
  task_id: number;
  priority: string;
  context: string;
  context_files?: string[];
  acceptance_criteria: Array<{ criterion: string; verification: string }>;
  file_operations: Array<{
    operation: string;
    path: string;
    description?: string;
  }>;
  deliverables: string[];
}

function resolveTaskId(
  workspaceRoot: string,
  taskId: number,
): { id: number; task_id: number } | null {
  const taskById = getTaskById(workspaceRoot, taskId);
  if (taskById) {
    return { id: taskById.id, task_id: taskById.task_id };
  }

  const sprint = getCurrentSprint(workspaceRoot);
  if (!sprint) {
    return null;
  }

  const tasks = getTasksForSprint(workspaceRoot, sprint.id);
  const match = tasks.find((task) => task.task_id === taskId);
  return match ? { id: match.id, task_id: match.task_id } : null;
}

export const prepareTaskTool: AgentTool = {
  name: "prepare_task",
  description:
    "Prepare a task by creating a handover and setting status to IMPLEMENT.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "number", description: "Task ID" },
      priority: { type: "string", description: "Task priority" },
      context: { type: "string", description: "Task context" },
      context_files: {
        type: "array",
        description: "List of context files",
        items: { type: "string" },
      },
      acceptance_criteria: {
        type: "array",
        description: "Acceptance criteria list",
        items: {
          type: "object",
          properties: {
            criterion: {
              type: "string",
              description: "The acceptance criterion",
            },
            verification: {
              type: "string",
              description: "How to verify this criterion",
            },
          },
          required: ["criterion", "verification"],
        },
      },
      file_operations: {
        type: "array",
        description: "File operations list",
        items: {
          type: "object",
          properties: {
            operation: {
              type: "string",
              enum: ["CREATE", "UPDATE", "DELETE"],
              description: "Operation type",
            },
            path: { type: "string", description: "File path" },
            description: {
              type: "string",
              description: "Description of the operation",
            },
          },
          required: ["operation", "path"],
        },
      },
      deliverables: {
        type: "array",
        description: "Deliverables list",
        items: { type: "string" },
      },
    },
    required: [
      "task_id",
      "priority",
      "context",
      "acceptance_criteria",
      "file_operations",
      "deliverables",
    ],
  },
  execute: async (
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    try {
      const parsed = input as PrepareTaskInput;
      const resolved = resolveTaskId(context.workspaceRoot, parsed.task_id);

      if (!resolved) {
        return {
          success: false,
          output: "",
          error: `Task ${parsed.task_id} not found.`,
        };
      }

      const handoverId = createHandover(context.workspaceRoot, resolved.id, {
        priority: parsed.priority,
        context: parsed.context,
        contextFiles: parsed.context_files,
        acceptanceCriteria: parsed.acceptance_criteria,
        fileOperations: parsed.file_operations,
        deliverables: parsed.deliverables,
      });

      updateTaskStatus(
        context.workspaceRoot,
        resolved.id,
        "IMPLEMENT",
        "Task prepared by orchestrator",
      );

      return {
        success: true,
        output: JSON.stringify({
          task_id: resolved.task_id,
          task_internal_id: resolved.id,
          handover_id: handoverId,
          status: "IMPLEMENT",
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        output: "",
        error: `Failed to prepare task: ${message}`,
      };
    }
  },
};
