# TDD Scan-on-Signal Design Specification

**Status**: Draft v4  
**Date**: 2025-01-15  
**Context**: Sprint 003-tdd-red-green post-mortem finding

---

## Impact Summary

| Component | Change Type | Description |
|-----------|-------------|-------------|
| **MCP Tools** | | |
| `register_tdd_red_test` | DEPRECATE | Remove from Implementor role (scan-on-signal replaces) |
| `signal_completion` | MODIFY | Add `scanAndRegisterTests()` call for TDD tasks |
| `configure_sprint` | MODIFY | Validate every TDD-red task has linked green task |
| `complete_task` | MODIFY | Update `completed_at` on green phase completion |
| **Database** | | |
| `tdd_red_registry` | MODIFY | Drop columns: `status`, `green_task_id`, `description`, `marker_type`, timestamps |
| `tdd_task_relationships` | MODIFY | Add `completed_at` column |
| **Agent Instructions** | | |
| Implementor | MODIFY | Remove registration steps, update marker syntax |
| Orchestrator | MODIFY | Emphasize `tdd_relationships` is required |
| **New Code** | | |
| `src/core/tdd-scanner.ts` | CREATE | Language-specific test scanners |

---

## Purpose of TDD Registry

The TDD red-green workflow allows failing tests to exist without blocking CI:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ GOAL: Allow failing TDD-red tests without blocking normal CI           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Test Set A (Normal)              Test Set B (TDD-Red)                │
│   ─────────────────────            ────────────────────                │
│   • Must PASS                      • Must FAIL (red phase)             │
│   • Blocks CI if fails             • Must PASS (green phase)           │
│                                    • Tracked per-task in registry      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

The registry exists to:
1. **Separate** test runs at granular level (not just file level)
2. **Track** which tests belong to which tasks
3. **Enforce** eventual transition to green (prevent permanent "ignore" state)

## Registry Characteristics

The registry is **transitory and self-cleaning**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    REGISTRY IS TRANSITORY                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  SCAN BEHAVIOR (on every signal):                                      │
│  1. DELETE all entries for current task                                │
│  2. Scan for markers with current task ID                              │
│  3. INSERT only tests that STILL have the marker                       │
│                                                                         │
│  → Tests without markers don't get re-added                            │
│  → Self-cleaning through scan mechanism                                │
│  → No explicit cleanup needed                                          │
│                                                                         │
│  SPRINT COMPLETE INVARIANT:                                            │
│  ─────────────────────────────────────────────────────────────────     │
│  IF sprint is complete:                                                │
│    THEN tdd_red_registry MUST be empty                                 │
│                                                                         │
│  WHY: All TDD-red tests transitioned → markers removed → not scanned  │
│                                                                         │
│  IF registry NOT empty at sprint close:                                │
│    THEN some tests never transitioned → Sprint INCOMPLETE              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Self-Correcting Enforcement

The system is self-correcting through test runner enforcement:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SELF-CORRECTING MECHANISM                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Normal Run (a): All non-tdd-red tests MUST PASS                       │
│  ───────────────────────────────────────────────────────────────────   │
│  • Unmarked failing test → Run fails → Implementor must mark it        │
│                                                                         │
│  TDD-Red Run (b): All tdd-red tests MUST FAIL                          │
│  ───────────────────────────────────────────────────────────────────   │
│  • Marked passing test → Run fails → Implementor must remove marker    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key Insight**: Enforcement comes from the **test runners**, not the registry. 
The registry is only for **tracking transition**.

## Problem Statement

The current TDD red-green workflow requires the Implementor to manually register tests using `register_tdd_red_test`. This creates several problems:

1. **Format Inconsistencies**: Implementor-provided identifiers may not match scanner format
2. **Logical Duplicates**: Same test registered multiple times with different identifier formats
3. **Stale Registrations**: Test file changes don't invalidate outdated registrations
4. **Misallocated Responsibility**: Registry management is not the Implementor's core job

### Real-World Example

During testing on `braven_chart_plus`, the Implementor registered tests twice:
- First batch (IDs 61-79): `test/unit/rendering/x_axis_painter_test.dart::XAxisPainter construction::...`
- Second batch (IDs 80-98): `x_axis_painter_test.dart::XAxisPainter::construction::...`

Both passed duplicate checks (exact string match) but represent the same logical tests. Validation failed because the scanner produced a third format that matched neither.

## Solution: Scan-on-Signal

**Core Principle**: The scanner is the single source of truth for test identity.

### Simplified Architecture

| Concern | Responsibility |
|---------|----------------|
| **Test separation** | Language-native markers (see Decision 4) |
| **Enforcement** | Test runner: (a) must pass, (b) must fail |
| **Transition tracking** | Registry (which tests need to go green) |
| **Task linkage** | Task-level relationship (green task → red task) |

### Workflow Change

```
CURRENT (Manual Registration):
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Implementor writes tests with markers                           │
│ 2. Implementor calls register_tdd_red_test (error-prone)           │
│ 3. Implementor signals completion                                  │
│ 4. Validation compares registration vs scan (format mismatch)      │
└─────────────────────────────────────────────────────────────────────┘

PROPOSED (Scan-on-Signal):
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Implementor writes tests with language-native TDD markers       │
│ 2. Implementor signals completion                                  │
│ 3. System scans for :task-N markers and auto-registers             │
│ 4. System verifies all found tests fail (red) or pass (green)      │
└─────────────────────────────────────────────────────────────────────┘
```

### Implementor Instructions

The system provides clear guidance via signal failure messages:

1. **TDD-red tests must be marked** using language-native syntax (see Decision 4)
2. **Passing TDD-red tests (green)** must have marker removed
3. **Scanner automatically tracks** marked tests for transition enforcement

## Design Decisions

### 1. Task ID in Markers (REQUIRED)

**Decision**: Markers MUST include task ID using language-native syntax.

**Dart** - uses `tags` parameter:
```dart
test('should construct with defaults', () { ... }, tags: ['tdd-red', 'task-3']);

// Or at file level
@Tags(['tdd-red', 'task-3'])
void main() {
  test('all tests in file inherit tags', () { ... });
}
```

**TypeScript/Vitest** - uses test name prefix:
```typescript
test('[tdd-red:task-3] should construct with defaults', () => { ... });

describe('[tdd-red:task-3] Widget initialization', () => {
  test('all tests in describe inherit marker', () => { ... });
});
```

**Rationale**:
- One test file can have tests for multiple tasks
- Registry must correlate test → task for enforcement
- Green phase verification needs to know which red task's tests to check

---

### 2. Clearing Scope

**Decision**: Clear all registrations for the **current task only** before inserting new scan results.

```sql
-- Before inserting new scan results
DELETE FROM tdd_red_registry WHERE red_task_id = :current_task_id;
-- Then insert fresh scan results
INSERT INTO tdd_red_registry (red_task_id, test_identifier, ...) VALUES ...;
```

**Rationale**:
- Each task's registrations are independent
- Re-signaling for same task replaces stale registrations
- Other tasks are unaffected
- Handles all change scenarios: files added/deleted, tests added/removed, markers changed

---

### 3. Task Linkage via Existing Table (RESOLVED)

**Decision**: Red→Green task linkage stored in the existing `tdd_task_relationships` table, with a new `completed_at` column.

```
┌─────────────────────────────────────────────────────────────────┐
│ tdd_task_relationships (EXISTING + MODIFY)                      │
│ ├── id                                                          │
│ ├── red_task_id      ← Task that creates failing tests         │
│ ├── green_task_id    ← Task that makes them pass               │
│ ├── created_at       ← When link was created (sprint config)   │
│ └── completed_at     ← When green phase completed (nullable)   │
└─────────────────────────────────────────────────────────────────┘
         │
         │ red_task_id (1:M)
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ tdd_red_registry (TRANSITORY)                                   │
│ ├── id                                                          │
│ ├── red_task_id      ← FK to the red task                      │
│ ├── test_identifier  ← Canonical format                        │
│ ├── test_file        ← File path                               │
│ └── created_at                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Points**:
- `tdd_task_relationships` is PERSISTENT - survives rescans, provides audit trail
- `tdd_red_registry` is TRANSITORY - rebuilt on every scan, empty at sprint end
- No `status` column needed on registry (see Decision 11)
- No `green_task_id` on registry entries

**When Links Are Created**:
- At **sprint configuration** time (Orchestrator knows all tasks upfront)
- Orchestrator MUST create links for all TDD red tasks
- Missing links = invalid sprint configuration

**Green Verification Flow**:
1. Load link: `WHERE green_task_id = :current_task` → get `red_task_id`
2. Query registry: `WHERE red_task_id = :red_task_id`
3. Verify those tests now PASS
4. Update link: `completed_at = NOW()`

**Rationale**:
- Registry can be cleared and rebuilt without losing task relationships
- Linkage persists across rescans
- Orchestrator responsibility to maintain valid sprint structure

---

### 4. Language-Native Marker Syntax (RESOLVED)

**Decision**: Use language-native test framework features - no comments required.

| Language | Marker Syntax | Location | Granularity |
|----------|---------------|----------|-------------|
| **Dart** | `tags: ['tdd-red', 'task-N']` | `test()` parameter or `@Tags()` annotation | Test or file level |
| **TypeScript** | `[tdd-red:task-N]` prefix | Test/describe name string | Test or describe level |

**Dart Examples**:
```dart
// Test-level marker
test('should construct with defaults', () {
  expect(widget.value, equals(0));
}, tags: ['tdd-red', 'task-3']);

// File-level marker (all tests in file)
@Tags(['tdd-red', 'task-3'])
void main() {
  test('inherits file tags', () { ... });
  test('also inherits', () { ... });
}

// Mixed - file has base tags, test adds more
@Tags(['tdd-red'])
void main() {
  test('just tdd-red', () { ... });
  test('also task-5', () { ... }, tags: ['task-5']);
}
```

**TypeScript Examples**:
```typescript
// Test-level marker (in test name)
test('[tdd-red:task-3] should construct with defaults', () => {
  expect(widget.value).toBe(0);
});

// Describe-level marker (all nested tests inherit)
describe('[tdd-red:task-3] Widget initialization', () => {
  test('should have default values', () => { ... });
  test('should accept options', () => { ... });
});

// Mixed file
describe('Widget', () => {
  test('normal test', () => { ... });  // Not TDD-red
  
  test('[tdd-red:task-3] new feature test', () => { ... });  // TDD-red
});
```

**Test Runner Commands**:

| Language | Normal Run (exclude TDD-red) | TDD-Red Run (only TDD-red) |
|----------|------------------------------|----------------------------|
| **Dart** | `dart test --exclude-tags=tdd-red` | `dart test --tags=tdd-red` |
| **TypeScript** | `vitest --testNamePattern="^(?!.*\\[tdd-red\\])"` | `vitest --testNamePattern="\\[tdd-red\\]"` |

**Rationale**:
- Uses native test framework features - no custom infrastructure
- No separate comments needed - marker IS the test metadata
- Test-level granularity for both languages
- Self-correcting enforcement via test runner
- Scanner can parse native syntax reliably

---

### 5. Canonical Identifier Format

**Decision**: `<filename>::<test_hierarchy>`

| Component | Format | Example |
|-----------|--------|---------|
| `filename` | File name only (no path) | `x_axis_painter_test.dart` |
| `test_hierarchy` | Nested group/test names joined by `::` | `XAxisPainter::construction::should have default values` |

**Full Example**:
```
x_axis_painter_test.dart::XAxisPainter::construction::should have default values
```

**NOT Allowed**:
```
test/unit/rendering/x_axis_painter_test.dart::...  // NO path prefix
x_axis_painter_test.dart::XAxisPainter construction::...  // NO space-joined groups
```

**Rationale**:
- Path independence (test location can change)
- Consistent separator (always `::`)
- Scanner produces this format canonically

---

### 6. Scan Trigger

**Decision**: Automatic on `signal_completion` for TDD-enabled tasks.

**Logic**:
```typescript
if (task.tdd_red_phase === true && task.status === 'IMPLEMENT') {
  // Red phase: scan for :task-N markers, register, verify all FAIL
  const tests = await scanForTddMarkers(workspaceRoot, taskId);
  await clearAndRegisterTests(taskId, tests);
  await verifyAllTestsFail(tests);
}
```

**Rationale**:
- Implementor doesn't need to think about registry management
- Task configuration (`tdd_red_phase: true`) drives behavior
- No new tool or parameter needed

---

### 7. Zero Tests Found

**Decision**: Fail the signal with clear error message.

**Error Message**:
```
TDD red-phase task requires tests with @orchestra-tdd-red:task-3 markers.
Found 0 markers for this task in test files.

Expected: At least 1 test marked with // @orchestra-tdd-red:task-3
```

**Rationale**:
- TDD task without tests is invalid
- Early, clear feedback to Implementor

---

### 8. Green Phase Verification

**Decision**: Do NOT re-scan during green phase. Use red-phase registrations.

**Workflow**:
1. **Red phase**: Scan → Register → Verify all FAIL → Complete red task
2. **Green phase**: Load registrations from red task (via task linkage) → Verify all PASS → Update status

**Rationale**:
- Prevents "cheating" by deleting failing tests between phases
- Red registrations are the contract that green must fulfill
- Task-level linkage (`tdd_red_task_id`) persists across rescans

---

### 9. Marker Position

**Decision**: Marker must be immediately above the test (within N lines, ignoring blanks/comments).

```dart
// @orchestra-tdd-red:task-3
// This is an optional additional comment
test('should have default values', () {
  // test body
});
```

**Detection Rules**:
- Marker must appear within 3 non-empty lines before `test(` or `it(` or equivalent
- Blank lines and comment lines between marker and test are allowed
- Marker applies to the NEXT test declaration only

**Rationale**:
- Allows scanner to associate marker with specific test
- Clear visual indication of which test is marked
- Handles common formatting patterns

---

### 10. Post-Green Marker Removal

**Decision**: Implementor must remove marker after green verification passes.

**Workflow**:
```
RED PHASE:
1. Implementor writes tests with @orchestra-tdd-red:task-3
2. Signal completion
3. Scan for :task-3 markers → register in tdd_red_registry
4. Run (b) for task-3 tests → verify all FAIL
5. Complete red task

GREEN PHASE:
1. Load link WHERE green_task_id = 4 → get red_task_id = 3
2. Query registry WHERE red_task_id = 3
3. Run those tests → verify all PASS
4. Update link: completed_at = NOW()
5. Instruct implementor to remove markers
6. Complete green task

POST-GREEN (via self-cleaning):
1. Implementor removes markers from tests
2. Next scan for any task won't find those markers
3. Tests simply don't get re-added to registry
4. Registry entries disappear naturally
```

**Rationale**:
- Test becomes normal test (runs in Set A)
- No explicit cleanup needed - registry is self-cleaning
- Self-correcting: if marker not removed, Set B run will fail (passing test in must-fail set)

---

### 11. No Green Status on Registry (RESOLVED)

**Decision**: Registry entries have NO status column. The registry is transitory.

**Why No Status?**
```
┌─────────────────────────────────────────────────────────────────────────┐
│                    STATUS IS REDUNDANT                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  When a test transitions to green:                                     │
│  1. Test now passes (green phase verified)                             │
│  2. Implementor removes the tdd-red marker                             │
│  3. Next scan doesn't find marker                                      │
│  4. Entry is NOT re-added to registry                                  │
│  5. Entry simply disappears                                            │
│                                                                         │
│  → There is no "green_verified" status                                 │
│  → Tests don't stay in registry after transitioning                    │
│  → Registry is empty at sprint end                                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Registry Lifecycle**:
| Phase | Registry State |
|-------|----------------|
| Before red phase | Empty for this task |
| After red scan | Populated with marked tests |
| During green phase | Same entries (markers still present) |
| After green verification | Markers removed by implementor |
| Next scan | Tests without markers not found → not re-added |
| End of sprint | **Empty** (all tests transitioned) |

---

### 12. Orchestrator Responsibility for Task Links (RESOLVED)

**Decision**: Orchestrator MUST create red→green task links at sprint configuration.

```
SPRINT CONFIGURATION (Orchestrator):
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Create Task 3: "Write failing tests" (tdd_red_phase=true)           │
│ 2. Create Task 4: "Implement to make tests pass"                        │
│ 3. Create tdd_relationship: { red_task_id: 3, green_task_id: 4 }        │
│                                                                         │
│ VALIDATION (on every task completion):                                  │
│ ─────────────────────────────────────────────────────────────────────  │
│ "Are there any TDD-red tasks without a linked green task?"             │
│                                                                         │
│ IF YES → Sprint is INVALID, must be fixed                              │
│ IF NO  → Continue                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

**Rationale**:
- Orchestrator has full sprint knowledge upfront
- Links should be created at configuration, not discovered later
- Orphan TDD-red tasks (no green task) = invalid sprint

---

## Implementation Impact

### MCP Tools - Changes Required

#### Tools to Deprecate/Remove

| Tool | Current Role | Action | Reason |
|------|--------------|--------|--------|
| `register_tdd_red_test` | implementor | **DEPRECATE** → Remove from Implementor role | Replaced by automatic scan-on-signal |

**Migration**: 
- Keep tool code for 1 release cycle (marked deprecated)
- Remove from tools.ts role filtering first (Implementor can't call it)
- Eventually remove handler entirely

#### Tools to Modify

| Tool | Current Behavior | New Behavior |
|------|------------------|--------------|
| `signal_completion` | Validates registrations exist | **Add scan-on-signal**: scan markers, clear existing, insert fresh |
| `configure_sprint` | Accepts `tdd_relationships` array | **Validate**: Every TDD-red task must have a linked green task |
| `complete_task` | Creates relationship if not exists | Add `completed_at` update on green task completion |
| `get_sprint_status` | Reports TDD summary | Query `tdd_task_relationships` for red→green status |

#### Tool Schema Changes

**`signal_completion`** - No input changes, but internal behavior changes:
```typescript
// NEW: After pre-signal checks pass, before recording signal
if (task.tdd_red_phase) {
  await scanAndRegisterTests(task.id, workspaceRoot);
}
```

**`configure_sprint`** - Enhanced validation:
```typescript
// NEW: Validate TDD relationships at configuration
for (const task of tasks) {
  if (task.tdd_red_phase) {
    const hasGreenTask = tdd_relationships.some(r => r.red_task_id === task.task_id);
    if (!hasGreenTask) {
      throw new ValidationError(`TDD red task ${task.task_id} has no linked green task`);
    }
  }
}
```

### Database Changes

#### Tables to Modify

| Table | Current Schema | New Schema | Migration |
|-------|----------------|------------|-----------|
| `tdd_red_registry` | Has `status`, `green_task_id`, `description`, `marker_type`, many timestamp columns | Remove `status`, `green_task_id`, `description`, `marker_type`, `validated_at`, `assigned_at`, `greened_at`; Add `test_file` | Drop columns, add column |
| `tdd_task_relationships` | Has `declared_at` | Add `completed_at` column | Add column |

**`tdd_task_relationships`** already exists and is in use. We add `completed_at` column to track green phase completion.

**Updated `tdd_task_relationships` Schema**:
```sql
CREATE TABLE tdd_task_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  red_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  green_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  declared_at TEXT NOT NULL,           -- Keep existing: where relationship was declared
  created_at TEXT NOT NULL,
  completed_at TEXT                    -- NEW: NULL until green phase completes
);
```

**New `tdd_red_registry` Schema** (simplified):
```sql
CREATE TABLE tdd_red_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  red_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  test_identifier TEXT NOT NULL,
  test_file TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(sprint_id, test_identifier)  -- Prevent duplicates
);
-- No status column - registry is transitory
-- No green_task_id - relationship is in tdd_task_relationships
```

#### Schema File Changes

File: `src/db/schema.ts`
- Update `tddRedRegistry` table definition (remove columns)
- Rename `tddTaskRelationships` → `tddTaskLinks` (add `completed_at`)

File: `src/db/init.ts`
- Update CREATE TABLE statements
- Update indexes

File: `src/db/migrations.ts`
- Add migration to drop columns from `tdd_red_registry`
- Add migration to add `completed_at` column to `tdd_task_relationships`

### Agent Instructions - Changes Required

#### Implementor Agent (`extension/agents/orchestra.implementor.agent.md`)

**Remove**:
- All references to `register_tdd_red_test` tool
- The "Register each test" step (step 3) in TDD workflow
- The "Red Phase Errors" table (no longer relevant)

**Update**:
- "Mark tests with TDD markers" section with new syntax:
  - TypeScript: `[tdd-red:task-N]` in test name (not just `[tdd-red]`)
  - Dart: `tags: ['tdd-red', 'task-N']` (include task ID)
- Remove "Option 1: Place in test/tdd-red/ directory" (we use markers, not directories)

**Current (to remove)**:
```markdown
3. **Register each test** using `register_tdd_red_test`:

   ```json
   // Call: register_tdd_red_test
   {
     "task_id": 5,
     "test_identifier": "feature.test.ts::Feature::should validate user input",
     ...
   }
   ```
```

**New (simplified)**:
```markdown
3. **Signal completion** - The system automatically scans for markers and registers tests
```

#### Orchestrator Agent (`extension/agents/orchestra.orchestrator.agent.md`)

**Update**:
- TDD Task Pattern section to emphasize `tdd_relationships` is **required**
- Add validation note: every TDD-red task must have linked green task

**Current**:
```markdown
1. **Red phase** (Task 1): Implementor writes failing tests, registers them with `register_tdd_red_test`
```

**New**:
```markdown
1. **Red phase** (Task 1): Implementor writes failing tests with markers, system scans on signal
```

### New Components to Create

| Component | Location | Purpose |
|-----------|----------|---------|
| `scanAndRegisterTests()` | `src/core/tdd-scanner.ts` | Core scan function for all languages |
| `scanDartTests()` | `src/core/tdd-scanner.ts` | Dart-specific marker detection |
| `scanTypeScriptTests()` | `src/core/tdd-scanner.ts` | TypeScript-specific marker detection |
| `detectLanguage()` | `src/core/tdd-scanner.ts` | Language detection from file extension |

### Verification Check Changes

File: `src/mcp-server/handlers/prepare-task.ts`

**Current behavior** (TDD red phase):
- Injects checks that registered tests fail
- Checks for marker presence based on registration

**New behavior** (TDD red phase):
- Injects checks that tagged tests fail (based on markers, not registration)
- No need to validate "registrations match markers" - scanning is automatic

---

## Migration Path

### Phase 1: Database Schema Changes
1. Add `completed_at` column to `tdd_task_relationships` table
2. Add `test_file` column to `tdd_red_registry` table  
3. Drop columns from `tdd_red_registry`: `status`, `green_task_id`, `description`, `marker_type`, `validated_at`, `assigned_at`, `greened_at`
4. Update Drizzle schema definitions in `src/db/schema.ts`

### Phase 2: Implement Scanner
1. Create `src/core/tdd-scanner.ts` with language-specific scanners
2. Implement `scanDartTests()` - parse `tags:` and `@Tags()`
3. Implement `scanTypeScriptTests()` - parse `[tdd-red:task-N]` in names
4. Implement `scanAndRegisterTests()` - orchestrates scanning and DB updates

### Phase 3: Integrate Scan-on-Signal
1. Modify `signal_completion` handler to call `scanAndRegisterTests()` for TDD tasks
2. Scanner clears existing registrations for task before inserting fresh
3. Update pre-signal validation to not require pre-existing registrations

### Phase 4: Update Task Linkage Validation
1. Add validation in `configure_sprint`: every TDD-red task must have a `tdd_relationship`
2. Return error if orphan TDD-red tasks detected
3. Update `complete_task` green phase logic to use `completed_at` column

### Phase 5: Deprecate Manual Registration
1. Remove `register_tdd_red_test` from Implementor role in `tools.ts`
2. Update Implementor agent instructions (remove registration steps)
3. Update Orchestrator agent instructions (mention scan-on-signal)

### Phase 6: Cleanup (Future)
1. Remove `register_tdd_red_test` handler entirely (if unused after deprecation period)
2. Archive documentation about old manual registration flow

---

## Open Questions

### OQ-1: Dart Test Separation Mechanism (RESOLVED ✅)

**Decision**: Use native `tags` parameter on `test()` and `@Tags()` annotation.

```dart
// Test-level
test('name', () { ... }, tags: ['tdd-red', 'task-3']);

// File-level  
@Tags(['tdd-red', 'task-3'])
void main() { ... }
```

**Commands**:
- Normal run: `dart test --exclude-tags=tdd-red`
- TDD-red run: `dart test --tags=tdd-red`

**Scanner**: Parse `tags:` parameter values and `@Tags()` annotations.

---

### OQ-2: TypeScript Test Infrastructure (RESOLVED ✅)

**Decision**: Use `[tdd-red:task-N]` prefix in test/describe names.

```typescript
test('[tdd-red:task-3] should fail initially', () => { ... });

describe('[tdd-red:task-3] Feature group', () => { ... });
```

**Commands**:
- Normal run: `vitest --testNamePattern="^(?!.*\\[tdd-red\\])"`
- TDD-red run: `vitest --testNamePattern="\\[tdd-red\\]"`

**Scanner**: Parse test name strings for `[tdd-red:task-N]` pattern.

**Key Benefit**: No separate comment marker needed - the test name IS the marker.

---

### OQ-3: File-Level Markers (RESOLVED ✅)

**Decision**: Supported via language-native mechanisms.

- **Dart**: `@Tags(['tdd-red', 'task-N'])` annotation at file level
- **TypeScript**: `describe('[tdd-red:task-N] ...', () => { ... })` wrapping all tests

Both provide file-level marking without requiring a separate syntax.

---

### OQ-4: Registry Table Schema Changes (RESOLVED ✅)

**Decision**: 

1. **Remove `green_task_id` from registry** - Registry entries don't need this
2. **Remove `status` column** - Registry is transitory, no status tracking needed
3. **Add `completed_at` to `tdd_task_relationships`** - Track green phase completion

**Rationale**: The registry is a transitory, self-cleaning store. Tests that transition to green have their markers removed by the Implementor, so they're not re-added on next scan. The registry naturally empties as the sprint progresses.

Task linkage is a separate concern - it's about which tasks are paired for TDD workflow, not about individual tests. This belongs in `tdd_task_relationships` (already exists), created by Orchestrator at sprint configuration.

**Schema Changes**:
- `tdd_red_registry`: Remove `green_task_id`, `status`, and timestamp columns
- `tdd_task_relationships`: Add `completed_at` column

See **Database Changes** section for full SQL schemas.

---

## Remaining Considerations

All major open questions have been resolved. The following are minor implementation details:

### IC-1: Scanner Robustness (Low Priority)

The pseudocode scanners use simple regex patterns. For production:
- Consider using AST parsing for TypeScript (ts-morph)
- Consider using analyzer package for Dart
- Regex may have edge cases with multi-line strings, comments, etc.

### IC-2: Workspace Root Detection

Scanner needs to know where to find test files. Options:
- Use project-specific config (e.g., pubspec.yaml location for Dart)
- Use workspace root from VS Code extension context
- Allow override in sprint config

### IC-3: Multiple Projects in Workspace

If a workspace has multiple projects (e.g., monorepo):
- Scanner should respect project boundaries
- Consider per-task workspace root specification

These are implementation details to address during development, not blocking design questions.

---

## Appendix: Scanner Pseudocode

### Common Interface

```typescript
interface ScannedTest {
  filePath: string;
  fileName: string;
  taskId: number;
  testName: string;
  testHierarchy: string[];
  identifier: string;  // canonical format: filename::hierarchy
  lineNumber: number;
}
```

### Dart Scanner

```typescript
function scanDartTests(workspaceRoot: string, taskId: number): ScannedTest[] {
  const testFiles = findTestFiles(workspaceRoot, '**/*_test.dart');
  const results: ScannedTest[] = [];
  
  for (const file of testFiles) {
    const content = readFile(file);
    
    // Check for file-level @Tags annotation
    const fileTagsMatch = content.match(/@Tags\(\[([^\]]+)\]\)/);
    const hasFileTag = fileTagsMatch && 
      fileTagsMatch[1].includes(`'task-${taskId}'`) &&
      fileTagsMatch[1].includes(`'tdd-red'`);
    
    // Find all test() calls
    const testPattern = /test\s*\(\s*['"]([^'"]+)['"]\s*,\s*\([^)]*\)\s*\{[^}]*\}(?:\s*,\s*tags:\s*\[([^\]]+)\])?/g;
    
    let match;
    while ((match = testPattern.exec(content)) !== null) {
      const testName = match[1];
      const testTags = match[2] || '';
      
      const hasTestTag = testTags.includes(`'task-${taskId}'`) && 
                         testTags.includes(`'tdd-red'`);
      
      if (hasFileTag || hasTestTag) {
        const hierarchy = extractHierarchy(content, match.index);
        results.push({
          filePath: file,
          fileName: path.basename(file),
          taskId: taskId,
          testName: testName,
          testHierarchy: hierarchy,
          identifier: `${path.basename(file)}::${hierarchy.join('::')}`,
          lineNumber: getLineNumber(content, match.index),
        });
      }
    }
  }
  
  return results;
}
```

### TypeScript Scanner

```typescript
function scanTypeScriptTests(workspaceRoot: string, taskId: number): ScannedTest[] {
  const testFiles = findTestFiles(workspaceRoot, '**/*.test.ts');
  const results: ScannedTest[] = [];
  const markerPattern = new RegExp(`\\[tdd-red:task-${taskId}\\]`);
  
  for (const file of testFiles) {
    const content = readFile(file);
    
    // Find test() and it() calls with [tdd-red:task-N] in name
    const testPattern = /(test|it)\s*\(\s*['"`](\[tdd-red:task-\d+\][^'"`]+)['"`]/g;
    
    let match;
    while ((match = testPattern.exec(content)) !== null) {
      const fullName = match[2];
      
      // Check if this is for our task
      if (markerPattern.test(fullName)) {
        // Extract test name without marker
        const testName = fullName.replace(/\[tdd-red:task-\d+\]\s*/, '');
        const hierarchy = extractHierarchy(content, match.index);
        
        results.push({
          filePath: file,
          fileName: path.basename(file),
          taskId: taskId,
          testName: testName,
          testHierarchy: hierarchy,
          identifier: `${path.basename(file)}::${hierarchy.join('::')}`,
          lineNumber: getLineNumber(content, match.index),
        });
      }
    }
    
    // Also find describe() blocks with marker (all nested tests inherit)
    const describePattern = /describe\s*\(\s*['"`](\[tdd-red:task-\d+\][^'"`]+)['"`]/g;
    
    while ((match = describePattern.exec(content)) !== null) {
      const fullName = match[1];
      
      if (markerPattern.test(fullName)) {
        // Find all tests within this describe block
        const describeName = fullName.replace(/\[tdd-red:task-\d+\]\s*/, '');
        const nestedTests = findNestedTests(content, match.index);
        
        for (const nestedTest of nestedTests) {
          results.push({
            filePath: file,
            fileName: path.basename(file),
            taskId: taskId,
            testName: nestedTest.name,
            testHierarchy: [describeName, ...nestedTest.hierarchy],
            identifier: `${path.basename(file)}::${describeName}::${nestedTest.hierarchy.join('::')}`,
            lineNumber: nestedTest.line,
          });
        }
      }
    }
  }
  
  return results;
}
```

### Language Detection

```typescript
function detectLanguage(filePath: string): 'dart' | 'typescript' | 'unknown' {
  if (filePath.endsWith('.dart')) return 'dart';
  if (filePath.endsWith('.ts') || filePath.endsWith('.js')) return 'typescript';
  return 'unknown';
}

function scanForTddTests(workspaceRoot: string, taskId: number): ScannedTest[] {
  const dartTests = scanDartTests(workspaceRoot, taskId);
  const tsTests = scanTypeScriptTests(workspaceRoot, taskId);
  return [...dartTests, ...tsTests];
}
```
