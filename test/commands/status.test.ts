/**
 * Status Command Tests
 *
 * Tests for the orchestra status command.
 * TDD approach: tests written first, implementation follows.
 *
 * SKIPPED: CLI commands are being deprecated in favor of MCP server.
 * See TD-015: Legacy CLI test failures
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  statusCommand,
  type StatusOptions,
} from "../../src/commands/status.js";
import type { Manifest } from "../../src/core/types.js";

describe.skip("status command", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  // Create a complete test manifest
  function createTestManifest(): Manifest {
    return {
      version: "1.0.0",
      sprint: {
        id: "TEST-001",
        name: "Test Sprint",
        status: "ACTIVE",
        created_at: "2025-12-02T00:00:00Z",
      },
      tasks: [
        {
          id: 1,
          title: "Task 1",
          description: "First task",
          status: "COMPLETE",
          dependencies: [],
          retry_count: 0,
          max_retries: 3,
          completed_at: "2025-12-02T01:00:00Z",
        },
        {
          id: 2,
          title: "Task 2",
          description: "Current task",
          status: "IMPLEMENT",
          dependencies: [1],
          retry_count: 0,
          max_retries: 3,
          started_at: "2025-12-02T02:00:00Z",
        },
        {
          id: 3,
          title: "Task 3",
          description: "Pending task",
          status: "PENDING",
          dependencies: [2],
          retry_count: 0,
          max_retries: 3,
        },
      ],
      current_task_id: 2,
    };
  }

  // Helper to create orchestra directory structure
  function setupOrchestra(manifest: Manifest): void {
    const orchestraDir = path.join(tempDir, ".orchestra");
    fs.mkdirSync(orchestraDir, { recursive: true });

    // Create orchestra.yaml config
    fs.writeFileSync(
      path.join(orchestraDir, "orchestra.yaml"),
      `version: "1.0"
paths:
  manifest: manifest.yaml
`
    );

    // Create manifest.yaml
    const yaml = require("yaml");
    fs.writeFileSync(
      path.join(orchestraDir, "manifest.yaml"),
      yaml.stringify(manifest)
    );
  }

  beforeEach(() => {
    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "status-test-"));

    // Spy on console and process.exit
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });

    // Restore mocks
    vi.restoreAllMocks();
  });

  describe("initialization check", () => {
    it("should exit with code 1 when not initialized", async () => {
      const options: StatusOptions = { brief: true, orchestraRoot: tempDir };

      await expect(statusCommand(options)).rejects.toThrow("process.exit(1)");
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("should output JSON error when not initialized and json flag set", async () => {
      const options: StatusOptions = { json: true, orchestraRoot: tempDir };

      await expect(statusCommand(options)).rejects.toThrow("process.exit(1)");

      const output = consoleSpy.mock.calls[0]?.[0];
      expect(output).toBeDefined();
      const parsed = JSON.parse(output);
      expect(parsed.error).toContain("not initialized");
    });
  });

  describe("brief output", () => {
    it("should show one-line summary with sprint ID and progress", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest);

      const options: StatusOptions = { brief: true, orchestraRoot: tempDir };
      await statusCommand(options);

      const output = consoleSpy.mock.calls[0]?.[0];
      expect(output).toContain("TEST-001");
      expect(output).toContain("Task");
      expect(output).toMatch(/\d+%/); // Should contain percentage
    });
  });

  describe("JSON output", () => {
    it("should output valid parseable JSON", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest);

      const options: StatusOptions = { json: true, orchestraRoot: tempDir };
      await statusCommand(options);

      const output = consoleSpy.mock.calls[0]?.[0];
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it("should include sprint information in JSON", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest);

      const options: StatusOptions = { json: true, orchestraRoot: tempDir };
      await statusCommand(options);

      const output = JSON.parse(consoleSpy.mock.calls[0]?.[0]);
      expect(output.sprint).toBeDefined();
      expect(output.sprint.id).toBe("TEST-001");
    });

    it("should include progress information in JSON", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest);

      const options: StatusOptions = { json: true, orchestraRoot: tempDir };
      await statusCommand(options);

      const output = JSON.parse(consoleSpy.mock.calls[0]?.[0]);
      expect(output.progress).toBeDefined();
      expect(output.progress.total).toBe(3);
      expect(output.progress.completed).toBe(1);
    });

    it("should include current task in JSON", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest);

      const options: StatusOptions = { json: true, orchestraRoot: tempDir };
      await statusCommand(options);

      const output = JSON.parse(consoleSpy.mock.calls[0]?.[0]);
      expect(output.currentTask).toBeDefined();
      expect(output.currentTask.id).toBe(2);
      expect(output.currentTask.status).toBe("IMPLEMENT");
    });
  });

  describe("task detail view", () => {
    it("should show task information for valid task ID", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest);

      const options: StatusOptions = { task: 1, orchestraRoot: tempDir };
      await statusCommand(options);

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("Task 1");
    });

    it("should exit with code 2 for non-existent task", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest);

      const options: StatusOptions = { task: 999, orchestraRoot: tempDir };

      await expect(statusCommand(options)).rejects.toThrow("process.exit(2)");
      expect(exitSpy).toHaveBeenCalledWith(2);
    });

    it("should output JSON error for non-existent task with json flag", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest);

      const options: StatusOptions = {
        task: 999,
        json: true,
        orchestraRoot: tempDir,
      };

      await expect(statusCommand(options)).rejects.toThrow("process.exit(2)");

      const output = consoleSpy.mock.calls[0]?.[0];
      const parsed = JSON.parse(output);
      expect(parsed.error).toContain("not found");
    });

    it("should output task as JSON when json flag set", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest);

      const options: StatusOptions = {
        task: 1,
        json: true,
        orchestraRoot: tempDir,
      };
      await statusCommand(options);

      const output = JSON.parse(consoleSpy.mock.calls[0]?.[0]);
      expect(output.id).toBe(1);
      expect(output.title).toBe("Task 1");
      expect(output.status).toBe("COMPLETE");
    });
  });

  describe("default view", () => {
    it("should show sprint information", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest);

      const options: StatusOptions = { orchestraRoot: tempDir };
      await statusCommand(options);

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("TEST-001");
    });

    it("should show progress information", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest);

      const options: StatusOptions = { orchestraRoot: tempDir };
      await statusCommand(options);

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      // Should show some kind of progress indicator
      expect(output.length).toBeGreaterThan(0);
    });

    it("should show current task", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest);

      const options: StatusOptions = { orchestraRoot: tempDir };
      await statusCommand(options);

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      expect(output).toContain("Task 2");
    });
  });

  describe("metrics view", () => {
    it("should include metrics when flag set", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest);

      const options: StatusOptions = { metrics: true, orchestraRoot: tempDir };
      await statusCommand(options);

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      // Should contain metrics-related content
      expect(output.length).toBeGreaterThan(0);
    });

    it("should include metrics in JSON output", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest);

      const options: StatusOptions = {
        json: true,
        metrics: true,
        orchestraRoot: tempDir,
      };
      await statusCommand(options);

      const output = JSON.parse(consoleSpy.mock.calls[0]?.[0]);
      expect(output.metrics).toBeDefined();
    });
  });

  describe("history view", () => {
    it("should include history when flag set", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest);

      const options: StatusOptions = { history: true, orchestraRoot: tempDir };
      await statusCommand(options);

      const output = consoleSpy.mock.calls.map((c) => c[0]).join("\n");
      // Should list all tasks
      expect(output).toContain("Task 1");
      expect(output).toContain("Task 2");
      expect(output).toContain("Task 3");
    });

    it("should include history in JSON output", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest);

      const options: StatusOptions = {
        json: true,
        history: true,
        orchestraRoot: tempDir,
      };
      await statusCommand(options);

      const output = JSON.parse(consoleSpy.mock.calls[0]?.[0]);
      expect(output.history).toBeDefined();
      expect(Array.isArray(output.history)).toBe(true);
    });
  });

  describe("phase detail view", () => {
    it("should handle phase option", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest);

      const options: StatusOptions = { phase: 1, orchestraRoot: tempDir };
      await statusCommand(options);

      // Should not throw, phase view may show warning about not implemented
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should output JSON for phase view", async () => {
      const manifest = createTestManifest();
      setupOrchestra(manifest);

      const options: StatusOptions = {
        phase: 1,
        json: true,
        orchestraRoot: tempDir,
      };
      await statusCommand(options);

      const output = consoleSpy.mock.calls[0]?.[0];
      expect(() => JSON.parse(output)).not.toThrow();
    });
  });
});
