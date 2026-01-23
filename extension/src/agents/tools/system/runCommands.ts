/**
 * runCommands tool - Execute shell commands and capture output
 */

import { exec, type ExecException, type ExecOptions } from "child_process";
import * as path from "path";
import { promisify } from "util";
import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";

const execAsync = promisify(exec);

interface RunCommandsInput {
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

interface RunCommandOutput {
  command: string;
  stdout: string;
  stderr: string;
  exitCode?: number;
  cwd?: string;
}

const DEFAULT_TIMEOUT_MS = 60000;

function getAbsolutePath(workspaceRoot: string, filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(workspaceRoot, filePath);
}

function normalizeExitCode(
  error: ExecException | null | undefined,
): number | undefined {
  if (!error) {
    return undefined;
  }
  const code = error.code;
  if (typeof code === "number") {
    return code;
  }
  if (typeof code === "string") {
    const parsed = Number.parseInt(code, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function buildExecOptions(
  input: RunCommandsInput,
  context: ToolContext,
): ExecOptions {
  const options: ExecOptions = {
    shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
    timeout: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  };

  if (input.cwd) {
    options.cwd = getAbsolutePath(context.workspaceRoot, input.cwd);
  }

  return options;
}

function buildOutput(
  input: RunCommandsInput,
  stdout: string,
  stderr: string,
  exitCode?: number,
  context?: ToolContext,
): RunCommandOutput {
  const output: RunCommandOutput = {
    command: input.command,
    stdout,
    stderr,
  };

  if (exitCode !== undefined) {
    output.exitCode = exitCode;
  }

  if (input.cwd && context) {
    output.cwd = getAbsolutePath(context.workspaceRoot, input.cwd);
  }

  return output;
}

async function runCommand(
  input: RunCommandsInput,
  context: ToolContext,
): Promise<ToolResult> {
  try {
    const options = buildExecOptions(input, context);
    const execResult = (await execAsync(input.command, options)) as
      | { stdout?: string | Buffer; stderr?: string | Buffer }
      | string
      | Buffer;
    const stdout =
      typeof execResult === "string" || Buffer.isBuffer(execResult)
        ? String(execResult)
        : String(execResult.stdout ?? "");
    const stderr =
      typeof execResult === "string" || Buffer.isBuffer(execResult)
        ? ""
        : String(execResult.stderr ?? "");
    const output = buildOutput(input, stdout, stderr, 0, context);

    return {
      success: true,
      output: JSON.stringify(output, null, 2),
    };
  } catch (error) {
    const execError = error as ExecException & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    const stdout = execError.stdout ? String(execError.stdout) : "";
    const stderr = execError.stderr ? String(execError.stderr) : "";
    const exitCode = normalizeExitCode(execError) ?? 1;
    const output = buildOutput(input, stdout, stderr, exitCode, context);

    return {
      success: false,
      output: JSON.stringify(output, null, 2),
      error: `Command failed: ${execError.message}`,
    };
  }
}

export const runCommandsTool: AgentTool = {
  name: "run_commands",
  description:
    "Execute a shell command and return stdout, stderr, and exit code.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Command to execute",
      },
      cwd: {
        type: "string",
        description: "Optional working directory (relative to workspace)",
      },
      timeoutMs: {
        type: "number",
        description: "Optional timeout in milliseconds (default 60000)",
      },
    },
    required: ["command"],
  },
  execute: async (
    input: unknown,
    context: ToolContext,
  ): Promise<ToolResult> => {
    return runCommand(input as RunCommandsInput, context);
  },
};
