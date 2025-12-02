/**
 * Orchestra Closeout Service
 *
 * Aligned with Orchestra Bible v0.7.0
 * Handles closeout verification checks before preparing a new task.
 * This is Step 0 of Process 1 (Handover Creation).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { simpleGit } from "simple-git";
import { getResolvedPaths, loadConfig } from "./config.js";
import { getTask, loadManifest } from "./manifest.js";
import { readYamlRaw, yamlExists } from "./yaml.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Result of a single closeout check
 */
export interface CheckResult {
  /** Check ID (C1-C6) */
  id: string;
  /** Human-readable check name */
  check: string;
  /** Whether the check passed */
  passed: boolean;
  /** What was expected */
  expected: string;
  /** What was actually found */
  actual: string;
  /** Suggested fix command/action */
  fix?: string;
  /** Error message if fix was attempted and failed */
  fixError?: string;
}

/**
 * Complete closeout verification report
 */
export interface CloseoutReport {
  /** Task ID being checked (null for first task) */
  taskId: number | null;
  /** When the check was run */
  timestamp: string;
  /** Overall result */
  overall: "PASSED" | "FAILED";
  /** Individual check results */
  checks: CheckResult[];
  /** Whether the caller can proceed to prepare */
  canProceed: boolean;
}

/**
 * Progress task entry from progress.yaml
 */
interface ProgressTask {
  id: number;
  status: string;
  started_at?: string;
  completed_at?: string;
  completed_commit?: string;
}

/**
 * Progress file structure
 */
interface ProgressFile {
  sprint_id: string;
  current_task: number;
  tasks: Record<string, ProgressTask>;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// Check Functions
// =============================================================================

/**
 * Check C1: No uncommitted changes
 */
export async function checkUncommittedChanges(
  cwd: string
): Promise<CheckResult> {
  try {
    const git = simpleGit(cwd);
    const status = await git.status();

    if (status.files.length > 0) {
      const fileList = status.files.map((f) => f.path).join(", ");
      return {
        id: "C1",
        check: "No uncommitted changes",
        passed: false,
        expected: "No uncommitted changes",
        actual: `${status.files.length} uncommitted file(s): ${fileList}`,
        fix: 'git add -A && git commit -m "chore: closeout previous task"',
      };
    }

    return {
      id: "C1",
      check: "No uncommitted changes",
      passed: true,
      expected: "None",
      actual: "Clean",
    };
  } catch (error) {
    return {
      id: "C1",
      check: "No uncommitted changes",
      passed: false,
      expected: "No uncommitted changes",
      actual: `Git error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Check C2: Previous task status is completed
 */
export async function checkPreviousTaskStatus(
  orchestraRoot: string,
  taskId: number
): Promise<CheckResult> {
  try {
    const progressPath = path.join(
      orchestraRoot,
      ".orchestra",
      "progress.yaml"
    );

    if (!yamlExists(progressPath)) {
      return {
        id: "C2",
        check: "Previous task status",
        passed: true,
        expected: "N/A",
        actual: "First task (no progress file)",
      };
    }

    const progress = readYamlRaw(progressPath) as ProgressFile;
    const task = progress.tasks?.[String(taskId)];

    if (!task) {
      return {
        id: "C2",
        check: "Previous task status",
        passed: true,
        expected: "N/A",
        actual: "First task",
      };
    }

    if (task.status !== "completed") {
      return {
        id: "C2",
        check: "Previous task status",
        passed: false,
        expected: "completed",
        actual: task.status,
        fix: `Update progress.yaml: tasks.${taskId}.status = "completed"`,
      };
    }

    return {
      id: "C2",
      check: "Previous task status",
      passed: true,
      expected: "completed",
      actual: "completed",
    };
  } catch (error) {
    return {
      id: "C2",
      check: "Previous task status",
      passed: false,
      expected: "completed",
      actual: `Error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Check C3: Commit hash recorded in progress.yaml
 */
export async function checkCommitHashRecorded(
  orchestraRoot: string,
  taskId: number
): Promise<CheckResult> {
  try {
    const progressPath = path.join(
      orchestraRoot,
      ".orchestra",
      "progress.yaml"
    );

    if (!yamlExists(progressPath)) {
      return {
        id: "C3",
        check: "Commit hash recorded",
        passed: true,
        expected: "N/A",
        actual: "First task",
      };
    }

    const progress = readYamlRaw(progressPath) as ProgressFile;
    const task = progress.tasks?.[String(taskId)];

    if (!task || task.status === "pending") {
      return {
        id: "C3",
        check: "Commit hash recorded",
        passed: true,
        expected: "N/A",
        actual: "First task",
      };
    }

    if (!task.completed_commit) {
      // Get current commit to suggest fix
      let latestHash = "HASH";
      try {
        const git = simpleGit(orchestraRoot);
        const log = await git.log({ maxCount: 1 });
        latestHash = log.latest?.hash ?? "HASH";
      } catch {
        // Ignore git errors for fix suggestion
      }

      return {
        id: "C3",
        check: "Commit hash recorded",
        passed: false,
        expected: "Commit hash in progress.yaml",
        actual: "No commit hash recorded",
        fix: `Add to progress.yaml: tasks.${taskId}.completed_commit = "${latestHash}"`,
      };
    }

    return {
      id: "C3",
      check: "Commit hash recorded",
      passed: true,
      expected: "Present",
      actual: task.completed_commit,
    };
  } catch (error) {
    return {
      id: "C3",
      check: "Commit hash recorded",
      passed: false,
      expected: "Commit hash in progress.yaml",
      actual: `Error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Check C4: SpecKit tasks.md checkboxes are checked
 */
export async function checkSpecKitTasks(
  orchestraRoot: string,
  taskId: number
): Promise<CheckResult> {
  try {
    const config = loadConfig(orchestraRoot);
    const paths = getResolvedPaths(orchestraRoot, config);
    const manifestResult = loadManifest(paths.manifest);

    if (!manifestResult.success || !manifestResult.data) {
      return {
        id: "C4",
        check: "SpecKit tasks",
        passed: true,
        expected: "N/A",
        actual: "No manifest",
      };
    }

    const task = getTask(manifestResult.data, taskId);

    if (!task) {
      return {
        id: "C4",
        check: "SpecKit tasks",
        passed: true,
        expected: "N/A",
        actual: "Task not found in manifest",
      };
    }

    // Check for speckit_task_ref property
    const taskWithRef = task as typeof task & {
      speckit_task_ref?: string[];
    };

    if (
      !taskWithRef.speckit_task_ref ||
      taskWithRef.speckit_task_ref.length === 0
    ) {
      return {
        id: "C4",
        check: "SpecKit tasks",
        passed: true,
        expected: "N/A",
        actual: "No SpecKit refs",
      };
    }

    // Read tasks.md
    const tasksPath = path.join(
      orchestraRoot,
      ".orchestra",
      "orchestrator",
      ".orchestrator-only",
      "tasks.md"
    );

    if (!fs.existsSync(tasksPath)) {
      return {
        id: "C4",
        check: "SpecKit tasks",
        passed: true,
        expected: "N/A",
        actual: "No tasks.md file",
      };
    }

    const content = fs.readFileSync(tasksPath, "utf-8");

    // Check each referenced task
    for (const ref of taskWithRef.speckit_task_ref) {
      // Match [x] followed by task reference
      const pattern = new RegExp(
        `\\[x\\].*${ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        "i"
      );
      if (!pattern.test(content)) {
        return {
          id: "C4",
          check: "SpecKit tasks complete",
          passed: false,
          expected: `Task ${ref} checked in tasks.md`,
          actual: `Task ${ref} not checked`,
          fix: `Edit tasks.md: Change "[ ]" to "[x]" for task ${ref}`,
        };
      }
    }

    return {
      id: "C4",
      check: "SpecKit tasks",
      passed: true,
      expected: "All checked",
      actual: "All checked",
    };
  } catch (error) {
    return {
      id: "C4",
      check: "SpecKit tasks",
      passed: false,
      expected: "All SpecKit tasks checked",
      actual: `Error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/**
 * Check C5: Completion signal cleared
 */
export async function checkCompletionSignalCleared(
  orchestraRoot: string
): Promise<CheckResult> {
  const signalPath = path.join(
    orchestraRoot,
    ".orchestra",
    "handover",
    "completion-signal.md"
  );

  if (!fs.existsSync(signalPath)) {
    return {
      id: "C5",
      check: "Completion signal",
      passed: true,
      expected: "Cleared",
      actual: "Not present",
    };
  }

  const content = fs.readFileSync(signalPath, "utf-8");

  // Check if it's a template (empty) - has comment but no actual summary content
  const isTemplate =
    content.includes("<!-- Implementor:") &&
    !content.match(/## Summary\s*\n\s*\S/);

  // Also check for filled-in task ID as indicator of content
  const hasTaskId = content.match(/## Task ID\s*\n\s*\d+/);

  if (isTemplate && !hasTaskId) {
    return {
      id: "C5",
      check: "Completion signal",
      passed: true,
      expected: "Template",
      actual: "Empty template",
    };
  }

  // Signal has content - should be cleared
  return {
    id: "C5",
    check: "Completion signal cleared",
    passed: false,
    expected: "Signal cleared or reset to template",
    actual: "Signal contains previous task content",
    fix: "rm .orchestra/handover/completion-signal.md",
  };
}

/**
 * Check C6: Results file exists for previous task
 */
export async function checkResultsFileExists(
  orchestraRoot: string,
  taskId: number
): Promise<CheckResult> {
  const paddedId = String(taskId).padStart(3, "0");
  const resultsPath = path.join(
    orchestraRoot,
    ".orchestra",
    "orchestrator",
    "results",
    `task-${paddedId}-result.yaml`
  );

  if (!fs.existsSync(resultsPath)) {
    return {
      id: "C6",
      check: "Results file exists",
      passed: false,
      expected: resultsPath,
      actual: "Not found",
      fix: "Run orchestra verify && orchestra complete for previous task",
    };
  }

  return {
    id: "C6",
    check: "Results file",
    passed: true,
    expected: "Present",
    actual: resultsPath,
  };
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Run all closeout checks for a given task
 *
 * @param orchestraRoot - Path to the project root containing .orchestra
 * @param taskId - Task ID to check (null for first task)
 * @returns CloseoutReport with results of all checks
 */
export async function runCloseoutChecks(
  orchestraRoot: string,
  taskId: number | null
): Promise<CloseoutReport> {
  const checks: CheckResult[] = [];

  // C1: Always run uncommitted changes check
  checks.push(await checkUncommittedChanges(orchestraRoot));

  // C2-C4, C6: Only run if there's a previous task
  if (taskId !== null && taskId !== undefined) {
    checks.push(await checkPreviousTaskStatus(orchestraRoot, taskId));
    checks.push(await checkCommitHashRecorded(orchestraRoot, taskId));
    checks.push(await checkSpecKitTasks(orchestraRoot, taskId));
    checks.push(await checkResultsFileExists(orchestraRoot, taskId));
  }

  // C5: Always run completion signal check
  checks.push(await checkCompletionSignalCleared(orchestraRoot));

  const allPassed = checks.every((c) => c.passed);

  return {
    taskId,
    timestamp: new Date().toISOString(),
    overall: allPassed ? "PASSED" : "FAILED",
    checks,
    canProceed: allPassed,
  };
}

/**
 * Attempt to auto-fix failed checks
 * Only C1 (commit) and C5 (clear signal) are auto-fixable
 *
 * @param orchestraRoot - Path to the project root
 * @param report - The closeout report with failed checks
 * @returns Updated report with fix results
 */
export async function attemptAutoFix(
  orchestraRoot: string,
  report: CloseoutReport
): Promise<CloseoutReport> {
  const fixedChecks: CheckResult[] = [];

  for (const check of report.checks) {
    if (check.passed) {
      fixedChecks.push(check);
      continue;
    }

    if (!check.fix) {
      fixedChecks.push(check);
      continue;
    }

    // Attempt fix based on check ID
    try {
      if (check.id === "C1") {
        // Auto-commit
        const git = simpleGit(orchestraRoot);
        await git.add("-A");
        await git.commit("chore: closeout previous task");
        fixedChecks.push({
          ...check,
          passed: true,
          actual: "Auto-committed",
        });
      } else if (check.id === "C5") {
        // Clear completion signal
        const signalPath = path.join(
          orchestraRoot,
          ".orchestra",
          "handover",
          "completion-signal.md"
        );
        if (fs.existsSync(signalPath)) {
          fs.unlinkSync(signalPath);
        }
        fixedChecks.push({
          ...check,
          passed: true,
          actual: "Cleared",
        });
      } else {
        // Manual fix required
        fixedChecks.push(check);
      }
    } catch (error) {
      fixedChecks.push({
        ...check,
        fixError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const allPassed = fixedChecks.every((c) => c.passed);

  return {
    ...report,
    checks: fixedChecks,
    overall: allPassed ? "PASSED" : "FAILED",
    canProceed: allPassed,
  };
}

/**
 * Determine the previous task ID based on progress
 *
 * @param orchestraRoot - Path to the project root
 * @param explicitTaskId - Explicitly provided task ID (from --task option)
 * @returns Previous task ID or null if first task
 */
export async function determinePreviousTask(
  orchestraRoot: string,
  explicitTaskId?: number
): Promise<number | null> {
  if (explicitTaskId !== undefined) {
    return explicitTaskId;
  }

  const progressPath = path.join(orchestraRoot, ".orchestra", "progress.yaml");

  if (!yamlExists(progressPath)) {
    return null; // No progress = first task
  }

  try {
    const progress = readYamlRaw(progressPath) as ProgressFile;
    const currentTask = progress.current_task;

    if (!currentTask || currentTask <= 1) {
      return null; // No previous task
    }

    return currentTask - 1;
  } catch {
    return null;
  }
}
