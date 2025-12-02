# Process 2: Task Verification (Accept Signal Protocol)

⚠️ **WHEN TO USE**: When the implementor signals completion via `completion-signal.md`.

---

## Overview

This process verifies that the implementor's work meets all acceptance criteria before committing and moving to the next task.

**Trigger**: Implementor writes to `completion-signal.md` and says "ready for review"
**Output**: Either PASS (commit & proceed) or FAIL (feedback for rework)

---

## Prerequisites

Before starting verification:
- [ ] Implementor has signaled completion
- [ ] `completion-signal.md` contains their completion report
- [ ] You have NOT yet read the verification criteria (prevents bias)

---

## Step-by-Step Instructions

### ⚠️ STEP 1: Run Accept Signal Check (BLOCKING - MANDATORY FIRST)

**⛔ DO NOT read the verification YAML until this passes!**

```powershell
# Source environment first
. .\.orchestra\common\scripts\set-env.ps1

# Run accept signal check
.\.orchestra\orchestrator\scripts\accept-signal-check.ps1
```

**What this checks:**
- ✅ Pre-signal artifact exists at `.orchestra/implementor/artifacts/pre-signal/task-{N}-*.txt`
- ✅ Artifact shows PASSED status
- ⚠️ Artifact is not stale (>24 hours old)

**If this FAILS:**
1. Do NOT proceed with verification
2. Do NOT commit anything
3. Do NOT read the verification YAML
4. Tell implementor: "Run `.orchestra/implementor/.implementor-only/scripts/pre-signal-check.ps1` and fix all issues"
5. Wait for them to actually run it and signal again

**Why this matters**: Prevents implementors from skipping their own validation scripts.

**⛔ DO NOT PROCEED UNTIL THIS SCRIPT PASSES**

---

### STEP 2: Read Verification Criteria

Now (and ONLY now) read the hidden verification file:

```
READ `.orchestra/orchestrator/.orchestrator-only/verification/task-XXX.yaml`
```

This file contains:
- Verification commands to execute
- Expected outputs
- Severity levels for each check
- Screenshot verification criteria (if applicable)

---

### STEP 3: Execute Verification Commands

Run EACH verification command from the YAML file and record results.

#### Standard Quality Gates (BLOCKING)

| Check | Command | Severity |
|-------|---------|----------|
| Task tests pass | `flutter test <task_test_path>` | BLOCKING |
| Sprint unit tests pass | `flutter test test/unit/<sprint>/` | BLOCKING |
| Sprint widget tests pass | `flutter test test/widget/<sprint>/` | BLOCKING |
| Static analysis (impl) | `flutter analyze <impl_path>` | BLOCKING |
| Static analysis (test) | `flutter analyze <test_path>` | BLOCKING |

**⛔ If ANY blocking check fails, task is FAILED. Do not continue.**

---

### STEP 4: Visual Verification (INTEGRATION/VISUAL Tasks Only)

**Skip this step if task category is INFRASTRUCTURE.**

#### 4a. Check Screenshot EXISTS (Necessary but NOT Sufficient)

```powershell
Test-Path ".orchestra/orchestrator/results/screenshots/task-XXX-*.png"
```

#### 4b. Read Screenshot Criteria from Verification YAML

```yaml
# Example from task YAML
screenshot:
  verify:
    - "Chart displays with multiple Y-axes (left and right)"
    - "Each axis has distinct color matching its series"
    - "All series use full vertical space despite different ranges"
    - "Axis labels show original values (not normalized 0-1)"
```

#### 4c. VIEW Screenshot Content (THE ACTUAL VERIFICATION)

**⛔ "Screenshot exists" ≠ "Screenshot is correct"**

Use Chrome DevTools MCP to actually SEE the screenshot:

```
mcp_chrome-devtoo_new_page(url: "file:///E:/full/path/to/screenshot.png")
mcp_chrome-devtoo_take_screenshot()
```

The returned image is now in your context - analyze it!

#### 4d. Check EACH Criterion

For each item in `screenshot.verify`:
1. Look at the actual screenshot content
2. Determine if the criterion is satisfied
3. Document your finding: PASS or FAIL with observation

| Criterion | Status | Observation |
|-----------|--------|-------------|
| Multiple Y-axes visible | ✅ PASS | Left and right axes clearly visible |
| Distinct colors | ✅ PASS | Left=blue, Right=red |
| Full vertical space | ❌ FAIL | Stock series compressed to top 20% |

#### 4e. Close Browser Page

```
mcp_chrome-devtoo_close_page(pageIdx: 1)
```

---

### STEP 5: Record Results

For each check, record:
- Check name
- Command executed
- Actual output
- PASS/FAIL determination
- Severity level

---

### STEP 6: Make Decision

#### Severity Levels Reference

| Severity | Meaning | If Failed |
|----------|---------|-----------|
| **BLOCKING** | Fundamental requirement | Task FAILED |
| **MAJOR** | Significant quality issue | Task FAILED |
| **MINOR** | Small issue, functional | Task PASSED with note |
| **INFO** | Observation only | Task PASSED |

#### Decision Rules

```
ANY BLOCKING fail  → Task FAILED (return for rework)
ANY MAJOR fail     → Task FAILED (return for rework)
MINOR fails only   → Task PASSED with notes
INFO only          → Task PASSED
```

**⛔ Severity is IMMUTABLE** - You cannot downgrade severity during verification.
Severity was set when the verification YAML was created, not during execution.

---

## If Task PASSES: Post-Verification Closeout

Complete ALL of these steps:

### 6a. Stage and Commit Changes

```powershell
git add -A
git commit -m "feat(<scope>): <descriptive message> (Task N)"
```

### 6b. Push to Remote

```powershell
git push
```

### 6c. Create Verification Results File

```
CREATE `.orchestra/orchestrator/results/task-XXX-results.md`
USE template: `.orchestra/common/templates/task-results-template.md`
```

Include:
- Task ID and title
- All checks executed with results
- Screenshot verification notes (if applicable)
- Final decision: PASSED
- Commit hash

### 6d. Save Screenshot (if Visual Task)

```
COPY screenshot to `.orchestra/orchestrator/results/screenshots/task-XXX-description.png`
```

### 6e. Update progress.yaml

```yaml
# In .orchestra/orchestrator/.orchestrator-only/progress.yaml
tasks:
  - id: XXX
    status: completed
    commit: <commit_hash>
    completed_at: <timestamp>
    verification_notes: "All checks passed"
```

### 6f. Update SpecKit tasks.md

Mark completed SpecKit tasks with:
- `[x]` checkbox
- Orchestrator task reference
- Commit hash

### 6g. Update manifest.yaml

```yaml
# In .orchestra/orchestrator/.orchestrator-only/manifest.yaml
- id: XXX
  status: completed
  commit: <commit_hash>
```

### 6h. Clear Completion Signal

```powershell
Remove-Item ".orchestra/handover/completion-signal.md" -Force
```

### 6i. Commit Closeout

```powershell
git add -A
git commit -m "verify(Task XXX): VERIFIED - <description>"
```

### 6j. Run Task Closeout Check

```powershell
.\.orchestra\orchestrator\scripts\task-closeout-check.ps1
```

**⛔ This MUST pass before preparing the next task.**

### 6k. Proceed to Next Task

Go to [Process 1: Handover Creation](./01-HANDOVER-CREATION.md)

---

## If Task FAILS: Return for Rework

### 7a. Clear Completion Signal

```powershell
Remove-Item ".orchestra/handover/completion-signal.md" -Force
```

### 7b. Create Failure Report

Create new `completion-signal.md` with failure details:

```markdown
## Verification Failed

**Task**: XXX - <title>
**Attempt**: N of 3

### Failed Checks

| Check | Severity | Reason |
|-------|----------|--------|
| Static analysis | BLOCKING | 3 errors in multi_axis_painter.dart |
| Screenshot verification | MAJOR | Stock series not using full vertical space |

### Required Actions

1. Fix static analysis errors in `lib/src/multi_axis/multi_axis_painter.dart`
2. Debug normalization - stock series should span full height like temperature series

### Next Steps

Fix the issues above and run `pre-signal-check.ps1` again before signaling completion.
```

### 7c. Update progress.yaml

```yaml
# Increment fail count
- id: XXX
  status: in_progress
  fail_count: N
  last_failure: <timestamp>
  failure_notes: "Static analysis failed, normalization bug"
```

### 7d. Notify Implementor

Tell implementor:

> "Verification failed. Read `completion-signal.md` for feedback and required fixes."

### 7e. Check Escalation Threshold

```
IF fail_count >= 3:
  - Escalate to human
  - Do NOT allow further attempts without human intervention
  - Document escalation in progress.yaml
```

---

## Visual Verification Deep Dive

### Why Visual Verification Matters

**Discovered 2025-12-01**: Orchestrator verified screenshot EXISTS but not CONTENT.
Human caught visual bug that would have slipped through.

```
What we checked:     ✅ File exists + ✅ File not empty
What we MISSED:      ❌ Content matches screenshot.verify criteria
```

### What to Check in Screenshots

| Check | What to Look For |
|-------|------------------|
| Elements present | Are expected visual elements visible? (axes, labels, data) |
| Colors correct | Do colors match specification? |
| Layout correct | Are elements positioned as expected? |
| Not placeholder | Is this clearly a real screenshot (not blank/fake)? |
| Feature demonstrated | Does it show the feature being verified? |

### Task Categories

| Category | Screenshot Required |
|----------|---------------------|
| INFRASTRUCTURE | ❌ No (nothing to see yet) |
| INTEGRATION | ✅ BLOCKING |
| VISUAL | ✅ BLOCKING |

---

## Anti-Patterns to Watch For

During verification, watch for these red flags:

- [ ] Tests that only check `findsOneWidget` (insufficient coverage)
- [ ] New files only for integration tasks (should MODIFY existing)
- [ ] Config classes not used anywhere (dead code)
- [ ] Same commit message as task title (lazy completion)
- [ ] Screenshot exists but wrong content
- [ ] No actual integration into main widget

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `accept-signal-check.ps1` | Verify implementor ran pre-signal check |
| `verification-audit.ps1` | Audit verification records for completeness |
| `task-closeout-check.ps1` | Verify task fully closed before next |

---

## See Also

- [Process 1: Handover Creation](./01-HANDOVER-CREATION.md)
- [Main Orchestrator README](../readme.md)
- [Folder Structure](../../docs/readme.md)
