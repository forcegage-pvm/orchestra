# TDD Red/Green Tagging System - Design Document

## Problem Statement

We need a tagging system that supports:
1. **Test Runner Filtering**: Include/exclude TDD red-phase tests
2. **Task-ID Tracking**: Link tests to Orchestra tasks for **enforced transition**

**The crucial insight:** Task-ID tracking enables upfront commitment to WHEN tests will transition from red to green, preventing indefinite deferral (Ground Zero failure).

## The Two Concerns

| Concern | Purpose | Mechanism |
|---------|---------|-----------|
| **Test Runner Filtering** | Include/exclude TDD red tests | `--tags tdd-red` / `--exclude-tags tdd-red` |
| **Task-ID Tracking** | Link tests to task for transition enforcement | `// @orchestra-task: N` + `tdd_relationships` table |

**Why both are CRUCIAL:**

- Without filtering: Can't run red tests separately from other tests
- Without task-ID: "Implement later" → never happens (Ground Zero)

## Language-Specific Formats

### Dart/Flutter

```dart
// @orchestra-task: 3
@Tags(['tdd-red'])
library;

import 'package:test/test.dart';

void main() {
  test('should validate credentials', () {
    expect(auth.validate('user', 'pass'), isFalse);
  });
}
```

**Commands:**
- Red tests: `dart test --tags tdd-red` (must exit 1)
- Other tests: `dart test --exclude-tags tdd-red` (must exit 0)

### TypeScript/JavaScript

```typescript
// @orchestra-task: 3

describe('[tdd-red] Authentication', () => {
  it('should validate credentials', () => {
    expect(auth.validate('user', 'pass')).toBe(false);
  });
});
```

**Commands:**
- Red tests: `npm test -- --testNamePattern="\[tdd-red\]"` (must exit 1)
- Other tests: `npm test -- --testNamePattern="^(?!.*\[tdd-red\])"` (must exit 0)

### Python

```python
# @orchestra-task: 3
import pytest

@pytest.mark.tdd_red
def test_validate_credentials():
    assert auth.validate('user', 'pass') is False
```

**Commands:**
- Red tests: `pytest -m tdd_red` (must exit 1)
- Other tests: `pytest -m "not tdd_red"` (must exit 0)

## File-Level Annotation

### Why File-Level Is Sufficient

| Scenario | Recommendation |
|----------|----------------|
| One task creates one test file | ✅ File-level task-ID |
| One task creates multiple test files | ✅ Same file-level task-ID in each |
| Multiple tasks' tests in one file | ❌ Avoid - create separate files |

TDD red tasks should produce files where ALL tests belong to ONE task. This is natural:
- "Task 3: Write failing tests for auth" → creates `auth_test.dart`
- All tests in that file are for task 3

---

## Database Schema

### tdd_task_relationships (Upfront Commitment)

Declared at `configure_sprint` time. Creates enforceable commitment.

```sql
CREATE TABLE tdd_task_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sprint_id TEXT NOT NULL REFERENCES sprints(id),
  red_task_id INTEGER NOT NULL REFERENCES tasks(id),
  green_task_id INTEGER NOT NULL REFERENCES tasks(id),
  created_at TEXT NOT NULL,
  UNIQUE(sprint_id, red_task_id)  -- One red task → one green task
);
```

### tdd_red_registry (File Tracking)

Populated when red-phase task signals completion. Updated when green-phase completes.

```sql
CREATE TABLE tdd_red_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sprint_id TEXT NOT NULL REFERENCES sprints(id),
  red_task_id INTEGER NOT NULL REFERENCES tasks(id),
  test_file TEXT NOT NULL,           -- Primary tracking unit (relative path)
  test_count INTEGER DEFAULT 1,      -- Number of tests in file (for reporting)
  transitioned INTEGER DEFAULT 0,    -- 0=red (failing), 1=green (passing)
  created_at TEXT NOT NULL,
  UNIQUE(sprint_id, test_file)       -- One file tracked once per sprint
);
```

**Key changes from previous design:**
- **DROPPED**: `test_identifier` (was per-test, now file-level)
- **REQUIRED**: `test_file` (was optional, now primary key component)
- **ADDED**: `test_count` (for "10 tests registered" reporting)
- **ADDED**: `transitioned` (tracks red→green state change)

---

## Complete Enforcement Chain

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. UPFRONT COMMITMENT: configure_sprint                                     │
│                                                                             │
│    tdd_relationships: [ { red_task_id: 3, green_task_id: 5 } ]             │
│                                                                             │
│    "Task 5 is COMMITTED to making Task 3's tests green"                    │
│    Stored in: tdd_task_relationships table                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. RED PHASE: Task 3 signals completion                                     │
│                                                                             │
│    Scanner:                                                                 │
│    ├─ Find files with @Tags(['tdd-red']) or [tdd-red] markers              │
│    ├─ Extract // @orchestra-task: N from each file                         │
│    └─ FAIL if task-ID missing (actionable error)                           │
│                                                                             │
│    Pre-signal checks:                                                       │
│    ├─ dart test --tags tdd-red → MUST exit 1 (tests fail)                  │
│    └─ dart test --exclude-tags tdd-red → MUST exit 0 (no regressions)      │
│                                                                             │
│    On success:                                                              │
│    └─ Insert into tdd_red_registry: { red_task_id: 3, test_file, count }   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. GREEN PHASE: Task 5 signals completion                                   │
│                                                                             │
│    Lookup:                                                                  │
│    ├─ tdd_task_relationships: Task 5 completes Task 3                      │
│    └─ tdd_red_registry: Get files WHERE red_task_id = 3                    │
│                                                                             │
│    Verification:                                                            │
│    ├─ Those files should NOT have @Tags(['tdd-red']) anymore               │
│    └─ dart test → MUST exit 0 (all tests pass)                             │
│                                                                             │
│    On success:                                                              │
│    └─ UPDATE tdd_red_registry SET transitioned = 1 WHERE red_task_id = 3   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. SPRINT CLOSEOUT: Final gate                                              │
│                                                                             │
│    Checks:                                                                  │
│    ├─ All tdd_task_relationships have matching transitioned=1 entries      │
│    ├─ No @Tags(['tdd-red']) remain in codebase                             │
│    └─ tdd_summary.blocking_closeout = false                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Enforcement Flow Details

### 1. Upfront Commitment (configure_sprint)

```json
{
  "tasks": [
    { "task_id": 3, "title": "Red: Auth tests", "tdd_red_phase": true },
    { "task_id": 5, "title": "Green: Implement auth", "dependencies": [3] }
  ],
  "tdd_relationships": [
    { "red_task_id": 3, "green_task_id": 5 }
  ]
}
```

This creates an **enforceable commitment**: Task 5 MUST transition Task 3's tests.

### 2. Red Phase Verification (Task 3 signals)

When `signal_completion` is called on a task with `tdd_red_phase = true`:

**Step 1: Scan for TDD-red files**
```
Find all files with:
- Dart: @Tags(['tdd-red'])
- TypeScript: [tdd-red] in describe/it names
- Python: @pytest.mark.tdd_red
```

**Step 2: Extract and validate task-ID (REQUIRED)**
```
For each file:
  Extract: // @orchestra-task: N
  If missing → FAIL with actionable error:
  
    TDD-RED FILE MISSING TASK-ID:
      File: test/auth_test.dart

    This file has @Tags(['tdd-red']) but is missing the task-ID annotation.
    Add at the top of the file:
      // @orchestra-task: 3

    This is REQUIRED for Orchestra to track when these tests must transition
    to green. Without it, there's no enforcement of when implementation
    happens (Ground Zero failure).
```

**Step 3: Run dual-command verification**
```
Check 1: TDD red tests MUST fail
  Command: dart test --tags tdd-red
  Expected: exit 1
  On exit 0: VIOLATION - "Tests should be failing in red phase"

Check 2: Other tests MUST pass  
  Command: dart test --exclude-tags tdd-red
  Expected: exit 0
  On exit 1: REGRESSION - "Non-TDD tests are failing"
```

**Step 4: Record in registry**
```sql
INSERT INTO tdd_red_registry (sprint_id, red_task_id, test_file, test_count, transitioned)
VALUES ('sprint-001', 3, 'test/auth_test.dart', 5, 0);
```

### 3. Green Phase Verification (Task 5 signals)

When `signal_completion` is called on a task that is the `green_task_id` in `tdd_task_relationships`:

**Step 1: Lookup relationship**
```sql
SELECT red_task_id FROM tdd_task_relationships WHERE green_task_id = 5;
-- Returns: red_task_id = 3
```

**Step 2: Get tracked files**
```sql
SELECT test_file FROM tdd_red_registry WHERE red_task_id = 3;
-- Returns: ['test/auth_test.dart', 'test/login_test.dart']
```

**Step 3: Verify tags removed**
```
For each tracked file:
  If file still has @Tags(['tdd-red']) → FAIL:
  
    TDD-GREEN PHASE INCOMPLETE:
      File: test/auth_test.dart

    This file still has @Tags(['tdd-red']) but the green phase
    task (Task 5) is signaling completion.
    
    Remove the @Tags(['tdd-red']) annotation after implementation.
```

**Step 4: Verify all tests pass**
```
Command: dart test
Expected: exit 0
On exit 1: FAIL - "Tests are still failing"
```

**Step 5: Mark as transitioned**
```sql
UPDATE tdd_red_registry SET transitioned = 1 WHERE red_task_id = 3;
```

### 4. Sprint Closeout

Sprint cannot close if TDD red/green workflow is incomplete:

```sql
-- Check 1: All relationships have transitioned
SELECT COUNT(*) FROM tdd_task_relationships r
LEFT JOIN tdd_red_registry reg ON r.red_task_id = reg.red_task_id
WHERE r.sprint_id = 'sprint-001'
  AND (reg.transitioned IS NULL OR reg.transitioned = 0);
-- Must return 0

-- Check 2: No orphan tdd-red tags in codebase
-- grep -r "@Tags\(\['tdd-red'\]\)" . | wc -l
-- Must return 0
```

**Closeout gate in get_sprint_status:**
```json
{
  "tdd_summary": {
    "total": 5,
    "by_status": { "green": 3, "pending_green": 2 },
    "blocking_closeout": true
  }
}
```

---

## Scanner Implementation

The scanner extracts task-IDs at **file level** (sufficient for TDD red workflow).

### Required Annotations

Every TDD-red test file MUST have both:

```dart
// @orchestra-task: N    ← Scanner extracts this (REQUIRED for tracking)
@Tags(['tdd-red'])        ← Test runner uses this (REQUIRED for filtering)
library;
```

**If task-ID is missing, scanner FAILS** with actionable error.

### Scanner Algorithm

```typescript
interface TddRedFile {
  filePath: string;
  taskId: number;        // REQUIRED - extracted from // @orchestra-task: N
  testCount: number;     // Count of tests in file (for reporting)
}

interface ScanResult {
  files: TddRedFile[];
  errors: string[];      // Files with tdd-red but missing task-ID
}

function scanTddRedFiles(projectRoot: string, expectedTaskId?: number): ScanResult {
  const files: TddRedFile[] = [];
  const errors: string[] = [];
  
  // Find all files with @Tags(['tdd-red']) or [tdd-red] markers
  for (const file of findFilesWithTddRedTag(projectRoot)) {
    const taskId = extractFileTaskId(file);
    
    if (taskId === null) {
      errors.push(
        `TDD-red file missing task ID: ${file}\n` +
        `Add: // @orchestra-task: N at top of file`
      );
      continue;
    }
    
    // If expectedTaskId provided, only include matching files
    if (expectedTaskId !== undefined && taskId !== expectedTaskId) {
      continue;
    }
    
    files.push({
      filePath: file,
      taskId,
      testCount: countTests(file)
    });
  }
  
  return { files, errors };
}

function extractFileTaskId(filePath: string): number | null {
  const content = readFile(filePath);
  // Look for // @orchestra-task: N or # @orchestra-task: N in first 20 lines
  const lines = content.split('\n').slice(0, 20).join('\n');
  const match = lines.match(/@orchestra-task:\s*(\d+)/);
  return match ? parseInt(match[1]) : null;
}

function findFilesWithTddRedTag(projectRoot: string): string[] {
  // Language-specific patterns:
  // Dart:       @Tags(['tdd-red'])
  // TypeScript: [tdd-red] in describe/it
  // Python:     @pytest.mark.tdd_red
  // Returns relative paths
}

function countTests(filePath: string): number {
  const content = readFile(filePath);
  // Language-specific:
  // Dart:       Count test( calls
  // TypeScript: Count it( and test( calls
  // Python:     Count def test_ functions
}
```

### Scanner Test Files

| File | Has tdd-red? | Task-ID | Expected Scanner Result |
|------|--------------|---------|------------------------|
| `category1_tdd_red_failing_test.dart` | ✅ | 3 | Extract task 3, count 2 tests |
| `category2_tdd_red_passing_violation_test.dart` | ✅ | 5 | Extract task 5, count 2 tests |
| `category3_normal_failing_regression_test.dart` | ❌ | - | Skip (no tdd-red tag) |
| `category4_normal_passing_test.dart` | ❌ | - | Skip (no tdd-red tag) |
| `mixed_file_test.dart` | ✅ (inline) | 7 | Extract task 7, count 2 tdd-red tests |

---

## Validation Matrix

### Red Phase (tdd_red_phase = true task signals)

| Check | Command | Expected Exit | Failure Mode |
|-------|---------|---------------|--------------|
| TDD red tests fail | `dart test --tags tdd-red` | 1 (failure) | VIOLATION: Tests should fail in red phase |
| Other tests pass | `dart test --exclude-tags tdd-red` | 0 (success) | REGRESSION: Non-TDD tests failing |
| Task-ID present | Scanner check | All files have `@orchestra-task: N` | Missing annotation error |

### Green Phase (green_task_id task signals)

| Check | Command | Expected Exit | Failure Mode |
|-------|---------|---------------|--------------|
| All tests pass | `dart test` | 0 (success) | Tests still failing |
| Tags removed | Scanner check | No `@Tags(['tdd-red'])` in tracked files | Tags still present |

---

## Test Harness Structure

```
testing/tdd-test-harness/
├── dart/
│   ├── pubspec.yaml
│   ├── dart_test.yaml
│   ├── README.md
│   └── test/
│       ├── category1_tdd_red_failing_test.dart    # Correct red phase
│       ├── category2_tdd_red_passing_violation_test.dart  # Violation
│       ├── category3_normal_failing_regression_test.dart  # Regression
│       ├── category4_normal_passing_test.dart     # Healthy state
│       └── mixed_file_test.dart                   # Mixed categories
├── typescript/  # Future
└── python/      # Future
```

---

## Implementation Checklist

### Database Changes
- [ ] Update `tdd_red_registry` table schema (drop test_identifier, add test_count, transitioned)

### Scanner Changes  
- [ ] Update `src/core/tdd-marker-scanner.ts` to file-level approach
- [ ] Add task-ID extraction from `// @orchestra-task: N`
- [ ] Add test count extraction
- [ ] Fail on missing task-ID

### Signal Completion Changes
- [ ] Update red-phase verification to run dual-command checks
- [ ] Update green-phase verification to check tracked files
- [ ] Update registry insertion to use file-level data

### Agent Instructions
- [ ] Update `orchestra.implementor.agent.md` with new format
- [ ] Update `orchestra.orchestrator.agent.md` with new format
- [ ] Update handover template with correct annotation format

### Tests
- [ ] Scanner tests using the test harness
- [ ] Integration tests for red→green flow
