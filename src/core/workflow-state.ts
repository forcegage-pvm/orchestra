/**
 * Workflow State Detection
 *
 * Detects the current workflow step by analyzing artifacts.
 * Used by `orchestra next` to determine what action to take.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  findOrchestraRoot,
  getResolvedPaths,
  loadConfig,
} from "./config.js";
import { getTask, loadManifest } from "./manifest.js";
import type { Manifest, Task, TaskStatus, WorkflowStep } from "./types.js";
import { readYamlRaw, writeYaml, yamlExists } from "./yaml.js";

// =============================================================================
// Types
// =============================================================================

/**
 * Complete workflow state including both inference and explicit tracking
 */
export interface WorkflowState {
  // Sprint-level
  initialized: boolean;
  configured: boolean;
  sprintId: string | null;
  sprintStatus: string | null;
  sprintComplete: boolean;

  // Task-level
  currentTaskId: number | null;
  currentTask: Task | null;
  currentTaskStatus: TaskStatus | null;

  // Artifact indicators
  handoverExists: boolean;
  signalExists: boolean;
  verificationExists: boolean;
  verificationPassed: boolean | null;
  feedbackExists: boolean;

  // Retry tracking
  retryCount: number;
  maxRetries: number;

  // Inferred step
  inferredStep: WorkflowStep;

  // Explicit tracking (from progress.yaml if available)
  explicitStep: WorkflowStep | null;
  lastCommand: string | null;
  lastCommandAt: string | null;

  // Errors/blockers
  errors: WorkflowError[];
}

/**
 * Workflow error/blocker
 */
export interface WorkflowError {
  type: "VALIDATION" | "MISSING_FILE" | "VERIFICATION_FAILED" | "DEPENDENCY" | "CONFIG";
  message: string;
  location?: string;
  resolution?: string[];
}

/**
 * Verification report structure (partial - just what we need)
 */
interface VerificationReport {
  overall: "PASSED" | "FAILED";
  checks?: {
    passed: number;
    failed: number;
  };
}

// =============================================================================
// Main Detection Function
// =============================================================================

/**
 * Detect the current workflow state
 *
 * @param orchestraRoot - Optional root path (auto-detected if not provided)
 * @returns Complete workflow state
 */
export function detectWorkflowState(orchestraRoot?: string): WorkflowState {
  const errors: WorkflowError[] = [];

  // Check initialization
  const root = orchestraRoot ?? findOrchestraRoot();
  if (!root) {
    return createUninitializedState();
  }

  // Load config and paths
  let config;
  let paths;
  try {
    config = loadConfig(root);
    paths = getResolvedPaths(root, config);
  } catch (error) {
    return {
      ...createUninitializedState(),
      initialized: true,
      errors: [
        {
          type: "CONFIG",
          message: error instanceof Error ? error.message : "Config error",
          location: path.join(root, ".orchestra", "orchestra.yaml"),
          resolution: ["Check orchestra.yaml syntax", "Run orchestra init --force"],
        },
      ],
    };
  }

  // Load manifest
  const manifestResult = loadManifest(paths.manifest);
  if (!manifestResult.success || !manifestResult.data) {
    return {
      ...createUninitializedState(),
      initialized: true,
      errors: [
        {
          type: "CONFIG",
          message: manifestResult.errors?.join(", ") || "Cannot load manifest",
          location: paths.manifest,
          resolution: ["Check manifest.yaml syntax", "Ensure valid YAML format"],
        },
      ],
      inferredStep: "CONFIGURE",
    };
  }

  const manifest = manifestResult.data;

  // Check if configured (has tasks)
  const allTasks = getAllTasks(manifest);
  const configured = allTasks.length > 0;

  // Check sprint status
  const sprintComplete = allTasks.length > 0 && allTasks.every((t) => t.status === "COMPLETE");

  // Get current task
  const currentTaskId = manifest.current_task_id ?? null;
  const currentTask = currentTaskId ? getTask(manifest, currentTaskId) ?? null : null;
  const currentTaskStatus = currentTask?.status ?? null;

  // Check artifacts
  const handoverPath = path.join(paths.handovers, "current-task.md");
  const signalPath = path.join(paths.handovers, "completion-signal.md");
  const feedbackPath = path.join(paths.handovers, "feedback.md");

  const handoverExists = fs.existsSync(handoverPath);
  const signalExists = fs.existsSync(signalPath);
  const feedbackExists = fs.existsSync(feedbackPath);

  // Check verification report
  let verificationExists = false;
  let verificationPassed: boolean | null = null;

  if (currentTaskId) {
    const paddedId = String(currentTaskId).padStart(3, "0");
    const resultsDir = path.join(paths.orchestraDir, "orchestrator", "results");
    const verificationPath = path.join(
      resultsDir,
      `task-${paddedId}-verification.yaml`
    );

    if (yamlExists(verificationPath)) {
      verificationExists = true;
      try {
        const report = readYamlRaw(verificationPath) as VerificationReport;
        verificationPassed = report.overall === "PASSED";
      } catch {
        // Can't read verification, assume it doesn't exist properly
        verificationExists = false;
      }
    }
  }

  // Get retry info
  const retryCount = currentTask?.retry_count ?? 0;
  const maxRetries = currentTask?.max_retries ?? config.retry?.max_retries ?? 3;

  // Load explicit state from progress if available
  const { explicitStep, lastCommand, lastCommandAt } = loadExplicitState(paths.orchestraDir);

  // Infer workflow step
  const inferredStep = inferWorkflowStep({
    initialized: true,
    configured,
    sprintComplete,
    currentTaskId,
    currentTaskStatus,
    handoverExists,
    signalExists,
    verificationExists,
    verificationPassed,
    feedbackExists,
  });

  // Check for state conflicts
  if (explicitStep && explicitStep !== inferredStep) {
    errors.push({
      type: "VALIDATION",
      message: `State mismatch: explicit=${explicitStep}, inferred=${inferredStep}`,
      resolution: ["Trusting inferred state", "Explicit state may be stale"],
    });
  }

  return {
    initialized: true,
    configured,
    sprintId: manifest.sprint?.id ?? null,
    sprintStatus: manifest.sprint?.status ?? null,
    sprintComplete,
    currentTaskId,
    currentTask,
    currentTaskStatus,
    handoverExists,
    signalExists,
    verificationExists,
    verificationPassed,
    feedbackExists,
    retryCount,
    maxRetries,
    inferredStep,
    explicitStep,
    lastCommand,
    lastCommandAt,
    errors,
  };
}

// =============================================================================
// Step Inference Logic
// =============================================================================

interface InferenceInput {
  initialized: boolean;
  configured: boolean;
  sprintComplete: boolean;
  currentTaskId: number | null;
  currentTaskStatus: TaskStatus | null;
  handoverExists: boolean;
  signalExists: boolean;
  verificationExists: boolean;
  verificationPassed: boolean | null;
  feedbackExists: boolean;
}

/**
 * Infer the workflow step from artifact state
 */
export function inferWorkflowStep(state: InferenceInput): WorkflowStep {
  // Sprint-level checks first
  if (!state.initialized) return "INIT";
  if (!state.configured) return "CONFIGURE";
  if (state.sprintComplete) return "SPRINT_COMPLETE";
  if (!state.currentTaskId) return "SELECT_TASK";

  // Task-level inference
  const taskStatus = state.currentTaskStatus;

  // Check special statuses (ESCALATED means human intervention required)
  if (taskStatus === "ESCALATED") return "ESCALATED";

  // Check artifacts in reverse order (most recent action first)
  // This determines what the NEXT action should be

  // If verification exists, we know the result
  if (state.verificationExists) {
    if (state.verificationPassed === true) {
      return "COMPLETE"; // Next: run orchestra complete
    } else if (state.verificationPassed === false) {
      // Check if feedback was already given
      if (state.feedbackExists) {
        return "IMPLEMENT"; // Next: implementor should fix and re-signal
      }
      return "RETRY"; // Next: orchestrator should give feedback
    }
  }

  // If signal exists but no verification, next is verify
  if (state.signalExists) {
    return "VERIFY";
  }

  // If handover exists but no signal, implementor should work/signal
  if (state.handoverExists) {
    return "IMPLEMENT";
  }

  // No handover yet, need to prepare
  return "PREPARE";
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get all tasks from manifest (handles both phase and legacy format)
 */
function getAllTasks(manifest: Manifest): Task[] {
  if (manifest.phases) {
    return manifest.phases.flatMap((p) => p.tasks);
  }
  return manifest.tasks ?? [];
}

/**
 * Create state for uninitialized project
 */
function createUninitializedState(): WorkflowState {
  return {
    initialized: false,
    configured: false,
    sprintId: null,
    sprintStatus: null,
    sprintComplete: false,
    currentTaskId: null,
    currentTask: null,
    currentTaskStatus: null,
    handoverExists: false,
    signalExists: false,
    verificationExists: false,
    verificationPassed: null,
    feedbackExists: false,
    retryCount: 0,
    maxRetries: 3,
    inferredStep: "INIT",
    explicitStep: null,
    lastCommand: null,
    lastCommandAt: null,
    errors: [],
  };
}

/**
 * Load explicit workflow state from progress.yaml if available
 */
function loadExplicitState(orchestraDir: string): {
  explicitStep: WorkflowStep | null;
  lastCommand: string | null;
  lastCommandAt: string | null;
} {
  const progressPath = path.join(orchestraDir, "progress.yaml");

  if (!yamlExists(progressPath)) {
    return { explicitStep: null, lastCommand: null, lastCommandAt: null };
  }

  try {
    const progress = readYamlRaw(progressPath) as {
      workflow_state?: {
        current_step?: string;
        last_command?: string;
        last_command_at?: string;
      };
    };

    const ws = progress.workflow_state;
    if (!ws) {
      return { explicitStep: null, lastCommand: null, lastCommandAt: null };
    }

    return {
      explicitStep: (ws.current_step as WorkflowStep) ?? null,
      lastCommand: ws.last_command ?? null,
      lastCommandAt: ws.last_command_at ?? null,
    };
  } catch {
    return { explicitStep: null, lastCommand: null, lastCommandAt: null };
  }
}

/**
 * Update explicit workflow state in progress.yaml
 *
 * Note: This is called by commands to record their execution.
 * The `orchestra next` command does NOT call this (read-only).
 */
export function updateExplicitState(
  orchestraDir: string,
  step: WorkflowStep,
  command: string
): void {
  const progressPath = path.join(orchestraDir, "progress.yaml");

  let progress: Record<string, unknown> = {};
  if (yamlExists(progressPath)) {
    try {
      progress = readYamlRaw(progressPath) as Record<string, unknown>;
    } catch {
      // Start fresh if can't read
    }
  }

  progress.workflow_state = {
    current_step: step,
    last_command: command,
    last_command_at: new Date().toISOString(),
  };

  // Write back
  writeYaml(progressPath, progress);
}
