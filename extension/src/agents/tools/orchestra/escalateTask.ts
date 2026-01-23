/**
 * escalateTask tool - Escalate blocked task to human supervisor
 */

import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";
import { createEscalation } from "../../../database/mutations.js";
import { getCurrentTask } from "../../../database/queries.js";

interface EscalateTaskInput {
  reason: string;
  attempts_summary: string;
  recommended_action?: string;
  recommended_target_status?: string;
  early_escalation_reason?: string;
}

export const escalateTaskTool: AgentTool = {
  name: "escalate_task",
  description: "Escalate the current task to the human supervisor.",
  inputSchema: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Reason for escalation",
      },
      attempts_summary: {
        type: "string",
        description: "Summary of attempts made",
      },
      recommended_action: {
        type: "string",
        description: "Optional recommended action for supervisor",
      },
      recommended_target_status: {
        type: "string",
        description: "Optional recommended target status",
      },
      early_escalation_reason: {
        type: "string",
        description: "Required when retry_count is 0",
      },
    },
    required: ["reason", "attempts_summary"],
  },
  execute: async (
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    try {
      const parsed = input as EscalateTaskInput;
      const currentTask = getCurrentTask(context.workspaceRoot);

      if (!currentTask) {
        return {
          success: false,
          output: "",
          error: "No current task found to escalate.",
        };
      }

      if (
        currentTask.retry_count === 0 &&
        parsed.early_escalation_reason === undefined
      ) {
        return {
          success: false,
          output: "",
          error:
            "Early escalation reason is required when retry_count is 0.",
        };
      }

      const escalationInput: {
        reason: string;
        attemptsSummary: string;
        recommendedAction?: string;
        recommendedTargetStatus?: string;
        earlyEscalationReason?: string;
      } = {
        reason: parsed.reason,
        attemptsSummary: parsed.attempts_summary,
      };

      if (parsed.recommended_action !== undefined) {
        escalationInput.recommendedAction = parsed.recommended_action;
      }

      if (parsed.recommended_target_status !== undefined) {
        escalationInput.recommendedTargetStatus = parsed.recommended_target_status;
      }

      if (parsed.early_escalation_reason !== undefined) {
        escalationInput.earlyEscalationReason = parsed.early_escalation_reason;
      }

      const escalationId = createEscalation(
        context.workspaceRoot,
        currentTask.id,
        escalationInput,
      );

      return {
        success: true,
        output: JSON.stringify({
          escalation_id: escalationId,
          task_id: currentTask.task_id,
          status: "ESCALATED",
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        output: "",
        error: `Failed to escalate task: ${message}`,
      };
    }
  },
};
