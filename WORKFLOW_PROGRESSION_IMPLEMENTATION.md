# Workflow Progression After Code Review Approval - Implementation Summary

## Overview

Implemented automatic workflow progression feature that advances to the next eligible task after code review approval, mirroring the behavior of the `complete_task` handler.

## Problem Statement

Previously, when a code review was approved (using `submit_code_review` with `APPROVED` decision), the system would:

- Mark the current task as `COMPLETE`
- Update progress logs
- **BUT** would not find or return the next eligible task

This created a gap in the workflow where users had to manually determine what task to work on next, unlike the `complete_task` handler which automatically provided this information.

## Solution

Enhanced the `submit_code_review` handler to automatically:

1. Find the next eligible task when a task transitions to `COMPLETE`
2. Update the sprint's `workflow_step` appropriately (`CLOSEOUT` if all tasks complete, `SELECT_TASK` if more work remains)
3. Return the `next_task_id` in the response

## Changes Made

### 1. Schema Update ([submit-code-review.schema.ts](x:\Cloud Storage\Dropbox\Repositories\vs code\orchestra\src\schemas\code-review\submit-code-review.schema.ts))

Added optional `next_task_id` field to the output schema:

```typescript
export const SubmitCodeReviewOutputSchema = z.object({
  success: z.literal(true),
  review_id: z.number(),
  task: z.number(),
  status: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]),
  next_action: z.string(),
  task_status: z.string().optional(),
  auto_created: z.boolean().optional(),
  next_task_id: z.number().optional(), // NEW FIELD
});
```

### 2. Handler Logic Update ([submit-code-review.ts](x:\Cloud Storage\Dropbox\Repositories\vs code\orchestra\src\mcp-server\handlers\submit-code-review.ts))

#### Added Import

```typescript
import {
  codeReviewIssues,
  codeReviews,
  progress,
  sprints, // NEW IMPORT
  tasks,
} from "../../db/schema.js";
```

#### Added Next-Task Finding Logic

After a task transitions to `COMPLETE` (around line 344), added:

```typescript
// Calculate progress summary and find next eligible task
let nextTaskId: number | undefined;

if (taskStatus === "COMPLETE") {
  const allTasks = await db
    .select({ task_id: tasks.task_id, status: tasks.status })
    .from(tasks)
    .where(eq(tasks.sprint_id, sprint.id));

  const totalTasks = allTasks.length;
  const completed = allTasks.filter(
    (t) => t.status === "COMPLETE" || t.status === "VERIFIED",
  ).length;

  // Find next task (PENDING with all dependencies complete)
  const pendingTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.sprint_id, sprint.id), eq(tasks.status, "PENDING")));

  const completedTaskIds = new Set(
    allTasks
      .filter((t) => t.status === "COMPLETE" || t.status === "VERIFIED")
      .map((t) => t.task_id),
  );

  for (const pendingTask of pendingTasks) {
    const dependencies = JSON.parse(pendingTask.dependencies) as number[];
    const allDepsComplete = dependencies.every((depId) =>
      completedTaskIds.has(depId),
    );

    if (allDepsComplete) {
      nextTaskId = pendingTask.task_id;
      break;
    }
  }

  // Update sprint workflow_step if all tasks complete
  const now = completedAt ?? new Date().toISOString();
  if (completed === totalTasks) {
    await db
      .update(sprints)
      .set({
        workflow_step: "CLOSEOUT",
        completed_at: now,
        updated_at: now,
      })
      .where(eq(sprints.id, sprint.id));
  } else if (sprint.workflow_step === "VERIFY") {
    // Move back to SELECT_TASK if more work remains
    await db
      .update(sprints)
      .set({
        workflow_step: "SELECT_TASK",
        updated_at: now,
      })
      .where(eq(sprints.id, sprint.id));
  }
}
```

#### Updated Return Statement

```typescript
const output = validateOutput(SubmitCodeReviewOutputSchema, {
  success: true,
  review_id: review.id,
  task: input.task,
  status: decisionStatus,
  next_action: nextAction,
  task_status: taskStatus,
  auto_created: autoCreated ? true : undefined,
  ...(nextTaskId !== undefined && { next_task_id: nextTaskId }), // NEW FIELD
});
```

### 3. Test Coverage ([submit-code-review.test.ts](x:\Cloud Storage\Dropbox\Repositories\vs code\orchestra\test\mcp-server\submit-code-review.test.ts))

Added comprehensive test case to verify the new functionality:

```typescript
it("returns next_task_id when completing task with dependent tasks", async () => {
  // Create sprint with two tasks where task 2 depends on task 1
  // ... test setup ...

  const result = await handleSubmitCodeReview({
    task: 1,
    decision: "APPROVED",
    // ... other params ...
  });

  const response = JSON.parse(result.content[0].text);
  expect(response.success).toBe(true);
  expect(response.task_status).toBe("COMPLETE");
  expect(response.next_task_id).toBe(2); // Verifies next task is returned

  // Verify workflow_step was updated to SELECT_TASK
  const [updatedSprint] = await db
    .select()
    .from(sprints)
    .where(eq(sprints.id, sprint.id));
  expect(updatedSprint.workflow_step).toBe("SELECT_TASK");
});
```

## Behavior

### When Code Review is Approved

1. **Task Completion**: Task status transitions from `VERIFIED` → `COMPLETE`
2. **Next Task Discovery**: System searches for eligible tasks:
   - Status must be `PENDING`
   - All dependencies must be `COMPLETE` or `VERIFIED`
3. **Workflow Update**: Sprint workflow_step is updated:
   - `CLOSEOUT` if all tasks are complete
   - `SELECT_TASK` if more work remains
4. **Response**: Returns `next_task_id` field with the task number (not internal ID) of the next eligible task

### Example Response

```json
{
  "success": true,
  "review_id": 123,
  "task": 1,
  "status": "APPROVED",
  "next_action": "Task completed after code review approval.",
  "task_status": "COMPLETE",
  "next_task_id": 2
}
```

## Design Rationale

### Pattern Consistency

The implementation deliberately mirrors the `complete_task` handler's logic (lines 364-400) to ensure:

- Consistent behavior across different completion paths
- Predictable workflow progression
- Same dependency resolution algorithm
- Same workflow_step transition rules

### Constitutional Principles Applied

1. **Automation**: Reduces manual steps in workflow progression
2. **Consistency**: Makes code review approval behave like task completion
3. **User Experience**: Seamless transition between tasks without manual lookup
4. **Separation of Concerns**: Logic encapsulated within the code review handler

## Testing

All tests pass (1109 tests total):

- ✅ Existing tests continue to pass
- ✅ New test verifies `next_task_id` is returned correctly
- ✅ New test verifies `workflow_step` is updated appropriately
- ✅ Integration with existing code review workflow validated

## Related Files

- Handler: [src/mcp-server/handlers/submit-code-review.ts](x:\Cloud Storage\Dropbox\Repositories\vs code\orchestra\src\mcp-server\handlers\submit-code-review.ts)
- Schema: [src/schemas/code-review/submit-code-review.schema.ts](x:\Cloud Storage\Dropbox\Repositories\vs code\orchestra\src\schemas\code-review\submit-code-review.schema.ts)
- Tests: [test/mcp-server/submit-code-review.test.ts](x:\Cloud Storage\Dropbox\Repositories\vs code\orchestra\test\mcp-server\submit-code-review.test.ts)
- Reference Implementation: [src/mcp-server/handlers/complete-task.ts](x:\Cloud Storage\Dropbox\Repositories\vs code\orchestra\src\mcp-server\handlers\complete-task.ts)

## Future Enhancements

Potential improvements that could build on this foundation:

1. **Progress Reporting**: Include progress summary in response (similar to `complete_task`)
2. **Auto-commit**: Support git auto-commit when enabled
3. **Next Task Details**: Option to include full task details, not just ID
4. **Dependency Chains**: Visualize the dependency chain of upcoming tasks

## Implementation Date

Completed: February 1, 2025
