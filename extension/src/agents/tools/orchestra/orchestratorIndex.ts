/**
 * Orchestra orchestrator tools index
 *
 * Barrel exports and registration helper for all orchestrator tools.
 * Uses MCP handlers via adapter for feature parity with MCP server.
 */

import { handleCompleteTask } from "../../../../../src/mcp-server/handlers/complete-task.js";
import { handleGetSignal } from "../../../../../src/mcp-server/handlers/get-signal.js";
import { handleGetTaskHistory } from "../../../../../src/mcp-server/handlers/get-task-history.js";
import { handleGetTask } from "../../../../../src/mcp-server/handlers/get-task.js";
import { handleGetTasks } from "../../../../../src/mcp-server/handlers/get-tasks.js";
import { handleGetVerificationResults } from "../../../../../src/mcp-server/handlers/get-verification-results.js";
import { ToolRegistry } from "../../ToolRegistry.js";
import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import { getSprintStatusTool } from "./getSprintStatus.js";
import { executeMcpHandler } from "./mcpAdapter.js";
import { prepareTaskTool } from "./prepareTask.js";
import { runVerificationChecksTool } from "./runVerificationChecks.js";
import { submitVerificationJudgmentTool } from "./submitVerificationJudgment.js";

// ==================== get_signal (shared) ====================
const getSignalTool: AgentTool = {
  name: "get_signal",
  description: "Get signal details for a task attempt",
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
    executeMcpHandler(context, "get_signal", handleGetSignal, input),
};

// ==================== get_task ====================
const getTaskTool: AgentTool = {
  name: "get_task",
  description:
    "Get task details including verification criteria (orchestrator only)",
  inputSchema: {
    type: "object" as const,
    properties: {
      task_id: {
        type: "number",
        description: "The task ID to retrieve",
      },
    },
    required: ["task_id"],
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "get_task", handleGetTask, input),
};

// ==================== get_tasks ====================
const getTasksTool: AgentTool = {
  name: "get_tasks",
  description: "List tasks with optional filters (phase, status, category)",
  inputSchema: {
    type: "object" as const,
    properties: {
      phase_id: {
        type: "string",
        description: "Filter by phase ID",
      },
      status: {
        type: "string",
        description: "Filter by task status",
      },
      category: {
        type: "string",
        description: "Filter by category",
      },
    },
    required: [],
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "get_tasks", handleGetTasks, input),
};

// ==================== complete_task ====================
const completeTaskTool: AgentTool = {
  name: "complete_task",
  description: "Mark task as complete and advance sprint",
  inputSchema: {
    type: "object" as const,
    properties: {
      task_id: {
        type: "number",
        description: "The task ID to complete",
      },
      green_task_id: {
        type: "number",
        description:
          "For TDD red-phase tasks: ID of the green-phase task that will implement the tests",
      },
      notes: {
        type: "string",
        description: "Optional completion notes",
      },
    },
    required: ["task_id"],
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "complete_task", handleCompleteTask, input),
};

// ==================== get_verification_results ====================
const getVerificationResultsTool: AgentTool = {
  name: "get_verification_results",
  description: "Get verification check results (orchestrator only)",
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
    executeMcpHandler(
      context,
      "get_verification_results",
      handleGetVerificationResults,
      input,
    ),
};

// ==================== get_task_history ====================
const getTaskHistoryTool: AgentTool = {
  name: "get_task_history",
  description: "Get audit trail of task status changes",
  inputSchema: {
    type: "object" as const,
    properties: {
      task_id: {
        type: "number",
        description: "The task ID",
      },
    },
    required: ["task_id"],
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "get_task_history", handleGetTaskHistory, input),
};

export const orchestraOrchestratorTools = [
  getSprintStatusTool,
  getSignalTool,
  getTaskTool,
  getTasksTool,
  prepareTaskTool,
  runVerificationChecksTool,
  submitVerificationJudgmentTool,
  completeTaskTool,
  getVerificationResultsTool,
  getTaskHistoryTool,
] as const;

export function registerOrchestraOrchestratorTools(
  registry: ToolRegistry,
): void {
  registry.registerAll([...orchestraOrchestratorTools]);
}

export {
  completeTaskTool,
  getSignalTool,
  getSprintStatusTool,
  getTaskHistoryTool,
  getTasksTool,
  getTaskTool,
  getVerificationResultsTool,
  prepareTaskTool,
  runVerificationChecksTool,
  submitVerificationJudgmentTool,
};
