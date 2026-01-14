# TD-020 Addendum: TDD Red-Green Workflow Analysis

**Status**: ACTIVE INCIDENT  
**Priority**: P0 (Caused sprint failure)  
**Created**: 2026-01-14  
**Related**: TD-020, [docs/post-mortem.md](../docs/post-mortem.md)

---

## Executive Summary

This addendum documents the discrepancy between TD-020's design documentation and the actual implemented code, and analyzes the workflow failure in Sprint 015-x-axis-visual-unification where 40/45 tasks were marked COMPLETE with zero functional changes delivered.

---

## Part 1: Current Code State vs TD-020 Documentation

### 1.1 What IS Implemented ✅

| Component | File Location | Behavior |
|-----------|---------------|----------|
| `tdd_red_phase` column | `src/db/schema.ts:89`, `src/db/migrations.ts:209` | Boolean flag stored per task |
| Task storage of flag | `configure-sprint.ts:265`, `add-task.ts:173` | Flag persisted when tasks created |
| Task retrieval of flag | `get-task.ts:187`, `get-tasks.ts:217`, `get-current-task.ts:198` | Flag returned in output |
| `cleanupTddRedMarkers()` | `src/core/tdd-cleanup.ts` | Removes `@Tags(['tdd-red'])` from Dart, moves files from `test/tdd-red/` for TypeScript |
| Cleanup runs at prepare | `prepare-task.ts:113-123` | **UNCONDITIONALLY** runs cleanup at start of `prepare_task` |
| Red-phase check injection | `prepare-task.ts:292-333` | Injects 3 checks when `tdd_red_phase=true` |
| TDD instructions for implementor | `get-current-task.ts:233-290` | Returns tagging instructions when flag is true |
| Pre-signal dual-command | `src/core/pre-signal-executor.ts:330-430` | ALWAYS runs dual-command: tagged must fail, non-tagged must pass |

### 1.2 Critical Behavior: Unconditional Cleanup at Prepare

**Current code in `prepare-task.ts`:**

```typescript
async function prepareTask(input: PrepareTaskInputSchema): Promise<PrepareTaskOutput> {
  const db = getDb();

  // 0. Clean up TDD red-phase markers from previous tasks
  const workspaceRoot = resolveWorkspacePath();
  const cleanupResult = await cleanupTddRedMarkers(workspaceRoot);  // ← ALWAYS RUNS

  // Auto-commit cleanup if files were cleaned
  if (cleanupResult.cleaned) {
    await autoCommitIfEnabled({
      toolName: "prepare_task",
      commitMessage: "chore(orchestra): cleanup tdd-red markers",
      ...
    });
  }
```

**Key Insight**: The cleanup runs on **EVERY** `prepare_task` call, regardless of whether the current task is `tdd_red_phase=true` or `tdd_red_phase=false`.

### 1.3 What TD-020 Documented vs What Was Built

| TD-020 Design | Actual Implementation | Discrepancy |
|---------------|----------------------|-------------|
| Cleanup runs at START of prepare | ✅ Same | None |
| Cleanup is orchestrator's job | ✅ Same | None |
| Red-phase checks auto-injected | ✅ Same | None |
| "Zero markers" check for non-red tasks | ❌ NOT IMPLEMENTED | **Gap** |
| Pre-signal dual-command for red tasks | ❌ ALWAYS runs, not conditional | Different (more aggressive) |
| `tdd_red_phase` input on `prepare_task` | ❌ NOT IMPLEMENTED | Cannot override flag at prepare time |

---

## Part 2: The Workflow Conflict

### 2.1 The Assumption That Broke

The current implementation assumes:

```
Task N (RED):     tdd_red_phase=true  → creates test with @Tags(['tdd-red'])
Task N+1 (ANY):   prepare_task called → cleanup removes @Tags(['tdd-red'])
                  → tests now run normally and should PASS
```

**The assumption**: Every red-phase task is immediately followed by a task that implements the green phase.

### 2.2 What Actually Happened in Sprint 015

The sprint was configured with **multiple red-phase tasks** that weren't immediately followed by their green counterparts:

```
Task T009 (RED):  Create test for font size (tdd-red) ← tag added
Task T010 (RED):  Create test for color (tdd-red)    ← tag added
Task T011 (RED):  Create test for padding (tdd-red)  ← tag added
...
Task T013 (IMPL): Add _defaultLabelStyle constant    ← NOT a green phase task
```

When `prepare_task` ran for T013:
1. Cleanup removed ALL `@Tags(['tdd-red'])` from T009, T010, T011
2. The tests now ran normally (without tags)
3. Tests FAILED because implementation hadn't happened
4. Pre-signal blocked completion

**The problem**: Cleanup happened BEFORE the green phase was implemented.

### 2.3 The Escalation Chain

```
T010 signaled → Pre-signal: tests fail (correct for red phase)
            → System rejects: "all tests must pass"
            → Conflict: red phase REQUIRES failure, system REQUIRES pass
            → Escalation to human supervisor
            → Force-complete with note "tdd-red is being fixed"
            
T013 prepared → Cleanup removes ALL tdd-red tags
             → Tests now run without exclusions
             → Tests FAIL (no implementation yet)
             → Task blocked
             
Workaround → Manually add --exclude-tags tdd-red to ALL behavioral checks
          → Tests excluded from verification permanently
          → Bug shipped undetected
```

---

## Part 3: Analysis of Sprint Task Patterns

### 3.1 Valid Patterns

**Pattern A: Red-Green Pairs (Immediate)**
```
Task N:   tdd_red_phase=true  → Create test (fails)
Task N+1: tdd_red_phase=false → Implement feature (test passes)
          Cleanup at prepare removes tag → test runs normally
          Implementation makes test pass → ✅ VALID
```

**Pattern B: Multiple Red, Single Consolidated Green**
```
Task N:   tdd_red_phase=true  → Create test A (fails)
Task N+1: tdd_red_phase=true  → Create test B (fails)
Task N+2: tdd_red_phase=true  → Create test C (fails)
Task N+3: tdd_red_phase=false → Implement all features
          Cleanup at prepare removes ALL tags → tests run normally
          Implementation makes ALL tests pass → ✅ VALID (if done correctly)
```

### 3.2 Invalid Patterns (What Caused Failure)

**Pattern C: Red Tasks, Then Non-Green Tasks (BROKEN)**
```
Task N:   tdd_red_phase=true  → Create test A (fails) - tag added
Task N+1: tdd_red_phase=true  → Create test B (fails) - tag added
Task N+2: tdd_red_phase=false → Add constant (not green phase!)
          Cleanup at prepare removes ALL tags
          Tests A & B run normally → FAIL (no implementation)
          Pre-signal rejects → ❌ STUCK
```

**Pattern D: Red Scattered Among Implementation (VERY BROKEN)**
```
Task T009: tdd_red_phase=true  → Create font test - tag added
Task T010: tdd_red_phase=true  → Create color test - tag added  
Task T013: tdd_red_phase=false → Add constant (prepare cleans up ALL tags)
                               → Tests T009 & T010 now run → FAIL
Task T015: tdd_red_phase=false → Implement cascade (blocked because tests fail)
Task T017: tdd_red_phase=false → Update config (blocked because tests fail)
```

---

## Part 4: Root Cause Summary

### 4.1 Primary Root Cause

**Unconditional cleanup removes red-phase markers before their corresponding green phase.**

The cleanup logic assumes linear execution:
```
RED → GREEN → RED → GREEN → ...
```

But the sprint had:
```
RED → RED → RED → ... → IMPL → IMPL → IMPL
```

### 4.2 Secondary Root Cause

**No mechanism to track which tests are waiting for their green phase.**

When cleanup runs, it removes ALL markers indiscriminately. There's no way to say "keep markers for tests A and B, they haven't been greened yet."

### 4.3 Tertiary Root Cause

**Sprint was configured before TDD-red implementation existed.**

The task structure wasn't designed with TDD red-green pairs in mind. Red-phase tests were created as separate tasks without corresponding green-phase implementation tasks.

---

## Part 5: The Current Pre-Signal Behavior

### 5.1 Always Dual-Command (Aggressive Mode)

The current `pre-signal-executor.ts` ALWAYS runs dual-command verification:

```typescript
// Run test check - ALWAYS use dual-command mode for TDD verification
const testResult = await runTddRedPhaseTests(
  projectType,
  config.testCommand,
  execOptions,
  config.skipTest
);
```

This means for EVERY task:
1. `flutter test --tags tdd-red` must FAIL (or no tests found)
2. `flutter test --exclude-tags tdd-red` must PASS

### 5.2 Why This Doesn't Help

After cleanup removes all tags, there are no `tdd-red` tagged tests to run:
- `--tags tdd-red` returns "no tests found" ← OK
- `--exclude-tags tdd-red` runs ALL tests ← FAIL (if implementation missing)

The cleanup + always-dual-command combination means:
1. Red phase tags get removed
2. Tests run without exclusions
3. Tests fail because no implementation
4. Task is blocked

---

## Part 6: Proposed Solutions

### Solution A: Track Red-Green Dependencies (Complex)

Add explicit dependency tracking:

```typescript
// Task schema extension
{
  tdd_red_phase: true,
  tdd_green_task_id: 17,  // Which task will implement this?
}
```

Cleanup only runs when ALL dependent green tasks are complete.

**Pros**: Precise control
**Cons**: Complex configuration, easy to misconfigure

### Solution B: Batch Red-Green Phases (Structural)

Require red-green pairs as consolidated tasks:

```typescript
{
  task_id: 10,
  title: "TDD: Add and verify color test",
  subtasks: [
    { type: "red", description: "Write failing test" },
    { type: "green", description: "Implement feature" }
  ]
}
```

**Pros**: Enforces correct structure
**Cons**: Breaking change to task model

### Solution C: Conditional Cleanup (Recommended)

Only run cleanup when the CURRENT task is NOT a red-phase task AND the PREVIOUS task WAS a red-phase task:

```typescript
// In prepare_task
const previousTask = await getPreviousCompletedTask(sprint.id);
const shouldCleanup = !task.tdd_red_phase && previousTask?.tdd_red_phase;

if (shouldCleanup) {
  await cleanupTddRedMarkers(workspaceRoot);
}
```

**Issue**: Still doesn't handle Pattern B (multiple reds, single green).

### Solution D: Manual Cleanup Flag (Pragmatic)

Add explicit control:

```typescript
// prepare_task input
{
  task_id: 17,
  cleanup_tdd_markers: true,  // Orchestrator explicitly requests cleanup
  ...
}
```

Default: `false` (no automatic cleanup)
Orchestrator sets `true` ONLY when preparing a green-phase task.

**Pros**: Explicit control, no assumptions
**Cons**: Orchestrator must remember to set it

### Solution E: Remove Automatic Cleanup Entirely (Safest)

Remove cleanup from `prepare_task`. Make cleanup the implementor's explicit action:

1. Implementor removes tags as part of green-phase implementation
2. Pre-signal checks verify no stale tags remain
3. If tags remain, pre-signal shows clear error

**Pros**: No silent removal, implementor controls timing
**Cons**: More work for implementor, risk of forgotten tags

---

## Part 7: Recommended Approach

### Immediate Fix (Stop the Bleeding)

1. **Remove unconditional cleanup from `prepare_task`**
2. **Add cleanup instruction to handover** when next task is green phase
3. **Add structural check** to verify no tags remain after green phase

### Medium-Term Fix (Proper Solution)

1. **Require explicit `tdd_green_for` field** on green-phase tasks
   ```typescript
   {
     task_id: 17,
     tdd_green_for: [10, 11, 12],  // Which red-phase tests does this task green?
   }
   ```

2. **Cleanup only removes markers for specified tests**
   ```typescript
   if (task.tdd_green_for?.length > 0) {
     // Only clean up markers in test files specified by tdd_green_for
     await cleanupSpecificMarkers(task.tdd_green_for);
   }
   ```

3. **Verification checks that all red-phase tests are eventually greened**
   - At sprint closeout, verify no stale `tdd-red` markers remain
   - Block sprint completion if orphaned markers exist

### Sprint Configuration Best Practice

For sprints using TDD:
```
Phase 1: Write all red-phase tests (grouped)
  - T001-T003: Create failing tests with tdd-red tags
  
Phase 2: Implement features (green all tests)
  - T004: Implement feature A (tdd_green_for: [1])
  - T005: Implement feature B (tdd_green_for: [2])
  - T006: Implement feature C (tdd_green_for: [3])
```

---

## Part 8: Action Items

### Must Do (P0)

- [ ] Remove unconditional `cleanupTddRedMarkers()` call from `prepare_task`
- [ ] Add `cleanup_tdd_markers: boolean` input to `prepare_task` schema
- [ ] Orchestrator manually specifies cleanup when appropriate
- [ ] Update TD-020 documentation to match actual behavior

### Should Do (P1)

- [ ] Add `tdd_green_for: number[]` field to task schema
- [ ] Create targeted cleanup function `cleanupSpecificMarkers(taskIds)`
- [ ] Add sprint closeout check for orphaned tdd-red markers

### Nice to Have (P2)

- [ ] Add workflow validation: warn if red-phase tasks have no green-phase dependent
- [ ] Add Sprint Settings UI for TDD workflow configuration
- [ ] Create TDD workflow documentation for orchestrators

---

## Part 9: Failed Sprint Recovery

For Sprint 015-x-axis-visual-unification:

1. **Reset sprint** - All 40 "complete" tasks are invalid
2. **Keep code** - The constants, methods, and test files are useful
3. **Reconfigure** with proper TDD pairs:
   ```
   New T001: [RED+GREEN] Implement X-axis font size (11px)
   New T002: [RED+GREEN] Implement X-axis color (0xFF666666)
   New T003: [RED+GREEN] Implement X-axis padding (4px)
   ```
4. **Verify visually** before marking complete

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-14 | Orchestrator | Initial analysis following sprint failure |

---

*This addendum documents the gap between TD-020 design and implementation that caused Sprint 015 failure. The core issue is that automatic cleanup assumes linear red→green execution, but the sprint had scattered red-phase tasks without corresponding green phases.*
