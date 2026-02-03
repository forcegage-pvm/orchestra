/**
 * prepareTask tool - Wrapper around MCP handler for prepare_task
 *
 * This reuses the full MCP server implementation to avoid code duplication
 * and ensure feature parity (TDD cleanup, auto-commit, phase gates, etc.)
 */

import { handlePrepareTask } from "../../../../../src/mcp-server/handlers/prepare-task.js";
import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import { executeMcpHandler } from "./mcpAdapter.js";

export const prepareTaskTool: AgentTool = {
  name: "prepare_task",
  description:
    "Prepare a task by creating a handover and setting status to IMPLEMENT. " +
    "Includes TDD marker cleanup, auto-commit, phase gate enforcement, and verification check generation.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "number", description: "The task ID to prepare" },
      priority: {
        type: "string",
        enum: ["P0", "P1", "P2", "P3"],
        description: "Task priority (P0=Critical, P1=High, P2=Medium, P3=Low)",
      },
      context: {
        type: "string",
        description:
          "Background explaining WHY this task exists, architectural decisions, and how it fits the larger goal (min 50 chars)",
      },
      context_files: {
        type: "array",
        description:
          "File paths the implementor should read for additional context",
        items: { type: "string" },
      },
      acceptance_criteria: {
        type: "array",
        description: "List of acceptance criteria with verification methods",
        items: {
          type: "object",
          properties: {
            criterion: {
              type: "string",
              description: "The acceptance criterion",
            },
            verification: {
              type: "string",
              description: "How to verify this criterion",
            },
          },
          required: ["criterion", "verification"],
        },
      },
      file_operations: {
        type: "array",
        description: "File operations to perform (CREATE, UPDATE, DELETE)",
        items: {
          type: "object",
          properties: {
            operation: {
              type: "string",
              enum: ["CREATE", "UPDATE", "DELETE"],
              description: "Operation type",
            },
            path: { type: "string", description: "File path" },
            description: {
              type: "string",
              description: "Description of the operation",
            },
          },
          required: ["operation", "path", "description"],
        },
      },
      deliverables: {
        type: "array",
        description: "List of deliverables",
        items: { type: "string" },
      },
      tdd_red_phase: {
        type: "boolean",
        description:
          "Enable TDD red-phase verification: verify tests FAIL before implementation",
      },
    },
    required: [
      "task_id",
      "priority",
      "context",
      "acceptance_criteria",
      "file_operations",
      "deliverables",
    ],
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => {
    return executeMcpHandler(context, "prepare_task", handlePrepareTask, input);
  },
};
