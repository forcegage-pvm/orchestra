/**
 * update_verification tool handler
 *
 * Replaces ALL verification checks for a task with new criteria.
 * Deletes existing checks and inserts new ones.
 *
 * ALLOWED STATES:
 * - CONFIGURE: Initial sprint configuration
 * - PREPARE: During task preparation (spec error corrections)
 * - VERIFY/SIGNAL/GATE_CHECK/RETRY: During verification (spec error corrections)
 *
 * The orchestrator owns the verification criteria and can update them
 * at any point in the workflow. Rationale is required for audit trail
 * when updating outside CONFIGURE phase.
 *
 * AUDIT TRAIL:
 * When called outside CONFIGURE, creates an amendment record with full
 * before/after state for accountability and debugging.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
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
      durationMs
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
      durationMs
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
            2
          ),
        },
      ],
    };
  }
}

async function updateVerification(
  input: typeof UpdateVerificationInputSchema._output
): Promise<UpdateVerificationOutput & { amendment_id?: number }> {
  const db = getDb();

  // 1. Get explicitly active sprint
  const sprint = await getActiveSprint();

  if (!sprint) {
    throw new Error(
      "No active sprint found. " +
        "Verification criteria can only be updated during active sprints."
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
  ];
  if (!allowedStates.includes(sprint.workflow_step)) {
    throw new Error(
      `Cannot update verification in workflow state: ${sprint.workflow_step}. ` +
        `Allowed states: ${allowedStates.join(", ")}`
    );
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
    throw new Error(`Task ${input.task_id} not found in active sprint`);
  }

  // 3. Validate state-based permission
  // - CONFIGURE: always allowed (initial setup)
  // - PREPARE: always allowed (spec refinement before handover)
  // - SELECT_TASK + PENDING task: allowed (strengthening criteria before preparation)
  // - VERIFY-related states: allowed (orchestrator fixing spec errors)
  // Rationale required for audit trail when updating outside CONFIGURE
  const allowedSprintStates = [
    "CONFIGURE",
    "PREPARE",
    "SIGNAL",
    "VERIFY",
    "GATE_CHECK",
    "RETRY",
  ];
  const isInAllowedSprintState = allowedSprintStates.includes(
    sprint.workflow_step
  );

  // Also allow updating PENDING tasks during SELECT_TASK (pre-preparation strengthening)
  const isPendingDuringSelectTask =
    sprint.workflow_step === "SELECT_TASK" && task.status === "PENDING";

  // Also allow updating during IMPLEMENT if orchestrator needs to fix criteria
  const isDuringImplement = sprint.workflow_step === "IMPLEMENT";

  if (
    !isInAllowedSprintState &&
    !isPendingDuringSelectTask &&
    !isDuringImplement
  ) {
    throw new Error(
      `Cannot update verification in workflow state: ${sprint.workflow_step}. ` +
        `Task ${input.task_id} is in ${task.status} state.`
    );
  }

  // Require rationale for updates outside CONFIGURE (for audit trail)
  const requiresRationale = sprint.workflow_step !== "CONFIGURE";
  if (requiresRationale && (!input.rationale || input.rationale.length < 10)) {
    throw new Error(
      "Rationale is required when updating verification outside CONFIGURE phase (min 10 chars). " +
        "Explain why the verification criteria need correction."
    );
  }

  // Log spec modifications during verification phases
  const verifyPhases = ["SIGNAL", "VERIFY", "GATE_CHECK", "RETRY"];
  if (verifyPhases.includes(sprint.workflow_step)) {
    await logSystemEvent({
      level: "WARN",
      category: "security",
      message: `Verification criteria modified during ${sprint.workflow_step} phase for task ${input.task_id}`,
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

  // 4. Delete existing verification checks
  await db
    .delete(verificationChecks)
    .where(eq(verificationChecks.task_id, task.id));

  // 5. Insert new verification checks
  const structural = input.verification.structural_checks || [];
  const behavioral = input.verification.behavioral_checks || [];
  const quality = input.verification.quality_checks || [];

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
      `${totalChecks} total (${structural.length} structural, ${behavioral.length} behavioral, ${quality.length} quality). ` +
      `Amendment ID: ${amendmentId}`
    : `Updated verification checks: ${totalChecks} total (${structural.length} structural, ${behavioral.length} behavioral, ${quality.length} quality)`;

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
  };

  if (amendmentId !== undefined) {
    result.amendment_id = amendmentId;
  }

  return result;
}
