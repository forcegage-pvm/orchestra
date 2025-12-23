/**
 * Tests for Feedback Command
 *
 * Verifies:
 * - createFeedbackCommand exports Command
 * - Command has correct options (--task, --json)
 * - Command calls runFeedback from core module
 * - Command handles errors gracefully
 * - Command outputs correctly in both text and JSON modes
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Command } from "commander";
import { createFeedbackCommand } from "../../src/commands/feedback.js";
import type { Manifest, ProgressLog } from "../../src/core/types.js";
import type { VerifyResult } from "../../src/core/verification.js";
import * as yaml from "yaml";

describe("Feedback Command", () => {
  let tempDir: string;
  let orchestraRoot: string;
  let originalCwd: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Save original cwd
    originalCwd = process.cwd();

    // Create temp directory for testing
    tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "orchestra-feedback-cmd-test-")
    );
    orchestraRoot = path.join(tempDir, "project");

    // Create orchestra directory structure
    const orchestraDir = path.join(orchestraRoot, ".orchestra");
    const handoverDir = path.join(orchestraDir, "handover");
    const orchestratorDir = path.join(orchestraDir, "orchestrator");
    const artifactsDir = path.join(orchestratorDir, "artifacts");
    const resultsDir = path.join(orchestratorDir, "results");

    fs.mkdirSync(orchestraRoot, { recursive: true });
    fs.mkdirSync(handoverDir, { recursive: true });
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.mkdirSync(resultsDir, { recursive: true });

    // Create minimal config.yaml
    const config = {
      project: {
        name: "test-project",
        templates: {
          handover: "handover.md",
        },
      },
      retry: {
        max_retries: 3,
      },
    };
    fs.writeFileSync(
      path.join(orchestraDir, "config.yaml"),
      yaml.stringify(config)
    );

    // Create minimal manifest.yaml
    const manifest: Manifest = {
      sprint: {
        id: "sprint-001",
        name: "Test Sprint",
        status: "ACTIVE",
        created_at: new Date().toISOString(),
      },
      tasks: [
        {
          id: 1,
          title: "Test Task",
          status: "IMPLEMENT",
          dependencies: [],
          max_retries: 3,
          retry_count: 0,
        },
      ],
      current_task_id: 1,
    };
    fs.writeFileSync(
      path.join(orchestraDir, "manifest.yaml"),
      yaml.stringify(manifest)
    );

    // Create empty progress.yaml
    const progress: ProgressLog = {
      sprint_id: "sprint-001",
      entries: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(orchestraDir, "progress.yaml"),
      yaml.stringify(progress)
    );

    // Create verification result file
    const verifyResult: VerifyResult = {
      report: {
        taskId: 1,
        timestamp: new Date().toISOString(),
        overallPassed: false,
        results: [
          {
            description: "File src/example.ts must exist",
            passed: false,
            severity: "critical",
            details: {},
          },
        ],
      },
      exitCode: 1,
    };
    fs.writeFileSync(
      path.join(artifactsDir, "task-1-verification.yaml"),
      yaml.stringify(verifyResult.report)
    );

    // Change to orchestra root
    process.chdir(orchestraRoot);

    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    // Restore original cwd
    process.chdir(originalCwd);

    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    // Restore spies
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe("createFeedbackCommand", () => {
    test("returns a Commander Command instance", () => {
      const command = createFeedbackCommand();
      expect(command).toBeInstanceOf(Command);
    });

    test("command has correct name", () => {
      const command = createFeedbackCommand();
      expect(command.name()).toBe("feedback");
    });

    test("command has correct description", () => {
      const command = createFeedbackCommand();
      const description = command.description();
      expect(description).toContain("feedback");
      expect(description).toContain("implementor");
      expect(description).toContain("verification failure");
    });

    test("command has --task option", () => {
      const command = createFeedbackCommand();
      const taskOption = command.options.find((opt) =>
        opt.flags.includes("--task")
      );
      expect(taskOption).toBeDefined();
      expect(taskOption?.flags).toContain("-t");
    });

    test("command has --json option", () => {
      const command = createFeedbackCommand();
      const jsonOption = command.options.find((opt) =>
        opt.flags.includes("--json")
      );
      expect(jsonOption).toBeDefined();
    });
  });

  describe("command execution", () => {
    test("generates feedback for current task", async () => {
      const command = createFeedbackCommand();

      await command.parseAsync(["node", "test"], { from: "user" });

      // Verify feedback file was created
      const feedbackPath = path.join(orchestraRoot, ".orchestra", "handover", "feedback.md");
      expect(fs.existsSync(feedbackPath)).toBe(true);

      const feedbackContent = fs.readFileSync(feedbackPath, "utf-8");
      expect(feedbackContent).toContain("Task 1");
    });

    test("generates feedback for specific task with --task option", async () => {
      const command = createFeedbackCommand();

      await command.parseAsync(["node", "test", "--task", "1"], {
        from: "user",
      });

      // Verify feedback file was created
      const feedbackPath = path.join(orchestraRoot, ".orchestra", "handover", "feedback.md");
      expect(fs.existsSync(feedbackPath)).toBe(true);
    });

    test("outputs success message in text mode", async () => {
      const command = createFeedbackCommand();

      await command.parseAsync(["node", "test"], { from: "user" });

      // Verify success message was logged
      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("Feedback generated");
      expect(logs).toContain("task 1");
    });

    test("outputs JSON in --json mode", async () => {
      const command = createFeedbackCommand();

      await command.parseAsync(["node", "test", "--json"], { from: "user" });

      // Find the JSON output
      const jsonCalls = consoleLogSpy.mock.calls.filter((call) => {
        try {
          JSON.parse(call[0] as string);
          return true;
        } catch {
          return false;
        }
      });

      expect(jsonCalls.length).toBeGreaterThan(0);

      const jsonOutput = JSON.parse(jsonCalls[0]?.[0] as string);
      expect(jsonOutput.success).toBe(true);
      expect(jsonOutput.taskId).toBe(1);
      expect(jsonOutput.attempt).toBeDefined();
      expect(jsonOutput.maxAttempts).toBeDefined();
      expect(jsonOutput.issues).toBeDefined();
    });

    test("handles error when no verification results found", async () => {
      // Remove verification result file
      const verifyPath = path.join(
        orchestraRoot,
        ".orchestra",
        "orchestrator",
        "artifacts",
        "task-1-verification.yaml"
      );
      fs.rmSync(verifyPath, { force: true });

      const command = createFeedbackCommand();

      await expect(
        command.parseAsync(["node", "test"], { from: "user" })
      ).rejects.toThrow("process.exit(1)");
    });

    test("handles error when task not found", async () => {
      const command = createFeedbackCommand();

      await expect(
        command.parseAsync(["node", "test", "--task", "999"], {
          from: "user",
        })
      ).rejects.toThrow("process.exit(1)");
    });

    test("handles error in JSON mode", async () => {
      // Remove verification result to trigger error
      const verifyPath = path.join(
        orchestraRoot,
        ".orchestra",
        "orchestrator",
        "artifacts",
        "task-1-verification.yaml"
      );
      fs.rmSync(verifyPath, { force: true });

      const command = createFeedbackCommand();

      await expect(
        command.parseAsync(["node", "test", "--json"], { from: "user" })
      ).rejects.toThrow("process.exit(1)");

      // Verify error JSON was logged
      const jsonCalls = consoleLogSpy.mock.calls.filter((call) => {
        try {
          const parsed = JSON.parse(call[0] as string);
          return parsed.success === false;
        } catch {
          return false;
        }
      });

      expect(jsonCalls.length).toBeGreaterThan(0);

      const errorJson = JSON.parse(jsonCalls[0]?.[0] as string);
      expect(errorJson.success).toBe(false);
      expect(errorJson.error).toBeDefined();
    });

    test("displays warning when max attempts reached", async () => {
      // Add failures to reach max attempts
      const progressPath = path.join(
        orchestraRoot,
        ".orchestra",
        "progress.yaml"
      );
      const progress = yaml.parse(
        fs.readFileSync(progressPath, "utf-8")
      ) as ProgressLog;

      // Add 2 previous failures (next will be attempt 3 of 3)
      progress.entries.push(
        {
          task_id: 1,
          status: "VERIFY_FAILED",
          timestamp: new Date().toISOString(),
        },
        {
          task_id: 1,
          status: "VERIFY_FAILED",
          timestamp: new Date().toISOString(),
        }
      );
      fs.writeFileSync(progressPath, yaml.stringify(progress));

      const command = createFeedbackCommand();

      await command.parseAsync(["node", "test"], { from: "user" });

      // Verify escalation suggestion was logged
      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("Maximum attempts reached");
      expect(logs).toContain("escalate");
    });

    test("suggests retry when attempts remain", async () => {
      const command = createFeedbackCommand();

      await command.parseAsync(["node", "test"], { from: "user" });

      // Verify retry suggestion was logged
      const logs = consoleLogSpy.mock.calls.flat().join("\n");
      expect(logs).toContain("Implementor should read feedback and retry");
    });
  });

  describe("imports and integration", () => {
    test("imports runFeedback from core module", async () => {
      // This test verifies the import statement exists by checking
      // that the command can successfully execute, which requires
      // the runFeedback import to work
      const command = createFeedbackCommand();

      await command.parseAsync(["node", "test"], { from: "user" });

      // If we got here, runFeedback was successfully imported and called
      expect(fs.existsSync(
        path.join(orchestraRoot, ".orchestra", "handover", "feedback.md")
      )).toBe(true);
    });

    test("imports FeedbackResult type from core module", () => {
      // This test verifies the type import by checking the command
      // structure includes the expected types
      const command = createFeedbackCommand();

      // If the command was created successfully, the FeedbackResult
      // type import is working (TypeScript compilation would fail otherwise)
      expect(command).toBeDefined();
    });
  });
});
