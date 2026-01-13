/**
 * get_current_task tool handler
 *
 * Returns sanitized task details for implementor (NO verification criteria).
 * Includes feedback if task is in VERIFY_FAILED state.
 */

import { eq, inArray } from "drizzle-orm";
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

  // 2. Find task in IMPLEMENT or VERIFY_FAILED state (current task for implementor)
  const [task] = await db
    .select()
    .from(tasks)
    .where(inArray(tasks.status, ["IMPLEMENT", "VERIFY_FAILED"]))
    .limit(1);

  if (!task) {
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
        "Use @Tags(['tdd-red']) annotation OR inline tags: 'tdd-red' parameter",
      red_test_command: "flutter test --tags tdd-red",
      green_test_command: "flutter test --exclude-tags tdd-red",
      expected_behavior:
        "The tagged test MUST fail (exit code 1). All other tests MUST pass (exit code 0).",
      cleanup_instruction:
        "When implementing the GREEN phase: remove the tdd-red tag (annotation or parameter) AFTER making the test pass.",
      example: `// Option 1: Library-level annotation
import 'package:flutter_test/flutter_test.dart';

@Tags(['tdd-red'])  // <-- Add this annotation (remove in GREEN phase)
void main() {
  test('feature should work', () {
    expect(actualValue, expectedValue);
  });
}

// Option 2: Inline tags parameter (preferred for single tests)
test('feature should work', tags: 'tdd-red', () {  // <-- Remove tags in GREEN phase
  expect(actualValue, expectedValue);
});`,
    };
  }

  if (language === "typescript") {
    return {
      tagging_mechanism:
        "Place test in test/tdd-red/ directory OR add [tdd-red] to test name",
      red_test_command:
        'npm test -- --testNamePattern="[tdd-red]" OR npm test -- test/tdd-red',
      green_test_command:
        'npm test -- --testPathIgnorePatterns=tdd-red --testNamePattern="^(?!.*[tdd-red])"',
      expected_behavior:
        "Tests with [tdd-red] tag or in tdd-red/ MUST fail (exit code 1). All other tests MUST pass (exit code 0).",
      cleanup_instruction:
        "When implementing the GREEN phase: remove [tdd-red] from test name OR move file from test/tdd-red/ to test/unit/ AFTER making the test pass.",
      example: `// Option 1: Directory-based (place file in test/tdd-red/)
// File: test/tdd-red/feature.test.ts
describe('Feature', () => {
  it('should work', () => {
    expect(actual).toBe(expected);
  });
});
// GREEN PHASE: Move to test/unit/feature.test.ts

// Option 2: Inline tag in test name (preferred for single tests)
it('[tdd-red] should calculate total correctly', () => {  // <-- Remove [tdd-red] in GREEN phase
  expect(calculateTotal([1, 2, 3])).toBe(6);
});`,
    };
  }

  return null;
}
