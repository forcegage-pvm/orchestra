/**
 * runVerificationChecks tool - Wrapper around MCP handler for run_verification_checks
 *
 * This reuses the full MCP server implementation to ensure feature parity.
 */

import { handleRunVerificationChecks } from "../../../../../src/mcp-server/handlers/run-verification-checks.js";
import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";
import { executeMcpHandler } from "./mcpAdapter.js";

export const runVerificationChecksTool: AgentTool = {
  name: "run_verification_checks",
  description:
    "Execute verification checks from database and record results. " +
    "Runs structural, behavioral, and quality checks defined for the task.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "number", description: "The task ID to verify" },
      check_ids: {
        type: "array",
        description: "Optional: Specific check IDs to run",
        items: { type: "string" },
      },
      severity_filter: {
        type: "string",
        enum: ["BLOCKING", "MAJOR", "MINOR", "INFO", "all"],
        description: "Optional: Filter by severity level",
      },
      dry_run: {
        type: "boolean",
        description: "List checks without executing (default: false)",
      },
      continue_on_error: {
        type: "boolean",
        description:
          "Continue running checks even if one fails (default: false)",
      },
    },
    required: ["task_id"],
  },
  execute: async (
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    return executeMcpHandler(
      context.workspaceRoot,
      handleRunVerificationChecks,
      input,
    );
  },
};
