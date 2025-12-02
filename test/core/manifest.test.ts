/**
 * Manifest Management Tests
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ManifestError, TaskError } from "../../src/core/errors.js";
import {
  getCurrentTask,
  getManifestPath,
  getNextTask,
  getTask,
  getTaskStats,
  loadManifest,
  manifestExists,
  saveManifest,
  updateTaskStatus,
} from "../../src/core/manifest.js";
import type { Manifest } from "../../src/core/types.js";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestra-manifest-test-"));
});

afterEach(() => {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createOrchestraDir(rootDir: string): void {
  const orchestraDir = path.join(rootDir, ".orchestra");
  fs.mkdirSync(orchestraDir, { recursive: true });
  fs.writeFileSync(
    path.join(orchestraDir, "orchestra.yaml"),
    'version: "1.0.0"\norchestra_dir: ".orchestra"\n',
    "utf-8"
  );
}

function createManifest(rootDir: string, manifest: Manifest): void {
  const orchestraDir = path.join(rootDir, ".orchestra");
  const manifestPath = path.join(orchestraDir, "manifest.yaml");

  // Convert to YAML manually for testing
  let yaml = `version: "${manifest.version}"\n`;
  yaml += `metadata:\n`;
  yaml += `  feature_id: "${manifest.metadata.feature_id}"\n`;
  yaml += `  title: "${manifest.metadata.title}"\n`;
  if (manifest.metadata.description) {
    yaml += `  description: "${manifest.metadata.description}"\n`;
  }
  yaml += `tasks:\n`;
  for (const task of manifest.tasks) {
    yaml += `  - id: "${task.id}"\n`;
    yaml += `    title: "${task.title}"\n`;
    yaml += `    status: "${task.status}"\n`;
    if (task.depends_on && task.depends_on.length > 0) {
      yaml += `    depends_on:\n`;
      for (const dep of task.depends_on) {
        yaml += `      - "${dep}"\n`;
      }
    }
  }

  fs.writeFileSync(manifestPath, yaml, "utf-8");
}

function createSampleManifest(): Manifest {
  return {
    version: "1.0.0",
    metadata: {
      feature_id: "TEST-001",
      title: "Test Feature",
    },
    tasks: [
      { id: "task-1", title: "First Task", status: "not-started" },
      {
        id: "task-2",
        title: "Second Task",
        status: "not-started",
        depends_on: ["task-1"],
      },
      {
        id: "task-3",
        title: "Third Task",
        status: "not-started",
        depends_on: ["task-2"],
      },
    ],
  };
}

describe("getManifestPath", () => {
  it("should return path to manifest file", () => {
    createOrchestraDir(tempDir);

    const result = getManifestPath(tempDir);

    expect(result).toBe(path.join(tempDir, ".orchestra", "manifest.yaml"));
  });
});

describe("manifestExists", () => {
  it("should return true when manifest exists", () => {
    createOrchestraDir(tempDir);
    createManifest(tempDir, createSampleManifest());

    expect(manifestExists(tempDir)).toBe(true);
  });

  it("should return false when manifest does not exist", () => {
    createOrchestraDir(tempDir);

    expect(manifestExists(tempDir)).toBe(false);
  });

  it("should return false when orchestra is not initialized", () => {
    expect(manifestExists(tempDir)).toBe(false);
  });
});

describe("loadManifest", () => {
  it("should load and validate manifest", () => {
    createOrchestraDir(tempDir);
    const sampleManifest = createSampleManifest();
    createManifest(tempDir, sampleManifest);

    const manifest = loadManifest(tempDir);

    expect(manifest.metadata.feature_id).toBe("TEST-001");
    expect(manifest.tasks).toHaveLength(3);
  });

  it("should throw ManifestError when manifest does not exist", () => {
    createOrchestraDir(tempDir);

    expect(() => loadManifest(tempDir)).toThrow(ManifestError);
  });
});

describe("saveManifest", () => {
  it("should save manifest to file", () => {
    createOrchestraDir(tempDir);
    const manifest = createSampleManifest();

    saveManifest(manifest, tempDir);

    const loaded = loadManifest(tempDir);
    expect(loaded.metadata.feature_id).toBe("TEST-001");
  });

  it("should update the updated_at timestamp", () => {
    createOrchestraDir(tempDir);
    const manifest = createSampleManifest();

    saveManifest(manifest, tempDir);

    const loaded = loadManifest(tempDir);
    expect(loaded.metadata.updated_at).toBeDefined();
  });
});

describe("getTask", () => {
  it("should find task by ID", () => {
    const manifest = createSampleManifest();

    const task = getTask(manifest, "task-2");

    expect(task?.title).toBe("Second Task");
  });

  it("should return undefined for non-existent task", () => {
    const manifest = createSampleManifest();

    const task = getTask(manifest, "non-existent");

    expect(task).toBeUndefined();
  });
});

describe("getCurrentTask", () => {
  it("should return in-progress task first", () => {
    const manifest = createSampleManifest();
    manifest.tasks[1]!.status = "in-progress";

    const task = getCurrentTask(manifest);

    expect(task?.id).toBe("task-2");
  });

  it("should return first not-started task with satisfied dependencies", () => {
    const manifest = createSampleManifest();

    const task = getCurrentTask(manifest);

    expect(task?.id).toBe("task-1");
  });

  it("should skip tasks with unsatisfied dependencies", () => {
    const manifest = createSampleManifest();
    manifest.tasks[0]!.status = "blocked";

    const task = getCurrentTask(manifest);

    // task-2 and task-3 depend on task-1 which is blocked
    expect(task).toBeUndefined();
  });

  it("should return undefined when all tasks are completed", () => {
    const manifest = createSampleManifest();
    manifest.tasks.forEach((t) => (t.status = "completed"));

    const task = getCurrentTask(manifest);

    expect(task).toBeUndefined();
  });
});

describe("getNextTask", () => {
  it("should return first available not-started task", () => {
    const manifest = createSampleManifest();

    const task = getNextTask(manifest);

    expect(task?.id).toBe("task-1");
  });

  it("should respect dependencies", () => {
    const manifest = createSampleManifest();
    manifest.tasks[0]!.status = "completed";

    const task = getNextTask(manifest);

    expect(task?.id).toBe("task-2");
  });

  it("should return undefined when no tasks are available", () => {
    const manifest = createSampleManifest();
    manifest.tasks[0]!.status = "in-progress";

    const task = getNextTask(manifest);

    // task-1 is in-progress, task-2 depends on task-1
    expect(task).toBeUndefined();
  });
});

describe("updateTaskStatus", () => {
  it("should update task status", () => {
    const manifest = createSampleManifest();

    const updated = updateTaskStatus(manifest, "task-1", "in-progress");

    const task = getTask(updated, "task-1");
    expect(task?.status).toBe("in-progress");
  });

  it("should set started_at when moving to in-progress", () => {
    const manifest = createSampleManifest();

    const updated = updateTaskStatus(manifest, "task-1", "in-progress");

    const task = getTask(updated, "task-1");
    expect(task?.started_at).toBeDefined();
  });

  it("should set completed_at when moving to completed", () => {
    const manifest = createSampleManifest();

    const updated = updateTaskStatus(manifest, "task-1", "completed");

    const task = getTask(updated, "task-1");
    expect(task?.completed_at).toBeDefined();
  });

  it("should increment attempt_count when moving to in-progress", () => {
    const manifest = createSampleManifest();

    const updated1 = updateTaskStatus(manifest, "task-1", "in-progress");
    const updated2 = updateTaskStatus(updated1, "task-1", "failed");
    const updated3 = updateTaskStatus(updated2, "task-1", "in-progress");

    const task = getTask(updated3, "task-1");
    expect(task?.attempt_count).toBe(2);
  });

  it("should throw TaskError for non-existent task", () => {
    const manifest = createSampleManifest();

    expect(() =>
      updateTaskStatus(manifest, "non-existent", "completed")
    ).toThrow(TaskError);
  });

  it("should add notes if provided", () => {
    const manifest = createSampleManifest();

    const updated = updateTaskStatus(
      manifest,
      "task-1",
      "blocked",
      "Waiting for review"
    );

    const task = getTask(updated, "task-1");
    expect(task?.notes).toBe("Waiting for review");
  });

  it("should not mutate original manifest", () => {
    const manifest = createSampleManifest();
    const originalStatus = manifest.tasks[0]!.status;

    updateTaskStatus(manifest, "task-1", "completed");

    expect(manifest.tasks[0]!.status).toBe(originalStatus);
  });
});

describe("getTaskStats", () => {
  it("should count tasks by status", () => {
    const manifest = createSampleManifest();
    manifest.tasks[0]!.status = "completed";
    manifest.tasks[1]!.status = "in-progress";

    const stats = getTaskStats(manifest);

    expect(stats.total).toBe(3);
    expect(stats.completed).toBe(1);
    expect(stats.inProgress).toBe(1);
    expect(stats.notStarted).toBe(1);
    expect(stats.failed).toBe(0);
    expect(stats.blocked).toBe(0);
    expect(stats.skipped).toBe(0);
  });

  it("should handle empty manifest", () => {
    const manifest: Manifest = {
      version: "1.0.0",
      metadata: { feature_id: "TEST", title: "Test" },
      tasks: [{ id: "task-1", title: "Only Task", status: "not-started" }],
    };

    const stats = getTaskStats(manifest);

    expect(stats.total).toBe(1);
    expect(stats.notStarted).toBe(1);
  });

  it("should count all status types", () => {
    const manifest: Manifest = {
      version: "1.0.0",
      metadata: { feature_id: "TEST", title: "Test" },
      tasks: [
        { id: "t1", title: "Task 1", status: "completed" },
        { id: "t2", title: "Task 2", status: "in-progress" },
        { id: "t3", title: "Task 3", status: "not-started" },
        { id: "t4", title: "Task 4", status: "failed" },
        { id: "t5", title: "Task 5", status: "blocked" },
        { id: "t6", title: "Task 6", status: "skipped" },
      ],
    };

    const stats = getTaskStats(manifest);

    expect(stats.completed).toBe(1);
    expect(stats.inProgress).toBe(1);
    expect(stats.notStarted).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.blocked).toBe(1);
    expect(stats.skipped).toBe(1);
  });
});
