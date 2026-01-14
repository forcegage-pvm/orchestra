# TDD Red-Green Enforcement Model

**Status**: DESIGN DRAFT  
**Priority**: P0  
**Created**: 2026-01-14  
**Related**: TD-020, TD-020-addendum, docs/post-mortem.md

---

## Problem Statement

### The Core Failure

In Sprint 015-x-axis-visual-unification, TDD red-phase tests were created but never transitioned to green. The tests remained tagged with `@Tags(['tdd-red'])` and were excluded from verification runs permanently. This allowed 40 tasks to be marked COMPLETE while delivering zero functional changes.

### Why Timing-Based Solutions Don't Work

Previous approaches focused on *when* to clean up tdd-red markers:
- Automatic cleanup at `prepare_task` (current implementation)
- Cleanup when next task is prepared
- Cleanup after N tasks

**The real issue is not timing—it's enforcement.** There was no mechanism to guarantee that tdd-red tests EVER transition to green.

### The Invariant We Must Enforce

```
For every TDD red-phase test created:
  ∃ a green-phase task that:
    1. Implements the feature
    2. Makes the test pass
    3. Removes the tdd-red marker
    4. Is verified by Orchestra
```

---

## Proposed Solution: TDD Red-Green Registry

### Concept

Maintain explicit tracking at two levels:

1. **Task-to-Task Relationships**: Declared upfront or at red task completion—"Task X greens whatever Task Y creates"
2. **Individual Test Registry**: Created when red task completes—actual test entries with status tracking

This two-level model allows upfront planning while deferring individual test registration until tests actually exist.

Sprint completion is blocked until ALL registry entries reach GREEN status.

---

## Data Model

### Level 1: Task-to-Task Relationships

Declared at `configure_sprint` OR at red task completion. Links a red task to its corresponding green task.

```sql
CREATE TABLE tdd_task_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sprint_id INTEGER NOT NULL REFERENCES sprints(id),
  red_task_id INTEGER NOT NULL REFERENCES tasks(id),
  green_task_id INTEGER NOT NULL REFERENCES tasks(id),
  declared_at TEXT NOT NULL,           -- 'configure_sprint' | 'complete_task'
  created_at TEXT NOT NULL,
  
  UNIQUE(sprint_id, red_task_id, green_task_id)
);
```

**Purpose**: Allows upfront declaration of which task will green which red task, before individual tests exist.

### Level 2: Individual Test Registry

Created when red task completes and actual tests are scanned.

```sql
CREATE TABLE tdd_red_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sprint_id INTEGER NOT NULL REFERENCES sprints(id),
  
  -- The red phase
  red_task_id INTEGER NOT NULL REFERENCES tasks(id),
  test_identifier TEXT NOT NULL,        -- e.g., "test/unit/axis_test.dart::group::test name"
  marker_type TEXT,                     -- 'dart-inline-tag' | 'dart-library-tag' | 'ts-directory' | 'ts-name-tag' (set during validation)
  created_at TEXT NOT NULL,
  validated_at TEXT,                    -- When pre-signal validation passed
  
  -- The green phase (assigned at red task completion by orchestrator)
  green_task_id INTEGER REFERENCES tasks(id),  -- NULL until red task completes
  assigned_at TEXT,
  
  -- Completion
  greened_at TEXT,
  status TEXT NOT NULL DEFAULT 'REGISTERED',  -- 'REGISTERED' | 'VALIDATED' | 'PENDING_GREEN' | 'GREEN'
  
  UNIQUE(sprint_id, test_identifier)
);
```

**Key Changes from Q4 Resolution**:
- `status` starts as `REGISTERED` (implementor registered, not yet validated)
- `green_task_id` is NULL until orchestrator assigns at red task completion
- `marker_type` is set during validation scan (system discovers the marker type)
- `validated_at` tracks when pre-signal validation passed

### Status Definitions

| Status | Meaning | Transitions To |
|--------|---------|----------------|
| `REGISTERED` | Implementor registered test, not yet validated | `VALIDATED` (at pre-signal) |
| `VALIDATED` | Pre-signal confirmed marker exists + test fails | `PENDING_GREEN` (at complete_task) |
| `PENDING_GREEN` | Green task assigned, awaiting implementation | `GREEN` (when verified) |
| `GREEN` | Test passes, marker removed, verified | Terminal state (kept for audit) |

### State Machine (Revised with Implementor Registration)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              TDD RED-GREEN LIFECYCLE (WITH IMPLEMENTOR REGISTRATION)        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CONFIGURE SPRINT (optional):                                               │
│  └─ Declare task relationships: T010 (red) → T015 (green)                   │
│     Stored in tdd_task_relationships table                                  │
│                                                                             │
│  IMPLEMENTOR (during red task T010):                                        │
│  ├─ Creates test file with tdd-red marker                                   │
│  ├─ Calls register_tdd_red_test({ test_identifier: "axis_test::color" })    │
│  │   └─ Creates registry entry with status=REGISTERED                       │
│  └─ Signals completion                                                      │
│                                                                             │
│  PRE-SIGNAL VALIDATION (automatic):                                         │
│  ├─ Scans workspace for all tdd-red markers                                 │
│  ├─ Cross-checks: registered ↔ marked (bidirectional)                       │
│  ├─ Verifies each registered test is FAILING                                │
│  ├─ BLOCKS if any discrepancy                                               │
│  └─ Updates status=VALIDATED for all passing checks                         │
│                                                                             │
│  RED TASK COMPLETES (orchestrator complete_task for T010):                  │
│  ├─ Lookup: Does tdd_task_relationships have entry for T010?                │
│  │   ├─ YES: Auto-assign green_task_id from relationship                    │
│  │   └─ NO:  Orchestrator MUST provide green_task_id in complete_task       │
│  │           (BLOCKS if not provided)                                       │
│  ├─ Update all VALIDATED entries → status=PENDING_GREEN                     │
│  └─ Red task marked COMPLETE                                                │
│  ├─ Create registry entries with status=PENDING_GREEN                       │
│  └─ Red task marked COMPLETE                                                │
│                                                                             │
│  GREEN TASK COMPLETES (T015):                                               │
│  ├─ Verify ALL assigned tests pass (without exclusions)                     │
│  ├─ Verify ALL tdd-red markers removed                                      │
│  ├─ Update registry entries → status=GREEN                                  │
│  └─ Green task marked COMPLETE                                              │
│                                                                             │
│  SPRINT CLOSEOUT:                                                           │
│  └─ Block if ANY registry entry is not GREEN                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Task Relationship Declaration

### Option 1: Upfront at Sprint Configuration

The orchestrator declares red→green relationships when configuring the sprint:

```typescript
// configure_sprint
{
  sprint: { id: "sprint-015", name: "X-Axis Visual Unification" },
  tasks: [
    { task_id: 10, tdd_red_phase: true, title: "Create color test" },
    { task_id: 11, tdd_red_phase: true, title: "Create font test" },
    { task_id: 15, tdd_green_for_tasks: [10, 11], title: "Implement X-axis styling" },
  ]
}
```

This creates entries in `tdd_task_relationships`:
```
| red_task_id | green_task_id | declared_at        |
|-------------|---------------|--------------------|
| 10          | 15            | configure_sprint   |
| 11          | 15            | configure_sprint   |
```

When T010 completes later, registry entries are auto-assigned to T015.

### Option 2: At Red Task Completion

If no upfront relationship exists, the orchestrator MUST provide the green task when completing a red task:

```typescript
// complete_task for T010
{
  task_id: 10,
  green_task_id: 15,  // REQUIRED for tdd_red_phase tasks without upfront relationship
}
```

This:
1. Creates the relationship in `tdd_task_relationships` (declared_at: 'complete_task')
2. Updates all VALIDATED registry entries to PENDING_GREEN with green_task_id

---

## Implementor Tool: `register_tdd_red_test`

New implementor-only MCP tool for registering TDD red-phase tests.

### Tool Schema

```typescript
// register_tdd_red_test (implementor-only tool)
{
  name: "register_tdd_red_test",
  role: "implementor",
  description: "Register a TDD red-phase test that was just created. " +
               "The test must have a tdd-red marker and should be failing. " +
               "All registered tests will be validated during pre-signal checks.",
  inputSchema: {
    type: "object",
    properties: {
      test_identifier: {
        type: "string",
        description: "Unique test identifier: '{file_path}::{group}::{test_name}'",
        examples: [
          "test/unit/axis_test.dart::InternalAxisConfig::color should be 0xFF666666",
          "test/tdd-red/feature.test.ts::XAxisRenderer::tick label color",
        ],
      },
      description: {
        type: "string",
        description: "Brief description of what this test verifies (for audit trail)",
      },
    },
    required: ["test_identifier"],
  },
}
```

### Tool Implementation

```typescript
async function registerTddRedTest(input: RegisterTddRedTestInput): Promise<ToolResult> {
  const currentTask = await getCurrentTask();
  
  if (!currentTask) {
    throw new Error("No current task. Use get_current_task first.");
  }
  
  if (!currentTask.tdd_red_phase) {
    throw new Error(
      `Task ${currentTask.task_id} is not a TDD red-phase task. ` +
      `Only red-phase tasks can register tdd-red tests.`
    );
  }
  
  // Check for duplicate
  const existing = await db.select()
    .from(tddRedRegistry)
    .where(and(
      eq(tddRedRegistry.sprint_id, currentTask.sprint_id),
      eq(tddRedRegistry.test_identifier, input.test_identifier),
    ))
    .limit(1);
  
  if (existing.length > 0) {
    return {
      status: "already_registered",
      message: `Test "${input.test_identifier}" is already registered by task ${existing[0].red_task_id}`,
    };
  }
  
  // Create registry entry
  await db.insert(tddRedRegistry).values({
    sprint_id: currentTask.sprint_id,
    red_task_id: currentTask.task_id,
    test_identifier: input.test_identifier,
    description: input.description,
    status: 'REGISTERED',
    created_at: new Date().toISOString(),
  });
  
  return {
    status: "registered",
    message: `Registered test "${input.test_identifier}" for TDD red-phase tracking.`,
    next_steps: [
      "Ensure the test has a tdd-red marker (@Tags(['tdd-red']) or in test/tdd-red/ folder)",
      "Ensure the test is FAILING (tests non-existent functionality)",
      "Signal completion when all tests are registered and marked",
    ],
  };
}
```

### Usage in Handover

The handover for TDD red-phase tasks includes:

```markdown
## TDD Red-Phase Task

This task creates failing tests that will be implemented by a later green-phase task.

**For EACH test you create:**
1. Add the tdd-red marker (see patterns below)
2. Call `register_tdd_red_test` with the test identifier
3. Verify the test FAILS (it should—you're testing unimplemented functionality)

**Pre-signal validation will check:**
- All registered tests have tdd-red markers
- All tdd-red markers are registered
- All registered tests are failing

**Example:**
```
register_tdd_red_test({
  test_identifier: "test/unit/axis_test.dart::InternalAxisConfig::color should be 0xFF666666",
  description: "Verifies X-axis label color matches design spec"
})
```
```

---

## Pre-Signal Validation for Red Tasks

When an implementor signals completion on a `tdd_red_phase` task, the system performs bidirectional validation.

### Validation Logic

```typescript
async function validateTddRedTask(taskId: number): Promise<ValidationResult> {
  const task = await getTask(taskId);
  
  if (!task.tdd_red_phase) {
    return { valid: true };  // Not a red-phase task, skip
  }
  
  // 1. Get what implementor registered
  const registered = await db.select()
    .from(tddRedRegistry)
    .where(and(
      eq(tddRedRegistry.red_task_id, taskId),
      eq(tddRedRegistry.status, 'REGISTERED'),
    ));
  
  if (registered.length === 0) {
    return {
      valid: false,
      errors: [
        "No tests registered for this TDD red-phase task.",
        "Use register_tdd_red_test to register each test you created.",
      ],
    };
  }
  
  // 2. Scan workspace for all tdd-red markers
  const marked = await scanForTddRedMarkers(workspacePath);
  
  const errors: string[] = [];
  
  // 3. Check: All marked tests must be registered
  for (const test of marked) {
    const isRegistered = registered.find(r => r.test_identifier === test.identifier);
    if (!isRegistered) {
      errors.push(
        `Test "${test.identifier}" has tdd-red marker but is NOT registered. ` +
        `Call register_tdd_red_test({ test_identifier: "${test.identifier}" })`
      );
    }
  }
  
  // 4. Check: All registered tests must have markers
  for (const reg of registered) {
    const hasMarker = marked.find(m => m.identifier === reg.test_identifier);
    if (!hasMarker) {
      errors.push(
        `Registered test "${reg.test_identifier}" has no tdd-red marker. ` +
        `Either add @Tags(['tdd-red']) or move to test/tdd-red/ folder.`
      );
    }
  }
  
  // 5. Check: All registered tests must be FAILING
  for (const reg of registered) {
    const result = await runSingleTest(reg.test_identifier);
    if (result.passed) {
      errors.push(
        `Registered test "${reg.test_identifier}" is PASSING. ` +
        `Red-phase tests should FAIL until the green-phase task implements the feature.`
      );
    }
  }
  
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  // 6. Update status to VALIDATED and record marker_type
  for (const reg of registered) {
    const marker = marked.find(m => m.identifier === reg.test_identifier);
    await db.update(tddRedRegistry)
      .set({
        status: 'VALIDATED',
        marker_type: marker?.markerType,
        validated_at: new Date().toISOString(),
      })
      .where(eq(tddRedRegistry.id, reg.id));
  }
  
  return {
    valid: true,
    tests_validated: registered.length,
    message: `Validated ${registered.length} TDD red-phase tests. Ready for orchestrator review.`,
  };
}
```

### Error Examples

```
❌ Pre-signal validation failed for TDD red-phase task 10:

  1. Test "test/unit/axis_test.dart::font size" has tdd-red marker but is NOT registered.
     → Call register_tdd_red_test({ test_identifier: "test/unit/axis_test.dart::font size" })

  2. Registered test "test/unit/axis_test.dart::color" has no tdd-red marker.
     → Either add @Tags(['tdd-red']) or move to test/tdd-red/ folder.

  3. Registered test "test/unit/axis_test.dart::padding" is PASSING.
     → Red-phase tests should FAIL until the green-phase task implements the feature.

Fix these issues and signal completion again.
```

---

## Orchestrator Completion for Red Tasks

After the implementor signals and pre-signal validation passes, the orchestrator completes the task.

```typescript
async function completeTask(taskId: number, input: CompleteTaskInput) {
  const task = await getTask(taskId);
  
  if (!task.tdd_red_phase) {
    return normalCompletion(task);
  }
  
  // === STEP 1: Determine green task ===
  
  // Check for upfront relationship (from configure_sprint)
  const relationship = await db.select()
    .from(tddTaskRelationships)
    .where(eq(tddTaskRelationships.red_task_id, task.id))
    .limit(1);
  
  let greenTaskId: number;
  
  if (relationship.length > 0) {
    // Use upfront declaration
    greenTaskId = relationship[0].green_task_id;
    console.log(`[TDD] Using pre-declared green task ${greenTaskId} for red task ${taskId}`);
    
  } else if (input.green_task_id) {
    // Use provided value
    greenTaskId = input.green_task_id;
    
    // Validate green task exists in same sprint
    const greenTask = await getTask(greenTaskId);
    if (!greenTask || greenTask.sprint_id !== task.sprint_id) {
      throw new Error(`Green task ${greenTaskId} not found in sprint`);
    }
    
    // Create relationship for audit trail
    await db.insert(tddTaskRelationships).values({
      sprint_id: task.sprint_id,
      red_task_id: task.id,
      green_task_id: greenTaskId,
      declared_at: 'complete_task',
      created_at: now,
    });
    console.log(`[TDD] Assigned green task ${greenTaskId} for red task ${taskId} (at completion)`);
    
  } else {
    // === BLOCK: No green task declared ===
    throw new Error(
      `Cannot complete TDD red-phase task ${taskId}: No green task assigned.\n\n` +
      `Resolution options:\n` +
      `1. Re-run with green_task_id parameter:\n` +
      `   complete_task({ task_id: ${taskId}, green_task_id: <task_id> })\n\n` +
      `2. Add task relationship in sprint config:\n` +
      `   Task ${taskId} should have a green task with tdd_green_for_tasks: [${taskId}]\n\n` +
      `This block prevents orphaned red-phase tests that would never be greened.`
    );
  }
  
  // === STEP 2: Update registry entries with green task ===
  
  // Get all VALIDATED entries for this task (registered by implementor, validated at pre-signal)
  const registeredTests = await db.select()
    .from(tddRedRegistry)
    .where(and(
      eq(tddRedRegistry.red_task_id, task.id),
      eq(tddRedRegistry.status, 'VALIDATED'),
    ));
  
  if (registeredTests.length === 0) {
    console.warn(`[TDD] Warning: Red task ${taskId} has no validated tests in registry`);
    // This shouldn't happen if pre-signal validation passed
  }
  
  // Assign green task to all validated entries
  await db.update(tddRedRegistry)
    .set({
      green_task_id: greenTaskId,
      assigned_at: new Date().toISOString(),
      status: 'PENDING_GREEN',
    })
    .where(and(
      eq(tddRedRegistry.red_task_id, task.id),
      eq(tddRedRegistry.status, 'VALIDATED'),
    ));
  
  console.log(`[TDD] Assigned ${registeredTests.length} tests to green task ${greenTaskId}`);
  
  // === STEP 3: Complete the task ===
  await markTaskComplete(task);
}
```

### 2. Green Task Completion (`complete_task` for task with registry assignments)

When completing a task that has `tdd_red_registry` entries assigned to it:

```typescript
async function completeGreenTask(taskId: number) {
  const task = await getTask(taskId);
  
  // Get all registry entries assigned to this task
  const assignments = await db.select()
    .from(tddRedRegistry)
    .where(and(
      eq(tddRedRegistry.green_task_id, task.id),
      eq(tddRedRegistry.status, 'PENDING_GREEN'),
    ));
  
  if (assignments.length === 0) {
    // Not a green-phase task or already completed
    return normalCompletion(task);
  }
  
  console.log(`[TDD] Verifying ${assignments.length} green-phase tests for task ${taskId}`);
  
  const failures: string[] = [];
  
  for (const entry of assignments) {
    // Verify test passes (without tdd-red exclusion)
    const testPasses = await verifyTestPasses(entry.test_identifier);
    
    // Verify marker removed
    const markerRemoved = await verifyMarkerRemoved(entry.test_identifier, entry.marker_type);
    
    if (!testPasses) {
      failures.push(`Test "${entry.test_identifier}" still failing`);
    }
    if (!markerRemoved) {
      failures.push(`Test "${entry.test_identifier}" still has tdd-red marker`);
    }
    
    if (testPasses && markerRemoved) {
      // Update registry to GREEN
      await db.update(tddRedRegistry)
        .set({
          greened_at: now,
          status: 'GREEN',
        })
        .where(eq(tddRedRegistry.id, entry.id));
    }
  }
  
  if (failures.length > 0) {
    throw new Error(
      `TDD green-phase verification failed for task ${taskId}:\n` +
      failures.map(f => `  - ${f}`).join('\n')
    );
  }
  
  console.log(`[TDD] All ${assignments.length} tests verified GREEN`);
  await markTaskComplete(task);
}
```

### 3. Sprint Closeout Gate

Before sprint can be marked COMPLETE:

```typescript
async function validateSprintCloseout(sprintId: number): Promise<ValidationResult> {
  const pendingEntries = await db.select()
    .from(tddRedRegistry)
    .where(and(
      eq(tddRedRegistry.sprint_id, sprintId),
      eq(tddRedRegistry.status, 'PENDING_GREEN'),
    ));
  
  if (pendingEntries.length > 0) {
    // Group by green task for actionable output
    const byGreenTask = groupBy(pendingEntries, 'green_task_id');
    
    return {
      valid: false,
      error: `Sprint has ${pendingEntries.length} tests still PENDING_GREEN`,
      details: Object.entries(byGreenTask).map(([taskId, entries]) => ({
        green_task_id: parseInt(taskId),
        pending_tests: entries.map(e => e.test_identifier),
      })),
      guidance: 'Complete the assigned green tasks to resolve these tests',
    };
  }
  
  return { valid: true };
}
```

### 4. Phase Boundary Gate (Optional, Recommended)

At end of each phase, ensure all red tasks have completed and registered their tests:

```typescript
async function validatePhaseCompletion(sprintId: number, phaseId: string): Promise<ValidationResult> {
  // Check for any red tasks in this phase that haven't completed
  const incompletRedTasks = await db.select()
    .from(tasks)
    .where(and(
      eq(tasks.sprint_id, sprintId),
      eq(tasks.phase_id, phaseId),
      eq(tasks.tdd_red_phase, true),
      ne(tasks.status, 'COMPLETE'),
    ));
  
  if (incompletRedTasks.length > 0) {
    return {
      valid: false,
      error: `Phase ${phaseId} has ${incompletRedTasks.length} incomplete TDD red tasks`,
      tasks: incompletRedTasks.map(t => t.task_id),
    };
  }
  
  return { valid: true };
}
```

---

## Orchestrator Visibility

### New Tool: `get_tdd_status`

Returns the current state of the TDD red-green registry:

```typescript
// Output
{
  sprint_id: "sprint-015",
  summary: {
    total: 5,
    red: 2,
    pending_green: 1,
    green: 2,
    orphaned: 0,
  },
  entries: [
    {
      id: 1,
      test_identifier: "test/unit/axis_test.dart::font size should be 11px",
      status: "RED",
      red_task_id: 10,
      green_task_id: null,
      warning: "No green-phase task assigned",
    },
    // ...
  ],
  warnings: [
    "2 tdd-red tests without assigned green-phase tasks",
  ],
  blocks_closeout: true,
}
```

### Visual Representation

```
TDD Red-Green Status for Sprint 015
════════════════════════════════════════════════════════════════════

Status: ⚠️ 2 ORPHANED REDS - Sprint closeout BLOCKED

┌────┬────────────────────────────────────┬─────────────────┬─────────────────┐
│ ID │ Test                               │ Status          │ Green Task      │
├────┼────────────────────────────────────┼─────────────────┼─────────────────┤
│ 1  │ axis_test.dart::font size 11px     │ 🔴 RED          │ ⚠️ Not assigned │
│ 2  │ axis_test.dart::color 0xFF666666   │ 🔴 RED          │ ⚠️ Not assigned │
│ 3  │ axis_test.dart::padding 4px        │ 🟡 PENDING      │ T017            │
│ 4  │ renderer_test.dart::cascade        │ 🟢 GREEN        │ T015 ✓          │
│ 5  │ config_test.dart::factory          │ 🟢 GREEN        │ T017 ✓          │
└────┴────────────────────────────────────┴─────────────────┴─────────────────┘

Actions Required:
  • Assign green-phase task for entry #1 (font size test)
  • Assign green-phase task for entry #2 (color test)
```

---

## Cleanup Behavior Change

### Remove Automatic Cleanup

The current automatic cleanup in `prepare_task` is **removed**. Markers stay in place until:

1. Implementor explicitly removes them during green-phase implementation
2. Orchestrator's `complete_task` verification confirms removal

### Implementor Responsibility

The handover for green-phase tasks includes explicit instructions:

```markdown
## TDD Green Phase Requirements

This task greens the following red-phase tests:

| Test | File | Current Marker |
|------|------|----------------|
| font size should be 11px | test/unit/axis_test.dart | @Tags(['tdd-red']) |
| color should be 0xFF666666 | test/unit/axis_test.dart | @Tags(['tdd-red']) |

**You MUST:**
1. Implement the feature to make these tests pass
2. Remove the `@Tags(['tdd-red'])` annotation from each test
3. Verify tests pass WITHOUT the tag exclusion: `flutter test test/unit/axis_test.dart`

**Verification will fail if:**
- Tests still fail
- tdd-red markers still present
```

---

## Resolved Decisions

### Q1: Granularity - Track Files or Individual Tests?

**Decision: Option B - Individual Tests** ✅

```
test_identifier = "{file_path}::{group_hierarchy}::{test_name}"

# Examples:
test/unit/axis_test.dart::InternalAxisConfig defaults::color should be 0xFF666666
test/tdd-red/feature.test.ts::XAxisRenderer::tick label color
```

**Rationale**:
- Precise tracking prevents "9 of 10 greened but still blocked" scenarios
- Clear visibility into exactly which test is still red
- Flexible assignment (different green tasks for different tests in same file)

---

## Implementor Test Structure Requirements

> **CRITICAL**: Implementors MUST follow these patterns exactly for TDD red-phase tests to be correctly registered and tracked.

### Dart/Flutter Test Structure

#### Option 1: Inline Tag (Preferred for Individual Tests)

```dart
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('InternalAxisConfig defaults', () {
    test(
      'color should be 0xFF666666',
      () {
        const config = InternalAxisConfig(
          orientation: AxisOrientation.horizontal,
          position: AxisPosition.bottom,
        );
        expect(config.tickLabelStyle.color, equals(const Color(0xFF666666)));
      },
      tags: 'tdd-red',  // ← REQUIRED: Inline tag for this specific test
    );

    test(
      'font size should be 11px',
      () {
        const config = InternalAxisConfig(
          orientation: AxisOrientation.horizontal,
          position: AxisPosition.bottom,
        );
        expect(config.tickLabelStyle.fontSize, equals(11.0));
      },
      tags: 'tdd-red',  // ← Each red test needs its own tag
    );
  });
}
```

**Registry entries created**:
```
test/unit/axis_test.dart::InternalAxisConfig defaults::color should be 0xFF666666
test/unit/axis_test.dart::InternalAxisConfig defaults::font size should be 11px
```

#### Option 2: Library-Level Tag (When ALL Tests in File Are Red)

```dart
@Tags(['tdd-red'])  // ← Applies to ALL tests in this file
library;

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('XAxisRenderer', () {
    test('resolves tick label style with cascade', () { ... });
    test('uses default color when not specified', () { ... });
  });
}
```

**Registry entries created**:
```
test/unit/x_axis_renderer_test.dart::XAxisRenderer::resolves tick label style with cascade
test/unit/x_axis_renderer_test.dart::XAxisRenderer::uses default color when not specified
```

#### Identifier Format (Dart)

```
{file_path}::{group_name}::{test_name}
{file_path}::{group_name}::{nested_group}::{test_name}
{file_path}::{test_name}  (if no group)
```

---

### TypeScript Test Structure

#### Option 1: Directory-Based (All Tests in Directory Are Red)

Place test file in `test/tdd-red/` directory:

```
test/
├── tdd-red/                          # ← Red-phase tests go here
│   └── x-axis-color.test.ts
└── unit/                             # ← Normal tests
    └── other.test.ts
```

```typescript
// test/tdd-red/x-axis-color.test.ts
import { describe, it, expect } from 'vitest';

describe('XAxisRenderer', () => {
  it('uses Color(0xFF666666) for tick labels', () => {
    // Test implementation
    expect(actualColor).toBe(expectedColor);
  });
});
```

**Registry entries created**:
```
test/tdd-red/x-axis-color.test.ts::XAxisRenderer::uses Color(0xFF666666) for tick labels
```

#### Option 2: Name-Based Tag (Individual Tests)

```typescript
// test/unit/axis.test.ts
import { describe, it, expect } from 'vitest';

describe('XAxisRenderer', () => {
  it('[tdd-red] color should be 0xFF666666', () => {  // ← Tag in test name
    expect(actualColor).toBe(expectedColor);
  });

  it('[tdd-red] font size should be 11px', () => {    // ← Tag in test name
    expect(actualFontSize).toBe(11);
  });

  it('padding should be 4px', () => {                  // ← Normal test (no tag)
    expect(actualPadding).toBe(4);
  });
});
```

**Registry entries created**:
```
test/unit/axis.test.ts::XAxisRenderer::[tdd-red] color should be 0xFF666666
test/unit/axis.test.ts::XAxisRenderer::[tdd-red] font size should be 11px
```

#### Identifier Format (TypeScript)

```
{file_path}::{describe_name}::{it_name}
{file_path}::{describe_name}::{nested_describe}::{it_name}
{file_path}::{it_name}  (if no describe)
```

---

### Green-Phase: Removing Markers

When implementing the green phase, the implementor MUST:

#### Dart
```dart
// BEFORE (red phase)
test('color should be 0xFF666666', () { ... }, tags: 'tdd-red');

// AFTER (green phase - remove the tags parameter)
test('color should be 0xFF666666', () { ... });
```

#### TypeScript (Directory-Based)
```bash
# Move file from tdd-red to unit
mv test/tdd-red/x-axis-color.test.ts test/unit/x-axis-color.test.ts
```

#### TypeScript (Name-Based)
```typescript
// BEFORE (red phase)
it('[tdd-red] color should be 0xFF666666', () => { ... });

// AFTER (green phase - remove [tdd-red] from name)
it('color should be 0xFF666666', () => { ... });
```

---

### Verification Commands

Implementors should verify their work before signaling:

#### Dart
```bash
# Run ONLY red-phase tests (should FAIL during red phase)
flutter test --tags tdd-red

# Run non-red tests (should PASS - no regressions)
flutter test --exclude-tags tdd-red

# After green phase: run ALL tests (should PASS)
flutter test
```

#### TypeScript
```bash
# Run red-phase tests (should FAIL during red phase)
npm test -- test/tdd-red

# Run non-red tests (should PASS - no regressions)
npm test -- --exclude="**/tdd-red/**"

# After green phase: run ALL tests (should PASS)
npm test
```

---

## Open Questions

> **Status**: Q1 ✅ | Q2 ✅ | Q3 ✅ | Q4 ✅ | Q5 ✅

---

### Q2: 1:M Red-to-Green - Can One Green Task Service Multiple Reds?

**Option A: 1:1 Only**
- Each red test requires its own green task
- More granular tracking
- More tasks in sprint

**Option B: M:1 Allowed**
- One green task can claim multiple red tests via `tdd_green_for: [1, 2, 3]`
- Consolidation pattern (implement related features together)
- Fewer tasks, but each is larger

**Decision: Option B - M:1 Allowed** ✅

**Rationale**:
- Matches real TDD workflow (implement feature → multiple related tests pass)
- Reduces sprint task count without losing tracking precision
- Forces complete implementation (partial completion blocks the task)

**Example**:
```
Red T010: Creates "color should be 0xFF666666"     ─┐
Red T011: Creates "font size should be 11px"       ─┼─→ Green T015 (greens all 3)
Red T012: Creates "padding should be 4px"          ─┘

// prepare_task for T015
{
  task_id: 15,
  tdd_green_for: [1, 2, 3],  // Registry IDs
  ...
}
```

---

### Q3: Green Task Assignment - When and How? ✅ RESOLVED

**Original Question**: "Orphan Handling - Block Immediately or Warn First?"

**Discussion Evolution**: The original question assumed orphans could exist and we'd decide when to block. But this was the wrong framing. The fundamental insight:

> **Tasks are immutable after sprint configuration.** If the orchestrator can't assign a green task NOW, they can never do it—nothing changes later. Therefore, blocking must happen when the relationship would need to be created, which is either at sprint configuration or at red task completion.

This shifts the model from "orphan detection and handling" to "assignment enforcement."

**Decision: Block at Red Task Completion if No Green Task Exists** ✅

The system enforces assignment at two possible points:

#### Point 1: Sprint Configuration (Optional, Recommended)

Orchestrator declares task relationships upfront:

```typescript
// In configure_sprint
{
  tasks: [
    { task_id: 10, tdd_red_phase: true, title: "Create color test" },
    { task_id: 15, tdd_green_for_tasks: [10], title: "Implement colors" },
  ]
}
```

This creates entries in `tdd_task_relationships` table. When Task 10 completes later, the green task is auto-assigned from this relationship.

#### Point 2: Red Task Completion (Required if no upfront declaration)

If no relationship exists when the red task completes, the orchestrator MUST provide `green_task_id`:

```typescript
// In complete_task for tdd_red_phase task
{
  task_id: 10,
  green_task_id: 15,  // REQUIRED: Which task will green this?
}
```

If neither relationship exists AND `green_task_id` is not provided, **the completion is blocked**:

```
Error: Cannot complete TDD red-phase task 10: No green task assigned.

Resolution options:
1. Re-run with green_task_id parameter:
   complete_task({ task_id: 10, green_task_id: <task_id> })

2. Add task relationship in sprint config:
   Task 10 should have a green task with tdd_green_for_tasks: [10]

This block prevents orphaned red-phase tests that would never be greened.
```

**Rationale**:
- Eliminates the "orphan" state entirely—tests are PENDING_GREEN from creation
- Forces orchestrator to plan ahead without being overly rigid
- Two options (upfront or at-completion) provide flexibility for different workflows
- Blocking at red task completion is early enough to course-correct
- Task immutability after config means deferred assignment is impossible

**Implementation Impact**:
- Added `tdd_task_relationships` table for upfront declarations
- Changed `tdd_red_registry.green_task_id` to NOT NULL
- Changed default status to `PENDING_GREEN` (no `RED` state in registry)
- Added `green_task_id` parameter to `complete_task` schema
- Removed `ORPHANED` status (state cannot occur with this model)

---

### Q4: Registry Population - Automatic or Manual? ✅ RESOLVED

**Option A: Automatic Scan**
- At red-task completion, scan for tdd-red markers
- Automatically register what's found
- Risk: Might miss tests or catch unintended files, silent failures

**Option B: Manual Declaration (Orchestrator)**
- Orchestrator declares in `prepare_task`: "This task creates tests X, Y, Z"
- More work for orchestrator who doesn't have context

**Option C: Hybrid**
- Automatic scan at completion with orchestrator review
- Adds an extra step

**Option D: Implementor Registration with Validation Scan** ✅ CHOSEN
- Implementor registers tests via `register_tdd_red_test` tool as they create them
- Pre-signal validation SCANS and CROSS-CHECKS:
  - All marked tests must be registered
  - All registered tests must have markers
  - All registered tests must be failing
- Blocks signal if any discrepancy

**Decision: Option D - Implementor Registration with Validation Scan** ✅

**Rationale**:
- Implementor has full context—they KNOW what tests they created
- Registration is explicit, not guessed
- Scan is for VALIDATION, not discovery
- Pre-signal enforcement catches discrepancies before they become problems
- Bidirectional check catches both unregistered markers AND registered non-markers
- Clear, actionable error messages: "Test X has tdd-red marker but is NOT registered"

**Key Insight**: The implementor creates the tests, so they should register them. The system validates consistency, not discovers content.

---

### Q5: Cross-Sprint Reds - What If Sprint Ends with Pending Reds? ✅ RESOLVED

**Option A: Block Sprint Completion** ✅ CHOSEN
- Sprint cannot complete with ANY non-GREEN entries
- Forces all reds to be greened within same sprint
- Most strict, safest

**Option B: Allow Carryover with Warning**
- Reds can carry to next sprint
- Next sprint inherits registry entries
- Risk: Perpetual orphans

**Option C: Force Escalation**
- Sprint cannot complete, forces human intervention
- Must either complete green tasks or explicitly abandon
- Provides escape hatch for exceptional circumstances

**Decision: Option A - Block Sprint Completion** ✅

**Rationale**:
- Sprint 015 failure was fundamentally "tests never greened and we didn't know"
- With blocking, that failure mode becomes **impossible**
- Forces completion discipline: if you create red tests, you MUST green them
- No technical debt accumulation across sprints
- Clear, simple rule: all registry entries must be GREEN before sprint closes

**Implementation**:
```typescript
async function validateSprintCloseout(sprintId: number): Promise<ValidationResult> {
  const pendingEntries = await db.select()
    .from(tddRedRegistry)
    .where(and(
      eq(tddRedRegistry.sprint_id, sprintId),
      ne(tddRedRegistry.status, 'GREEN'),
    ));
  
  if (pendingEntries.length > 0) {
    const byStatus = groupBy(pendingEntries, 'status');
    const byGreenTask = groupBy(
      pendingEntries.filter(e => e.status === 'PENDING_GREEN'),
      'green_task_id'
    );
    
    return {
      valid: false,
      error: `Sprint cannot complete: ${pendingEntries.length} TDD tests not GREEN`,
      details: {
        registered: byStatus['REGISTERED']?.length ?? 0,
        validated: byStatus['VALIDATED']?.length ?? 0,
        pending_green: byStatus['PENDING_GREEN']?.length ?? 0,
      },
      action_required: Object.entries(byGreenTask).map(([taskId, entries]) => ({
        message: `Complete green task ${taskId} to resolve ${entries.length} tests`,
        tests: entries.map(e => e.test_identifier),
      })),
    };
  }
  
  return { valid: true };
}
```

**Error Example**:
```
❌ Sprint closeout blocked: 3 TDD tests not GREEN

Status breakdown:
  - REGISTERED: 0 (not yet validated)
  - VALIDATED: 0 (red task not completed)  
  - PENDING_GREEN: 3 (awaiting green task)

Action required:
  • Complete green task 15 to resolve 3 tests:
    - test/unit/axis_test.dart::color should be 0xFF666666
    - test/unit/axis_test.dart::font size should be 11px
    - test/unit/axis_test.dart::padding should be 4px

Sprint cannot close until all tests reach GREEN status.
```

**Future Enhancement** (not in initial implementation):
- Option C (Force Escalation) could be added later for exceptional circumstances
- Would require explicit human supervisor approval to abandon tests
- Creates audit trail of intentionally unresolved tests

---

## Implementation Phases

### Phase 1: Database & Core Model
- [ ] Create `tdd_task_relationships` table (for upfront declarations)
- [ ] Create `tdd_red_registry` table (with new schema: REGISTERED → VALIDATED → PENDING_GREEN → GREEN)
- [ ] Add migrations for both tables
- [ ] Define TypeScript types
- [ ] Create registry and relationship CRUD functions

### Phase 2: Implementor Tool
- [ ] Create `register_tdd_red_test` MCP tool (implementor-only)
- [ ] Add to implementor tool list in `src/mcp-server/tools.ts`
- [ ] Implement handler in `src/mcp-server/handlers/`
- [ ] Update implementor handover template with registration instructions

### Phase 3: Pre-Signal Validation
- [ ] Add `scanForTddRedMarkers()` function per language (Dart, TypeScript)
- [ ] Implement bidirectional cross-check (registered ↔ marked)
- [ ] Implement test failure verification for red-phase tests
- [ ] Integrate with pre-signal executor for tdd_red_phase tasks
- [ ] Update VALIDATED status on successful validation

### Phase 4: Sprint Configuration Integration
- [ ] Add `tdd_green_for_tasks` to task schema in `configure_sprint`
- [ ] Create relationship entries when configured
- [ ] Validate that referenced tasks exist and have `tdd_red_phase: true`

### Phase 5: Red Task Completion (Orchestrator)
- [ ] Add `green_task_id` optional parameter to `complete_task` schema
- [ ] Modify `complete_task` to check for relationship OR provided green_task_id
- [ ] Implement blocking when neither exists
- [ ] Update VALIDATED entries to PENDING_GREEN with assigned green task

### Phase 6: Green-Phase Integration
- [ ] Modify `complete_task` to detect assigned PENDING_GREEN registry entries
- [ ] Implement `verifyTestPasses()` function
- [ ] Implement `verifyMarkerRemoved()` function
- [ ] Update registry entries to GREEN status on verification

### Phase 7: Gates & Visibility
- [ ] Implement sprint closeout validation (block on PENDING_GREEN)
- [ ] Create `get_tdd_status` tool for orchestrator visibility
- [ ] Add TDD status to sprint progress output
- [ ] Add green-phase instructions to handover (from registry data)

### Phase 6: Remove Automatic Cleanup
- [ ] Remove `cleanupTddRedMarkers()` from `prepare_task`
- [ ] Update documentation
- [ ] Update agent instructions

---

## Success Criteria

1. **No Orphaned Reds**: Sprint cannot complete with ungreened tests
2. **Explicit Tracking**: Every red test is registered and tracked
3. **Verified Transitions**: Green-phase completion verifies test passes
4. **Orchestrator Visibility**: Clear view of TDD red-green status
5. **Sprint 015 Prevention**: The failure mode that caused the sprint failure is impossible

---

## References

- [TD-020: TDD Red Phase Verification Support](../../technical-debt/TD-020-tdd-red-phase-verification.md)
- [TD-020 Addendum: Workflow Analysis](../../technical-debt/TD-020-addendum-workflow-analysis.md)
- [Post-Mortem: Sprint 015](../../docs/post-mortem.md)

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-01-14 | Orchestrator | Initial design draft |
| 0.2 | 2026-01-14 | Orchestrator | Resolved Q1 (individual tests), Q2 (M:1 allowed), Q3 (block at red completion). Added two-level data model with `tdd_task_relationships` table. Revised enforcement points. Removed ORPHANED state. |
| 0.3 | 2026-01-14 | Orchestrator | Resolved Q4 (implementor registration with validation scan). Added `register_tdd_red_test` implementor tool. Added pre-signal validation logic. Updated status states: REGISTERED → VALIDATED → PENDING_GREEN → GREEN. Revised implementation phases. |
| 0.4 | 2026-01-14 | Orchestrator | Resolved Q5 (block sprint completion). All open questions now resolved. Spec ready for implementation. |
