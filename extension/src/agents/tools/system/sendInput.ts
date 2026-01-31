/**
 * sendInput tool - Send text input to a background process
 */

import { ToolErrorCode } from "../errors.js";
import { ProcessManager } from "../infrastructure/ProcessManager.js";
import type {
  AgentTool,
  SendInputInput,
  SendInputResult,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { SendInputInputSchema } from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

const TOOL_NAME = "send_input";

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
 * Agent tool for sending input to background processes
 * Writes text or special key sequences to process stdin
 * Respects CancellationToken for interruptibility
 * @property name - Tool identifier: "send_input"
 * @property description - Human-readable tool description
 * @property inputSchema - JSON Schema defining input parameters
 * @property invoke - Execute the tool with validated input
 */
export const sendInputTool: AgentTool<SendInputInput> = {
  name: TOOL_NAME,
  description: "Send text input or special keys to a background process.",
  inputSchema: {
    type: "object",
    properties: {
      process_id: {
        type: "string",
        description: "Process identifier to send input to",
      },
      text: {
        type: "string",
        description: "Text to send to process stdin",
      },
      press_enter: {
        type: "boolean",
        description: "Whether to append newline (default: true)",
      },
      special_key: {
        type: "string",
        description: "Special key to send (ctrl+c, ctrl+d, ctrl+z)",
        enum: ["ctrl+c", "ctrl+d", "ctrl+z"],
      },
    },
    required: ["process_id", "text"],
  },
  invoke: async (
    input: SendInputInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => {
    const callId = crypto.randomUUID();
    context.observer?.onProgress?.(
      callId,
      `Sending input to process ${input.process_id}`,
    );

    if (context.token.isCancellationRequested) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.CANCELLED,
          "Send input cancelled.",
          "Retry after cancellation is cleared.",
        ),
      );
    }

    const parsed = SendInputInputSchema.safeParse(input);
    if (!parsed.success) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          "Invalid send_input input.",
          "Check the process_id, text, and optional fields.",
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

    try {
      const options: {
        text: string;
        pressEnter?: boolean;
        specialKey?: "ctrl+c" | "ctrl+d" | "ctrl+z";
        token?: vscode.CancellationToken;
      } = { text: parsed.data.text };
      if (parsed.data.press_enter !== undefined) {
        options.pressEnter = parsed.data.press_enter;
      }
      if (parsed.data.special_key !== undefined) {
        options.specialKey = parsed.data.special_key;
      }
      if (context.token !== undefined) {
        options.token = context.token;
      }

      const result = await manager.sendInput(parsed.data.process_id, options);

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

      const output: SendInputResult = {
        success: true,
        process_id: parsed.data.process_id,
        bytes_sent: result.bytesSent,
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
          : message === "Process stdin is not available"
            ? ToolErrorCode.INVALID_INPUT
            : ToolErrorCode.UNKNOWN;

      return buildToolResult(
        errorResult(
          TOOL_NAME,
          code,
          message,
          code === ToolErrorCode.CANCELLED
            ? "Retry after cancellation is cleared."
            : code === ToolErrorCode.INVALID_INPUT
              ? "Process stdin may be closed or redirected."
              : "Check the process state and try again.",
        ),
      );
    }
  },
};
