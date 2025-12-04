````markdown
# Task Lifecycle

> **Navigation**: [Index](../readme.md) | **Prev**: [Templates](../03-components/templates.md) | **Next**: [Verification Protocol](verification-protocol.md)
> 
> **Authority**: [Orchestra Bible Section 7](../../docs/orchestra-bible.md#7-task-lifecycle)

---

## Overview

Every task in Orchestra goes through a defined lifecycle from definition through completion. This document describes each phase and transition.

---

## Lifecycle Phases

> **Per Bible Section 7.1**

```
┌─────────┐    ┌─────────┐    ┌───────────┐    ┌───────────┐    ┌────────┐    ┌──────────┐
│ PENDING │───►│ PREPARE │───►│ IMPLEMENT │───►│ GATE      │───►│ VERIFY │───►│ COMPLETE │
└─────────┘    └─────────┘    └───────────┘    │ CHECK     │    └────────┘    └──────────┘
                                               └───────────┘
                                                    │
                                                    │ FAIL
                                                    ▼
                                               ┌───────────┐
                                               │  RETRY    │
                                               │ (back to  │
                                               │ IMPLEMENT)│
                                               └───────────┘
                                                    │
                                                    │ Max attempts
                                                    ▼
                                               ┌───────────┐
                                               │ ESCALATED │
                                               └───────────┘
```

---

## Phase Details

### PHASE: INITIALIZATION (One-time, before any tasks)

**Actor**: Human / Orchestrator

**Entry condition**: Specification document exists, sprint not yet initialized.

**Actions**:
1. Parse specification into task definitions
2. Generate task manifest with success criteria
3. Generate hidden verification criteria
4. Initialize progress tracking
5. Verify development environment

**Script**: `sprint-init`

**Exit condition**: Sprint is initialized and ready for first task.

---

### PHASE: PENDING

**Actor**: None (waiting state)

**Entry condition**: 
- Task exists in manifest
- All prerequisite tasks are `completed`
- Previous task (if any) has been closed out

**Actions**: (No actions - this is a waiting state)

**Exit condition**: Orchestrator selects this task and begins PREPARE phase.

---

### PHASE: PREPARE

**Actor**: Orchestrator

**Entry condition**: Task is in `pending` status, prerequisites met.

**Actions**:
1. Verify previous task cleanly closed (`task-closeout-check`)
2. Gather task definition and context
3. Generate handover document (`prepare-handover`)
4. Validate handover contains no hidden criteria (`validate-handover`)
5. Update progress to `in_progress`

**Scripts**: `task-closeout-check` → `prepare-handover` → `validate-handover`

**Artifacts produced**:
- `.orchestra/implementor/handovers/task-{id}-handover.md`
- Updated `progress.yaml` (status: `in_progress`)

**Exit condition**: Handover document exists and passes validation.

---

### PHASE: IMPLEMENT

**Actor**: Implementor

**Entry condition**: Valid handover document exists for current task.

**Actions**:
1. Read and understand handover document
2. Implement required changes per success criteria
3. Run local checks (build, test, lint)
4. Signal completion (`signal-complete`)

**Scripts**: `pre-signal-check` (optional) → `signal-complete`

**Artifacts produced**:
- Source files created/modified
- Test files created/modified
- `.orchestra/implementor/signals/task-{id}-signal.md`
- Execution log (recommended)

**Exit condition**: Implementor signals completion.

---

### PHASE: GATE CHECK

**Actor**: System (Orchestrator-initiated, automated)

**Entry condition**: Signal file exists for current task.

**Actions**:
1. Verify signal received
2. Run deterministic checks:
   - Build succeeds
   - Tests pass
   - Static analysis passes
   - Required files exist
3. Record results

**Script**: `gate-check`

**Artifacts produced**:
- `.orchestra/artifacts/task-{id}/gate-check.yaml`

**Exit condition**: All gate checks pass → VERIFY phase. Any fail → RETRY phase.

---

### PHASE: VERIFY

**Actor**: Orchestrator

**Entry condition**: Gate check passed for current task.

**Actions**:
1. Execute hidden verification criteria (`verification-audit`)
2. Check semantic requirements
3. Validate against specification
4. Record verification results

**Script**: `verification-audit`

**Artifacts produced**:
- `.orchestra/artifacts/task-{id}/verification.yaml`

**Exit condition**: All verification passes → COMPLETE phase. Any fail → RETRY phase.

---

### PHASE: COMPLETE

**Actor**: Orchestrator

**Entry condition**: Verification audit passed for current task.

**Actions**:
1. Archive task artifacts (`accept-signal-check`)
2. Generate task summary
3. Update progress to `completed`
4. Verify clean state (`task-closeout-check`)
5. Prepare next task (if any)

**Scripts**: `accept-signal-check` → `task-closeout-check`

**Artifacts produced**:
- `.orchestra/artifacts/task-{id}/summary.md`
- Updated `progress.yaml` (status: `completed`)

**Exit condition**: Progress updated, artifacts archived, ready for next task.

---

### PHASE: RETRY

**Actor**: Orchestrator

**Trigger**: Gate check OR verification audit failed.

**Entry condition**: Failure recorded, attempt count < max_attempts.

**Actions**:
1. Increment attempt counter
2. Generate feedback document (`generate-feedback`)
3. Check retry limits
4. Return to IMPLEMENT phase OR escalate

**Script**: `generate-feedback`

**Artifacts produced**:
- `.orchestra/handover/feedback.md`
- Updated `progress.yaml` (attempts incremented)

**Exit condition**: Back to IMPLEMENT or escalated to human.

---

### PHASE: ESCALATED

**Actor**: Orchestrator → Human Supervisor

**Trigger**: Max retries exceeded OR same error repeated OR explicit escalation.

**Entry condition**: Escalation trigger activated.

**Actions**:
1. Compile escalation report (`escalate-failure`)
2. Notify human supervisor
3. Mark task as escalated
4. Halt workflow until human intervention

**Script**: `escalate-failure`

**Artifacts produced**:
- `.orchestra/artifacts/task-{id}/escalation-report.md`
- Updated `progress.yaml` (status: `escalated`)

**Human resolution options**:
- Fix the issue manually and mark task complete
- Modify task specification and restart
- Skip task and proceed (with documented justification)
- Abort sprint

---

## State Transitions

| From | To | Trigger | Script(s) |
|------|----|---------|-----------|
| — | PENDING | Sprint initialized | `sprint-init` |
| PENDING | PREPARE | Orchestrator starts task | `task-closeout-check` |
| PREPARE | IMPLEMENT | Handover validated | `prepare-handover`, `validate-handover` |
| IMPLEMENT | GATE CHECK | Implementor signals | `signal-complete` |
| GATE CHECK | VERIFY | Gate checks pass | `gate-check` |
| GATE CHECK | RETRY | Gate checks fail | `generate-feedback` |
| VERIFY | COMPLETE | Verification passes | `verification-audit` |
| VERIFY | RETRY | Verification fails | `generate-feedback` |
| COMPLETE | PENDING (next) | Task archived | `accept-signal-check`, `task-closeout-check` |
| RETRY | IMPLEMENT | Feedback provided | — |
| RETRY | ESCALATED | Max attempts | `escalate-failure` |

---

## State in Files

### manifest.yaml

```yaml
tasks:
  - id: "1"
    name: "Create Configuration Loader"
    status: "completed"
    
  - id: "2"
    name: "Write Tests"
    status: "in_progress"
```

### progress.yaml

```yaml
current_task: "2"
status: "in_progress"

tasks:
  "1":
    status: "completed"
    attempts: 1
    completed_at: "2025-12-02T10:30:00Z"
    
  "2":
    status: "in_progress"
    attempts: 1
    started_at: "2025-12-02T11:00:00Z"
```

---

## Attempt Tracking

Each task can have multiple attempts before succeeding.

| Attempt | On Failure | Action |
|---------|------------|--------|
| 1 | Specific feedback | Implementor retries |
| 2 | More specific feedback | Implementor retries with guidance |
| 3 | Detailed failure analysis | Escalate to human |

**After 3 failed attempts**:
- Task is flagged for human review
- May indicate: spec problem, impossible constraint, agent limitation
- Human decides: fix spec, provide hints, or accept with notes

---

## Lifecycle Rules

### Rule 1: No State Skipping

Tasks must go through each phase in order:
- Cannot go from PENDING to COMPLETE
- Cannot go from IMPLEMENT to COMPLETE without GATE CHECK and VERIFY

### Rule 2: Single Task Active

Only one task should be in IMPLEMENT at a time:
- Prevents context pollution
- Ensures focus on current work
- Simplifies verification

### Rule 3: Complete Before Next

Previous task must be COMPLETE before next task starts:
- `task-closeout-check` enforces this
- Prevents accumulated issues

### Rule 4: Artifacts Are Immutable

Once in `artifacts/`, task archive is never modified:
- Full audit trail preserved
- Enables retrospective analysis
- Prevents history rewriting

### Rule 5: Fresh Context Per Task

Each implementor session starts with zero prior knowledge:
- Prevents context pollution
- Handover is the only input
- No "remembering" verification criteria

---

## Phase Boundaries (Sprints)

When moving between phases within a sprint:

1. **All phase tasks complete** before new phase starts
2. **Task context updated** to reflect new phase
3. **Consider fresh agent** to prevent context pollution
4. **Phase retrospective** to capture learnings

````
