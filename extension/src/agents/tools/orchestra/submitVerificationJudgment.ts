/**
 * submitVerificationJudgment tool - Record verification judgment and feedback
 */

import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";
import {
  getCurrentSprint,
  getSignal,
  getTaskById,
  getTasksForSprint,
} from "../../../database/queries.js";
import {
  createFeedback,
  createVerificationJudgment,
  updateTaskStatus,
} from "../../../database/mutations.js";

interface FailureIssue {
  check_id: string;
  severity?: string;
  reason?: string;
  guidance?: string;
}

interface SubmitVerificationJudgmentInput {
  task_id: number;
  judgment: "PASS" | "FAIL";
  rationale: string;
  failures?: FailureIssue[];
  manual_review?: boolean;
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

export const submitVerificationJudgmentTool: AgentTool = {
  name: "submit_verification_judgment",
  description: "Submit PASS/FAIL judgment for verification checks.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "number", description: "Task ID" },
      judgment: { type: "string", enum: ["PASS", "FAIL"] },
      rationale: { type: "string", description: "Judgment rationale" },
      failures: { type: "array", description: "Failure details" },
      manual_review: { type: "boolean", description: "Manual review flag" },
    },
    required: ["task_id", "judgment", "rationale"],
  },
  execute: async (
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    try {
      const parsed = input as SubmitVerificationJudgmentInput;
      const resolved = resolveTaskId(context.workspaceRoot, parsed.task_id);

      if (!resolved) {
        return {
          success: false,
          output: "",
          error: `Task ${parsed.task_id} not found.`,
        };
      }

      const signal = getSignal(context.workspaceRoot, resolved.id);
      const judgmentId = createVerificationJudgment(
        context.workspaceRoot,
        resolved.id,
        {
          judgment: parsed.judgment,
          rationale: parsed.rationale,
          failures: parsed.failures,
          manualReview: parsed.manual_review,
          signalId: signal?.signal_id,
        },
      );

      const shouldUpdateStatus = !parsed.manual_review;
      if (parsed.judgment === "FAIL") {
        createFeedback(context.workspaceRoot, resolved.id, {
          issues: parsed.failures ?? [],
          passedChecks: [],
          nextSteps: parsed.rationale,
          additionalGuidance: null,
        });

        if (shouldUpdateStatus) {
          updateTaskStatus(
            context.workspaceRoot,
            resolved.id,
            "VERIFY_FAILED",
            "Verification failed",
          );
        }
      } else if (shouldUpdateStatus) {
        updateTaskStatus(
          context.workspaceRoot,
          resolved.id,
          "COMPLETE",
          "Verification passed",
        );
      }

      return {
        success: true,
        output: JSON.stringify({
          task_id: resolved.task_id,
          task_internal_id: resolved.id,
          judgment_id: judgmentId,
          judgment: parsed.judgment,
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        output: "",
        error: `Failed to submit verification judgment: ${message}`,
      };
    }
  },
};
