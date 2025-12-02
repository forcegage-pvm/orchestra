# Handover Lifecycle

> **Navigation**: [Index](../readme.md) | **Prev**: [Failure Handling](failure-handling.md) | **Next**: [Key Discoveries](../05-research/key-discoveries.md)
>
> Aligned with Orchestra Bible v0.7.0 - Section 6.1 (Folder Structure)

---

## Overview

The handover system is the communication channel between Orchestrator and Implementor. This document describes the lifecycle of handover documents, the file locations per Bible Section 6.1, and the state transitions.

## Key Principle

**Handovers are stored, signals confirm completion, feedback guides retry.**

The file-based system ensures:
- State persists across sessions
- Clear ownership of each file
- Auditable history of all tasks

---

## File Locations (Bible Section 6.1)

```
.orchestra/
├── manifest.yaml                    # Sprint state, task list, progress
├── implementor/
│   ├── handovers/                   # Handover documents (Orchestrator → Implementor)
│   │   ├── task-001.md
│   │   ├── task-002.md
│   │   └── ...
│   ├── signals/                     # Completion signals (Implementor → Orchestrator)
│   │   ├── task-001-complete.signal
│   │   └── ...
│   └── feedback/                    # Retry feedback (Orchestrator → Implementor)
│       ├── task-001-feedback.md    # Feedback from orchestrator if verification fails
│       └── ...
├── artifacts/                       # Archived task artifacts
│   ├── task-001/
│   ├── task-002/
│   └── ...
└── orchestrator/                    # Orchestrator-only area
    └── scripts/                     # Orchestrator scripts
```

---

## Handover States

### State 1: EMPTY (No Active Task)

```
implementor/handovers/
└── (no task-{id}.md for current task)
```

**When**: Sprint start, between tasks
**Who**: N/A
**Transitions to**: PREPARED (Orchestrator prepares task)

### State 2: PREPARED (Task Ready)

```
implementor/handovers/
└── task-005.md         # Filled with task details
```

**When**: Orchestrator has prepared handover
**Who**: Orchestrator creates, Implementor reads
**Transitions to**: ACTIVE (Implementor starts work)

### State 3: ACTIVE (Work In Progress)

```
implementor/handovers/
└── task-005.md         # Reference during implementation
```

**When**: Implementor actively working
**Who**: Implementor reads handover, creates code
**Transitions to**: SIGNALED (Implementor signals completion)

### State 4: SIGNALED (Awaiting Verification)

```
implementor/handovers/
└── task-005.md                      # Reference

implementor/signals/
└── task-005-complete.signal         # Completion signal
```

**When**: Implementor signaled "ready for review"
**Who**: Implementor completed, Orchestrator verifies
**Transitions to**: 
- ARCHIVED (verification passed)
- RETRY (verification failed)

### State 5: RETRY (Feedback Pending)

```
handover/
├── current-task.md                  # Original handover (unchanged)
└── feedback.md                      # Feedback for retry
```

**When**: Verification failed, retry allowed
**Who**: Orchestrator provides feedback, Implementor fixes
**Transitions to**: SIGNALED (Implementor re-signals)

### State 6: ARCHIVED (Task Complete)

```
artifacts/
└── task-005/
    ├── handover.md                  # Original handover
    ├── signal.txt                   # Completion signal
    └── verification-results.md      # Verification report
```

**When**: Verification passed
**Who**: Orchestrator archives
**Transitions to**: EMPTY (next task)

---

## File Ownership

### Orchestrator-Owned Files

| File | Location | Purpose |
|------|----------|---------|
| Handover documents | `implementor/handovers/` | Task specifications |
| Feedback documents | `implementor/feedback/` | Retry instructions |
| Manifest | `manifest.yaml` | Sprint and task state |
| Verification criteria | `orchestrator/` area | Hidden from Implementor |

### Implementor-Owned Files

| File | Location | Purpose |
|------|----------|---------|
| Completion signals | `implementor/signals/` | Task completion marker |
| Implementation artifacts | Project source | Code deliverables |

---

## Lifecycle Transitions

### Prepare Handover (EMPTY → PREPARED)

**Trigger**: Previous task complete or sprint start
**Actor**: Orchestrator
**Scripts**: `validate-handover.ps1`, `prepare-handover.ps1`

```powershell
# 1. Verify previous task closed (if not first task)
.orchestra/orchestrator/scripts/task-closeout-check.ps1

# 2. Create handover document
# Location: .orchestra/implementor/handovers/task-{id}.md

# 3. Fill with task details from manifest

# 4. Validate handover is complete
.orchestra/orchestrator/scripts/validate-handover.ps1

# 5. Prepare handover for Implementor
.orchestra/orchestrator/scripts/prepare-handover.ps1

# 6. Update manifest status: PENDING → IMPLEMENT
```

### Signal Completion (ACTIVE → SIGNALED)

**Trigger**: Implementor finished work
**Actor**: Implementor
**Scripts**: `pre-signal-check.ps1`, `signal-complete.ps1`

```powershell
# 1. Run pre-signal validation
.orchestra/implementor/scripts/pre-signal-check.ps1

# 2. If passed, create signal file
.orchestra/implementor/scripts/signal-complete.ps1

# Signal file location: .orchestra/implementor/signals/task-{id}-complete.signal

# 3. Manifest status: IMPLEMENT → GATE_CHECK
```

### Accept Signal (SIGNALED → VERIFY)

**Trigger**: Implementor signaled completion
**Actor**: Orchestrator
**Scripts**: `accept-signal-check.ps1`, `gate-check.ps1`

```powershell
# 1. Check signal file exists
.orchestra/orchestrator/scripts/accept-signal-check.ps1

# 2. Run automated verification
.orchestra/orchestrator/scripts/gate-check.ps1

# 3. Manifest status: GATE_CHECK → VERIFY (if passed)
```

### Archive Task (VERIFY → COMPLETE)

**Trigger**: Verification passed
**Actor**: Orchestrator
**Scripts**: `task-closeout-check.ps1`

```powershell
# 1. Run verification audit
.orchestra/orchestrator/scripts/verification-audit.ps1

# 2. Create archive folder
# Location: .orchestra/artifacts/task-{id}/

# 3. Copy handover and artifacts to archive

# 4. Add verification results

# 5. Verify ready for closeout
.orchestra/orchestrator/scripts/task-closeout-check.ps1

# 6. Update manifest status: VERIFY → COMPLETE

# 7. Clear current handover (task-specific files)
```

### Generate Feedback (VERIFY → RETRY)

**Trigger**: Verification failed
**Actor**: Orchestrator
**Scripts**: `generate-feedback.ps1`

```powershell
# 1. Create feedback document
.orchestra/orchestrator/scripts/generate-feedback.ps1

# Feedback file location: .orchestra/handover/feedback.md

# 2. Update manifest: increment retry_count, status → RETRY

# 3. Implementor reads feedback, makes fixes, re-signals
```

---

## Handover Document Template

```markdown
# Task {id}: {title}

## Objective
{Clear statement of what must be accomplished}

## Context
{How this fits in the sprint, dependencies, background}

## Technical Specification
{Exact requirements, constraints, interfaces}

## Implementation Guidelines
{Patterns to follow, files to modify, code locations}

## Verification Criteria
{Measurable conditions that must be satisfied}

## Quality Gates
{Commands to run, expected results}

## Completion Protocol
{How to signal done: run pre-signal-check, then signal-complete}
```

---

## Signal File Format

The signal file is a simple marker with metadata:

```yaml
# task-005-complete.signal
task_id: 5
signaled_at: "2025-01-05T14:30:00Z"
pre_signal_passed: true
implementor_notes: "All tests passing, screenshot captured"
```

---

## Feedback Document Template

```markdown
# Feedback: Task {id} - Attempt {n}

## Result: FAILED

## Failed Checks

### {check_name} ({severity})
**Expected**: {what was expected}
**Actual**: {what was found}
**Fix**: {specific action to take}

## What Was Correct
{Positive reinforcement for what passed}

## Next Steps
1. {Step 1}
2. {Step 2}
3. Run pre-signal-check
4. Signal completion again
```

---

## Validation Rules

### Rule 1: No Orphaned Files

Files must be in correct locations:
- Handovers in `implementor/handovers/`
- Signals in `implementor/signals/`
- Feedback in `implementor/feedback/`

### Rule 2: Signal Before Verify

Cannot enter GATE_CHECK without signal file:
```powershell
if (-not (Test-Path ".orchestra/implementor/signals/task-$id-complete.signal")) {
    throw "Signal file missing - cannot verify"
}
```

### Rule 3: Archive Before Next Task

Cannot prepare next task until current is archived:
```powershell
# task-closeout-check.ps1 verifies this
```

### Rule 4: Single Active Task

Only one task may be in IMPLEMENT, GATE_CHECK, VERIFY, or RETRY at a time.

---

## Error Recovery

### Missing Handover

If handover preparation failed:
```powershell
# Re-run preparation
.orchestra/orchestrator/scripts/prepare-handover.ps1
```

### Missing Signal

If Implementor forgot to signal:
```powershell
# Implementor must run signal script
.orchestra/implementor/scripts/signal-complete.ps1
```

### Partial Archive

If archival failed partway:
```powershell
# Check archive state
$archiveExists = Test-Path ".orchestra/artifacts/task-$id"

# Re-run closeout check to complete
.orchestra/orchestrator/scripts/task-closeout-check.ps1
```

### Corrupt State

If state is unclear:
```powershell
# Use git to determine truth
git status
git log --oneline -5

# Check manifest for current state
Get-Content .orchestra/manifest.yaml
```

---

## State Machine Diagram

```
                    ┌─────────┐
                    │  EMPTY  │
                    └────┬────┘
                         │ prepare-handover.ps1
                         ▼
                    ┌─────────┐
                    │PREPARED │
                    └────┬────┘
                         │ Implementor starts
                         ▼
                    ┌─────────┐
                    │ ACTIVE  │
                    └────┬────┘
                         │ signal-complete.ps1
                         ▼
                    ┌─────────┐
                    │SIGNALED │
                    └────┬────┘
                         │ accept-signal-check.ps1
                         ▼
            ┌────────────┴────────────┐
            │                         │
            ▼                         ▼
      ┌──────────┐              ┌─────────┐
      │  VERIFY  │              │  RETRY  │
      └────┬─────┘              └────┬────┘
           │                         │
     ┌─────┴─────┐                   │
     │           │                   │
     ▼           ▼                   ▼
┌────────┐ ┌──────────┐        (back to ACTIVE)
│COMPLETE│ │ESCALATED │
└────────┘ └──────────┘
     │
     ▼
  ┌─────┐
  │EMPTY│ (next task)
  └─────┘
```

---

*The handover lifecycle ensures clear communication between roles through well-defined file locations and state transitions.*
