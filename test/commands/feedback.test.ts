/**
 * Feedback Command Tests
 *
 * TDD: Tests for `orchestra feedback` CLI command.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let testTempDir: string;
let mockManifestData: any;
let mockProgressData: any;

// Mock config module
vi.mock("../../src/core/config.js", () => ({
  requireOrchestraRoot: vi.fn(() => testTempDir),
  loadConfig: vi.fn(() => ({
    version: "1.0",
    paths: {
      manifest: "manifest.yaml",
      handovers: "implementor/handovers",
      signals: "implementor/signals",
      feedback: "implementor/feedback",
      artifacts: "artifacts",
      templates: "common/templates",
    },
    verification: {
      maxAttempts: 3,
    },
  })),
  getResolvedPaths: vi.fn((root: string) => ({
    orchestraDir: path.join(root, ".orchestra"),
    manifest: path.join(root, ".orchestra", "manifest.yaml"),
    handovers: path.join(root, ".orchestra", "implementor", "handovers"),
    signals: path.join(root, ".orchestra", "implementor", "signals"),
    feedback: path.join(root, ".orchestra", "implementor", "feedback"),
    artifacts: path.join(root, ".orchestra", "artifacts"),
    progress: path.join(root, ".orchestra", "progress.yaml"),
    templates: path.join(root, ".orchestra", "common", "templates"),
  })),
}));

// Mock manifest module
vi.mock("../../src/core/manifest.js", () => ({
  loadManifest: vi.fn(() => mockManifestData),
  getTask: vi.fn((manifest: any, taskId: number) => {
    return manifest.tasks.find((t: any) => t.id === taskId);
  }),
}));

// Mock progress module
vi.mock("../../src/core/progress.js", () => ({
  loadProgress: vi.fn(() => mockProgressData),
  addProgressEntry: vi.fn((progress, entry) => ({
    ...progress,
    entries: [
      ...progress.entries,
      { ...entry, timestamp: new Date().toISOString() },
    ],
  })),
  saveProgress: vi.fn(),
}));

// Mock templates module
vi.mock("../../src/core/templates.js", () => ({
  renderTemplate: vi.fn(
    (templateName: string, context: any) =>
      `# Feedback: Task ${context.taskId} - Attempt ${context.attempt}\n\n` +
      `Issues: ${context.issues?.length || 0}\n` +
      `Can Retry: ${context.canRetry}\n`
  ),
}));

// Mock output module
vi.mock("../../src/core/output.js", () => ({
  print: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { createFeedbackCommand } from "../../src/commands/feedback.js";
import * as output from "../../src/core/output.js";

describe("Feedback Command", () => {
  let tempDir: string;
  let orchestraRoot: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-cmd-test-"));
    testTempDir = tempDir;
    orchestraRoot = path.join(tempDir, ".orchestra");

    // Create directory structure
    fs.mkdirSync(path.join(orchestraRoot, "implementor", "feedback"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(orchestraRoot, "artifacts"), {
      recursive: true,
    });

    // Create verification result file
    const verifyResultPath = path.join(
      orchestraRoot,
      "artifacts",
      "task-1-verification.yaml"
    );
    fs.writeFileSync(
      verifyResultPath,
      `taskId: 1
taskTitle: Test Task
timestamp: "2024-01-01T00:00:00Z"
duration: 1000
checks:
  total: 1
  passed: 0
  failed: 1
  skipped: 0
results:
  - checkId: check-1
    type: file_exists
    description: File should exist
    severity: critical
    passed: false
    message: Not found
    duration: 100
overallPassed: false
`
    );

    // Default mock data
    mockManifestData = {
      success: true,
      message: "Loaded",
      data: {
        version: "1.0.0",
        sprint: {
          id: "test-sprint",
          name: "Test Sprint",
          status: "ACTIVE",
        },
        tasks: [
          {
            id: 1,
            title: "Test Task",
            status: "IMPLEMENT",
            category: "CORE",
            retry_count: 0,
            max_retries: 3,
          },
        ],
        current_task_id: 1,
      },
    };

    mockProgressData = {
      sprint_id: "test-sprint",
      entries: [
        {
          task_id: 1,
          status: "IMPLEMENT",
          timestamp: new Date().toISOString(),
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    processExitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
    consoleSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe("Command Definition", () => {
    it("should create command with correct name", () => {
      const command = createFeedbackCommand();
      expect(command.name()).toBe("feedback");
    });

    it("should have optional --task option", () => {
      const command = createFeedbackCommand();
      const taskOption = command.options.find((o) => o.long === "--task");
      expect(taskOption).toBeDefined();
    });

    // Note: --attempt option was removed - attempt is now auto-calculated from progress entries

    it("should have optional --json option", () => {
      const command = createFeedbackCommand();
      const jsonOption = command.options.find((o) => o.long === "--json");
      expect(jsonOption).toBeDefined();
    });

    it("should have description", () => {
      const command = createFeedbackCommand();
      expect(command.description()).toContain("feedback");
    });
  });

  describe("Command Execution", () => {
    it("should call success on successful feedback generation", async () => {
      const command = createFeedbackCommand();
      await command.parseAsync(["node", "orchestra"]);

      expect(output.print.success).toHaveBeenCalledWith(
        expect.stringContaining("Feedback generated")
      );
    });

    it("should output JSON when --json flag is used", async () => {
      const command = createFeedbackCommand();
      await command.parseAsync(["node", "orchestra", "--json"]);

      expect(consoleSpy).toHaveBeenCalled();
      const jsonOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.success).toBe(true);
      expect(parsed.taskId).toBe(1);
    });

    it("should handle errors gracefully", async () => {
      mockManifestData = { success: false, message: "Not found" };

      const command = createFeedbackCommand();
      await command.parseAsync(["node", "orchestra"]);

      expect(output.print.error).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it("should accept --task option", async () => {
      const command = createFeedbackCommand();
      await command.parseAsync(["node", "orchestra", "--task", "1"]);

      expect(output.print.success).toHaveBeenCalled();
    });

    it("should accept --attempt option", async () => {
      const command = createFeedbackCommand();
      await command.parseAsync(["node", "orchestra", "--attempt", "2"]);

      expect(output.print.success).toHaveBeenCalled();
    });
  });
});
