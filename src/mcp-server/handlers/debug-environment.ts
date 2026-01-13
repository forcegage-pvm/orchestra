/**
 * Debug Environment Handler
 *
 * Diagnostic tool to figure out why pre-signal checks fail.
 * Shows environment, runs test command, captures all output.
 */

import { executeCommand } from "../../core/command-executor.js";
import { resolveWorkspacePath } from "../../db/connection.js";
import { logToolExecution } from "../audit-logging.js";

export const debugEnvironmentSchema = {
  name: "debug_environment",
  description: "DEBUG: Show MCP server environment and test npm test execution",
  inputSchema: {
    type: "object" as const,
    properties: {
      command: {
        type: "string",
        description: "Command to test (default: npm test)",
      },
    },
    required: [],
  },
};

export async function handleDebugEnvironment(input: {
  command?: string;
}): Promise<{
  success: boolean;
  environment: Record<string, string | undefined>;
  workspace: string;
  node_version: string;
  cwd: string;
  test_result?: {
    command: string;
    exit_code: number;
    stdout: string;
    stderr: string;
    duration_ms: number;
    error?: string;
  };
}> {
  try {
    const workspacePath = resolveWorkspacePath();
    const command = input.command ?? "npm test";

    // Capture key environment variables
    const keyEnvVars = [
      "PATH",
      "NODE_PATH",
      "ORCHESTRA_WORKSPACE",
      "HOME",
      "USERPROFILE",
      "TEMP",
      "TMP",
      "NODE_ENV",
      "npm_config_prefix",
      "npm_config_cache",
    ];

    const environment: Record<string, string | undefined> = {};
    for (const key of keyEnvVars) {
      environment[key] = process.env[key];
    }

    // Count total env vars
    environment["_TOTAL_ENV_VARS"] = String(Object.keys(process.env).length);

    // Get node version
    const nodeVersionResult = await executeCommand("node --version", {
      cwd: workspacePath,
    });

    // Run the test command
    const testResult = await executeCommand(command, {
      cwd: workspacePath,
      timeout: 120000, // 2 minutes
    });

    // Build test result with proper optional handling
    const testResultBase = {
      command,
      exit_code: testResult.exitCode,
      stdout: testResult.stdout.slice(-2000), // Last 2000 chars
      stderr: testResult.stderr.slice(-2000),
      duration_ms: testResult.duration,
    };

    const result = {
      success: true,
      environment,
      workspace: workspacePath,
      node_version: nodeVersionResult.stdout.trim(),
      cwd: process.cwd(),
      test_result: testResult.error
        ? { ...testResultBase, error: testResult.error }
        : testResultBase,
    };

    logToolExecution("debug_environment", input, true);
    return result;
  } catch (error) {
    logToolExecution("debug_environment", input, false, error);
    throw error;
  }
}
