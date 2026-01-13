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
import { handleGetSprintConfig } from "./handlers/get-sprint-config.js";
import { handleSetConfig } from "./handlers/set-config.js";
import { handleSetSprintConfig } from "./handlers/set-sprint-config.js";

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
      "Configure a new sprint with tasks, phases, dependencies, and verification criteria. Can accept inline data OR a config_file path to load configuration from filesystem.",
    inputSchema: {
      type: "object",
      properties: {
        config_file: {
          type: "string",
          description:
            "Path to JSON config file (relative to workspace root). If provided, other parameters are ignored and config is loaded from file.",
        },
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
    },
  },
  {
    role: "orchestrator",
    name: "add_task",
    description:
      "Add a new task to an existing sprint. Task ID will be auto-assigned as max(existing_task_ids) + 1.",
    inputSchema: {
      type: "object",
      properties: {
        phase_id: {
          type: "string",
          description: "Phase ID this task belongs to",
        },
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Task description" },
        category: {
          type: "string",
          enum: ["INFRASTRUCTURE", "INTEGRATION", "VISUAL", "REFACTOR"],
          description: "Task category",
        },
        dependencies: {
          type: "array",
          items: { type: "number" },
          description: "Array of task IDs this task depends on",
        },
        speckit_task_ref: {
          type: "string",
          description: "Optional speckit task reference",
        },
        verification: {
          type: "object",
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
      },
      required: [
        "phase_id",
        "title",
        "description",
        "category",
        "dependencies",
        "verification",
      ],
    },
  },
  {
    role: "orchestrator",
    name: "add_phase",
    description:
      "Add a new phase to the active sprint. Use this before add_task if the phase doesn't exist.",
    inputSchema: {
      type: "object",
      properties: {
        phase_id: {
          type: "string",
          description:
            "Unique phase identifier (lowercase alphanumeric with hyphens, e.g., 'phase-2.1')",
        },
        phase_name: {
          type: "string",
          description: "Human-readable phase name (e.g., 'Hotfix Phase')",
        },
        order: {
          type: "number",
          description:
            "Phase display order (auto-assigned as max+1 if not provided)",
        },
        speckit_tasks: {
          type: "array",
          items: { type: "string" },
          description: "Optional speckit task references",
        },
      },
      required: ["phase_id", "phase_name"],
    },
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
    description:
      "Update verification criteria for a task. Allowed during CONFIGURE (initial setup) or PREPARE (spec error corrections). When called during PREPARE, creates an amendment record with full audit trail.",
    inputSchema: {
      type: "object",
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
        context: {
          type: "string",
          minLength: 50,
          description:
            "REQUIRED: Background explaining WHY this task exists, architectural decisions, and how it fits the larger goal (min 50 chars)",
        },
        context_files: {
          type: "array",
          items: { type: "string" },
          description:
            "File paths the implementor should read for additional context (specs, related code, etc.)",
        },
      },
      required: [
        "task_id",
        "acceptance_criteria",
        "file_operations",
        "deliverables",
        "priority",
        "context",
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
          description: "Updated acceptance criteria",
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
          description: "Updated file operations",
        },
        deliverables: {
          type: "array",
          items: { type: "string" },
          description: "Updated deliverables",
        },
        priority: {
          type: "string",
          enum: ["P0", "P1", "P2", "P3"],
          description: "Updated priority",
        },
        context: {
          type: "string",
          description: "Updated context/background information",
        },
        context_files: {
          type: "array",
          items: { type: "string" },
          description: "Updated context file paths",
        },
        test_file: { type: "string", description: "Updated test file path" },
        test_requirements: {
          type: "string",
          description: "Updated test requirements",
        },
        constraints: {
          type: "array",
          items: { type: "string" },
          description: "Updated constraints",
        },
        references: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              url: { type: "string" },
            },
            required: ["title", "url"],
          },
          description: "Updated reference links",
        },
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
          minLength: 50,
          description:
            "Rationale for the judgment - explain your decision (min 50 chars)",
        },
        manual_review: {
          type: "object",
          description:
            "REQUIRED: Evidence that you actually reviewed the implementation code. Prevents rubber-stamping.",
          properties: {
            files_reviewed: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              description:
                "File paths you actually read and reviewed (not just checked existence)",
            },
            observations: {
              type: "string",
              minLength: 100,
              description:
                "What you observed in the code - specific details proving you read it (min 100 chars)",
            },
            quality_assessment: {
              type: "string",
              minLength: 50,
              description:
                "Your assessment of code quality, patterns used, potential issues (min 50 chars)",
            },
          },
          required: ["files_reviewed", "observations", "quality_assessment"],
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
      required: ["task_id", "judgment", "rationale", "manual_review"],
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
        early_escalation_reason: {
          type: "string",
          description:
            "Required when retry_count=0. Justify why immediate escalation is needed (e.g., external blocker, access issue). Min 10 chars.",
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
  {
    role: "orchestrator",
    name: "get_amendments",
    description:
      "List all amendments made to tasks after initial configuration. Shows verification criteria changes, task metadata updates, and handover modifications with full before/after audit trail.",
    inputSchema: {
      type: "object",
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
  },

  // Configuration Tools - ORCHESTRATOR ONLY
  {
    role: "orchestrator",
    name: "set_active_sprint",
    description:
      "Set a sprint as the active sprint. Only one sprint can be active at a time. " +
      "All other sprints are deactivated when this is called. " +
      "Use this to switch between sprints when working on multiple sprints.",
    inputSchema: {
      type: "object",
      properties: {
        sprint_id: {
          type: "string",
          description: "The ID of the sprint to set as active",
        },
      },
      required: ["sprint_id"],
    },
  },
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
  {
    role: "orchestrator",
    name: "get_sprint_config",
    description:
      "Get a sprint-specific configuration value with fallback to global config. If no sprint_id provided, uses active sprint.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Configuration key" },
        sprint_id: {
          type: "string",
          description: "Sprint ID (optional, defaults to active sprint)",
        },
      },
      required: ["key"],
    },
  },
  {
    role: "orchestrator",
    name: "set_sprint_config",
    description:
      "Set a sprint-specific configuration value. If no sprint_id provided, uses active sprint.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Configuration key" },
        value: { type: "string", description: "Configuration value" },
        description: {
          type: "string",
          description: "Optional description of the configuration",
        },
        sprint_id: {
          type: "string",
          description: "Sprint ID (optional, defaults to active sprint)",
        },
      },
      required: ["key", "value"],
    },
  },
  // Debug tool - available to all
  {
    role: "shared",
    name: "debug_environment",
    description:
      "DEBUG: Show MCP server environment and test command execution. Use to diagnose pre-signal check failures.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Command to test (default: npm test)",
        },
      },
      required: [],
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
        // Sprint Config (7 tools)
        case "configure_sprint":
          return await handleConfigureSprint(args);
        case "add_phase":
          return await (
            await import("./handlers/add-phase.js")
          ).handleAddPhase(args);
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
        case "get_amendments":
          return await (
            await import("./handlers/get-amendments.js")
          ).handleGetAmendments(args);

        // Configuration (4 tools)
        case "set_active_sprint":
          return await (
            await import("./handlers/set-active-sprint.js")
          ).handleSetActiveSprint(args);
        case "set_config":
          return await handleSetConfig(args);
        case "get_sprint_config":
          return await handleGetSprintConfig(args);
        case "set_sprint_config":
          return await handleSetSprintConfig(args);

        // Debug tool
        case "debug_environment": {
          const { handleDebugEnvironment } = await import(
            "./handlers/debug-environment.js"
          );
          const result = await handleDebugEnvironment(args);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }

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
