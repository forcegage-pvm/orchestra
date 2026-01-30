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
import { handleReadSpecFile } from "../../../../../src/mcp-server/handlers/read-spec-file.js";
import { handleRejectHandover } from "../../../../../src/mcp-server/handlers/reject-handover.js";
import { handleRejectSprint } from "../../../../../src/mcp-server/handlers/reject-sprint.js";
import { ToolRegistry } from "../../ToolRegistry.js";
import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import { executeMcpHandler } from "./mcpAdapter.js";

// ==================== get_sprint_status (read-only) ====================
const getSprintStatusTool: AgentTool = {
  name: "get_sprint_status",
  description:
    "Get sprint status with phase summaries. Check for PENDING_SPEC_REVIEW or tasks in PENDING_HANDOVER_REVIEW.",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
  invoke: async (
    _input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "get_sprint_status", handleGetSprintStatus, {}),
};

// ==================== get_task (read-only) ====================
const getTaskTool: AgentTool = {
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
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "get_task", handleGetTask, input),
};

// ==================== get_handover (read-only, for handover review) ====================
const getHandoverTool: AgentTool = {
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
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "get_handover", handleGetHandover, input),
};

// ==================== read_spec_file (read-only, for spec review) ====================
const readSpecFileTool: AgentTool = {
  name: "read_spec_file",
  description:
    "Read a specification file for review purposes. Restricted to spec/, specs/, and docs/ directories.",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description:
          "Path to the specification file, relative to workspace root. Must be in spec/, specs/, or docs/ directory.",
      },
      start_line: {
        type: "number",
        description: "Optional: Start line to read from (1-indexed)",
      },
      end_line: {
        type: "number",
        description: "Optional: End line to read to (1-indexed, inclusive)",
      },
    },
    required: ["path"],
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "read_spec_file", handleReadSpecFile, input),
};

// ==================== approve_sprint (judgment) ====================
const approveSprintTool: AgentTool = {
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
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "approve_sprint", handleApproveSprint, input),
};

// ==================== reject_sprint (judgment) ====================
const rejectSprintTool: AgentTool = {
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
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "reject_sprint", handleRejectSprint, input),
};

// ==================== approve_handover (judgment) ====================
const approveHandoverTool: AgentTool = {
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
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(
      context,
      "approve_handover",
      handleApproveHandover,
      input,
    ),
};

// ==================== reject_handover (judgment) ====================
const rejectHandoverTool: AgentTool = {
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
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "reject_handover", handleRejectHandover, input),
};

export const orchestraControllerTools = [
  getSprintStatusTool,
  getTaskTool,
  getHandoverTool,
  readSpecFileTool,
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
  readSpecFileTool,
  rejectHandoverTool,
  rejectSprintTool,
};
