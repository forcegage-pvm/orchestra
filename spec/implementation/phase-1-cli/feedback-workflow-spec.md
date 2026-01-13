# Feedback Workflow Specification

> **Status**: DRAFT  
> **Version**: 0.1.0  
> **Created**: 2025-12-07  
> **Related**: [TD-011-feedback-workflow.md](../../../technical-debt/TD-011-feedback-workflow.md)

---

## Executive Summary

This specification defines the system changes required to implement a complete feedback workflow for inter-agent failure communication. The goal is to enable the Orchestrator to provide actionable feedback to the Implementor when verification fails, through a file-based communication channel.

**Scope**: This spec covers only **inter-agent failures** (V3: Gate Check, VF: Verification). Internal failures are resolved by CLI output and are explicitly out of scope.

---

## Table of Contents

1. [Background](#1-background)
2. [Impact Areas](#2-impact-areas)
3. [Template Architecture](#3-template-architecture)
4. [Agent Instruction Updates](#4-agent-instruction-updates)
5. [CLI Command Changes](#5-cli-command-changes)
6. [Feedback Validation](#6-feedback-validation)
7. [Additional Considerations](#7-additional-considerations)
8. [Implementation Tasks](#8-implementation-tasks)

---

## 1. Background

### 1.1 Problem Statement

When `orchestra accept-signal` or `orchestra verify` fails, the implementor agent cannot see the orchestrator's terminal output. Without a file-based communication channel, the implementor has no guidance on what failed or how to fix it.

### 1.2 Current State

| Component | State | Problem |
|-----------|-------|---------|
| `accept-signal` | Exits on failure | No feedback generation |
| `feedback.ts` | Requires in-memory result | Can't read verification from disk |
| Feedback location | `task-{id}-feedback.md` | Should be `feedback.md` |
| `workflow-state.ts` | Checks `feedback.md` | Doesn't match actual output |
| Agent instructions | Incomplete | Missing failure workflow |
| Progress tracking | Not updated | No VERIFY_FAILED state |

### 1.3 Design Principle

**Inter-agent failures require explicit file-based communication** because:
- Agents operate in separate sessions
- Implementor cannot see Orchestrator's terminal
- Hidden verification criteria must not leak

**Internal failures do NOT require this workflow** because:
- Same agent sees their own CLI output
- No cross-agent communication needed

---

## 2. Impact Areas

### 2.1 Agent Instructions

| File | Updates Required | Priority |
|------|------------------|----------|
| `templates/handover/agent_readme.md` | Add rejection/feedback workflow | HIGH |
| `templates/orchestrator/readme.md` | Add feedback generation steps | MEDIUM |
| `templates/orchestrator/processes/02-task-verification.md` | Update feedback section | HIGH |
| `templates/implementor/readme.md` | Add feedback file location | MEDIUM |

**Affected Sections**:
- Implementor: What to do when signal is rejected
- Orchestrator: How to generate feedback on failure
- Both: Canonical feedback file location

### 2.2 Templates

| Template | Purpose | Status |
|----------|---------|--------|
| `feedback.md.hbs` | Feedback document for implementor | EXISTS - needs update |

**Decision**: Single template for all failure types (see Decision Log).

### 2.3 CLI Commands

| Command | Current | Required Change |
|---------|---------|-----------------|
| `accept-signal` | Exits on failure | Auto-generate feedback, update progress |
| `verify` | Exits on failure | Auto-generate feedback if `--feedback` flag |
| `feedback` | Requires in-memory result | Read verification from disk |
| `next` | Shows workflow state | Show RETRY status with feedback location |
| `status` | Basic status | Show feedback pending state |

### 2.4 Core Functions

| Function | File | Changes |
|----------|------|---------|
| `runAcceptSignal` | `accept-signal.ts` | Add feedback generation on failure |
| `runFeedback` | `feedback.ts` | Read verification result from disk |
| `getWorkflowState` | `workflow-state.ts` | Update feedback path check |
| `loadVerificationResult` | NEW | Read saved verification YAML |

### 2.5 File Locations

| Artifact | Current Location | Proposed Location |
|----------|------------------|-------------------|
| Feedback file | `.orchestra/feedback/task-{id}-feedback.md` | `.orchestra/handover/feedback.md` |
| Verification result | `.orchestra/orchestrator/results/task-{id}-verification.yaml` | Same (no change) |

**Rationale**: `handover/` is the neutral exchange zone. Single `feedback.md` file is simpler for implementor to find.

### 2.6 Validation

| Validation Type | Current | Proposed |
|-----------------|---------|----------|
| Feedback format | None | Validate required sections |
| Feedback freshness | None | Check timestamp vs. last signal |
| Feedback completeness | None | Check issue list not empty |

---

## 3. Template Architecture

### 3.1 Decision: Single Template vs. Multiple Templates

**Option A: Single Template** (Recommended)
- One `feedback.md.hbs` template for all inter-agent failures
- Template uses conditionals for failure-type-specific content
- Simpler for implementor: always same location, same format

**Option B: Multiple Templates**
- `feedback-gate-check.md.hbs` for V3 failures
- `feedback-verification.md.hbs` for VF failures
- More specialized content per failure type
- More complex: implementor must check multiple locations

**Recommendation**: Option A (Single Template) because:
1. Implementor always knows where to look
2. Reduces cognitive load
3. Template can still vary content internally
4. Matches current `workflow-state.ts` expectations

### 3.2 Template Structure

```handlebars
# Feedback: Task {{task_id}} - Attempt {{attempt}}

## Metadata

| Field | Value |
|-------|-------|
| Task ID | {{task_id}} |
| Attempt | {{attempt}} of {{max_attempts}} |
| Generated at | {{timestamp}} |

---

## Summary

{{summary}}

---

## What Went Wrong

{{#each issues}}
### Issue {{add @index 1}}: {{this.category}}

**Severity**: {{this.severity}}

**Problem**: {{this.problem}}

**Impact**: {{this.impact}}

**Guidance**: {{this.guidance}}

{{/each}}

---

## What Worked

{{#if passed_checks}}
{{#each passed_checks}}
- ✅ {{this}}
{{/each}}
{{else}}
No checks passed in this verification cycle.
{{/if}}

---

## Next Steps

{{#if can_retry}}
1. Review each issue above carefully
2. Make the necessary corrections
3. Run `orchestra pre-signal-check`
4. Signal completion when ready

**Remaining attempts**: {{remaining_attempts}}
{{else}}
⚠️ **Maximum attempts reached**

This task will be escalated to human review.
{{/if}}

---

_Generated by Orchestra CLI at {{timestamp}}_
```

**Note**: Attempt history is NOT in the template. Previous attempts are archived to `feedback-history/attempt-{N}.md` instead.

### 3.3 Template Data Model

```typescript
interface FeedbackTemplateContext {
  task_id: number;
  attempt: number;
  max_attempts: number;
  remaining_attempts: number;
  can_retry: boolean;
  timestamp: string;
  summary: string;
  issues: FeedbackIssue[];
  passed_checks?: string[];  // Verification checks that passed (descriptions only)
  // Note: No failure_type - implementor just needs issues, not source
  // Note: No attempt_history - archived to separate files instead
}

interface FeedbackIssue {
  severity: 'critical' | 'major' | 'minor';
  category: string;
  problem: string;
  impact: string;
  guidance: string;
}
```

---

## 4. Agent Instruction Updates

### 4.1 Handover Agent README (`agent_readme.md`)

**Add new section after "Signal Completion"**:

```markdown
## If Your Signal is Rejected

If the orchestrator rejects your completion signal, a feedback file will be created.

### Reading Feedback

```bash
# Check workflow status
orchestra next

# If status shows RETRY, read feedback:
cat .orchestra/handover/feedback.md
```

### Feedback File Location

**Canonical location**: `.orchestra/handover/feedback.md`

This file contains:
- What specifically failed
- Severity of each issue
- Guidance on how to fix
- Remaining retry attempts

### Retry Workflow

1. Read `.orchestra/handover/feedback.md`
2. Fix ALL issues listed (don't cherry-pick)
3. Run `orchestra pre-signal-check`
4. Update `completion-signal.md` with fixes
5. Signal: "ready for review"

### Maximum Retries

You have 3 attempts per task (configurable). After max retries:
- Task is escalated to human supervisor
- You cannot continue without intervention
```

### 4.2 Orchestrator README (`orchestrator/readme.md`)

**Update "If Task FAILS" section**:

```markdown
### If Task FAILS

When verification fails, you MUST:

1. **Let the CLI generate feedback automatically**
   - `orchestra accept-signal` generates feedback on gate check failure
   - `orchestra verify` generates feedback on verification failure

2. **Verify feedback was written**
   ```bash
   cat .orchestra/handover/feedback.md
   ```

3. **Notify implementor**
   Say: "Verification failed. Read `.orchestra/handover/feedback.md` for required fixes."

4. **Check retry limit**
   If this was attempt 3 of 3, escalate to human.
```

### 4.3 Task Verification Process (`02-task-verification.md`)

**Update section 7a**:

```markdown
### 7a. Feedback Generation (Automatic)

When `orchestra accept-signal` or `orchestra verify` fails, feedback is **automatically generated** to:

```
.orchestra/handover/feedback.md
```

**DO NOT manually create feedback** - the CLI handles this.

The generated feedback includes:
- Issues found (with severity)
- Actionable guidance
- Retry count and limits
- Attempt history

**If you need to regenerate feedback manually**:

```bash
orchestra feedback --task N
```

This reads the saved verification result and regenerates the feedback file.
```

### 4.4 Implementor README (`implementor/readme.md`)

**Update "After Failed Verification" section**:

```markdown
### After Failed Verification

If your signal is rejected:

1. **Check status**
   ```bash
   orchestra next
   ```
   This shows RETRY status and feedback location.

2. **Read feedback**
   ```
   READ .orchestra/handover/feedback.md
   ```

3. **Address ALL issues**
   - Don't cherry-pick - fix everything
   - Each issue has severity and guidance

4. **Re-validate**
   ```bash
   orchestra pre-signal-check
   ```

5. **Signal again**
   Update completion-signal.md and say "ready for review"
```

---

## 5. CLI Command Changes

### 5.1 `orchestra accept-signal` Changes

**Current behavior**:
- Runs gate checks
- If fails: prints error, exits with code 1
- Does NOT: update progress, generate feedback

**New behavior**:
```
IF gate check PASSES:
  → Continue to verification (unchanged)

IF gate check FAILS:
  → Save gate check result to disk
  → Update progress.yaml to VERIFY_FAILED
  → Auto-generate feedback.md
  → Print: "Gate check failed. Feedback written to .orchestra/handover/feedback.md"
  → Exit with code 1
```

**Implementation changes to `src/commands/accept-signal.ts`**:

```typescript
// After gate check failure:
if (!gateCheckResult.passed) {
  // 1. Save result
  await saveVerificationResult(taskId, gateCheckResult, orchestraRoot);
  
  // 2. Update progress
  await updateProgress(taskId, 'VERIFY_FAILED', orchestraRoot);
  
  // 3. Generate feedback
  await runFeedback({
    task: String(taskId),
    failureType: 'gate_check',
    orchestraRoot
  });
  
  // 4. Output
  console.log(`Gate check failed. Feedback written to .orchestra/handover/feedback.md`);
  process.exit(1);
}
```

### 5.2 `orchestra verify` Changes

**Command Separation Note**: `accept-signal` only runs gate checks. `verify` runs verification checks. These are separate commands - the orchestrator runs them sequentially:
```
orchestra accept-signal  →  (if passed)  →  orchestra verify  →  (if passed)  →  orchestra complete
```

**Current behavior**:
- Runs verification checks
- If fails: prints result, exits
- Does NOT: generate feedback automatically

**New behavior**:
```
IF verification PASSES:
  → Print success, exit 0

IF verification FAILS:
  → Save verification result
  → Update progress.yaml
  → Auto-generate feedback.md
  → Print: "Verification failed. Feedback written to .orchestra/handover/feedback.md"
  → Exit with code 1
```

### 5.3 `orchestra feedback` Changes

**Current behavior**:
- Requires `verificationResult` passed in memory
- Cannot run standalone

**New behavior**:
- If `verificationResult` not provided, read from disk
- Read from `.orchestra/orchestrator/results/task-{id}-verification.yaml`
- Fail gracefully if file not found

**Implementation changes to `src/core/feedback.ts`**:

```typescript
// Add function to load verification from disk
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

// In runFeedback():
let verifyResult = options.verificationResult;
if (!verifyResult) {
  verifyResult = loadVerificationResultFromDisk(taskId, orchestraRoot);
  if (!verifyResult) {
    throw new OrchestraError(
      'No verification result found. Run verification first.',
      'VALIDATION_ERROR'
    );
  }
}
```

### 5.4 `orchestra next` Changes

**Current behavior**:
- Shows current workflow state
- Does not highlight feedback presence

**New behavior**:
- If state is RETRY and feedback.md exists:
  ```
  Status: RETRY (Attempt 2 of 3)
  
  Feedback available: .orchestra/handover/feedback.md
  
  Next step: Read feedback, fix issues, run pre-signal-check, signal again.
  ```

### 5.5 `orchestra status` Changes

**Current behavior**:
- Shows task status from progress.yaml
- No feedback indication

**New behavior**:
- If task status is VERIFY_FAILED or RETRY:
  - Show feedback file location
  - Show retry count

---

## 6. Feedback Validation

### 6.1 Should Feedback Be Validated?

**Arguments FOR validation**:
- Ensures feedback is actionable
- Catches missing sections
- Maintains quality

**Arguments AGAINST validation**:
- Feedback is Orchestrator-generated (machine)
- Validation adds complexity
- Orchestrator already ensures quality

**Decision**: Minimal validation only

### 6.2 Minimal Validation Rules

```typescript
interface FeedbackValidation {
  // Required sections
  hasTaskId: boolean;
  hasAttemptInfo: boolean;
  hasAtLeastOneIssue: boolean;
  hasNextSteps: boolean;
  
  // Freshness check
  isTimestampRecent: boolean;  // < 24 hours
}
```

### 6.3 When Validation Runs

| Trigger | Validation |
|---------|------------|
| `orchestra next` (implementor) | Check feedback.md exists, is recent |
| `orchestra accept-signal` (orchestrator) | Validate generated feedback before write |
| `orchestra feedback` (orchestrator) | Validate generated feedback before write |

### 6.4 Validation Errors

If validation fails during generation:
- Log warning but still write file
- Feedback with issues > no feedback

If validation fails during read:
- Warn implementor feedback may be stale or incomplete
- Still show location

---

## 7. Additional Considerations

### 7.1 Feedback File Lifecycle

| Event | Action |
|-------|--------|
| Task starts | No feedback.md exists |
| Gate check fails (attempt 1) | Create `feedback.md` |
| Verification fails (attempt 1) | Create `feedback.md` |
| Verification fails (attempt 2+) | Archive previous → Create new `feedback.md` |
| Task passes verification | Delete `feedback.md` from handover/ (history stays) |
| `orchestra closeout` | Clean up `feedback-history/` folder |

### 7.2 Feedback Archive Strategy

**Decision**: Archive previous feedback before creating new.

```
.orchestra/
├── handover/
│   ├── feedback.md              ← Always current attempt
│   └── feedback-history/        ← Archived attempts
│       ├── attempt-1.md
│       └── attempt-2.md
```

**Archive Flow**:
```
IF feedback.md exists:
  → Determine current attempt number from progress.yaml (count VERIFY_FAILED/RETRY entries for task)
  → Move feedback.md → feedback-history/attempt-{N}.md
  → Create new feedback.md
ELSE:
  → Create feedback.md (attempt 1)
```

**Attempt Number Calculation**:
```typescript
// Count entries for this task with status VERIFY_FAILED or RETRY
const attemptEntries = progress.entries.filter(
  e => e.task_id === taskId && 
  (e.status === 'VERIFY_FAILED' || e.status === 'RETRY')
);
const currentAttempt = attemptEntries.length + 1;
```

**Naming Convention**: `attempt-{N}.md` where N is the attempt that failed (not the upcoming attempt).

**Benefits**:
- `feedback.md` always contains current issues only
- Full history preserved for debugging/escalation
- No template complexity (no embedded history section)
- Human supervisor can review all attempts if escalation needed

### 7.3 Multiple Failure Cycles

**Scenario**: Task fails verification 3 times.

**Handling**:
```
Attempt 1: fail → feedback.md created
Attempt 2: fail → feedback.md → feedback-history/attempt-1.md, new feedback.md
Attempt 3: fail → feedback.md → feedback-history/attempt-2.md, new feedback.md, ESCALATE
```

After max retries, escalation includes all archived feedback for context.

### 7.4 Hidden Criteria Protection

**CRITICAL**: Feedback must NOT leak verification criteria.

**Current protection in `feedback.ts`**:
```typescript
// ALLOWED in output:
// - description (human-readable)
// - severity

// FORBIDDEN in output:
// - check.type (file_exists, pattern_match, etc.)
// - check.path (file paths from hidden criteria)
// - check.pattern (regex patterns)
```

**No changes needed** - existing sanitization is correct.

### 7.4 Concurrent Tasks

**Scenario**: Multiple tasks in progress (future feature).

**Handling**:
- Feedback file per task: `feedback-task-{id}.md`
- Or single feedback.md with task ID in content
- Decision: Defer to Phase 2

### 7.5 Error Recovery

**Scenario**: Feedback generation fails.

**Handling**:
1. Log error to console
2. Update progress.yaml to VERIFY_FAILED
3. Print manual instructions:
   ```
   Feedback generation failed. Manually create:
   .orchestra/handover/feedback.md
   
   Include: task ID, issues found, retry guidance.
   ```

---

## 8. Implementation Tasks

### 8.1 Task Breakdown

| ID | Task | Priority | Estimate | Dependencies |
|----|------|----------|----------|--------------|
| T1 | Update `feedback.ts` to read verification from disk | HIGH | 2h | - |
| T2 | Update `accept-signal.ts` to auto-generate feedback | HIGH | 3h | T1 |
| T3 | Update `verify.ts` to auto-generate feedback | HIGH | 2h | T1 |
| T4 | Standardize feedback path to `handover/feedback.md` | HIGH | 1h | T1 |
| T5 | Update `workflow-state.ts` feedback path check | MEDIUM | 1h | T4 |
| T6 | Update `next` command to show feedback location | MEDIUM | 2h | T4, T5 |
| T7 | Update `status` command for feedback state | LOW | 1h | T4 |
| T8 | Update `feedback.md.hbs` template | HIGH | 2h | - |
| T9 | Update `agent_readme.md` with rejection workflow | HIGH | 1h | - |
| T10 | Update `orchestrator/readme.md` | MEDIUM | 1h | - |
| T11 | Update `02-task-verification.md` | MEDIUM | 1h | - |
| T12 | Update `implementor/readme.md` | MEDIUM | 30m | - |
| T13 | Add feedback validation (minimal) | LOW | 2h | T8 |
| T14 | Add progress.yaml VERIFY_FAILED status update | HIGH | 1h | T2 |
| T15 | Write unit tests for feedback workflow | HIGH | 3h | T1-T4 |
| T16 | Write integration tests | MEDIUM | 2h | T15 |
| T17 | Sync changes to `.orchestra/` folder | MEDIUM | 30m | T8-T12 |

### 8.2 Recommended Implementation Order

**Phase A: Core (HIGH priority)**
1. T1 - feedback.ts disk read
2. T4 - standardize path
3. T8 - update template
4. T2 - accept-signal auto-feedback
5. T3 - verify auto-feedback
6. T14 - progress update

**Phase B: Visibility (MEDIUM priority)**
1. T5 - workflow-state path
2. T6 - next command update
3. T9 - agent_readme update
4. T10-T12 - other docs

**Phase C: Polish (LOW priority)**
1. T7 - status command
2. T13 - validation
3. T15-T16 - tests
4. T17 - sync

---

## Appendix A: File Location Reference

| Artifact | Path |
|----------|------|
| Feedback file | `.orchestra/handover/feedback.md` |
| Verification result | `.orchestra/orchestrator/results/task-{id}-verification.yaml` |
| Pre-signal artifact | `.orchestra/implementor/artifacts/pre-signal/task-{id}-*.txt` |
| Completion signal | `.orchestra/handover/completion-signal.md` |
| Progress tracking | `.orchestra/progress.yaml` |
| Manifest | `.orchestra/manifest.yaml` |

---

## Appendix B: State Transitions

```
IMPLEMENT
    │
    ▼
Implementor signals ──────────────────┐
    │                                 │
    ▼                                 │
accept-signal                         │
    │                                 │
    ├── PASS ──▶ VERIFY               │
    │               │                 │
    │               ├── PASS ──▶ COMPLETE
    │               │                 │
    │               └── FAIL ──┐      │
    │                          │      │
    └── FAIL ──────────────────┴──▶ VERIFY_FAILED
                                      │
                                      ▼
                               Generate feedback.md
                                      │
                                      ▼
                              [Implementor reads]
                                      │
                                      ▼
                                   RETRY
                                      │
                                      ▼
                              Implementor fixes
                                      │
                                      ▼
                              Implementor signals
                                      │
                                      └──────────────────┘
```

---

## Appendix C: Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Single vs. multiple templates | Single | Simpler for implementor |
| Feedback file location | `handover/feedback.md` | Neutral zone, matches workflow-state |
| Auto-generate on failure | Yes | Reduces manual steps, ensures consistency |
| Validation level | Minimal | Feedback is machine-generated |
| Attempt history strategy | Archive to `feedback-history/` | Fresh file per attempt, full history preserved |
| Gate check vs verification | No distinction | Implementor just needs issues, not failure source |
| Attempt number source | Count progress.yaml entries | Existing infrastructure, no state duplication |
| Feedback cleanup | `closeout` handles | Keeps feedback workflow focused, single responsibility |
| Retry signal format | Same as first signal | System tracks attempt via progress.yaml, implementor unaware |
| Custom feedback message | Deferred to Phase 2 | Auto-generated sufficient for MVP, manual edit possible |
| Escalation trigger | Manual (`orchestra escalate`) | Orchestrator reviews before formally escalating |
| Summary generation | Auto-generate from issues | Deterministic, always accurate, no extra data needed |

---

_End of Specification_
