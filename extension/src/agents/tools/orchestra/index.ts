/**
 * Orchestra implementor tools index
 *
 * Barrel exports and registration helper for all implementor tools.
 * Uses MCP handlers via adapter for feature parity with MCP server.
 */

import { handleFixCodeReview } from "../../../../../src/mcp-server/handlers/fix-code-review.js";
import { handleGetCurrentTask } from "../../../../../src/mcp-server/handlers/get-current-task.js";
import { handleGetFeedback } from "../../../../../src/mcp-server/handlers/get-feedback.js";
import { handleGetProgress } from "../../../../../src/mcp-server/handlers/get-progress.js";
import { handleSignalCompletion } from "../../../../../src/mcp-server/handlers/signal-completion.js";
import { ToolRegistry } from "../../ToolRegistry.js";
import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import { escalateTaskTool } from "./escalateTask.js";
import { executeMcpHandler } from "./mcpAdapter.js";

// ==================== get_current_task ====================
const getCurrentTaskTool: AgentTool = {
  name: "get_current_task",
  description: "Get current task handover (implementor only)",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
  invoke: async (
    _input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "get_current_task", handleGetCurrentTask, {}),
};

// ==================== signal_completion ====================
const signalCompletionTool: AgentTool = {
  name: "signal_completion",
  description: "Signal task completion with artifacts (runs pre-signal checks)",
  inputSchema: {
    type: "object" as const,
    properties: {
      task_id: {
        type: "number",
        description: "The task ID",
      },
      summary: {
        type: "string",
        description: "Summary of work completed (min 10 chars)",
      },
      artifacts_created: {
        type: "array",
        description: "List of artifacts created/modified",
        items: {
          type: "object",
          properties: {
            path: { type: "string" },
            type: { type: "string", enum: ["CREATE", "UPDATE", "DELETE"] },
            description: { type: "string" },
          },
          required: ["path", "type", "description"],
        },
      },
      build_status: {
        type: "string",
        enum: ["PASS", "FAIL"],
        description: "Build status",
      },
      test_status: {
        type: "string",
        enum: ["PASS", "FAIL"],
        description: "Test status",
      },
      notes: {
        type: "string",
        description: "Optional notes",
      },
    },
    required: [
      "task_id",
      "summary",
      "artifacts_created",
      "build_status",
      "test_status",
    ],
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(
      context,
      "signal_completion",
      handleSignalCompletion,
      input,
    ),
};

// ==================== get_feedback ====================
const getFeedbackTool: AgentTool = {
  name: "get_feedback",
  description: "Get verification failure feedback for a task attempt",
  inputSchema: {
    type: "object" as const,
    properties: {
      task_id: {
        type: "number",
        description: "The task ID",
      },
      attempt: {
        type: "number",
        description: "The attempt number",
      },
    },
    required: ["task_id"],
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "get_feedback", handleGetFeedback, input),
};

// ==================== get_progress ====================
const getProgressTool: AgentTool = {
  name: "get_progress",
  description: "Get sprint progress summary with task counts",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
  invoke: async (
    _input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "get_progress", handleGetProgress, {}),
};

// ==================== fix_code_review ====================
const fixCodeReviewTool: AgentTool = {
  name: "fix_code_review",
  description:
    "Resolve code review issues and submit fixes for verification (implementor). Actions: GET_ISSUES, RESOLVE_ISSUE, SUBMIT_FIXES",
  inputSchema: {
    type: "object" as const,
    properties: {
      action: {
        type: "string",
        enum: ["GET_ISSUES", "RESOLVE_ISSUE", "SUBMIT_FIXES"],
        description:
          "Action to perform: GET_ISSUES (list open issues), RESOLVE_ISSUE (mark issue as fixed), SUBMIT_FIXES (submit all fixes for re-review)",
      },
      issue_id: {
        type: "number",
        description: "Issue ID to resolve (required for RESOLVE_ISSUE)",
      },
      fix_summary: {
        type: "string",
        description:
          "Summary of how the issue was fixed (required for RESOLVE_ISSUE, min 10 chars)",
      },
      summary: {
        type: "string",
        description:
          "Summary of all fixes made (required for SUBMIT_FIXES, min 10 chars)",
      },
      files_changed: {
        type: "array",
        items: { type: "string" },
        description: "List of files changed (optional for SUBMIT_FIXES)",
      },
      tests_run: {
        type: "array",
        items: { type: "string" },
        description: "List of tests run (optional for SUBMIT_FIXES)",
      },
      notes: {
        type: "string",
        description: "Optional notes (for SUBMIT_FIXES)",
      },
    },
    required: ["action"],
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "fix_code_review", handleFixCodeReview, input),
};

// ==================== Registration ====================

export const orchestraImplementorTools = [
  getCurrentTaskTool,
  signalCompletionTool,
  getFeedbackTool,
  getProgressTool,
  escalateTaskTool,
  fixCodeReviewTool,
] as const;

export function registerOrchestraImplementorTools(
  registry: ToolRegistry,
): void {
  registry.registerAll([...orchestraImplementorTools]);
}

export {
  escalateTaskTool,
  fixCodeReviewTool,
  getCurrentTaskTool,
  getFeedbackTool,
  getProgressTool,
  signalCompletionTool,
};
