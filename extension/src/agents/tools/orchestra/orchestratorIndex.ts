/**
 * Orchestra orchestrator tools index
 *
 * Barrel exports and registration helper for all orchestrator tools.
 * Uses MCP handlers via adapter for feature parity with MCP server.
 */

import { handleCompleteTask } from "../../../../../src/mcp-server/handlers/complete-task.js";
import { handleGetAmendments } from "../../../../../src/mcp-server/handlers/get-amendments.js";
import { handleGetHandover } from "../../../../../src/mcp-server/handlers/get-handover.js";
import { handleGetSignal } from "../../../../../src/mcp-server/handlers/get-signal.js";
import { handleGetTaskHistory } from "../../../../../src/mcp-server/handlers/get-task-history.js";
import { handleGetTask } from "../../../../../src/mcp-server/handlers/get-task.js";
import { handleGetTasks } from "../../../../../src/mcp-server/handlers/get-tasks.js";
import { handleGetVerificationResults } from "../../../../../src/mcp-server/handlers/get-verification-results.js";
import { handleResubmitHandover } from "../../../../../src/mcp-server/handlers/resubmit-handover.js";
import { handleUpdateHandover } from "../../../../../src/mcp-server/handlers/update-handover.js";
import { handleUpdateVerification } from "../../../../../src/mcp-server/handlers/update-verification.js";
import { ToolRegistry } from "../../ToolRegistry.js";
import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import { escalateTaskTool } from "./escalateTask.js";
import { getSprintStatusTool } from "./getSprintStatus.js";
import { executeMcpHandler } from "./mcpAdapter.js";
import { prepareTaskTool } from "./prepareTask.js";
import { runVerificationChecksTool } from "./runVerificationChecks.js";
import { submitVerificationJudgmentTool } from "./submitVerificationJudgment.js";

// ==================== get_handover ====================
const getHandoverTool: AgentTool = {
  name: "get_handover",
  description:
    "Get handover details for a task showing acceptance criteria, file operations, deliverables, and context",
  inputSchema: {
    type: "object" as const,
    properties: {
      task_id: {
        type: "number",
        description: "The task ID to get handover for",
      },
    },
    required: ["task_id"],
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "get_handover", handleGetHandover, input),
};

// ==================== update_handover ====================
const updateHandoverTool: AgentTool = {
  name: "update_handover",
  description:
    "Update handover details for a task (acceptance criteria, context, deliverables, file operations, etc.)",
  inputSchema: {
    type: "object" as const,
    properties: {
      task_id: {
        type: "number",
        description: "The task ID to update handover for",
      },
      acceptance_criteria: {
        type: "array",
        description: "Updated acceptance criteria",
        items: {
          type: "object",
          properties: {
            criterion: { type: "string" },
            verification: { type: "string" },
          },
          required: ["criterion", "verification"],
        },
      },
      context: {
        type: "string",
        description: "Updated context/background information",
      },
      context_files: {
        type: "array",
        description: "Updated context file paths",
        items: { type: "string" },
      },
      deliverables: {
        type: "array",
        description: "Updated deliverables",
        items: { type: "string" },
      },
      file_operations: {
        type: "array",
        description: "Updated file operations",
        items: {
          type: "object",
          properties: {
            operation: { type: "string", enum: ["CREATE", "UPDATE", "DELETE"] },
            path: { type: "string" },
            description: { type: "string" },
          },
          required: ["operation", "path", "description"],
        },
      },
      priority: {
        type: "string",
        description: "Updated priority",
        enum: ["P0", "P1", "P2", "P3"],
      },
      references: {
        type: "array",
        description: "Updated reference links",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
          },
          required: ["title", "url"],
        },
      },
    },
    required: ["task_id"],
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "update_handover", handleUpdateHandover, input),
};

// ==================== resubmit_handover ====================
const resubmitHandoverTool: AgentTool = {
  name: "resubmit_handover",
  description:
    "Resubmit a task handover after addressing Controller feedback. Transitions from HANDOVER_REVIEW_FAILED back to PENDING_HANDOVER_REVIEW.",
  inputSchema: {
    type: "object" as const,
    properties: {
      task_id: {
        type: "number",
        description: "The task ID whose handover to resubmit",
      },
      changes_made: {
        type: "string",
        description:
          "Description of changes made to address Controller feedback (min 20 chars)",
      },
    },
    required: ["task_id", "changes_made"],
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(
      context,
      "resubmit_handover",
      handleResubmitHandover,
      input,
    ),
};

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

// ==================== get_amendments ====================
const getAmendmentsTool: AgentTool = {
  name: "get_amendments",
  description:
    "List all amendments made to tasks after initial configuration. Shows verification criteria changes, task metadata updates, and handover modifications with full before/after audit trail.",
  inputSchema: {
    type: "object" as const,
    properties: {
      task_id: {
        type: "number",
        description:
          "Filter by task ID. If omitted, returns all amendments for the sprint.",
      },
      tool_name: {
        type: "string",
        description:
          "Filter by tool name (e.g., 'update_verification', 'update_task', 'update_handover')",
      },
      amendment_type: {
        type: "string",
        enum: ["VERIFICATION", "TASK_METADATA", "HANDOVER"],
        description: "Filter by amendment type",
      },
    },
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "get_amendments", handleGetAmendments, input),
};

// ==================== update_verification ====================
const updateVerificationTool: AgentTool = {
  name: "update_verification",
  description:
    "Update verification criteria for a task. Allowed during CONFIGURE (initial setup), PREPARE (spec error corrections), and SPEC_REVIEW only when sprint status is SPEC_REVIEW_FAILED (Controller revisions). When called outside CONFIGURE, creates an amendment record with full audit trail.",
  inputSchema: {
    type: "object" as const,
    properties: {
      task_id: {
        type: "number",
        description: "The task ID to update verification for",
      },
      verification: {
        type: "object",
        description: "New verification criteria",
        properties: {
          structural_checks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                severity: {
                  type: "string",
                  enum: ["BLOCKING", "MAJOR", "MINOR", "INFO"],
                },
                path: { type: "string" },
                pattern: { type: "string" },
                min_matches: { type: "number" },
              },
              required: ["description", "severity"],
            },
          },
          behavioral_checks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                severity: {
                  type: "string",
                  enum: ["BLOCKING", "MAJOR", "MINOR", "INFO"],
                },
                command: { type: "string" },
                expect_exit_code: { type: "number" },
                expect_output_contains: { type: "string" },
              },
              required: ["description", "severity"],
            },
          },
          quality_checks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                severity: {
                  type: "string",
                  enum: ["BLOCKING", "MAJOR", "MINOR", "INFO"],
                },
                path: { type: "string" },
                pattern: { type: "string" },
                min_matches: { type: "number" },
                command: { type: "string" },
              },
              required: ["description", "severity"],
            },
          },
        },
      },
      rationale: {
        type: "string",
        description:
          "Required when updating during PREPARE phase. Explains why the verification criteria are being amended (min 10 chars).",
      },
    },
    required: ["task_id", "verification"],
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(
      context,
      "update_verification",
      handleUpdateVerification,
      input,
    ),
};

export const orchestraOrchestratorTools = [
  getSprintStatusTool,
  getSignalTool,
  getTaskTool,
  getTasksTool,
  getAmendmentsTool,
  prepareTaskTool,
  runVerificationChecksTool,
  submitVerificationJudgmentTool,
  completeTaskTool,
  getVerificationResultsTool,
  getTaskHistoryTool,
  getHandoverTool,
  updateHandoverTool,
  resubmitHandoverTool,
  updateVerificationTool,
  escalateTaskTool,
] as const;

export function registerOrchestraOrchestratorTools(
  registry: ToolRegistry,
): void {
  registry.registerAll([...orchestraOrchestratorTools]);
}

export {
  completeTaskTool,
  escalateTaskTool,
  getAmendmentsTool,
  getHandoverTool,
  getSignalTool,
  getSprintStatusTool,
  getTaskHistoryTool,
  getTasksTool,
  getTaskTool,
  getVerificationResultsTool,
  prepareTaskTool,
  resubmitHandoverTool,
  runVerificationChecksTool,
  submitVerificationJudgmentTool,
  updateHandoverTool,
  updateVerificationTool,
};
