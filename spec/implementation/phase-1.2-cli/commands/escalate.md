# Command: orchestra escalate

> **Navigation**: [Phase 1.2 Index](../readme.md) | [Task Spec](../tasks/1.2.2-escalate-command.md)
>
> **Authority**: [Orchestra Bible Section 8.5 - escalate-failure](../../../docs/orchestra-bible.md#escalate-failure)

---

## Purpose

Escalate persistent failures to the human supervisor. This halts automated workflow and requires human intervention to resolve.

## Usage

```bash
# Escalate current task with reason
orchestra escalate --reason "Same error after 3 attempts"

# Escalate specific task
orchestra escalate --task 3 --reason "Blocked by external dependency"

# Include additional context
orchestra escalate --task 3 --reason "Cannot proceed" --context "API endpoint returns 500"

# Output as JSON
orchestra escalate --json
```

## Options

| Option | Short | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--task` | `-t` | number | current | Task ID to escalate |
| `--reason` | `-r` | string | **required** | Why escalation is needed |
| `--context` | `-c` | string | none | Additional context/details |
| `--json` | | flag | false | Output as JSON |

## Behavior

### Escalation Triggers (per Bible)

Escalation is appropriate when:
- Max attempts exceeded (default: 3)
- Same error occurs twice consecutively
- Implementor explicitly requests help
- Orchestrator cannot proceed (blocked)

### Actions

1. Validate task exists and is in appropriate status
2. Update progress.yaml: `status: ESCALATED`
3. Compile escalation report with:
   - Task details and attempt history
   - All feedback given
   - Verification results
   - Failure patterns detected
4. Write escalation report to artifacts
5. Halt workflow for this task

### What Happens After Escalation

The task is **blocked** until human supervisor intervenes. Options (per Bible Section 4.3.1):

| Human Action | How to Execute |
|--------------|----------------|
| Fix manually & complete | Make changes, run verify, update progress |
| Modify task spec | Edit manifest, reset attempts, restart |
| Skip task | Update progress: `status: skipped` |
| Abort sprint | Update progress: `status: aborted` |
| Provide clarification | Add context, reset for retry |

## Output

### Success (Exit 0)

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

### Already Escalated (Exit 0 with info)

```
ℹ Task 3 is already escalated

Escalated at: 2025-12-04T10:30:00Z
Reason: Same error after 3 attempts

Awaiting human intervention.
```

### Error Cases (Exit 1)

```
✗ Cannot escalate: Task 99 not found

✗ Cannot escalate: Task 3 is already complete

✗ Cannot escalate: --reason is required
```

## JSON Output

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

## Files Affected

### Read

- `.orchestra/orchestrator/.orchestrator-only/manifest.yaml`
- `.orchestra/orchestrator/.orchestrator-only/progress.yaml`
- `.orchestra/implementor/feedback/task-{id}-*.md` (all feedback)
- `.orchestra/artifacts/task-{id}/verification.yaml`

### Write

- `.orchestra/orchestrator/.orchestrator-only/progress.yaml` (status → ESCALATED)
- `.orchestra/artifacts/task-{id}/escalation-report.md`

## Core Library

```typescript
// src/core/escalate.ts
export interface EscalateOptions {
  task?: string;
  reason: string;
  context?: string;
}

export interface AttemptRecord {
  attempt: number;
  outcome: 'PASS' | 'FAIL';
  issue?: string;
  timestamp: string;
}

export interface EscalateResult {
  success: boolean;
  taskId: number;
  previousStatus: string;
  newStatus: 'ESCALATED';
  reason: string;
  context?: string;
  escalatedAt: string;
  reportPath: string;
  attemptHistory: AttemptRecord[];
  humanOptions: string[];
}

export async function runEscalate(options: EscalateOptions): Promise<EscalateResult>;
```

## Escalation Report Template

The escalation report contains everything a human needs to understand and resolve the issue:

```markdown
# Escalation Report: Task {id}

## Summary
- **Task**: {title}
- **Escalated**: {timestamp}
- **Reason**: {reason}
- **Attempts**: {attempts} of {maxAttempts}

## Task Details
{task description from manifest}

## Attempt History
| Attempt | Date | Outcome | Issue |
|---------|------|---------|-------|
| 1 | ... | FAIL | ... |
| 2 | ... | FAIL | ... |

## Feedback Given
{compiled feedback from all attempts}

## Verification Results
{last verification output}

## Suggested Actions
1. {based on failure pattern}
2. {based on failure pattern}

## Human Options
- [ ] Fix manually and complete
- [ ] Modify task specification
- [ ] Skip this task
- [ ] Abort sprint
```

## Related Commands

- `orchestra feedback` - Generates feedback before escalation
- `orchestra verify` - Produces verification results included in report
- `orchestra complete --force` - Human can force-complete after fixing
- `orchestra status` - Shows escalated tasks
