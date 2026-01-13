# Handle Failure

> **Phase**: RETRY / ESCALATED  
> **CLI Command**: `orchestra feedback` / `orchestra escalate`  
> **Source**: [src/commands/feedback.ts](../../src/commands/feedback.ts), [src/commands/escalate.ts](../../src/commands/escalate.ts)

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
| **Phase** | RETRY or ESCALATED |
| **Role** | Orchestrator Agent (feedback), Human Supervisor (escalation) |
| **Trigger** | Verification failure OR gate check failure |
| **Preconditions** | Task in VERIFY_FAILED or RETRY status; signal rejected |

---

## Purpose

Handle failures that occur during the verification workflow. This step:

1. **Detects** the type of failure (gate check vs verification)
2. **Generates** actionable feedback for the implementor
3. **Updates** progress tracking with retry status
4. **Writes** feedback to canonical location for implementor access
5. **Escalates** to human if max retries exceeded

This is the **communication bridge** between verification failure and implementor retry.

> **Reference**: See [failure-types.md](failure-types.md) for complete failure taxonomy.

---

## Critical: When This Step Applies

**This workflow step ONLY applies to inter-agent failures** — failures detected by the Orchestrator that must be fixed by the Implementor.

| Failure Type | Applies? | Communication |
|--------------|----------|---------------|
| V1: Handover Validation | ❌ NO | Orchestrator sees CLI, fixes own errors |
| V2: Pre-Signal | ❌ NO | Implementor sees CLI, fixes own errors |
| V3: Gate Check | ✅ YES | Orchestrator → Implementor via feedback.md |
| VF: Verification | ✅ YES | Orchestrator → Implementor via feedback.md |
| S: System | ❌ NO | Agent fixes locally or escalates to human |

### Why Only Inter-Agent Failures?

**Internal failures** (V1, V2, S) are resolved by the same agent that caused them:
- Agent runs command → CLI outputs error → Agent reads error → Agent fixes → Re-runs
- No file-based communication needed — the agent sees their own terminal

**Inter-agent failures** (V3, VF) require file-based communication:
- Orchestrator detects failure in their terminal
- Implementor cannot see Orchestrator's terminal
- Orchestrator writes feedback.md → Implementor reads it

**This workflow documents the inter-agent communication process.**

---

## Philosophy

Failure handling serves two purposes: **quality assurance** and **continuous improvement**.

### Why This Matters

When verification fails, the implementor needs:
- Clear understanding of what went wrong
- Actionable guidance on how to fix it
- Assurance that the goalposts aren't moving

The orchestrator must provide this WITHOUT revealing hidden verification criteria.

### Anti-Patterns This Prevents

| Anti-Pattern | How Failure Handling Prevents It |
|--------------|----------------------------------|
| Vague feedback | Requires specific issue + fix guidance |
| Criteria leakage | Transforms strip hidden details |
| Infinite loops | Max retries with escalation path |
| Moving goalposts | Criteria fixed at task start |
| Context loss | Full history preserved in escalation |

---

## Actions

> Quick reference for all actions in this workflow step.  
> Use Action IDs to reference specific actions in other sections.

### CLI Actions

| ID | Action | Command |
|----|--------|---------|
| A-FAIL-01 | Generate feedback after verify failure | `orchestra feedback --task <id>` |
| A-FAIL-02 | Escalate after max retries | `orchestra escalate --task <id>` |
| A-FAIL-03 | Check current failure state | `orchestra next` |
| A-FAIL-04 | View retry history | `orchestra status --verbose` |

### Agent Actions

| ID | Role | Action |
|----|------|--------|
| A-FAIL-10 | Orchestrator | Review verification output |
| A-FAIL-11 | Orchestrator | Generate feedback (CLI) |
| A-FAIL-12 | Orchestrator | Enhance feedback with context (optional) |
| A-FAIL-13 | Orchestrator | Notify implementor feedback is ready |
| A-FAIL-20 | Implementor | Run `orchestra next` to find feedback |
| A-FAIL-21 | Implementor | Read feedback.md |
| A-FAIL-22 | Implementor | Fix identified issues |
| A-FAIL-23 | Implementor | Re-run pre-signal check |
| A-FAIL-24 | Implementor | Signal completion again |
| A-FAIL-30 | Human | Review escalation report |
| A-FAIL-31 | Human | Choose resolution action |
| A-FAIL-32 | Human | Apply fix and resume workflow |

### Git Actions

| ID | Action | Command |
|----|--------|---------|
| A-FAIL-40 | Stage feedback file | `git add .orchestra/handover/feedback.md` |
| A-FAIL-41 | Commit feedback | `git commit -m "orchestra: feedback for task X"` |

---

## Execution Sequence

### Sequence A: Verification Failure → Retry

```
┌─────────────────────────────────────────────────────────────────┐
│                    VERIFICATION FAILURE PATH                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. orchestra verify FAILS                                      │
│         │                                                       │
│         ▼                                                       │
│  2. Orchestrator runs: orchestra feedback --task X              │
│         │                                                       │
│         ├── Reads verification result                           │
│         ├── Transforms failures (strips hidden details)         │
│         ├── Writes .orchestra/handover/feedback.md              │
│         └── Updates progress.yaml → RETRY                       │
│         │                                                       │
│         ▼                                                       │
│  3. Implementor runs: orchestra next                            │
│         │                                                       │
│         └── Shows: "RETRY - Read feedback at feedback.md"       │
│         │                                                       │
│         ▼                                                       │
│  4. Implementor reads feedback, fixes issues                    │
│         │                                                       │
│         ▼                                                       │
│  5. Implementor runs: orchestra pre-signal-check                │
│         │                                                       │
│         ▼                                                       │
│  6. Implementor signals again → Back to GATE_CHECK              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Sequence B: Max Retries → Escalation

```
┌─────────────────────────────────────────────────────────────────┐
│                      ESCALATION PATH                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Retry count >= max_retries (3)                              │
│         │                                                       │
│         ▼                                                       │
│  2. Orchestrator runs: orchestra escalate --task X              │
│         │                                                       │
│         ├── Compiles attempt history                            │
│         ├── Creates escalation report                           │
│         ├── Updates progress.yaml → ESCALATED                   │
│         └── Workflow HALTS                                      │
│         │                                                       │
│         ▼                                                       │
│  3. Human reviews escalation report                             │
│         │                                                       │
│         ▼                                                       │
│  4. Human chooses action:                                       │
│         ├── Fix manually → orchestra complete                   │
│         ├── Modify spec → orchestra prepare --force             │
│         ├── Skip task → orchestra complete --skip               │
│         ├── Split task → edit manifest                          │
│         └── Abort sprint → orchestra closeout --abort           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Agent Process

### Orchestrator: After Verification Failure

```markdown
## Step 1: Review Verification Output

Read the verification result from terminal or file:
- Which checks failed?
- What was expected vs actual?
- Is this recoverable?

## Step 2: Generate Feedback

Run:
```bash
orchestra feedback --task <id>
```

Expected output:
```
✓ Verification result loaded
✓ Feedback generated: .orchestra/handover/feedback.md
✓ Progress updated: RETRY (attempt 2/3)
```

## Step 3: Review Feedback (Optional)

Open `.orchestra/handover/feedback.md` and verify:
- Specific issues described
- No hidden criteria leaked
- Actionable guidance provided

Add context if needed (without revealing verification details).

## Step 4: Notify Implementor

The implementor can find feedback by running `orchestra next`.
No direct communication needed if workflow is followed.
```

### Implementor: After Receiving Feedback

```markdown
## Step 1: Check Current State

Run:
```bash
orchestra next
```

Expected output (after TD-011 fix):
```
🔍 Current Step: Retry

Task 1: [title] [RETRY]

▸ Address feedback and retry

Read feedback at: .orchestra/handover/feedback.md

After fixing issues:
  orchestra pre-signal-check
  (then signal completion)
```

## Step 2: Read Feedback

Open `.orchestra/handover/feedback.md`:
- Identify failed checks
- Understand expected vs actual
- Follow fix guidance

## Step 3: Fix Issues

Make targeted fixes based on feedback:
- Don't restart from scratch
- Focus only on failed checks
- Address each issue systematically

## Step 4: Re-validate

Run:
```bash
orchestra pre-signal-check
```

All checks must pass before re-signaling.

## Step 5: Signal Again

Signal completion to trigger another verification cycle.
```

---

## CLI Command

### `orchestra feedback`

Generate feedback after verification failure.

```bash
orchestra feedback [options]
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--task <id>` | number | current | Task to generate feedback for |
| `--verbose` | boolean | false | Show detailed output |
| `--json` | boolean | false | JSON output for scripting |

**Examples:**

```bash
# Generate feedback for current task
orchestra feedback

# Generate feedback for specific task
orchestra feedback --task 3

# JSON output
orchestra feedback --task 3 --json
```

### `orchestra escalate`

Escalate task to human supervisor.

```bash
orchestra escalate [options]
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--task <id>` | number | current | Task to escalate |
| `--reason <text>` | string | - | Escalation reason |
| `--json` | boolean | false | JSON output for scripting |

**Examples:**

```bash
# Escalate current task
orchestra escalate

# Escalate with reason
orchestra escalate --task 3 --reason "Same error after 3 attempts"
```

---

## Input

### Required

| Input | Source | Purpose |
|-------|--------|---------|
| Verification result | `orchestra verify` output or file | Source of failure details |
| Task ID | Manifest current_task_id or --task | Which task failed |

### Optional

| Input | Source | Purpose |
|-------|--------|---------|
| Custom message | --reason flag | Additional context for feedback |

---

## File Impact

### Files Read

| File | Purpose |
|------|---------|
| `.orchestra/manifest.yaml` | Task details, retry settings |
| `.orchestra/progress.yaml` | Current state, retry count |
| `.orchestra/orchestrator/results/task-XXX-verification.yaml` | Verification failures |

### Files Written

| File | Purpose |
|------|---------|
| `.orchestra/handover/feedback.md` | Feedback for implementor |
| `.orchestra/progress.yaml` | Updated with RETRY status |
| `.orchestra/orchestrator/escalations/task-XXX.md` | Escalation report (if escalated) |

### Files Deleted

None.

---

## Template Details

### Feedback Template

**Source**: `templates/common/templates/feedback.md.hbs`

**Variables**:

| Variable | Type | Description |
|----------|------|-------------|
| `taskId` | number | Task identifier |
| `task` | object | Full task object from manifest |
| `attempt` | number | Current attempt number |
| `maxAttempts` | number | Maximum allowed attempts |
| `issues` | array | Transformed failure issues |
| `canRetry` | boolean | Whether retry is possible |
| `timestamp` | string | ISO timestamp |

**Output Location**: `.orchestra/handover/feedback.md`

---

## Git Actions

| Action | Enforcement | Rationale |
|--------|-------------|-----------|
| Stage feedback.md | RECOMMENDED | Track feedback history |
| Commit with message | RECOMMENDED | Document retry attempts |

**Suggested commit message:**
```
orchestra: feedback for task X (attempt N/3)
```

---

## Outcome

### Success Path

| Condition | Next Step |
|-----------|-----------|
| Feedback generated, retry count < max | Implementor reads feedback, fixes, re-signals |
| Escalation report generated | Human reviews and decides |

### Failure Path

| Condition | Action |
|-----------|--------|
| No verification result found | Error: run `orchestra verify` first |
| Max retries exceeded | Auto-escalate or manual escalation |
| Feedback template missing | Fallback to generated text |

---

## Next Step

| Outcome | Next Document | Next Command |
|---------|---------------|--------------|
| Feedback generated | [implement.md](implement.md) | Implementor works and re-signals |
| Escalated | *(human decision)* | `orchestra complete --skip` or manual fix |
| Retry successful | [verify.md](verify.md) | `orchestra verify` |

---

## Evidence Produced

### Artifacts

| Artifact | Location | Purpose |
|----------|----------|---------|
| Feedback document | `.orchestra/handover/feedback.md` | Implementor guidance |
| Progress entry | `.orchestra/progress.yaml` | State tracking |
| Escalation report | `.orchestra/orchestrator/escalations/` | Human decision support |

### Verification

To verify this step completed:

```bash
# Check feedback exists
cat .orchestra/handover/feedback.md

# Check progress shows RETRY
orchestra status

# Check next step guidance
orchestra next
```

---

## Implementation Reference

| Component | Source File |
|-----------|-------------|
| Feedback command | [src/commands/feedback.ts](../../src/commands/feedback.ts) |
| Feedback core logic | [src/core/feedback.ts](../../src/core/feedback.ts) |
| Escalate command | [src/commands/escalate.ts](../../src/commands/escalate.ts) |
| Progress tracking | [src/core/progress.ts](../../src/core/progress.ts) |
| Template rendering | [src/core/templates.ts](../../src/core/templates.ts) |

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "No verification result" | Verify not run | Run `orchestra verify` first |
| Feedback not found by implementor | Wrong path | Check `.orchestra/handover/feedback.md` |
| `orchestra next` shows wrong state | TD-011 gap | Check feedback.md manually |
| Same error repeated | Feedback too vague | Enhance with more specific guidance |

### Known Gaps (TD-011)

| Gap | Workaround |
|-----|------------|
| `accept-signal` doesn't auto-generate feedback | Run `orchestra feedback` manually |
| `orchestra next` doesn't detect feedback | Check feedback.md path manually |
| progress.yaml not updated on failure | Check verification result file |

See [TD-011-feedback-workflow.md](../../technical-debt/TD-011-feedback-workflow.md) for implementation plan.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-06 | Initial specification |
