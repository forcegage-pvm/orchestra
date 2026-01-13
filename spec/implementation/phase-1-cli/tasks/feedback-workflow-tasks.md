# Feedback Workflow Implementation Tasks

> **Spec**: [feedback-workflow-spec.md](../feedback-workflow-spec.md)  
> **TD Reference**: [TD-011-feedback-workflow.md](../../../../technical-debt/TD-011-feedback-workflow.md)  
> **Created**: 2025-12-07  
> **Total Estimate**: ~25 hours

---

## Overview

This document contains detailed implementation tasks for the feedback workflow feature. Tasks are organized into three phases:

- **Phase A (Core)**: Essential functionality - must complete first
- **Phase B (Visibility)**: User-facing improvements
- **Phase C (Polish)**: Tests, validation, cleanup

---

## Phase A: Core Implementation

### T1: Enable Feedback to Read Verification from Disk

**Priority**: HIGH  
**Estimate**: 2 hours  
**Dependencies**: None  
**File**: `src/core/feedback.ts`

#### Objective

Allow `runFeedback()` to work standalone by reading verification results from disk when not provided in memory.

#### Current State

```typescript
const verifyResult = options.verificationResult;
if (!verifyResult) {
  throw new OrchestraError(
    "No verification results provided. Run 'orchestra verify' first.",
    "VALIDATION_ERROR"
  );
}
```

#### Implementation

1. **Add function to load verification from disk**:

```typescript
import { readYaml } from "./yaml.js";
import type { VerifyResult } from "./verification.js";

/**
 * Load verification result from disk.
 * Results are saved to: .orchestra/orchestrator/results/task-{id}-verification.yaml
 */
function loadVerificationResultFromDisk(
  taskId: number,
  orchestraRoot: string
): VerifyResult | null {
  const paths = getResolvedPaths(orchestraRoot, loadConfig(orchestraRoot));
  const resultPath = path.join(
    paths.orchestratorResults,
    `task-${taskId}-verification.yaml`
  );

  if (!fs.existsSync(resultPath)) {
    return null;
  }

  try {
    // Note: May need to create VerifyResultSchema if not exists
    const result = readYaml(resultPath, VerifyResultSchema);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
```

2. **Update `runFeedback()` to use disk fallback**:

```typescript
// In runFeedback():
let verifyResult = options.verificationResult;
if (!verifyResult) {
  verifyResult = loadVerificationResultFromDisk(taskId, orchestraRoot);
  if (!verifyResult) {
    throw new OrchestraError(
      "No verification result found on disk. Run 'orchestra verify' or 'orchestra accept-signal' first.",
      "VALIDATION_ERROR"
    );
  }
}
```

3. **Export the loader function** for use by other commands.

#### Acceptance Criteria

- [ ] `orchestra feedback --task 1` works after `orchestra verify` saved result
- [ ] Error message is clear when no result exists
- [ ] Existing in-memory path still works (for auto-generation)

#### Tests

- Unit test: Load verification result from disk
- Unit test: Handle missing file gracefully
- Unit test: Handle corrupted YAML gracefully

---

### T4: Standardize Feedback Path

**Priority**: HIGH  
**Estimate**: 1 hour  
**Dependencies**: T1  
**File**: `src/core/feedback.ts`

#### Objective

Change feedback output from `task-{id}-feedback.md` to single `feedback.md` file.

#### Current State

```typescript
const feedbackPath = path.join(paths.feedback, `task-${taskId}-feedback.md`);
```

#### Implementation

1. **Update feedback path**:

```typescript
// Canonical location: .orchestra/handover/feedback.md
const feedbackPath = path.join(paths.handovers, "feedback.md");
```

2. **Add archive logic** (before writing new feedback):

```typescript
/**
 * Archive existing feedback before creating new one.
 * Archives to: .orchestra/handover/feedback-history/attempt-{N}.md
 */
async function archiveExistingFeedback(
  feedbackPath: string,
  handoverPath: string,
  attemptNumber: number
): Promise<void> {
  if (!fs.existsSync(feedbackPath)) {
    return; // No existing feedback to archive
  }

  const historyDir = path.join(handoverPath, "feedback-history");
  fs.mkdirSync(historyDir, { recursive: true });

  const archivePath = path.join(historyDir, `attempt-${attemptNumber}.md`);
  fs.renameSync(feedbackPath, archivePath);
}
```

3. **Calculate attempt number from progress.yaml**:

```typescript
/**
 * Count failed attempts for a task from progress.yaml
 */
function getAttemptNumber(progress: Progress, taskId: number): number {
  const failedEntries = progress.entries.filter(
    (e) =>
      e.task_id === taskId &&
      (e.status === "VERIFY_FAILED" || e.status === "RETRY")
  );
  return failedEntries.length + 1;
}
```

4. **Update runFeedback to archive before write**:

```typescript
// Before writing feedback:
const currentAttempt = getAttemptNumber(progress, taskId);
await archiveExistingFeedback(feedbackPath, paths.handovers, currentAttempt - 1);

// Write new feedback
fs.writeFileSync(feedbackPath, feedbackContent);
```

#### Acceptance Criteria

- [ ] Feedback always written to `.orchestra/handover/feedback.md`
- [ ] Previous feedback archived to `feedback-history/attempt-{N}.md`
- [ ] Attempt number correctly calculated from progress.yaml

#### Tests

- Unit test: Archive existing feedback
- Unit test: Calculate attempt number
- Unit test: First attempt (no archive needed)

---

### T8: Update Feedback Template

**Priority**: HIGH  
**Estimate**: 2 hours  
**Dependencies**: None  
**File**: `templates/common/templates/feedback.md.hbs`

#### Objective

Update template to match spec structure with auto-generated summary.

#### Current Template

See existing `feedback.md.hbs` - needs restructuring.

#### New Template

```handlebars
# Feedback: Task {{task_id}} - Attempt {{attempt}}

## Metadata

| Field | Value |
|-------|-------|
| Task ID | {{task_id}} |
| Attempt | {{attempt}} of {{max_attempts}} |
| Remaining | {{remaining_attempts}} |
| Generated at | {{timestamp}} |

---

## Summary

{{summary}}

---

## Issues Found

{{#each issues}}
### Issue {{add @index 1}}: {{this.category}}

**Severity**: {{upper this.severity}}

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
No verification checks passed in this cycle.
{{/if}}

---

## Next Steps

{{#if can_retry}}
1. Review each issue above carefully
2. Make the necessary corrections
3. Run `orchestra pre-signal-check`
4. Signal completion: "ready for review"

**You have {{remaining_attempts}} attempt(s) remaining.**
{{else}}
⚠️ **Maximum attempts reached**

Run `orchestra escalate --task {{task_id}}` to escalate to human review.
{{/if}}

---

_Generated by Orchestra CLI at {{timestamp}}_
```

#### Implementation

1. Replace content of `templates/common/templates/feedback.md.hbs`
2. Register `upper` and `add` Handlebars helpers if not exists
3. Update `src/core/feedback.ts` to generate summary:

```typescript
function generateSummary(issues: FeedbackIssue[]): string {
  if (issues.length === 0) {
    return "Verification completed but no specific issues were identified.";
  }
  if (issues.length === 1) {
    return `Verification failed: ${issues[0].problem}`;
  }
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  if (criticalCount > 0) {
    return `Verification failed with ${issues.length} issues (${criticalCount} critical). Primary: ${issues[0].problem}`;
  }
  return `Verification failed with ${issues.length} issues. Primary: ${issues[0].problem}`;
}
```

4. Update template context building:

```typescript
const templateContext: FeedbackTemplateContext = {
  task_id: taskId,
  attempt: currentAttempt,
  max_attempts: maxAttempts,
  remaining_attempts: maxAttempts - currentAttempt,
  can_retry: currentAttempt < maxAttempts,
  timestamp: new Date().toISOString(),
  summary: generateSummary(issues),
  issues,
  passed_checks: getPassedChecks(verifyResult), // Extract passed check descriptions
};
```

#### Acceptance Criteria

- [ ] Template renders correctly with all fields
- [ ] Summary auto-generated from issues
- [ ] `can_retry` logic correct
- [ ] Helpers registered and working

#### Tests

- Unit test: Template renders with issues
- Unit test: Template renders with no issues
- Unit test: Template renders when can_retry=false
- Unit test: Summary generation

---

### T2: Auto-Generate Feedback in accept-signal

**Priority**: HIGH  
**Estimate**: 3 hours  
**Dependencies**: T1, T4, T8  
**File**: `src/commands/accept-signal.ts`

#### Objective

When gate check fails, automatically generate feedback and update progress.

#### Current State

Command exits with error on failure, no feedback generated.

#### Implementation

1. **Import feedback function**:

```typescript
import { runFeedback } from "../core/feedback.js";
import { addProgressEntry, saveProgress } from "../core/progress.js";
```

2. **Add feedback generation on gate check failure**:

```typescript
// After gate check fails:
if (!gateCheckResult.passed) {
  // 1. Save gate check result to disk for feedback to read
  await saveVerificationResult(taskId, gateCheckResult, orchestraRoot);

  // 2. Update progress to VERIFY_FAILED
  const updatedProgress = addProgressEntry(progress, {
    task_id: taskId,
    status: "VERIFY_FAILED",
    notes: `Gate check failed: ${gateCheckResult.summary || "See feedback"}`,
  });
  saveProgress(updatedProgress, orchestraRoot);

  // 3. Generate feedback
  try {
    const feedbackResult = await runFeedback({
      task: String(taskId),
      orchestraRoot,
    });

    output.error("Gate check failed.");
    output.info(`Feedback written to: ${feedbackResult.feedbackPath}`);

    if (!feedbackResult.canRetry) {
      output.warn(
        "Maximum attempts reached. Run: orchestra escalate --task " + taskId
      );
    }
  } catch (feedbackError) {
    output.error("Gate check failed. Feedback generation also failed.");
    output.info("Manually create: .orchestra/handover/feedback.md");
  }

  process.exit(1);
}
```

3. **Add function to save verification/gate-check result**:

```typescript
async function saveVerificationResult(
  taskId: number,
  result: GateCheckResult | VerifyResult,
  orchestraRoot: string
): Promise<void> {
  const paths = getResolvedPaths(orchestraRoot, loadConfig(orchestraRoot));
  const resultPath = path.join(
    paths.orchestratorResults,
    `task-${taskId}-verification.yaml`
  );

  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, yaml.stringify(result));
}
```

#### Acceptance Criteria

- [ ] Gate check failure generates feedback.md
- [ ] Progress updated to VERIFY_FAILED
- [ ] Feedback path output to console
- [ ] Max retry warning shown when appropriate
- [ ] Graceful handling if feedback generation fails

#### Tests

- Integration test: Gate check fail → feedback generated
- Integration test: Progress updated on failure
- Unit test: Save verification result

---

### T3: Auto-Generate Feedback in verify

**Priority**: HIGH  
**Estimate**: 2 hours  
**Dependencies**: T1, T4, T8  
**File**: `src/commands/verify.ts`

#### Objective

When verification fails, automatically generate feedback and update progress.

#### Implementation

Same pattern as T2, but for verification command:

```typescript
// After verification fails:
if (!verifyResult.passed) {
  // 1. Save result (may already be saved by verify logic)
  await saveVerificationResult(taskId, verifyResult, orchestraRoot);

  // 2. Update progress
  const updatedProgress = addProgressEntry(progress, {
    task_id: taskId,
    status: "VERIFY_FAILED",
    notes: `Verification failed: ${verifyResult.summary || "See feedback"}`,
  });
  saveProgress(updatedProgress, orchestraRoot);

  // 3. Generate feedback
  try {
    const feedbackResult = await runFeedback({
      task: String(taskId),
      verificationResult: verifyResult, // Can pass directly since we have it
      orchestraRoot,
    });

    output.error("Verification failed.");
    output.info(`Feedback written to: ${feedbackResult.feedbackPath}`);

    if (!feedbackResult.canRetry) {
      output.warn(
        "Maximum attempts reached. Run: orchestra escalate --task " + taskId
      );
    }
  } catch (feedbackError) {
    output.error("Verification failed. Feedback generation also failed.");
  }

  process.exit(1);
}
```

#### Acceptance Criteria

- [ ] Verification failure generates feedback.md
- [ ] Progress updated to VERIFY_FAILED
- [ ] Console output guides user
- [ ] Existing verification result passed to feedback (optimization)

#### Tests

- Integration test: Verify fail → feedback generated
- Integration test: Multiple failures create archive

---

### T14: Add VERIFY_FAILED Status Support

**Priority**: HIGH  
**Estimate**: 1 hour  
**Dependencies**: T2  
**Files**: `src/core/types.ts`, `src/core/progress.ts`

#### Objective

Ensure VERIFY_FAILED is a valid progress status.

#### Implementation

1. **Check types.ts for TaskStatus**:

```typescript
// Ensure VERIFY_FAILED is in the enum/union
export const TaskStatusSchema = z.enum([
  "PENDING",
  "PREPARE",
  "IMPLEMENT",
  "VERIFY",
  "VERIFY_FAILED", // Add if missing
  "RETRY",
  "COMPLETE",
  "ESCALATED",
]);
```

2. **Verify progress.ts handles this status**.

#### Acceptance Criteria

- [ ] VERIFY_FAILED is valid status in schema
- [ ] Progress entries can have this status
- [ ] No type errors

---

## Phase B: Visibility

### T5: Update workflow-state Feedback Path

**Priority**: MEDIUM  
**Estimate**: 1 hour  
**Dependencies**: T4  
**File**: `src/core/workflow-state.ts`

#### Objective

Update feedback existence check to use canonical path.

#### Current State

```typescript
const feedbackPath = path.join(paths.handovers, "feedback.md");
const feedbackExists = fs.existsSync(feedbackPath);
```

This is already correct! Verify and update if needed.

#### Implementation

1. Verify path is `paths.handovers/feedback.md`
2. Update any other references to feedback location
3. Update `inferWorkflowStep()` to properly return RETRY when feedback exists

#### Acceptance Criteria

- [ ] workflow-state checks correct path
- [ ] RETRY inferred when feedback.md exists

---

### T6: Update next Command for Feedback

**Priority**: MEDIUM  
**Estimate**: 2 hours  
**Dependencies**: T4, T5  
**File**: `src/commands/next.ts` (or status output)

#### Objective

Show feedback location and retry info when in RETRY state.

#### Implementation

Update output when state is RETRY:

```typescript
if (workflowState.step === "RETRY") {
  output.header(`Status: RETRY (Attempt ${attempt} of ${maxAttempts})`);
  output.info("");
  output.info("Feedback available: .orchestra/handover/feedback.md");
  output.info("");
  output.info("Next steps:");
  output.info("  1. Read feedback: cat .orchestra/handover/feedback.md");
  output.info("  2. Fix all issues listed");
  output.info("  3. Run: orchestra pre-signal-check");
  output.info('  4. Signal: "ready for review"');
}
```

#### Acceptance Criteria

- [ ] RETRY status shows feedback location
- [ ] Attempt count displayed
- [ ] Next steps are clear

---

### T9: Update agent_readme.md

**Priority**: HIGH  
**Estimate**: 1 hour  
**Dependencies**: None  
**File**: `templates/handover/agent_readme.md`

#### Objective

Add rejection/feedback workflow section.

#### Implementation

Add after "Signal Completion" section:

```markdown
## If Your Signal is Rejected

If the orchestrator rejects your completion signal, a feedback file will be created.

### Check Status

```bash
orchestra next
```

If status shows RETRY, proceed to read feedback.

### Read Feedback

**Location**: `.orchestra/handover/feedback.md`

This file contains:

- What specifically failed
- Severity of each issue
- Guidance on how to fix
- Remaining retry attempts

### Retry Workflow

1. Read `.orchestra/handover/feedback.md`
2. Fix ALL issues listed (don't cherry-pick)
3. Run `orchestra pre-signal-check`
4. Update `completion-signal.md`
5. Signal: "ready for review"

### Maximum Retries

You have 3 attempts per task. After max retries:

- Task is escalated to human supervisor
- You cannot continue without intervention
```

#### Acceptance Criteria

- [ ] Section added to agent_readme.md
- [ ] Feedback path documented
- [ ] Retry workflow clear

---

### T10: Update orchestrator/readme.md

**Priority**: MEDIUM  
**Estimate**: 1 hour  
**Dependencies**: None  
**File**: `templates/orchestrator/readme.md`

#### Implementation

Update CLI commands section and add failure workflow note:

```markdown
### When Verification Fails

Feedback is **automatically generated** when `accept-signal` or `verify` fails:

- Location: `.orchestra/handover/feedback.md`
- Progress: Updated to VERIFY_FAILED

**Your only action**: Tell implementor to read feedback.

Say: "Verification failed. Read `.orchestra/handover/feedback.md` for required fixes."
```

---

### T11: Update 02-task-verification.md

**Priority**: MEDIUM  
**Estimate**: 1 hour  
**Dependencies**: None  
**File**: `templates/orchestrator/processes/02-task-verification.md`

#### Implementation

Update section 7a to reflect automatic feedback:

```markdown
### 7a. Feedback Generation (Automatic)

When `orchestra accept-signal` or `orchestra verify` fails, feedback is **automatically generated**.

**Location**: `.orchestra/handover/feedback.md`

**DO NOT manually create feedback** - the CLI handles this.

To regenerate feedback manually:

```bash
orchestra feedback --task N
```
```

---

### T12: Update implementor/readme.md

**Priority**: MEDIUM  
**Estimate**: 30 minutes  
**Dependencies**: None  
**File**: `templates/implementor/readme.md`

#### Implementation

Update "After Failed Verification" section:

```markdown
### After Failed Verification

Read feedback from `.orchestra/handover/feedback.md` and retry.

Steps:

1. Run `orchestra next` to confirm RETRY status
2. Read `.orchestra/handover/feedback.md`
3. Fix all issues
4. Run `orchestra pre-signal-check`
5. Signal: "ready for review"
```

---

## Phase C: Polish

### T7: Update status Command

**Priority**: LOW  
**Estimate**: 1 hour  
**Dependencies**: T4  
**File**: `src/commands/status.ts`

#### Objective

Show feedback pending state in status output.

#### Implementation

If task status is VERIFY_FAILED or RETRY, show:

```
Task 1: RETRY (Attempt 2/3)
  Feedback: .orchestra/handover/feedback.md
```

---

### T13: Add Feedback Validation

**Priority**: LOW  
**Estimate**: 2 hours  
**Dependencies**: T8  
**File**: `src/core/feedback.ts`

#### Objective

Add minimal validation of generated feedback.

#### Implementation

```typescript
interface FeedbackValidation {
  hasTaskId: boolean;
  hasAttemptInfo: boolean;
  hasAtLeastOneIssue: boolean;
  hasNextSteps: boolean;
  isValid: boolean;
}

function validateFeedback(content: string): FeedbackValidation {
  return {
    hasTaskId: content.includes("Task ID"),
    hasAttemptInfo: content.includes("Attempt"),
    hasAtLeastOneIssue: content.includes("## Issues Found"),
    hasNextSteps: content.includes("## Next Steps"),
    get isValid() {
      return this.hasTaskId && this.hasAttemptInfo && this.hasNextSteps;
    },
  };
}
```

Log warning if validation fails but still write file.

---

### T15: Unit Tests for Feedback Workflow

**Priority**: HIGH  
**Estimate**: 3 hours  
**Dependencies**: T1-T4  
**File**: `test/core/feedback.test.ts`

#### Test Cases

1. `loadVerificationResultFromDisk` - success
2. `loadVerificationResultFromDisk` - file not found
3. `loadVerificationResultFromDisk` - invalid YAML
4. `archiveExistingFeedback` - archives correctly
5. `archiveExistingFeedback` - creates history dir
6. `archiveExistingFeedback` - no existing file
7. `getAttemptNumber` - first attempt
8. `getAttemptNumber` - multiple failures
9. `generateSummary` - single issue
10. `generateSummary` - multiple issues
11. `generateSummary` - critical issues
12. `runFeedback` - full flow with disk read
13. `runFeedback` - full flow with in-memory result

---

### T16: Integration Tests

**Priority**: MEDIUM  
**Estimate**: 2 hours  
**Dependencies**: T15  
**File**: `test/commands/accept-signal.test.ts`, `test/commands/verify.test.ts`

#### Test Cases

1. accept-signal fail → feedback.md created
2. accept-signal fail → progress updated
3. verify fail → feedback.md created
4. verify fail → previous feedback archived
5. Multiple failures → correct attempt numbers

---

### T17: Sync to .orchestra/ Folder

**Priority**: MEDIUM  
**Estimate**: 30 minutes  
**Dependencies**: T8-T12  
**Files**: `.orchestra/` folder

#### Implementation

Copy updated templates:

```bash
cp templates/common/templates/feedback.md.hbs .orchestra/common/templates/
cp templates/handover/agent_readme.md .orchestra/handover/
cp templates/orchestrator/readme.md .orchestra/orchestrator/
cp templates/orchestrator/processes/02-task-verification.md .orchestra/orchestrator/processes/
cp templates/implementor/readme.md .orchestra/implementor/
```

---

## Implementation Checklist

### Phase A (Core) - Do First

- [ ] T1: feedback.ts disk read
- [ ] T4: standardize path + archive
- [ ] T8: update template
- [ ] T2: accept-signal auto-feedback
- [ ] T3: verify auto-feedback
- [ ] T14: VERIFY_FAILED status

### Phase B (Visibility) - Do Second

- [ ] T5: workflow-state path
- [ ] T6: next command update
- [ ] T9: agent_readme.md
- [ ] T10: orchestrator/readme.md
- [ ] T11: 02-task-verification.md
- [ ] T12: implementor/readme.md

### Phase C (Polish) - Do Last

- [ ] T7: status command
- [ ] T13: validation
- [ ] T15: unit tests
- [ ] T16: integration tests
- [ ] T17: sync .orchestra/

---

## Quick Reference

| Task | File | Priority | Est |
|------|------|----------|-----|
| T1 | src/core/feedback.ts | HIGH | 2h |
| T2 | src/commands/accept-signal.ts | HIGH | 3h |
| T3 | src/commands/verify.ts | HIGH | 2h |
| T4 | src/core/feedback.ts | HIGH | 1h |
| T5 | src/core/workflow-state.ts | MEDIUM | 1h |
| T6 | src/commands/next.ts | MEDIUM | 2h |
| T7 | src/commands/status.ts | LOW | 1h |
| T8 | templates/common/templates/feedback.md.hbs | HIGH | 2h |
| T9 | templates/handover/agent_readme.md | HIGH | 1h |
| T10 | templates/orchestrator/readme.md | MEDIUM | 1h |
| T11 | templates/orchestrator/processes/02-task-verification.md | MEDIUM | 1h |
| T12 | templates/implementor/readme.md | MEDIUM | 30m |
| T13 | src/core/feedback.ts | LOW | 2h |
| T14 | src/core/types.ts | HIGH | 1h |
| T15 | test/core/feedback.test.ts | HIGH | 3h |
| T16 | test/commands/*.test.ts | MEDIUM | 2h |
| T17 | .orchestra/ | MEDIUM | 30m |

**Total**: ~25 hours

---

_Ready for implementation_
