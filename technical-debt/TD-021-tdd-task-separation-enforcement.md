# TD-021: TDD Task Separation Enforcement

**Status**: IMPLEMENTED  
**Priority**: P1 (Prevents workflow failures)  
**Category**: Structural Enforcement  
**Created**: 2026-01-15  
**Implemented**: 2026-01-15
**Related**: TD-020, [orchestrator.agent.md](../extension/agents/orchestra.orchestrator.agent.md)

---

## Implementation Summary

**Hard enforcement added at `configure_sprint` validation time:**

If any task has `tdd_red_phase=true`, it MUST have a corresponding entry in `tdd_relationships` where:
- `red_task_id` equals the task's `task_id`
- `green_task_id` is a different task that will implement the feature

This is enforced in `src/schemas/sprint-config.ts` and fails at schema validation time with a clear error message.

**Improved error message at `signal_completion`:**

If a red-phase task somehow reaches signal without markers (shouldn't happen with configure-time validation), the error message now clearly explains the TDD workflow violation.

**MCP tool schema updated:**

The `configure_sprint` tool description and `tdd_red_phase` property description now explicitly state the requirement for `tdd_relationships`.

---

## Problem Statement

The current TDD red-green workflow relies on **documentation-based enforcement** in the orchestrator's instructions. If the orchestrator ignores these instructions and creates a single task with `tdd_red_phase: true` that instructs the implementor to:

1. Write failing tests with TDD markers
2. Implement the feature to make tests pass
3. Remove TDD markers

...the workflow will fail at `signal_completion` because:

1. Task has `tdd_red_phase: true`
2. On signal, `scanForTddMarkers()` runs
3. Markers were removed (per bad instructions)
4. Scan fails: "No tests found in workspace scan"

### The Error Message

```
TDD red-phase task must have at least one test with marker [tdd-red:task-3] or tags: ['task-3']. 
No tests found in workspace scan.
```

This error is cryptic - it doesn't explain the workflow violation.

---

## Root Cause

**Soft enforcement**: The separation of red and green phases is only enforced via agent instructions, not structurally.

**Late failure**: The violation isn't caught until `signal_completion`, after all implementation work is done.

**Cryptic error**: The error message describes the symptom (no markers) not the cause (combined phases).

---

## Enforcement Points Analysis

| Enforcement Point | When | What Can Be Detected | Current Status |
|-------------------|------|----------------------|----------------|
| `configure_sprint` | Sprint creation | Task has `tdd_red_phase=true` but no relationship in `tdd_relationships` | ❌ Not enforced |
| `prepare_task` | Handover creation | Handover content mentions "implement" or "make tests pass" for red-phase task | ❌ Not enforced |
| `signal_completion` | Task completion | Markers exist for red-phase tasks | ✅ Enforced (current) |

---

## Proposed Solutions

### Solution A: Require TDD Relationships at Configure Time (Recommended)

**Enforce**: If any task has `tdd_red_phase=true`, it MUST have a corresponding entry in `tdd_relationships`.

```typescript
// In configure-sprint.ts validation
const redPhaseTasks = tasksData.filter(t => t.tdd_red_phase);
const relationships = input.tdd_relationships || [];

for (const redTask of redPhaseTasks) {
  const hasRelationship = relationships.some(r => r.red_task_id === redTask.task_id);
  if (!hasRelationship) {
    throw new Error(
      `Task ${redTask.task_id} has tdd_red_phase=true but no entry in tdd_relationships. ` +
      `TDD red-phase tasks MUST have a corresponding green task declared.`
    );
  }
}
```

**Pros**: 
- Early failure (at sprint configuration, not signal completion)
- Clear error message
- Forces orchestrator to think about green phase upfront

**Cons**:
- More restrictive - can't add red-phase task without knowing green task
- May need to allow `complete_task` to declare relationship (already supported)

### Solution B: Validate Handover Content at Prepare Time

**Enforce**: When preparing a red-phase task, validate handover doesn't contain implementation-related content.

```typescript
// In prepare-task.ts
if (task.tdd_red_phase) {
  const forbiddenTerms = [
    'implement', 'make tests pass', 'make the test pass', 
    'remove markers', 'remove tags', 'green phase'
  ];
  
  const handoverText = JSON.stringify(input).toLowerCase();
  for (const term of forbiddenTerms) {
    if (handoverText.includes(term)) {
      throw new Error(
        `TDD red-phase task ${task.task_id} handover contains forbidden term "${term}". ` +
        `Red-phase tasks should ONLY write failing tests, not implement features. ` +
        `Create a separate green-phase task for implementation.`
      );
    }
  }
}
```

**Pros**:
- Catches most violations
- Clear guidance in error message

**Cons**:
- Heuristic-based (could have false positives)
- Doesn't prevent orchestrator from omitting the green task entirely

### Solution C: Improved Error Messaging at Signal Time (Minimum)

**Improve**: Make the signal_completion error message explain the workflow violation.

```typescript
// In signal-completion.ts
if (scanResult.tests.length === 0) {
  throw new Error(
    `TDD RED-PHASE WORKFLOW VIOLATION:\n\n` +
    `Task ${task.task_id} has tdd_red_phase=true but no TDD markers were found.\n\n` +
    `This usually happens when the handover instructed the implementor to:\n` +
    `1. Write tests with TDD markers\n` +
    `2. Implement the feature\n` +
    `3. Remove the markers\n\n` +
    `This is INCORRECT. Red and green phases MUST be separate tasks:\n` +
    `- Red task: Write failing tests, keep markers, signal completion\n` +
    `- Green task: Implement feature, remove markers, signal completion\n\n` +
    `To fix: Escalate this task and reconfigure with separate red/green tasks.`
  );
}
```

**Pros**:
- Clear explanation of what went wrong
- Guidance on how to fix

**Cons**:
- Still fails late in workflow
- Doesn't prevent the issue

### Solution D: Block Single-Task TDD at Add-Task Time

**Enforce**: When `add_task` is called with `tdd_red_phase=true`, require a `green_task_id` parameter or auto-create the green task.

```typescript
// add-task input schema extension
{
  tdd_red_phase: true,
  green_task_id: 5,  // Required when tdd_red_phase=true
  // OR
  auto_create_green: true  // System creates Task N+1 as green task
}
```

**Pros**:
- Impossible to create orphan red-phase task

**Cons**:
- May be too restrictive
- Changes add_task contract

---

## Recommended Implementation

### Phase 1: Improved Error Message (Quick Win)

Update `signal-completion.ts` to provide clear workflow violation error.

**Files to change:**
- `src/mcp-server/handlers/signal-completion.ts`

### Phase 2: Relationship Validation at Configure Time

Add validation in `configure-sprint.ts`:
- Warn (not error) if red-phase task has no relationship
- Include warning in output summary

**Files to change:**
- `src/mcp-server/handlers/configure-sprint.ts`
- `src/schemas/index.ts` (add warning field to output)

### Phase 3: Handover Content Validation

Add heuristic validation in `prepare-task.ts`:
- Detect implementation-related terms in red-phase handovers
- Emit warning in output

**Files to change:**
- `src/mcp-server/handlers/prepare-task.ts`

### Phase 4: Strict Enforcement (Optional)

Convert warnings to errors after proving the pattern works.

---

## Current Workaround

The orchestrator instructions have been updated with explicit warnings about task separation:

```markdown
### ⚠️ CRITICAL: TDD Red and Green MUST Be Separate Tasks

**NEVER combine red phase (write tests) and green phase (implement) in one task.**

When a task has `tdd_red_phase: true`, the system scans for TDD markers on 
`signal_completion`. If you tell the implementor to write tests AND implement 
AND remove markers all in one task:

1. Implementor writes tests with markers ✓
2. Implementor implements feature ✓
3. Implementor removes markers (per instructions) ✓
4. Implementor signals completion
5. System scans for markers → **NONE FOUND** → Task fails
```

This is a **soft guard** that depends on the orchestrator reading and following instructions.

---

## Acceptance Criteria

1. ✅ Error message at `signal_completion` clearly explains workflow violation
2. ⬜ Warning emitted if red-phase task configured without relationship
3. ⬜ Warning emitted if red-phase handover contains implementation terms
4. ⬜ All tests pass
5. ⬜ Documentation updated

---

## Test Cases

```typescript
describe("TDD task separation enforcement", () => {
  describe("configure_sprint", () => {
    it("should warn when tdd_red_phase task has no relationship", async () => {
      const result = await handleConfigureSprint({
        sprint: { id: "test", name: "Test" },
        phases: [{ phase_id: "p1", phase_name: "Phase 1" }],
        tasks: [{
          task_id: 1,
          phase_id: "p1",
          title: "Red phase",
          tdd_red_phase: true,  // No relationship
          verification: { structural_checks: [] }
        }]
        // No tdd_relationships
      });
      
      expect(result.warnings).toContain(
        "Task 1 has tdd_red_phase=true but no entry in tdd_relationships"
      );
    });
  });

  describe("prepare_task", () => {
    it("should warn when red-phase handover mentions implementation", async () => {
      // Setup: task with tdd_red_phase=true
      
      const result = await handlePrepareTask({
        task_id: 1,
        acceptance_criteria: [
          { criterion: "Write failing tests", verification: "..." },
          { criterion: "Implement feature to make tests pass", verification: "..." }  // ← BAD
        ],
        deliverables: ["Failing test", "Working implementation"],  // ← BAD
        ...
      });
      
      expect(result.warnings).toContain(
        "Red-phase task handover mentions 'implement'"
      );
    });
  });

  describe("signal_completion", () => {
    it("should provide clear workflow violation error", async () => {
      // Setup: red-phase task with no markers in workspace
      
      await expect(handleSignalCompletion({ task_id: 1, summary: "Done" }))
        .rejects.toThrow(/TDD RED-PHASE WORKFLOW VIOLATION/);
    });
  });
});
```

---

## Implementation Priority

| Priority | Solution | Effort | Impact |
|----------|----------|--------|--------|
| P0 | Improved error message | Low (1 hour) | Medium - better debugging |
| P1 | Relationship validation warning | Medium (2 hours) | High - early detection |
| P2 | Handover content validation | Medium (2 hours) | Medium - catches most cases |
| P3 | Strict enforcement | Low (30 min) | High - prevents all violations |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-15 | Orchestrator | Initial analysis |
