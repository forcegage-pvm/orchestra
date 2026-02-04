/**
 * getSprintStatus tool - Wrapper around MCP handler for get_sprint_status
 *
 * This reuses the full MCP server implementation to ensure feature parity.
 */

import { handleGetSprintStatus } from "../../../../../src/mcp-server/handlers/get-sprint-status.js";
import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import { executeMcpHandler } from "./mcpAdapter.js";

export const getSprintStatusTool: AgentTool = {
  name: "get_sprint_status",
  description:
    "Get sprint status with phase summaries, task counts, and workflow state.",
  inputSchema: {
    type: "object",
    properties: {},
  },
  invoke: async (
    input: unknown,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => {
    return executeMcpHandler(
      context,
      "get_sprint_status",
      handleGetSprintStatus,
      input,
    );
  },
};
