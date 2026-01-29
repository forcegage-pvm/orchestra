/**
 * escalateTask tool - Wrapper around MCP handler for escalate_task
 */

import { handleEscalateTask } from "../../../../../src/mcp-server/handlers/escalate-task.js";
import type { ToolContext, ToolDefinition, ToolResult } from "../../types.js";
import { executeMcpHandler } from "./mcpAdapter.js";

export const escalateTaskTool: ToolDefinition = {
  name: "escalate_task",
  description: "Escalate stuck task to human supervisor",
  inputSchema: {
    type: "object" as const,
    properties: {
      task_id: {
        type: "number",
        description: "The task ID to escalate",
      },
      reason: {
        type: "string",
        description: "Reason for escalation (min 10 chars)",
      },
      attempts_summary: {
        type: "string",
        description: "Summary of attempts made (min 10 chars)",
      },
      recommended_action: {
        type: "string",
        description: "Optional recommended action",
      },
      early_escalation_reason: {
        type: "string",
        description:
          "Required when retry_count=0. Justify why immediate escalation is needed (e.g., external blocker, access issue). Min 10 chars.",
      },
    },
    required: ["task_id", "reason", "attempts_summary"],
  },
  execute: async (input: unknown, context: ToolContext): Promise<ToolResult> =>
    executeMcpHandler(context.workspaceRoot, handleEscalateTask, input),
};
