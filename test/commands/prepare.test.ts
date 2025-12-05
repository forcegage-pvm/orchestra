/**
 * Prepare Command Tests
 *
 * Tests for the orchestra prepare command.
 * TDD approach: tests written first, implementation follows.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPrepareCommand,
  prepareCommand,
} from "../../src/commands/prepare.js";
import { saveConfig } from "../../src/core/config.js";
import {
  determinePreviousTaskForPrepare,
  generateCompletionSignal,
  generateCurrentTask,
  generateHandoverFiles,
  generateTaskContext,
  getDependenciesInfo,
  runFinalize,
  runPrepare,
  selectTask,
  validateDependencies,
  validatePrepare,
} from "../../src/core/prepare.js";
import type { Manifest, Task } from "../../src/core/types.js";
import { DEFAULT_CONFIG } from "../../src/core/types.js";
import { writeYaml } from "../../src/core/yaml.js";

describe("prepare command", () => {
  let tempDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  // Mock manifest for testing
  const createMockManifest = (overrides?: Partial<Manifest>): Manifest => ({
    version: "1.0.0",
    sprint: {
      id: "test-sprint",
      name: "Test Sprint",
      status: "ACTIVE",
      created_at: "2025-12-01T00:00:00Z",
    },
    tasks: [
      {
        id: 1,
        title: "First Task",
        description: "Test task 1",
        status: "COMPLETE",
        category: "INFRASTRUCTURE",
        dependencies: [],
        retry_count: 0,
        max_retries: 3,
      },
      {
        id: 2,
        title: "Second Task",
        description: "Test task 2",
        status: "PENDING",
        category: "INFRASTRUCTURE",
        dependencies: [1],
        retry_count: 0,
        max_retries: 3,
      },
      {
        id: 3,
        title: "Third Task",
        description: "Test task 3",
        status: "PENDING",
        category: "INTEGRATION",
        dependencies: [1, 2],
        retry_count: 0,
        max_retries: 3,
      },
    ],
    current_task_id: 1,
    ...overrides,
  });

  beforeEach(() => {
    // Create temp directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prepare-test-"));

    // Change process.cwd to tempDir so findOrchestraRoot works
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);

    // Spy on console and process.exit
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });

    // Create .orchestra structure
    const orchestraDir = path.join(tempDir, ".orchestra");
    fs.mkdirSync(orchestraDir, { recursive: true });
    fs.mkdirSync(path.join(orchestraDir, "implementor", "handovers"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(orchestraDir, "common", "templates"), {
      recursive: true,
    });

    // Save default config
    saveConfig(tempDir, DEFAULT_CONFIG);

    // Create templates
    const templatesDir = path.join(orchestraDir, "common", "templates");
    fs.writeFileSync(
      path.join(templatesDir, "current-task.md.hbs"),
      "# Task {{task_id}}: {{task_title}}\n\n{{task_description}}"
    );
    fs.writeFileSync(
      path.join(templatesDir, "completion-signal.md.hbs"),
      "# Signal for {{task_id}}"
    );
  });

  afterEach(() => {
    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });

    // Restore mocks
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Command Definition (6 tests)
  // ==========================================================================

  describe("command definition", () => {
    it("should have correct name and description", () => {
      const command = createPrepareCommand();
      expect(command.name()).toBe("prepare");
      expect(command.description()).toContain("Prepare handover");
    });

    it("should have --task option", () => {
      const command = createPrepareCommand();
      const option = command.options.find((o) => o.long === "--task");
      expect(option).toBeDefined();
      expect(option?.description).toContain("Specific task ID");
    });

    it("should have --force option", () => {
      const command = createPrepareCommand();
      const option = command.options.find((o) => o.long === "--force");
      expect(option).toBeDefined();
      expect(option?.short).toBe("-f");
    });

    it("should have --dry-run option", () => {
      const command = createPrepareCommand();
      const option = command.options.find((o) => o.long === "--dry-run");
      expect(option).toBeDefined();
    });

    it("should have --json option", () => {
      const command = createPrepareCommand();
      const option = command.options.find((o) => o.long === "--json");
      expect(option).toBeDefined();
    });

    it("should have --skip-closeout option", () => {
      const command = createPrepareCommand();
      const option = command.options.find((o) => o.long === "--skip-closeout");
      expect(option).toBeDefined();
    });

    it("should have --git-stage option", () => {
      const command = createPrepareCommand();
      const option = command.options.find((o) => o.long === "--git-stage");
      expect(option).toBeDefined();
    });

    it("should have --git-commit option", () => {
      const command = createPrepareCommand();
      const option = command.options.find((o) => o.long === "--git-commit");
      expect(option).toBeDefined();
    });
  });

  // ==========================================================================
  // 2. Task Selection (4 tests)
  // ==========================================================================

  describe("task selection", () => {
    it("should select next pending task when no --task specified", () => {
      const manifest = createMockManifest();
      const task = selectTask(manifest);

      expect(task.id).toBe(2); // Task 2 is next pending with satisfied dependencies
      expect(task.status).toBe("PENDING");
    });

    it("should select specific task when --task <id> provided", () => {
      const manifest = createMockManifest();
      const task = selectTask(manifest, "3");

      expect(task.id).toBe(3);
      expect(task.title).toBe("Third Task");
    });

    it("should fail when task ID not found", () => {
      const manifest = createMockManifest();

      expect(() => selectTask(manifest, "999")).toThrow("Task not found");
    });

    it("should fail when task ID is invalid", () => {
      const manifest = createMockManifest();

      expect(() => selectTask(manifest, "invalid")).toThrow("Invalid task ID");
    });
  });

  // ==========================================================================
  // 3. Dependency Validation (3 tests)
  // ==========================================================================

  describe("dependency validation", () => {
    it("should pass when all dependencies complete", () => {
      const manifest = createMockManifest();
      const task = manifest.tasks[1]; // Task 2 depends on Task 1 (complete)

      expect(() => validateDependencies(manifest, task)).not.toThrow();
    });

    it("should fail when any dependency incomplete", () => {
      const manifest = createMockManifest();
      const task = manifest.tasks[2]; // Task 3 depends on Task 2 (pending)

      expect(() => validateDependencies(manifest, task)).toThrow(
        "Dependency 2 is not complete"
      );
    });

    it("should fail when dependency not found in manifest", () => {
      const manifest = createMockManifest();
      const task: Task = {
        id: 4,
        title: "Task with missing dep",
        status: "PENDING",
        dependencies: [999],
        retry_count: 0,
        max_retries: 3,
      };

      expect(() => validateDependencies(manifest, task)).toThrow(
        "Dependency not found: 999"
      );
    });
  });

  // ==========================================================================
  // 4. In-Progress Check (3 tests)
  // ==========================================================================

  describe("in-progress check", () => {
    it("should fail when another task is in-progress (without --force)", () => {
      const manifest = createMockManifest({
        tasks: [
          {
            id: 1,
            title: "Task 1",
            status: "IMPLEMENT", // In progress
            dependencies: [],
            retry_count: 0,
            max_retries: 3,
          },
          {
            id: 2,
            title: "Task 2",
            status: "PENDING",
            dependencies: [],
            retry_count: 0,
            max_retries: 3,
          },
        ],
      });
      const task = manifest.tasks[1]; // Task 2

      expect(() => validatePrepare(manifest, task, false)).toThrow(
        "Task 1 is already in progress"
      );
    });

    it("should proceed when --force flag used", () => {
      const manifest = createMockManifest({
        tasks: [
          {
            id: 1,
            title: "Task 1",
            status: "IMPLEMENT",
            dependencies: [],
            retry_count: 0,
            max_retries: 3,
          },
          {
            id: 2,
            title: "Task 2",
            status: "PENDING",
            dependencies: [],
            retry_count: 0,
            max_retries: 3,
          },
        ],
      });
      const task = manifest.tasks[1]; // Task 2

      expect(() => validatePrepare(manifest, task, true)).not.toThrow();
    });

    it("should proceed when no task is in-progress", () => {
      const manifest = createMockManifest();
      const task = manifest.tasks[1]; // Task 2, Task 1 is COMPLETE

      expect(() => validatePrepare(manifest, task, false)).not.toThrow();
    });
  });

  // ==========================================================================
  // 5. Closeout Integration (3 tests)
  // ==========================================================================

  describe("closeout integration", () => {
    it("should determine previous task correctly", () => {
      const manifest = createMockManifest({ current_task_id: 1 });

      const previous = determinePreviousTaskForPrepare(manifest, 2);
      expect(previous).toBe(1);
    });

    it("should return null for first task", () => {
      const manifest = createMockManifest();

      const previous = determinePreviousTaskForPrepare(manifest, 1);
      expect(previous).toBeNull();
    });

    it("should handle task without explicit current_task_id", () => {
      const manifest = createMockManifest({ current_task_id: undefined });

      const previous = determinePreviousTaskForPrepare(manifest, 2);
      expect(previous).toBe(1); // Should return task 1 (ID-based)
    });
  });

  // ==========================================================================
  // 6. File Generation (5 tests)
  // ==========================================================================

  describe("file generation", () => {
    beforeEach(() => {
      // Save manifest
      const manifestPath = path.join(tempDir, ".orchestra", "manifest.yaml");
      const manifest = createMockManifest();
      writeYaml(manifestPath, manifest);
    });

    it("should generate handover/current-task.md", () => {
      const manifest = createMockManifest();
      const task = manifest.tasks[1];

      generateHandoverFiles(tempDir, manifest, task);

      const currentTaskPath = path.join(
        tempDir,
        ".orchestra",
        "handover",
        "current-task.md"
      );
      expect(fs.existsSync(currentTaskPath)).toBe(true);
    });

    it("should generate handover/completion-signal.md", () => {
      const manifest = createMockManifest();
      const task = manifest.tasks[1];

      generateHandoverFiles(tempDir, manifest, task);

      const signalPath = path.join(
        tempDir,
        ".orchestra",
        "handover",
        "completion-signal.md"
      );
      expect(fs.existsSync(signalPath)).toBe(true);
    });

    it("should generate handover/task-context.md", () => {
      const manifest = createMockManifest();
      const task = manifest.tasks[1];

      generateHandoverFiles(tempDir, manifest, task);

      const contextPath = path.join(
        tempDir,
        ".orchestra",
        "handover",
        "task-context.md"
      );
      expect(fs.existsSync(contextPath)).toBe(true);
    });

    it("should clear handover/verification/ folder", () => {
      const manifest = createMockManifest();
      const task = manifest.tasks[1];

      // Create verification folder with a file
      const verificationPath = path.join(
        tempDir,
        ".orchestra",
        "handover",
        "verification"
      );
      fs.mkdirSync(verificationPath, { recursive: true });
      fs.writeFileSync(path.join(verificationPath, "old-file.txt"), "old");

      generateHandoverFiles(tempDir, manifest, task);

      // Folder should exist but old file should be gone
      expect(fs.existsSync(verificationPath)).toBe(true);
      const files = fs.readdirSync(verificationPath);
      // Should be empty or only contain .gitkeep
      expect(files.length).toBeLessThanOrEqual(1);
      if (files.length === 1) {
        expect(files[0]).toBe(".gitkeep");
      }
      // Old file should not exist
      expect(fs.existsSync(path.join(verificationPath, "old-file.txt"))).toBe(
        false
      );
    });

    it("should use templates for generation", () => {
      const manifest = createMockManifest();
      const task = manifest.tasks[1];

      const content = generateCurrentTask(manifest, task, tempDir);

      // Should contain template-rendered content
      expect(content).toContain(`Task ${task.id}`);
      expect(content).toContain(task.title);
    });
  });

  // ==========================================================================
  // 7. Manifest Updates (4 tests)
  // ==========================================================================

  describe("manifest updates", () => {
    beforeEach(() => {
      // Save manifest
      const manifestPath = path.join(tempDir, ".orchestra", "manifest.yaml");
      const manifest = createMockManifest();
      writeYaml(manifestPath, manifest);
    });

    it("should update task status from PENDING to IMPLEMENT", async () => {
      const manifestPath = path.join(tempDir, ".orchestra", "manifest.yaml");

      await runPrepare({ skipCloseout: true });

      const updatedManifest = fs.readFileSync(manifestPath, "utf-8");
      expect(updatedManifest).toContain("IMPLEMENT");
    });

    it("should update current_task_id in manifest", async () => {
      const manifestPath = path.join(tempDir, ".orchestra", "manifest.yaml");

      await runPrepare({ skipCloseout: true });

      const updatedManifest = fs.readFileSync(manifestPath, "utf-8");
      expect(updatedManifest).toContain("current_task_id: 2");
    });

    it("should set started_at timestamp", async () => {
      const manifestPath = path.join(tempDir, ".orchestra", "manifest.yaml");

      await runPrepare({ skipCloseout: true });

      const updatedManifest = fs.readFileSync(manifestPath, "utf-8");
      expect(updatedManifest).toContain("started_at:");
    });

    it("should not modify other tasks", async () => {
      const manifestPath = path.join(tempDir, ".orchestra", "manifest.yaml");
      const originalManifest = createMockManifest();

      await runPrepare({ skipCloseout: true });

      const updatedContent = fs.readFileSync(manifestPath, "utf-8");
      // Task 1 should still be COMPLETE
      expect(updatedContent).toContain("COMPLETE");
      // Task 3 should still be PENDING
      const task3Index = updatedContent.indexOf("Third Task");
      const afterTask3 = updatedContent.substring(task3Index);
      expect(afterTask3).toContain("PENDING");
    });
  });

  // ==========================================================================
  // 8. Dry Run (3 tests)
  // ==========================================================================

  describe("dry run", () => {
    beforeEach(() => {
      const manifestPath = path.join(tempDir, ".orchestra", "manifest.yaml");
      const manifest = createMockManifest();
      writeYaml(manifestPath, manifest);
    });

    it("should show what would be generated", async () => {
      const result = await runPrepare({ dryRun: true, skipCloseout: true });

      expect(result.dryRun).toBe(true);
      expect(result.filesGenerated.length).toBeGreaterThan(0);
    });

    it("should not modify any files when --dry-run", async () => {
      const handoverPath = path.join(
        tempDir,
        ".orchestra",
        "implementor",
        "handovers"
      );
      const beforeFiles = fs.readdirSync(handoverPath);

      await runPrepare({ dryRun: true, skipCloseout: true });

      const afterFiles = fs.readdirSync(handoverPath);
      expect(afterFiles).toEqual(beforeFiles);
    });

    it("should not update manifest when --dry-run", async () => {
      const manifestPath = path.join(tempDir, ".orchestra", "manifest.yaml");
      const beforeContent = fs.readFileSync(manifestPath, "utf-8");

      await runPrepare({ dryRun: true, skipCloseout: true });

      const afterContent = fs.readFileSync(manifestPath, "utf-8");
      expect(afterContent).toBe(beforeContent);
    });
  });

  // ==========================================================================
  // 9. JSON Output (2 tests)
  // ==========================================================================

  describe("JSON output", () => {
    beforeEach(() => {
      const manifestPath = path.join(tempDir, ".orchestra", "manifest.yaml");
      const manifest = createMockManifest();
      writeYaml(manifestPath, manifest);
    });

    it("should output valid JSON when --json flag used", async () => {
      // Mock console.log to capture output
      let jsonOutput = "";
      consoleSpy.mockImplementation((msg) => {
        jsonOutput = msg;
      });

      try {
        await prepareCommand({ json: true, skipCloseout: true });
      } catch (e) {
        // Expected: process.exit(0)
      }

      // Should be valid JSON
      expect(() => JSON.parse(jsonOutput)).not.toThrow();
    });

    it("JSON should include task info, files generated, dependencies", async () => {
      const manifestPath = path.join(tempDir, ".orchestra", "manifest.yaml");
      const manifest = createMockManifest();
      writeYaml(manifestPath, manifest);

      // Create spec directory and files
      const specDir = path.join(tempDir, "spec");
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(path.join(specDir, "task-1.md"), "# Task 1 Spec");
      fs.writeFileSync(path.join(specDir, "task-2.md"), "# Task 2 Spec");

      let jsonOutput = "";
      let errorOutput = "";
      consoleSpy.mockImplementation((msg) => {
        jsonOutput = msg;
      });
      consoleErrorSpy.mockImplementation((msg) => {
        errorOutput += msg + "\\n";
      });

      try {
        await prepareCommand({ json: true, skipCloseout: true });
      } catch (e) {
        // Expected: process.exit(0)
      }

      // Debug: log what we actually got
      if (errorOutput) {
        throw new Error(`Console errors: ${errorOutput}`);
      }

      const parsed = JSON.parse(jsonOutput);
      if (!parsed.success && parsed.error) {
        throw new Error(`Prepare failed: ${parsed.error}`);
      }

      // Should be valid JSON
      expect(parsed).toHaveProperty("success");
      expect(parsed.success).toBe(true); // Should succeed!
      expect(parsed).toHaveProperty("task");
      expect(parsed).toHaveProperty("files");
      expect(parsed.task).toHaveProperty("id");
      expect(parsed.task).toHaveProperty("title");
    });
  });

  // ==========================================================================
  // 10. Error Handling (4 tests)
  // ==========================================================================

  describe("error handling", () => {
    it("should handle missing manifest gracefully", async () => {
      // Don't create manifest
      expect(
        async () => await runPrepare({ skipCloseout: true })
      ).rejects.toThrow();
    });

    it("should fail when templates are missing", async () => {
      const manifestPath = path.join(tempDir, ".orchestra", "manifest.yaml");
      const manifest = createMockManifest();
      writeYaml(manifestPath, manifest);

      // Remove templates
      const templatesDir = path.join(
        tempDir,
        ".orchestra",
        "common",
        "templates"
      );
      fs.rmSync(templatesDir, { recursive: true });

      // Should fail when templates are missing (no silent fallback)
      await expect(runPrepare({ skipCloseout: true })).rejects.toThrow(
        /Template not found/
      );
    });

    it("should handle file system errors", async () => {
      const manifestPath = path.join(tempDir, ".orchestra", "manifest.yaml");
      const manifest = createMockManifest();
      writeYaml(manifestPath, manifest);

      // Make handover directory read-only (simulate permission error)
      const handoverPath = path.join(tempDir, ".orchestra", "handover");

      // On Windows, we can't easily simulate this, so skip this specific test
      // or test a different error condition
      if (process.platform !== "win32") {
        fs.chmodSync(handoverPath, 0o444);

        expect(
          async () => await runPrepare({ skipCloseout: true })
        ).rejects.toThrow();

        // Restore permissions
        fs.chmodSync(handoverPath, 0o755);
      }
    });

    it("should have correct exit codes", async () => {
      const manifestPath = path.join(tempDir, ".orchestra", "manifest.yaml");
      const manifest = createMockManifest();
      writeYaml(manifestPath, manifest);

      // Create spec directory and files for success case
      const specDir = path.join(tempDir, "spec");
      fs.mkdirSync(specDir, { recursive: true });
      fs.writeFileSync(path.join(specDir, "task-1.md"), "# Task 1 Spec");
      fs.writeFileSync(path.join(specDir, "task-2.md"), "# Task 2 Spec");

      // Success case
      try {
        await prepareCommand({ skipCloseout: true });
      } catch (e: any) {
        expect(e.message).toBe("process.exit(0)");
      }

      // Error case - remove manifest for failure
      fs.rmSync(manifestPath);
      try {
        await prepareCommand({ skipCloseout: true });
      } catch (e: any) {
        expect(e.message).toBe("process.exit(1)");
      }
    });
  });

  // ==========================================================================
  // Additional Tests
  // ==========================================================================

  describe("dependencies info", () => {
    it("should get dependency information", () => {
      const manifest = createMockManifest();
      const task = manifest.tasks[1]; // Task 2 depends on Task 1

      const deps = getDependenciesInfo(manifest, task);

      expect(deps).toHaveLength(1);
      expect(deps[0]).toEqual({
        id: 1,
        title: "First Task",
        status: "COMPLETE",
      });
    });
  });

  describe("task context generation", () => {
    it("should generate task context with sprint info", () => {
      const manifest = createMockManifest();
      const task = manifest.tasks[1];

      const context = generateTaskContext(manifest, task, tempDir);

      expect(context).toContain("Test Sprint");
      expect(context).toContain("Task 2");
    });
  });

  describe("completion signal generation", () => {
    it("should generate completion signal template", () => {
      const task = createMockManifest().tasks[1];

      const signal = generateCompletionSignal(task, tempDir);

      expect(signal).toContain(`Signal for ${task.id}`);
    });
  });

  // ==========================================================================
  // Finalize Tests (TD-007)
  // ==========================================================================

  describe("finalize command (--finalize)", () => {
    it("should have --finalize option", () => {
      const command = createPrepareCommand();
      const option = command.options.find((o) => o.long === "--finalize");
      expect(option).toBeDefined();
      expect(option?.description).toContain("Archive handover");
    });

    describe("runFinalize", () => {
      beforeEach(() => {
        // Create manifest with task in IMPLEMENT status
        const manifest = createMockManifest({
          tasks: [
            {
              id: 1,
              title: "First Task",
              description: "Test task 1",
              status: "COMPLETE",
              category: "INFRASTRUCTURE",
              dependencies: [],
              retry_count: 0,
              max_retries: 3,
            },
            {
              id: 2,
              title: "Second Task",
              description: "Test task 2",
              status: "IMPLEMENT", // Active task
              category: "INFRASTRUCTURE",
              dependencies: [1],
              retry_count: 0,
              max_retries: 3,
            },
          ],
          current_task_id: 2,
        });
        writeYaml(path.join(tempDir, ".orchestra", "manifest.yaml"), manifest);

        // Create handover directory and files
        const handoverDir = path.join(tempDir, ".orchestra", "handover");
        fs.mkdirSync(handoverDir, { recursive: true });
        fs.writeFileSync(
          path.join(handoverDir, "current-task.md"),
          "# Task 2: Second Task\n\nTest content"
        );
        fs.writeFileSync(
          path.join(handoverDir, "preflight-checklist.yaml"),
          "checklist:\n  - item: test\n    completed: true"
        );

        // Create preflight directory
        const preflightDir = path.join(
          tempDir,
          ".orchestra",
          "orchestrator",
          ".orchestrator-only",
          "preflight"
        );
        fs.mkdirSync(preflightDir, { recursive: true });
      });

      it("should copy handover to preflight folder", async () => {
        const result = await runFinalize();

        expect(result.taskId).toBe(2);
        expect(result.handoverCopied).toBe("task-2.md");
        expect(result.dryRun).toBe(false);

        // Verify file was copied
        const destPath = path.join(
          tempDir,
          ".orchestra",
          "orchestrator",
          ".orchestrator-only",
          "preflight",
          "task-2.md"
        );
        expect(fs.existsSync(destPath)).toBe(true);
        expect(fs.readFileSync(destPath, "utf-8")).toContain("Second Task");
      });

      it("should move checklist to preflight folder", async () => {
        const result = await runFinalize();

        expect(result.checklistArchived).toBe("preflight-task-2.yaml");

        // Verify file was moved
        const destPath = path.join(
          tempDir,
          ".orchestra",
          "orchestrator",
          ".orchestrator-only",
          "preflight",
          "preflight-task-2.yaml"
        );
        expect(fs.existsSync(destPath)).toBe(true);

        // Verify source was removed
        const sourcePath = path.join(
          tempDir,
          ".orchestra",
          "handover",
          "preflight-checklist.yaml"
        );
        expect(fs.existsSync(sourcePath)).toBe(false);
      });

      it("should support dry-run mode", async () => {
        const result = await runFinalize({ dryRun: true });

        expect(result.dryRun).toBe(true);
        expect(result.taskId).toBe(2);

        // Verify files were NOT copied/moved
        const destPath = path.join(
          tempDir,
          ".orchestra",
          "orchestrator",
          ".orchestrator-only",
          "preflight",
          "task-2.md"
        );
        expect(fs.existsSync(destPath)).toBe(false);
      });

      it("should fail if handover file does not exist", async () => {
        // Remove the handover file
        fs.unlinkSync(
          path.join(tempDir, ".orchestra", "handover", "current-task.md")
        );

        await expect(runFinalize()).rejects.toThrow("Handover file not found");
      });

      it("should fail if checklist file does not exist", async () => {
        // Remove the checklist file
        fs.unlinkSync(
          path.join(
            tempDir,
            ".orchestra",
            "handover",
            "preflight-checklist.yaml"
          )
        );

        await expect(runFinalize()).rejects.toThrow(
          "Pre-flight checklist not found"
        );
      });

      it("should fail if no active task (all complete)", async () => {
        // Update manifest to have all tasks complete (no pending either)
        const manifest = createMockManifest({
          tasks: [
            {
              id: 1,
              title: "First Task",
              description: "Test task 1",
              status: "COMPLETE",
              category: "INFRASTRUCTURE",
              dependencies: [],
              retry_count: 0,
              max_retries: 3,
            },
          ],
          current_task_id: undefined,
        });
        writeYaml(path.join(tempDir, ".orchestra", "manifest.yaml"), manifest);

        await expect(runFinalize()).rejects.toThrow("No active task found");
      });
    });
  });
});
