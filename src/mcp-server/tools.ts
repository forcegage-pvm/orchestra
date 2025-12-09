/**
 * MCP Tool Registration
 *
 * Registers all 21 Orchestra MCP tools with the server.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Import tool handlers
import { handleConfigureSprint } from "./handlers/configure-sprint.js";

/**
 * Define all 21 tools
 */
const TOOLS: Tool[] = [
  // Sprint Configuration Tools (6)
  {
    name: "configure_sprint",
    description:
      "Configure a new sprint with tasks, phases, dependencies, and verification criteria",
    inputSchema: {
      type: "object",
      properties: {
        sprint: {
          type: "object",
          properties: {
            id: { type: "string", pattern: "^sprint-\\d+$" },
            name: { type: "string" },
          },
          required: ["id", "name"],
        },
        phases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              phase_id: { type: "string" },
              phase_name: { type: "string" },
              speckit_tasks: { type: "array", items: { type: "string" } },
            },
            required: ["phase_id", "phase_name"],
          },
        },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              task_id: { type: "number" },
              phase_id: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              category: {
                type: "string",
                enum: ["INFRASTRUCTURE", "INTEGRATION", "VISUAL", "REFACTOR"],
              },
              dependencies: { type: "array", items: { type: "number" } },
              speckit_task_ref: { type: "string" },
              verification: { type: "object" }, // Simplified for brevity
            },
            required: [
              "task_id",
              "phase_id",
              "title",
              "description",
              "category",
              "dependencies",
              "verification",
            ],
          },
        },
        consolidations: { type: "array" },
      },
      required: ["sprint", "phases", "tasks"],
    },
  },
  {
    name: "add_task",
    description: "Add a new task to an existing sprint",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "update_task",
    description:
      "Update task metadata (title, description, category, dependencies)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "update_verification",
    description: "Update verification criteria for a task",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_task",
    description:
      "Get task details including verification criteria (orchestrator only)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_tasks",
    description: "List tasks with optional filters (phase, status, category)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "remove_task",
    description: "Remove a pending task from the sprint",
    inputSchema: { type: "object", properties: {} },
  },

  // Handover Tools (3)
  {
    name: "prepare_task",
    description:
      "Create handover for implementor with acceptance criteria and file operations",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_current_task",
    description: "Get current task handover (implementor only)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "update_handover",
    description: "Update handover details for a task",
    inputSchema: { type: "object", properties: {} },
  },

  // Signal Tools (2)
  {
    name: "signal_completion",
    description:
      "Signal task completion with artifacts (runs pre-signal checks)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_signal",
    description: "Get signal details for a task attempt",
    inputSchema: { type: "object", properties: {} },
  },

  // Verification Tools (2)
  {
    name: "get_verification_results",
    description: "Get verification check results (orchestrator only)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "submit_verification_judgment",
    description: "Submit verification judgment (PASS or FAIL) with feedback",
    inputSchema: { type: "object", properties: {} },
  },

  // Feedback Tools (2)
  {
    name: "get_feedback",
    description: "Get verification failure feedback for a task attempt",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "enhance_feedback",
    description: "Add additional guidance to existing feedback",
    inputSchema: { type: "object", properties: {} },
  },

  // Completion Tools (2)
  {
    name: "complete_task",
    description: "Mark task as complete and advance sprint",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "escalate_task",
    description: "Escalate stuck task to human supervisor",
    inputSchema: { type: "object", properties: {} },
  },

  // Progress Tools (3)
  {
    name: "get_progress",
    description: "Get sprint progress summary with task counts",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_sprint_status",
    description: "Get sprint status with phase summaries",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_task_history",
    description: "Get audit trail of task status changes",
    inputSchema: { type: "object", properties: {} },
  },
];

/**
 * Register all MCP tools
 */
export function registerTools(server: Server): void {
  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = request.params.arguments || {};

    // Route to appropriate handler
    switch (toolName) {
      case "configure_sprint":
        return await handleConfigureSprint(args);

      // Placeholder for other tools
      default:
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: false,
                  error: {
                    code: "NOT_IMPLEMENTED",
                    message: `Tool "${toolName}" not yet implemented`,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
    }
  });
}
