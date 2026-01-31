/**
 * stopProcess tool - Stop a background process
 */

import { ToolErrorCode } from "../errors.js";
import { ProcessManager } from "../infrastructure/ProcessManager.js";
import type {
  AgentTool,
  StopProcessInput,
  StopProcessResult,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { StopProcessInputSchema } from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

const TOOL_NAME = "stop_process";

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

export const stopProcessTool: AgentTool<StopProcessInput> = {
  name: TOOL_NAME,
  description: "Stop a background process by process id.",
  inputSchema: {
    type: "object",
    properties: {
      process_id: {
        type: "string",
        description: "Process identifier to stop",
      },
      graceful_timeout_ms: {
        type: "number",
        description: "Graceful timeout before SIGKILL",
      },
    },
    required: ["process_id"],
  },
  invoke: async (
    input: StopProcessInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => {
    if (context.token.isCancellationRequested) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.CANCELLED,
          "Process stop cancelled.",
          "Retry the command after cancellation is cleared.",
        ),
      );
    }

    const parsed = StopProcessInputSchema.safeParse(input);
    if (!parsed.success) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          "Invalid stop_process input.",
          "Check the process_id and graceful_timeout_ms fields.",
          { issues: parsed.error.issues },
        ),
      );
    }

    try {
      const options: StopProcessOptions = {};
      if (parsed.data.graceful_timeout_ms !== undefined) {
        options.gracefulTimeoutMs = parsed.data.graceful_timeout_ms;
      }
      if (context.token !== undefined) {
        options.token = context.token;
      }

      const manager = ProcessManager.getInstance();
      const result = await manager.stopProcess(parsed.data.process_id, options);

      if (!result) {
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

      const output: StopProcessResult = {
        success: true,
        process_id: parsed.data.process_id,
        force_killed: result.forceKilled,
      };

      if (result.exitCode !== undefined) {
        output.exit_code = result.exitCode;
      }

      return buildToolResult(
        successResult(TOOL_NAME, [
          { type: "json", value: JSON.stringify(output, null, 2) },
        ]),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const code =
        message === "Operation cancelled."
          ? ToolErrorCode.CANCELLED
          : ToolErrorCode.UNKNOWN;

      return buildToolResult(
        errorResult(
          TOOL_NAME,
          code,
          message,
          code === ToolErrorCode.CANCELLED
            ? "Retry the command after cancellation is cleared."
            : "Check the process state and try again.",
        ),
      );
    }
  },
};
