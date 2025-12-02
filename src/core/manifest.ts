/**
 * Orchestra Manifest Service
 *
 * Aligned with Orchestra Bible v0.7.0 Section 6.1
 * Handles reading and writing the manifest.yaml file.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { Manifest, ScriptResult, Task, TaskStatus } from "./types.js";

/**
 * Load manifest from file
 */
export function loadManifest(manifestPath: string): ScriptResult<Manifest> {
  if (!existsSync(manifestPath)) {
    return {
      success: false,
      message: `Manifest not found at: ${manifestPath}`,
      errors: ["MANIFEST_NOT_FOUND"],
    };
  }

  try {
    const content = readFileSync(manifestPath, "utf-8");
    const manifest = parseYaml(content) as Manifest;

    // Validate required fields
    if (!manifest.version || !manifest.sprint || !manifest.tasks) {
      return {
        success: false,
        message: "Invalid manifest: missing required fields",
        errors: ["INVALID_MANIFEST_STRUCTURE"],
      };
    }

    return {
      success: true,
      message: "Manifest loaded successfully",
      data: manifest,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to parse manifest: ${error}`,
      errors: ["MANIFEST_PARSE_ERROR"],
    };
  }
}

/**
 * Save manifest to file
 */
export function saveManifest(
  manifestPath: string,
  manifest: Manifest
): ScriptResult {
  try {
    const content = stringifyYaml(manifest, {
      indent: 2,
      lineWidth: 0, // Don't wrap lines
    });
    writeFileSync(manifestPath, content, "utf-8");

    return {
      success: true,
      message: "Manifest saved successfully",
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to save manifest: ${error}`,
      errors: ["MANIFEST_SAVE_ERROR"],
    };
  }
}

/**
 * Get a task by ID
 */
export function getTask(manifest: Manifest, taskId: number): Task | undefined {
  return manifest.tasks.find((t) => t.id === taskId);
}

/**
 * Get the current active task
 */
export function getCurrentTask(manifest: Manifest): Task | undefined {
  if (manifest.current_task_id) {
    return getTask(manifest, manifest.current_task_id);
  }
  return undefined;
}

/**
 * Get the next pending task
 */
export function getNextPendingTask(manifest: Manifest): Task | undefined {
  return manifest.tasks.find((t) => t.status === "PENDING");
}

/**
 * Update a task's status
 */
export function updateTaskStatus(
  manifest: Manifest,
  taskId: number,
  status: TaskStatus,
  additionalUpdates?: Partial<Task>
): ScriptResult<Manifest> {
  const taskIndex = manifest.tasks.findIndex((t) => t.id === taskId);

  if (taskIndex === -1) {
    return {
      success: false,
      message: `Task ${taskId} not found`,
      errors: ["TASK_NOT_FOUND"],
    };
  }

  const updatedTasks = [...manifest.tasks];
  const existingTask = updatedTasks[taskIndex]!;
  updatedTasks[taskIndex] = {
    ...existingTask,
    status,
    ...additionalUpdates,
  };

  const updatedManifest: Manifest = {
    ...manifest,
    tasks: updatedTasks,
  };

  if (status === "COMPLETE") {
    delete updatedManifest.current_task_id;
  } else {
    updatedManifest.current_task_id = taskId;
  }

  return {
    success: true,
    message: `Task ${taskId} status updated to ${status}`,
    data: updatedManifest,
  };
}

/**
 * Increment retry count for a task
 */
export function incrementRetryCount(
  manifest: Manifest,
  taskId: number
): ScriptResult<Manifest> {
  const task = getTask(manifest, taskId);

  if (!task) {
    return {
      success: false,
      message: `Task ${taskId} not found`,
      errors: ["TASK_NOT_FOUND"],
    };
  }

  const newRetryCount = task.retry_count + 1;

  if (newRetryCount > task.max_retries) {
    return updateTaskStatus(manifest, taskId, "ESCALATED", {
      retry_count: newRetryCount,
    });
  }

  return updateTaskStatus(manifest, taskId, "RETRY", {
    retry_count: newRetryCount,
  });
}

/**
 * Create a new manifest for a sprint
 */
export function createManifest(
  sprintId: string,
  sprintName: string,
  tasks: Omit<Task, "status" | "retry_count" | "max_retries">[]
): Manifest {
  const now = new Date().toISOString();

  return {
    version: "1.0",
    sprint: {
      id: sprintId,
      name: sprintName,
      status: "ACTIVE",
      created_at: now,
    },
    tasks: tasks.map((t) => ({
      ...t,
      status: "PENDING" as TaskStatus,
      retry_count: 0,
      max_retries: 3,
      created_at: now,
    })),
  };
}

/**
 * Get sprint progress statistics
 */
export function getSprintProgress(manifest: Manifest) {
  const total = manifest.tasks.length;
  const completed = manifest.tasks.filter(
    (t) => t.status === "COMPLETE"
  ).length;
  const inProgress = manifest.tasks.filter((t) =>
    ["PREPARE", "IMPLEMENT", "GATE_CHECK", "VERIFY", "RETRY"].includes(t.status)
  ).length;
  const pending = manifest.tasks.filter((t) => t.status === "PENDING").length;
  const escalated = manifest.tasks.filter(
    (t) => t.status === "ESCALATED"
  ).length;

  return {
    total,
    completed,
    inProgress,
    pending,
    escalated,
    percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}
