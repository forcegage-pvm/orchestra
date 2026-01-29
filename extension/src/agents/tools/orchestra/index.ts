/**
 * Orchestra implementor tools index
 *
 * Barrel exports and registration helper for all implementor tools.
 * Uses MCP handlers via adapter for feature parity with MCP server.
 */

import { handleEscalateTask } from "../../../../../src/mcp-server/handlers/escalate-task.js";
import { handleGetCurrentTask } from "../../../../../src/mcp-server/handlers/get-current-task.js";
import { handleGetFeedback } from "../../../../../src/mcp-server/handlers/get-feedback.js";
import { handleGetProgress } from "../../../../../src/mcp-server/handlers/get-progress.js";
import { handleSignalCompletion } from "../../../../../src/mcp-server/handlers/signal-completion.js";
import { ToolRegistry } from "../../ToolRegistry.js";
import type { ToolContext, ToolDefinition, ToolResult } from "../../types.js";
import { executeMcpHandler } from "./mcpAdapter.js";

// ==================== get_current_task ====================
const getCurrentTaskTool: ToolDefinition = {
  name: "get_current_task",
  description: "Get current task handover (implementor only)",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
  execute: async (_input: unknown, context: ToolContext): Promise<ToolResult> =>
    executeMcpHandler(context.workspaceRoot, handleGetCurrentTask, {}),
};

// ==================== signal_completion ====================
const signalCompletionTool: ToolDefinition = {
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
  execute: async (input: unknown, context: ToolContext): Promise<ToolResult> =>
    executeMcpHandler(context.workspaceRoot, handleSignalCompletion, input),
};

// ==================== get_feedback ====================
const getFeedbackTool: ToolDefinition = {
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
  execute: async (input: unknown, context: ToolContext): Promise<ToolResult> =>
    executeMcpHandler(context.workspaceRoot, handleGetFeedback, input),
};

// ==================== get_progress ====================
const getProgressTool: ToolDefinition = {
  name: "get_progress",
  description: "Get sprint progress summary with task counts",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
  execute: async (_input: unknown, context: ToolContext): Promise<ToolResult> =>
    executeMcpHandler(context.workspaceRoot, handleGetProgress, {}),
};

// ==================== escalate_task ====================
const escalateTaskTool: ToolDefinition = {
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

// ==================== Registration ====================

export const orchestraImplementorTools = [
  getCurrentTaskTool,
  signalCompletionTool,
  getFeedbackTool,
  getProgressTool,
  escalateTaskTool,
] as const;

export function registerOrchestraImplementorTools(
  registry: ToolRegistry,
): void {
  registry.registerAll([...orchestraImplementorTools]);
}

export {
  escalateTaskTool,
  getCurrentTaskTool,
  getFeedbackTool,
  getProgressTool,
  signalCompletionTool,
};
