# Failure Types

> **Purpose**: Taxonomy of failures in the Orchestra workflow  
> **Related**: [failures.md](failures.md) | [feedback.md](feedback.md) | [escalate.md](escalate.md)  
> **Spec Reference**: [spec/04-processes/failure-handling.md](../../spec/04-processes/failure-handling.md)

---

## Overview

Failures in Orchestra can occur at multiple points in the workflow. This document categorizes all failure types, their detection points, and handling strategies.

**Critical Distinction**: Not all failures require inter-agent communication. Most failures are **internal** - the CLI outputs errors and the same agent resolves them. Only certain failures require **feedback** to cross the agent trust boundary.

---

## Failure Communication Model

```
                         FAILURES
                            │
            ┌───────────────┴───────────────┐
            │                               │
      INTERNAL                        INTER-AGENT
   (Self-Resolve)                     (Feedback Required)
            │                               │
    ┌───────┴───────┐               ┌───────┴───────┐
    │               │               │               │
 Implementor    Orchestrator    Gate Check    Verification
 fixes own      fixes own       failure       failure
 errors         errors              │               │
    │               │               ▼               ▼
    ▼               ▼          Feedback to    Feedback to
CLI output     CLI output      Implementor    Implementor
sufficient     sufficient      via file       via file
```

---

## Internal vs Inter-Agent Failures

### Internal Failures (No Feedback Required)

These failures are detected and resolved by the **same agent**. The CLI output contains all information needed to fix the issue.

| Failure Type | Agent | CLI Provides | Agent Action |
|--------------|-------|--------------|--------------|
| Pre-signal check fails | Implementor | Error details, file paths | Fix and re-run |
| Build fails | Implementor | Compiler errors | Fix code |
| Tests fail | Implementor | Test output | Fix tests/code |
| Lint fails | Implementor | Lint errors | Fix style issues |
| Handover validation fails | Orchestrator | Validation errors | Fix handover |
| Config syntax error | Either | Parse error | Fix YAML |
| Template not found | Either | Path error | Add template |

**Resolution Pattern**:
```
Agent runs command → CLI outputs error → Agent fixes → Agent re-runs command
```

**No file-based feedback needed** - the agent sees their own terminal.

### Inter-Agent Failures (Feedback Required)

These failures are detected by one agent but must be fixed by a **different agent**. File-based communication is required because agents don't share terminal sessions.

| Failure Type | Detecting Agent | Fixing Agent | Communication |
|--------------|-----------------|--------------|---------------|
| Gate check fails | Orchestrator | Implementor | `.orchestra/handover/feedback.md` |
| Verification fails | Orchestrator | Implementor | `.orchestra/handover/feedback.md` |
| Handover incomplete | Implementor | Orchestrator | Signal with BLOCKED status |
| Max retries exceeded | Orchestrator | Human | Escalation report |

**Resolution Pattern**:
```
Agent A detects failure → Agent A writes feedback file → Agent B reads file → Agent B fixes → Agent B signals
```

**File-based feedback required** - agents operate in separate sessions.

---

## Why This Distinction Matters

### Internal Failures
- **CLI output is sufficient** - all context in terminal
- **No retry counter** - agent loops until fixed
- **No state transition** - stay in current phase
- **No feedback file** - waste of effort

### Inter-Agent Failures
- **CLI output not visible** to fixing agent
- **Retry counter tracks attempts**
- **State transitions** (VERIFY_FAILED → RETRY → IMPLEMENT)
- **Feedback file is the communication channel**
- **Hidden criteria protection** - feedback must not leak verification details

---

## Category 1: Validation Failures

Failures detected **before** implementation work begins or completes.

### V1: Handover Validation Failures

> **Resolution Mode**: INTERNAL (Orchestrator self-resolves)  
> **Feedback Required**: NO - CLI output is sufficient

| Failure | Detection Point | CLI Command | Severity |
|---------|-----------------|-------------|----------|
| V1.1 | Missing task title | `orchestra validate-handover` | BLOCKING |
| V1.2 | Missing objective section | `orchestra validate-handover` | BLOCKING |
| V1.3 | Missing deliverables section | `orchestra validate-handover` | BLOCKING |
| V1.4 | Missing TDD/testing section | `orchestra validate-handover` | BLOCKING |
| V1.5 | CREATE paths not specified | `orchestra validate-handover` | BLOCKING |
| V1.6 | CREATE files already exist | `orchestra validate-handover` | BLOCKING |
| V1.7 | UPDATE paths not specified | `orchestra validate-handover` | WARNING |
| V1.8 | UPDATE files don't exist | `orchestra validate-handover` | BLOCKING |
| V1.9 | TODO/TBD markers in handover | `orchestra validate-handover` | BLOCKING |
| V1.10 | Missing code scaffold | `orchestra validate-handover` | WARNING |
| V1.11 | Missing test sample data | `orchestra validate-handover` | WARNING |
| V1.12 | Missing MUST USE section | `orchestra validate-handover` | WARNING |
| V1.13 | Missing demo file (visual) | `orchestra validate-handover` | WARNING |

**Agent**: Orchestrator  
**Resolution**: Fix handover. Re-run validate. CLI output guides corrections.

### V2: Signal Validation Failures (Pre-Signal)

> **Resolution Mode**: INTERNAL (Implementor self-resolves)  
> **Feedback Required**: NO - CLI output is sufficient

| Failure | Detection Point | CLI Command | Severity |
|---------|-----------------|-------------|----------|
| V2.1 | CREATE files don't exist | `orchestra pre-signal-check` | BLOCKING |
| V2.2 | CREATE files empty | `orchestra pre-signal-check` | BLOCKING |
| V2.3 | UPDATE files not modified | `orchestra pre-signal-check` | BLOCKING |
| V2.4 | Test files don't exist | `orchestra pre-signal-check` | BLOCKING |
| V2.5 | Tests fail | `orchestra pre-signal-check` | BLOCKING |
| V2.6 | Build fails | `orchestra pre-signal-check` | BLOCKING |
| V2.7 | Lint fails | `orchestra pre-signal-check` | BLOCKING |
| V2.8 | Analyzer errors | `orchestra pre-signal-check` | BLOCKING |
| V2.9 | TODO/FIXME in new code | `orchestra pre-signal-check` | WARNING |
| V2.10 | Demo file missing (visual) | `orchestra pre-signal-check` | WARNING |
| V2.11 | Demo lacks content | `orchestra pre-signal-check` | WARNING |
| V2.12 | No git changes | `orchestra pre-signal-check` | WARNING |
| V2.13 | Completion signal format invalid | `orchestra pre-signal-check` | BLOCKING |

**Agent**: Implementor  
**Resolution**: Fix issues. Re-run pre-signal-check. CLI output guides corrections.

### V3: Signal Acceptance Failures (Gate Check)

> **Resolution Mode**: INTER-AGENT (Orchestrator → Implementor)  
> **Feedback Required**: YES - Implementor cannot see Orchestrator's terminal

| Failure | Detection Point | CLI Command | Severity |
|---------|-----------------|-------------|----------|
| V3.1 | Pre-signal artifact missing | `orchestra accept-signal` | BLOCKING |
| V3.2 | Pre-signal status not PASSED | `orchestra accept-signal` | BLOCKING |
| V3.3 | Task ID mismatch | `orchestra accept-signal` | BLOCKING |
| V3.4 | Artifact stale (>24h) | `orchestra accept-signal` | WARNING |
| V3.5 | Completion signal incomplete | `orchestra accept-signal` | BLOCKING |
| V3.6 | Deliverables check failed | `orchestra accept-signal` | BLOCKING |

**Detection**: Orchestrator via `accept-signal`  
**Resolution**: Orchestrator writes feedback → Implementor reads feedback → Implementor fixes → Implementor re-signals

**Feedback Channel**: `.orchestra/handover/feedback.md`

---

## Category 2: Verification Failures

Failures detected during hidden verification checks.

> **Resolution Mode**: INTER-AGENT (Orchestrator → Implementor)  
> **Feedback Required**: YES - Implementor cannot see Orchestrator's terminal or hidden criteria

### VF1: Code Quality Failures

| Failure | Detection | Hidden Criteria |
|---------|-----------|-----------------|
| VF1.1 | Tests don't cover requirement | Test coverage analysis | Yes |
| VF1.2 | Code doesn't match interface | Interface conformance | Yes |
| VF1.3 | Missing error handling | Error path analysis | Yes |
| VF1.4 | Missing documentation | JSDoc/comment check | Yes |
| VF1.5 | Poor naming conventions | Pattern matching | Yes |

### VF2: Functional Failures

| Failure | Detection | Hidden Criteria |
|---------|-----------|-----------------|
| VF2.1 | Feature doesn't work | Functional test | Yes |
| VF2.2 | Edge case not handled | Boundary test | Yes |
| VF2.3 | Integration broken | Integration test | Yes |
| VF2.4 | Performance regression | Benchmark | Yes |
| VF2.5 | Security vulnerability | Security scan | Yes |

### VF3: Artifact Failures

| Failure | Detection | Hidden Criteria |
|---------|-----------|-----------------|
| VF3.1 | Required file missing | File existence check | Yes |
| VF3.2 | File in wrong location | Path validation | Yes |
| VF3.3 | Export not available | Export check | Yes |
| VF3.4 | Content pattern missing | Pattern match | Yes |

**Detection**: Orchestrator via `orchestra verify`  
**Resolution**: Orchestrator writes **sanitized** feedback → Implementor reads feedback → Implementor fixes → Implementor re-signals

**Feedback Channel**: `.orchestra/handover/feedback.md`

**⚠️ CRITICAL**: Feedback must NOT leak hidden verification criteria. Provide guidance without exposing specific checks.

---

## Category 3: System Failures

Failures in the Orchestra system itself, not the implementation.

> **Resolution Mode**: Varies - see individual sections  
> **Feedback Required**: Rarely - usually INTERNAL or ESCALATION

### S1: Tooling Failures

> **Resolution Mode**: INTERNAL (same agent resolves) or ESCALATION (human required)  
> **Feedback Required**: NO - either fix locally or escalate

| Failure | Cause | Resolution |
|---------|-------|------------|
| S1.1 | Git not available | Install/configure git |
| S1.2 | Build tool missing | Install required tooling |
| S1.3 | Test runner fails | Fix test environment |
| S1.4 | Lint tool crashes | Update/configure linter |
| S1.5 | Analyzer unavailable | Install analyzer |

**Resolution**: Agent attempts fix. If blocked, escalate to Human via `orchestra escalate`.

### S2: State Failures

> **Resolution Mode**: INTERNAL (Orchestrator self-resolves)  
> **Feedback Required**: NO - Orchestrator manages state

| Failure | Cause | Resolution |
|---------|-------|------------|
| S2.1 | Manifest corrupted | Restore from git |
| S2.2 | Progress out of sync | Reset progress.yaml |
| S2.3 | Orphaned signals | Clean with `orchestra closeout` |
| S2.4 | Missing handover | Re-run `orchestra prepare` |
| S2.5 | Stuck workflow state | Force state transition |

**Resolution**: Orchestrator diagnoses and fixes. No feedback to Implementor needed.

### S3: Configuration Failures

> **Resolution Mode**: INTERNAL (same agent resolves)  
> **Feedback Required**: NO - CLI output guides fix

| Failure | Cause | Resolution |
|---------|-------|------------|
| S3.1 | orchestra.yaml missing | Run `orchestra init` |
| S3.2 | Invalid config syntax | Fix YAML syntax |
| S3.3 | Missing required paths | Configure paths section |
| S3.4 | Template not found | Add missing template |

**Resolution**: CLI outputs error. Same agent fixes config and re-runs.

---

## Resolution Mode Summary

| Category | Resolution Mode | Feedback Required | Communication |
|----------|-----------------|-------------------|---------------|
| V1: Handover Validation | INTERNAL | NO | CLI output |
| V2: Pre-Signal | INTERNAL | NO | CLI output |
| V3: Gate Check | INTER-AGENT | **YES** | feedback.md |
| VF: Verification | INTER-AGENT | **YES** | feedback.md |
| S1: Tooling | INTERNAL/ESCALATE | NO | CLI or escalation |
| S2: State | INTERNAL | NO | CLI output |
| S3: Configuration | INTERNAL | NO | CLI output |

**Key Insight**: Only V3 (Gate Check) and VF (Verification) failures require the feedback file. All other failures are resolved directly from CLI output.

---

## Failure Severity Levels

| Severity | Effect | Action Required |
|----------|--------|-----------------|
| **BLOCKING** | Workflow cannot proceed | Must fix before continuing |
| **MAJOR** | Task fails verification | Should fix, counts toward retry |
| **MINOR** | Noted but doesn't block | Should address, doesn't block |
| **WARNING** | Advisory only | Consider fixing |
| **INFO** | Informational | No action required |

---

## Failure Resolution Matrix

| Failure Category | Primary Handler | Secondary Handler | Max Attempts | Escalation Path |
|------------------|-----------------|-------------------|--------------|-----------------|
| V1: Handover Validation | Orchestrator | - | N/A | Fix before prepare |
| V2: Pre-Signal | Implementor | - | N/A | Fix before signaling |
| V3: Gate Check | Orchestrator | Implementor | 3 | Escalate to human |
| VF: Verification | Orchestrator/Implementor | Implementor | 3 | Escalate to human |
| S1: Tooling | Human | - | N/A | Immediate |
| S2: State | Orchestrator | Human | 1 | Immediate |
| S3: Config | Orchestrator | Human | 1 | Immediate |

---

## Detection Points in Workflow

```
                WORKFLOW STAGE                    FAILURE TYPES DETECTED
                ──────────────                    ──────────────────────
                
orchestra init ─────────────────────────────────► S3 (Config)

orchestra prepare ──────────────────────────────► V1 (Handover - self-check)

orchestra validate-handover ────────────────────► V1 (Handover Validation)

(Implementor works) ────────────────────────────► (none - work in progress)

orchestra pre-signal-check ─────────────────────► V2 (Pre-Signal)

orchestra signal ───────────────────────────────► (none - just records)

orchestra accept-signal ────────────────────────► V3 (Gate Check)

orchestra verify ───────────────────────────────► VF (Verification)
                                                  VF1 (Code Quality)
                                                  VF2 (Functional)
                                                  VF3 (Artifact)

orchestra feedback ─────────────────────────────► (none - outputs feedback)

orchestra escalate ─────────────────────────────► (none - escalates to human)

orchestra complete ─────────────────────────────► S2 (State - if corrupt)
```

---

## Recoverable vs Unrecoverable

### Recoverable Failures

Can be fixed by retry with feedback:

| Type | Examples |
|------|----------|
| Code issues | Test failures, lint errors, missing exports |
| Incomplete work | Missing files, empty implementations |
| Quality issues | Poor documentation, weak tests |
| Minor gaps | Edge cases not handled |

### Unrecoverable Failures

Require human intervention or escalation:

| Type | Examples |
|------|----------|
| Spec conflicts | Contradictory requirements |
| Tool limitations | AI cannot perform action |
| Architectural | Wrong approach entirely |
| Environment | Missing dependencies, broken tooling |
| Max retries | 3 failed attempts |
| Same error | Same failure repeated twice |

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [failures.md](failures.md) | Failure handling workflow |
| [feedback.md](feedback.md) | RETRY phase details |
| [escalate.md](escalate.md) | ESCALATED phase details |
| [accept-signal.md](accept-signal.md) | Gate check details |
| [verify.md](verify.md) | Verification details |
| [implement.md](implement.md) | Pre-signal check details |

---

## Failure Resolution Workflows

### Workflow 1: Handover Validation Failure

**When**: Orchestrator runs `orchestra validate-handover`
**Who handles**: Orchestrator

```
validate-handover FAIL → fix handover → validate-handover PASS → continue
```

| Step | Action | Command |
|------|--------|---------|
| 1 | Review validation output | *(read terminal)* |
| 2 | Edit handover to fix issues | *(edit current-task.md)* |
| 3 | Re-validate | `orchestra validate-handover --task 1` |
| 4 | Repeat until PASSED | - |

### Workflow 2: Pre-Signal Check Failure

**When**: Implementor runs `orchestra pre-signal-check`
**Who handles**: Implementor

```
pre-signal-check FAIL → fix issues → pre-signal-check PASS → signal
```

| Step | Action | Command |
|------|--------|---------|
| 1 | Review failed checks | *(read terminal)* |
| 2 | Fix each issue | *(implementation work)* |
| 3 | Re-run pre-signal check | `orchestra pre-signal-check` |
| 4 | Repeat until PASSED | - |
| 5 | Signal completion | *(proceed with signal)* |

### Workflow 3: Gate Check (Accept-Signal) Failure

**When**: Orchestrator runs `orchestra accept-signal`
**Who handles**: Orchestrator provides feedback, Implementor fixes

```
accept-signal FAIL → feedback generated → implementor reads → fixes → re-signals → accept-signal PASS
```

**After TD-011 Fix**:
| Step | Action | Command |
|------|--------|---------|
| 1 | Accept-signal auto-generates feedback | `orchestra accept-signal --task 1` |
| 2 | CLI outputs feedback location | "Feedback: .orchestra/handover/feedback.md" |
| 3 | Implementor runs `orchestra next` | Shows RETRY step with feedback path |
| 4 | Implementor reads feedback | `cat .orchestra/handover/feedback.md` |
| 5 | Implementor fixes issues | *(implementation work)* |
| 6 | Implementor re-signals | `orchestra pre-signal-check && signal` |
| 7 | Orchestrator re-accepts | `orchestra accept-signal --task 1` |

### Workflow 4: Verification Failure

**When**: Orchestrator runs `orchestra verify`
**Who handles**: Orchestrator provides feedback, Implementor fixes

```
verify FAIL → feedback → implementor reads → fixes → re-signals → verify (attempt N+1)
```

| Step | Action | Command |
|------|--------|---------|
| 1 | Review verification output | *(read terminal)* |
| 2 | Generate feedback | `orchestra feedback --task 1` |
| 3 | Feedback transforms failures | *(strips hidden criteria details)* |
| 4 | Implementor reads feedback | `.orchestra/handover/feedback.md` |
| 5 | Implementor fixes issues | *(implementation work)* |
| 6 | Implementor re-signals | *(pre-signal-check + signal)* |
| 7 | Orchestrator re-accepts and verifies | `orchestra accept-signal && orchestra verify` |

### Workflow 5: Escalation

**When**: Max retries exceeded OR unrecoverable failure
**Who handles**: Human supervisor

```
escalate → human reviews → decision → apply → resume workflow
```

| Step | Action | Command |
|------|--------|---------|
| 1 | Escalate the task | `orchestra escalate --task 1` |
| 2 | Escalation report generated | `.orchestra/orchestrator/escalations/task-001.md` |
| 3 | Human reviews report | *(manual review)* |
| 4 | Human decides action | See Human Options below |
| 5 | Human applies fix | Depends on decision |
| 6 | Resume workflow | `orchestra status` |

**Human Decision Options**:

| Option | Effect | How to Apply |
|--------|--------|--------------|
| Fix manually | Human fixes code | Edit code, `orchestra complete --task 1` |
| Modify spec | Adjust requirements | Edit handover, reset retry, `orchestra prepare --task 1 --force` |
| Skip task | Move past | `orchestra complete --task 1 --skip --reason "..."` |
| Split task | Break down | Edit manifest, add sub-tasks |
| Abort sprint | Cancel remaining | `orchestra closeout --abort` |

---

## Feedback Content Requirements

### What Feedback MUST Include

| Section | Purpose | Example |
|---------|---------|---------|
| **Failed Checks** | What didn't pass | "Configuration loader doesn't handle missing files" |
| **Expected** | What was expected | "Function should throw specific error" |
| **Actual** | What happened | "Generic error thrown without context" |
| **Fix Guidance** | How to fix | "Add try/catch with specific error message" |
| **Passing Checks** | What worked | "✓ File structure correct" |
| **Next Steps** | What to do | "1. Fix error handling 2. Re-run tests 3. Re-signal" |

### What Feedback MUST NOT Include

| Forbidden | Why | Alternative |
|-----------|-----|-------------|
| Check type (file_exists, pattern_match) | Reveals hidden criteria | Describe symptom only |
| File paths from criteria | Reveals what we check | Generic description |
| Regex patterns | Reveals detection method | Describe expected content |
| Check implementation details | Gaming risk | Focus on outcome |

---

## State Transitions During Failure

### Progress.yaml Status Values

| Status | Meaning | Next States |
|--------|---------|-------------|
| PREPARE | Handover being created | IMPLEMENT |
| IMPLEMENT | Implementor working | SIGNAL |
| SIGNAL | Completion claimed | VERIFY, VERIFY_FAILED |
| VERIFY | Being verified | COMPLETE, RETRY |
| VERIFY_FAILED | Verification failed | RETRY |
| RETRY | Awaiting retry | IMPLEMENT |
| COMPLETE | Task done | *(terminal)* |
| ESCALATED | Human needed | COMPLETE, SKIPPED |
| SKIPPED | Intentionally skipped | *(terminal)* |

### State Diagram for Failures

```
IMPLEMENT → SIGNAL → VERIFY_FAILED → RETRY → IMPLEMENT → SIGNAL → ...
                                       │
                                       ▼ (attempt >= max)
                                   ESCALATED
                                       │
                           ┌───────────┼───────────┐
                           ▼           ▼           ▼
                       COMPLETE    SKIPPED    (abort)
```

---

## Known Gaps (TD-011)

The following gaps exist in the current implementation:

| Gap | Current State | Expected State |
|-----|---------------|----------------|
| accept-signal doesn't generate feedback | Manual | Auto-generate on failure |
| Feedback location undefined | Various | `.orchestra/handover/feedback.md` |
| progress.yaml not updated on failure | Shows PREPARE | Shows VERIFY_FAILED |
| orchestra next doesn't show RETRY | Shows VERIFY | Shows RETRY when feedback exists |
| Implementor agent readme incorrect | References wrong command | Correct workflow |
| Orchestrator agent readme incomplete | Missing failure workflow | Complete workflow |

See [TD-011-feedback-workflow.md](../../technical-debt/TD-011-feedback-workflow.md) for implementation plan.

---

## Prevention Best Practices

### For Orchestrators

1. **Validate handovers** before giving to implementor
2. **Be specific** in acceptance criteria
3. **Include examples** in handover
4. **Test verification criteria** mentally

### For Implementors

1. **Read handover completely** before starting
2. **Run pre-signal-check frequently** during work
3. **Address warnings** not just blocking errors
4. **Test edge cases** not just happy path

### For Both

1. **Use CLI commands** - don't manually edit state files
2. **Check `orchestra next`** when unsure what to do
3. **Document issues** in appropriate files
4. **Escalate early** if truly stuck

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-06 | Initial taxonomy |
