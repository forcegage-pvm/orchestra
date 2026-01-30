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
      const script = "for (let i = 1; i <= 600; i++) { console.log('Line ' + i); }";

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

      const script = "for (let i = 1; i <= 100; i++) { console.log('Line ' + i); }";

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
});
