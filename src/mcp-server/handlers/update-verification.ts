/**
 * update_verification tool handler
 *
 * Replaces ALL verification checks for a task with new criteria.
 * Deletes existing checks and inserts new ones.
 *
 * ALLOWED STATES:
 * - CONFIGURE: Initial sprint configuration
 * - PREPARE: During task preparation (spec error corrections)
 * - VERIFY (with ESCALATED task): Human supervisor correcting spec errors
 *
 * AUDIT TRAIL:
 * When called outside CONFIGURE, creates an amendment record with full
 * before/after state for accountability and debugging.
 */

import { and, eq } from "drizzle-orm";
import { validateBehavioralCommand } from "../../core/command-validation.js";
import { validateVerificationPatterns } from "../../core/pattern-validator.js";
import { getDb, resolveWorkspacePath } from "../../db/index.js";
import { getActiveSprint } from "../../db/queries.js";
import {
  amendments,
  progress,
  tasks,
  verificationChecks,
} from "../../db/schema.js";
import {
  UpdateVerificationInputSchema,
  type UpdateVerificationOutput,
} from "../../schemas/sprint-config.js";
import { validateInput } from "../../schemas/utils.js";
import { logSystemEvent, logToolExecution } from "./audit-logging.js";

export async function handleUpdateVerification(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(UpdateVerificationInputSchema, input);
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
    const output = await updateVerification(validation.data);
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "update_verification",
        role: "orchestrator",
        input: validation.data,
        taskId: validation.data.task_id,
      },
      { success: true, output },
      durationMs,
    );

    return {
      content: [{ type: "text" as const, text: JSON.stringify(output) }],
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - startTime);
    const err = error instanceof Error ? error : new Error(String(error));

    await logToolExecution(
      {
        toolName: "update_verification",
        role: "orchestrator",
        input: validation.data,
        taskId: validation.data.task_id,
      },
      { success: false, errorMessage: err.message },
      durationMs,
    );

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
            2,
          ),
        },
      ],
    };
  }
}

async function updateVerification(
  input: typeof UpdateVerificationInputSchema._output,
): Promise<UpdateVerificationOutput & { amendment_id?: number }> {
  const db = getDb();

  // 1. Get explicitly active sprint
  const sprint = await getActiveSprint();

  if (!sprint) {
    throw new Error(
      "No active sprint found. " +
        "Verification criteria can only be updated during active sprints.",
    );
  }

  // Validate sprint is in an allowed workflow state
  const allowedStates = [
    "CONFIGURE",
    "PREPARE",
    "SELECT_TASK",
    "IMPLEMENT",
    "SIGNAL",
    "VERIFY",
    "RETRY",
    "ESCALATED",
    "SPEC_REVIEW",
    "HANDOVER_REVIEW",
  ];
  if (!allowedStates.includes(sprint.workflow_step)) {
    throw new Error(
      `Cannot update verification in workflow state: ${sprint.workflow_step}. ` +
        `Allowed states: ${allowedStates.join(", ")}`,
    );
  }

  if (
    sprint.workflow_step === "SPEC_REVIEW" &&
    sprint.status !== "SPEC_REVIEW_FAILED"
  ) {
    throw new Error(
      "Cannot update verification while sprint is awaiting spec review. " +
        "Update verification only after SPEC_REVIEW_FAILED.",
    );
  }

  // 2. Find task
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(eq(tasks.sprint_id, sprint.id), eq(tasks.task_id, input.task_id)),
    )
    .limit(1);

  if (!task) {
    throw new Error(`Task ${input.task_id} not found in active sprint`);
  }

  // 3. Validate state-based permission
  // - CONFIGURE: always allowed (initial setup)
  // - PREPARE: always allowed (spec refinement before handover)
  // - SELECT_TASK + PENDING task: allowed (strengthening criteria before preparation)
  // - HANDOVER_REVIEW + PENDING task: allowed (fixing criteria before handover approval)
  // - Other states: only allowed if task is ESCALATED (human supervisor correction)
  const isSpecReviewFailed =
    sprint.workflow_step === "SPEC_REVIEW" &&
    sprint.status === "SPEC_REVIEW_FAILED";

  // Tasks in these states should NOT have their verification modified
  // (the implementor is actively working, or the task is done)
  const blockedTaskStates = new Set([
    "COMPLETE",
    "IN_PROGRESS",
    "IMPLEMENTING",
    "GATE_CHECK",
    "VERIFYING",
    "CODE_REVIEW",
  ]);

  const isTaskBlocked = blockedTaskStates.has(task.status);

  // Also allow updating PENDING tasks during HANDOVER_REVIEW (fixing criteria before approval)
  const isPendingDuringHandoverReview =
    sprint.workflow_step === "HANDOVER_REVIEW" && task.status === "PENDING";

  if (
    !isInAllowedSprintState &&
    !isPendingDuringSelectTask &&
    !isPendingDuringHandoverReview
  ) {
    if (task.status !== "ESCALATED") {
      throw new Error(
        `Task ${input.task_id} is in ${task.status} state. ` +
          `Verification criteria cannot be updated while the task is actively being worked on or completed. ` +
          "Escalate the task first if spec corrections are needed.",
      );
    }
  }

  // ESCALATED tasks require rationale
  if (task.status === "ESCALATED") {
    if (!input.rationale || input.rationale.length < 10) {
      throw new Error(
        "Rationale is required when updating verification for ESCALATED tasks (min 10 chars). " +
          "Explain why the verification criteria need correction.",
      );
    }

    // TD-016 (DD-3): Explicit audit log for ESCALATED task spec modifications
    await logSystemEvent({
      level: "WARN",
      category: "security",
      message: `Verification criteria modified for ESCALATED task ${input.task_id}`,
      details: {
        task_id: input.task_id,
        task_title: task.title,
        task_status: task.status,
        workflow_step: sprint.workflow_step,
        rationale: input.rationale,
        structural_checks: input.verification.structural_checks?.length || 0,
        behavioral_checks: input.verification.behavioral_checks?.length || 0,
        quality_checks: input.verification.quality_checks?.length || 0,
      },
      taskId: input.task_id,
    });
  }

  const now = new Date().toISOString();

  // 4. Capture BEFORE state for amendment tracking (if not in CONFIGURE)
  const isAmendment = sprint.workflow_step !== "CONFIGURE";
  let beforeState: Record<string, unknown>[] = [];
  let amendmentId: number | undefined;

  if (isAmendment) {
    // Fetch existing checks for audit trail
    const existingChecks = await db
      .select()
      .from(verificationChecks)
      .where(eq(verificationChecks.task_id, task.id));

    beforeState = existingChecks.map((check) => ({
      check_id: check.check_id,
      check_type: check.check_type,
      description: check.description,
      severity: check.severity,
      check_config: check.check_config,
    }));
  }

  // 4a. Validate verification check paths BEFORE modifying
  // Catch directory paths that should be glob patterns early
  const isValidPath = (p: string): boolean => {
    const hasGlobChars = /[*?[\]{}]/.test(p);
    const hasFileExtension = /\.\w+$/.test(p);
    return hasGlobChars || hasFileExtension;
  };

  // Detect bash-only command syntax that won't work in PowerShell
  const hasBashOnlySyntax = (cmd: string): boolean => {
    // Check for && (bash command chaining) not inside quotes
    // PowerShell uses ; for command chaining
    return /\s&&\s/.test(cmd);
  };

  const pathErrors: string[] = [];
  const commandWarnings: string[] = [];

  if (input.verification.structural_checks) {
    for (const check of input.verification.structural_checks) {
      if (!isValidPath(check.path)) {
        pathErrors.push(
          `Structural check path '${check.path}' looks like a directory. ` +
            `Use a glob pattern like '${check.path}/*.ts' or a specific file path.`,
        );
      }
    }
  }
  if (input.verification.quality_checks) {
    for (const check of input.verification.quality_checks) {
      if (check.path && !isValidPath(check.path)) {
        pathErrors.push(
          `Quality check path '${check.path}' looks like a directory. ` +
            `Use a glob pattern like '${check.path}/*.ts' or a specific file path.`,
        );
      }
    }
  }
  if (input.verification.behavioral_checks) {
    for (const check of input.verification.behavioral_checks) {
      if (hasBashOnlySyntax(check.command)) {
        commandWarnings.push(
          `Behavioral check command uses bash-only syntax '&&'. ` +
            `This will fail on Windows/PowerShell. Use ';' instead. ` +
            `Command: "${check.command.substring(0, 60)}${check.command.length > 60 ? "..." : ""}"`,
        );
      }
    }
  }

  if (pathErrors.length > 0) {
    throw new Error(
      `Invalid verification check paths:\n${pathErrors.join("\n")}\n\n` +
        `Paths must contain glob characters (*?[]{}) or end with a file extension.`,
    );
  }

  // Log warnings but don't block
  if (commandWarnings.length > 0) {
    console.error(
      `[update_verification] WARNINGS - Potential shell compatibility issues:\n${commandWarnings.join("\n")}`,
    );
  }

  // 4a2. Validate verification patterns using pattern-validator
  // This checks if patterns will actually match files/content
  const workspacePath = resolveWorkspacePath();

  // Build validation criteria conditionally to satisfy exactOptionalPropertyTypes
  const validationCriteria: Parameters<typeof validateVerificationPatterns>[0] =
    {};
  if (input.verification.structural_checks) {
    validationCriteria.structural_checks = input.verification.structural_checks;
  }
  if (input.verification.behavioral_checks) {
    validationCriteria.behavioral_checks = input.verification.behavioral_checks;
  }
  if (input.verification.quality_checks) {
    validationCriteria.quality_checks = input.verification.quality_checks;
  }

  const patternValidation = await validateVerificationPatterns(
    validationCriteria,
    workspacePath,
  );

  // Log pattern validation warnings
  if (patternValidation.warnings.length > 0) {
    console.warn(
      `[update_verification] Pattern validation warnings for task ${input.task_id}:`,
      patternValidation.warnings,
    );
  }

  // Log pattern validation errors
  if (patternValidation.errors.length > 0) {
    console.error(
      `[update_verification] Pattern validation errors for task ${input.task_id}:`,
      patternValidation.errors,
    );
  }

  // Block if pattern validation found errors
  if (!patternValidation.valid) {
    throw new Error(
      `Pattern validation failed:\n${patternValidation.errors.join("\n")}`,
    );
  }

  // 4b2. Validate behavioral check commands before finalizing verification update
  // Check that all behavioral commands are executable (correct executables, scripts, flags, etc.)
  const commandValidationErrors: string[] = [];
  const commandValidationWarnings: string[] = [];

  const behavioral = input.verification.behavioral_checks || [];

  for (const check of behavioral) {
    if (check.command) {
      const result = validateBehavioralCommand(check.command, workspacePath);

      if (!result.isValid) {
        // Collect errors with check description for context
        for (const error of result.errors) {
          commandValidationErrors.push(
            `[${check.description}] ${error.message} (code: ${error.code})`,
          );
        }
      }

      // Collect warnings
      for (const warning of result.warnings) {
        commandValidationWarnings.push(
          `[${check.description}] ${warning.message} (code: ${warning.code})`,
        );
      }
    }
  }

  // BLOCK on command validation errors - don't allow invalid commands
  if (commandValidationErrors.length > 0) {
    console.error(
      `[update_verification] Behavioral command validation errors for task ${input.task_id}:`,
      commandValidationErrors,
    );
    throw new Error(
      `Behavioral command validation failed. These errors WILL cause verification to fail:\n\n` +
        `${commandValidationErrors.join("\n")}\n\n` +
        `Fix the behavioral check commands before updating verification.` +
        (commandValidationWarnings.length > 0
          ? `\n\nWarnings (non-blocking):\n${commandValidationWarnings.join("\n")}`
          : ``),
    );
  }

  // Merge command validation warnings into pattern validation warnings
  if (commandValidationWarnings.length > 0) {
    patternValidation.warnings.push(...commandValidationWarnings);
    console.warn(
      `[update_verification] Behavioral command validation warnings for task ${input.task_id}:`,
      commandValidationWarnings,
    );
  }

  // 4c. Delete existing verification checks
  await db
    .delete(verificationChecks)
    .where(eq(verificationChecks.task_id, task.id));

  // 5. Insert new verification checks
  const structural = input.verification.structural_checks || [];
  // behavioral already declared above for validation
  const quality = input.verification.quality_checks || [];
  const testVerification = input.verification.test_verification || [];

  // Extract config from check objects (everything except description/severity)
  const extractConfig = (check: Record<string, unknown>): string => {
    const { description: _d, severity: _s, ...config } = check;
    return JSON.stringify(config);
  };

  const allChecks = [
    ...structural.map((check, idx) => ({
      task_id: task.id,
      check_id: `struct-${idx}`,
      check_type: "structural" as const,
      description: check.description,
      severity: check.severity,
      check_config: extractConfig(check as unknown as Record<string, unknown>),
      created_at: now,
    })),
    ...behavioral.map((check, idx) => ({
      task_id: task.id,
      check_id: `behav-${idx}`,
      check_type: "behavioral" as const,
      description: check.description,
      severity: check.severity,
      check_config: extractConfig(check as unknown as Record<string, unknown>),
      created_at: now,
    })),
    ...quality.map((check, idx) => ({
      task_id: task.id,
      check_id: `qual-${idx}`,
      check_type: "quality" as const,
      description: check.description,
      severity: check.severity,
      check_config: extractConfig(check as unknown as Record<string, unknown>),
      created_at: now,
    })),
    ...testVerification.map((check, idx) => ({
      task_id: task.id,
      check_id: `test-verification-${idx}`,
      check_type: "test_verification" as const,
      description: `Run ${check.tier} tests (${check.expect})`,
      severity: "BLOCKING" as const,
      check_config: JSON.stringify(check),
      created_at: now,
    })),
  ];

  const totalChecks = allChecks.length;

  if (totalChecks > 0) {
    await db.insert(verificationChecks).values(allChecks);
  }

  // 6. Create amendment record if modifying during PREPARE
  if (isAmendment) {
    const afterState = allChecks.map((check) => ({
      check_id: check.check_id,
      check_type: check.check_type,
      description: check.description,
      severity: check.severity,
      check_config: check.check_config,
    }));

    // Determine what fields changed
    const changedFields: string[] = [];
    const beforeCount = beforeState.length;
    const afterCount = afterState.length;

    if (beforeCount !== afterCount) {
      changedFields.push("check_count");
    }

    // Compare check types distribution
    const beforeTypes: Record<string, number> = {};
    for (const c of beforeState) {
      const key = c.check_type as string;
      beforeTypes[key] = (beforeTypes[key] || 0) + 1;
    }
    const afterTypes: Record<string, number> = {};
    for (const c of afterState) {
      const key = c.check_type as string;
      afterTypes[key] = (afterTypes[key] || 0) + 1;
    }

    if (JSON.stringify(beforeTypes) !== JSON.stringify(afterTypes)) {
      changedFields.push("check_types");
    }

    // Check for description/severity changes
    const beforeDescs = beforeState.map((c) => c.description).sort();
    const afterDescs = afterState.map((c) => c.description).sort();
    if (JSON.stringify(beforeDescs) !== JSON.stringify(afterDescs)) {
      changedFields.push("descriptions");
    }

    const beforeSevs = beforeState.map((c) => c.severity).sort();
    const afterSevs = afterState.map((c) => c.severity).sort();
    if (JSON.stringify(beforeSevs) !== JSON.stringify(afterSevs)) {
      changedFields.push("severities");
    }

    // Check for config changes (the actual check patterns/commands)
    const beforeConfigs = beforeState.map((c) => c.check_config).sort();
    const afterConfigs = afterState.map((c) => c.check_config).sort();
    if (JSON.stringify(beforeConfigs) !== JSON.stringify(afterConfigs)) {
      changedFields.push("check_configs");
    }

    // Generate rationale from input or use default
    const rationale =
      input.rationale ||
      `Verification criteria updated during ${sprint.workflow_step} phase. ` +
        `Changed: ${changedFields.join(", ") || "structure"}.`;

    const [insertResult] = await db
      .insert(amendments)
      .values({
        sprint_id: sprint.id,
        task_id: task.id,
        tool_name: "update_verification",
        amendment_type: "VERIFICATION",
        workflow_step_at_amendment: sprint.workflow_step,
        rationale,
        before_state: JSON.stringify(beforeState),
        after_state: JSON.stringify(afterState),
        changed_fields: JSON.stringify(changedFields),
        amended_by: "orchestrator",
        amended_at: now,
      })
      .returning({ id: amendments.id });

    amendmentId = insertResult?.id;
  }

  // 7. Update task timestamp
  await db.update(tasks).set({ updated_at: now }).where(eq(tasks.id, task.id));

  // 8. Log progress with amendment note if applicable
  const progressNote = isAmendment
    ? `AMENDMENT: Updated verification checks during ${sprint.workflow_step}: ` +
      `${totalChecks} total (${structural.length} structural, ${behavioral.length} behavioral, ${quality.length} quality, ${testVerification.length} test_verification). ` +
      `Amendment ID: ${amendmentId}`
    : `Updated verification checks: ${totalChecks} total (${structural.length} structural, ${behavioral.length} behavioral, ${quality.length} quality, ${testVerification.length} test_verification)`;

  await db.insert(progress).values({
    sprint_id: sprint.id,
    task_id: task.id,
    from_status: task.status,
    to_status: task.status,
    workflow_step: sprint.workflow_step,
    triggered_by: "orchestrator",
    notes: progressNote,
    changed_at: now,
  });

  const result: UpdateVerificationOutput & { amendment_id?: number } = {
    success: true,
    task_id: input.task_id,
    total_checks: totalChecks,
    pattern_warnings:
      patternValidation.warnings.length > 0
        ? patternValidation.warnings
        : undefined,
  };

  if (amendmentId !== undefined) {
    result.amendment_id = amendmentId;
  }

  return result;
}
