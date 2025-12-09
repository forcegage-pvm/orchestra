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
            id: { type: "string" },
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
              verification: {
                type: "object",
                properties: {
                  success_criteria: {
                    type: "array",
                    items: { type: "string" },
                  },
                  test_strategy: { type: "string" },
                },
                additionalProperties: true,
              },
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
        consolidations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              phase_id: { type: "string" },
              tasks: { type: "array", items: { type: "number" } },
            },
          },
        },
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
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "number", description: "The task ID to retrieve" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "get_tasks",
    description: "List tasks with optional filters (phase, status, category)",
    inputSchema: {
      type: "object",
      properties: {
        phase_id: { type: "string", description: "Filter by phase ID" },
        status: { type: "string", description: "Filter by task status" },
        category: { type: "string", description: "Filter by category" },
      },
    },
  },
  {
    name: "remove_task",
    description: "Remove a pending task from the sprint",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "number", description: "The task ID to remove" },
      },
      required: ["task_id"],
    },
  },

  // Handover Tools (3)
  {
    name: "prepare_task",
    description:
      "Create handover for implementor with acceptance criteria and file operations",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "number", description: "The task ID to prepare" },
        acceptance_criteria: {
          type: "array",
          items: {
            type: "object",
            properties: {
              criterion: { type: "string" },
              verification: { type: "string" },
            },
            required: ["criterion", "verification"],
          },
          description: "List of acceptance criteria",
        },
        file_operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              operation: {
                type: "string",
                enum: ["CREATE", "UPDATE", "DELETE"],
              },
              path: { type: "string" },
              description: { type: "string" },
            },
            required: ["operation", "path", "description"],
          },
          description: "File operations to perform",
        },
        deliverables: {
          type: "array",
          items: { type: "string" },
          description: "List of deliverables",
        },
        priority: {
          type: "string",
          enum: ["P0", "P1", "P2", "P3"],
          description:
            "Task priority (P0=Critical, P1=High, P2=Medium, P3=Low)",
        },
      },
      required: [
        "task_id",
        "acceptance_criteria",
        "file_operations",
        "deliverables",
        "priority",
      ],
    },
  },
  {
    name: "get_current_task",
    description: "Get current task handover (implementor only)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "update_handover",
    description: "Update handover details for a task",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "number", description: "The task ID" },
      },
      required: ["task_id"],
    },
  },

  // Signal Tools (2)
  {
    name: "signal_completion",
    description:
      "Signal task completion with artifacts (runs pre-signal checks)",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "number", description: "The task ID" },
        summary: {
          type: "string",
          description: "Summary of work completed (min 10 chars)",
        },
        artifacts_created: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              type: { type: "string", enum: ["CREATE", "UPDATE", "DELETE"] },
              description: { type: "string" },
            },
            required: ["path", "type", "description"],
          },
          description: "List of artifacts created/modified",
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
        notes: { type: "string", description: "Optional notes" },
      },
      required: [
        "task_id",
        "summary",
        "artifacts_created",
        "build_status",
        "test_status",
      ],
    },
  },
  {
    name: "get_signal",
    description: "Get signal details for a task attempt",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "number", description: "The task ID" },
        attempt: { type: "number", description: "The attempt number" },
      },
      required: ["task_id"],
    },
  },

  // Verification Tools (2)
  {
    name: "get_verification_results",
    description: "Get verification check results (orchestrator only)",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "number", description: "The task ID" },
        attempt: { type: "number", description: "The attempt number" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "submit_verification_judgment",
    description: "Submit verification judgment (PASS or FAIL) with feedback",
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
          description: "Rationale for the judgment (min 10 chars)",
        },
        failures: {
          type: "array",
          items: {
            type: "object",
            properties: {
              check_id: { type: "string" },
              reason: { type: "string" },
              priority: {
                type: "string",
                enum: ["high", "medium", "low"],
              },
              guidance: { type: "string" },
            },
            required: ["check_id", "reason", "priority", "guidance"],
          },
          description: "List of failures (required if judgment is FAIL)",
        },
        feedback: { type: "string", description: "Optional feedback message" },
      },
      required: ["task_id", "judgment", "rationale"],
    },
  },

  // Feedback Tools (2)
  {
    name: "get_feedback",
    description: "Get verification failure feedback for a task attempt",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "number", description: "The task ID" },
        attempt: { type: "number", description: "The attempt number" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "enhance_feedback",
    description: "Add additional guidance to existing feedback",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "number", description: "The task ID" },
        attempt: { type: "number", description: "The attempt number" },
        additional_guidance: { type: "string", description: "Extra guidance" },
      },
      required: ["task_id", "additional_guidance"],
    },
  },

  // Completion Tools (2)
  {
    name: "complete_task",
    description: "Mark task as complete and advance sprint",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "number", description: "The task ID to complete" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "escalate_task",
    description: "Escalate stuck task to human supervisor",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "number", description: "The task ID to escalate" },
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
      },
      required: ["task_id", "reason", "attempts_summary"],
    },
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
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "number", description: "The task ID" },
      },
      required: ["task_id"],
    },
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

    try {
      console.error(`[MCP] Tool called: ${toolName}`);
      console.error(`[MCP] Arguments:`, JSON.stringify(args, null, 2));

      // Route to appropriate handler
      switch (toolName) {
        // Sprint Config (6 tools)
        case "configure_sprint":
          return await handleConfigureSprint(args);
        case "add_task":
          return await (
            await import("./handlers/add-task.js")
          ).handleAddTask(args);
        case "update_task":
          return await (
            await import("./handlers/update-task.js")
          ).handleUpdateTask(args);
        case "update_verification":
          return await (
            await import("./handlers/update-verification.js")
          ).handleUpdateVerification(args);
        case "get_task":
          return await (
            await import("./handlers/get-task.js")
          ).handleGetTask(args);
        case "get_tasks":
          return await (
            await import("./handlers/get-tasks.js")
          ).handleGetTasks(args);
        case "remove_task":
          return await (
            await import("./handlers/remove-task.js")
          ).handleRemoveTask(args);

        // Handover (3 tools)
        case "prepare_task":
          return await (
            await import("./handlers/prepare-task.js")
          ).handlePrepareTask(args);
        case "get_current_task":
          return await (
            await import("./handlers/get-current-task.js")
          ).handleGetCurrentTask(args);
        case "update_handover":
          return await (
            await import("./handlers/update-handover.js")
          ).handleUpdateHandover(args);

        // Signal (2 tools)
        case "signal_completion":
          return await (
            await import("./handlers/signal-completion.js")
          ).handleSignalCompletion(args);
        case "get_signal":
          return await (
            await import("./handlers/get-signal.js")
          ).handleGetSignal(args);

        // Verification (2 tools)
        case "get_verification_results":
          return await (
            await import("./handlers/get-verification-results.js")
          ).handleGetVerificationResults(args);
        case "submit_verification_judgment":
          return await (
            await import("./handlers/submit-verification-judgment.js")
          ).handleSubmitVerificationJudgment(args);

        // Feedback (2 tools)
        case "get_feedback":
          return await (
            await import("./handlers/get-feedback.js")
          ).handleGetFeedback(args);
        case "enhance_feedback":
          return await (
            await import("./handlers/enhance-feedback.js")
          ).handleEnhanceFeedback(args);

        // Completion (2 tools)
        case "complete_task":
          return await (
            await import("./handlers/complete-task.js")
          ).handleCompleteTask(args);
        case "escalate_task":
          return await (
            await import("./handlers/escalate-task.js")
          ).handleEscalateTask(args);

        // Progress (3 tools)
        case "get_progress":
          return await (
            await import("./handlers/get-progress.js")
          ).handleGetProgress(args);
        case "get_sprint_status":
          return await (
            await import("./handlers/get-sprint-status.js")
          ).handleGetSprintStatus(args);
        case "get_task_history":
          return await (
            await import("./handlers/get-task-history.js")
          ).handleGetTaskHistory(args);

        default:
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: false,
                    error: {
                      code: "UNKNOWN_TOOL",
                      message: `Tool "${toolName}" not recognized`,
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
      }
    } catch (error) {
      console.error(`[MCP] Tool handler error for ${toolName}:`, error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                error: {
                  code: "TOOL_ERROR",
                  message:
                    error instanceof Error ? error.message : "Unknown error",
                  stack: error instanceof Error ? error.stack : undefined,
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
