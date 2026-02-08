/**
 * waitForPattern tool - Wait for a regex pattern to appear in process output
 */

import type * as vscode from "vscode";

import { ToolErrorCode } from "../errors.js";
import { ProcessManager } from "../infrastructure/ProcessManager.js";
import type {
  AgentTool,
  ToolInvocationContext,
  ToolResult,
  WaitForPatternInput,
  WaitForPatternResult,
} from "../types.js";
import { WaitForPatternInputSchema } from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

const TOOL_NAME = "wait_for_pattern";

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
 * Agent tool for waiting for patterns in process output
 * Monitors process output for regex pattern match with timeout
 * Respects CancellationToken for interruptibility
 * @property name - Tool identifier: "wait_for_pattern"
 * @property description - Human-readable tool description
 * @property inputSchema - JSON Schema defining input parameters
 * @property invoke - Execute the tool with validated input
 */
export const waitForPatternTool: AgentTool<WaitForPatternInput> = {
  name: TOOL_NAME,
  description:
    "Wait for a JavaScript regex pattern to appear in a background process output. " +
    "Use this to detect when servers are ready, builds complete, or tests finish. " +
    "IMPORTANT: Use JavaScript regex syntax, NOT glob patterns. " +
    "Examples: 'Server.*port \\\\d+' (server ready), '(ready|listening|started)' (alternation), " +
    "'\\\\d+ tests?.*passed' (test completion), 'BUILD (SUCCESS|FAILED)' (build status).",
  inputSchema: {
    type: "object",
    properties: {
      process_id: {
        type: "string",
        description: "Process identifier from start_process to monitor",
      },
      pattern: {
        type: "string",
        description:
          "JavaScript regular expression pattern (NOT glob pattern). " +
          "Use \\\\d for digits, .* for any characters, (a|b) for alternation. " +
          "Example: 'Server.*listening.*port \\\\d+' matches 'Server listening on port 3000'",
      },
      timeout_ms: {
        type: "number",
        description: "Maximum wait time in milliseconds (default: 30000)",
      },
    },
    required: ["process_id", "pattern"],
  },
  invoke: async (
    input: WaitForPatternInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => {
    const callId = crypto.randomUUID();
    context.observer?.onProgress?.(
      callId,
      `Waiting for pattern in process ${input.process_id}`,
    );

    if (context.token.isCancellationRequested) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.CANCELLED,
          "Wait cancelled.",
          "Retry after cancellation is cleared.",
        ),
      );
    }

    const parsed = WaitForPatternInputSchema.safeParse(input);
    if (!parsed.success) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          "Invalid wait_for_pattern input.",
          "Check the process_id, pattern, and timeout_ms fields.",
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

    let pattern: RegExp;
    try {
      pattern = new RegExp(parsed.data.pattern);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          `Invalid regex pattern: ${errorMessage}`,
          "Use JavaScript regex syntax (NOT glob patterns). " +
            "Common mistakes: '*(...)' is glob (use '.*' for any chars), " +
            "unescaped special chars like '[' or '(' need escaping. " +
            "Examples: 'Server.*port \\\\d+', '(ready|started)', '\\\\d+ tests?'",
          { pattern: parsed.data.pattern },
        ),
      );
    }

    try {
      const options: {
        pattern: RegExp;
        timeoutMs?: number;
        token?: vscode.CancellationToken;
      } = { pattern };
      if (parsed.data.timeout_ms !== undefined) {
        options.timeoutMs = parsed.data.timeout_ms;
      }
      if (context.token !== undefined) {
        options.token = context.token;
      }

      const result = await manager.waitForPattern(
        parsed.data.process_id,
        options,
      );

      const output: WaitForPatternResult = {
        success: result.matched,
        matched: result.matched,
        wait_time_ms: result.waitTimeMs,
        timed_out: result.timedOut,
      };
      if (result.matchedLine !== undefined) {
        output.matched_line = result.matchedLine;
      }

      // Emit metadata with pattern match results
      context.observer?.onMetadata?.(callId, "matched", result.matched);
      context.observer?.onMetadata?.(callId, "waitTimeMs", result.waitTimeMs);

      return buildToolResult(
        successResult(TOOL_NAME, [
          { type: "json", value: JSON.stringify(output, null, 2) },
        ]),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const code =
        message === "Operation cancelled." || message === "Process not found"
          ? ToolErrorCode.CANCELLED
          : ToolErrorCode.UNKNOWN;

      return buildToolResult(
        errorResult(
          TOOL_NAME,
          code,
          message,
          code === ToolErrorCode.CANCELLED
            ? "Retry after cancellation is cleared."
            : "Check the process state and try again.",
        ),
      );
    }
  },
};
