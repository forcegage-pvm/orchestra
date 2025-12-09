/**
 * Accept-Signal Validator
 *
 * Validates that a signal is ready for verification checks.
 * This runs before run_verification_checks can proceed.
 *
 * Implements FR-ASV-001 from verification-rules-spec.md
 *
 * Part of VER-016: Implement accept-signal validation checks
 */

import { and, desc, eq } from "drizzle-orm";
import { getActiveSprint, getDb } from "../db/index.js";
import {
  signals,
  tasks,
  verificationChecks,
} from "../db/schema.js";

/**
 * Individual check result
 */
export interface AcceptSignalCheck {
  check_id: string;
  description: string;
  passed: boolean;
  message: string;
}

/**
 * Overall accept-signal validation result
 */
export interface AcceptSignalResult {
  status: "ACCEPTED" | "REJECTED";
  task_id: number;
  signal_id?: string;
  checks: AcceptSignalCheck[];
}

/**
 * Options for accept-signal validation
 */
export interface AcceptSignalValidatorOptions {
  maxAgeMinutes?: number; // Default: 60 minutes
}

/**
 * Validate a signal for a task before verification can proceed.
 *
 * Runs these checks (FR-ASV-001):
 * - ASV-1: Signal exists for task
 * - ASV-2: Pre-signal checks passed (build_status, test_status)
 * - ASV-3: Signal is not stale
 * - ASV-4: Task is in GATE_CHECK status
 * - ASV-5: Verification checks exist for task
 */
export async function validateAcceptSignal(
  taskId: number,
  options: AcceptSignalValidatorOptions = {}
): Promise<AcceptSignalResult> {
  const { maxAgeMinutes = 60 } = options;
  const db = getDb();
  const checks: AcceptSignalCheck[] = [];

  // Get active sprint
  const sprint = await getActiveSprint();
  if (!sprint) {
    return {
      status: "REJECTED",
      task_id: taskId,
      checks: [
        {
          check_id: "SPRINT",
          description: "Active sprint exists",
          passed: false,
          message: "No active sprint found",
        },
      ],
    };
  }

  // Find task
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, taskId)))
    .limit(1);

  if (!task) {
    return {
      status: "REJECTED",
      task_id: taskId,
      checks: [
        {
          check_id: "TASK",
          description: "Task exists",
          passed: false,
          message: `Task ${taskId} not found`,
        },
      ],
    };
  }

  // ASV-4: Task is in GATE_CHECK status
  const isGateCheck = task.status === "GATE_CHECK";
  checks.push({
    check_id: "ASV-4",
    description: "Task is in GATE_CHECK status",
    passed: isGateCheck,
    message: isGateCheck
      ? "Task is in GATE_CHECK status"
      : `Task is in ${task.status} status, expected GATE_CHECK`,
  });

  // Get latest signal for this task
  const [signal] = await db
    .select()
    .from(signals)
    .where(eq(signals.task_id, task.id))
    .orderBy(desc(signals.attempt))
    .limit(1);

  // ASV-1: Signal exists
  const signalExists = !!signal;
  checks.push({
    check_id: "ASV-1",
    description: "Signal exists for task",
    passed: signalExists,
    message: signalExists
      ? `Signal ${signal.signal_id} found`
      : "No signal found for task",
  });

  if (!signal) {
    // Can't check other signal-dependent items without a signal
    return {
      status: "REJECTED",
      task_id: taskId,
      checks,
    };
  }

  // ASV-2: Pre-signal checks passed
  const buildPassed = signal.build_status === "PASS";
  const testPassed = signal.test_status === "PASS";
  const preSignalPassed = buildPassed && testPassed;

  checks.push({
    check_id: "ASV-2",
    description: "Pre-signal checks passed",
    passed: preSignalPassed,
    message: preSignalPassed
      ? "Build and test status both PASS"
      : `Pre-signal checks failed: build=${signal.build_status}, test=${signal.test_status}`,
  });

  // ASV-3: Signal is not stale
  const signalTime = new Date(signal.signaled_at).getTime();
  const now = Date.now();
  const ageMinutes = (now - signalTime) / 60000;
  const isStale = ageMinutes > maxAgeMinutes;

  checks.push({
    check_id: "ASV-3",
    description: `Signal is fresh (< ${maxAgeMinutes} minutes old)`,
    passed: !isStale,
    message: isStale
      ? `Signal is ${Math.round(ageMinutes)} minutes old, max allowed is ${maxAgeMinutes}`
      : `Signal is ${Math.round(ageMinutes)} minutes old`,
  });

  // ASV-5: Verification checks exist
  const verificationCheckCount = await db
    .select()
    .from(verificationChecks)
    .where(eq(verificationChecks.task_id, task.id));

  const hasChecks = verificationCheckCount.length > 0;
  checks.push({
    check_id: "ASV-5",
    description: "Verification checks exist for task",
    passed: hasChecks,
    message: hasChecks
      ? `${verificationCheckCount.length} verification checks defined`
      : "No verification checks defined - orchestrator must configure first",
  });

  // Determine overall status
  const allPassed = checks.every((c) => c.passed);

  return {
    status: allPassed ? "ACCEPTED" : "REJECTED",
    task_id: taskId,
    signal_id: signal.signal_id,
    checks,
  };
}
