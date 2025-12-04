/**
 * Signal Core Logic
 *
 * Two main functions:
 * 1. runSignal() - Implementor creates signal file (Bible 8.3)
 * 2. runAcceptSignal() - Orchestrator validates signal (Bible 8.4)
 *
 * ZERO CLI dependencies - pure logic functions.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "yaml";
import { z } from "zod";
import {
  getResolvedPaths,
  loadConfig,
  requireOrchestraRoot,
} from "./config.js";
import { OrchestraError } from "./errors.js";
import { getGitStatus } from "./git.js";
import { getTask, loadManifest } from "./manifest.js";
import { loadProgress } from "./progress.js";
import { readYaml } from "./yaml.js";

// =============================================================================
// Signal Creation Types (Implementor - Bible 8.3)
// =============================================================================

export interface SignalOptions {
  task?: string;
  summary: string;
  files?: string[];
  tests?: string[];
  notes?: string;
  orchestraRoot?: string;
}

export interface SignalResult {
  success: boolean;
  taskId: number;
  summary: string;
  signalPath: string;
  artifacts: {
    created: string[];
    modified: string[];
  };
  signaledAt: string;
  nextStep: string;
}

// =============================================================================
// Accept-Signal Types (Orchestrator - Bible 8.4)
// =============================================================================

export interface AcceptSignalOptions {
  task?: string;
  maxAge?: string;
  force?: boolean;
  json?: boolean;
  verbose?: boolean;
}

export interface CheckResult {
  id: string;
  check: string;
  passed: boolean;
  expected: string | number;
  actual: string | number;
  message?: string;
  details?: unknown;
  fix?: string;
}

export interface SignalReport {
  taskId: number;
  timestamp: string;
  overall: "ACCEPTED" | "REJECTED";
  checks: CheckResult[];
  canVerify: boolean;
  preSignalDetails?: PreSignalArtifact;
}

// Pre-signal artifact schema
const PreSignalCheckSchema = z
  .object({
    status: z.enum(["PASSED", "FAILED"]),
  })
  .passthrough(); // Allow additional fields

const PreSignalSchema = z.object({
  task_id: z.number(),
  timestamp: z.string(),
  status: z.enum(["PASSED", "FAILED"]),
  checks: z.record(PreSignalCheckSchema),
});

type PreSignalArtifact = z.infer<typeof PreSignalSchema>;

// =============================================================================
// Signal Creation (Implementor - Bible 8.3)
// =============================================================================

/**
 * Create a signal file indicating task completion.
 * This is an IMPLEMENTOR action - creates signal for orchestrator to validate.
 */
export async function runSignal(options: SignalOptions): Promise<SignalResult> {
  // Validate required summary
  if (!options.summary || options.summary.trim() === "") {
    throw new OrchestraError("--summary is required", "VALIDATION_ERROR");
  }

  // Determine orchestra root
  const orchestraRoot = options.orchestraRoot || requireOrchestraRoot();
  const config = loadConfig(orchestraRoot);
  const paths = getResolvedPaths(orchestraRoot, config);

  // Load manifest
  const manifestResult = loadManifest(paths.manifest);
  if (!manifestResult.success || !manifestResult.data) {
    throw new OrchestraError("Cannot load manifest", "CONFIG_ERROR");
  }

  const manifest = manifestResult.data;
  const sprintId = manifest.sprint.id;

  // Load progress
  const progress = loadProgress(sprintId, orchestraRoot);

  // Determine task ID from options, manifest, or progress
  let taskId: number | undefined;
  if (options.task) {
    taskId = parseInt(options.task, 10);
  } else if (manifest.current_task_id) {
    taskId = manifest.current_task_id;
  } else if (progress.entries.length > 0) {
    // Get latest entry's task ID
    const lastEntry = progress.entries[progress.entries.length - 1];
    if (lastEntry) {
      taskId = lastEntry.task_id;
    }
  }

  if (!taskId) {
    throw new OrchestraError(
      "No task specified and no current task found",
      "VALIDATION_ERROR"
    );
  }

  // Get task from manifest
  const task = getTask(manifest, taskId);
  if (!task) {
    throw new OrchestraError(
      `Task ${taskId} not found in manifest`,
      "VALIDATION_ERROR"
    );
  }

  // Verify task is in progress - check progress log or task status
  const taskEntry = progress.entries
    .filter((e) => e.task_id === taskId)
    .pop();
  const status = taskEntry?.status || task.status;

  // Accept IMPLEMENT status (from progress) - task must be in implementation phase
  if (status !== "IMPLEMENT") {
    throw new OrchestraError(
      `Task ${taskId} is not in progress. Current status: ${status}`,
      "VALIDATION_ERROR"
    );
  }

  // Verify handover exists
  const handoverPath = path.join(paths.handovers, "current-task.md");
  if (!fs.existsSync(handoverPath)) {
    throw new OrchestraError(
      `No handover found for task ${taskId}. The orchestrator must prepare the task first.`,
      "VALIDATION_ERROR"
    );
  }

  // Get or detect artifacts
  let created: string[] = [];
  let modified: string[] = [];

  if (options.files && options.files.length > 0) {
    // User specified - assume all are modified
    modified = options.files;
  } else {
    // Auto-detect from git
    try {
      const gitStatusResult = await getGitStatus(orchestraRoot);
      if (gitStatusResult.success && gitStatusResult.data) {
        // Untracked files are "created"
        created = gitStatusResult.data.untracked || [];
        // Modified files are either staged or unstaged
        modified = [
          ...(gitStatusResult.data.staged || []),
          ...(gitStatusResult.data.unstaged || []),
        ];
      }
    } catch {
      // Git not available or not a repo - continue without auto-detect
    }
  }

  const tests = options.tests || [];

  // Create signal file
  const signaledAt = new Date().toISOString();
  const signalData = {
    version: "1.0",
    task_id: taskId,
    signaled_at: signaledAt,
    summary: options.summary,
    artifacts: {
      created,
      modified,
    },
    tests,
    notes: options.notes || null,
  };

  // Ensure signals directory exists
  const signalsDir =
    paths.signals ||
    path.join(orchestraRoot, ".orchestra", "implementor", "signals");
  fs.mkdirSync(signalsDir, { recursive: true });

  const signalPath = path.join(signalsDir, `task-${taskId}-signal.yaml`);
  fs.writeFileSync(signalPath, yaml.stringify(signalData));

  return {
    success: true,
    taskId,
    summary: options.summary,
    signalPath,
    artifacts: { created, modified },
    signaledAt,
    nextStep: "Orchestrator runs accept-signal",
  };
}

// =============================================================================
// Accept-Signal (Orchestrator - Bible 8.4)
// =============================================================================

/**
 * Main orchestration function
 */
export async function runAcceptSignal(
  options: AcceptSignalOptions
): Promise<SignalReport> {
  // If force mode, bypass checks
  if (options.force) {
    console.warn("⚠ Force mode: Skipping all checks");
    const taskId = await determineCurrentTask(options.task);
    return {
      taskId,
      timestamp: new Date().toISOString(),
      overall: "ACCEPTED",
      checks: [],
      canVerify: true,
    };
  }

  // Determine task ID
  const taskId = await determineCurrentTask(options.task);

  // Run all checks
  const maxAge = parseInt(options.maxAge || "60", 10);
  const checks: CheckResult[] = [];

  const artifactCheck = await checkPreSignalExists();
  checks.push(artifactCheck);

  if (artifactCheck.passed) {
    const artifact = await loadPreSignalArtifact();
    checks.push(await checkPreSignalPassed(artifact));
    checks.push(await checkCorrectTaskId(taskId, artifact));
    checks.push(await checkNotStale(maxAge, artifact));
    checks.push(await checkCompletionSignalFilled());
    checks.push(await checkDeliverablesInPreSignal(artifact));

    const allPassed = checks.every((c) => c.passed);

    return {
      taskId,
      timestamp: new Date().toISOString(),
      overall: allPassed ? "ACCEPTED" : "REJECTED",
      checks,
      canVerify: allPassed,
      preSignalDetails: artifact,
    };
  }

  const allPassed = checks.every((c) => c.passed);

  return {
    taskId,
    timestamp: new Date().toISOString(),
    overall: allPassed ? "ACCEPTED" : "REJECTED",
    checks,
    canVerify: allPassed,
  };
}

// =============================================================================
// Task Determination
// =============================================================================

async function determineCurrentTask(explicitTaskId?: string): Promise<number> {
  if (explicitTaskId) {
    return parseInt(explicitTaskId, 10);
  }

  const orchestraRoot = requireOrchestraRoot();

  // Load manifest to get sprint ID
  const manifestResult = loadManifest();
  if (!manifestResult.success || !manifestResult.data) {
    throw new Error("Failed to load manifest");
  }

  const sprintId = manifestResult.data.sprint.id;
  const progress = loadProgress(sprintId, orchestraRoot);

  // Get the last entry to find current task
  const summary = getProgressSummary(progress);
  if (!summary.latestEntry) {
    throw new Error("No tasks in progress - progress log is empty");
  }

  return summary.latestEntry.task_id;
}

function getProgressSummary(progress: any): { latestEntry?: any } {
  return {
    latestEntry:
      progress.entries.length > 0
        ? progress.entries[progress.entries.length - 1]
        : undefined,
  };
}

// =============================================================================
// Pre-Signal Artifact Loader
// =============================================================================

function getPreSignalPath(): string {
  const orchestraRoot = requireOrchestraRoot();
  return path.join(
    orchestraRoot,
    ".orchestra",
    "handover",
    "verification",
    "pre-signal.yaml"
  );
}

async function loadPreSignalArtifact(): Promise<PreSignalArtifact> {
  const artifactPath = getPreSignalPath();
  return readYaml(artifactPath, PreSignalSchema);
}

// =============================================================================
// Check Functions
// =============================================================================

/**
 * Check 1: Pre-signal artifact exists
 */
async function checkPreSignalExists(): Promise<CheckResult> {
  const artifactPath = getPreSignalPath();

  if (!fs.existsSync(artifactPath)) {
    return {
      passed: false,
      id: "S1",
      check: "Pre-signal artifact exists",
      expected: artifactPath,
      actual: "Not found",
      message:
        "Implementor must run pre-signal check before signaling completion",
      fix: "Implementor: Run .orchestra/implementor/scripts/pre-signal-check.ps1",
    };
  }
  return {
    passed: true,
    id: "S1",
    check: "Pre-signal artifact",
    expected: "Present",
    actual: "Found",
  };
}

/**
 * Check 2: Pre-signal status is PASSED
 */
async function checkPreSignalPassed(
  artifact: PreSignalArtifact
): Promise<CheckResult> {
  if (artifact.status !== "PASSED") {
    return {
      passed: false,
      id: "S2",
      check: "Pre-signal status",
      expected: "PASSED",
      actual: artifact.status,
      message: "Implementor's pre-signal check did not pass",
      details: artifact.checks,
      fix: "Implementor: Fix failing checks and re-run pre-signal script",
    };
  }
  return {
    passed: true,
    id: "S2",
    check: "Pre-signal status",
    expected: "PASSED",
    actual: "PASSED",
  };
}

/**
 * Check 3: Task ID matches expected
 */
async function checkCorrectTaskId(
  expectedTaskId: number,
  artifact: PreSignalArtifact
): Promise<CheckResult> {
  if (artifact.task_id !== expectedTaskId) {
    return {
      passed: false,
      id: "S3",
      check: "Task ID matches",
      expected: expectedTaskId,
      actual: artifact.task_id,
      message: "Pre-signal artifact is for a different task (possibly stale)",
      fix: "Implementor: Run pre-signal check for correct task",
    };
  }
  return {
    passed: true,
    id: "S3",
    check: "Task ID",
    expected: expectedTaskId,
    actual: artifact.task_id,
  };
}

/**
 * Check 4: Artifact is not stale
 */
async function checkNotStale(
  maxAgeMinutes: number,
  artifact: PreSignalArtifact
): Promise<CheckResult> {
  const timestamp = new Date(artifact.timestamp);
  const now = new Date();
  const ageMinutes = (now.getTime() - timestamp.getTime()) / (1000 * 60);

  if (ageMinutes > maxAgeMinutes) {
    return {
      passed: false,
      id: "S4",
      check: "Artifact freshness",
      expected: `< ${maxAgeMinutes} minutes old`,
      actual: `${Math.round(ageMinutes)} minutes old`,
      message:
        "Pre-signal artifact is stale - implementor may have made changes since",
      fix: "Implementor: Re-run pre-signal check to get fresh results",
    };
  }
  return {
    passed: true,
    id: "S4",
    check: "Artifact freshness",
    expected: `< ${maxAgeMinutes}m`,
    actual: `${Math.round(ageMinutes)}m`,
  };
}

/**
 * Check 5: Completion signal is filled out
 */
async function checkCompletionSignalFilled(): Promise<CheckResult> {
  const orchestraRoot = requireOrchestraRoot();
  const signalPath = path.join(
    orchestraRoot,
    ".orchestra",
    "handover",
    "completion-signal.md"
  );

  if (!fs.existsSync(signalPath)) {
    return {
      passed: false,
      id: "S5",
      check: "Completion signal exists",
      expected: signalPath,
      actual: "Not found",
      fix: "Implementor: Fill out completion-signal.md",
    };
  }

  const content = fs.readFileSync(signalPath, "utf-8");

  // Check for unfilled template markers
  if (
    content.includes("<!-- Implementor:") &&
    content.match(/## Summary\s*\n\s*\n/)
  ) {
    return {
      passed: false,
      id: "S5",
      check: "Completion signal filled",
      expected: "Summary section completed",
      actual: "Template not filled out",
      fix: "Implementor: Fill out all sections in completion-signal.md",
    };
  }

  // Check for required sections
  const requiredSections = ["## Summary", "## Artifacts Created", "## Tests"];
  for (const section of requiredSections) {
    if (!content.includes(section)) {
      return {
        passed: false,
        id: "S5",
        check: "Completion signal complete",
        expected: `Section "${section}" present`,
        actual: "Section missing",
        fix: `Implementor: Add ${section} section to completion-signal.md`,
      };
    }
  }

  return {
    passed: true,
    id: "S5",
    check: "Completion signal",
    expected: "Filled",
    actual: "Complete",
  };
}

/**
 * Check 6: Deliverables check passed in pre-signal
 */
async function checkDeliverablesInPreSignal(
  artifact: PreSignalArtifact
): Promise<CheckResult> {
  if (!artifact.checks?.deliverables) {
    return {
      passed: false,
      id: "S6",
      check: "Deliverables check",
      expected: "Deliverables section in pre-signal",
      actual: "Not found",
      fix: "Implementor: Pre-signal script should check deliverables",
    };
  }

  if (artifact.checks.deliverables.status !== "PASSED") {
    return {
      passed: false,
      id: "S6",
      check: "Deliverables check",
      expected: "All deliverables exist",
      actual: `Status: ${artifact.checks.deliverables.status}`,
      details: artifact.checks.deliverables,
      fix: "Implementor: Create all required deliverable files",
    };
  }

  return {
    passed: true,
    id: "S6",
    check: "Deliverables",
    expected: "All exist",
    actual: "PASSED",
  };
}
