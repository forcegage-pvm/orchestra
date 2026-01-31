/**
 * startProcess tool - Start a background process and return a process id
 */

import { ToolErrorCode } from "../errors.js";
import { ProcessManager } from "../infrastructure/ProcessManager.js";
import type {
  AgentTool,
  StartProcessInput,
  StartProcessResult,
  ToolError,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { StartProcessInputSchema } from "../types.js";
import { validatePath } from "../utils/pathValidation.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

const TOOL_NAME = "start_process";
const ANSI_PATTERN = /\x1B\[[0-9;]*[a-zA-Z]/g;

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

function errorFromToolError(error: ToolError): ToolResult {
  return buildToolResult({
    success: false,
    content: [{ type: "error", value: error.message }],
    error,
    metadata: {
      toolName: TOOL_NAME,
      callId: "",
      durationMs: 0,
    },
  });
}

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}

/**
 * Agent tool for starting background processes
 * Spawns a process, monitors its output, and optionally waits for a ready pattern
 * Respects CancellationToken for interruptibility
 * @property name - Tool identifier: "start_process"
 * @property description - Human-readable tool description
 * @property inputSchema - JSON Schema defining input parameters
 * @property invoke - Execute the tool with validated input
 */
export const startProcessTool: AgentTool<StartProcessInput> = {
  name: TOOL_NAME,
  description:
    "Start a background process and return its process id and initial output.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Command to run",
      },
      cwd: {
        type: "string",
        description: "Working directory to run the command in",
      },
      ready_pattern: {
        type: "string",
        description: "Regex pattern that signals readiness",
      },
      ready_timeout_ms: {
        type: "number",
        description: "Optional readiness timeout in milliseconds",
      },
      env: {
        type: "object",
        description: "Environment variables to set for the process",
      },
    },
    required: ["command"],
  },
  invoke: async (
    input: StartProcessInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => {
    if (context.token.isCancellationRequested) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.CANCELLED,
          "Process start cancelled.",
          "Retry the command after cancellation is cleared.",
        ),
      );
    }

    const parsed = StartProcessInputSchema.safeParse(input);
    if (!parsed.success) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          "Invalid start_process input.",
          "Check the command, cwd, and ready_pattern fields.",
          { issues: parsed.error.issues },
        ),
      );
    }

    const validatedInput = parsed.data;
    const resolvedOptions: {
      command: string;
      cwd?: string;
      env?: Record<string, string>;
      readyPattern?: RegExp;
      token: ToolInvocationContext["token"];
    } = {
      command: validatedInput.command,
      token: context.token,
    };

    if (validatedInput.cwd) {
      const validatedPath = await validatePath(
        validatedInput.cwd,
        context.workspaceRoot,
      );
      if (!validatedPath.isValid) {
        return errorFromToolError(validatedPath.error);
      }
      resolvedOptions.cwd = validatedPath.absolutePath;
    }

    if (validatedInput.env) {
      resolvedOptions.env = validatedInput.env;
    }

    if (validatedInput.ready_pattern) {
      try {
        resolvedOptions.readyPattern = new RegExp(validatedInput.ready_pattern);
      } catch {
        return buildToolResult(
          errorResult(
            TOOL_NAME,
            ToolErrorCode.INVALID_INPUT,
            "Invalid ready_pattern regex.",
            "Provide a valid JavaScript regular expression string.",
            { ready_pattern: validatedInput.ready_pattern },
          ),
        );
      }
    }

    try {
      const manager = ProcessManager.getInstance();
      const { processId, info, initialOutput } =
        await manager.startProcess(resolvedOptions);

      const output: StartProcessResult = {
        success: true,
        process_id: processId,
        status: info.status,
        initial_output: stripAnsi(initialOutput),
      };

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
            : "Check the command and try again.",
        ),
      );
    }
  },
};
