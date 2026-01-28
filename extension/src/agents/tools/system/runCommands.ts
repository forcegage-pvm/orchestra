/**
 * runCommands tool - Execute shell commands and capture output
 *
 * Includes automatic translation of common Unix commands to Windows equivalents
 * to enable cross-platform agent operation.
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
  translated?: boolean;
  originalCommand?: string;
}

const DEFAULT_TIMEOUT_MS = 60000;

/**
 * Translate common Unix commands to Windows equivalents.
 * Returns the translated command and whether translation occurred.
 */
function translateCommand(command: string): {
  command: string;
  translated: boolean;
} {
  if (process.platform !== "win32") {
    return { command, translated: false };
  }

  const trimmed = command.trim();

  // cat file -> type file
  const catMatch = trimmed.match(/^cat\s+(.+)$/);
  if (catMatch) {
    const filePath = catMatch[1].replace(/\//g, "\\");
    return { command: `type ${filePath}`, translated: true };
  }

  // head -n N file or head -N file -> powershell Get-Content -TotalCount N file
  const headNMatch = trimmed.match(/^head\s+(?:-n\s*)?(-?\d+)\s+(.+)$/);
  if (headNMatch) {
    const lines = Math.abs(parseInt(headNMatch[1], 10));
    const filePath = headNMatch[2].replace(/\//g, "\\");
    return {
      command: `powershell -Command "Get-Content '${filePath}' -TotalCount ${lines}"`,
      translated: true,
    };
  }

  // head file (default 10 lines)
  const headMatch = trimmed.match(/^head\s+([^-].*)$/);
  if (headMatch) {
    const filePath = headMatch[1].replace(/\//g, "\\");
    return {
      command: `powershell -Command "Get-Content '${filePath}' -TotalCount 10"`,
      translated: true,
    };
  }

  // tail -n N file or tail -N file -> powershell Get-Content -Tail N file
  const tailNMatch = trimmed.match(/^tail\s+(?:-n\s*)?(-?\d+)\s+(.+)$/);
  if (tailNMatch) {
    const lines = Math.abs(parseInt(tailNMatch[1], 10));
    const filePath = tailNMatch[2].replace(/\//g, "\\");
    return {
      command: `powershell -Command "Get-Content '${filePath}' -Tail ${lines}"`,
      translated: true,
    };
  }

  // tail file (default 10 lines)
  const tailMatch = trimmed.match(/^tail\s+([^-].*)$/);
  if (tailMatch) {
    const filePath = tailMatch[1].replace(/\//g, "\\");
    return {
      command: `powershell -Command "Get-Content '${filePath}' -Tail 10"`,
      translated: true,
    };
  }

  // ls -> dir
  if (trimmed === "ls") {
    return { command: "dir", translated: true };
  }

  // ls path -> dir path
  const lsMatch = trimmed.match(/^ls\s+(.+)$/);
  if (lsMatch) {
    const dirPath = lsMatch[1].replace(/\//g, "\\");
    return { command: `dir ${dirPath}`, translated: true };
  }

  // grep pattern file -> findstr pattern file
  const grepMatch = trimmed.match(/^grep\s+["']?([^"']+)["']?\s+(.+)$/);
  if (grepMatch) {
    const pattern = grepMatch[1];
    const filePath = grepMatch[2].replace(/\//g, "\\");
    return { command: `findstr "${pattern}" ${filePath}`, translated: true };
  }

  // rm file -> del file
  const rmMatch = trimmed.match(/^rm\s+(.+)$/);
  if (rmMatch) {
    const filePath = rmMatch[1]
      .replace(/\//g, "\\")
      .replace(/-rf?\s+/g, "/s /q ");
    return { command: `del ${filePath}`, translated: true };
  }

  // cp source dest -> copy source dest
  const cpMatch = trimmed.match(/^cp\s+(.+)\s+(.+)$/);
  if (cpMatch) {
    const src = cpMatch[1].replace(/\//g, "\\");
    const dest = cpMatch[2].replace(/\//g, "\\");
    return { command: `copy ${src} ${dest}`, translated: true };
  }

  // mv source dest -> move source dest
  const mvMatch = trimmed.match(/^mv\s+(.+)\s+(.+)$/);
  if (mvMatch) {
    const src = mvMatch[1].replace(/\//g, "\\");
    const dest = mvMatch[2].replace(/\//g, "\\");
    return { command: `move ${src} ${dest}`, translated: true };
  }

  // mkdir -p path -> mkdir path (Windows mkdir creates intermediate dirs by default)
  const mkdirMatch = trimmed.match(/^mkdir\s+(?:-p\s+)?(.+)$/);
  if (mkdirMatch) {
    const dirPath = mkdirMatch[1].replace(/\//g, "\\");
    return { command: `mkdir ${dirPath}`, translated: true };
  }

  // pwd -> cd (Windows cd with no args prints current directory)
  if (trimmed === "pwd") {
    return { command: "cd", translated: true };
  }

  // which -> where
  const whichMatch = trimmed.match(/^which\s+(.+)$/);
  if (whichMatch) {
    return { command: `where ${whichMatch[1]}`, translated: true };
  }

  // touch file -> type nul > file (create empty file)
  const touchMatch = trimmed.match(/^touch\s+(.+)$/);
  if (touchMatch) {
    const filePath = touchMatch[1].replace(/\//g, "\\");
    return { command: `type nul > ${filePath}`, translated: true };
  }

  // wc -l file -> find /c /v "" file (count lines)
  const wcMatch = trimmed.match(/^wc\s+-l\s+(.+)$/);
  if (wcMatch) {
    const filePath = wcMatch[1].replace(/\//g, "\\");
    return { command: `find /c /v "" ${filePath}`, translated: true };
  }

  return { command, translated: false };
}

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
