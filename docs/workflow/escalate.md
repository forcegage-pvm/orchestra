# Escalate Task

> **Phase**: ESCALATED  
> **CLI Command**: `orchestra escalate`  
> **Source**: [src/commands/escalate.ts](../../src/commands/escalate.ts)

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
| **Phase** | ESCALATED |
| **Role** | Orchestrator Agent → Human Supervisor |
| **Trigger** | Max retries exceeded OR same error repeated OR explicit request |
| **Preconditions** | Task in RETRY or IN_PROGRESS status |

---

## Purpose

Escalate persistent failures to the human supervisor. This **halts the automated workflow** and requires human intervention to resolve.

This command:

1. **Validates escalation** - Confirm task can be escalated
2. **Updates status** - Mark task as ESCALATED in progress
3. **Compiles report** - Gather all feedback, verification results, attempt history
4. **Generates report** - Create human-readable escalation document
5. **Halts workflow** - Task blocked until human intervenes

> **Critical**: Escalation is a **workflow halt**. The task cannot proceed until a human makes a decision.

---

## Philosophy

Escalation is the **safety valve** when automated resolution fails. It acknowledges that some problems require human judgment.

### Why This Matters

The Orchestra workflow is designed for autonomous operation, but not all problems can be solved by agents:

| Situation | Why Human Needed |
|-----------|------------------|
| Same error repeated | May indicate spec problem, not implementation |
| Impossible constraint | Spec asks for contradictory things |
| Tooling limitation | AI cannot perform required action |
| Ambiguous requirement | Spec open to interpretation |
| Architectural issue | Wrong approach, not fixable with patches |

### Escalation Triggers

| Trigger | Threshold | Default |
|---------|-----------|---------|
| Max attempts exceeded | retry_count >= max_retries | 3 attempts |
| Same error repeated | same_error_count >= threshold | 2 occurrences |
| Implementor request | Explicit `--help` signal | Immediate |
| Orchestrator blocked | Cannot proceed | Immediate |

### Anti-Patterns This Prevents

| Anti-Pattern | How Escalate Prevents It |
|--------------|--------------------------|
| Infinite retry loops | Max attempts enforced |
| Wasted compute cycles | Stop early when stuck |
| Hidden failures | Explicit human notification |
| Context loss | Full report preserves history |
| Unclear handoff | Checklist of human options |

---

## Actions

> Quick reference for all actions in this workflow step.  
> Use Action IDs to reference specific actions in other sections.

### CLI Actions

| ID | Action | Command |
|----|--------|---------|
| A-ESC-01 | Escalate task | `orchestra escalate --reason "..."` |
| A-ESC-02 | Escalate with context | `orchestra escalate --reason "..." --context "..."` |

### Agent Actions

| ID | Role | Action |
|----|------|--------|
| A-ESC-03 | Orchestrator | Determine escalation needed |
| A-ESC-04 | Orchestrator | Provide clear reason |
| A-ESC-05 | Orchestrator | Include context for human |

### Human Actions

| ID | Action | How to Execute |
|----|--------|----------------|
| A-ESC-06 | Fix manually | Make changes, then `orchestra complete --force` |
| A-ESC-07 | Modify spec | Edit manifest, then `orchestra prepare --task N` |
| A-ESC-08 | Skip task | `orchestra complete --task N --skip --reason "..."` |
| A-ESC-09 | Abort sprint | Update progress.yaml status to `aborted` |
| A-ESC-10 | Provide clarification | Add context, reset retry count |

---

## Execution Sequence

The complete ordered execution of this workflow step:

| Order | Action ID | Type | Action |
|-------|-----------|------|--------|
| 1 | A-ESC-03 | Agent | Determine escalation needed |
| 2 | A-ESC-04 | Agent | Formulate clear reason |
| 3 | A-ESC-01 | CLI | `orchestra escalate --reason "..."` |
| 4 | — | Wait | **Workflow halted** |
| 5 | A-ESC-06/07/08/09 | Human | Human makes decision |
| 6 | — | Resume | Continue based on human action |

---

## Agent Process

The orchestrator agent escalates after exhausting automated options.

### A-ESC-01: Escalate Task

When max attempts reached or pattern detected:

```bash
orchestra escalate --reason "Same error after 3 attempts"
```

Expected output:

```
✓ Task 3 escalated to human supervisor

Reason: Same error after 3 attempts
Status: ESCALATED

Escalation report: .orchestra/artifacts/task-3/escalation-report.md

⚠️  Workflow halted. Human intervention required.

Human options:
  - Fix manually and run: orchestra complete --task 3 --force
  - Modify spec and retry: Edit manifest, then orchestra prepare --task 3
  - Skip this task: orchestra complete --task 3 --skip --reason "..."
  - Abort sprint: orchestra status --abort --reason "..."
```

### A-ESC-02: Escalate with Context

Include additional context for human:

```bash
orchestra escalate --reason "Cannot proceed" --context "API endpoint returns 500 - external dependency issue"
```

### A-ESC-03: Determine Escalation Needed

Before escalating, verify:

1. Max attempts reached? → Escalate
2. Same error repeated twice? → Escalate
3. Blocked by external factor? → Escalate immediately
4. Spec appears ambiguous? → Escalate immediately

### A-ESC-04: Formulate Clear Reason

The reason should be:
- **Specific**: What exactly failed
- **Actionable**: What human needs to decide
- **Factual**: Not blaming, just stating

| ✅ Good Reason | ❌ Bad Reason |
|----------------|---------------|
| "Same 'missing validation' error after 3 attempts" | "Keeps failing" |
| "Spec requires 0ms response but widget cycle needs 16ms" | "Impossible to do" |
| "API dependency returns 500, cannot test" | "External problem" |

### A-ESC-05: Include Context

Context provides supporting details:

```bash
orchestra escalate \
  --reason "Spec conflict: requires instant response" \
  --context "Widget rebuild cycle introduces minimum 16ms delay. \
             This appears to be a specification issue, not implementation."
```

---

## CLI Command

### `orchestra escalate`

Escalate persistent failures to human supervisor.

```bash
orchestra escalate [OPTIONS]
```

### Options

| Option | Short | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--reason <text>` | `-r` | STR | **required** | Why escalation is needed |
| `--task <id>` | `-t` | INT | current | Task ID to escalate |
| `--context <text>` | `-c` | STR | none | Additional context/details |
| `--json` | | FLAG | false | Output as JSON |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Escalation successful |
| 1 | Error (task not found, already complete, missing reason) |

### Examples

```bash
# Escalate current task with reason (required)
orchestra escalate --reason "Same error after 3 attempts"

# Escalate specific task
orchestra escalate --task 3 --reason "Blocked by external dependency"

# Include additional context
orchestra escalate --task 3 --reason "Cannot proceed" --context "API returns 500"

# JSON output
orchestra escalate --json --reason "Max retries exceeded"
```

---

## Input

### Required Files

| File | Purpose | Created By |
|------|---------|------------|
| `.orchestra/manifest.yaml` | Task lookup | `orchestra init` |
| `.orchestra/progress/sprint-{id}-progress.yaml` | Current status | `orchestra prepare` |

### Optional Files (for Report)

| File | Purpose |
|------|---------|
| `.orchestra/handover/feedback.md` | Previous feedback |
| `.orchestra/artifacts/task-{id}-verification.yaml` | Verification results |

### Required Input

| Input | Source | Required |
|-------|--------|----------|
| `--reason` | Command line | **Yes** |
| Task ID | `--task` or current task | Yes |

---

## File Impact

### Read

| File | Purpose |
|------|---------|
| `.orchestra/manifest.yaml` | Get task info |
| `.orchestra/progress/sprint-{id}-progress.yaml` | Current status |
| `.orchestra/handover/feedback.md` | Compile history |
| `.orchestra/artifacts/task-{id}-verification.yaml` | Verification results |

### Written

| File | Purpose |
|------|---------|
| `.orchestra/progress/sprint-{id}-progress.yaml` | Status → ESCALATED |

### Created

| File | When |
|------|------|
| `.orchestra/artifacts/task-{id}/escalation-report.md` | Always created |

### Deleted

None. Escalation preserves all artifacts for human review.

---

## Template Details

### Template Conversion

| Template | Source | Converts To | When Used |
|----------|--------|-------------|-----------|
| N/A | N/A | N/A | Report generated programmatically |

> **Note**: The escalation report is generated by `generateEscalationReport()` in `src/core/escalate.ts`, not from a template.

### Report Structure

The escalation report is generated with this structure:

```markdown
# Escalation Report: Task {id}

## Summary
- **Task**: {title}
- **Escalated**: {timestamp}
- **Reason**: {reason}
- **Attempts**: {attempts}

## Additional Context
{context if provided}

## Task Details
{task description from manifest}

## Attempt History
| Attempt | Date | Outcome | Issue |
|---------|------|---------|-------|
| 1 | ... | FAIL | ... |

## Feedback Given
- {feedback file paths}

## Human Options
- [ ] Fix manually and complete
- [ ] Modify task specification  
- [ ] Skip this task
- [ ] Abort sprint
```

---

## Git Actions

### Enforcement Levels

| Action | Level | Current State |
|--------|-------|---------------|
| Commit escalation | **Guideline** | Manual |

### Recommended Git Workflow

```bash
# After escalation
git add .orchestra/artifacts/task-3/escalation-report.md
git commit -m "chore(orchestra): escalate task 3 - same error pattern"
```

---

## Outcome

### Success Path

```
✓ Task escalated
  → Status: ESCALATED
  → Report created
  → Workflow halted
  → Awaiting human decision
```

**Next**: Human intervention required (see Human Actions below)

### Human Resolution Options

| Option | Command | When to Use |
|--------|---------|-------------|
| Fix manually | `orchestra complete --task N --force` | Human can fix the code |
| Modify spec | Edit manifest, `orchestra prepare --task N` | Requirements need change |
| Skip task | `orchestra complete --task N --skip` | Task not critical |
| Abort sprint | Update progress to `aborted` | Sprint is blocked |
| Clarify & retry | Add context, reset retry count | Spec was ambiguous |

### Already Escalated

If task is already escalated:

```
ℹ Task 3 is already escalated

Escalated at: 2025-12-04T10:30:00Z
Reason: Same error after 3 attempts

Awaiting human intervention.
```

### Failure Paths

#### Failure: Missing Reason

```
✗ Cannot escalate: --reason is required
```

**Action**: Provide `--reason "..."` with clear explanation

#### Failure: Task Not Found

```
✗ Cannot escalate: Task 99 not found
```

**Action**: Check task ID in manifest

#### Failure: Task Already Complete

```
✗ Cannot escalate: Task 3 is already complete
```

**Action**: Completed tasks cannot be escalated

---

## Next Step

| Human Action | Next Document | Command |
|--------------|---------------|---------|
| Fix & complete | N/A | `orchestra complete --force` |
| Modify & retry | [prepare.md](prepare.md) | `orchestra prepare --task N` |
| Skip | N/A | `orchestra complete --skip` |
| Abort | N/A | Manual progress update |

---

## Evidence Produced

| Evidence | Location | Purpose |
|----------|----------|---------|
| Escalation report | `.orchestra/artifacts/task-{id}/escalation-report.md` | Human decision support |
| Progress update | `.orchestra/progress/sprint-{id}-progress.yaml` | Status tracking |
| JSON output | Terminal (with `--json`) | Scripting integration |

### Evidence Verification

```powershell
# Check escalation report created
Test-Path ".orchestra/artifacts/task-3/escalation-report.md"

# View report
Get-Content ".orchestra/artifacts/task-3/escalation-report.md"

# Check status updated
# (progress.yaml should show ESCALATED for task)
```

### JSON Output Format

```json
{
  "success": true,
  "taskId": 3,
  "previousStatus": "in_progress",
  "newStatus": "ESCALATED",
  "reason": "Same error after 3 attempts",
  "context": "API endpoint returns 500",
  "escalatedAt": "2025-12-04T10:30:00Z",
  "reportPath": ".orchestra/artifacts/task-3/escalation-report.md",
  "attemptHistory": [
    { "attempt": 1, "outcome": "FAIL", "issue": "Missing error handling" },
    { "attempt": 2, "outcome": "FAIL", "issue": "Missing error handling" },
    { "attempt": 3, "outcome": "FAIL", "issue": "Missing error handling" }
  ],
  "humanOptions": [
    "fix_manually",
    "modify_spec",
    "skip_task",
    "abort_sprint"
  ]
}
```

---

## Implementation Reference

| Component | File | Purpose |
|-----------|------|---------|
| Command | [src/commands/escalate.ts](../../src/commands/escalate.ts) | CLI command definition |
| Core logic | [src/core/escalate.ts](../../src/core/escalate.ts) | `runEscalate()` function |
| Tests | [test/commands/escalate.test.ts](../../test/commands/escalate.test.ts) | Unit tests |
| Spec | [spec/implementation/phase-1.2-cli/commands/escalate.md](../../spec/implementation/phase-1.2-cli/commands/escalate.md) | Full specification |
| Process | [spec/04-processes/failure-handling.md](../../spec/04-processes/failure-handling.md) | Escalation workflow |

### Key Functions

```typescript
// src/core/escalate.ts

/**
 * Escalate task to human supervisor
 */
export async function runEscalate(options: EscalateOptions): Promise<EscalateResult>

/**
 * Compile attempt history from feedback files
 */
function compileAttemptHistory(feedbackDir: string, taskId: number): AttemptRecord[]

/**
 * Generate escalation report content
 */
function generateEscalationReport(
  task: Task,
  reason: string,
  context: string | undefined,
  attemptHistory: AttemptRecord[],
  feedbackFiles: string[]
): string
```

---

## Troubleshooting

### Issue: "No task specified and no current task found"

**Cause**: No task ID provided and no current task in progress.

**Solution**:
```bash
# Specify task explicitly
orchestra escalate --task 3 --reason "..."
```

### Issue: When to escalate vs retry

**Guidance**:

| Situation | Action |
|-----------|--------|
| Different error each time | Keep retrying with feedback |
| Same error 2+ times | Escalate - likely spec issue |
| External dependency down | Escalate immediately |
| Unclear requirements | Escalate - need clarification |
| Retry count < max | Can still retry |
| Retry count >= max | Must escalate |

### Issue: Human doesn't know what to do

**Cause**: Escalation report not clear enough.

**Solution**:
1. Ensure `--reason` is specific and actionable
2. Add `--context` with supporting details
3. Review report and add manual notes if needed

### Issue: Want to resume after human fix

**Solution**:
```bash
# After human fixes the issue manually
orchestra complete --task 3 --force
```

Or to retry with modified spec:
```bash
# Edit manifest.yaml to adjust task
# Reset retry count if needed
orchestra prepare --task 3
```

---

## Escalation Report Example

A complete escalation report looks like:

```markdown
# Escalation Report: Task 5

## Summary
- **Task**: Create YAxisConfig Model
- **Escalated**: 2025-12-04T10:30:00Z
- **Reason**: Same error after 3 attempts
- **Attempts**: 3

## Additional Context
Implementor consistently creates tests that pass locally
but fail in verification due to timing-dependent assertions.

## Task Details
Create the YAxisConfig model with validation for axis positioning.

## Attempt History
| Attempt | Date | Outcome | Issue |
|---------|------|---------|-------|
| 1 | 2025-12-04 | FAIL | Missing error handling |
| 2 | 2025-12-04 | FAIL | Missing error handling |
| 3 | 2025-12-04 | FAIL | Missing error handling |

## Feedback Given
See feedback files:
- .orchestra/handover/feedback.md

## Human Options
- [ ] **Fix manually and complete**: Make changes, verify, then `orchestra complete --task 5 --force`
- [ ] **Modify task specification**: Edit manifest.yaml, reset attempts, retry
- [ ] **Skip this task**: `orchestra complete --task 5 --skip --reason "..."`
- [ ] **Abort sprint**: Update progress.yaml status to `aborted`

---
_End of Escalation Report_
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-05 | Initial creation |

---

*This is the authoritative documentation for the escalate workflow step.*
