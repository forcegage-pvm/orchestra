/**
 * findPortProcess tool - Find process using a specific port
 */

import { spawn } from "node:child_process";
import * as os from "node:os";

import { ToolErrorCode } from "../errors.js";
import { ProcessManager } from "../infrastructure/ProcessManager.js";
import type {
  AgentTool,
  FindPortProcessInput,
  FindPortProcessResult,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { FindPortProcessInputSchema } from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

const TOOL_NAME = "find_port_process";

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
 * Execute OS-specific command to find process using port
 */
async function findProcessUsingPort(
  port: number,
): Promise<{ pid?: number; command?: string }> {
  const platform = os.platform();

  let command: string;
  let args: string[];

  if (platform === "win32") {
    // Windows: netstat -ano | findstr :<port>
    command = "netstat";
    args = ["-ano"];
  } else {
    // Unix/Linux/Mac: lsof -i :<port>
    command = "lsof";
    args = ["-i", `:${port}`];
  }

  return new Promise((resolve) => {
    const child = spawn(command, args);
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0 || !stdout.trim()) {
        // No process found using this port
        resolve({});
        return;
      }

      // Parse output to extract PID
      const lines = stdout.split("\n");

      if (platform === "win32") {
        // Windows netstat output format:
        // TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    1234
        for (const line of lines) {
          if (line.includes(`:${port}`) && line.includes("LISTENING")) {
            const parts = line.trim().split(/\s+/);
            const pidStr = parts[parts.length - 1];
            if (pidStr !== undefined) {
              const pid = parseInt(pidStr, 10);
              if (!isNaN(pid)) {
                resolve({ pid });
                return;
              }
            }
          }
        }
      } else {
        // Unix/Linux/Mac lsof output format:
        // COMMAND  PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
        // node    1234 user   20u  IPv4 123456      0t0  TCP *:3000 (LISTEN)
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 2 && parts[0] !== "COMMAND") {
            const command = parts[0];
            const pidStr = parts[1];
            if (pidStr !== undefined && command !== undefined) {
              const pid = parseInt(pidStr, 10);
              if (!isNaN(pid)) {
                const result: { pid: number; command?: string } = { pid };
                if (command !== undefined) {
                  result.command = command;
                }
                resolve(result);
                return;
              }
            }
          }
        }
      }

      resolve({});
    });

    child.on("error", () => {
      resolve({});
    });
  });
}

/**
 * Agent tool for finding processes using specific ports
 * Uses OS-specific commands (netstat/lsof) to identify port usage
 * Cross-platform support for Windows, macOS, and Linux
 * @property name - Tool identifier: "find_port_process"
 * @property description - Human-readable tool description
 * @property inputSchema - JSON Schema defining input parameters
 * @property invoke - Execute the tool with validated input
 */
export const findPortProcessTool: AgentTool<FindPortProcessInput> = {
  name: TOOL_NAME,
  description: "Find which process is using a specific port.",
  inputSchema: {
    type: "object",
    properties: {
      port: {
        type: "number",
        description: "Port number to check",
      },
    },
    required: ["port"],
  },
  invoke: async (
    input: FindPortProcessInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => {
    const callId = crypto.randomUUID();
    context.observer?.onProgress?.(
      callId,
      `Finding process using port ${input.port}`,
    );

    if (context.token.isCancellationRequested) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.CANCELLED,
          "Port search cancelled.",
          "Retry after cancellation is cleared.",
        ),
      );
    }

    const parsed = FindPortProcessInputSchema.safeParse(input);
    if (!parsed.success) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.INVALID_INPUT,
          "Invalid find_port_process input.",
          "Check the port field.",
          { issues: parsed.error.issues },
        ),
      );
    }

    try {
      const { pid, command } = await findProcessUsingPort(parsed.data.port);

      // Check if this PID matches any managed process
      let managedProcessId: string | undefined;
      if (pid) {
        const manager = ProcessManager.getInstance();
        const allProcesses = manager.listProcesses();
        const managedProcess = allProcesses.find((p) => p.pid === pid);
        if (managedProcess) {
          managedProcessId = managedProcess.process_id;
        }
      }

      const output: FindPortProcessResult = {
        success: true,
        in_use: !!pid,
      };
      if (managedProcessId !== undefined) {
        output.process_id = managedProcessId;
      }
      if (pid !== undefined) {
        output.pid = pid;
      }
      if (command !== undefined) {
        output.command = command;
      }
      if (managedProcessId !== undefined) {
        output.process_id = managedProcessId;
      }
      if (pid !== undefined) {
        output.pid = pid;
      }
      if (command !== undefined) {
        output.command = command;
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
            ? "Retry after cancellation is cleared."
            : "Check the port number and try again.",
        ),
      );
    }
  },
};
