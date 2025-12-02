# Core Workflows

> **Navigation**: [Index](../readme.md) | **Prev**: [Roles](roles.md) | **Next**: [Decisions](decisions/)
>
> Aligned with Orchestra Bible v0.7.0 - Section 5

---

## Overview

This document defines the key workflows in Orchestra. Each workflow corresponds to a specific phase of the task lifecycle and details the exact steps, decision points, and script invocations required.

All workflows assume:
- Environment is initialized (`set-env.ps1` sourced)
- Manifest is accessible at `.orchestra/manifest.yaml`
- Scripts are available in their designated locations per Bible Section 8

---

## Workflow 1: Sprint Initialization

**Actor**: Orchestrator  
**Trigger**: New sprint begins or first use of Orchestra  
**Lifecycle Phase**: INITIALIZATION  
**Outcome**: Sprint configured, manifest ready, first task PENDING

### Pre-Conditions

- [ ] `.orchestra/` directory structure exists
- [ ] Environment scripts are in place

### Steps

```
1. SOURCE ENVIRONMENT
   └── Run: . .orchestra/common/scripts/set-env.ps1

2. INITIALIZE SPRINT
   └── Run: .orchestra/orchestrator/scripts/sprint-init.ps1
       ├── Creates or updates manifest.yaml
       ├── Sets sprint metadata (start_date, version)
       ├── Enumerates tasks from spec sources
       └── All tasks start in PENDING state

3. VALIDATE SPRINT SETUP
   └── Run: .orchestra/orchestrator/scripts/sprint-status.ps1
       ├── Displays sprint progress summary
       └── Confirms all tasks are registered

4. PROCEED TO PREPARATION
   └── Continue to Workflow 2 (Task Preparation)
```

### Script Sequence
| Step | Script | Required |
|------|--------|----------|
| 1 | `set-env.ps1` | ✅ |
| 2 | `sprint-init.ps1` | ✅ |
| 3 | `sprint-status.ps1` | Optional |

---

## Workflow 2: Task Preparation (Orchestrator → Implementor)

**Actor**: Orchestrator  
**Trigger**: Task in PENDING state, previous task completed (or first task)  
**Lifecycle Phase**: PREPARE  
**Outcome**: Handover document ready, Implementor can begin

### Pre-Conditions

- [ ] Task closeout check passed for previous task (or this is first task)
- [ ] Environment variables set
- [ ] Orchestrator has read current manifest state

### Steps

```
1. CLOSEOUT CHECK (if not first task)
   ├── Run: . .orchestra/common/scripts/set-env.ps1
   └── Run: .orchestra/orchestrator/scripts/task-closeout-check.ps1
       ├── PASS: Continue to next task
       └── FAIL: Fix issues (uncommitted changes, missing signals, etc.)

2. IDENTIFY NEXT TASK
   ├── Read: .orchestra/manifest.yaml
   ├── Find first task with status: PENDING
   ├── Note task ID, dependencies, category
   └── Validate dependencies are satisfied (all deps COMPLETE)

3. PREPARE HANDOVER DOCUMENT
   ├── Create/clear: .orchestra/implementor/handovers/task-{id}.md
   ├── Use template from: .orchestra/common/templates/handover.md.template
   └── Fill ALL sections:
       ├── Task Overview (objective, deliverables)
       ├── Context (how this fits in the sprint)
       ├── Technical Specification (exact requirements)
       ├── Implementation Guidelines (patterns, locations)
       ├── Verification Criteria (measurable conditions)
       ├── Quality Gates (test commands, analysis commands)
       └── Completion Protocol (how to signal done)

4. VALIDATE HANDOVER
   └── Run: .orchestra/orchestrator/scripts/validate-handover.ps1
       ├── Checks: No [TODO], [TBD], or placeholder markers
       ├── Checks: All required sections present
       ├── Checks: File paths are unambiguous
       ├── PASS: Continue
       └── FAIL: Fix handover document

5. UPDATE MANIFEST
   ├── Set task status: PREPARE → IMPLEMENT (indicates handover ready)
   └── Record preparation timestamp

6. PREPARE HANDOVER
   └── Run: .orchestra/orchestrator/scripts/prepare-handover.ps1
       ├── Copies handover to implementor location
       ├── Clears any previous feedback
       └── Logs preparation in manifest

7. INVOKE IMPLEMENTOR
   ├── Signal that handover is ready
   └── Implementor begins (new session or mode switch)
```

### Handover Completeness Checklist

Before invoking Implementor, verify:

- [ ] Can a fresh agent complete without asking questions?
- [ ] Are file paths unambiguous (full relative paths)?
- [ ] For UPDATE files: are specific changes listed?
- [ ] Are verification criteria measurable?
- [ ] Is the completion protocol clear?

### Script Sequence
| Step | Script | Required |
|------|--------|----------|
| 1 | `task-closeout-check.ps1` | ✅ (if not first task) |
| 4 | `validate-handover.ps1` | ✅ |
| 6 | `prepare-handover.ps1` | ✅ |

---

## Workflow 3: Task Implementation (Implementor)

**Actor**: Implementor  
**Trigger**: Handover document prepared by Orchestrator  
**Lifecycle Phase**: IMPLEMENT  
**Outcome**: Implementation complete, completion signal filed

### Pre-Conditions

- [ ] Handover document exists at `.orchestra/implementor/handovers/task-{id}.md`
- [ ] Implementor has NO context beyond handover document
- [ ] Environment is ready for development

### The Implementor Scope Statement

> **"Your world is ONLY the handover document."**
>
> You do not have access to:
> - Conversation history with the user
> - The manifest or progress tracking
> - Other handover documents
> - Orchestrator-only directories

### Steps

```
1. VALIDATE HANDOVER
   └── Run: .orchestra/implementor/scripts/validate-handover.ps1
       ├── Confirms handover document is complete
       ├── PASS: Continue to implementation
       └── FAIL: Stop, signal defect (cannot proceed)

2. UNDERSTAND TASK
   ├── Read handover document thoroughly
   ├── Identify task category (infrastructure/integration/visual)
   ├── Note files to CREATE vs UPDATE
   ├── Note verification criteria
   └── Note quality gates (commands to run)

3. IMPLEMENT
   ├── Follow implementation guidelines exactly
   ├── Use existing patterns from codebase
   ├── Do not deviate from specification
   └── Track which criteria will be satisfied

4. QUALITY CHECKS
   ├── Run static analysis on affected files
   │   └── Must show "No issues found!"
   ├── Run tests specified in quality gates
   │   └── All must pass
   └── Fix any failures before proceeding

5. PRE-SIGNAL CHECK
   └── Run: .orchestra/implementor/scripts/pre-signal-check.ps1
       ├── Validates implementation matches criteria
       ├── Checks for uncommitted changes
       ├── Creates verification artifact
       ├── PASS: Continue
       └── FAIL: Fix issues, re-run

6. SIGNAL COMPLETION
   └── Run: .orchestra/implementor/scripts/signal-complete.ps1
       ├── Creates signal file: .orchestra/implementor/signals/task-{id}-complete.signal
       ├── Updates manifest status: IMPLEMENT → GATE_CHECK
       └── Logs completion timestamp
```

### Script Sequence
| Step | Script | Required |
|------|--------|----------|
| 1 | `validate-handover.ps1` | ✅ |
| 5 | `pre-signal-check.ps1` | ✅ |
| 6 | `signal-complete.ps1` | ✅ |

---

## Workflow 4: Gate Check (Orchestrator)

**Actor**: Orchestrator  
**Trigger**: Implementor signals completion  
**Lifecycle Phase**: GATE_CHECK  
**Outcome**: Automated verification complete, proceed to VERIFY or RETRY

### Pre-Conditions

- [ ] Completion signal exists
- [ ] Pre-signal artifact exists
- [ ] Environment ready for verification

### Steps

```
1. ACCEPT SIGNAL
   └── Run: .orchestra/orchestrator/scripts/accept-signal-check.ps1
       ├── Validates signal file exists
       ├── Validates pre-signal artifact exists
       ├── PASS: Continue to gate check
       └── FAIL: Signal invalid, task fails

2. RUN GATE CHECK
   └── Run: .orchestra/orchestrator/scripts/gate-check.ps1
       ├── Executes automated verification:
       │   ├── Static analysis (flutter analyze)
       │   ├── Test execution (flutter test)
       │   ├── Schema validation (if applicable)
       │   └── Custom checks per task
       ├── PASS: Update status to VERIFY
       └── FAIL: Determine if recoverable

3. ON FAILURE
   ├── If recoverable (test failures, lint errors):
   │   ├── Generate feedback document
   │   ├── Update status to RETRY
   │   └── Continue to Workflow 6 (Retry)
   └── If unrecoverable (missing files, wrong structure):
       ├── Update status to ESCALATED
       └── Continue to Workflow 7 (Escalation)

4. ON SUCCESS
   └── Proceed to Workflow 5 (Verification)
```

### Script Sequence
| Step | Script | Required |
|------|--------|----------|
| 1 | `accept-signal-check.ps1` | ✅ |
| 2 | `gate-check.ps1` | ✅ |

---

## Workflow 5: Verification (Orchestrator/Human)

**Actor**: Orchestrator and/or Human Supervisor  
**Trigger**: Gate check passed  
**Lifecycle Phase**: VERIFY  
**Outcome**: Task COMPLETE or RETRY

### Pre-Conditions

- [ ] Gate check passed
- [ ] All automated verification complete
- [ ] Artifacts available for review

### Steps

```
1. VERIFICATION AUDIT
   └── Run: .orchestra/orchestrator/scripts/verification-audit.ps1
       ├── Compiles verification report
       ├── Documents what passed/failed
       └── Prepares for human review (if required)

2. HUMAN REVIEW (if checkpoint configured)
   ├── Present verification report to human
   ├── Allow human to:
   │   ├── APPROVE: Task passes
   │   ├── REJECT: Task fails with feedback
   │   └── ESCALATE: Requires redesign
   └── Record decision

3. DETERMINE RESULT
   ├── IF approved:
   │   ├── Update status: VERIFY → COMPLETE
   │   ├── Archive task artifacts
   │   └── Update manifest with completion
   └── IF rejected:
       ├── Generate feedback
       └── Continue to Workflow 6 (Retry)

4. TASK CLOSEOUT
   └── Run: .orchestra/orchestrator/scripts/task-closeout-check.ps1
       ├── Verifies all artifacts archived
       ├── Verifies manifest updated
       └── Clears handover for next task
```

### Script Sequence
| Step | Script | Required |
|------|--------|----------|
| 1 | `verification-audit.ps1` | ✅ |
| 4 | `task-closeout-check.ps1` | ✅ |

---

## Workflow 6: Retry Loop

**Actor**: Orchestrator (feedback) → Implementor (retry)  
**Trigger**: Verification failed with recoverable error  
**Lifecycle Phase**: RETRY  
**Outcome**: Implementor receives feedback and retries

### Pre-Conditions

- [ ] Task failed verification
- [ ] Retry count < max_retries (default: 3)
- [ ] Failure is recoverable

### Steps

```
1. CHECK RETRY COUNT
   ├── Read current retry count from manifest
   ├── If count >= max_retries:
   │   ├── Update status: RETRY → ESCALATED
   │   └── Continue to Workflow 7 (Escalation)
   └── Else: Continue

2. GENERATE FEEDBACK
   └── Run: .orchestra/orchestrator/scripts/generate-feedback.ps1
       ├── Creates: .orchestra/implementor/feedback/task-{id}-feedback.md
       ├── Documents specific failures
       ├── Provides actionable fix instructions
       └── Notes what was correct (positive reinforcement)

3. INCREMENT RETRY COUNT
   └── Update manifest: retry_count += 1

4. INVOKE IMPLEMENTOR
   ├── Implementor reads feedback
   ├── Makes targeted fixes
   └── Re-signals completion

5. RE-VERIFY
   └── Return to Workflow 4 (Gate Check)
```

### Script Sequence
| Step | Script | Required |
|------|--------|----------|
| 2 | `generate-feedback.ps1` | ✅ |

---

## Workflow 7: Escalation

**Actor**: Orchestrator → Human Supervisor  
**Trigger**: Unrecoverable error or exceeded retry limit  
**Lifecycle Phase**: ESCALATED  
**Outcome**: Human intervention

### Pre-Conditions

- [ ] Task cannot proceed automatically
- [ ] Escalation is warranted

### Steps

```
1. ESCALATE FAILURE
   └── Run: .orchestra/orchestrator/scripts/escalate-failure.ps1
       ├── Updates manifest status: → ESCALATED
       ├── Creates escalation report
       ├── Documents failure history
       └── Notifies human (if configured)

2. HUMAN INTERVENTION
   ├── Human reviews escalation report
   ├── Human chooses action (see Roles 4.3.1):
   │   ├── Fix manually and mark complete
   │   ├── Modify task specification
   │   ├── Skip task (with justification)
   │   ├── Split task into smaller pieces
   │   └── Abort sprint
   └── Record decision in manifest

3. RESUME (if applicable)
   ├── If task modified: Return to Workflow 2 (Preparation)
   ├── If task skipped: Continue to next task
   └── If sprint aborted: End workflows
```

### Script Sequence
| Step | Script | Required |
|------|--------|----------|
| 1 | `escalate-failure.ps1` | ✅ |

---

## Decision Trees

### When to Escalate vs Retry

```
Is the error clearly described?
├── NO → RETRY with clarifying feedback
└── YES → Is the fix within Implementor capability?
    ├── YES → Has retry limit been reached?
    │   ├── YES → ESCALATE
    │   └── NO → RETRY with specific feedback
    └── NO → ESCALATE (requires human/redesign)
```

### When to Require Human Review

```
Is this a critical path task?
├── YES → Human review at VERIFY phase
└── NO → Is this the final task in sprint?
    ├── YES → Human review at VERIFY phase
    └── NO → Automated verification sufficient
        (unless checkpoints configured)
```

### Retry vs Skip Decision

```
How many retries have occurred?
├── 0-1 → RETRY (likely fixable)
├── 2 → RETRY with enhanced feedback
└── 3+ → ESCALATE (needs intervention)
    └── Human decides: Fix, Modify, or Skip
```

---

## Workflow Invariants

These conditions must ALWAYS be true:

1. **Single Active Task**: Only one task may be in IMPLEMENT, GATE_CHECK, or VERIFY state at a time
2. **State Persistence**: All state is stored in files (manifest, signals, feedback), never in conversation
3. **Script Authority**: State transitions only occur through script execution
4. **Handover Completeness**: No task enters IMPLEMENT without validated handover
5. **Signal Required**: No task enters GATE_CHECK without completion signal

---

## Workflow Integration

```
                    ┌─────────────────────┐
                    │  Sprint Init (WF1)  │
                    └─────────┬───────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                    TASK LOOP                            │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │ Prepare(WF2) │───▶│Implement(WF3)│───▶│ Gate(WF4) │ │
│  └──────────────┘    └──────────────┘    └─────┬─────┘ │
│         ▲                                      │       │
│         │         ┌────────────────────────────┤       │
│         │         │                            │       │
│         │         ▼                            ▼       │
│         │  ┌──────────────┐           ┌─────────────┐  │
│         │  │  Retry(WF6)  │           │ Verify(WF5) │  │
│         │  └──────┬───────┘           └──────┬──────┘  │
│         │         │                          │         │
│         │         ▼                          │         │
│         │  ┌──────────────┐                  │         │
│         │  │Escalate(WF7) │                  │         │
│         │  └──────────────┘                  │         │
│         │                                    │         │
│         └────────────────────────────────────┘         │
│                    (next task)                         │
└─────────────────────────────────────────────────────────┘
```

---

*All workflows are designed for deterministic, resumable execution. Any interruption can be recovered by re-running the appropriate script for the current lifecycle phase.*
