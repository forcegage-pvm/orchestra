# Command: orchestra feedback

> **Navigation**: [Phase 1.2 Index](../readme.md) | [Task Spec](../tasks/1.2.1-feedback-command.md)
>
> **Authority**: [Orchestra Bible Section 8.5 - generate-feedback](../../../docs/orchestra-bible.md#generate-feedback)

---

## Purpose

Generate actionable feedback for the implementor after verification failure. This is how the orchestrator communicates what went wrong WITHOUT revealing hidden verification criteria.

## Usage

```bash
# Generate feedback for current task (uses last verify result)
orchestra feedback

# Generate feedback for specific task
orchestra feedback --task 3

# Specify attempt number explicitly
orchestra feedback --task 3 --attempt 2

# Output as JSON
orchestra feedback --json
```

## Options

| Option | Short | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--task` | `-t` | number | current | Task ID to generate feedback for |
| `--attempt` | `-a` | number | auto | Attempt number (auto-increments) |
| `--json` | | flag | false | Output as JSON |

## Behavior

### Prerequisites

1. Task must exist in manifest
2. Task must be in `in_progress` or `verifying` status
3. Verification must have been run (results exist)

### Actions

1. Load verification results for the task
2. Increment attempt counter in progress.yaml
3. Analyze failures and generate actionable feedback
4. Render feedback using `feedback.md.hbs` template
5. Write to `.orchestra/implementor/feedback/task-{id}-feedback.md`
6. Check if max attempts reached → suggest escalation

### Critical Constraint

**Feedback must tell implementor WHAT went wrong, not HOW it was detected.**

| ✅ Good Feedback | ❌ Bad Feedback |
|------------------|-----------------|
| "The configuration loader does not handle missing files correctly" | "The test `config.test.ts:45` which checks missing file handling failed" |
| "Error messages are not user-friendly" | "Verification check `content_contains('user-friendly')` failed" |
| "Function is missing from exports" | "Hidden criterion `export_exists('myFunc')` returned false" |

## Output

### Success (Exit 0)

```
✓ Feedback generated for task 3 (attempt 2 of 3)

Issues found:
  1. [MAJOR] Configuration loader does not handle missing files
  2. [MINOR] Error messages could be more descriptive

Feedback written to: .orchestra/implementor/feedback/task-3-feedback.md

Next: Implementor should read feedback and retry
```

### Max Attempts Reached (Exit 0 with warning)

```
✓ Feedback generated for task 3 (attempt 3 of 3)

⚠️  Maximum attempts reached. Consider escalating:
    orchestra escalate --task 3 --reason "Persistent failure"

Feedback written to: .orchestra/implementor/feedback/task-3-feedback.md
```

### Error Cases (Exit 1)

```
✗ Cannot generate feedback: No verification results found
  Run 'orchestra verify' first

✗ Cannot generate feedback: Task 99 not found

✗ Cannot generate feedback: Task 3 is already complete
```

## JSON Output

```json
{
  "success": true,
  "taskId": 3,
  "attempt": 2,
  "maxAttempts": 3,
  "canRetry": true,
  "feedbackPath": ".orchestra/implementor/feedback/task-3-feedback.md",
  "issues": [
    {
      "severity": "major",
      "category": "functionality",
      "problem": "Configuration loader does not handle missing files",
      "guidance": "Add error handling for FileNotFoundError"
    }
  ],
  "nextStep": "retry"
}
```

## Files Affected

### Read

- `.orchestra/orchestrator/.orchestrator-only/manifest.yaml`
- `.orchestra/orchestrator/.orchestrator-only/progress.yaml`
- `.orchestra/artifacts/task-{id}/verification.yaml` (or last verify result)

### Write

- `.orchestra/implementor/feedback/task-{id}-feedback.md`
- `.orchestra/orchestrator/.orchestrator-only/progress.yaml` (increment attempt)

## Core Library

```typescript
// src/core/feedback.ts
import { VerifyResult } from './verification.js';

export interface FeedbackOptions {
  task?: string;
  verificationResult?: VerifyResult;  // If not provided, loads from artifacts
  attempt?: number;
}

export interface FeedbackIssue {
  severity: 'critical' | 'major' | 'minor';
  category: string;
  problem: string;
  impact: string;
  guidance: string;
}

export interface FeedbackResult {
  success: boolean;
  taskId: number;
  attempt: number;
  maxAttempts: number;
  canRetry: boolean;
  feedbackPath: string;
  issues: FeedbackIssue[];
  nextStep: 'retry' | 'escalate';
}

export async function runFeedback(options: FeedbackOptions): Promise<FeedbackResult>;
```

## Template

Uses `.orchestra/common/templates/feedback.md.hbs` (converted from `feedback-template.md`).

Key sections:
- Summary of what went wrong
- Issue list with guidance (NO verification criteria revealed)
- What worked (positive reinforcement)
- Next steps
- Attempt history

## Related Commands

- `orchestra verify` - Produces the verification results that feedback analyzes
- `orchestra escalate` - Called when max attempts reached
- `orchestra accept-signal` - May trigger feedback if signal invalid
