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
 * Extended for Controller Agent: 'controller' for independent review role
 */
export type ServerRole = "orchestrator" | "implementor" | "controller" | "full";

/**
 * Tool role assignments
 * - orchestrator: Tools only the orchestrator should access
 * - implementor: Tools only the implementor should access
 * - controller: Tools only the controller should access (review decisions)
 * - shared: Tools all roles can access
 */
type ToolRole = "orchestrator" | "implementor" | "controller" | "shared";

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
      "Configure a new sprint with tasks, phases, dependencies, and verification criteria. Can accept inline data OR a config_file path to load configuration from filesystem. IMPORTANT: If any task has tdd_red_phase=true, you MUST provide a corresponding entry in tdd_relationships declaring which task will be the green phase.",
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
        environment: {
          type: "object",
          description:
            "REQUIRED: Testing/build environment configuration. Eliminates guessing about test commands and file patterns.",
          properties: {
            test_command: {
              type: "string",
              description:
                "Command to run tests (e.g., 'npm test', 'flutter test', 'pytest', 'cargo test')",
            },
            test_file_pattern: {
              type: "string",
              description:
                "Glob pattern for test files (e.g., 'test/**/*.test.ts', 'test/**/*_test.dart')",
            },
            source_base_dir: {
              type: "string",
              description:
                "Base directory for source files - for monorepos (e.g., '.', 'extension', 'packages/app')",
            },
          },
          required: ["test_command", "test_file_pattern"],
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
              tdd_red_phase: {
                type: "boolean",
                description:
                  "Enable TDD red-phase verification. REQUIRES a corresponding entry in tdd_relationships declaring which task will implement the feature (green phase). Red and green phases must be SEPARATE tasks.",
              },
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
        tdd_relationships: {
          type: "array",
          description:
            "REQUIRED for any task with tdd_red_phase=true. Declares which task will implement the feature (green phase) for each red-phase task. Red and green must be separate tasks.",
          items: {
            type: "object",
            properties: {
              red_task_id: {
                type: "number",
                description:
                  "Task ID of the red-phase task (must have tdd_red_phase=true)",
              },
              green_task_id: {
                type: "number",
                description:
                  "Task ID of the green-phase task that will implement the feature and make tests pass (must be different from red_task_id)",
              },
            },
            required: ["red_task_id", "green_task_id"],
          },
        },
      },
    },
  },
  {
    role: "orchestrator",
    name: "add_task",
    description:
      "Add a new task to an existing sprint. Task ID will be auto-assigned as max(existing_task_ids) + 1. Allowed during SPEC_REVIEW only when sprint status is SPEC_REVIEW_FAILED (Controller revisions).",
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
        tdd_red_phase: {
          type: "boolean",
          description:
            "Enable TDD red-phase verification: verify tests FAIL before implementation to prove tests are meaningful",
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
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "number", description: "The task ID" },
        title: { type: "string" },
        description: { type: "string" },
        category: {
          type: "string",
          enum: ["INFRASTRUCTURE", "INTEGRATION", "VISUAL", "REFACTOR"],
        },
        dependencies: { type: "array", items: { type: "number" } },
        phase_id: { type: "string" },
        speckit_task_ref: { type: "string" },
        tdd_red_phase: { type: "boolean" },
        rationale: {
          type: "string",
          description:
            "Required when updating task metadata after CONFIGURE (e.g., after SPEC_REVIEW_FAILED)",
        },
      },
      required: ["task_id"],
    },
  },
  {
    role: "orchestrator",
    name: "update_verification",
    description:
      "Replace ALL verification checks for a task with new criteria. " +
      "Supports 4 check types: structural_checks (file existence/content patterns via glob paths + regex), " +
      "behavioral_checks (shell commands with expected exit codes/output — NOT for running tests), " +
      "quality_checks (code quality via commands or file pattern matching), and " +
      "test_verification (declarative test execution — specify tier + expected outcome instead of shell commands). " +
      "Allowed during CONFIGURE (initial setup), PREPARE (spec error corrections), and SPEC_REVIEW only when sprint status is SPEC_REVIEW_FAILED. " +
      "When called outside CONFIGURE, creates an amendment record with full audit trail.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: {
          type: "number",
          description: "The task ID to update verification for",
        },
        verification: {
          type: "object",
          description:
            "New verification criteria. Must contain at least one check across any of the 4 check types. " +
            "IMPORTANT: Do NOT put test execution commands (npm test, vitest, jest, pytest, etc.) in behavioral_checks — " +
            "use test_verification instead.",
          properties: {
            structural_checks: {
              type: "array",
              description:
                "Verify file existence and content patterns. Each check uses a glob path to find files and an optional regex pattern to match content within them. " +
                "Use for: ensuring files exist, checking exports, verifying imports, confirming configuration entries.",
              items: {
                type: "object",
                properties: {
                  description: {
                    type: "string",
                    description: "Human-readable description of what this check verifies",
                  },
                  severity: {
                    type: "string",
                    enum: ["BLOCKING", "MAJOR", "MINOR", "INFO"],
                    description: "BLOCKING = must pass for verification to succeed, MAJOR/MINOR/INFO = advisory",
                  },
                  path: {
                    type: "string",
                    description:
                      "Glob pattern or file path to check. Must contain glob characters (*?[]{}) or end with a file extension. " +
                      "Examples: 'src/handlers/*.ts', 'src/core/utils.ts', 'test/**/*.test.ts'. " +
                      "Bare directory paths like 'src/handlers' are rejected.",
                  },
                  pattern: {
                    type: "string",
                    description: "Optional regex pattern to search for within matched files. Example: 'export (function|class) \\w+'",
                  },
                  min_matches: {
                    type: "number",
                    description: "Minimum number of files that must match the path (and pattern if given). Default: 1",
                  },
                },
                required: ["description", "severity", "path"],
              },
            },
            behavioral_checks: {
              type: "array",
              description:
                "Run shell commands and verify exit codes/output. Use for: checking CLI behavior, verifying build succeeds, running linters. " +
                "DO NOT use for running tests (npm test, vitest, jest, pytest, etc.) — use test_verification instead. " +
                "Commands must be cross-platform compatible (no bash && operator — use ; instead).",
              items: {
                type: "object",
                properties: {
                  description: {
                    type: "string",
                    description: "Human-readable description of what this check verifies",
                  },
                  severity: {
                    type: "string",
                    enum: ["BLOCKING", "MAJOR", "MINOR", "INFO"],
                    description: "BLOCKING = must pass for verification to succeed, MAJOR/MINOR/INFO = advisory",
                  },
                  command: {
                    type: "string",
                    description:
                      "Shell command to execute. Must NOT contain test runners (npm test, vitest, jest, mocha, pytest, cargo test, go test, etc.). " +
                      "Use test_verification for test execution. Must be cross-platform (use ; not && for chaining). " +
                      "Examples: 'npm run lint', 'npx tsc --noEmit', 'node -e \"require('./dist/index.js')\"'",
                  },
                  expect_exit_code: {
                    type: "number",
                    description: "Expected process exit code. Default: 0 (success). Use non-zero to verify a command fails as expected.",
                  },
                  expect_output_contains: {
                    type: "string",
                    description: "String that must appear in command stdout/stderr for the check to pass",
                  },
                },
                required: ["description", "severity", "command"],
              },
            },
            quality_checks: {
              type: "array",
              description:
                "Check code quality via commands or file content patterns. Must have EITHER a 'command' OR both 'path' and 'pattern'. " +
                "Use for: checking code coverage thresholds, verifying no TODO comments, ensuring consistent naming.",
              items: {
                type: "object",
                properties: {
                  description: {
                    type: "string",
                    description: "Human-readable description of what this check verifies",
                  },
                  severity: {
                    type: "string",
                    enum: ["BLOCKING", "MAJOR", "MINOR", "INFO"],
                    description: "BLOCKING = must pass for verification to succeed, MAJOR/MINOR/INFO = advisory",
                  },
                  command: {
                    type: "string",
                    description: "Shell command to run for quality checking (alternative to path+pattern). Example: 'npx tsc --noEmit'",
                  },
                  path: {
                    type: "string",
                    description: "Glob path to files to check (used with 'pattern'). Example: 'src/**/*.ts'",
                  },
                  pattern: {
                    type: "string",
                    description: "Regex pattern to search for in matched files (used with 'path'). Example: '// TODO'",
                  },
                  min_matches: {
                    type: "number",
                    description: "Minimum number of pattern matches required",
                  },
                },
                required: ["description", "severity"],
              },
            },
            test_verification: {
              type: "array",
              description:
                "Declarative test execution checks. Use INSTEAD of behavioral_checks for running tests. " +
                "Specify which test tier to run and the expected outcome — the system runs the tests internally via the extension test runner. " +
                "Example: [{ \"tier\": \"unit\", \"expect\": \"all_pass\" }] to verify all unit tests pass. " +
                "For TDD red-phase tasks, use { \"tier\": \"unit\", \"expect\": \"any_fail\" } to verify tests fail before implementation.",
              items: {
                type: "object",
                properties: {
                  tier: {
                    type: "string",
                    description:
                      "Test tier name. Must match a tier configured in .agent-test-config.json. " +
                      "Common tiers: 'smoke', 'unit', 'integration', 'extension-smoke', 'extension-unit', 'extension-integration'",
                  },
                  expect: {
                    type: "string",
                    enum: ["all_pass", "any_fail", "min_pass_count"],
                    description:
                      "Expected test outcome. 'all_pass' = every test must pass. " +
                      "'any_fail' = at least one test must fail (TDD red phase — proves tests are meaningful before implementation). " +
                      "'min_pass_count' = at least min_pass_count tests must pass (requires min_pass_count field).",
                  },
                  min_pass_count: {
                    type: "number",
                    description: "Required when expect='min_pass_count'. The minimum number of tests that must pass.",
                  },
                },
                required: ["tier", "expect"],
              },
            },
          },
        },
        rationale: {
          type: "string",
          description:
            "Required when updating outside CONFIGURE phase (min 10 chars). Explains why the verification criteria are being amended.",
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
      "Create handover for implementor with acceptance criteria and file operations. " +
      "Optionally includes verification checks (structural, behavioral, quality, test_verification). " +
      "For test execution, use test_verification instead of behavioral_checks.",
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
        tdd_red_phase: {
          type: "boolean",
          description:
            "Enable TDD red-phase verification: verify tests FAIL before implementation to prove tests are meaningful",
        },
        verification: {
          type: "object",
          description:
            "Optional verification checks to attach during preparation. Same structure as update_verification. " +
            "IMPORTANT: Do NOT put test execution commands in behavioral_checks — use test_verification instead.",
          properties: {
            structural_checks: {
              type: "array",
              description: "Verify file existence and content patterns via glob paths + regex.",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  severity: { type: "string", enum: ["BLOCKING", "MAJOR", "MINOR", "INFO"] },
                  path: { type: "string", description: "Glob pattern or file path (must contain glob chars or file extension)" },
                  pattern: { type: "string", description: "Optional regex to match within files" },
                  min_matches: { type: "number" },
                },
                required: ["description", "severity", "path"],
              },
            },
            behavioral_checks: {
              type: "array",
              description: "Run shell commands and verify exit codes/output. NOT for test execution — use test_verification.",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  severity: { type: "string", enum: ["BLOCKING", "MAJOR", "MINOR", "INFO"] },
                  command: { type: "string", description: "Shell command (no test runners — use test_verification)" },
                  expect_exit_code: { type: "number" },
                  expect_output_contains: { type: "string" },
                },
                required: ["description", "severity", "command"],
              },
            },
            quality_checks: {
              type: "array",
              description: "Code quality checks via command or file pattern matching.",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  severity: { type: "string", enum: ["BLOCKING", "MAJOR", "MINOR", "INFO"] },
                  command: { type: "string" },
                  path: { type: "string" },
                  pattern: { type: "string" },
                  min_matches: { type: "number" },
                },
                required: ["description", "severity"],
              },
            },
            test_verification: {
              type: "array",
              description:
                "Declarative test execution. Specify tier + expected outcome instead of shell commands. " +
                "Example: [{ \"tier\": \"unit\", \"expect\": \"all_pass\" }]",
              items: {
                type: "object",
                properties: {
                  tier: { type: "string", description: "Test tier (e.g. 'unit', 'smoke', 'integration')" },
                  expect: { type: "string", enum: ["all_pass", "any_fail", "min_pass_count"], description: "Expected outcome" },
                  min_pass_count: { type: "number", description: "Required when expect='min_pass_count'" },
                },
                required: ["tier", "expect"],
              },
            },
          },
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
  {
    role: "shared",
    name: "add_interface_validation",
    description:
      "Add a new interface validation to .orchestra/interface-validations.yaml",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Validation name" },
        description: {
          type: "string",
          description: "Optional validation description",
        },
        patterns: {
          type: "array",
          items: { type: "string" },
          description: "File match patterns for this validation",
        },
        command: {
          type: "string",
          description: "Command to run for validation",
        },
        test: {
          type: "string",
          description: "Test file reference for validation",
        },
        successCriteria: {
          type: "object",
          description: "Optional success criteria",
          properties: {
            exitCode: { type: "number", description: "Expected exit code" },
            outputContains: {
              type: "string",
              description: "Output must contain this string",
            },
            outputNotContains: {
              type: "string",
              description: "Output must not contain this string",
            },
          },
        },
      },
      required: ["name", "patterns"],
      oneOf: [
        { required: ["command"], not: { required: ["test"] } },
        { required: ["test"], not: { required: ["command"] } },
      ],
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
  },
  {
    role: "orchestrator",
    name: "reopen_task",
    description:
      "Reopen a COMPLETE task when latest code review is CHANGES_REQUESTED and issues are OPEN.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: { type: "number", description: "The task ID to reopen" },
        reason: {
          type: "string",
          description: "Why this task is being reopened (min 10 chars)",
        },
      },
      required: ["task_id", "reason"],
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
  {
    role: "orchestrator",
    name: "get_sprint_review",
    description:
      "Get the latest sprint review feedback when sprint is in SPEC_REVIEW_FAILED status. " +
      "Returns Controller's rejection reasons, alignment issues, and recommendations for fixing the sprint configuration.",
    inputSchema: {
      type: "object",
      properties: {
        sprint_id: {
          type: "string",
          description:
            "Sprint ID to get review for (optional, defaults to active sprint)",
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
    name: "archive_sprint",
    description:
      "Archive a sprint so it no longer appears in active views. " +
      "Active sprints must be deactivated before they can be archived.",
    inputSchema: {
      type: "object",
      properties: {
        sprint_id: {
          type: "string",
          description: "The ID of the sprint to archive",
        },
      },
      required: ["sprint_id"],
    },
  },
  {
    role: "orchestrator",
    name: "unarchive_sprint",
    description:
      "Unarchive a sprint so it appears in active views again. " +
      "Only archived sprints can be unarchived.",
    inputSchema: {
      type: "object",
      properties: {
        sprint_id: {
          type: "string",
          description: "The ID of the sprint to unarchive",
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
    role: "shared",
    name: "get_sprint_config",
    description:
      "Get a sprint-specific configuration value with fallback to global config. If no sprint_id provided, uses active sprint. Useful for debugging test configuration issues.",
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
  {
    role: "orchestrator",
    name: "update_sprint_spec",
    description:
      "Update spec_path and/or spec_files for a sprint. Use to configure or modify spec traceability after sprint creation.",
    inputSchema: {
      type: "object",
      properties: {
        sprint_id: {
          type: "string",
          description: "Sprint ID (optional, defaults to active sprint)",
        },
        spec_path: {
          type: "string",
          description: "Path to main specification file",
        },
        spec_files: {
          type: "array",
          items: { type: "string" },
          description: "Array of related spec file paths (e.g., tasks.md)",
        },
      },
      required: [],
    },
  },

  // ============================================================================
  // Controller Agent Tools - Sprint Review (Sprint 004)
  // ============================================================================

  // T020: approve_sprint - CONTROLLER ONLY
  {
    role: "controller",
    name: "approve_sprint",
    description:
      "Approve a sprint configuration after reviewing against the specification. " +
      "Transitions sprint from PENDING_SPEC_REVIEW to ACTIVE, allowing task preparation.",
    inputSchema: {
      type: "object",
      properties: {
        conformance: {
          type: "string",
          enum: ["PASS", "WARN"],
          description:
            "Conformance level: PASS for full alignment, WARN for minor issues",
        },
        notes: {
          type: "string",
          description:
            "Required if conformance is WARN - explain the minor issues",
        },
        spec_path: {
          type: "string",
          description: "Path to the specification document that was reviewed",
        },
        spec_requirements: {
          type: "array",
          items: { type: "string" },
          description: "List of specification requirements that were verified",
        },
        recommendations: {
          type: "array",
          items: { type: "string" },
          description: "Optional recommendations for the orchestrator",
        },
      },
      required: ["conformance"],
    },
  },

  // T020: reject_sprint - CONTROLLER ONLY
  {
    role: "controller",
    name: "reject_sprint",
    description:
      "Reject a sprint configuration that does not align with the specification. " +
      "Transitions sprint to SPEC_REVIEW_FAILED. After 3 rejections, escalates to human supervisor.",
    inputSchema: {
      type: "object",
      properties: {
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              severity: { type: "string", enum: ["BLOCKING", "MAJOR"] },
              issue: { type: "string" },
              spec_reference: { type: "string" },
              handover_text: { type: "string" },
              spec_text: { type: "string" },
              analysis: { type: "string" },
              recommendation: { type: "string" },
            },
            required: ["severity", "issue"],
          },
          description:
            "Issues identified during review (at least one required)",
        },
        conformance: {
          type: "string",
          enum: ["FAIL"],
          description: "Must be FAIL when rejecting",
        },
        notes: {
          type: "string",
          description:
            "Explanation of why the sprint configuration failed review (min 10 chars)",
        },
        spec_path: {
          type: "string",
          description: "Path to the specification document that was reviewed",
        },
        spec_requirements: {
          type: "array",
          items: { type: "string" },
          description: "List of specification requirements that were violated",
        },
        recommendations: {
          type: "array",
          items: { type: "string" },
          description: "Recommendations for how to fix the issues",
        },
      },
      required: ["issues", "conformance", "notes"],
    },
  },

  // T021: resubmit_sprint - ORCHESTRATOR ONLY
  {
    role: "orchestrator",
    name: "resubmit_sprint",
    description:
      "Resubmit a sprint configuration after addressing Controller feedback. " +
      "Transitions sprint from SPEC_REVIEW_FAILED back to PENDING_SPEC_REVIEW.",
    inputSchema: {
      type: "object",
      properties: {
        changes_made: {
          type: "string",
          description:
            "Description of changes made to address Controller feedback (min 20 chars)",
        },
        issues_addressed: {
          type: "array",
          items: { type: "string" },
          description:
            "List of issues from Controller feedback that were addressed",
        },
      },
      required: ["changes_made", "issues_addressed"],
    },
  },

  // T028: approve_handover - CONTROLLER ONLY
  {
    role: "controller",
    name: "approve_handover",
    description:
      "Approve a task handover that meets specification requirements. " +
      "Transitions task from PENDING_HANDOVER_REVIEW to IMPLEMENT, allowing implementation to begin.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: {
          type: "number",
          description: "The task ID whose handover to approve",
        },
        conformance: {
          type: "string",
          enum: ["PASS", "WARN"],
          description:
            "Assessment of handover conformance to specifications (PASS or WARN for approvals)",
        },
        notes: {
          type: "string",
          description:
            "Optional approval notes or recommendations (required if conformance is WARN)",
        },
      },
      required: ["task_id", "conformance"],
    },
  },

  // T028: reject_handover - CONTROLLER ONLY
  {
    role: "controller",
    name: "reject_handover",
    description:
      "Reject a task handover that does not meet specification requirements. " +
      "Transitions task to HANDOVER_REVIEW_FAILED. After 3 rejections, escalates to human supervisor.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: {
          type: "number",
          description: "The task ID whose handover to reject",
        },
        conformance: {
          type: "string",
          enum: ["FAIL"],
          description:
            "Assessment of handover conformance (must be FAIL for rejections)",
        },
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              severity: { type: "string", enum: ["BLOCKING", "MAJOR"] },
              issue: { type: "string" },
              spec_reference: { type: "string" },
              recommendation: { type: "string" },
            },
            required: ["severity", "issue"],
          },
          description:
            "Issues identified in the handover (at least one required)",
        },
        recommendations: {
          type: "string",
          description:
            "Specific recommendations for the orchestrator to address",
        },
      },
      required: ["task_id", "conformance", "issues", "recommendations"],
    },
  },

  // T029: resubmit_handover - ORCHESTRATOR ONLY
  {
    role: "orchestrator",
    name: "resubmit_handover",
    description:
      "Resubmit a task handover after addressing Controller feedback. " +
      "Transitions task from HANDOVER_REVIEW_FAILED back to PENDING_HANDOVER_REVIEW.",
    inputSchema: {
      type: "object",
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
  },

  // ============================================================================
  // Controller Agent Read-Only Tools (Sprint 004 - T035)
  // ============================================================================

  // T035: get_task_for_review - CONTROLLER ONLY
  {
    role: "controller",
    name: "get_task_for_review",
    description:
      "Get task details for review purposes (WITHOUT verification criteria). " +
      "Used by Controller to see task metadata when reviewing sprint configuration or handovers.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: {
          type: "number",
          description: "The task ID to retrieve",
        },
      },
      required: ["task_id"],
    },
  },

  // T035: get_handover - CONTROLLER ONLY
  {
    role: "controller",
    name: "get_handover",
    description:
      "Get handover details for a specific task. Shows what the implementor will receive. " +
      "Used by Controller to verify handover aligns with specification requirements.",
    inputSchema: {
      type: "object",
      properties: {
        task_id: {
          type: "number",
          description: "The task ID to get handover for",
        },
      },
      required: ["task_id"],
    },
  },

  // T037: read_spec_file - CONTROLLER ONLY
  {
    role: "controller",
    name: "read_spec_file",
    description:
      "Read a specification file for review purposes. " +
      "Restricted to spec/, specs/, and docs/ directories for security.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "Path to the specification file, relative to workspace root. " +
            "Must be in spec/, specs/, or docs/ directory.",
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
  },

  // Code Review Summary Tool - SHARED (all roles can query)
  {
    role: "shared",
    name: "get_code_review_summary",
    description:
      "Get sprint-level code review summary for UI panels and dashboards.",
    inputSchema: {
      type: "object",
      properties: {
        sprint_id: { type: "string" },
      },
      required: ["sprint_id"],
    },
  },

  // Code Review Query Tool - SHARED (single review or sprint summary)
  {
    role: "shared",
    name: "get_code_review",
    description:
      "Get the latest code review for a task or sprint-level review summary.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "number" },
        sprint_id: { type: "string" },
        include_issues: { type: "boolean" },
        include_history: { type: "boolean" },
        handover_context: { type: "boolean" },
      },
      required: [],
    },
  },

  // Code Review Decision Tool - CONTROLLER ONLY
  {
    role: "controller",
    name: "submit_code_review",
    description:
      "Submit a code review decision with required artifacts for a sprint task.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "number" },
        decision: {
          type: "string",
          enum: ["APPROVED", "CHANGES_REQUESTED", "REJECTED"],
          description: "Review decision",
        },
        summary: {
          type: "string",
          description: "Review summary (min 30 characters)",
        },
        risk: {
          type: "string",
          enum: ["LOW", "MEDIUM", "HIGH"],
          description: "Risk assessment",
        },
        files_reviewed: {
          type: "array",
          items: { type: "string" },
          description: "List of files reviewed",
        },
        tests_run: { type: "array", items: { type: "string" } },
        commit_range: { type: "string" },
        issues: {
          type: "array",
          description: "Required for CHANGES_REQUESTED/REJECTED decisions",
          items: {
            type: "object",
            properties: {
              severity: {
                type: "string",
                enum: ["BLOCKING", "MAJOR", "MINOR"],
              },
              issue: { type: "string", description: "Issue description" },
              rationale: {
                type: "string",
                description: "Why this is an issue (REQUIRED)",
              },
              spec_ref: { type: "string" },
              file: { type: "string" },
              line: { type: "number" },
              recommendation: { type: "string" },
            },
            required: ["severity", "issue", "rationale"],
          },
        },
        recommendations: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
        verifying_fixes: { type: "boolean" },
      },
      required: ["task", "decision", "summary", "risk", "files_reviewed"],
    },
  },

  // Code Review Fix Tool - IMPLEMENTOR ONLY
  {
    role: "implementor",
    name: "fix_code_review",
    description:
      "Resolve code review issues and submit fixes for verification (implementor).",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["GET_ISSUES", "RESOLVE_ISSUE", "SUBMIT_FIXES"],
        },
        issue_id: { type: "number" },
        fix_summary: { type: "string" },
        summary: { type: "string" },
        files_changed: { type: "array", items: { type: "string" } },
        tests_run: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
        skip_validation: { type: "boolean" },
      },
      required: ["action"],
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
 * Exported for testing (ISSUE-008)
 */
export function getToolsForRole(role: ServerRole): Tool[] {
  if (role === "full") {
    // Return all tools (strip role property)
    return TOOLS_WITH_ROLES.map(({ role: _role, ...tool }) => tool);
  }

  // Filter to role-specific + shared tools
  return TOOLS_WITH_ROLES.filter(
    (tool) => tool.role === role || tool.role === "shared",
  ).map(({ role: _role, ...tool }) => tool);
}

/**
 * Check if a tool is available for a role
 * Exported for testing (ISSUE-008)
 */
export function isToolAvailableForRole(
  toolName: string,
  role: ServerRole,
): boolean {
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
                    (t) => t.name === toolName,
                  )?.role,
                },
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    try {
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
        case "add_interface_validation":
          return await (
            await import("./handlers/add-interface-validation.js")
          ).handleAddInterfaceValidation(args);
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
        case "reopen_task":
          return await (
            await import("./handlers/reopen-task.js")
          ).handleReopenTask(args);
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
        case "get_sprint_review":
          return await (
            await import("./handlers/get-sprint-review.js")
          ).handleGetSprintReview(args);

        // Configuration (5 tools)
        case "set_active_sprint":
          return await (
            await import("./handlers/set-active-sprint.js")
          ).handleSetActiveSprint(args);
        case "archive_sprint":
          return await (
            await import("./handlers/archive-sprint.js")
          ).handleArchiveSprint(args);
        case "unarchive_sprint":
          return await (
            await import("./handlers/unarchive-sprint.js")
          ).handleUnarchiveSprint(args);
        case "set_config":
          return await handleSetConfig(args);
        case "get_sprint_config":
          return await handleGetSprintConfig(args);
        case "set_sprint_config":
          return await handleSetSprintConfig(args);
        case "update_sprint_spec":
          return await (
            await import("./handlers/update-sprint-spec.js")
          ).handleUpdateSprintSpec(args);

        // Controller Agent Tools (6 tools - sprint and handover review)
        case "approve_sprint":
          return await (
            await import("./handlers/approve-sprint.js")
          ).handleApproveSprint(args);
        case "reject_sprint":
          return await (
            await import("./handlers/reject-sprint.js")
          ).handleRejectSprint(args);
        case "resubmit_sprint":
          return await (
            await import("./handlers/resubmit-sprint.js")
          ).handleResubmitSprint(args);
        case "approve_handover":
          return await (
            await import("./handlers/approve-handover.js")
          ).handleApproveHandover(args);
        case "reject_handover":
          return await (
            await import("./handlers/reject-handover.js")
          ).handleRejectHandover(args);
        case "resubmit_handover":
          return await (
            await import("./handlers/resubmit-handover.js")
          ).handleResubmitHandover(args);

        // Controller Agent Read-Only Tools (T035)
        case "get_task_for_review":
          return await (
            await import("./handlers/get-task-for-review.js")
          ).handleGetTaskForReview(args);
        case "get_handover":
          return await (
            await import("./handlers/get-handover.js")
          ).handleGetHandover(args);
        case "read_spec_file":
          return await (
            await import("./handlers/read-spec-file.js")
          ).handleReadSpecFile(args);

        // Code Review Summary Tool (Sprint 005)
        case "get_code_review_summary":
          return await (
            await import("./handlers/get-code-review-summary.js")
          ).handleGetCodeReviewSummary(args);

        // Code Review Query Tool (Sprint 005)
        case "get_code_review":
          return await (
            await import("./handlers/get-code-review.js")
          ).handleGetCodeReview(args);

        // Code Review Decision Tool (Sprint 005)
        case "submit_code_review":
          return await (
            await import("./handlers/submit-code-review.js")
          ).handleSubmitCodeReview(args);

        // Code Review Fix Tool (Sprint 005)
        case "fix_code_review":
          return await (
            await import("./handlers/fix-code-review.js")
          ).handleFixCodeReview(args);

        // Debug tool
        case "debug_environment": {
          const { handleDebugEnvironment } =
            await import("./handlers/debug-environment.js");
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
                  2,
                ),
              },
            ],
          };
      }
    } catch (error) {
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
              2,
            ),
          },
        ],
      };
    }
  });
}
