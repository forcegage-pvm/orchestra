/**
 * runTests tool - Execute test commands and capture structured results
 */

import * as path from "path";
import { exec, type ExecException, type ExecOptions } from "child_process";
import { promisify } from "util";
import type { AgentTool } from "../../ToolRegistry.js";
import type { ToolContext, ToolResult } from "../../types.js";

const execAsync = promisify(exec);

interface RunTestsInput {
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

interface TestCounts {
  passed?: number;
  failed?: number;
  skipped?: number;
  total?: number;
}

interface RunTestsOutput {
  command: string;
  stdout: string;
  stderr: string;
  exitCode?: number;
  status: "passed" | "failed";
  testCounts?: TestCounts;
  suiteCounts?: TestCounts;
  cwd?: string;
}

const DEFAULT_TIMEOUT_MS = 60000;

function getAbsolutePath(workspaceRoot: string, filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(workspaceRoot, filePath);
}

function normalizeExitCode(error: ExecException | null | undefined):
  | number
  | undefined {
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
  input: RunTestsInput,
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

function parseCountsFromLine(line: string): TestCounts | undefined {
  const matches = Array.from(
    line.matchAll(/(\d+)\s+(failed|passed|skipped|total)/gi),
  );

  if (matches.length === 0) {
    return undefined;
  }

  const counts: TestCounts = {};
  for (const match of matches) {
    const value = Number.parseInt(match[1] ?? "", 10);
    const label = match[2]?.toLowerCase();
    if (!Number.isNaN(value) && label) {
      if (label === "passed") counts.passed = value;
      if (label === "failed") counts.failed = value;
      if (label === "skipped") counts.skipped = value;
      if (label === "total") counts.total = value;
    }
  }

  return counts;
}

function extractCounts(output: string): {
  testCounts?: TestCounts;
  suiteCounts?: TestCounts;
} {
  const lines = output.split(/\r?\n/);
  let testCounts: TestCounts | undefined;
  let suiteCounts: TestCounts | undefined;

  for (const line of lines) {
    if (line.trim().startsWith("Tests:")) {
      testCounts = parseCountsFromLine(line);
    }
    if (line.trim().startsWith("Test Suites:")) {
      suiteCounts = parseCountsFromLine(line);
    }
  }

  const result: { testCounts?: TestCounts; suiteCounts?: TestCounts } = {};
  if (testCounts) {
    result.testCounts = testCounts;
  }
  if (suiteCounts) {
    result.suiteCounts = suiteCounts;
  }
  return result;
}

function buildOutput(
  input: RunTestsInput,
  stdout: string,
  stderr: string,
  exitCode: number,
  context: ToolContext,
): RunTestsOutput {
  const { testCounts, suiteCounts } = extractCounts(stdout);
  const output: RunTestsOutput = {
    command: input.command,
    stdout,
    stderr,
    exitCode,
    status: exitCode === 0 ? "passed" : "failed",
  };

  if (testCounts) {
    output.testCounts = testCounts;
  }

  if (suiteCounts) {
    output.suiteCounts = suiteCounts;
  }

  if (input.cwd) {
    output.cwd = getAbsolutePath(context.workspaceRoot, input.cwd);
  }

  return output;
}

async function runTests(
  input: RunTestsInput,
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
      error: `Tests failed: ${execError.message}`,
    };
  }
}

export const runTestsTool: AgentTool = {
  name: "run_tests",
  description: "Execute a test command and return structured results.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Test command to execute",
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
    return runTests(input as RunTestsInput, context);
  },
};
