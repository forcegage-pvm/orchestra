/**
 * getSprintStatus tool - Wrapper around MCP handler for get_sprint_status
 *
 * This reuses the full MCP server implementation to ensure feature parity.
 */

import { handleGetSprintStatus } from "../../../../../src/mcp-server/handlers/get-sprint-status.js";
import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";
import { executeMcpHandler } from "./mcpAdapter.js";

export const getSprintStatusTool: AgentTool = {
  name: "get_sprint_status",
  description:
    "Get sprint status with phase summaries, task counts, and workflow state.",
  inputSchema: {
    type: "object",
    properties: {},
  },
  execute: async (
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    return executeMcpHandler(
      context.workspaceRoot,
      handleGetSprintStatus,
      input,
    );
  },
};
