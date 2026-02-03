/**
 * Orchestra controller tools index
 *
 * Barrel exports and registration helper for all controller tools.
 * Controller has LIMITED tools: read-only + judgment (approve/reject).
 */

import { handleApproveHandover } from "../../../../../src/mcp-server/handlers/approve-handover.js";
import { handleApproveSprint } from "../../../../../src/mcp-server/handlers/approve-sprint.js";
import { handleGetCodeReviewSummary } from "../../../../../src/mcp-server/handlers/get-code-review-summary.js";
import { handleGetCodeReview } from "../../../../../src/mcp-server/handlers/get-code-review.js";
import { handleGetHandover } from "../../../../../src/mcp-server/handlers/get-handover.js";
import { handleGetSprintStatus } from "../../../../../src/mcp-server/handlers/get-sprint-status.js";
import { handleGetTask } from "../../../../../src/mcp-server/handlers/get-task.js";
import { handleReadSpecFile } from "../../../../../src/mcp-server/handlers/read-spec-file.js";
import { handleRejectHandover } from "../../../../../src/mcp-server/handlers/reject-handover.js";
import { handleRejectSprint } from "../../../../../src/mcp-server/handlers/reject-sprint.js";
import { handleSubmitCodeReview } from "../../../../../src/mcp-server/handlers/submit-code-review.js";
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
        enum: ["PASS", "WARN"],
        description:
          "Level of spec conformance: PASS (fully aligned), WARN (minor issues)",
      },
      notes: {
        type: "string",
        description:
          "Optional approval notes. Required if conformance is WARN to explain minor issues.",
      },
      spec_path: {
        type: "string",
        description:
          "Optional: Path to the specification document that was reviewed",
      },
      spec_requirements: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional: List of specification requirements that were verified",
      },
      recommendations: {
        type: "array",
        items: { type: "string" },
        description: "Optional: Recommendations for the orchestrator",
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
            severity: {
              type: "string",
              enum: ["BLOCKING", "MAJOR"],
              description: "Severity of the issue",
            },
            issue: {
              type: "string",
              description: "Description of the issue",
            },
            spec_reference: {
              type: "string",
              description: "Optional: Reference to spec section violated",
            },
            handover_text: {
              type: "string",
              description: "Optional: Relevant text from handover",
            },
            spec_text: {
              type: "string",
              description: "Optional: Relevant text from specification",
            },
            analysis: {
              type: "string",
              description: "Optional: Analysis of the misalignment",
            },
            recommendation: {
              type: "string",
              description: "Optional: How to fix this specific issue",
            },
          },
          required: ["severity", "issue"],
        },
        description: "List of issues found (at least one required)",
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
        description:
          "Optional: Path to the specification document that was reviewed",
      },
      spec_requirements: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional: List of specification requirements that were violated",
      },
      recommendations: {
        type: "array",
        items: { type: "string" },
        description: "Optional: Recommendations for fixing the issues",
      },
    },
    required: ["issues", "conformance", "notes"],
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
            severity: {
              type: "string",
              enum: ["BLOCKING", "MAJOR"],
              description: "Severity of the issue",
            },
            issue: {
              type: "string",
              description: "Description of the issue",
            },
            spec_reference: {
              type: "string",
              description: "Optional: Reference to spec section violated",
            },
            handover_text: {
              type: "string",
              description: "Optional: Relevant text from handover",
            },
            spec_text: {
              type: "string",
              description: "Optional: Relevant text from specification",
            },
            analysis: {
              type: "string",
              description: "Optional: Analysis of the misalignment",
            },
            recommendation: {
              type: "string",
              description: "Optional: How to fix this specific issue",
            },
          },
          required: ["severity", "issue"],
        },
        description:
          "List of issues found in the handover (at least one required)",
      },
      recommendations: {
        type: "string",
        description:
          "Specific recommendations for the orchestrator to address (min 20 chars)",
      },
    },
    required: ["task_id", "conformance", "issues", "recommendations"],
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "reject_handover", handleRejectHandover, input),
};

// ==================== get_code_review_summary (read-only) ====================
const getCodeReviewSummaryTool: AgentTool = {
  name: "get_code_review_summary",
  description:
    "Get sprint-level code review summary for UI panels and dashboards. Shows overall review status.",
  inputSchema: {
    type: "object" as const,
    properties: {
      sprint_id: {
        type: "string",
        description: "The sprint ID to get summary for",
      },
    },
    required: ["sprint_id"],
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(
      context,
      "get_code_review_summary",
      handleGetCodeReviewSummary,
      input,
    ),
};

// ==================== get_code_review (read-only) ====================
const getCodeReviewTool: AgentTool = {
  name: "get_code_review",
  description:
    "Get the latest code review for a task or sprint-level review summary. Returns spec context (spec_path, spec_files[], spec_task_definitions[]).",
  inputSchema: {
    type: "object" as const,
    properties: {
      task: {
        type: "number",
        description: "The task ID to get code review for",
      },
      sprint_id: {
        type: "string",
        description: "The sprint ID (for sprint-level summary)",
      },
      include_issues: {
        type: "boolean",
        description: "Include review issues in response",
      },
      include_history: {
        type: "boolean",
        description: "Include review history in response",
      },
      handover_context: {
        type: "boolean",
        description: "Include handover context in response",
      },
    },
    required: [],
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(context, "get_code_review", handleGetCodeReview, input),
};

// ==================== submit_code_review (controller decision) ====================
const submitCodeReviewTool: AgentTool = {
  name: "submit_code_review",
  description:
    "Submit a code review decision with required artifacts for a sprint task. Decision can be APPROVED, CHANGES_REQUESTED, or REJECTED.",
  inputSchema: {
    type: "object" as const,
    properties: {
      task: {
        type: "number",
        description: "The task ID to review",
      },
      decision: {
        type: "string",
        description:
          "Review decision: APPROVED, CHANGES_REQUESTED, or REJECTED",
      },
      summary: {
        type: "string",
        description: "Summary of the code review findings",
      },
      risk: {
        type: "string",
        description: "Risk level: LOW, MEDIUM, or HIGH",
      },
      files_reviewed: {
        type: "array",
        items: { type: "string" },
        description: "List of files that were reviewed",
      },
      tests_run: {
        type: "array",
        items: { type: "string" },
        description: "List of tests that were run (optional)",
      },
      commit_range: {
        type: "string",
        description: "Git commit range reviewed (optional)",
      },
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            severity: {
              type: "string",
              description: "Issue severity: BLOCKING, MAJOR, MINOR, or INFO",
            },
            issue: {
              type: "string",
              description: "Description of the issue",
            },
            spec_ref: {
              type: "string",
              description: "Reference to specification (optional)",
            },
            file: {
              type: "string",
              description: "File where issue was found (optional)",
            },
            line: {
              type: "number",
              description: "Line number (optional)",
            },
            recommendation: {
              type: "string",
              description: "Recommendation to fix the issue (optional)",
            },
          },
          required: ["severity", "issue"],
        },
        description: "List of issues found during review (optional)",
      },
      recommendations: {
        type: "array",
        items: { type: "string" },
        description: "List of recommendations (optional)",
      },
      notes: {
        type: "string",
        description: "Additional notes (optional)",
      },
      verifying_fixes: {
        type: "boolean",
        description:
          "Set to true when verifying fixes from a previous CHANGES_REQUESTED review",
      },
    },
    required: ["task", "decision", "summary", "risk", "files_reviewed"],
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> =>
    executeMcpHandler(
      context,
      "submit_code_review",
      handleSubmitCodeReview,
      input,
    ),
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
  getCodeReviewSummaryTool,
  getCodeReviewTool,
  submitCodeReviewTool,
] as const;

export function registerOrchestraControllerTools(registry: ToolRegistry): void {
  registry.registerAll([...orchestraControllerTools]);
}

export {
  approveHandoverTool,
  approveSprintTool,
  getCodeReviewSummaryTool,
  getCodeReviewTool,
  getHandoverTool,
  getSprintStatusTool,
  getTaskTool,
  readSpecFileTool,
  rejectHandoverTool,
  rejectSprintTool,
  submitCodeReviewTool,
};
