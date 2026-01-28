/**
 * Orchestra controller tools index
 *
 * Barrel exports and registration helper for all controller tools.
 * Controller has LIMITED tools: read-only + judgment (approve/reject).
 */

import { handleApproveHandover } from "../../../../../src/mcp-server/handlers/approve-handover.js";
import { handleApproveSprint } from "../../../../../src/mcp-server/handlers/approve-sprint.js";
import { handleGetHandover } from "../../../../../src/mcp-server/handlers/get-handover.js";
import { handleGetSprintStatus } from "../../../../../src/mcp-server/handlers/get-sprint-status.js";
import { handleGetTask } from "../../../../../src/mcp-server/handlers/get-task.js";
import { handleRejectHandover } from "../../../../../src/mcp-server/handlers/reject-handover.js";
import { handleRejectSprint } from "../../../../../src/mcp-server/handlers/reject-sprint.js";
import { ToolRegistry } from "../../ToolRegistry.js";
import type { ToolContext, ToolDefinition, ToolResult } from "../../types.js";
import { executeMcpHandler } from "./mcpAdapter.js";

// ==================== get_sprint_status (read-only) ====================
const getSprintStatusTool: ToolDefinition = {
  name: "get_sprint_status",
  description:
    "Get sprint status with phase summaries. Check for PENDING_SPEC_REVIEW or tasks in PENDING_HANDOVER_REVIEW.",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
  execute: async (_input: unknown, context: ToolContext): Promise<ToolResult> =>
    executeMcpHandler(context.workspaceRoot, handleGetSprintStatus, {}),
};

// ==================== get_task (read-only) ====================
const getTaskTool: ToolDefinition = {
  name: "get_task",
  description:
    "Get task details for a specific task. Use before reviewing handover.",
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
  execute: async (input: unknown, context: ToolContext): Promise<ToolResult> =>
    executeMcpHandler(context.workspaceRoot, handleGetTask, input),
};

// ==================== get_handover (read-only, for handover review) ====================
const getHandoverTool: ToolDefinition = {
  name: "get_handover",
  description:
    "Get the handover for a task to review. Shows acceptance criteria, file operations, and context that implementor will see.",
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
  execute: async (input: unknown, context: ToolContext): Promise<ToolResult> =>
    executeMcpHandler(context.workspaceRoot, handleGetHandover, input),
};

// ==================== approve_sprint (judgment) ====================
const approveSprintTool: ToolDefinition = {
  name: "approve_sprint",
  description:
    "Approve a sprint configuration. Use when sprint aligns with spec.",
  inputSchema: {
    type: "object" as const,
    properties: {
      conformance: {
        type: "string",
        enum: ["PASS", "WARN", "FAIL"],
        description:
          "Level of spec conformance: PASS (fully aligned), WARN (minor issues), FAIL (reject)",
      },
      notes: {
        type: "string",
        description: "Optional approval notes (min 10 characters if provided)",
      },
    },
    required: ["conformance"],
  },
  execute: async (input: unknown, context: ToolContext): Promise<ToolResult> =>
    executeMcpHandler(context.workspaceRoot, handleApproveSprint, input),
};

// ==================== reject_sprint (judgment) ====================
const rejectSprintTool: ToolDefinition = {
  name: "reject_sprint",
  description:
    "Reject a sprint configuration. Use when sprint has spec violations.",
  inputSchema: {
    type: "object" as const,
    properties: {
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "MISSING_COVERAGE",
                "MISALIGNMENT",
                "SCOPE_CREEP",
                "OTHER",
              ],
            },
            description: { type: "string" },
            spec_reference: { type: "string" },
            severity: { type: "string", enum: ["BLOCKING", "MAJOR", "MINOR"] },
          },
          required: ["type", "description", "severity"],
        },
        description: "List of issues found",
      },
      recommendations: {
        type: "array",
        items: { type: "string" },
        description: "Recommendations for fixing the issues",
      },
    },
    required: ["issues", "recommendations"],
  },
  execute: async (input: unknown, context: ToolContext): Promise<ToolResult> =>
    executeMcpHandler(context.workspaceRoot, handleRejectSprint, input),
};

// ==================== approve_handover (judgment) ====================
const approveHandoverTool: ToolDefinition = {
  name: "approve_handover",
  description: "Approve a task handover. Use when handover aligns with spec.",
  inputSchema: {
    type: "object" as const,
    properties: {
      task_id: {
        type: "number",
        description: "The task ID whose handover to approve",
      },
      conformance: {
        type: "string",
        enum: ["PASS", "WARN", "FAIL"],
        description:
          "Level of spec conformance: PASS (fully aligned), WARN (minor issues), FAIL (reject)",
      },
      notes: {
        type: "string",
        description: "Optional approval notes (min 10 characters if provided)",
      },
    },
    required: ["task_id", "conformance"],
  },
  execute: async (input: unknown, context: ToolContext): Promise<ToolResult> =>
    executeMcpHandler(context.workspaceRoot, handleApproveHandover, input),
};

// ==================== reject_handover (judgment) ====================
const rejectHandoverTool: ToolDefinition = {
  name: "reject_handover",
  description: "Reject a task handover. Use when handover has spec violations.",
  inputSchema: {
    type: "object" as const,
    properties: {
      task_id: {
        type: "number",
        description: "The task ID whose handover to reject",
      },
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "MISSING_REQUIREMENT",
                "DEFERRED_FUNCTIONALITY",
                "SPEC_VIOLATION",
                "OTHER",
              ],
            },
            description: { type: "string" },
            spec_reference: { type: "string" },
            severity: { type: "string", enum: ["BLOCKING", "MAJOR", "MINOR"] },
          },
          required: ["type", "description", "severity"],
        },
        description: "List of issues found",
      },
      recommendations: {
        type: "array",
        items: { type: "string" },
        description: "Recommendations for fixing the issues",
      },
    },
    required: ["task_id", "issues", "recommendations"],
  },
  execute: async (input: unknown, context: ToolContext): Promise<ToolResult> =>
    executeMcpHandler(context.workspaceRoot, handleRejectHandover, input),
};

export const orchestraControllerTools = [
  getSprintStatusTool,
  getTaskTool,
  getHandoverTool,
  approveSprintTool,
  rejectSprintTool,
  approveHandoverTool,
  rejectHandoverTool,
] as const;

export function registerOrchestraControllerTools(registry: ToolRegistry): void {
  registry.registerAll([...orchestraControllerTools]);
}

export {
  approveHandoverTool,
  approveSprintTool,
  getHandoverTool,
  getSprintStatusTool,
  getTaskTool,
  rejectHandoverTool,
  rejectSprintTool,
};
