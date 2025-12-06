/**
 * Workflow State Detection Tests
 *
 * Tests for workflow state detection and inference logic.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Manifest } from "../../src/core/types.js";
import { detectWorkflowState } from "../../src/core/workflow-state.js";
import { writeYaml } from "../../src/core/yaml.js";

describe("Workflow State Detection", () => {
  let tempDir: string;
  let orchestraDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-state-test-"));
    orchestraDir = path.join(tempDir, ".orchestra");
    fs.mkdirSync(orchestraDir, { recursive: true });
    // Create minimal config
    fs.writeFileSync(path.join(orchestraDir, "orchestra.yaml"), "version: 1.0");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to create a valid manifest object
   */
  function createTestManifest(
    overrides: Partial<{
      sprintId: string;
      currentTaskId: number;
      tasks: Array<{ id: number; title: string; status: string }>;
    }> = {}
  ): Manifest {
    const tasks = overrides.tasks ?? [
      {
        id: 1,
        title: "Test Task",
        description: "Test",
        status: "PENDING",
        dependencies: [],
        retry_count: 0,
        max_retries: 3,
      },
    ];
    return {
      version: "1.0.0",
      sprint: {
        id: overrides.sprintId ?? "test-sprint",
        name: "Test Sprint",
        status: "ACTIVE",
        created_at: new Date().toISOString(),
      },
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: "Test description",
        status: t.status as
          | "PENDING"
          | "PREPARE"
          | "IMPLEMENT"
          | "GATE_CHECK"
          | "VERIFY"
          | "COMPLETE"
          | "RETRY"
          | "ESCALATED",
        dependencies: [],
        retry_count: 0,
        max_retries: 3,
      })),
      current_task_id: overrides.currentTaskId,
    };
  }

  describe("detectWorkflowState", () => {
    it("should detect initialized state with valid manifest", () => {
      const manifest = createTestManifest({ sprintId: "my-sprint" });
      writeYaml(path.join(orchestraDir, "manifest.yaml"), manifest);

      const state = detectWorkflowState(tempDir);

      expect(state.initialized).toBe(true);
      expect(state.sprintId).toBe("my-sprint");
      expect(state.sprintStatus).toBe("ACTIVE");
    });

    it("should infer SELECT_TASK when no current task", () => {
      const manifest = createTestManifest({});
      writeYaml(path.join(orchestraDir, "manifest.yaml"), manifest);

      const state = detectWorkflowState(tempDir);

      expect(state.inferredStep).toBe("SELECT_TASK");
      expect(state.currentTaskId).toBeNull();
    });

    it("should detect current task when one is in progress", () => {
      const manifest = createTestManifest({
        currentTaskId: 1,
        tasks: [{ id: 1, title: "First Task", status: "IMPLEMENT" }],
      });
      writeYaml(path.join(orchestraDir, "manifest.yaml"), manifest);

      const state = detectWorkflowState(tempDir);

      expect(state.currentTaskId).toBe(1);
      expect(state.currentTask?.title).toBe("First Task");
      expect(state.currentTaskStatus).toBe("IMPLEMENT");
    });

    it("should infer SPRINT_COMPLETE when all tasks are COMPLETE", () => {
      const manifest = createTestManifest({
        tasks: [
          { id: 1, title: "First Task", status: "COMPLETE" },
          { id: 2, title: "Second Task", status: "COMPLETE" },
        ],
      });
      writeYaml(path.join(orchestraDir, "manifest.yaml"), manifest);

      const state = detectWorkflowState(tempDir);

      expect(state.sprintComplete).toBe(true);
      expect(state.inferredStep).toBe("SPRINT_COMPLETE");
    });

    it("should infer ESCALATED when task status is ESCALATED", () => {
      const manifest = createTestManifest({
        currentTaskId: 1,
        tasks: [{ id: 1, title: "First Task", status: "ESCALATED" }],
      });
      writeYaml(path.join(orchestraDir, "manifest.yaml"), manifest);

      const state = detectWorkflowState(tempDir);

      expect(state.inferredStep).toBe("ESCALATED");
    });
  });

  describe("WorkflowState type", () => {
    it("should have all expected properties", () => {
      const manifest = createTestManifest({});
      writeYaml(path.join(orchestraDir, "manifest.yaml"), manifest);

      const state = detectWorkflowState(tempDir);

      // Check core properties exist
      expect(state).toHaveProperty("initialized");
      expect(state).toHaveProperty("configured");
      expect(state).toHaveProperty("sprintId");
      expect(state).toHaveProperty("sprintStatus");
      expect(state).toHaveProperty("sprintComplete");
      expect(state).toHaveProperty("currentTaskId");
      expect(state).toHaveProperty("currentTask");
      expect(state).toHaveProperty("currentTaskStatus");
      expect(state).toHaveProperty("handoverExists");
      expect(state).toHaveProperty("signalExists");
      expect(state).toHaveProperty("verificationExists");
      expect(state).toHaveProperty("verificationPassed");
      expect(state).toHaveProperty("feedbackExists");
      expect(state).toHaveProperty("retryCount");
      expect(state).toHaveProperty("maxRetries");
      expect(state).toHaveProperty("inferredStep");
      expect(state).toHaveProperty("errors");
    });
  });
});
