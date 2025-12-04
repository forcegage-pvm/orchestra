/**
 * Orchestra Prepare Service
 *
 * Aligned with Orchestra Bible v0.7.0
 * Handles preparing handover for next task (Process 1, Steps 1-12).
 * NO CLI DEPENDENCIES - pure logic only.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { runCloseoutChecks } from "./closeout.js";
import {
  getResolvedPaths,
  loadConfig,
  requireOrchestraRoot,
} from "./config.js";
import { ManifestError, TaskError } from "./errors.js";
import {
  getAllTasks,
  getNextPendingTask,
  getTask,
  getTaskId,
  loadManifest,
  saveManifest,
  updateTaskStatus,
} from "./manifest.js";
import { addProgressEntry, loadProgress, saveProgress } from "./progress.js";
import { generateYamlTemplate, parseTemplate } from "./template-converter.js";
import { renderTemplate } from "./templates.js";
import type { Manifest, Task, TemplateFormat } from "./types.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the prepare operation
 */
export interface PrepareOptions {
  /** Specific task ID to prepare (default: next pending) */
  task?: string;
  /** Prepare even if another task is in-progress */
  force?: boolean;
  /** Skip closeout check before preparing */
  skipCloseout?: boolean;
  /** Show what would be generated without executing */
  dryRun?: boolean;
  /** Output JSON format (for CLI) */
  json?: boolean;
  /** Template output format: yaml, markdown, or both */
  format?: TemplateFormat;
}

/**
 * Result of prepare operation
 */
export interface PrepareResult {
  /** Task that was prepared */
  task: Task;
  /** Files that were generated */
  filesGenerated: string[];
  /** Whether manifest status was updated */
  statusUpdated: boolean;
  /** Dependencies that were checked */
  dependencies?: Array<{ id: number; title: string; status: string }>;
  /** Whether this was a dry run */
  dryRun: boolean;
  /** Format used for output */
  format?: TemplateFormat;
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Prepare handover for a task
 * This is the main entry point for the prepare command.
 */
export async function runPrepare(
  options: PrepareOptions = {}
): Promise<PrepareResult> {
  const root = requireOrchestraRoot();

  // Load config to get default format
  const config = loadConfig(root);
  const format = options.format ?? config.template.default_format;

  // Load manifest
  const manifestResult = loadManifest();
  if (!manifestResult.success || !manifestResult.data) {
    throw new ManifestError(manifestResult.message);
  }
  const manifest = manifestResult.data;

  // Select task to prepare
  const task = selectTask(manifest, options.task);

  // Run closeout check if not skipped
  if (!options.skipCloseout) {
    const previousTaskId = determinePreviousTaskForPrepare(
      manifest,
      getTaskId(task)
    );
    if (previousTaskId !== null) {
      const closeoutResult = await runCloseoutChecks(root, previousTaskId);

      if (!closeoutResult.canProceed) {
        throw new TaskError(
          `Closeout check failed for task ${previousTaskId}. Fix issues or use --skip-closeout.`,
          { taskId: previousTaskId, closeoutResult }
        );
      }
    }
  }

  // Validate task can be prepared
  validatePrepare(manifest, task, options.force ?? false);

  // Get dependencies info
  const dependencies = getDependenciesInfo(manifest, task);

  // If dry run, return early
  if (options.dryRun) {
    const expectedFiles = [
      "handover/completion-signal.md",
      "handover/task-context.md",
    ];
    if (format === "yaml" || format === "both") {
      expectedFiles.push(`handover/task-${getTaskId(task)}.yaml`);
    }
    if (format === "markdown" || format === "both") {
      expectedFiles.push("handover/current-task.md");
    }
    return {
      task,
      filesGenerated: expectedFiles,
      statusUpdated: false,
      dependencies,
      dryRun: true,
      format,
    };
  }

  // Generate handover files with specified format
  const files = generateHandoverFiles(root, manifest, task, format);

  // Update manifest
  const updateResult = updateTaskStatus(manifest, getTaskId(task), "IMPLEMENT");
  if (!updateResult.success || !updateResult.data) {
    throw new ManifestError(updateResult.message);
  }

  // Save manifest
  const paths = getResolvedPaths(root, config);
  const saveResult = saveManifest(paths.manifest, updateResult.data);
  if (!saveResult.success) {
    throw new ManifestError(saveResult.message);
  }

  // Update progress.yaml with PREPARE entry
  const sprintId = manifest.sprint.id;
  let progress = loadProgress(sprintId, root);
  progress = addProgressEntry(progress, {
    task_id: getTaskId(task),
    status: "PREPARE",
    notes: `Task ${getTaskId(
      task
    )} prepared for implementation (format: ${format})`,
  });
  saveProgress(progress, root);

  return {
    task,
    filesGenerated: files,
    statusUpdated: true,
    dependencies,
    dryRun: false,
    format,
  };
}

// =============================================================================
// Task Selection
// =============================================================================

/**
 * Select which task to prepare
 */
export function selectTask(manifest: Manifest, taskId?: string): Task {
  if (taskId) {
    // Specific task requested
    const id = parseInt(taskId, 10);
    if (isNaN(id)) {
      throw new TaskError(`Invalid task ID: ${taskId}`);
    }

    const task = getTask(manifest, id);
    if (!task) {
      throw new TaskError(`Task not found: ${taskId}`);
    }

    return task;
  }

  // Find next pending task
  const task = getNextPendingTask(manifest);
  if (!task) {
    throw new TaskError("No pending tasks available");
  }

  return task;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate that a task can be prepared
 */
export function validatePrepare(
  manifest: Manifest,
  task: Task,
  force: boolean
): void {
  // Check task status
  if (task.status !== "PENDING") {
    throw new TaskError(
      `Task ${getTaskId(task)} cannot be prepared: status is ${task.status}`,
      { taskId: getTaskId(task), currentStatus: task.status }
    );
  }

  // Check for in-progress task (unless forced)
  if (!force) {
    const inProgress = getAllTasks(manifest).find(
      (t) => t.status === "IMPLEMENT"
    );
    if (inProgress) {
      throw new TaskError(
        `Task ${getTaskId(
          inProgress
        )} is already in progress. Complete it first or use --force.`,
        { blockingTaskId: getTaskId(inProgress) }
      );
    }
  }

  // Check dependencies
  validateDependencies(manifest, task);
}

/**
 * Validate all dependencies are satisfied
 */
export function validateDependencies(manifest: Manifest, task: Task): void {
  const deps = task.dependencies ?? [];

  for (const depId of deps) {
    const depTask = getTask(manifest, depId);

    if (!depTask) {
      throw new TaskError(`Dependency not found: ${depId}`, {
        taskId: getTaskId(task),
        dependencyId: depId,
      });
    }

    if (depTask.status !== "COMPLETE") {
      throw new TaskError(
        `Dependency ${depId} is not complete (status: ${depTask.status})`,
        {
          taskId: getTaskId(task),
          dependencyId: depId,
          dependencyStatus: depTask.status,
        }
      );
    }
  }
}

/**
 * Get information about task dependencies
 */
export function getDependenciesInfo(
  manifest: Manifest,
  task: Task
): Array<{ id: number; title: string; status: string }> {
  const deps = task.dependencies ?? [];
  return deps.map((depId) => {
    const depTask = getTask(manifest, depId);
    return {
      id: depId,
      title: depTask?.title ?? "Unknown",
      status: depTask?.status ?? "UNKNOWN",
    };
  });
}

// =============================================================================
// Closeout Integration
// =============================================================================

/**
 * Determine the previous task for closeout check
 * Returns null if this is the first task.
 */
export function determinePreviousTaskForPrepare(
  manifest: Manifest,
  currentTaskId: number
): number | null {
  // If this is task 1, no previous task
  if (currentTaskId === 1) {
    return null;
  }

  // Check if there's a current_task_id in manifest
  if (manifest.current_task_id && manifest.current_task_id !== currentTaskId) {
    return manifest.current_task_id;
  }

  // Otherwise, return the task just before this one (by ID)
  const previousId = currentTaskId - 1;
  const previousTask = getTask(manifest, previousId);

  if (previousTask && previousTask.status === "COMPLETE") {
    return previousId;
  }

  return null;
}

// =============================================================================
// File Generation
// =============================================================================

/**
 * Generate all handover files
 */
export function generateHandoverFiles(
  root: string,
  manifest: Manifest,
  task: Task,
  format: TemplateFormat = "markdown"
): string[] {
  const config = loadConfig(root);
  const paths = getResolvedPaths(root, config);
  const handoverPath = paths.handovers;

  // Ensure handover directory exists
  if (!fs.existsSync(handoverPath)) {
    fs.mkdirSync(handoverPath, { recursive: true });
  }

  // Clear verification folder
  const verificationPath = path.join(handoverPath, "verification");
  if (fs.existsSync(verificationPath)) {
    fs.rmSync(verificationPath, { recursive: true });
  }
  fs.mkdirSync(verificationPath, { recursive: true });

  const filesGenerated: string[] = [];

  // Build context for templates
  const context = buildHandoverContext(manifest, task, root);

  // Generate YAML template if requested
  if (format === "yaml" || format === "both") {
    const yamlPath = path.join(handoverPath, `task-${getTaskId(task)}.yaml`);
    const yamlContent = generateYamlHandover(task, context, root);
    fs.writeFileSync(yamlPath, yamlContent);
    filesGenerated.push(`handover/task-${getTaskId(task)}.yaml`);
  }

  // Generate markdown if requested
  if (format === "markdown" || format === "both") {
    const currentTaskPath = path.join(handoverPath, "current-task.md");
    const currentTaskContent = generateCurrentTask(manifest, task, root);
    fs.writeFileSync(currentTaskPath, currentTaskContent);
    filesGenerated.push("handover/current-task.md");
  }

  // Generate completion-signal.md template for implementor
  const signalPath = path.join(handoverPath, "completion-signal.md");
  const signalContent = generateCompletionSignal(task, root);
  fs.writeFileSync(signalPath, signalContent);
  filesGenerated.push("handover/completion-signal.md");

  // Always generate task-context.md
  const contextPath = path.join(handoverPath, "task-context.md");
  const contextContent = generateTaskContext(manifest, task, root);
  fs.writeFileSync(contextPath, contextContent);
  filesGenerated.push("handover/task-context.md");

  return filesGenerated;
}

/**
 * Build context object for handover templates
 */
function buildHandoverContext(
  manifest: Manifest,
  task: Task,
  _root: string
): Record<string, unknown> {
  return {
    task_id: getTaskId(task),
    task_title: task.title,
    task_description: task.description ?? "",
    objective: "", // TODO: To be filled by orchestrator
    spec_file: task.speckit_task_ref?.[0] ?? "",
    command_spec: "",
    acceptance_criteria: [],
    dependencies:
      task.dependencies?.map((id) => {
        const dep = getTask(manifest, id);
        return {
          id,
          title: dep?.title ?? "Unknown",
          status: dep?.status ?? "UNKNOWN",
        };
      }) ?? [],
    file_operations: [],
    test_file: "",
    min_test_count: 0,
    test_cases: [],
    sample_test_data: "",
    implementation_files: [],
    interfaces: "",
    verification_checks: [],
    format: "yaml",
  };
}

/**
 * Generate YAML handover template
 */
function generateYamlHandover(
  _task: Task,
  context: Record<string, unknown>,
  root: string
): string {
  // Try to parse handover.hbs and generate YAML
  const templatePath = path.join(
    root,
    ".orchestra",
    "common",
    "templates",
    "handover.hbs"
  );

  let fields;
  try {
    const parsed = parseTemplate(templatePath);
    fields = parsed.fields;
  } catch {
    // If template doesn't exist, use default fields
    fields = getDefaultHandoverFields();
  }

  return generateYamlTemplate(fields, {
    context,
    includeComments: true,
    markTodos: true,
  });
}

/**
 * Get default handover fields when template is not available
 */
function getDefaultHandoverFields() {
  return [
    {
      name: "task_id",
      type: "string" as const,
      path: ["task_id"],
      required: true,
    },
    {
      name: "task_title",
      type: "string" as const,
      path: ["task_title"],
      required: true,
    },
    {
      name: "task_description",
      type: "string" as const,
      path: ["task_description"],
      required: true,
    },
    {
      name: "objective",
      type: "string" as const,
      path: ["objective"],
      required: true,
    },
    {
      name: "spec_file",
      type: "string" as const,
      path: ["spec_file"],
      required: true,
    },
    {
      name: "acceptance_criteria",
      type: "array" as const,
      path: ["acceptance_criteria"],
      required: true,
    },
    {
      name: "file_operations",
      type: "array" as const,
      path: ["file_operations"],
      required: true,
    },
    {
      name: "test_file",
      type: "string" as const,
      path: ["test_file"],
      required: true,
    },
    {
      name: "test_cases",
      type: "array" as const,
      path: ["test_cases"],
      required: true,
    },
    {
      name: "implementation_files",
      type: "array" as const,
      path: ["implementation_files"],
      required: true,
    },
    {
      name: "verification_checks",
      type: "array" as const,
      path: ["verification_checks"],
      required: true,
    },
  ];
}

/**
 * Generate current-task.md content
 */
export function generateCurrentTask(
  manifest: Manifest,
  task: Task,
  root: string
): string {
  // Build context for template
  const context = {
    task_id: getTaskId(task),
    task_title: task.title,
    task_description: task.description ?? "",
    spec_file:
      Array.isArray(task.speckit_task_ref) && task.speckit_task_ref.length > 0
        ? task.speckit_task_ref[0]
        : typeof task.speckit_task_ref === "string"
          ? task.speckit_task_ref
          : "",
    command_spec: "", // Optional, can be added if needed
    depends_on:
      task.dependencies?.map((id) => {
        const dep = getTask(manifest, id);
        return `Task ${id}: ${dep?.title ?? "Unknown"}`;
      }) ?? [],
  };

  // Template errors must fail the command - no silent fallback
  return renderTemplate("current-task.md", context, root);
}

/**
 * Generate completion-signal.md content
 */
export function generateCompletionSignal(task: Task, root: string): string {
  // Build context for template
  const context = {
    task_id: getTaskId(task),
    task_title: task.title,
  };

  // Template errors must fail the command - no silent fallback
  return renderTemplate("completion-signal.md", context, root);
}

/**
 * Generate task-context.md content
 */
export function generateTaskContext(
  manifest: Manifest,
  task: Task,
  _root: string
): string {
  const now = new Date().toISOString();

  let content = `# Task Context\n\n`;
  content += `## Sprint Information\n\n`;
  content += `- **Sprint**: ${manifest.sprint.id}\n`;
  content += `- **Current Task**: ${getTaskId(task)}\n`;
  content += `- **Phase**: ${task.category ?? "unknown"}\n\n`;
  content += `## Background\n\n`;
  content += `This is Task ${getTaskId(task)} of the ${
    manifest.sprint.name
  } sprint`;

  if (task.category) {
    content += `, part of the "${task.category}" phase`;
  }

  content += `.\n\n`;
  content += `See the handover document (current-task.md) for specific task details.\n\n`;
  content += `## Key Files\n\n`;
  content += `Refer to current-task.md for the files to CREATE and MODIFY.\n\n`;
  content += `---\n\n`;
  content += `*Generated by prepare-handover.ps1 at ${now}*\n`;

  return content;
}
