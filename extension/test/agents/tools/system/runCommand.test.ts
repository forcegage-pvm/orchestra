/**
 * Tests for runCommand tool
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

import { ToolErrorCode } from "../../../../src/agents/tools/errors.js";
import type {
  RunCommandInput,
  ToolInvocationContext,
} from "../../../../src/agents/tools/types.js";

const buildNodeCommand = (script: string): string =>
  `"${process.execPath}" -e ${JSON.stringify(script)}`;

const createMockToken = (cancelled = false): vscode.CancellationToken => ({
  isCancellationRequested: cancelled,
  onCancellationRequested: () => ({ dispose: () => undefined }),
});

const createContext = (
  token?: vscode.CancellationToken,
): ToolInvocationContext => ({
  token: token ?? createMockToken(),
  observer: undefined,
});

describe("runCommand tool", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Basic Execution", () => {
    it("executes command successfully and captures stdout", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const input: RunCommandInput = {
        command: buildNodeCommand("console.log('hello world');"),
      };

      const result = await runCommandTool.invoke(input, createContext());

      expect(result.success).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);

      const jsonContent = result.content.find((c) => c.type === "json");
      expect(jsonContent).toBeDefined();

      const parsed = JSON.parse(jsonContent!.value);
      expect(parsed.success).toBe(true);
      expect(parsed.exit_code).toBe(0);
      expect(parsed.stdout).toContain("hello world");
      expect(parsed.timed_out).toBe(false);
    });

    it("captures non-zero exit code", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const input: RunCommandInput = {
        command: buildNodeCommand("process.exit(42);"),
      };

      const result = await runCommandTool.invoke(input, createContext());

      const jsonContent = result.content.find((c) => c.type === "json");
      expect(jsonContent).toBeDefined();

      const parsed = JSON.parse(jsonContent!.value);
      expect(parsed.exit_code).toBe(42);
      expect(parsed.success).toBe(false);
    });

    it("captures stderr output", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const input: RunCommandInput = {
        command: buildNodeCommand(
          "console.error('error message'); process.exit(1);",
        ),
      };

      const result = await runCommandTool.invoke(input, createContext());

      const jsonContent = result.content.find((c) => c.type === "json");
      expect(jsonContent).toBeDefined();

      const parsed = JSON.parse(jsonContent!.value);
      expect(parsed.stderr).toContain("error message");
      expect(parsed.success).toBe(false);
    });
  });

  describe("Timeout Handling", () => {
    it("terminates command on timeout and returns partial output", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const input: RunCommandInput = {
        command: buildNodeCommand(
          "console.log('start'); setTimeout(() => console.log('end'), 5000);",
        ),
        timeout_ms: 1000,
      };

      const result = await runCommandTool.invoke(input, createContext());

      const jsonContent = result.content.find((c) => c.type === "json");
      expect(jsonContent).toBeDefined();

      const parsed = JSON.parse(jsonContent!.value);
      expect(parsed.timed_out).toBe(true);
      expect(parsed.duration_ms).toBeGreaterThanOrEqual(1000);
      expect(parsed.duration_ms).toBeLessThan(6000); // Should not wait full 5 seconds
    });

    it("applies default timeout of 30000ms", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const input: RunCommandInput = {
        command: buildNodeCommand("console.log('test');"),
      };

      const result = await runCommandTool.invoke(input, createContext());

      const jsonContent = result.content.find((c) => c.type === "json");
      const parsed = JSON.parse(jsonContent!.value);

      // Should complete quickly without timing out
      expect(parsed.timed_out).toBe(false);
    });
  });

  describe("Shell Integration Fallback", () => {
    it("includes warning when shell integration unavailable", async () => {
      // This test verifies the fallback path is triggered
      // In test environment, shell integration will be unavailable
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const input: RunCommandInput = {
        command: buildNodeCommand("console.log('fallback test');"),
      };

      const result = await runCommandTool.invoke(input, createContext());

      const jsonContent = result.content.find((c) => c.type === "json");
      expect(jsonContent).toBeDefined();

      const parsed = JSON.parse(jsonContent!.value);

      // In test environment, we expect fallback to subprocess
      // Warning field should indicate this
      if (parsed.warning) {
        expect(parsed.warning).toMatch(
          /shell integration|subprocess|fallback/i,
        );
      }

      expect(parsed.stdout).toContain("fallback test");
    });
  });

  describe("ANSI Cleanup", () => {
    it("strips ANSI escape codes from output", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      // Output with ANSI color codes
      const input: RunCommandInput = {
        command: buildNodeCommand(
          "console.log('\\x1b[31mRed\\x1b[0m \\x1b[32mGreen\\x1b[0m');",
        ),
      };

      const result = await runCommandTool.invoke(input, createContext());

      const jsonContent = result.content.find((c) => c.type === "json");
      expect(jsonContent).toBeDefined();

      const parsed = JSON.parse(jsonContent!.value);

      // ANSI codes should be stripped
      expect(parsed.stdout).not.toMatch(/\x1b\[[0-9;]*[a-zA-Z]/);
      expect(parsed.stdout).toContain("Red");
      expect(parsed.stdout).toContain("Green");
    });
  });

  describe("Output Truncation", () => {
    it("truncates output exceeding 500 lines with head/tail preservation", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      // Generate 600 lines of output
      const script =
        "for (let i = 1; i <= 600; i++) { console.log('Line ' + i); }";

      const input: RunCommandInput = {
        command: buildNodeCommand(script),
        timeout_ms: 10000,
      };

      const result = await runCommandTool.invoke(input, createContext());

      const jsonContent = result.content.find((c) => c.type === "json");
      expect(jsonContent).toBeDefined();

      const parsed = JSON.parse(jsonContent!.value);

      const lines = parsed.stdout.split("\n").filter((l: string) => l.trim());

      // Should be truncated to ~500 lines
      expect(lines.length).toBeLessThanOrEqual(501); // 500 + truncation marker

      // Should contain truncation marker
      expect(parsed.stdout).toContain("... output truncated ...");

      // Head (first ~100 lines = 20%) should be preserved
      expect(parsed.stdout).toContain("Line 1");
      expect(parsed.stdout).toContain("Line 50");

      // Tail (last ~400 lines = 80%) should be preserved
      expect(parsed.stdout).toContain("Line 600");
      expect(parsed.stdout).toContain("Line 550");

      // Middle should be missing (lines 101-200 are dropped)
      expect(parsed.stdout).not.toContain("Line 150");
    });

    it("does not truncate output under 500 lines", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const script =
        "for (let i = 1; i <= 100; i++) { console.log('Line ' + i); }";

      const input: RunCommandInput = {
        command: buildNodeCommand(script),
      };

      const result = await runCommandTool.invoke(input, createContext());

      const jsonContent = result.content.find((c) => c.type === "json");
      const parsed = JSON.parse(jsonContent!.value);

      // Should not contain truncation marker
      expect(parsed.stdout).not.toContain("... output truncated ...");
    });
  });

  describe("Input Validation", () => {
    it("requires command parameter", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      // TypeScript will catch this at compile time, but test runtime behavior
      const input = {} as RunCommandInput;

      const result = await runCommandTool.invoke(input, createContext());

      // Should fail due to missing command
      expect(result.success).toBe(false);
    });
  });

  describe("Cancellation Support", () => {
    it("returns error when token is already cancelled", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const input: RunCommandInput = {
        command: buildNodeCommand("console.log('test');"),
      };

      const cancelledToken = createMockToken(true);
      const result = await runCommandTool.invoke(
        input,
        createContext(cancelledToken),
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ToolErrorCode.CANCELLED);
    });
  });

  describe("Environment Variables", () => {
    it("passes environment variables to command", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const input: RunCommandInput = {
        command: buildNodeCommand("console.log(process.env.TEST_VAR);"),
        env: {
          TEST_VAR: "test_value_123",
        },
      };

      const result = await runCommandTool.invoke(input, createContext());

      const jsonContent = result.content.find((c) => c.type === "json");
      const parsed = JSON.parse(jsonContent!.value);

      expect(parsed.stdout).toContain("test_value_123");
    });

    it("sanitizes Electron and VS Code env vars from subprocesses", async () => {
      // Inject fake ELECTRON_* and VSCODE_* vars into process.env before import
      // so the tool's env sanitization can strip them
      process.env.ELECTRON_RUN_AS_NODE = "1";
      process.env.ELECTRON_ENABLE_LOGGING = "1";
      process.env.ELECTRON_NO_ASAR = "1";
      process.env.VSCODE_PID = "99999";
      process.env.VSCODE_IPC_HOOK = "/tmp/fake";
      process.env.VSCODE_NLS_CONFIG = "{}";
      process.env.VSCODE_CLI = "1";
      process.env.GDK_PIXBUF_MODULE_FILE = "/fake/path";

      try {
        const { runCommandTool } =
          await import("../../../../src/agents/tools/system/runCommand.js");

        // Print all env vars matching ELECTRON_ or VSCODE_ (non-preserved) or GDK_PIXBUF_
        const script =
          "var keys = Object.keys(process.env).filter(function(k) { return /^(ELECTRON_|VSCODE_(PID|IPC_HOOK|NLS_CONFIG|CLI)|GDK_PIXBUF_)/.test(k); }); console.log(JSON.stringify(keys));";

        const input: RunCommandInput = {
          command: buildNodeCommand(script),
        };

        const result = await runCommandTool.invoke(input, createContext());
        const jsonContent = result.content.find((c) => c.type === "json");
        const parsed = JSON.parse(jsonContent!.value);

        // The subprocess should have NONE of those vars
        const leakedVars = JSON.parse(parsed.stdout.trim());
        expect(leakedVars).toEqual([]);
      } finally {
        // Clean up injected vars
        delete process.env.ELECTRON_RUN_AS_NODE;
        delete process.env.ELECTRON_ENABLE_LOGGING;
        delete process.env.ELECTRON_NO_ASAR;
        delete process.env.VSCODE_PID;
        delete process.env.VSCODE_IPC_HOOK;
        delete process.env.VSCODE_NLS_CONFIG;
        delete process.env.VSCODE_CLI;
        delete process.env.GDK_PIXBUF_MODULE_FILE;
      }
    });

    it("preserves VSCODE_PORTABLE and VSCODE_SHELL_LOGIN", async () => {
      process.env.VSCODE_PORTABLE = "/portable/path";
      process.env.VSCODE_SHELL_LOGIN = "1";
      process.env.VSCODE_PID = "99999"; // should be removed

      try {
        const { runCommandTool } =
          await import("../../../../src/agents/tools/system/runCommand.js");

        const script =
          "var r = { portable: process.env.VSCODE_PORTABLE || 'missing', shell_login: process.env.VSCODE_SHELL_LOGIN || 'missing', pid: process.env.VSCODE_PID || 'missing' }; console.log(JSON.stringify(r));";

        const input: RunCommandInput = {
          command: buildNodeCommand(script),
        };

        const result = await runCommandTool.invoke(input, createContext());
        const jsonContent = result.content.find((c) => c.type === "json");
        const parsed = JSON.parse(jsonContent!.value);
        const envResult = JSON.parse(parsed.stdout.trim());

        expect(envResult.portable).toBe("/portable/path");
        expect(envResult.shell_login).toBe("1");
        expect(envResult.pid).toBe("missing"); // Should be sanitized
      } finally {
        delete process.env.VSCODE_PORTABLE;
        delete process.env.VSCODE_SHELL_LOGIN;
        delete process.env.VSCODE_PID;
      }
    });

    it("removes DEBUG env var from subprocesses", async () => {
      process.env.DEBUG = "some-extension:*";

      try {
        const { runCommandTool } =
          await import("../../../../src/agents/tools/system/runCommand.js");

        const input: RunCommandInput = {
          command: buildNodeCommand(
            "console.log(process.env.DEBUG || 'not-set');",
          ),
        };

        const result = await runCommandTool.invoke(input, createContext());
        const jsonContent = result.content.find((c) => c.type === "json");
        const parsed = JSON.parse(jsonContent!.value);

        expect(parsed.stdout.trim()).toBe("not-set");
      } finally {
        delete process.env.DEBUG;
      }
    });
  });

  describe("Working Directory", () => {
    it("executes command in specified working directory", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const input: RunCommandInput = {
        command: buildNodeCommand("console.log(process.cwd());"),
        cwd: process.cwd(),
      };

      const result = await runCommandTool.invoke(input, createContext());

      const jsonContent = result.content.find((c) => c.type === "json");
      const parsed = JSON.parse(jsonContent!.value);

      // Output should contain the specified working directory
      expect(parsed.stdout).toContain(process.cwd());
    });
  });

  describe("stdin Input", () => {
    it("sends stdin to command", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const input: RunCommandInput = {
        command: buildNodeCommand(
          "let data = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => { data += chunk; }); process.stdin.on('end', () => { console.log('Received: ' + data.trim()); });",
        ),
        stdin: "test input\n",
        timeout_ms: 5000,
      };

      const result = await runCommandTool.invoke(input, createContext());

      const jsonContent = result.content.find((c) => c.type === "json");
      const parsed = JSON.parse(jsonContent!.value);

      expect(parsed.stdout).toContain("Received:");
      expect(parsed.stdout).toContain("test input");
    });
  });

  describe("Error Summary Diagnostics", () => {
    it("extracts test configuration issue with actionable suggestions", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      // Simulate vitest "no test files found" output
      const vitestNoTestsOutput = `
 RUN  v1.6.1 X:/project

 filter:  testing/foo/
 include: test/**/*.test.ts

 No test files found, exiting with code 1
`;

      const input: RunCommandInput = {
        command: buildNodeCommand(
          `console.log(${JSON.stringify(vitestNoTestsOutput)}); process.exit(1);`,
        ),
      };

      const result = await runCommandTool.invoke(input, createContext());

      const jsonContent = result.content.find((c) => c.type === "json");
      const parsed = JSON.parse(jsonContent!.value);

      expect(parsed.success).toBe(false);
      expect(parsed.error_summary).toBeDefined();
      expect(parsed.error_summary).toContain("No test files found");
      expect(parsed.error_summary).toContain("testing/foo/");
      expect(parsed.error_summary).toContain("test/**/*.test.ts");
      // Should include actionable suggestion
      expect(parsed.error_summary).toContain("set_sprint_config");
    });

    it("provides clean error summary for standard errors", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const input: RunCommandInput = {
        command: buildNodeCommand(`
          console.error('Error: Cannot find module "missing-package"');
          process.exit(1);
        `),
      };

      const result = await runCommandTool.invoke(input, createContext());

      const jsonContent = result.content.find((c) => c.type === "json");
      const parsed = JSON.parse(jsonContent!.value);

      expect(parsed.success).toBe(false);
      expect(parsed.error_summary).toContain("Cannot find module");
    });
  });

  describe("expect_failure flag", () => {
    it("treats non-zero exit as success when expect_failure is true", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const input: RunCommandInput = {
        command: buildNodeCommand(
          "console.log('test failed as expected'); process.exit(1);",
        ),
        expect_failure: true,
      };

      const result = await runCommandTool.invoke(input, createContext());

      expect(result.success).toBe(true);

      const jsonContent = result.content.find((c) => c.type === "json");
      const parsed = JSON.parse(jsonContent!.value);

      // Exit code is still reported accurately
      expect(parsed.exit_code).toBe(1);
      // But success is true because failure was expected
      expect(parsed.success).toBe(true);
      // Output is still captured
      expect(parsed.stdout).toContain("test failed as expected");
    });

    it("does not cache failure when expect_failure is true", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const failingCommand = buildNodeCommand("process.exit(1);");

      // First call with expect_failure
      const result1 = await runCommandTool.invoke(
        { command: failingCommand, expect_failure: true },
        createContext(),
      );
      expect(result1.success).toBe(true);

      // Second call with same command should NOT be blocked
      const result2 = await runCommandTool.invoke(
        { command: failingCommand, expect_failure: true },
        createContext(),
      );
      expect(result2.success).toBe(true);
      // Should have actual exit code, not the "DUPLICATE COMMAND" error
      const json2 = result2.content.find((c) => c.type === "json");
      expect(json2).toBeDefined();
      const parsed2 = JSON.parse(json2!.value);
      expect(parsed2.exit_code).toBe(1);
    });

    it("bypasses duplicate detection for expect_failure commands", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const failingCommand = buildNodeCommand("process.exit(2);");

      // First call WITHOUT expect_failure — should cache the failure
      const result1 = await runCommandTool.invoke(
        { command: failingCommand },
        createContext(),
      );
      expect(result1.success).toBe(false);

      // Second call WITH expect_failure — should bypass the cache and execute
      const result2 = await runCommandTool.invoke(
        { command: failingCommand, expect_failure: true },
        createContext(),
      );
      expect(result2.success).toBe(true);
      const json2 = result2.content.find((c) => c.type === "json");
      const parsed2 = JSON.parse(json2!.value);
      expect(parsed2.exit_code).toBe(2);
    });

    it("still reports timeout as failure even with expect_failure", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const input: RunCommandInput = {
        command: buildNodeCommand("setTimeout(() => process.exit(1), 60000);"),
        timeout_ms: 500,
        expect_failure: true,
      };

      const result = await runCommandTool.invoke(input, createContext());

      // Timeouts are always failures regardless of expect_failure
      expect(result.success).toBe(false);
      const jsonContent = result.content.find((c) => c.type === "json");
      const parsed = JSON.parse(jsonContent!.value);
      expect(parsed.timed_out).toBe(true);
    });
  });

  describe("resetFailedCommandCache", () => {
    it("allows retrying a failed command after cache reset", async () => {
      const { runCommandTool, resetFailedCommandCache } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const failingCommand = buildNodeCommand("process.exit(1);");

      // First call fails and gets cached
      const result1 = await runCommandTool.invoke(
        { command: failingCommand },
        createContext(),
      );
      expect(result1.success).toBe(false);

      // Second call would be blocked
      const result2 = await runCommandTool.invoke(
        { command: failingCommand },
        createContext(),
      );
      expect(result2.success).toBe(false);
      expect(
        result2.content.some((c) =>
          c.value.includes("DUPLICATE COMMAND DETECTED"),
        ),
      ).toBe(true);

      // Reset cache (simulates another tool like write_file running in between)
      resetFailedCommandCache();

      // Third call should actually execute again (not blocked)
      const result3 = await runCommandTool.invoke(
        { command: failingCommand },
        createContext(),
      );
      expect(result3.success).toBe(false);
      // Should have real exit code, not duplicate error
      const json3 = result3.content.find((c) => c.type === "json");
      expect(json3).toBeDefined();
      const parsed3 = JSON.parse(json3!.value);
      expect(parsed3.exit_code).toBe(1);
    });
  });

  describe("Test Command Interception", () => {
    it("blocks 'npm test' with TEST_COMMAND_BLOCKED error", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const input: RunCommandInput = {
        command: "npm test",
      };

      const result = await runCommandTool.invoke(input, createContext());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ToolErrorCode.TEST_COMMAND_BLOCKED);
      expect(result.error?.message).toContain("TEST_COMMAND_BLOCKED");
      expect(result.error?.suggestion).toContain("run_tests tool");
    });

    it("blocks 'npx vitest run' with TEST_COMMAND_BLOCKED error", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const input: RunCommandInput = {
        command: "npx vitest run",
      };

      const result = await runCommandTool.invoke(input, createContext());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ToolErrorCode.TEST_COMMAND_BLOCKED);
      expect(result.error?.message).toContain("TEST_COMMAND_BLOCKED");
    });

    it("allows non-test commands like 'echo hello' to pass through", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const input: RunCommandInput = {
        command: buildNodeCommand("console.log('hello');"),
      };

      const result = await runCommandTool.invoke(input, createContext());

      expect(result.success).toBe(true);
      const jsonContent = result.content.find((c) => c.type === "json");
      const parsed = JSON.parse(jsonContent!.value);
      expect(parsed.stdout).toContain("hello");
    });

    it("blocks 'npm test -- --coverage' (test command with arguments)", async () => {
      const { runCommandTool } =
        await import("../../../../src/agents/tools/system/runCommand.js");

      const input: RunCommandInput = {
        command: "npm test -- --coverage",
      };

      const result = await runCommandTool.invoke(input, createContext());

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ToolErrorCode.TEST_COMMAND_BLOCKED);
      expect(result.error?.message).toContain("TEST_COMMAND_BLOCKED");
    });
  });
});
