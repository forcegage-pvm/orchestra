/**
 * get_current_task tool handler
 *
 * Returns sanitized task details for implementor (NO verification criteria).
 * Includes feedback if task is in VERIFY_FAILED state.
 */

import { and, eq, inArray } from "drizzle-orm";
import {
  detectProjectLanguage,
  type ProjectLanguage,
} from "../../core/tdd-cleanup.js";
import {
  getActiveSprint,
  getDb,
  resolveWorkspacePath,
} from "../../db/index.js";
import { feedback, handovers, tasks } from "../../db/schema.js";
import {
  GetCurrentTaskInputSchema,
  type GetCurrentTaskOutput,
} from "../../schemas/handover.js";
import { validateInput } from "../../schemas/utils.js";
import { logToolExecution } from "./audit-logging.js";

export async function handleGetCurrentTask(input: unknown) {
  const startTime = performance.now();
  const validation = validateInput(GetCurrentTaskInputSchema, input);
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
    const output = await getCurrentTask();
    const durationMs = Math.round(performance.now() - startTime);

    await logToolExecution(
      {
        toolName: "get_current_task",
        role: "implementor",
        input: validation.data,
        taskId: output.task_id,
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
        toolName: "get_current_task",
        role: "implementor",
        input: validation.data,
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

async function getCurrentTask(): Promise<GetCurrentTaskOutput> {
  const db = getDb();

  // 1. Get active sprint
  const sprint = await getActiveSprint();

  if (!sprint) {
    throw new Error("No active sprint");
  }

  // 2. Find task in IMPLEMENT or VERIFY_FAILED state FOR THE ACTIVE SPRINT
  // Note: Tasks in PENDING_HANDOVER_REVIEW or HANDOVER_REVIEW_FAILED are NOT visible
  // to implementors - they must wait for Controller approval
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.sprint_id, sprint.id),
        inArray(tasks.status, ["IMPLEMENT", "VERIFY_FAILED"])
      )
    )
    .limit(1);

  if (!task) {
    // T031: Check if there's a task awaiting handover review and provide helpful message
    const [pendingReviewTask] = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.sprint_id, sprint.id),
          inArray(tasks.status, [
            "PENDING_HANDOVER_REVIEW",
            "HANDOVER_REVIEW_FAILED",
          ])
        )
      )
      .limit(1);

    if (pendingReviewTask) {
      const statusMessage =
        pendingReviewTask.status === "PENDING_HANDOVER_REVIEW"
          ? "Task is awaiting Controller handover review. Implementation cannot begin until approved."
          : "Task handover was rejected by Controller. Orchestrator must resubmit handover.";

      throw new Error(
        `No task available for implementation. ${statusMessage} ` +
          `(Task ${pendingReviewTask.task_id}: ${pendingReviewTask.title})`
      );
    }

    throw new Error("No task in IMPLEMENT or VERIFY_FAILED state");
  }

  // 3. Get handover record
  const [handover] = await db
    .select()
    .from(handovers)
    .where(eq(handovers.task_id, task.id))
    .limit(1);

  if (!handover) {
    throw new Error(`No handover found for task ${task.task_id}`);
  }

  // 4. Build human-readable dependencies
  const dependencyIds = JSON.parse(task.dependencies) as number[];
  const dependencyStrings: string[] = [];

  if (dependencyIds.length > 0) {
    const depTasks = await db
      .select({
        task_id: tasks.task_id,
        title: tasks.title,
        status: tasks.status,
      })
      .from(tasks)
      .where(eq(tasks.sprint_id, sprint.id));

    const depMap = new Map(
      depTasks.map((t) => [t.task_id, { title: t.title, status: t.status }])
    );

    for (const depId of dependencyIds) {
      const dep = depMap.get(depId);
      if (dep) {
        dependencyStrings.push(`Task ${depId}: ${dep.title} (${dep.status})`);
      }
    }
  }

  // 5. Get feedback if task was previously failed
  let feedbackData: GetCurrentTaskOutput["feedback"];

  if (task.retry_count > 0) {
    const [latestFeedback] = await db
      .select()
      .from(feedback)
      .where(eq(feedback.task_id, task.id))
      .orderBy(feedback.attempt)
      .limit(1);

    if (latestFeedback) {
      const issues = JSON.parse(latestFeedback.issues);
      const passedChecks = JSON.parse(latestFeedback.passed_checks);
      const nextSteps = JSON.parse(latestFeedback.next_steps);

      feedbackData = {
        attempt: latestFeedback.attempt,
        max_attempts: task.max_retries,
        can_retry: task.retry_count < task.max_retries,
        issues,
        passed_checks: passedChecks,
        next_steps: nextSteps,
      };
    }
  }

  // 6. Parse handover JSON fields
  const acceptanceCriteria = JSON.parse(handover.acceptance_criteria);
  const fileOperations = JSON.parse(handover.file_operations);
  const deliverables = JSON.parse(handover.deliverables);
  const constraints = handover.constraints
    ? JSON.parse(handover.constraints)
    : undefined;
  const references = handover.reference_links
    ? JSON.parse(handover.reference_links)
    : undefined;
  const contextFiles = handover.context_files
    ? JSON.parse(handover.context_files)
    : undefined;

  // 7. Get TDD red-phase information
  const tddRedPhase = task.tdd_red_phase ?? false;
  let tddInstructions: GetCurrentTaskOutput["tdd_instructions"] = null;

  if (tddRedPhase) {
    const workspacePath = resolveWorkspacePath();
    const language = detectProjectLanguage(workspacePath);
    tddInstructions = generateTddInstructions(language);
  }

  return {
    task_id: task.task_id,
    title: task.title,
    priority: handover.priority as "P0" | "P1" | "P2" | "P3",
    description: task.description,
    context: handover.context || undefined,
    context_files: contextFiles,
    acceptance_criteria: acceptanceCriteria,
    dependencies: dependencyStrings,
    file_operations: fileOperations,
    deliverables,
    test_file: handover.test_file || undefined,
    test_requirements: handover.test_requirements || undefined,
    constraints,
    references,
    feedback: feedbackData,
    tdd_red_phase: tddRedPhase,
    tdd_instructions: tddInstructions,
  };
}

/**
 * Generate TDD instructions based on project language
 *
 * @param language - Detected project language ("dart", "typescript", or "unknown")
 * @returns TDD instructions object or null for unknown languages
 */
function generateTddInstructions(
  language: ProjectLanguage
): GetCurrentTaskOutput["tdd_instructions"] {
  if (language === "dart") {
    return {
      tagging_mechanism:
        "Use @Tags(['tdd-red']) annotation (file-level) OR inline tags: ['tdd-red'] parameter. Add // @orchestra-task: N at top of file.",
      red_test_command: "flutter test --tags tdd-red",
      green_test_command: "flutter test --exclude-tags tdd-red",
      expected_behavior:
        "The tagged test MUST fail (exit code 1). All other tests MUST pass (exit code 0).",
      cleanup_instruction:
        "When implementing the GREEN phase: remove the @Tags(['tdd-red']) annotation or inline tags parameter AFTER making the test pass.",
      example: `// @orchestra-task: N  // <-- Replace N with task ID (links file to task)
import 'package:flutter_test/flutter_test.dart';

@Tags(['tdd-red'])  // <-- Test runner filter tag (remove in GREEN phase)
library;

void main() {
  test('feature should work', () {
    expect(actualValue, expectedValue);
  });
}

// Alternative: Inline tags parameter (single test)
test('feature should work', () {
  expect(actualValue, expectedValue);
}, tags: ['tdd-red']);  // <-- Remove in GREEN phase`,
    };
  }

  if (language === "typescript") {
    return {
      tagging_mechanism:
        "Add [tdd-red] prefix to test or describe name. Add // @orchestra-task: N at top of file.",
      red_test_command: 'npm test -- --testNamePattern="\\[tdd-red\\]"',
      green_test_command:
        'npm test -- --testNamePattern="^(?!.*\\[tdd-red\\])"',
      expected_behavior:
        "Tests with [tdd-red] in name MUST fail (exit code 1). All other tests MUST pass (exit code 0).",
      cleanup_instruction:
        "When implementing the GREEN phase: remove [tdd-red] from test/describe name AFTER making the test pass.",
      example: `// @orchestra-task: N  // <-- Replace N with task ID (links file to task)

describe('[tdd-red] Feature module', () => {  // <-- Remove [tdd-red] in GREEN phase
  it('[tdd-red] should calculate total correctly', () => {
    expect(calculateTotal([1, 2, 3])).toBe(6);
  });
});`,
    };
  }

  return null;
}
