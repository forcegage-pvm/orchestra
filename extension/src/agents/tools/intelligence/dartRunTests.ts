/**
 * dart_run_tests tool — Execute Dart or Flutter tests directly via the CLI.
 *
 * This tool deliberately bypasses DartMcpClient and uses the existing
 * DartRunner from src/core/testing/DartRunner.ts. This ensures tests work
 * even when dart mcp-server is unavailable (Dart SDK < 3.9).
 *
 * Uses the same ResultFormatter as run_tests for consistent output format
 * (token-efficient summaries, structured failure details).
 *
 * Working directory is resolved relative to context.workspaceRoot.
 */

import * as nodePath from "node:path";

import * as vscode from "vscode";
import { z } from "zod";

import { DartRunner } from "../../../../../src/core/testing/DartRunner.js";
import { ResultFormatter } from "../../../../../src/core/testing/ResultFormatter.js";
import { ToolErrorCode } from "../errors.js";
import type {
  AgentTool,
  ToolInputSchema,
  ToolInvocationContext,
  ToolResult,
} from "../types.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";

const TOOL_NAME = "dart_run_tests";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_FAILURE_LINES = 20;

// ============================================================================
// Input schema
// ============================================================================

const DartRunTestsInputZodSchema = z.object({
  files: z
    .array(z.string())
    .optional()
    .describe(
      "Specific test file paths to run (relative to working_dir or workspace root). Omit to run all tests.",
    ),
  pattern: z
    .string()
    .optional()
    .describe(
      "Test name pattern (regex) to filter which tests to run (passed as --name to dart test).",
    ),
  working_dir: z
    .string()
    .optional()
    .describe(
      "Working directory for test execution, relative to workspace root. Defaults to workspace root.",
    ),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Timeout in milliseconds for the test run. Default: 120000."),
  no_pub: z
    .boolean()
    .optional()
    .describe(
      "Pass --no-pub to dart test (skip pub get before running). Default: false.",
    ),
  framework: z
    .enum(["dart", "flutter"])
    .optional()
    .describe(
      "Which test runner to use: 'dart' (dart test) or 'flutter' (flutter test). Default: 'dart'.",
    ),
});

export type DartRunTestsInput = z.output<typeof DartRunTestsInputZodSchema>;

const dartRunTestsInputSchema: ToolInputSchema = {
  type: "object",
  properties: {
    files: {
      type: "string",
      description:
        "Specific test file paths to run (relative to working_dir or workspace root). Omit to run all tests.",
    },
    pattern: {
      type: "string",
      description:
        "Test name pattern (regex) to filter which tests to run (--name argument to dart test).",
    },
    working_dir: {
      type: "string",
      description:
        "Working directory for test execution, relative to workspace root. Defaults to workspace root.",
    },
    timeout: {
      type: "number",
      description:
        "Timeout in milliseconds for the entire test run. Default: 120000.",
    },
    no_pub: {
      type: "string",
      description:
        "Pass --no-pub to skip pub get before running tests. Default: false.",
    },
    framework: {
      type: "string",
      description:
        "Test runner: 'dart' uses 'dart test', 'flutter' uses 'flutter test'. Default: 'dart'.",
      enum: ["dart", "flutter"],
    },
  },
  required: [],
};

// ============================================================================
// Helper
// ============================================================================

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
 * Get the configured dart executable path from VS Code settings,
 * falling back to "dart" if not configured.
 */
function getDartExecutable(): string {
  try {
    const config = vscode.workspace.getConfiguration("orchestra");
    return config.get<string>("dartSdkPath", "dart");
  } catch {
    return "dart";
  }
}

// ============================================================================
// Tool implementation
// ============================================================================

async function invoke(
  input: DartRunTestsInput,
  context: ToolInvocationContext,
): Promise<ToolResult> {
  const parsed = DartRunTestsInputZodSchema.safeParse(input);
  if (!parsed.success) {
    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.INVALID_INPUT,
        `Invalid input: ${parsed.error.message}`,
        "Check the dart_run_tests tool input parameters.",
      ),
    );
  }

  const data = parsed.data;

  // Resolve working directory
  const workingDir = nodePath.resolve(
    context.workspaceRoot,
    data.working_dir ?? ".",
  );

  // Determine which framework to use
  const framework = data.framework ?? "dart";

  // Get dart executable from config (respects orchestra.dartSdkPath setting)
  // Note: DartRunner uses the first element of buildCommand args as the executable,
  // so we need a runner that uses our configured dart path.
  // DartRunner uses the framework field to build the command ("dart" or "flutter"),
  // so for a custom dartSdkPath we inject via PATH env — DartRunner handles this
  // correctly since it uses spawn() with shell:true on Windows.
  const dartExecutable = getDartExecutable();
  const useCustomExecutable = dartExecutable !== "dart" && framework === "dart";

  const runner = new DartRunner(framework);

  // Resolve file paths relative to workingDir
  const resolvedFiles =
    data.files?.map((f) =>
      nodePath.isAbsolute(f) ? f : nodePath.resolve(workingDir, f),
    ) ?? [];

  const executeOptions: Parameters<typeof runner.execute>[0] = {
    files: resolvedFiles,
    workingDir,
    timeout: data.timeout ?? DEFAULT_TIMEOUT_MS,
  };

  if (data.no_pub === true) {
    executeOptions.dartNoPub = true;
  }

  if (data.pattern !== undefined) {
    executeOptions.pattern = data.pattern;
  }

  // If a custom dart executable is specified, inject its directory into PATH so
  // DartRunner's spawn picks up the right binary. We temporarily patch process.env
  // since TestRunOptions does not support env overrides.
  let originalPath: string | undefined;
  if (useCustomExecutable) {
    const dartDir = nodePath.dirname(dartExecutable);
    originalPath = process.env["PATH"];
    process.env["PATH"] = `${dartDir}${process.platform === "win32" ? ";" : ":"}${originalPath ?? ""}`;
  }

  let runOutput;
  try {
    runOutput = await runner.execute(executeOptions);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Check for ENOENT (dart/flutter not found)
    const isNotFound =
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT";

    if (isNotFound) {
      return buildToolResult(
        errorResult(
          TOOL_NAME,
          ToolErrorCode.COMMAND_FAILED,
          `'${framework}' executable not found. Is the ${framework === "flutter" ? "Flutter" : "Dart"} SDK installed and in PATH?`,
          `Install the ${framework === "flutter" ? "Flutter" : "Dart"} SDK and ensure '${framework}' is accessible in PATH. ` +
            `You can also set 'orchestra.dartSdkPath' in VS Code settings to point to your dart executable.`,
          { error: msg, framework },
        ),
      );
    }

    return buildToolResult(
      errorResult(
        TOOL_NAME,
        ToolErrorCode.UNKNOWN,
        `${framework} test execution failed: ${msg}`,
        "Check that the Dart/Flutter SDK is correctly installed.",
        { error: msg, framework },
      ),
    );
  } finally {
    // Restore original PATH if we patched it
    if (useCustomExecutable && originalPath !== undefined) {
      process.env["PATH"] = originalPath;
    } else if (useCustomExecutable) {
      delete process.env["PATH"];
    }
  }

  const formatter = new ResultFormatter();
  const result = formatter.format(runOutput.tests, {
    maxFailureLines: DEFAULT_MAX_FAILURE_LINES,
    framework,
  });

  let output = `✓ dart_run_tests [framework=${framework}${data.pattern ? `, pattern=${data.pattern}` : ""}]\n\n${result.summary}`;

  if (result.failed > 0) {
    const failureDetails = formatter.formatFailures(
      result.tests,
      DEFAULT_MAX_FAILURE_LINES,
    );
    output += `\n\n${failureDetails}`;
  }

  return buildToolResult(successResult(TOOL_NAME, output));
}

// ============================================================================
// AgentTool export
// ============================================================================

export const dartRunTestsTool: AgentTool<DartRunTestsInput> = {
  name: TOOL_NAME,
  description:
    "Execute Dart or Flutter tests using the dart test / flutter test CLI. " +
    "Returns a token-efficient summary with pass/fail counts and structured failure details. " +
    "Supports running specific files, filtering by test name pattern, and configuring timeout. " +
    "Works independently of dart mcp-server — only requires the Dart or Flutter SDK to be installed. " +
    "Use 'framework: flutter' for Flutter projects (runs flutter test instead of dart test).",
  inputSchema: dartRunTestsInputSchema,
  invoke,
};
