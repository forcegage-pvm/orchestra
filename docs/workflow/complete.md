# Complete Task

> **Phase**: COMPLETE  
> **CLI Command**: `orchestra complete`  
> **Source**: [src/commands/complete.ts](../../src/commands/complete.ts)

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
- [Version History](#version-history)

---

## Overview

| Attribute | Value |
|-----------|-------|
| **Phase** | COMPLETE |
| **Role** | Orchestrator Agent |
| **Trigger** | After `orchestra verify` passes |
| **Preconditions** | Verification PASSED; task in IN_PROGRESS status |

---

## Purpose

Complete the current task after successful verification. This implements **post-verification closeout** that ensures proper task closure, artifact archival, and preparation for the next task.

This command:

1. **Validates completion** - Verify task can be completed (verification passed)
2. **Creates archive** - Preserve task artifacts in results folder
3. **Updates progress** - Mark task as COMPLETED in progress.yaml
4. **Updates manifest** - Change task status to completed
5. **Clears handover** - Remove transient handover files
6. **Git commit** - Optional commit/push of all changes
7. **Prepares next** - Optional automatic prepare of next task

> **Process Reference**: Implements Process 2 (Task Verification), Steps 5-7 from `.orchestra/orchestrator/processes/02-TASK-VERIFICATION.md`

---

## Philosophy

Completion is the **formal acceptance** of work. It creates an immutable record and prepares the workspace for the next task.

### Why This Matters

The complete phase serves multiple purposes:

| Purpose | Implementation |
|---------|----------------|
| **Audit trail** | Archive preserves all artifacts |
| **Clean state** | Handover cleared prevents contamination |
| **Progress tracking** | Manifest/progress updated for visibility |
| **Git history** | Atomic commit per task (optional) |
| **Momentum** | Auto-prepare next task reduces friction |

### Trust Verification

Completion should only happen after verification passes. The `--force` flag exists for emergencies but should be avoided:

```bash
# Normal flow (verification required)
orchestra complete

# Emergency bypass (use sparingly)
orchestra complete --force
```

### Anti-Patterns This Prevents

| Anti-Pattern | How Complete Prevents It |
|--------------|--------------------------|
| Lost artifacts | Archive preserves all task files |
| Stale handovers | Clear handover after completion |
| Status drift | Atomic manifest/progress updates |
| Broken git history | One commit per task (when enabled) |
| Context pollution | Clean slate for next task |

---

## Actions

> Quick reference for all actions in this workflow step.  
> Use Action IDs to reference specific actions in other sections.

### CLI Actions

| ID | Action | Command |
|----|--------|---------|
| A-COMP-01 | Complete task | `orchestra complete` |
| A-COMP-02 | Complete with commit | `orchestra complete --commit` |
| A-COMP-03 | Complete and push | `orchestra complete --push` |
| A-COMP-04 | Force complete | `orchestra complete --force` |

### Agent Actions

| ID | Role | Action |
|----|------|--------|
| A-COMP-05 | Orchestrator | Validate verification passed |
| A-COMP-06 | Orchestrator | Review archive contents |
| A-COMP-07 | Orchestrator | Verify handover cleared |

### Conditional Actions

| ID | Condition | Action |
|----|-----------|--------|
| A-COMP-08 | Next task exists | Proceed to `orchestra prepare` |
| A-COMP-09 | Sprint complete | Run sprint closeout |

---

## Execution Sequence

The complete ordered execution of this workflow step:

| Order | Action ID | Type | Action |
|-------|-----------|------|--------|
| 1 | A-COMP-05 | Agent | Confirm verification passed |
| 2 | A-COMP-01 | CLI | `orchestra complete` |
| 3 | A-COMP-06 | Agent | Review archive created |
| 4 | A-COMP-07 | Agent | Verify handover cleared |
| 5a | A-COMP-08 | Flow | If next task → `orchestra prepare` |
| 5b | A-COMP-09 | Flow | If all done → sprint closeout |

---

## Agent Process

The orchestrator agent completes a task after verification passes.

### A-COMP-01: Complete Task

After verification passes, complete the task:

```bash
orchestra complete
```

Expected output:

```
✓ Task 3 Completed
──────────────────────────────────────────────────
Task: 3 - Create YAxisConfig Model

Archived:
  ✓ .orchestra/orchestrator/results/task-003/

Updates:
  ✓ progress.yaml updated
  ✓ manifest.yaml updated

Handover:
  ✓ Handover folder cleared

Git:
  ○ No commit

Next: Task 4 - Create YAxisConfigCollection
  → Run 'orchestra prepare' to begin
```

### A-COMP-02: Complete with Commit

Include git commit with completion:

```bash
orchestra complete --commit "feat(orchestra): Task 3 - Create YAxisConfig Model"
```

Expected output includes:

```
Git:
  ✓ Committed: abc1234
  ○ Not pushed
```

### A-COMP-03: Complete and Push

Commit and push to remote:

```bash
orchestra complete --push "feat(orchestra): Task 3 - Create YAxisConfig Model"
```

### A-COMP-05: Validate Verification Passed

Before running complete, confirm verification passed:

```bash
# Check verification status
orchestra status --task 3
```

Should show:
```
Verification: PASSED
```

### A-COMP-06: Review Archive Contents

After completion, verify archive created:

```powershell
# Check archive exists
Test-Path ".orchestra/orchestrator/results/task-003/"

# View archive contents
Get-ChildItem ".orchestra/orchestrator/results/task-003/"
```

Expected structure:
```
task-003/
├── metadata.json           # Completion metadata
├── current-task.md         # Archived handover
├── completion-signal.md    # Archived signal
├── verification-report.yaml # Verification results
└── artifacts/              # Task-specific files
```

### A-COMP-07: Verify Handover Cleared

Confirm handover folder is clean for next task:

```powershell
# These should NOT exist
Test-Path ".orchestra/handover/current-task.md"      # Should be False
Test-Path ".orchestra/handover/completion-signal.md" # Should be False
```

---

## CLI Command

### `orchestra complete`

Complete the current task after verification.

```bash
orchestra complete [OPTIONS] [MESSAGE]
```

### Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `MESSAGE` | STR | No | Commit message (if --commit) |

### Options

| Option | Short | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--task <id>` | `-t` | INT | current | Task ID to complete |
| `--commit` | | FLAG | config | Commit changes to git |
| `--no-commit` | | FLAG | false | Skip git commit |
| `--push` | | FLAG | false | Push after commit |
| `--force` | | FLAG | false | Complete without verification |
| `--no-next` | | FLAG | false | Don't prepare next task |
| `--json` | | FLAG | false | Output JSON format |
| `--verbose` | `-v` | FLAG | false | Verbose output |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Task not in progress |
| 2 | Verification not passed |
| 3 | Archive failed |
| 4 | Git commit failed |
| 5 | SpecKit update failed |

### Examples

```bash
# Complete current task (uses config for commit behavior)
orchestra complete

# Complete with commit message
orchestra complete --commit "feat: add YAxisConfig model"

# Complete and push
orchestra complete --push "feat: add YAxisConfig model"

# Complete without preparing next task
orchestra complete --no-next

# Force complete without verification (emergency only)
orchestra complete --force

# Skip git commit
orchestra complete --no-commit

# Complete specific task
orchestra complete --task 3

# JSON output
orchestra complete --json
```

---

## Input

### Required Files

| File | Purpose | Created By |
|------|---------|------------|
| `.orchestra/manifest.yaml` | Task status lookup | `orchestra init` |
| `.orchestra/progress/sprint-{id}-progress.yaml` | Current task/status | `orchestra prepare` |
| `.orchestra/orchestrator/results/task-{id}-verification.yaml` | Verification result | `orchestra verify` |

### Optional Files

| File | Purpose | When Used |
|------|---------|-----------|
| `.orchestra/handover/current-task.md` | Archived if exists | Always |
| `.orchestra/handover/completion-signal.md` | Archived if exists | Always |

### Preconditions

| Condition | Check | Error if Failed |
|-----------|-------|-----------------|
| Task exists | Task ID in manifest | "Task not found" |
| Task in progress | Status = IN_PROGRESS | "Task not in progress" |
| Verification passed | Report.overall = PASSED | "Verification not passed" |
| Git clean (if commit) | No merge conflicts | "Git conflict detected" |

### Verification Report Staleness

The command warns if verification report is stale:

```typescript
const reportAge = (Date.now() - new Date(report.timestamp).getTime()) / (1000 * 60);
if (reportAge > 30) {
  console.warn(`⚠️  Verification report is ${Math.round(reportAge)} minutes old.`);
}
```

---

## File Impact

### Read

| File | Purpose |
|------|---------|
| `.orchestra/manifest.yaml` | Get task info, status |
| `.orchestra/progress/sprint-{id}-progress.yaml` | Current task tracking |
| `.orchestra/orchestrator/results/task-{id}-verification.yaml` | Verification result |
| `.orchestra/handover/current-task.md` | Archive content |
| `.orchestra/handover/completion-signal.md` | Archive content |

### Written

| File | Purpose |
|------|---------|
| `.orchestra/manifest.yaml` | Updated task status to COMPLETED |
| `.orchestra/progress/sprint-{id}-progress.yaml` | Updated with completion |

### Created

| File | When |
|------|------|
| `.orchestra/orchestrator/results/task-{id}/` | Archive folder |
| `.orchestra/orchestrator/results/task-{id}/metadata.json` | Completion metadata |
| `.orchestra/orchestrator/results/task-{id}/current-task.md` | Archived handover |
| `.orchestra/orchestrator/results/task-{id}/completion-signal.md` | Archived signal |
| `.orchestra/orchestrator/results/task-{id}/verification-report.yaml` | Archived verification |

### Deleted

| File | Reason |
|------|--------|
| `.orchestra/handover/current-task.md` | Cleared for next task |
| `.orchestra/handover/completion-signal.md` | Cleared for next task |
| `.orchestra/handover/feedback.md` | Cleared (if exists) |
| `.orchestra/handover/verification/*` | Cleared for next task |

> **Critical**: Clearing pre-signal artifacts prevents stale data from passing `accept-signal` on the next task.

---

## Template Details

### Template Conversion

| Template | Source | Converts To | When Used |
|----------|--------|-------------|-----------|
| N/A | N/A | N/A | Complete does not render templates |

> **Note**: The complete command does not use templates. It creates `metadata.json` programmatically and copies existing files to the archive.

### Archive Metadata Structure

The `metadata.json` is generated programmatically:

```json
{
  "task_id": 3,
  "title": "Create YAxisConfig Model",
  "category": "INTEGRATION",
  "completed_at": "2025-12-01T15:00:00Z",
  "attempts": 1,
  "duration_minutes": 45,
  "commit": "abc1234",
  "verification": {
    "overall": "PASSED",
    "checks_passed": 6,
    "checks_failed": 0
  },
  "files_created": [
    "lib/src/models/y_axis_config.dart",
    "test/unit/y_axis_config_test.dart"
  ]
}
```

---

## Git Actions

### Enforcement Levels

| Action | Level | Current State |
|--------|-------|---------------|
| Commit changes | **Optional** | Controlled by `--commit` flag |
| Push to remote | **Optional** | Controlled by `--push` flag |

### Commit Message Format

Default format (configurable):

```
{{type}}({{scope}}): Task {{task_id}} - {{title}}

{{body}}

Orchestra: Task {{task_id}}/{{total}} complete
```

Example:
```
feat(orchestra): Task 3 - Create YAxisConfig Model

- Created lib/src/models/y_axis_config.dart
- Created test/unit/y_axis_config_test.dart
- All verification checks passed

Orchestra: Task 3/12 complete
```

### Configuration

```yaml
# .orchestra/orchestra.yaml
git:
  commit:
    type: "feat"
    scope: "orchestra"
    include_files: true
    include_footer: true
```

### Manual Git Workflow

If not using `--commit`:

```bash
# After complete
git add .
git commit -m "feat(orchestra): Task 3 complete"
git push
```

---

## Outcome

### Success Path

```
✓ Task completed
  → Archive created
  → Progress/manifest updated
  → Handover cleared
  → Ready for next task
```

**Next**: 
- If more tasks: [prepare.md](prepare.md) for next task
- If sprint complete: Sprint closeout

### Success: Sprint Complete

When the last task completes:

```
Sprint Completed!
─────────────────────────────────────────
Sprint: 011-multi-axis-normalization
Tasks: 16/16 complete

Summary:
  First-attempt passes: 12
  Second-attempt passes: 3
  Third-attempt passes: 1
  Escalations: 0

All verification checks passed.
```

### Failure Paths

#### Failure: Verification Not Passed

```
✗ Cannot complete: Verification not passed
  Latest verification: FAILED
  
  Run 'orchestra verify' and resolve issues first.
```

**Action**: Run `orchestra verify`, resolve failures, then complete

#### Failure: Task Not In Progress

```
✗ Cannot complete: Task 3 is not in progress
  Current status: PENDING
```

**Action**: Run `orchestra prepare --task 3` first

#### Failure: Archive Failed

```
✗ Archive creation failed
  Error: Permission denied
```

**Action**: Check file permissions on `.orchestra/orchestrator/results/`

---

## Next Step

| Condition | Next Document | Command |
|-----------|---------------|---------|
| More tasks | [prepare.md](prepare.md) | `orchestra prepare` |
| Sprint complete | Sprint closeout | Sprint review |

---

## Evidence Produced

| Evidence | Location | Purpose |
|----------|----------|---------|
| Archive folder | `.orchestra/orchestrator/results/task-{id}/` | Permanent record |
| Metadata | `.orchestra/orchestrator/results/task-{id}/metadata.json` | Completion details |
| Progress entry | `.orchestra/progress/sprint-{id}-progress.yaml` | Status tracking |
| Git commit | Repository history | Change tracking |
| JSON output | Terminal (with `--json`) | Scripting integration |

### Evidence Verification

```powershell
# Check archive created
Test-Path ".orchestra/orchestrator/results/task-003/"

# View metadata
Get-Content ".orchestra/orchestrator/results/task-003/metadata.json"

# Verify handover cleared
Test-Path ".orchestra/handover/current-task.md"  # Should be False

# Check progress updated
Get-Content ".orchestra/progress/sprint-001-progress.yaml"
```

### JSON Output Format

```json
{
  "success": true,
  "task": {
    "id": 3,
    "title": "Create YAxisConfig Model",
    "status": "completed",
    "attempts": 1,
    "commit": "abc1234"
  },
  "archive_path": ".orchestra/orchestrator/results/task-003/",
  "progress": {
    "completed": 3,
    "total": 12,
    "remaining": 9
  },
  "git": {
    "committed": true,
    "commit_hash": "abc1234",
    "pushed": false
  },
  "next_task": {
    "id": 4,
    "title": "Create YAxisConfigCollection",
    "prepared": true
  }
}
```

---

## Implementation Reference

| Component | File | Purpose |
|-----------|------|---------|
| Command | [src/commands/complete.ts](../../src/commands/complete.ts) | CLI command definition |
| Core logic | [src/core/complete.ts](../../src/core/complete.ts) | `runComplete()` function |
| Tests | [test/commands/complete.test.ts](../../test/commands/complete.test.ts) | Unit tests |
| Spec | [spec/implementation/phase-1-cli/commands/complete.md](../../spec/implementation/phase-1-cli/commands/complete.md) | Full specification |
| Process | [spec/04-processes/task-lifecycle.md](../../spec/04-processes/task-lifecycle.md) | COMPLETE phase definition |

### Key Functions

```typescript
// src/core/complete.ts

/**
 * Main complete function - runs post-verification closeout
 */
export async function runComplete(options: CompleteOptions): Promise<CompleteResult>

/**
 * Validate task can be completed (verification passed, task in progress)
 */
async function validateComplete(orchestraRoot: string, taskId: number, force: boolean): Promise<ValidationResult>

/**
 * Create archive folder with all task artifacts
 */
async function createArchive(orchestraRoot: string, taskId: number, title: string): Promise<string>

/**
 * Clear handover folder for next task
 */
async function clearHandover(orchestraRoot: string): Promise<void>
```

---

## Troubleshooting

### Issue: "Verification not passed"

**Cause**: Last verification failed or no verification run.

**Solution**:
```bash
# Run verification first
orchestra verify

# If it fails, fix issues and reverify
# Then complete
orchestra complete
```

### Issue: "Task not in progress"

**Cause**: Task has wrong status (PENDING or already COMPLETED).

**Solution**:
```bash
# Check task status
orchestra status --task 3

# If PENDING, prepare first
orchestra prepare --task 3

# If COMPLETED, task already done
```

### Issue: Stale verification report warning

**Cause**: Verification was run more than 30 minutes ago.

**Solution**:
```bash
# Re-run verification for fresh result
orchestra verify

# Then complete immediately
orchestra complete
```

### Issue: Archive creation failed

**Cause**: Permission issues or disk space.

**Solution**:
```powershell
# Check directory permissions
Get-Acl ".orchestra/orchestrator/results/"

# Create directory manually if needed
New-Item -ItemType Directory -Force ".orchestra/orchestrator/results/task-003"
```

### Issue: Git commit failed

**Cause**: Merge conflicts or uncommitted changes.

**Solution**:
```bash
# Check git status
git status

# Resolve any conflicts
git add .
git commit -m "resolve conflicts"

# Retry complete
orchestra complete --commit
```

---

## Archive Structure

The complete command creates a permanent archive of all task artifacts:

```
.orchestra/orchestrator/results/task-003/
├── metadata.json           # Completion metadata (JSON)
├── current-task.md         # Original task handover
├── completion-signal.md    # Implementor's completion signal
├── verification-report.yaml # Verification results
└── artifacts/              # Task-specific artifacts
    ├── created-file-1.dart # Copy of created files
    └── created-file-2.dart
```

### Archive Immutability

Once created, archives should not be modified:

| Archive State | Allowed Operations |
|---------------|-------------------|
| Created | Read only |
| Sprint complete | May be compressed |
| Post-retrospective | May be archived to cold storage |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-05 | Initial creation |

---

*This is the authoritative documentation for the complete workflow step.*
