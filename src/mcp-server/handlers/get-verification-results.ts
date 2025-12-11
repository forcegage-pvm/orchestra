/**
 * get_verification_results tool handler
 *
 * Retrieves verification check execution results for the latest signal of a task.
 * Returns orchestrator view with full check details.
 *
 * Enhanced output (VER-024, VER-025, VER-026):
 * - Includes check type, description, and severity per result
 * - Includes severity breakdown in summary
 * - overall_passed computed based on BLOCKING checks only
 */

import { and, desc, eq } from "drizzle-orm";
import { getActiveSprint, getDb } from "../../db/index.js";
import {
  signals,
  tasks,
  verificationChecks,
  verificationResults,
} from "../../db/schema.js";
import { validateInput } from "../../schemas/utils.js";
import {
  GetVerificationResultsInputSchema,
  type GetVerificationResultsOutput,
} from "../../schemas/verification.js";

export async function handleGetVerificationResults(input: unknown) {
  const validation = validateInput(GetVerificationResultsInputSchema, input);
  if (!validation.success) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(validation.error, null, 2),
        },
      ],
    };
  }

  try {
    const output = await getVerificationResults(validation.data);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: {
                code: "SYSTEM_ERROR",
                message: err.message,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }
}

async function getVerificationResults(
  input: typeof GetVerificationResultsInputSchema._output
): Promise<GetVerificationResultsOutput> {
  const db = getDb();

  // 1. Get active sprint
  const sprint = await getActiveSprint();

  if (!sprint) {
    throw new Error("No active sprint");
  }

  // 2. Find task
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task_id))
    )
    .limit(1);

  if (!task) {
    throw new Error(`Task ${input.task_id} not found`);
  }

  // 3. Get latest signal
  // TD-FIX: Order by id (auto-increment) instead of attempt - attempt numbers aren't reliable
  const [signal] = await db
    .select()
    .from(signals)
    .where(eq(signals.task_id, task.id))
    .orderBy(desc(signals.id))
    .limit(1);

  if (!signal) {
    throw new Error(`No signal found for task ${input.task_id}`);
  }

  // 4. Get verification results for this signal
  const results = await db
    .select()
    .from(verificationResults)
    .where(eq(verificationResults.signal_id, signal.signal_id));

  if (results.length === 0) {
    throw new Error(
      `No verification results found for task ${input.task_id} signal ${signal.signal_id}`
    );
  }

  // 5. Get check details to enrich results
  const checks = await db
    .select()
    .from(verificationChecks)
    .where(eq(verificationChecks.task_id, task.id));

  const checkMap = new Map(checks.map((c) => [c.id, c]));

  // Define severity type for type safety
  type Severity = "BLOCKING" | "MAJOR" | "MINOR" | "INFO";
  const validSeverities: Severity[] = ["BLOCKING", "MAJOR", "MINOR", "INFO"];

  function isValidSeverity(s: string): s is Severity {
    return validSeverities.includes(s as Severity);
  }

  // 6. Build enhanced output with check details
  type ResultOutput = {
    check_id: string;
    type: string;
    description: string;
    severity: Severity;
    passed: boolean;
    duration_ms: number;
    output?: string;
  };

  const resultsOutput: ResultOutput[] = results.map((r) => {
    const check = checkMap.get(r.check_id);
    const rawSeverity = check?.severity ?? "BLOCKING";
    const severity: Severity = isValidSeverity(rawSeverity)
      ? rawSeverity
      : "BLOCKING";

    const result: ResultOutput = {
      check_id: check?.check_id ?? r.check_id.toString(),
      type: check?.check_type ?? "unknown",
      description: check?.description ?? "Unknown check",
      severity,
      passed: r.passed === 1,
      duration_ms: r.duration_ms,
    };
    if (r.output) {
      result.output = r.output;
    }
    return result;
  });

  // 7. Compute severity breakdown
  const severityBreakdown = {
    BLOCKING: { passed: 0, failed: 0 },
    MAJOR: { passed: 0, failed: 0 },
    MINOR: { passed: 0, failed: 0 },
    INFO: { passed: 0, failed: 0 },
  };

  for (const result of resultsOutput) {
    const severity = result.severity;
    if (result.passed) {
      severityBreakdown[severity].passed++;
    } else {
      severityBreakdown[severity].failed++;
    }
  }

  // 8. Compute overall_passed based on BLOCKING checks only
  const blockingFailed = severityBreakdown.BLOCKING.failed;
  const overallPassed = blockingFailed === 0;

  const totalChecks = results.length;
  const passed = results.filter((r) => r.passed === 1).length;
  const failed = totalChecks - passed;

  // Use run_at from first result (all should have same timestamp)
  const runAt = results[0]!.run_at;

  return {
    task_id: input.task_id,
    run_at: runAt,
    results: resultsOutput,
    summary: {
      total_checks: totalChecks,
      passed,
      failed,
      overall_passed: overallPassed,
      severity_breakdown: severityBreakdown,
    },
  };
}
