/**
 * executeWithRetry tool - Execute command with retry logic
 */

import { spawn } from "node:child_process";

import { ToolErrorCode } from "../errors.js";
import type {
  AgentTool,
  ExecuteWithRetryInput,
  ExecuteWithRetryResult,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { ExecuteWithRetryInputSchema } from "../types.js";
import { validatePath } from "../utils/pathValidation.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

const TOOL_NAME = "execute_with_retry";

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
 * Execute a single command attempt
 */
async function executeCommand(
  command: string,
  cwd: string,
  timeoutMs?: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timeoutHandle: NodeJS.Timeout | undefined;

    if (timeoutMs) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);
    }

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      if (timedOut) {
        reject(new Error("Command timed out"));
      } else {
        resolve({
          exitCode: code ?? -1,
          stdout,
          stderr,
        });
      }
    });

    child.on("error", (error) => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      reject(error);
    });
  });
}

/**
 * Check if command execution was successful
 */
function isSuccess(
  exitCode: number,
  stdout: string,
  successExitCodes: number[],
  successPattern?: RegExp,
): boolean {
  // Check exit code
  if (!successExitCodes.includes(exitCode)) {
    return false;
  }

  // If success pattern is provided, check it
  if (successPattern) {
    return successPattern.test(stdout);
  }

  return true;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const executeWithRetryTool: AgentTool<ExecuteWithRetryInput> = {
  name: TOOL_NAME,
  description:
    "Execute a command with automatic retry logic on failure. Supports exit code and pattern-based success detection.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Command to execute",
      },
      cwd: {
        type: "string",
        description: "Working directory to run command in",
      },
      max_retries: {
        type: "number",
        description: "Maximum number of retry attempts (default: 3)",
      },
      retry_delay_ms: {
        type: "number",
        description: "Delay between retries in milliseconds (default: 1000)",
      },
      success_exit_codes: {
        type: "array",
        description: "Exit codes considered successful (default: [0])",
      },
      success_pattern: {
        type: "string",
        description: "Regex pattern to match in stdout for success",
      },
      timeout_ms: {
        type: "number",
        description: "Timeout per attempt in milliseconds",
      },
    },
    required: ["command"],
  },
  invoke: async (
    input: ExecuteWithRetryInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => {
    if (context.token.isCancellationRequested) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.CANCELLED,
          "Execute with retry cancelled.",
          "Retry after cancellation is cleared.",
        ),
      );
    }

    const parsed = ExecuteWithRetryInputSchema.safeParse(input);
    if (!parsed.success) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          "Invalid execute_with_retry input.",
          "Check the command and optional parameters.",
          { issues: parsed.error.issues },
        ),
      );
    }

    const maxRetries = parsed.data.max_retries ?? 3;
    const retryDelayMs = parsed.data.retry_delay_ms ?? 1000;
    const successExitCodes = parsed.data.success_exit_codes ?? [0];
    let successPattern: RegExp | undefined;

    if (parsed.data.success_pattern) {
      try {
        successPattern = new RegExp(parsed.data.success_pattern);
      } catch {
        return buildToolResult(
          errorResult(
            TOOL_NAME,
            ToolErrorCode.INVALID_INPUT,
            "Invalid success_pattern regex.",
            "Provide a valid JavaScript regular expression string.",
            { success_pattern: parsed.data.success_pattern },
          ),
        );
      }
    }

    let resolvedCwd = context.workspaceRoot;
    if (parsed.data.cwd) {
      const validatedPath = await validatePath(
        parsed.data.cwd,
        context.workspaceRoot,
      );
      if (!validatedPath.isValid) {
        return buildToolResult({
          success: false,
          content: [{ type: "error", value: validatedPath.error.message }],
          error: validatedPath.error,
          metadata: {
            toolName: TOOL_NAME,
            callId: "",
            durationMs: 0,
          },
        });
      }
      resolvedCwd = validatedPath.absolutePath!;
    }

    const startTime = Date.now();
    let attempts = 0;
    let lastExitCode = -1;
    let lastStdout = "";
    let lastStderr = "";

    while (attempts < maxRetries) {
      attempts++;

      if (context.token.isCancellationRequested) {
        return buildToolResult(
          errorResult(
            TOOL_NAME,
            ToolErrorCode.CANCELLED,
            "Execute with retry cancelled.",
            "Retry after cancellation is cleared.",
          ),
        );
      }

      try {
        const result = await executeCommand(
          parsed.data.command,
          resolvedCwd,
          parsed.data.timeout_ms,
        );

        lastExitCode = result.exitCode;
        lastStdout = result.stdout;
        lastStderr = result.stderr;

        // Check if this attempt was successful
        if (
          isSuccess(
            result.exitCode,
            result.stdout,
            successExitCodes,
            successPattern,
          )
        ) {
          const output: ExecuteWithRetryResult = {
            success: true,
            attempts,
            final_exit_code: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            total_duration_ms: Date.now() - startTime,
          };

          return buildToolResult(
            successResult(TOOL_NAME, [
              { type: "json", value: JSON.stringify(output, null, 2) },
            ]),
          );
        }

        // Not successful, retry if we have attempts left
        if (attempts < maxRetries) {
          await sleep(retryDelayMs);
        }
      } catch (error) {
        lastStderr = error instanceof Error ? error.message : "Unknown error";

        // Retry if we have attempts left
        if (attempts < maxRetries) {
          await sleep(retryDelayMs);
        }
      }
    }

    // All retries exhausted
    const output: ExecuteWithRetryResult = {
      success: false,
      attempts,
      final_exit_code: lastExitCode,
      stdout: lastStdout,
      stderr: lastStderr,
      total_duration_ms: Date.now() - startTime,
    };

    return buildToolResult(
      successResult(TOOL_NAME, [
        { type: "json", value: JSON.stringify(output, null, 2) },
      ]),
    );
  },
};
