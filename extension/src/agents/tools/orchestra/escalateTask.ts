/**
 * escalateTask tool - Wrapper around MCP handler for escalate_task
 */

import { handleEscalateTask } from "../../../../../src/mcp-server/handlers/escalate-task.js";
import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import { executeMcpHandler } from "./mcpAdapter.js";

export const escalateTaskTool: AgentTool = {
  name: "escalate_task",
  description:
    "Escalate stuck task to human supervisor. IMPORTANT: After calling this tool, you MUST call wait_for_input to pause your session and wait for the human to de-escalate. Do NOT end your turn without calling wait_for_input or your session will end.",
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
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "escalate_task", handleEscalateTask, input),
};
