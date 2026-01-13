# Closeout Previous Task

> **Phase**: PREPARE  
> **CLI Command**: `orchestra closeout`  
> **Source**: [src/commands/closeout.ts](../../src/commands/closeout.ts)

---

## Index

- [Overview](#overview)
- [Purpose](#purpose)
- [Philosophy](#philosophy)
- [Actions](#actions)
- [Execution Sequence](#execution-sequence)
- [Agent Process](#agent-process)
- [CLI Command](#cli-command)
- [Input](#input)
- [File Impact](#file-impact)
- [Template Details](#template-details)
- [Git Actions](#git-actions)
- [Outcome](#outcome)
- [Next Step](#next-step)
- [Evidence Produced](#evidence-produced)
- [Implementation Reference](#implementation-reference)
- [Troubleshooting](#troubleshooting)

---

## Overview

| Attribute | Value |
|-----------|-------|
| **Phase** | PREPARE |
| **Role** | Orchestrator Agent |
| **Trigger** | Before preparing a new task |
| **Preconditions** | Orchestra initialized; previous task exists (or first task) |

---

## Purpose

Verify that the previous task is fully closed out before preparing a new task. This step ensures:

1. **Clean git state** - No uncommitted changes lingering
2. **Task completed** - Previous task marked as completed in progress
3. **Commit recorded** - Completion commit hash is tracked
4. **SpecKit aligned** - Referenced SpecKit tasks are checked off
5. **Signal cleared** - Previous completion signal is removed
6. **Results archived** - Previous task has a result file

This is **Step 0 of Process 1** (Handover Creation) - the gate check before any new task preparation begins.

---

## Philosophy

Closeout enforces **clean state transitions** between tasks.

### Why This Matters

Without closeout verification:
- Uncommitted work from Task N could pollute Task N+1
- Progress tracking becomes unreliable
- SpecKit checkboxes fall out of sync
- Stale signals could confuse the next implementor

### The Six Checks

| Check | ID | Purpose | Auto-Fixable |
|-------|-----|---------|--------------|
| No uncommitted changes | C1 | Clean git working directory | ✅ Yes |
| Previous task completed | C2 | Progress tracking integrity | ❌ No |
| Commit hash recorded | C3 | Audit trail | ❌ No |
| SpecKit tasks checked | C4 | Spec alignment | ❌ No |
| Completion signal cleared | C5 | No stale signals | ✅ Yes |
| Results file exists | C6 | Archive integrity | ❌ No |

### First Task Exception

When there is no previous task (first task in sprint), checks C2-C4 and C6 are skipped. Only C1 (uncommitted changes) and C5 (completion signal) are verified.

---

## Actions

> Quick reference for all actions in this workflow step.  
> Use Action IDs to reference specific actions in other sections.

### CLI Actions

| ID | Action | Command |
|----|--------|--------|
| A-CLO-01 | Run closeout check | `orchestra closeout` |
| A-CLO-02 | Check specific task | `orchestra closeout --task <id>` |
| A-CLO-03 | Auto-fix issues | `orchestra closeout --fix` |
| A-CLO-04 | Force skip checks | `orchestra closeout --force` |
| A-CLO-05 | Verbose output | `orchestra closeout --verbose` |

### Agent Actions

| ID | Role | Action |
|----|------|--------|
| A-CLO-06 | Orchestrator | Run closeout before prepare |
| A-CLO-07 | Orchestrator | Review failed checks |
| A-CLO-08 | Orchestrator | Apply manual fixes |

### Manual Actions

| ID | Role | Action | Notes |
|----|------|--------|-------|
| A-CLO-09 | Human | Update progress.yaml status | When C2 fails |
| A-CLO-10 | Human | Add commit hash to progress.yaml | When C3 fails |
| A-CLO-11 | Human | Check SpecKit boxes in tasks.md | When C4 fails |
| A-CLO-12 | Human | Delete stale completion-signal.md | When C5 fails (no --fix) |
| A-CLO-13 | Human | Complete previous task | When C6 fails |

### Git Actions

| ID | Action | Level | Command |
|----|--------|-------|--------|
| A-CLO-14 | Commit uncommitted changes | Enforced (C1) | `git add -A && git commit` |

---

## Execution Sequence

The complete ordered execution of this workflow step:

| Order | Action ID | Type | Action |
|-------|-----------|------|--------|
| 1 | A-CLO-06 | Agent | Initiate closeout before prepare |
| 2 | A-CLO-01 | CLI | `orchestra closeout` |
| 3 | A-CLO-07 | Agent | Review any failed checks |
| 4a | A-CLO-03 | CLI | `orchestra closeout --fix` (if C1/C5 failed) |
| 4b | A-CLO-08 | Agent | Apply manual fixes (if C2/C3/C4/C6 failed) |
| 5 | A-CLO-01 | CLI | `orchestra closeout` (re-run to confirm) |

> **Note**: Steps 4a/4b are conditional based on which checks failed. If all checks pass initially, skip to completion.

---

## Agent Process

The orchestrator agent executes closeout as a gate check before preparing a new task.

### A-CLO-06: Initiate Closeout

- Run `orchestra closeout` before any `orchestra prepare`
- This ensures clean state transition between tasks

### A-CLO-07: Review Failed Checks

If closeout fails, review the output:

| Check | Failure Indicates | Resolution |
|-------|-------------------|------------|
| C1 | Uncommitted changes | Use `--fix` or manual commit |
| C2 | Task not completed | Update progress.yaml |
| C3 | No commit hash | Add completed_commit |
| C4 | SpecKit unchecked | Mark checkboxes |
| C5 | Stale signal | Use `--fix` or delete file |
| C6 | No results file | Run verify/complete |

### A-CLO-08: Apply Manual Fixes

For checks that cannot be auto-fixed:

- **C2**: Edit `progress.yaml` → set `status: completed`
- **C3**: Edit `progress.yaml` → add `completed_commit: "<hash>"`
- **C4**: Edit `tasks.md` → change `[ ]` to `[x]`
- **C6**: Run `orchestra verify && orchestra complete` for previous task

---

## CLI Command

```bash
orchestra closeout [options]
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--task <id>` | number | auto-detect | Specific task ID to check (default: previous task) |
| `--fix` | boolean | false | Attempt to auto-fix failed checks |
| `--force` | boolean | false | Skip closeout checks (use with caution) |
| `--verbose` | boolean | false | Show detailed check output |
| `--json` | boolean | false | Output results as JSON |

### Examples

```bash
# Check closeout for previous task (auto-detected)
orchestra closeout

# Check specific task
orchestra closeout --task 3

# Auto-fix what can be fixed
orchestra closeout --fix

# Skip checks (emergency only)
orchestra closeout --force

# Verbose output for debugging
orchestra closeout --verbose

# JSON output for automation
orchestra closeout --json
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All checks passed, can proceed |
| 1 | One or more checks failed |
| 2 | Error (not initialized, etc.) |

---

## Input

### Required

| Input | Source | Purpose |
|-------|--------|---------|
| `.orchestra/progress.yaml` | Progress tracking | Determine previous task, check status |
| Git repository | Working directory | Check uncommitted changes |

### Optional

| Input | Source | Purpose |
|-------|--------|---------|
| `--task <id>` | Command line | Override auto-detected previous task |
| `.orchestra/manifest.yaml` | Manifest | Get SpecKit task refs for C4 |

---

## File Impact

### Created

N/A - Closeout is a verification step, not a creation step.

### Updated

N/A - Closeout does not modify files directly.

> **Exception**: With `--fix` flag:
> - C1 auto-fix: Creates a git commit
> - C5 auto-fix: Deletes `completion-signal.md`

### Read

| Path | Purpose |
|------|---------|
| `.orchestra/progress.yaml` | Previous task status, commit hash |
| `.orchestra/manifest.yaml` | SpecKit task references |
| `.orchestra/handover/completion-signal.md` | Check if signal is cleared |
| `.orchestra/orchestrator/results/task-XXX-result.yaml` | Verify results exist |
| `.orchestra/orchestrator/.orchestrator-only/tasks.md` | SpecKit checkbox verification |

### Deleted

With `--fix` flag only:

| Path | Condition |
|------|-----------|
| `.orchestra/handover/completion-signal.md` | If C5 fails and --fix is used |

---

## The Six Checks in Detail

### C1: No Uncommitted Changes

**What it checks**: Git working directory is clean.

**Why it matters**: Uncommitted changes from Task N shouldn't leak into Task N+1.

**Passes when**: `git status` shows no modified, added, or deleted files.

**Fails when**: Any uncommitted changes exist.

**Auto-fix**: `--fix` will run `git add -A && git commit -m "chore: closeout previous task"`.

```bash
# Check manually
git status

# Fix manually
git add -A
git commit -m "chore: closeout task N"
```

---

### C2: Previous Task Status Completed

**What it checks**: The previous task's status in `progress.yaml` is `completed`.

**Why it matters**: Progress tracking should accurately reflect task state.

**Passes when**: `progress.yaml` → `tasks.{taskId}.status` is `completed`.

**Fails when**: Status is anything other than `completed`.

**Auto-fix**: Not available. Manual update required.

```yaml
# Fix in progress.yaml
tasks:
  "3":
    status: completed    # Change from pending/in_progress
    completed_at: "2025-12-05T12:00:00Z"
```

---

### C3: Commit Hash Recorded

**What it checks**: The completion commit hash is recorded in `progress.yaml`.

**Why it matters**: Audit trail - we need to know which commit completed the task.

**Passes when**: `progress.yaml` → `tasks.{taskId}.completed_commit` exists.

**Fails when**: No commit hash recorded.

**Auto-fix**: Not available. Manual update required.

```yaml
# Fix in progress.yaml
tasks:
  "3":
    status: completed
    completed_commit: "abc1234567890"  # Add this
```

---

### C4: SpecKit Tasks Checked

**What it checks**: If the task references SpecKit tasks, those checkboxes are marked `[x]`.

**Why it matters**: SpecKit is the source of truth for requirements.

**Passes when**: 
- Task has no `speckit_task_ref`, OR
- All referenced tasks have `[x]` in `tasks.md`

**Fails when**: Referenced SpecKit task still shows `[ ]`.

**Auto-fix**: Not available. Manual update required.

```markdown
<!-- Fix in tasks.md -->
- [x] T001: Create enum           <!-- Change from [ ] to [x] -->
- [x] T002: Implement model
```

---

### C5: Completion Signal Cleared

**What it checks**: The completion signal from the previous task is removed or reset.

**Why it matters**: A stale signal could confuse the next task's verification.

**Passes when**:
- `completion-signal.md` doesn't exist, OR
- File is an empty template (no task content)

**Fails when**: Signal contains content from previous task.

**Auto-fix**: `--fix` will delete the file.

```bash
# Fix manually
rm .orchestra/handover/completion-signal.md
```

---

### C6: Results File Exists

**What it checks**: A results file was created for the previous task.

**Why it matters**: Every task should have an archived result.

**Passes when**: `.orchestra/orchestrator/results/task-XXX-result.yaml` exists.

**Fails when**: Results file not found.

**Auto-fix**: Not available. Run `orchestra verify && orchestra complete` for previous task.

---

## Template Details

| Template | Converts To | When Used |
|----------|-------------|-----------|
| N/A | N/A | Closeout is verification only, no templates |

---

## Git Actions

### Enforcement Levels

| Action | Level | Current State | Notes |
|--------|-------|---------------|-------|
| Commit uncommitted changes | **Enforced** (C1) | Check fails if uncommitted | Can auto-fix with `--fix` |
| Clean working directory | **Mandatory** | Required to proceed | Blocks prepare if dirty |

### With --fix Flag

When `--fix` is used and C1 fails:

```bash
# Auto-fix executes:
git add -A
git commit -m "chore: closeout previous task"
```

> **Note**: Only C1 and C5 are auto-fixable. Other checks require manual intervention.

---

## Outcome

### Success

| Outcome | Description |
|---------|-------------|
| All checks pass | Can proceed to `orchestra prepare` |
| Report generated | Shows passing status for each check |

**Console Output (Success):**
```
Closeout Check: Task 3

✓ C1: No uncommitted changes
✓ C2: Previous task status - completed
✓ C3: Commit hash recorded - abc1234
✓ C4: SpecKit tasks - All checked
✓ C5: Completion signal - Cleared
✓ C6: Results file - Present

Overall: PASSED
Ready to prepare next task.
```

### Failure

| Failure | Cause | Resolution |
|---------|-------|------------|
| C1 fails | Uncommitted changes | `git commit` or use `--fix` |
| C2 fails | Task not completed | Update progress.yaml status |
| C3 fails | No commit hash | Add completed_commit to progress.yaml |
| C4 fails | SpecKit unchecked | Check boxes in tasks.md |
| C5 fails | Stale signal | Delete completion-signal.md or use `--fix` |
| C6 fails | No results | Run verify/complete on previous task |

**Console Output (Failure):**
```
Closeout Check: Task 3

✓ C1: No uncommitted changes
✗ C2: Previous task status
      Expected: completed
      Actual: in_progress
      Fix: Update progress.yaml: tasks.3.status = "completed"
✓ C3: Commit hash recorded
✓ C4: SpecKit tasks
✓ C5: Completion signal
✓ C6: Results file

Overall: FAILED
Fix the issues above before preparing next task.
```

---

## Next Step

After successful closeout:

| Action | Command/Location | Purpose |
|--------|------------------|---------|
| **Prepare next task** | `orchestra prepare --task N` | Generate handover documents |
| **Check guidance** | `orchestra next` | Get context-aware next action |

> **`orchestra next` Command**: Run this at any point to get guidance on what to do next.  
> See [Technical Debt: orchestra next](technical-debt.md#td-002-orchestra-next-command) for implementation status.

---

## Evidence Produced

After successful execution, these artifacts prove the step completed correctly:

### Verification Checklist

- [ ] `orchestra closeout` exits with code 0
- [ ] All six checks show passed (or N/A for first task)
- [ ] Git working directory is clean
- [ ] No stale completion signal exists

### Programmatic Verification

```bash
# Run closeout check
orchestra closeout --json

# Expected JSON output
{
  "taskId": 3,
  "timestamp": "2025-12-05T12:00:00.000Z",
  "overall": "PASSED",
  "checks": [...],
  "canProceed": true
}
```

---

## Implementation Reference

### Source Files

| File | Purpose |
|------|---------|
| [src/commands/closeout.ts](../../src/commands/closeout.ts) | CLI command definition |
| [src/core/closeout.ts](../../src/core/closeout.ts) | Core closeout logic and checks |

### Key Functions

From `src/core/closeout.ts`:

| Function | Purpose |
|----------|---------|
| `runCloseoutChecks(orchestraRoot, taskId)` | Run all 6 checks |
| `attemptAutoFix(orchestraRoot, report)` | Auto-fix C1 and C5 |
| `determinePreviousTask(orchestraRoot, explicitTaskId)` | Find previous task ID |
| `checkUncommittedChanges(cwd)` | C1 check |
| `checkPreviousTaskStatus(orchestraRoot, taskId)` | C2 check |
| `checkCommitHashRecorded(orchestraRoot, taskId)` | C3 check |
| `checkSpecKitTasks(orchestraRoot, taskId)` | C4 check |
| `checkCompletionSignalCleared(orchestraRoot)` | C5 check |
| `checkResultsFileExists(orchestraRoot, taskId)` | C6 check |

### Types

```typescript
interface CloseoutReport {
  taskId: number | null;
  timestamp: string;
  overall: "PASSED" | "FAILED";
  checks: CheckResult[];
  canProceed: boolean;
}

interface CheckResult {
  id: string;        // C1-C6
  check: string;     // Human-readable name
  passed: boolean;
  expected: string;
  actual: string;
  fix?: string;      // Suggested fix command
}
```

---

## Troubleshooting

### Common Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| Git not initialized | C1 fails with "Git error" | Run `git init` in project root |
| First task confusion | Checks C2-C4, C6 fail | Use `--task 0` or delete progress.yaml |
| Stale progress.yaml | Wrong task detected | Manually update `current_task` |
| Missing results | C6 fails | Run `orchestra complete` for previous task |

### Emergency Bypass

If closeout is blocking and you need to proceed urgently:

```bash
# ⚠️ Use with extreme caution
orchestra closeout --force
```

This skips all checks. Only use when you understand the implications and will manually clean up later.

### Reset Progress

If progress tracking is corrupted:

```bash
# Backup first
cp .orchestra/progress.yaml .orchestra/progress.yaml.bak

# Reset to clean state
rm .orchestra/progress.yaml

# Reinitialize (will be recreated on next prepare)
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-05 | Initial specification |

---

*This document is part of the [Orchestra Workflow Specification](workflow.md).*
