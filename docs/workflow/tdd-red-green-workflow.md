# TDD Red-Green Workflow

**Author**: Orchestra System  
**Version**: 1.0.0  
**Last Updated**: 2026-01-13  
**Status**: ACTIVE

---

## Overview

Orchestra supports Test-Driven Development (TDD) workflows with explicit red-phase and green-phase task separation. This document describes how to use the `tdd_red_phase` flag to mark tasks where tests are **designed to fail** (red phase) before implementing the feature (green phase).

## The Problem

Traditional verification requires ALL tests to pass. This is incompatible with TDD red-phase tasks where:
- The task is explicitly to write a test that MUST fail
- Pre-signal checks would reject the task because tests don't pass
- Orchestrator can't distinguish between "intentional failure" and "broken code"

## The Solution: Tagged Test Isolation

Orchestra uses test framework tagging/isolation to separate intentionally-failing tests from regression checks.

### Key Concepts

1. **TDD Red Phase**: Write a failing test that defines expected behavior
2. **TDD Green Phase**: Implement the feature to make the test pass
3. **Test Markers**: Special tags/directories that identify red-phase tests
4. **Dual Verification**: Separate test commands for red and non-red tests
5. **Automatic Cleanup**: Orchestrator removes stale markers before each task prepare

---

## Workflow: Red-Green Task Pair

### Step 1: Create Red-Phase Task

**Orchestrator** creates a task with `tdd_red_phase: true`:

```bash
# Using MCP tool: add_task
{
  "task_id": 10,
  "title": "Add failing test for user authentication",
  "description": "Write test that validates JWT token expiration",
  "category": "INFRASTRUCTURE",
  "tdd_red_phase": true,  # ← Flag marks this as red-phase task
  "dependencies": []
}
```

**Task acceptance criteria** (orchestrator-defined):
- [ ] Test file exists with tdd-red marker
- [ ] Marked test FAILS when run alone
- [ ] All other tests PASS (no regressions)
- [ ] Test fails for the CORRECT reason (validates expected behavior)

### Step 2: Implementor Writes Failing Test

**Implementor** receives handover with TDD instructions.

#### For Dart Projects

Tag the test with `@Tags(['tdd-red:task-10'])`:

```dart
import 'package:flutter_test/flutter_test.dart';

@Tags(['tdd-red:task-10'])  // ← Marks test as red-phase for task 10
void main() {
  test('should reject expired JWT tokens', () {
    final auth = AuthService();
    final expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // expired
    
    // This test MUST fail - we haven't implemented expiration checking yet
    expect(
      () => auth.validateToken(expiredToken),
      throwsA(isA<TokenExpiredException>()),
    );
  });
}
```

Or use inline tags for individual tests:

```dart
test('should reject expired JWT tokens', () {
  // test body
}, tags: ['tdd-red:task-10']);
```

Run verification locally:
```bash
# Tagged test must fail
$ flutter test --tags tdd-red:task-10
# ❌ Expected: throws <TokenExpiredException>
#    Actual: null (no exception thrown)

# Other tests must pass
$ flutter test --exclude-tags tdd-red:task-10
# ✅ All 47 tests passed
```

#### For TypeScript Projects

Use `[tdd-red:task-10]` prefix in test name:

```typescript
// File: test/auth-expiration.test.ts
describe('[tdd-red:task-10] AuthService expiration', () => {
  it('should reject expired JWT tokens', () => {
    const auth = new AuthService();
    const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
    
    // This test MUST fail - we haven't implemented expiration checking yet
    expect(() => auth.validateToken(expiredToken))
      .toThrow(TokenExpiredException);
  });
});
```

Run verification locally:
```bash
# Red-phase tests must fail
$ npm test -- --testNamePattern="\[tdd-red:task-10\]"
# ❌ Expected: throws TokenExpiredException
#    Received: undefined

# Other tests must pass  
$ npm test -- --testNamePattern="^(?!.*\[tdd-red\])"
# ✅ 124 tests passed
```

### Step 3: Signal Completion (Red-Phase Task)

**Pre-signal checks** run dual verification:

```yaml
# .orchestra/implementor/signals/task-10-signal.yaml
task_id: 10
artifacts:
  - path: "test/auth-expiration.test.dart"
    type: CREATE
summary: "Added failing test for JWT token expiration validation"
build_passed: true
test_passed: true  # ← Special: means dual verification passed
notes: "Test fails as expected. All other tests pass."
```

**Pre-signal executor** runs:
1. `flutter test --tags tdd-red:task-10` → Exit code 1 (MUST fail)
2. `flutter test --exclude-tags tdd-red:task-10` → Exit code 0 (MUST pass)
3. Both conditions met → Pre-signal PASSED

**Verification** (orchestrator, hidden criteria):
- [x] File contains `@Tags(['tdd-red:task-10'])` marker
- [x] Marked test fails with correct error
- [x] No regression failures in other tests

**Result**: Task 10 COMPLETE. Red-phase test remains in codebase with marker.

---

### Step 4: Create Green-Phase Task

**Orchestrator** creates follow-up task with `tdd_red_phase: false` (default):

```bash
{
  "task_id": 11,
  "title": "Implement JWT token expiration validation",
  "description": "Make the failing test pass by implementing expiration check",
  "category": "INFRASTRUCTURE",
  "tdd_red_phase": false,  # ← Normal task
  "dependencies": [10]      # ← Depends on red-phase task
}
```

### Step 5: Implementor Removes Markers (Green Phase)

**Manual cleanup** by implementor during green phase:

1. **Implementor** implements the feature to make tests pass
2. **Removes markers** from tests:
   - Dart: Removes `@Tags(['tdd-red:task-N'])` annotation or inline `tags:` parameter
   - TypeScript: Removes `[tdd-red:task-N]` prefix from test/describe names
3. **Signals completion** with tests now passing

### Step 6: Implementor Makes Test Pass

**Implementor** implements the feature:

```dart
class AuthService {
  void validateToken(String token) {
    final decoded = JWT.decode(token);
    
    // NEW: Check expiration
    final expiresAt = DateTime.fromMillisecondsSinceEpoch(decoded['exp'] * 1000);
    if (DateTime.now().isAfter(expiresAt)) {
      throw TokenExpiredException('Token expired at $expiresAt');
    }
  }
}
```

**Pre-signal check** (normal mode):
```bash
$ flutter test
# ✅ All 48 tests passed (including the formerly-failing test)
```

**Result**: Task 11 COMPLETE. Test now passes. TDD cycle complete.

---

## Handover Structure (Red-Phase Tasks)

When `tdd_red_phase: true`, the handover includes special TDD instructions:

```markdown
# Task 10: Add failing test for JWT expiration

## TDD Red-Phase Instructions

This is a **TDD red-phase task**. Your test MUST fail.

### Tagging Mechanism
Add `@Tags(['tdd-red'])` annotation to your test function.

### Verification Commands
- **Red test**: `flutter test --tags tdd-red` (MUST exit 1)
- **Green tests**: `flutter test --exclude-tags tdd-red` (MUST exit 0)

### Expected Behavior
- The tagged test MUST fail (exit code 1)
- All other tests MUST pass (exit code 0)

### Example
```dart
@Tags(['tdd-red'])
void main() {
  test('feature should work', () {
    expect(actualValue, expectedValue); // This will fail
  });
}
```

## Acceptance Criteria
- [ ] Test file created with tdd-red tag
- [ ] Test fails when run with --tags tdd-red
- [ ] All other tests pass
- [ ] Test validates the expected behavior

## Success Criteria
Your signal will be accepted when:
1. Pre-signal check confirms dual verification passes
2. At least one file contains tdd-red marker
3. Tagged test fails for the correct reason
```

---

## Configuration

### Orchestra Config (orchestra.yaml)

```yaml
version: "1.0.0"
tdd:
  red_phase:
    # Dart project settings
    dart_tag: "tdd-red"
    dart_red_command: "flutter test --tags tdd-red"
    dart_green_command: "flutter test --exclude-tags tdd-red"
    
    # TypeScript project settings
    typescript_directory: "test/tdd-red"
    typescript_red_command: "npm test -- test/tdd-red"
    typescript_green_command: "npm test -- --testPathIgnorePatterns=tdd-red"
```

### Sprint-Level Configuration

```bash
# Using MCP tool: set_sprint_config
{
  "key": "tdd_require_red_phase",
  "value": "true"
}
```

---

## Best Practices

### DO ✅

1. **Use descriptive test names** that explain expected behavior
2. **Fail for the right reason** - test should validate feature logic, not syntax
3. **Keep red phase focused** - one test per red-phase task
4. **Clean up markers promptly** - orchestrator handles this automatically
5. **Verify locally** before signaling - run both test commands

### DON'T ❌

1. **Don't skip test isolation** - always use markers/directories
2. **Don't mix red and green** in same task - separate clearly
3. **Don't leave stale markers** - orchestrator cleans automatically, but verify
4. **Don't write passing tests** in red phase - defeats the purpose
5. **Don't ignore regression tests** - all non-red tests must pass

---

## Troubleshooting

### Problem: Pre-signal check rejects red-phase task

**Symptom**: "All tests must pass" error during pre-signal

**Solution**:
1. Verify `tdd_red_phase: true` is set on task
2. Check test has correct marker:
   - Dart: `@Tags(['tdd-red'])`
   - TypeScript: File in `test/tdd-red/`
3. Verify handover includes TDD instructions
4. Run dual verification locally:
   ```bash
   # Must fail
   flutter test --tags tdd-red
   # Must pass
   flutter test --exclude-tags tdd-red
   ```

### Problem: Green-phase task fails because red test still fails

**Symptom**: Test that should pass is still failing

**Solution**:
1. Check if cleanup ran - markers should be removed
2. Verify you're running ALL tests, not just red tests
3. Implement the feature to make test pass
4. If cleanup didn't run, escalate to orchestrator

### Problem: Stale markers from previous sprint

**Symptom**: Unexpected tdd-red tags in codebase

**Solution**:
Orchestrator runs cleanup automatically during `prepare_task`. If markers persist:
1. Check git status - should see cleanup commit
2. Manually remove markers if needed:
   - Dart: Search for `@Tags(['tdd-red'])` and remove
   - TypeScript: Move files from `test/tdd-red/` to `test/unit/`
3. Commit cleanup: `git commit -m "chore: remove stale tdd-red markers"`

---

## Example: Complete Red-Green Cycle

### Sprint Context
- **Feature**: User password reset via email
- **Approach**: TDD red-green workflow

### Task 12 (RED): Write failing test

```yaml
task_id: 12
title: "Add failing test for password reset email"
tdd_red_phase: true
dependencies: []
```

**Implementor action**:
```dart
@Tags(['tdd-red'])
test('should send password reset email with valid token', () async {
  final service = PasswordResetService();
  final result = await service.requestReset('user@example.com');
  
  expect(result.emailSent, isTrue);
  expect(result.token, hasLength(32));
  expect(result.expiresAt, isAfter(DateTime.now()));
});
```

**Pre-signal check**:
```
✅ flutter test --tags tdd-red → EXIT 1 (fails as expected)
✅ flutter test --exclude-tags tdd-red → EXIT 0 (no regressions)
✅ Dual verification PASSED
```

**Status**: Task 12 COMPLETE

---

### Task 13 (GREEN): Implement password reset

**Before task prepare**:
```
🧹 Orchestrator cleanup:
   - Detected @Tags(['tdd-red']) in test/auth/password_reset_test.dart
   - Removed marker
   - Committed: "chore: remove tdd-red markers before task 13"
```

```yaml
task_id: 13
title: "Implement password reset email service"
tdd_red_phase: false
dependencies: [12]
```

**Implementor action**:
```dart
class PasswordResetService {
  Future<ResetResult> requestReset(String email) async {
    final token = _generateSecureToken(32);
    final expiresAt = DateTime.now().add(Duration(hours: 24));
    
    await _emailService.send(
      to: email,
      subject: 'Password Reset',
      body: 'Your reset token: $token',
    );
    
    return ResetResult(
      emailSent: true,
      token: token,
      expiresAt: expiresAt,
    );
  }
}
```

**Pre-signal check**:
```
✅ flutter test → EXIT 0 (all 49 tests pass, including formerly-red test)
```

**Status**: Task 13 COMPLETE. TDD cycle complete ✅

---

## Architecture Notes

### Database Schema

```sql
-- tasks table has tdd_red_phase column
CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  tdd_red_phase INTEGER DEFAULT 0,  -- Boolean flag
  -- ... other columns
);
```

### Pre-Signal Executor Logic

```typescript
if (task.tdd_red_phase) {
  // Dual verification mode
  const redResult = await executeCommand(config.tdd.red_command);
  const greenResult = await executeCommand(config.tdd.green_command);
  
  if (redResult.exitCode !== 1) {
    return { passed: false, error: "Red test must fail" };
  }
  if (greenResult.exitCode !== 0) {
    return { passed: false, error: "Green tests must pass" };
  }
  
  return { passed: true };
} else {
  // Normal verification mode
  const result = await executeCommand(config.test_command);
  return { passed: result.exitCode === 0 };
}
```

### Cleanup Integration

Cleanup runs in `prepare_task` handler **before** generating handover:

```typescript
// Always run cleanup, regardless of current task's tdd_red_phase flag
const cleanup = await cleanupTddRedMarkers(workspaceRoot);
if (cleanup.cleaned) {
  await autoCommitIfEnabled({
    message: `chore: remove tdd-red markers before task ${taskId}`,
    files: cleanup.files,
  });
}
```

---

## References

- **Technical Debt**: `technical-debt/TD-020-tdd-red-phase-verification.md`
- **Implementation**: `src/mcp-server/handlers/get-current-task.ts`
- **Cleanup Logic**: `src/core/tdd-cleanup.ts`
- **Pre-Signal**: `src/core/pre-signal-executor.ts`
- **Orchestra Bible**: Section on verification modes

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-13 | Initial documentation for TDD red-green workflow |
