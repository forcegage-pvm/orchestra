# TD-011: Feedback Workflow Integration

**Status**: 🔴 Open  
**Priority**: HIGH  
**Identified**: 2025-12-06  
**Source**: Dogfood testing - verification failure workflow

---

## Summary

When verification fails via `orchestra accept-signal`, the feedback never reaches the implementor because the commands are disconnected. The implementor is stuck with no guidance on what failed or how to fix it.

---

## Issues Included

| Issue | Description | Severity |
|-------|-------------|----------|
| #7 | Feedback not visible to implementor | HIGH |
| #8 | progress.yaml not updated on failure | MEDIUM |
| #9 | agent_readme.md missing rejection workflow | MEDIUM |
| #10 | `orchestra feedback` not standalone | HIGH |
| #11 | `accept-signal` doesn't generate feedback | HIGH |
| #12 | Feedback file location inconsistent | MEDIUM |
| #13 | Orchestrator agent readme missing failure workflow | HIGH |
| #14 | Implementor agent readme has incomplete feedback handling | MEDIUM |

---

## Agent Instruction Gaps Analysis

### Orchestrator Agent (`orchestra.orchestrator.agent.md`)

**Current State**: The orchestrator readme mentions failure briefly but lacks specifics.

| What's Present | What's Missing |
|----------------|----------------|
| "If verification FAILS: Prepare feedback" (vague) | What command to run |
| "Allow retry (up to max attempts)" | How to trigger retry |
| "Document what specifically failed" | Where to write feedback |
| - | What file location for feedback |
| - | How implementor receives feedback |
| - | Complete failure workflow steps |

**Gap**: Line 277-279 says "If verification **FAILS**: Prepare feedback for the implementor" but doesn't specify:
- Run `orchestra feedback --task X`
- Feedback goes to `.orchestra/handover/feedback.md`
- How to communicate to implementor

### Implementor Agent (`orchestra.implementor.agent.md`)

**Current State**: Has a "Handling Feedback" section but it's disconnected from reality.

| What's Present | What's Missing |
|----------------|----------------|
| "Run orchestra accept-signal to acknowledge" | This command doesn't exist for implementor |
| "Read the feedback carefully" | WHERE is the feedback file? |
| "Fix the issues" | ✓ Good |
| "Signal again" | ✓ Good |

**Gap**: Lines 262-273 reference `orchestra accept-signal` but:
- This is an ORCHESTRATOR command, not implementor
- Implementor has "exactly TWO CLI commands" (signal, accept-signal) - but accept-signal is orchestrator's
- No path to feedback file specified
- No guidance on running `orchestra next` to see RETRY status

### Handover Template (`agent_readme.md`)

**Current State**: No feedback/rejection handling at all.

| What's Present | What's Missing |
|----------------|----------------|
| Pre-signal validation | Post-signal rejection workflow |
| YTIYO principle | What happens if orchestrator rejects |
| - | Where to find feedback |
| - | How to re-signal after fixing |
| - | Retry limits |

---

## Current Broken Flow

```
Implementor signals completion
    ↓
orchestra accept-signal (fails verification)
    ↓
Verification result saved to orchestrator/results/ ✓
    ↓
progress.yaml NOT updated ✗
feedback NOT generated ✗
    ↓
Implementor runs `orchestra next`
    ↓
Shows "Verify" step (wrong - should show RETRY) ✗
    ↓
Implementor stuck - doesn't know what failed or where to find feedback
```

---

## Expected Fixed Flow (Option A: Auto-Generate)

```
Implementor signals completion
    ↓
orchestra accept-signal (fails verification)
    ↓
Verification result saved ✓
progress.yaml updated to VERIFY_FAILED ✓
Feedback auto-generated to handover/feedback.md ✓
CLI outputs: "Feedback written to .orchestra/handover/feedback.md" ✓
    ↓
Implementor runs `orchestra next`
    ↓
Shows "RETRY" step with guidance ✓
Points to feedback.md location ✓
    ↓
Implementor reads feedback.md, fixes issues, re-signals
```

---

## Root Causes

### 1. `orchestra feedback` Requires Programmatic Input

```typescript
// src/core/feedback.ts line 147-151
const verifyResult = options.verificationResult;
if (!verifyResult) {
  throw new OrchestraError(
    "No verification results provided. Run 'orchestra verify' first.",
```

The command expects verification results passed in memory, not read from disk.

### 2. `accept-signal` Doesn't Call Feedback Generation

The command exits after verification failure without:
- Updating progress.yaml
- Generating feedback
- Guiding next steps

### 3. Feedback File Location Mismatch

| Component | Expected Location |
|-----------|-------------------|
| `workflow-state.ts` | `.orchestra/handover/feedback.md` |
| `feedback.ts` | `.orchestra/handover/task-${id}-feedback.md` |
| Manual (observed) | `.orchestra/handover/feedback/task-001-signal-rejected.md` |

---

## Specification Reference

Full specification: [feedback-workflow-spec.md](../spec/implementation/phase-1-cli/feedback-workflow-spec.md)

---

## Implementation Tasks

### Phase A: Core (HIGH Priority)

| Task | Description | File | Est. |
|------|-------------|------|------|
| **T1** | Update `runFeedback` to read verification result from disk when not provided in memory | `src/core/feedback.ts` | 2h |
| **T2** | Standardize feedback path to `.orchestra/handover/feedback.md` | `src/core/feedback.ts` | 1h |
| **T3** | Update `feedback.md.hbs` template with failure_type, attempt_history, passed_checks | `templates/common/templates/feedback.md.hbs` | 2h |
| **T4** | Update `accept-signal` to auto-generate feedback on gate check failure | `src/commands/accept-signal.ts` | 3h |
| **T5** | Update `verify` to auto-generate feedback on verification failure | `src/commands/verify.ts` | 2h |
| **T6** | Add progress.yaml VERIFY_FAILED status update on failure | `src/commands/accept-signal.ts` | 1h |

**Phase A Total**: ~11h

### Phase B: Visibility (MEDIUM Priority)

| Task | Description | File | Est. |
|------|-------------|------|------|
| **T7** | Update `workflow-state.ts` feedback path check | `src/core/workflow-state.ts` | 1h |
| **T8** | Update `next` command to show feedback location on RETRY | `src/commands/next.ts` | 2h |
| **T9** | Update `agent_readme.md` with rejection/feedback workflow | `templates/handover/agent_readme.md` | 1h |
| **T10** | Update `orchestrator/readme.md` with feedback generation steps | `templates/orchestrator/readme.md` | 1h |
| **T11** | Update `02-task-verification.md` feedback section | `templates/orchestrator/processes/02-task-verification.md` | 1h |
| **T12** | Update `implementor/readme.md` with feedback file location | `templates/implementor/readme.md` | 30m |

**Phase B Total**: ~6.5h

### Phase C: Polish (LOW Priority)

| Task | Description | File | Est. |
|------|-------------|------|------|
| **T13** | Update `status` command to show feedback pending state | `src/commands/status.ts` | 1h |
| **T14** | Add minimal feedback validation (sections exist, timestamp fresh) | `src/core/feedback.ts` | 2h |
| **T15** | Write unit tests for feedback disk-read functionality | `test/core/feedback.test.ts` | 2h |
| **T16** | Write integration tests for accept-signal → feedback flow | `test/commands/accept-signal.test.ts` | 2h |
| **T17** | Sync all changes to `.orchestra/` folder | Multiple | 30m |

**Phase C Total**: ~7.5h

---

## Implementation Order (Recommended)

```
T1 → T2 → T3 → T4 → T6 → T5 → T7 → T8 → T9-T12 → T15-T16 → T13-T14 → T17
```

**Rationale**:
1. T1 (disk read) enables T4 and T5
2. T2 (path fix) needed before any feedback writes
3. T3 (template) can parallel with T1-T2
4. T4 (accept-signal) is the primary trigger
5. T6 (progress) needed for T7 (workflow-state)
6. T8 (next command) shows user the feedback
7. T9-T12 (docs) can be done in parallel
8. T15-T16 (tests) should cover the core changes
9. T17 (sync) is final step

---

## Detailed Task Specifications

### T1: Feedback Disk Read

**Current**:
```typescript
const verifyResult = options.verificationResult;
if (!verifyResult) {
  throw new OrchestraError("No verification results provided...");
}
```

**After**:
```typescript
let verifyResult = options.verificationResult;
if (!verifyResult) {
  verifyResult = loadVerificationResultFromDisk(taskId, orchestraRoot);
  if (!verifyResult) {
    throw new OrchestraError("No verification result found...");
  }
}
```

**New function**:
```typescript
function loadVerificationResultFromDisk(
  taskId: number,
  orchestraRoot: string
): VerifyResult | null {
  const resultPath = path.join(
    orchestraRoot, 
    '.orchestra/orchestrator/results',
    `task-${taskId}-verification.yaml`
  );
  
  if (!fs.existsSync(resultPath)) {
    return null;
  }
  
  return readYaml(resultPath, VerifyResultSchema);
}
```

### T2: Standardize Feedback Path

**Current**:
```typescript
const feedbackPath = path.join(paths.feedback, `task-${taskId}-feedback.md`);
```

**After**:
```typescript
const feedbackPath = path.join(paths.handovers, 'feedback.md');
```

### T4: Accept-Signal Auto-Feedback

**Add to gate check failure path**:
```typescript
if (!gateCheckResult.passed) {
  // Save gate check result
  await saveVerificationResult(taskId, gateCheckResult, orchestraRoot);
  
  // Update progress
  await updateProgressStatus(taskId, 'VERIFY_FAILED', orchestraRoot);
  
  // Generate feedback
  await runFeedback({
    task: String(taskId),
    failureType: 'gate_check',
    orchestraRoot
  });
  
  output.error(`Gate check failed. Feedback written to .orchestra/handover/feedback.md`);
  process.exit(1);
}
```

---

## Acceptance Criteria

- [ ] `orchestra accept-signal` auto-generates feedback on failure
- [ ] Feedback written to `.orchestra/handover/feedback.md`
- [ ] progress.yaml updated to VERIFY_FAILED on failure
- [ ] `orchestra next` shows RETRY step when feedback exists
- [ ] `orchestra feedback` works standalone (reads verification from disk)
- [ ] Handover agent_readme.md documents rejection workflow
- [ ] Orchestrator agent readme documents failure workflow with commands
- [ ] Implementor agent readme has correct feedback handling (no accept-signal)
- [ ] All existing tests pass
- [ ] New tests cover failure path

---

## Test Scenarios

### Scenario 1: Verification Failure Auto-Feedback

```bash
# Setup: Task prepared, implementor has signaled
orchestra accept-signal --task 1
# Expected: Verification fails
# Expected: Feedback written to .orchestra/handover/feedback.md
# Expected: progress.yaml shows VERIFY_FAILED
# Expected: Output includes feedback path
```

### Scenario 2: Next Shows Retry

```bash
# After accept-signal failure
orchestra next
# Expected: Shows "RETRY" step
# Expected: Points to feedback.md
# Expected: Guides implementor on next actions
```

### Scenario 3: Standalone Feedback

```bash
# After accept-signal failure (feedback already generated)
orchestra feedback --task 1 --message "Additional notes"
# Expected: Updates feedback.md with custom message
# Expected: Does not require programmatic input
```

---

## Related Files

| File | Change Type | Tasks |
|------|-------------|-------|
| `src/core/feedback.ts` | Modify | T1, T2, T14 |
| `src/commands/accept-signal.ts` | Modify | T4, T6 |
| `src/commands/verify.ts` | Modify | T5 |
| `src/core/workflow-state.ts` | Modify | T7 |
| `src/commands/next.ts` | Modify | T8 |
| `src/commands/status.ts` | Modify | T13 |
| `templates/common/templates/feedback.md.hbs` | Modify | T3 |
| `templates/handover/agent_readme.md` | Modify | T9 |
| `templates/orchestrator/readme.md` | Modify | T10 |
| `templates/orchestrator/processes/02-task-verification.md` | Modify | T11 |
| `templates/implementor/readme.md` | Modify | T12 |
| `test/core/feedback.test.ts` | Add tests | T15 |
| `test/commands/accept-signal.test.ts` | Add tests | T16 |

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Single vs. multiple templates | Single | Simpler for implementor |
| Feedback file location | `handover/feedback.md` | Neutral zone, matches workflow-state |
| Auto-generate on failure | Yes | Reduces manual steps |
| Validation level | Minimal | Feedback is machine-generated |

---

## Notes

- This debt was discovered during dogfood testing of the MCP server sprint
- The `.orchestra/` instance in the repo is being used as a testing ground
- After fixing, the sprint will be restarted with a clean state
- **Spec document**: See [feedback-workflow-spec.md](../spec/implementation/phase-1-cli/feedback-workflow-spec.md) for full details
