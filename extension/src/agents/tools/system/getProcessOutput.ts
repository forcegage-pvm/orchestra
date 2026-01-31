/**
 * getProcessOutput tool - Retrieve output from a background process
 */

import { ToolErrorCode } from "../errors.js";
import { ProcessManager } from "../infrastructure/ProcessManager.js";
import type {
  AgentTool,
  GetProcessOutputInput,
  GetProcessOutputResult,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { GetProcessOutputInputSchema } from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

const TOOL_NAME = "get_process_output";

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

/**
 * Agent tool for retrieving background process output
 * Fetches buffered stdout/stderr with optional line limits and ANSI stripping
 * Respects CancellationToken for interruptibility
 * @property name - Tool identifier: "get_process_output"
 * @property description - Human-readable tool description
 * @property inputSchema - JSON Schema defining input parameters
 * @property invoke - Execute the tool with validated input
 */
export const getProcessOutputTool: AgentTool<GetProcessOutputInput> = {
  name: TOOL_NAME,
  description: "Retrieve buffered output for a background process.",
  inputSchema: {
    type: "object",
    properties: {
      process_id: {
        type: "string",
        description: "Process identifier to fetch output for",
      },
      since_last_read: {
        type: "boolean",
        description: "Return only new output since last read",
      },
      max_lines: {
        type: "number",
        description: "Maximum number of lines to return",
      },
      include_ansi: {
        type: "boolean",
        description: "Include ANSI escape codes in output",
      },
    },
    required: ["process_id"],
  },
  invoke: async (
    input: GetProcessOutputInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => {
    if (context.token.isCancellationRequested) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.CANCELLED,
          "Output retrieval cancelled.",
          "Retry after cancellation is cleared.",
        ),
      );
    }

    const parsed = GetProcessOutputInputSchema.safeParse(input);
    if (!parsed.success) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          "Invalid get_process_output input.",
          "Check the process_id and optional flags.",
          { issues: parsed.error.issues },
        ),
      );
    }

    const manager = ProcessManager.getInstance();
    const info = manager.getProcessInfo(parsed.data.process_id);
    if (!info) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          "Process not found.",
          "Verify the process_id and try again.",
          { process_id: parsed.data.process_id },
        ),
      );
    }

    const options: GetProcessOutputOptions = {};
    if (parsed.data.since_last_read !== undefined) {
      options.sinceLastRead = parsed.data.since_last_read;
    }
    if (parsed.data.max_lines !== undefined) {
      options.maxLines = parsed.data.max_lines;
    }
    if (parsed.data.include_ansi !== undefined) {
      options.includeAnsi = parsed.data.include_ansi;
    }

    const output = manager.getProcessOutput(parsed.data.process_id, options);

    if (!output) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          "Process not found.",
          "Verify the process_id and try again.",
          { process_id: parsed.data.process_id },
        ),
      );
    }

    const result: GetProcessOutputResult = {
      success: true,
      process_id: parsed.data.process_id,
      status: info.status,
      output: output.output,
      truncated: output.truncated,
      lines_returned: output.linesReturned,
      total_lines: output.totalLines,
    };

    return buildToolResult(
      successResult(TOOL_NAME, [
        { type: "json", value: JSON.stringify(result, null, 2) },
      ]),
    );
  },
};
