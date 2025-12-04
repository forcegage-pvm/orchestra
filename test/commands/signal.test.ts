/**
 * Signal Command Tests
 *
 * TDD: Tests for `orchestra signal` CLI command.
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
  })),
  getResolvedPaths: vi.fn((root: string) => ({
    orchestraDir: path.join(root, ".orchestra"),
    manifest: path.join(root, ".orchestra", "manifest.yaml"),
    handovers: path.join(root, ".orchestra", "implementor", "handovers"),
    signals: path.join(root, ".orchestra", "implementor", "signals"),
    progress: path.join(root, ".orchestra", "progress.yaml"),
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
}));

// Mock git module
vi.mock("../../src/core/git.js", () => ({
  getGitStatus: vi.fn(() =>
    Promise.resolve({
      success: true,
      data: {
        untracked: ["src/feature.ts"],
        staged: [],
        unstaged: [],
      },
    })
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

import { createSignalCommand } from "../../src/commands/signal.js";
import * as output from "../../src/core/output.js";

describe("Signal Command", () => {
  let tempDir: string;
  let orchestraRoot: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "signal-cmd-test-"));
    testTempDir = tempDir;
    orchestraRoot = path.join(tempDir, ".orchestra");

    // Create directory structure
    fs.mkdirSync(path.join(orchestraRoot, "implementor", "handovers"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(orchestraRoot, "implementor", "signals"), {
      recursive: true,
    });

    // Create handover file
    fs.writeFileSync(
      path.join(orchestraRoot, "implementor", "handovers", "current-task.md"),
      "# Task 1: Test Task\n\nImplement feature."
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
          status: "in_progress",
        },
        tasks: [
          {
            id: 1,
            title: "Test Task",
            status: "in_progress",
            category: "CORE",
          },
        ],
      },
    };

    mockProgressData = {
      sprint_id: "test-sprint",
      entries: [
        { task_id: 1, status: "IMPLEMENT", timestamp: new Date().toISOString() },
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
      const command = createSignalCommand();
      expect(command.name()).toBe("signal");
    });

    it("should have required --summary option", () => {
      const command = createSignalCommand();
      const summaryOption = command.options.find((o) => o.long === "--summary");
      expect(summaryOption).toBeDefined();
      expect(summaryOption?.required).toBe(true);
    });

    it("should have optional --task option", () => {
      const command = createSignalCommand();
      const taskOption = command.options.find((o) => o.long === "--task");
      expect(taskOption).toBeDefined();
    });

    it("should have optional --files option", () => {
      const command = createSignalCommand();
      const filesOption = command.options.find((o) => o.long === "--files");
      expect(filesOption).toBeDefined();
    });

    it("should have optional --json option", () => {
      const command = createSignalCommand();
      const jsonOption = command.options.find((o) => o.long === "--json");
      expect(jsonOption).toBeDefined();
    });
  });

  describe("Command Execution", () => {
    it("should call success on successful signal", async () => {
      const command = createSignalCommand();
      await command.parseAsync([
        "node",
        "orchestra",
        "--summary",
        "Implemented feature",
      ]);

      expect(output.print.success).toHaveBeenCalledWith(
        expect.stringContaining("Signal created")
      );
    });

    it("should output JSON when --json flag is used", async () => {
      const command = createSignalCommand();
      await command.parseAsync([
        "node",
        "orchestra",
        "--summary",
        "Implemented feature",
        "--json",
      ]);

      expect(consoleSpy).toHaveBeenCalled();
      const jsonOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.success).toBe(true);
      expect(parsed.taskId).toBe(1);
    });

    it("should handle errors gracefully", async () => {
      // Remove handover to cause error
      fs.unlinkSync(
        path.join(orchestraRoot, "implementor", "handovers", "current-task.md")
      );

      const command = createSignalCommand();
      await command.parseAsync([
        "node",
        "orchestra",
        "--summary",
        "Implemented feature",
      ]);

      expect(output.print.error).toHaveBeenCalled();
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});
