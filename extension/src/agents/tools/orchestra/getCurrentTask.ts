/**
 * getCurrentTask tool - Fetch current task handover from local database
 */

import { getCurrentTask as getCurrentTaskQuery } from "../../../database/queries.js";
import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";

interface ParsedHandoverField {
  raw: string | null;
  parsed: unknown | null;
}

function parseJsonField(value: string | null): ParsedHandoverField {
  if (value === null) {
    return { raw: null, parsed: null };
  }

  try {
    return { raw: value, parsed: JSON.parse(value) };
  } catch {
    return { raw: value, parsed: value };
  }
}

export const getCurrentTaskTool: AgentTool = {
  name: "get_current_task",
  description: "Get the current task handover from the local database.",
  inputSchema: {
    type: "object",
    properties: {},
  },
  execute: async (
    _input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    try {
      const currentTask = getCurrentTaskQuery(context.workspaceRoot);
      if (!currentTask) {
        return {
          success: false,
          output: "",
          error: "No current task found for the active sprint.",
        };
      }

      const handover = currentTask.handover;

      const acceptanceCriteria = parseJsonField(handover.acceptance_criteria);
      const fileOperations = parseJsonField(handover.file_operations);
      const deliverables = parseJsonField(handover.deliverables);
      const contextFiles = parseJsonField(handover.context_files ?? null);

      const payload = {
        task_id: currentTask.task_id,
        task_db_id: currentTask.id,
        title: currentTask.title,
        status: currentTask.status,
        priority: handover.priority,
        context: handover.context ?? null,
        context_files: contextFiles.parsed ?? contextFiles.raw,
        acceptance_criteria:
          acceptanceCriteria.parsed ?? acceptanceCriteria.raw,
        file_operations: fileOperations.parsed ?? fileOperations.raw,
        deliverables: deliverables.parsed ?? deliverables.raw,
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
        error: `Failed to get current task for ${context.workspaceRoot}: ${message}`,
      };
    }
  },
};
