/**
 * submitVerificationJudgment tool - Wrapper around MCP handler for submit_verification_judgment
 *
 * This reuses the full MCP server implementation to ensure feature parity.
 */

import { handleSubmitVerificationJudgment } from "../../../../../src/mcp-server/handlers/submit-verification-judgment.js";
import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import { executeMcpHandler } from "./mcpAdapter.js";

export const submitVerificationJudgmentTool: AgentTool = {
  name: "submit_verification_judgment",
  description:
    "Submit verification judgment (PASS or FAIL) with feedback. " +
    "Requires manual review evidence proving you actually read the implementation code.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "number", description: "The task ID" },
      judgment: {
        type: "string",
        enum: ["PASS", "FAIL"],
        description: "The verification judgment",
      },
      rationale: {
        type: "string",
        description:
          "Rationale for the judgment - explain your decision (min 50 chars)",
      },
      manual_review: {
        type: "object",
        description:
          "REQUIRED: Evidence that you actually reviewed the implementation code",
        properties: {
          files_reviewed: {
            type: "array",
            description: "File paths you actually read and reviewed",
            items: { type: "string" },
          },
          observations: {
            type: "string",
            description:
              "What you observed in the code - specific details proving you read it (min 100 chars)",
          },
          quality_assessment: {
            type: "string",
            description:
              "Your assessment of code quality, patterns used, potential issues (min 50 chars)",
          },
        },
        required: ["files_reviewed", "observations", "quality_assessment"],
      },
      failures: {
        type: "array",
        description: "List of failures (required if judgment is FAIL)",
        items: {
          type: "object",
          properties: {
            check_id: { type: "string" },
            reason: { type: "string" },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            guidance: { type: "string" },
          },
          required: ["check_id", "reason", "priority", "guidance"],
        },
      },
      feedback: {
        type: "string",
        description: "Optional feedback message",
      },
    },
    required: ["task_id", "judgment", "rationale", "manual_review"],
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => {
    return executeMcpHandler(
      context,
      "submit_verification_judgment",
      handleSubmitVerificationJudgment,
      input,
    );
  },
};
