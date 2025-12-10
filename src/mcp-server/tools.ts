/**
 * MCP Tool Registration
 *
 * Registers Orchestra MCP tools with the server, filtered by role.
 *
 * ROLES:
 *   orchestrator - Task preparation, verification, judgment, configuration
 *   implementor  - Task execution, signal completion, get feedback
 *   full         - All tools (default, for development/testing)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Import tool handlers
import { handleConfigureSprint } from "./handlers/configure-sprint.js";
import { handleSetConfig } from "./handlers/set-config.js";

/**
 * Server role type
 */
export type ServerRole = "orchestrator" | "implementor" | "full";

/**
 * Tool role assignments
 * - orchestrator: Tools only the orchestrator should access
 * - implementor: Tools only the implementor should access
 * - shared: Tools both roles can access
 */
type ToolRole = "orchestrator" | "implementor" | "shared";

interface ToolWithRole extends Tool {
  role: ToolRole;
}

/**
 * Define all tools with role assignments
 */
const TOOLS_WITH_ROLES: ToolWithRole[] = [
  // Sprint Configuration Tools - ORCHESTRATOR ONLY
  {
    role: "orchestrator",
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
    role: "orchestrator",
    name: "add_task",
    description: "Add a new task to an existing sprint",
    inputSchema: { type: "object", properties: {} },
  },
  {
    role: "orchestrator",
    name: "update_task",
    description:
      "Update task metadata (title, description, category, dependencies)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    role: "orchestrator",
    name: "update_verification",
    description: "Update verification criteria for a task",
    inputSchema: { type: "object", properties: {} },
  },
  {
    role: "orchestrator",
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
    role: "orchestrator",
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
    role: "orchestrator",
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

  // Handover Tools
  {
    role: "orchestrator",
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
    role: "implementor",
    name: "get_current_task",
    description: "Get current task handover (implementor only)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    role: "orchestrator",
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

  // Signal Tools - IMPLEMENTOR
  {
    role: "implementor",
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
    role: "shared",
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

  // Verification Tools - ORCHESTRATOR ONLY
  {
    role: "orchestrator",
    name: "run_verification_checks",
    description:
      "Execute verification checks from database and record results (orchestrator only)",
    inputSchema: {
      type: "object",
      properties: {
        task_id: {
          type: "number",
          description: "The task ID to verify",
        },
        check_ids: {
          type: "array",
          items: { type: "string" },
          description: "Optional: Specific check IDs to run",
        },
        severity_filter: {
          type: "string",
          enum: ["BLOCKING", "MAJOR", "MINOR", "INFO", "all"],
          description: "Optional: Filter by severity level",
        },
        continue_on_error: {
          type: "boolean",
          description:
            "Continue running checks even if one fails (default: false)",
        },
        dry_run: {
          type: "boolean",
          description: "List checks without executing (default: false)",
        },
      },
      required: ["task_id"],
    },
  },
  {
    role: "orchestrator",
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
    role: "orchestrator",
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

  // Feedback Tools - IMPLEMENTOR gets feedback, ORCHESTRATOR enhances
  {
    role: "implementor",
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
    role: "orchestrator",
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

  // Completion Tools - ORCHESTRATOR ONLY
  {
    role: "orchestrator",
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
    role: "shared",
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

  // Progress Tools - SHARED (both roles can view progress)
  {
    role: "shared",
    name: "get_progress",
    description: "Get sprint progress summary with task counts",
    inputSchema: { type: "object", properties: {} },
  },
  {
    role: "shared",
    name: "get_sprint_status",
    description: "Get sprint status with phase summaries",
    inputSchema: { type: "object", properties: {} },
  },
  {
    role: "shared",
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

  // Configuration Tools - ORCHESTRATOR ONLY
  {
    role: "orchestrator",
    name: "set_config",
    description:
      "Set a configuration value (e.g., pre_signal_build_command, pre_signal_timeout)",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Configuration key" },
        value: { type: "string", description: "Configuration value" },
        description: {
          type: "string",
          description: "Optional description of the configuration",
        },
      },
      required: ["key", "value"],
    },
  },
];

/**
 * Get tools filtered by role
 */
function getToolsForRole(role: ServerRole): Tool[] {
  if (role === "full") {
    // Return all tools (strip role property)
    return TOOLS_WITH_ROLES.map(({ role: _role, ...tool }) => tool);
  }

  // Filter to role-specific + shared tools
  return TOOLS_WITH_ROLES.filter(
    (tool) => tool.role === role || tool.role === "shared"
  ).map(({ role: _role, ...tool }) => tool);
}

/**
 * Check if a tool is available for a role
 */
function isToolAvailableForRole(toolName: string, role: ServerRole): boolean {
  if (role === "full") return true;

  const tool = TOOLS_WITH_ROLES.find((t) => t.name === toolName);
  if (!tool) return false;

  return tool.role === role || tool.role === "shared";
}

/**
 * Register MCP tools filtered by role
 */
export function registerTools(server: Server, role: ServerRole = "full"): void {
  const availableTools = getToolsForRole(role);

  console.error(
    `[orchestra-mcp] Registering ${availableTools.length} tools for role: ${role}`
  );

  // List tools handler - returns only role-appropriate tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: availableTools };
  });

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = request.params.arguments || {};

    // Check role access before executing
    if (!isToolAvailableForRole(toolName, role)) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                error: {
                  code: "ROLE_ACCESS_DENIED",
                  message: `Tool "${toolName}" is not available for role "${role}"`,
                  available_roles: TOOLS_WITH_ROLES.find(
                    (t) => t.name === toolName
                  )?.role,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }

    try {
      console.error(`[MCP] Tool called: ${toolName} (role: ${role})`);
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

        // Verification (3 tools)
        case "run_verification_checks":
          return await (
            await import("./handlers/run-verification-checks.js")
          ).handleRunVerificationChecks(args);
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

        // Configuration (1 tool)
        case "set_config":
          return await handleSetConfig(args);

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
