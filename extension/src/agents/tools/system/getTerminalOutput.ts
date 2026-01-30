/**
 * getTerminalOutput tool - Retrieve buffered output for a terminal
 */

import { createToolError, ToolErrorCode } from "../errors.js";
import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import { successResult } from "../utils/resultBuilder.js";
import {
  clearBufferedOutput,
  getBufferedOutput,
} from "../utils/shellIntegration.js";

interface GetTerminalOutputInput {
  terminalId: string;
  clear?: boolean;
}

const TOOL_NAME = "get_terminal_output";

function buildToolResult(partial: Partial<ToolResult>): ToolResult {
  return {
    success: partial.success ?? false,
    content: partial.content ?? [],
    error: partial.error,
    metadata: partial.metadata ?? {
      toolName: TOOL_NAME,
      callId: "",
      durationMs: 0,
    },
  };
}

export const getTerminalOutputTool: AgentTool<GetTerminalOutputInput> = {
  name: TOOL_NAME,
  description: "Retrieve buffered output for a terminal by ID.",
  inputSchema: {
    type: "object",
    properties: {
      terminalId: {
        type: "string",
        description: "Terminal identifier to fetch output for",
      },
      clear: {
        type: "boolean",
        description: "Clear buffered output after reading",
      },
    },
    required: ["terminalId"],
  },
  invoke: async (
    input: GetTerminalOutputInput,
    _context: ToolInvocationContext,
  ): Promise<ToolResult> => {
    const output = getBufferedOutput(input.terminalId);

    if (output === undefined) {
      return buildToolResult({
        success: false,
        content: [{ type: "error", value: "Terminal not found." }],
        error: createToolError(
          ToolErrorCode.TERMINAL_NOT_FOUND,
          "Terminal not found.",
          "Ensure the terminal ID is correct and the command has produced output.",
          { terminalId: input.terminalId },
        ),
      });
    }

    if (input.clear) {
      clearBufferedOutput(input.terminalId);
    }

    const success = successResult(TOOL_NAME, output);
    return buildToolResult(success);
  },
};
