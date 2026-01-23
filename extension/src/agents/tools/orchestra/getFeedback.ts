/**
 * getFeedback tool - Fetch latest verification feedback for current task
 */

import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";
import { getCurrentTask, getFeedback } from "../../../database/queries.js";

interface ParsedFeedbackField {
  raw: string | null;
  parsed: unknown | null;
}

function parseJsonField(value: string | null): ParsedFeedbackField {
  if (value === null) {
    return { raw: null, parsed: null };
  }

  try {
    return { raw: value, parsed: JSON.parse(value) };
  } catch {
    return { raw: value, parsed: value };
  }
}

export const getFeedbackTool: AgentTool = {
  name: "get_feedback",
  description: "Get latest verification feedback for the current task.",
  inputSchema: {
    type: "object",
    properties: {},
  },
  execute: async (_input: unknown, context: ToolContext): Promise<ToolResult> => {
    try {
      const currentTask = getCurrentTask(context.workspaceRoot);
      if (!currentTask) {
        return {
          success: false,
          output: "",
          error: "No current task found to fetch feedback.",
        };
      }

      const feedback = getFeedback(context.workspaceRoot, currentTask.id);
      if (!feedback) {
        return {
          success: false,
          output: "",
          error: "No feedback found for current task.",
        };
      }

      const issues = parseJsonField(feedback.issues);
      const passedChecks = parseJsonField(feedback.passed_checks);
      const nextSteps = parseJsonField(feedback.next_steps);
      const additionalGuidance = parseJsonField(feedback.additional_guidance);

      const payload = {
        task_id: currentTask.task_id,
        task_db_id: currentTask.id,
        attempt: feedback.attempt,
        max_attempts: feedback.max_attempts,
        can_retry: feedback.can_retry,
        issues: issues.parsed ?? issues.raw,
        passed_checks: passedChecks.parsed ?? passedChecks.raw,
        next_steps: nextSteps.parsed ?? nextSteps.raw,
        additional_guidance:
          additionalGuidance.parsed ?? additionalGuidance.raw,
        created_at: feedback.created_at,
        updated_at: feedback.updated_at,
      };

      return {
        success: true,
        output: JSON.stringify(payload),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        output: "",
        error: `Failed to get feedback: ${message}`,
      };
    }
  },
};