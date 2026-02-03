/**
 * runTerminal tool - Execute terminal commands using shell integration
 */

import * as vscode from "vscode";

import { createToolError, ToolErrorCode } from "../errors.js";
import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import { successResult } from "../utils/resultBuilder.js";
import {
  executeInTerminal,
  ShellExecutionError,
} from "../utils/shellIntegration.js";

interface RunTerminalInput {
  command: string;
  terminalId?: string;
  timeoutMs?: number;
}

const TOOL_NAME = "run_terminal";
const DEFAULT_TIMEOUT_MS = 240_000;

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

function resolveTerminal(terminalId?: string): vscode.Terminal {
  if (terminalId) {
    const existing = vscode.window.terminals.find(
      (terminal) => terminal.name === terminalId,
    );
    return (
      existing ??
      vscode.window.createTerminal({
        name: terminalId,
      })
    );
  }

  return vscode.window.createTerminal({
    name: "Orchestra Terminal",
  });
}

export const runTerminalTool: AgentTool<RunTerminalInput> = {
  name: TOOL_NAME,
  description:
    "Execute a command in a VS Code terminal using shell integration for output capture.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Command to run in the terminal",
      },
      terminalId: {
        type: "string",
        description: "Optional terminal name to reuse or create",
      },
      timeoutMs: {
        type: "number",
        description: "Override the default timeout in milliseconds",
      },
    },
    required: ["command"],
  },
  invoke: async (
    input: RunTerminalInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => {
    const callId = crypto.randomUUID();
    context.observer?.onProgress?.(
      callId,
      `Executing terminal command: ${input.command.substring(0, 50)}...`,
    );

    if (context.token.isCancellationRequested) {
      return buildToolResult({
        success: false,
        content: [{ type: "error", value: "Command cancelled." }],
        error: createToolError(
          ToolErrorCode.CANCELLED,
          "Command cancelled.",
          "Retry the command after cancelling is cleared.",
        ),
      });
    }

    const terminal = resolveTerminal(input.terminalId);
    terminal.show();

    try {
      const result = await executeInTerminal(terminal, input.command, {
        token: context.token,
        timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });

      if (!result.usedShellIntegration) {
        return buildToolResult({
          success: false,
          content: [
            {
              type: "error",
              value:
                "Shell integration unavailable; command sent without output capture.",
            },
          ],
          error: createToolError(
            ToolErrorCode.SHELL_INTEGRATION_UNAVAILABLE,
            "Shell integration unavailable; command sent without output capture.",
            "Switch to a shell that supports VS Code shell integration.",
            { terminalId: result.terminalId },
          ),
          metadata: {
            toolName: TOOL_NAME,
            callId: "",
            durationMs: 0,
          },
        });
      }

      if (typeof result.exitCode === "number" && result.exitCode !== 0) {
        // Emit output for failed command
        context.observer?.onOutput?.(callId, result.output);
        context.observer?.onMetadata?.(callId, "exitCode", result.exitCode);

        return buildToolResult({
          success: false,
          content: [{ type: "error", value: result.output }],
          error: createToolError(
            ToolErrorCode.COMMAND_FAILED,
            "Command exited with non-zero status.",
            "Review the command output for details.",
            { exitCode: result.exitCode, terminalId: result.terminalId },
          ),
          metadata: {
            toolName: TOOL_NAME,
            callId: "",
            durationMs: 0,
          },
        });
      }

      // Emit output and metadata for successful command
      context.observer?.onOutput?.(callId, result.output);
      context.observer?.onMetadata?.(callId, "exitCode", result.exitCode ?? 0);

      const success = successResult(TOOL_NAME, result.output);
      return buildToolResult(success);
    } catch (error) {
      if (error instanceof ShellExecutionError) {
        const code =
          error.code === "TIMEOUT"
            ? ToolErrorCode.TIMEOUT
            : ToolErrorCode.CANCELLED;

        return buildToolResult({
          success: false,
          content: [{ type: "error", value: error.message }],
          error: createToolError(
            code,
            error.message,
            error.code === "TIMEOUT"
              ? "Retry with a shorter command or increase the timeout."
              : "Retry the command if needed.",
          ),
        });
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      return buildToolResult({
        success: false,
        content: [{ type: "error", value: message }],
        error: createToolError(
          ToolErrorCode.UNKNOWN,
          message,
          "Check the terminal output and try again.",
        ),
      });
    }
  },
};
