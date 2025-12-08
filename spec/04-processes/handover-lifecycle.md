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
├── progress.yaml                    # Runtime state tracking
├── handover/                        # Active handover documents (Orchestrator → Implementor)
│   ├── current-task.md              # Main handover document
│   ├── completion-signal.md         # Signal template for implementor
│   ├── task-context.md              # Background context
│   └── preflight-checklist.yaml     # Pre-flight checklist (until archived)
├── implementor/
│   ├── signals/                     # Completion signals (Implementor → Orchestrator)
│   │   ├── task-001-complete.signal
│   │   └── ...
│   └── feedback/                    # Retry feedback (Orchestrator → Implementor)
│       ├── task-001-feedback.md     # Feedback from orchestrator if verification fails
│       └── ...
├── artifacts/                       # Archived task artifacts
│   ├── task-001/
│   ├── task-002/
│   └── ...
└── orchestrator/                    # Orchestrator-only area
    ├── .orchestrator-only/          # Hidden from implementor
    │   ├── verification/            # Hidden verification criteria
    │   │   └── task-N.yaml
    │   └── preflight/               # Handover audit trail
    │       ├── task-N.md            # Copy of handover given to implementor
    │       └── preflight-task-N.yaml # Completed pre-flight checklist
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
handover/
├── current-task.md         # Main handover document
├── completion-signal.md    # Signal template
├── task-context.md         # Background context
└── preflight-checklist.yaml # Pre-flight checklist (before archival)
```

**When**: Orchestrator has prepared handover
**Who**: Orchestrator creates, Implementor reads
**Transitions to**: ACTIVE (Implementor starts work)

### State 3: ACTIVE (Work In Progress)

```
handover/
├── current-task.md         # Reference during implementation
├── completion-signal.md    # Template for signaling
└── task-context.md         # Background reference
```

**When**: Implementor actively working
**Who**: Implementor reads handover, creates code
**Transitions to**: SIGNALED (Implementor signals completion)

### State 4: SIGNALED (Awaiting Verification)

```
handover/
├── current-task.md                  # Reference
├── completion-signal.md             # Signal template
└── task-context.md                  # Background reference

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
├── completion-signal.md             # Signal template
└── task-context.md                  # Background reference

implementor/feedback/
└── task-005-feedback.md             # Feedback for retry
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
| Handover documents | `handover/` | Task specifications |
| Feedback documents | `implementor/feedback/` | Retry instructions |
| Manifest | `manifest.yaml` | Sprint and task state |
| Progress | `progress.yaml` | Runtime state tracking |
| Verification criteria | `orchestrator/.orchestrator-only/verification/` | Hidden from Implementor |
| Handover audit | `orchestrator/.orchestrator-only/preflight/task-N.md` | Accountability record |
| Pre-flight audit | `orchestrator/.orchestrator-only/preflight/preflight-task-N.yaml` | Verification record |

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
**Command**: `orchestra prepare`
**Reference**: [docs/workflow/prepare.md](../../docs/workflow/prepare.md)

```powershell
# 1. Run closeout check (verifies previous task closed)
# Automatic in CLI

# 2. Run prepare command
orchestra prepare --task N

# Generated files:
#   .orchestra/handover/current-task.md
#   .orchestra/handover/completion-signal.md
#   .orchestra/handover/task-context.md
#   .orchestra/handover/preflight-checklist.yaml

# 3. Orchestrator completes handover content (fills TODOs)

# 4. Orchestrator completes pre-flight checklist

# 5. Verify handover is complete

# 6. Update manifest status: PENDING → IMPLEMENT
# Automatic in CLI
```

> **Schema Validation**: Verification YAML is validated against `VerificationYamlSchema` when running `orchestra verify`.
> Invalid check types or severities are rejected with detailed error messages.

### Signal Completion (ACTIVE → SIGNALED)

**Trigger**: Implementor finished work
**Actor**: Implementor
**Reference**: implement.md (to be created)

```powershell
# 1. Implementor fills completion-signal.md with:
#    - Summary of work done
#    - Files created/modified
#    - Tests added
#    - Any notes for verifier

# 2. Run accept-signal command
orchestra accept-signal

# Signal file created: .orchestra/implementor/signals/task-{id}-complete.signal

# 3. Manifest status: IMPLEMENT → GATE_CHECK
# Automatic in CLI
```

### Accept Signal (SIGNALED → VERIFY)

**Trigger**: Implementor signaled completion
**Actor**: Orchestrator
**Command**: `orchestra verify`
**Reference**: verify.md (to be created)

```powershell
# 1. Verify signal file exists
# Automatic in CLI

# 2. Run verification checks
orchestra verify

# 3. Manifest status: GATE_CHECK → VERIFY (if passed)
# Automatic in CLI
```

### Archive Task (VERIFY → COMPLETE)

**Trigger**: Verification passed
**Actor**: Orchestrator
**Command**: `orchestra complete`
**Reference**: complete.md (to be created)

```powershell
# 1. Run complete command
orchestra complete

# 2. Creates archive folder
# Location: .orchestra/artifacts/task-{id}/

# 3. Copies handover and artifacts to archive

# 4. Adds verification results

# 5. Clears current handover (handover/ folder)

# 6. Update manifest status: VERIFY → COMPLETE
# Automatic in CLI
```

### Generate Feedback (VERIFY → RETRY)

**Trigger**: Verification failed
**Actor**: Orchestrator
**Command**: `orchestra feedback`
**Reference**: feedback.md (to be created)

```powershell
# 1. Run feedback command
orchestra feedback

# Feedback file location: .orchestra/implementor/feedback/task-{id}-feedback.md

# 2. Update manifest: increment retry_count, status → RETRY
# Automatic in CLI

# 3. Implementor reads feedback, makes fixes, re-signals
```

---

## Handover Document Template

The handover is generated from `current-task.md.hbs` template. Key sections:

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

## Acceptance Criteria
{Visible criteria implementor can verify - NOT the hidden verification}

## Quality Gates
{Commands to run, expected results}

## Completion Protocol
{How to signal done: fill completion-signal.md}
```

**Template location**: `.orchestra/common/templates/current-task.md.hbs`

**Pre-flight checklist**: Generated from `orchestrator-preflight.md.hbs`, contains verification checklist for orchestrator to complete before handoff.

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
- Active handover in `handover/`
- Signals in `implementor/signals/`
- Feedback in `implementor/feedback/`
- Handover audit in `orchestrator/.orchestrator-only/preflight/`

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
# orchestra closeout verifies this
orchestra closeout
```

### Rule 4: Single Active Task

Only one task may be in IMPLEMENT, GATE_CHECK, VERIFY, or RETRY at a time.

### Rule 5: Pre-Flight Audit Required (TD-007)

Before handoff, orchestrator must:
1. Copy handover to `preflight/task-N.md`
2. Archive pre-flight checklist to `preflight/preflight-task-N.yaml`

---

## Error Recovery

### Missing Handover

If handover preparation failed:
```powershell
# Re-run prepare command
orchestra prepare --task N
```

### Missing Signal

If Implementor forgot to signal:
```powershell
# Implementor must run accept-signal
orchestra accept-signal
```

### Partial Archive

If archival failed partway:
```powershell
# Check archive state
$archiveExists = Test-Path ".orchestra/artifacts/task-$id"

# Re-run complete to finish
orchestra complete
```

### Corrupt State

If state is unclear:
```powershell
# Check status
orchestra status

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
                         │ orchestra prepare
                         ▼
                    ┌─────────┐
                    │PREPARED │
                    └────┬────┘
                         │ Implementor starts
                         ▼
                    ┌─────────┐
                    │ ACTIVE  │
                    └────┬────┘
                         │ orchestra accept-signal
                         ▼
                    ┌─────────┐
                    │SIGNALED │
                    └────┬────┘
                         │ orchestra verify
                         ▼
            ┌────────────┴────────────┐
            │                         │
            ▼                         ▼
      ┌──────────┐              ┌─────────┐
      │  VERIFY  │              │  RETRY  │
      └────┬─────┘              └────┬────┘
           │                         │ orchestra feedback
     ┌─────┴─────┐                   │
     │           │                   ▼
     ▼           ▼              (back to ACTIVE)
┌────────┐ ┌──────────┐
│COMPLETE│ │ESCALATED │
└────────┘ └──────────┘
     │ orchestra complete
     ▼
  ┌─────┐
  │EMPTY│ (next task)
  └─────┘
```

---

## Cross-References

- **Prepare workflow**: [docs/workflow/prepare.md](../../docs/workflow/prepare.md)
- **Technical Debt**: [docs/workflow/technical-debt.md](../../docs/workflow/technical-debt.md)
- **TD-007**: Pre-Flight Checklist Workflow
- **TD-008**: Handover Validation Command

---

*The handover lifecycle ensures clear communication between roles through well-defined file locations and state transitions.*
