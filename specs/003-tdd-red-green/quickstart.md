# Quickstart: TDD Red-Green Enforcement

**Feature**: 003-tdd-red-green
**For**: Implementors and Orchestrators using Orchestra TDD workflow

## What Is This?

TDD Red-Green Enforcement ensures that every failing test created in a "red phase" task is eventually made to pass in a corresponding "green phase" task. It prevents the catastrophic scenario where tests are marked complete but never actually pass.

## The Problem It Solves

Without enforcement:
1. ✅ Task 5 creates failing tests → marked COMPLETE
2. ✅ Task 6 creates failing tests → marked COMPLETE
3. ❌ Sprint closes with 40/45 tasks "COMPLETE"
4. ❌ Zero tests ever pass - all functionality missing

With enforcement:
1. ✅ Task 5 creates failing tests → **blocked until green task assigned**
2. ✅ Task 6 creates failing tests → **blocked until green task assigned**
3. ✅ Sprint **cannot close** until all tests GREEN

---

## For Implementors (TDD Red Phase)

### When You Create a Red Phase Task

When working on a task with `tdd_red_phase: true`:

1. **Write your failing tests first** (TDD red phase)
2. **Mark them with appropriate markers**:

   **Dart**:
   ```dart
   @Tags(['tdd-red'])
   void main() {
     test('widget shows loading spinner', () {
       // This test is designed to fail
     });
   }
   ```

   **TypeScript**:
   ```typescript
   // Place in test/tdd-red/ directory
   // OR include [tdd-red] in test name
   describe('Widget', () => {
     it('[tdd-red] shows loading spinner', () => {
       // This test is designed to fail
     });
   });
   ```

3. **Register each test** via MCP tool:

   ```json
   {
     "task_id": 5,
     "tests": [
       {
         "test_identifier": "test/widget_test.dart::WidgetTests::shows loading spinner",
         "description": "Verifies spinner appears during load"
       }
     ]
   }
   ```

4. **Signal completion** as normal - pre-signal will validate markers match registrations

### What Happens at Signal

When you call `signal_completion` on a red-phase task:

1. **Marker Scan**: System finds all files with tdd-red markers
2. **Validation**: Compares markers to your registrations
3. **Mismatch Detection**:
   - Registered but no marker → ERROR: "Test registered but not found in codebase"
   - Marker but not registered → ERROR: "Test found in codebase but not registered"
4. **If valid**: Status moves REGISTERED → VALIDATED

---

## For Orchestrators

### Declaring Relationships Upfront

When configuring a sprint, you can declare red-green relationships:

```json
{
  "sprint": { "id": "sprint-016" },
  "tasks": [
    { "task_id": 1, "title": "Write widget tests", "tdd_red_phase": true },
    { "task_id": 2, "title": "Implement widget" }
  ],
  "tdd_relationships": [
    { "red_task_id": 1, "green_task_id": 2 }
  ]
}
```

Benefits:
- Clear intent from sprint start
- Implementor doesn't need to specify at completion time
- Better sprint planning visibility

### At Complete Time (Alternative)

If not declared upfront, you must provide `green_task_id` when completing:

```json
{
  "task_id": 1,
  "green_task_id": 2
}
```

If missing: **BLOCKED** with error `GREEN_TASK_REQUIRED`

### Sprint Closeout Gate

Sprint cannot close if:
- Any `tdd_red_registry` entry has status ≠ GREEN

Check status via `get_sprint_status`:
```json
{
  "tdd_summary": {
    "total_registered": 5,
    "by_status": {
      "GREEN": 3,
      "PENDING_GREEN": 2
    },
    "blocking_closeout": true
  }
}
```

---

## Status Lifecycle

| Status | Meaning | Set By |
|--------|---------|--------|
| REGISTERED | Test registered by implementor | `register_tdd_red_test` |
| VALIDATED | Marker found in codebase | Pre-signal validation |
| PENDING_GREEN | Red task complete, awaiting green | `complete_task` (red) |
| GREEN | Test passes, markers removed | `complete_task` (green) |

---

## Common Errors

| Error | Meaning | Fix |
|-------|---------|-----|
| `NOT_TDD_RED_TASK` | Tried to register tests on non-red task | Check `tdd_red_phase` flag |
| `DUPLICATE_TEST` | Same test_identifier in sprint | Use unique identifiers |
| `TESTS_NOT_VALIDATED` | Markers don't match registrations | Ensure all tests registered |
| `GREEN_TASK_REQUIRED` | Red task has no green assignment | Provide `green_task_id` |
| `TESTS_STILL_RED` | Green task complete but tests fail | Fix implementation |

---

## Test Identifier Format

Format: `{file_path}::{group}::{test_name}`

Examples:
- `test/widget_test.dart::WidgetTests::shows loading spinner`
- `src/features/auth/__tests__/login.test.ts::LoginForm::validates email format`

Rules:
- Use `::` as separator
- File path relative to project root
- Group = describe/group name
- Test = individual test/it name

---

## FAQ

**Q: Can one green task service multiple red tasks?**
A: Yes. M:1 relationships are allowed (many red → one green).

**Q: What if a test never gets greened?**
A: Sprint cannot close. The blocking entry will show in `get_sprint_status`.

**Q: Can I modify registrations after signal?**
A: No. Once status is VALIDATED, entries are locked.

**Q: What if the green task is split?**
A: You can reassign via orchestrator tools (not yet implemented).
