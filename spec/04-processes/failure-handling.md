# Failure Handling

> **Navigation**: [Index](../readme.md) | **Prev**: [Visual Verification](visual-verification.md) | **Next**: [Handover Lifecycle](handover-lifecycle.md)
>
> Aligned with Orchestra Bible v0.7.0 - Section 7.7 (RETRY) and Section 7.8 (ESCALATED)

---

## Overview

When verification fails, Orchestra has structured processes for feedback, retry, and escalation. This document describes how failures are handled at each level, including the scripts involved and the decision criteria.

## Failure Categories

### Verification Failures

Tasks fail verification when checks don't pass:

| Severity | Effect on Task |
|----------|----------------|
| BLOCKING | Immediate failure, must fix |
| MAJOR | Task fails |
| MINOR | Noted but task can pass |
| INFO | Suggestions only, no effect |

### Recoverable vs Unrecoverable

| Type | Examples | Handling |
|------|----------|----------|
| Recoverable | Test failures, lint errors, incomplete implementation | RETRY with feedback |
| Unrecoverable | Missing critical files, wrong architecture, exceeded retries | ESCALATED to human |

---

## RETRY Phase

### Entry Conditions

A task enters RETRY when:
- Gate check or verification failed
- Failure is recoverable
- Retry count < max_retries (default: 3)

### Retry Count Tracking

The manifest tracks attempts:

```yaml
tasks:
  - id: 5
    title: "Create YAxisConfig Model"
    status: RETRY
    retry_count: 2
    max_retries: 3
    last_failure: "Missing validation tests"
```

### Feedback Generation Script

```powershell
.orchestra/orchestrator/scripts/generate-feedback.ps1
```

**What it does**:
- Creates feedback file at `.orchestra/handover/feedback.md`
- Documents specific failures with evidence
- Provides actionable fix instructions
- Notes what was correct (positive reinforcement)

### Feedback Document Structure

```markdown
## Verification Result: FAILED

**Attempt**: 2 of 3
**Failed Checks**: 2

### Check 1: Unit test coverage (BLOCKING)
**Status**: FAILED
**Expected**: Tests exist for YAxisConfig validation  
**Actual**: No tests found for validation edge cases
**Fix**: Add tests for null position, invalid scale combinations

### Check 2: Error message format (MAJOR)
**Status**: FAILED
**Expected**: Errors include axis ID in message
**Actual**: Generic "Invalid configuration" without context
**Fix**: Include axis ID: "YAxis 'right': Invalid scale type"

### What to Do

1. Add validation tests to `test/unit/y_axis_config_test.dart`
2. Update error messages in `YAxisConfig.validate()`
3. Run `flutter test` to verify
4. Re-run pre-signal check
5. Signal completion again
```

### Feedback Principles

1. **Specific**: Exactly what failed, not vague guidance
2. **Actionable**: Clear steps to fix
3. **Bounded**: Only address actual failures
4. **Honest**: No false positives or moving goalposts

### Retry Workflow

```
1. Orchestrator generates feedback
   └── Run: generate-feedback.ps1

2. Implementor reads feedback
   └── File: .orchestra/handover/feedback.md

3. Implementor makes targeted fixes
   └── Does NOT restart from scratch
   └── Focuses only on failed checks

4. Implementor re-runs pre-signal check
   └── Run: pre-signal-check.ps1

5. Implementor signals completion
   └── Run: signal-complete.ps1

6. Orchestrator verifies again
   └── Return to GATE_CHECK phase
```

### Attempt-Based Guidance

| Attempt | Guidance Level |
|---------|----------------|
| 1 | Standard feedback |
| 2 | Enhanced guidance with examples |
| 3 | Maximum detail, consider spec issue |

---

## ESCALATED Phase

### Entry Conditions

A task enters ESCALATED when:
- Retry count >= max_retries (3 failed attempts)
- Unrecoverable error detected
- Orchestrator cannot resolve the issue

### Escalation Script

```powershell
.orchestra/orchestrator/scripts/escalate-failure.ps1
```

**What it does**:
- Updates manifest status: → ESCALATED
- Creates escalation report
- Documents failure history
- Notifies human (if configured)

### Escalation Report

```markdown
## Escalation Notice

**Task**: 5 - Create YAxisConfig Model
**Attempts**: 3 (all failed)
**Pattern**: Same failure on each attempt

### Failure Pattern

Implementor consistently creates tests that pass locally
but fail in verification due to timing-dependent assertions.

### Analysis

The specification requires "instant response" but the widget
rebuild cycle introduces 16ms minimum delay. This may be
a specification issue rather than implementation issue.

### Recommended Actions

1. Clarify "instant" definition in specification
2. Allow 16ms tolerance for widget rebuilds
3. Or redesign to avoid widget dependency

### Human Decision Needed

- [ ] Adjust specification
- [ ] Provide implementation hint
- [ ] Accept with documented limitation
- [ ] Other: _____________
```

### When to Escalate Immediately

Some situations warrant immediate escalation (skip retries):

| Situation | Why |
|-----------|-----|
| Impossible constraint | Spec asks for contradictory things |
| Tooling limitation | AI cannot perform required action |
| Ambiguous requirement | Spec open to interpretation |
| Architectural issue | Wrong approach, not fixable with patches |

---

## Human Intervention Actions

Per Bible Section 4.3.1, humans can take these actions:

| Action | Description | Manifest Update |
|--------|-------------|-----------------|
| Fix manually | Human fixes the code directly | status → COMPLETE |
| Modify task spec | Adjust requirements | Reset retry_count, status → PENDING |
| Skip task | Move past without completing | status → SKIPPED, add justification |
| Split task | Break into smaller tasks | Create new task entries |
| Abort sprint | Cancel remaining work | Sprint status → ABORTED |

### Emergency Overrides

Per Bible Section 4.3.2, for recovery situations:

| Override | When to Use |
|----------|-------------|
| Direct Progress Manipulation | Correct manifest errors |
| Clear Orphaned Signals | Remove stale signal files |
| Force State Transition | Unstick blocked workflows |
| Reset Retry Counter | Give fresh attempts after spec fix |

---

## Common Failure Patterns

### Pattern: Vague Feedback Loop

**Symptom**: Implementor keeps failing same check
**Cause**: Feedback not specific enough
**Fix**: Orchestrator must provide exact expected vs actual

### Pattern: Unstable Tests

**Symptom**: Tests pass sometimes, fail others
**Cause**: Timing dependencies, random seeds, etc.
**Fix**: Identify and stabilize or mark as known flaky

### Pattern: Scope Creep in Verification

**Symptom**: New checks appear on retry
**Cause**: Moving goalposts
**Fix**: Verification criteria are fixed at task start

### Pattern: Missing Pre-conditions

**Symptom**: Task fails due to missing prior work
**Cause**: Dependency not completed
**Fix**: Review task ordering, ensure prerequisites

### Pattern: Implementation Theater

**Symptom**: All tests pass but feature doesn't work
**Cause**: Shallow tests that don't verify behavior
**Fix**: Add adversarial checks, require visual verification

---

## Recovery Procedures

### Starting Fresh

When context pollution is severe:

1. Run task-closeout-check for current state
2. Note what was attempted
3. Start fresh agent session
4. Provide summary of prior attempts
5. Continue from last known good state

### Rollback

When implementation broke something:

```powershell
# Identify last good commit
git log --oneline -10

# Reset to that commit
git reset --hard <commit>

# Or revert specific commits
git revert <bad-commit>
```

### Force Progress

When stuck but need to move forward:

1. Document the blocker in detail
2. Add to technical debt tracking
3. Create workaround if possible
4. Accept task with documented limitation
5. Create follow-up task to address properly

---

## Prevention Strategies

### Before Starting Task

1. Verify all dependencies complete
2. Check tooling works (flutter, git, etc.)
3. Confirm test suite passing
4. Review specification for clarity

### During Implementation

1. Test frequently, not just at end
2. Commit incrementally
3. Run pre-signal check before signaling
4. Address warnings, not just errors

### Before Signaling

1. Run full pre-signal check
2. Verify all artifacts exist
3. Review against specification
4. Consider adversarial scenarios

---

## Metrics for Process Improvement

Track failure patterns:

```yaml
sprint_metrics:
  total_tasks: 16
  first_attempt_pass: 12
  second_attempt_pass: 3
  third_attempt_pass: 0
  escalated: 1
  
  common_failures:
    - type: "missing_tests"
      count: 3
    - type: "visual_verification"
      count: 2
    - type: "documentation"
      count: 1
```

These metrics help identify:
- Specification quality issues
- Training needs
- Tooling gaps
- Process improvements

---

## Script Reference

| Script | Purpose | Phase |
|--------|---------|-------|
| `generate-feedback.ps1` | Create feedback document for retry | RETRY |
| `escalate-failure.ps1` | Create escalation report for human | ESCALATED |
| `task-closeout-check.ps1` | Verify task is ready for next phase | Post-fix |

---

*Failure handling is designed to minimize wasted effort while ensuring quality. The retry loop provides focused feedback, and escalation ensures humans are involved when needed.*
