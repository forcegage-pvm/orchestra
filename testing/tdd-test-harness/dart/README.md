# TDD Test Harness - Dart

This test harness validates both **test runner filtering** and **scanner extraction** for the TDD red/green workflow.

## Two Separate Concerns

| Concern | Purpose | Mechanism |
|---------|---------|-----------|
| **Test Runner Filtering** | Include/exclude TDD red tests | `--tags tdd-red` / `--exclude-tags tdd-red` |
| **Scanner/Tracking** | Link test to Orchestra task | Task ID in comment/name (NOT in filter tags) |

## Test Categories

| Category | Tag | Test Result | Description |
|----------|-----|-------------|-------------|
| **1. TDD-red failing** | `tdd-red` | FAIL | Correct red-phase state |
| **2. TDD-red passing** | `tdd-red` | PASS | Violation - remove tag or fix test |
| **3. Normal failing** | (none) | FAIL | Regression - must fix |
| **4. Normal passing** | (none) | PASS | Healthy state |

## Test Runner Commands

```bash
# Get dependencies
dart pub get

# Run ALL tests (expect some failures)
dart test -r expanded

# Run ONLY tdd-red tests (Category 1 & 2)
# Expected: failures from Cat 1, passes from Cat 2
dart test --tags tdd-red -r expanded

# Run ONLY non-tdd-red tests (Category 3 & 4 + mixed normal)
# Expected: failures from Cat 3, passes from Cat 4
dart test --exclude-tags tdd-red -r expanded
```

## Expected Results

### `dart test --tags tdd-red`
Should run 6 tests:
- Category 1: 2 tests (FAIL - correct)
- Category 2: 2 tests (PASS - violation!)
- Mixed file: 2 tdd-red tests (FAIL - correct)

### `dart test --exclude-tags tdd-red`
Should run 7 tests:
- Category 3: 2 tests (FAIL - regression!)
- Category 4: 5 tests (PASS - correct)
- Mixed file: 3 normal tests (PASS - correct)

## Task ID Extraction

The scanner should find task IDs from:
1. Comment: `// @orchestra-task: N`
2. Group/test name: `[task-N]`

| File | Task ID | Extraction Method |
|------|---------|-------------------|
| category1_tdd_red_failing | 3 | Comment + group name |
| category2_tdd_red_passing | 5 | Comment + group name |
| mixed_file (tdd-red group) | 7 | Comment + group name |

## Validation Checks

### Pre-signal (Red Phase Complete)
1. `dart test --tags tdd-red` → Exit code 1 (tests fail)
2. `dart test --exclude-tags tdd-red` → Exit code 0 (no regressions)

### Post-signal (Green Phase Complete)  
1. `dart test` → Exit code 0 (all tests pass)
2. No `tdd-red` tags remaining in codebase
