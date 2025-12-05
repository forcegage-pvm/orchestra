# Generate Feedback

> **Phase**: RETRY  
> **CLI Command**: `orchestra feedback`  
> **Source**: [src/commands/feedback.ts](../../src/commands/feedback.ts)

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
| **Phase** | RETRY |
| **Role** | Orchestrator Agent |
| **Trigger** | After `orchestra verify` fails |
| **Preconditions** | Verification failed; retry count < max_retries |

---

## Purpose

Generate actionable feedback for the implementor after verification failure. This is how the orchestrator communicates what went wrong WITHOUT revealing hidden verification criteria.

The **CLI command** (not the agent directly) generates this feedback by:

1. **Loading verification results** - Read failures from `orchestra verify`
2. **Transforming failures** - `transformToFeedback()` strips hidden criteria details
3. **Rendering the template** - `feedback.md.hbs` → `.orchestra/handover/feedback.md`
4. **Updating progress** - Increments retry count, sets RETRY status
5. **Checking threshold** - Warns if max attempts reached

> **Important**: The CLI generates the feedback document structurally. The orchestrator agent reviews and may enhance it before the implementor reads it.

The feedback **must not reveal** how issues were detected - only what went wrong.

---

## Philosophy

Feedback is the **communication bridge** - translating verification failures into actionable guidance without leaking hidden criteria.

### Why This Matters

The hidden verification pattern requires that implementors never learn the exact checks used. But feedback must still be:
- Specific enough to be actionable
- Clear about what went wrong
- Honest about severity

This tension is resolved by describing **symptoms** not **detection methods**.

### Critical Constraint: No Criteria Leakage

| ✅ Good Feedback | ❌ Bad Feedback |
|------------------|-----------------|
| "The configuration loader does not handle missing files correctly" | "The test `config.test.ts:45` which checks missing file handling failed" |
| "Error messages are not user-friendly" | "Verification check `content_contains('user-friendly')` failed" |
| "Function is missing from exports" | "Hidden criterion `export_exists('myFunc')` returned false" |
| "Tests don't cover edge cases" | "pattern_match for `test.*edge` returned no matches" |

### Feedback Principles

| Principle | Description |
|-----------|-------------|
| **Specific** | Exactly what failed, not vague guidance |
| **Actionable** | Clear steps to fix |
| **Bounded** | Only address actual failures |
| **Honest** | No false positives or moving goalposts |
| **Encouraging** | Note what worked (positive reinforcement) |

### Anti-Patterns This Prevents

| Anti-Pattern | How Feedback Prevents It |
|--------------|--------------------------|
| Criteria leakage | Transform strips check types, paths, patterns |
| Vague guidance | Specific issue descriptions required |
| Moving goalposts | Criteria fixed at task start |
| Demoralization | Positive reinforcement for what worked |
| Infinite loops | Max retries with escalation path |

---

## Actions

> Quick reference for all actions in this workflow step.  
> Use Action IDs to reference specific actions in other sections.

### CLI Actions

| ID | Action | Command |
|----|--------|---------|
| A-FEED-01 | Generate feedback | `orchestra feedback` |

### Agent Actions

| ID | Role | Action |
|----|------|--------|
| A-FEED-02 | Orchestrator | Review verification failures |
| A-FEED-03 | Orchestrator | Craft actionable guidance |
| A-FEED-04 | Orchestrator | Check escalation threshold |

### Conditional Actions

| ID | Condition | Action |
|----|-----------|--------|
| A-FEED-05 | Can retry | Return to implementor for retry |
| A-FEED-06 | Max attempts reached | Proceed to `orchestra escalate` |

---

## Execution Sequence

The complete ordered execution of this workflow step:

| Order | Action ID | Type | Action |
|-------|-----------|------|--------|
| 1 | A-FEED-01 | CLI | `orchestra feedback` |
| 2 | A-FEED-02 | Agent | Review failures in output |
| 3 | A-FEED-03 | Agent | Verify feedback is actionable |
| 4 | A-FEED-04 | Agent | Check if escalation needed |
| 5a | A-FEED-05 | Flow | If can retry → return to implementor |
| 5b | A-FEED-06 | Flow | If max attempts → escalate |

---

## Agent Process

The orchestrator agent generates feedback after verification failure.

### A-FEED-01: Generate Feedback

After verification fails, generate feedback:

```bash
orchestra feedback
```

Expected output (can retry):

```
✓ Feedback generated for task 3 (attempt 2 of 3)

Issues found:
  1. [MAJOR] Configuration loader does not handle missing files
  2. [MINOR] Error messages could be more descriptive

Feedback written to: .orchestra/handover/feedback.md

Next: Implementor should read feedback and retry
```

Expected output (max attempts reached):

```
✓ Feedback generated for task 3 (attempt 3 of 3)

⚠️  Maximum attempts reached. Consider escalating:
    orchestra escalate --task 3 --reason "Persistent failure"

Feedback written to: .orchestra/handover/feedback.md
```

### A-FEED-02: Review Verification Failures

The command automatically loads verification results. Review the transformed issues:

- Each issue shows **what** went wrong, not **how** it was detected
- Severity levels preserved (critical/major/minor)
- Generic guidance provided

### A-FEED-03: Craft Actionable Guidance

If the generated feedback is too generic, the orchestrator can:

1. Edit the feedback file directly
2. Add specific examples
3. Include code snippets for complex fixes

**Important**: Even when editing, never reveal:
- Check types (file_exists, pattern_match)
- File paths from hidden criteria
- Regex patterns from verification

### A-FEED-04: Check Escalation Threshold

The command reports attempt status:

| Attempt | Action |
|---------|--------|
| 1 of 3 | Standard feedback |
| 2 of 3 | Enhanced guidance recommended |
| 3 of 3 | Maximum detail; warn about escalation |
| > max | Suggest `orchestra escalate` |

### A-FEED-05: Return to Implementor

If retry is possible, inform implementor:

> "Verification failed. Please read `.orchestra/handover/feedback.md` for required fixes. Focus on the specific issues listed - do not restart from scratch."

### A-FEED-06: Proceed to Escalate

If max attempts reached:

```bash
orchestra escalate --task 3 --reason "Persistent failure after 3 attempts"
```

See [escalate.md](escalate.md) for next steps.

---

## CLI Command

### `orchestra feedback`

Generate feedback for implementor after verification failure.

```bash
orchestra feedback [OPTIONS]
```

### Options

| Option | Short | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--task <id>` | `-t` | INT | current | Task ID to generate feedback for |
| `--attempt <n>` | `-a` | INT | auto | Attempt number (auto-increments) |
| `--json` | | FLAG | false | Output as JSON |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Feedback generated successfully |
| 1 | Error (no verification results, task not found, etc.) |

### Examples

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

---

## Input

### Required Files

| File | Purpose | Created By |
|------|---------|------------|
| `.orchestra/manifest.yaml` | Task and retry configuration | `orchestra init` |
| `.orchestra/progress/sprint-{id}-progress.yaml` | Current attempt count | `orchestra prepare` |
| `.orchestra/artifacts/task-{id}-verification.yaml` | Verification results | `orchestra verify` |

### Verification Result Input

The command reads the last verification result:

```yaml
# .orchestra/artifacts/task-3-verification.yaml
task_id: 3
timestamp: "2025-12-01T14:30:00Z"
overall_passed: false

results:
  - check_id: "V3.1"
    description: "Configuration loader handles missing files"
    severity: "critical"
    passed: false
    message: "Expected error handling, found crash"
    
  - check_id: "V3.2"
    description: "Error messages are user-friendly"
    severity: "warning"
    passed: false
    message: "Generic error message without context"
```

### Context Required

| Input | Source | Required |
|-------|--------|----------|
| Task ID | Progress log or `--task` option | Yes |
| Verification results | `.orchestra/artifacts/task-{id}-verification.yaml` | Yes |
| Max retries | Manifest task config or config.yaml | Yes |

---

## File Impact

### Read

| File | Purpose |
|------|---------|
| `.orchestra/manifest.yaml` | Get task config, max_retries |
| `.orchestra/progress/sprint-{id}-progress.yaml` | Current attempt count |
| `.orchestra/artifacts/task-{id}-verification.yaml` | Verification results |
| `.orchestra/common/templates/feedback.md.hbs` | Feedback template |

### Written

| File | Purpose |
|------|---------|--------|
| `.orchestra/handover/feedback.md` | Feedback document (neutral zone) |
| `.orchestra/progress/sprint-{id}-progress.yaml` | Updated with RETRY status |

> **Note**: The feedback file is a **single file** in the handover folder, not per-task files. It is overwritten on each feedback generation. Previous feedback is replaced.

### Created

| File | When |
|------|------|
| `.orchestra/handover/feedback.md` | On every feedback generation (overwrites previous) |

### Deleted

None.

---

## Template Details

### Template Conversion

| Template | Source | Converts To | Zone |
|----------|--------|-------------|------|
| `feedback.md.hbs` | `.orchestra/common/templates/` | `.orchestra/handover/feedback.md` | Neutral (handover) |

> **Neutral Zone**: The feedback file is placed in `.orchestra/handover/` which is accessible to both orchestrator and implementor. This is the communication channel between roles.

### Template Variables

| Variable | Type | Description |
|----------|------|-------------|
| `task_id` | number | Current task ID |
| `task` | object | Task details from manifest |
| `attempt` | number | Current attempt number |
| `max_attempts` | number | Maximum retry attempts allowed |
| `remaining_attempts` | number | Attempts left (max - current) |
| `issues` | array | Transformed verification failures |
| `can_retry` | boolean | Whether retry is possible |
| `timestamp` | string | ISO timestamp of generation |
| `sprint` | object | Sprint metadata |

### Template Source

The template is located at [`templates/common/templates/feedback.md.hbs`](../../templates/common/templates/feedback.md.hbs).

**Key sections in template:**

| Section | Purpose |
|---------|---------|
| Metadata | Task ID, sprint, attempt count, timestamp |
| Summary | Retry possible or escalation needed |
| What Went Wrong | Issue list with problem/impact/guidance |
| Next Steps | Actions for implementor |
| Important Reminders | Remaining attempts, focus guidance |

### Generated Document Structure

The rendered feedback includes:

| Section | Content |
|---------|---------|
| Metadata | Task ID, attempt number, timestamp |
| Summary | Overview of failure status |
| What Went Wrong | Issue list with guidance |
| Next Steps | Clear action items |
| Important Reminders | Remaining attempts, validation reminder |

---

## Git Actions

No git actions are required for feedback. This is a document generation step.

Git actions happen:
- On retry: After implementor fixes and signals again
- On escalate: Human may make direct commits

---

## Outcome

### Success Path (Can Retry)

```
✓ Feedback generated
  → Issues documented
  → Attempt counter incremented
  → Implementor can retry
```

**Next**: Return to implementor for [implement.md](implement.md) (targeted fixes)

### Success Path (Max Attempts)

```
✓ Feedback generated
  → Final attempt documented
  → Max retries reached
  → Escalation recommended
```

**Next**: Run `orchestra escalate` ([escalate.md](escalate.md))

### Failure Paths

#### Failure: No Verification Results

```
✗ Cannot generate feedback: No verification results found
  → Run 'orchestra verify' first
```

**Action**: Run `orchestra verify` before feedback

#### Failure: Task Not Found

```
✗ Cannot generate feedback: Task 99 not found
```

**Action**: Check task ID exists in manifest

#### Failure: Task Already Complete

```
✗ Cannot generate feedback: Task 3 is already complete
```

**Action**: Feedback only applies to failed verifications

---

## Next Step

| Condition | Next Document | Command |
|-----------|---------------|---------|
| Can retry | [implement.md](implement.md) | Return to implementor |
| Max attempts | [escalate.md](escalate.md) | `orchestra escalate` |

---

## Evidence Produced

| Evidence | Location | Purpose |
|----------|----------|--------|
| Feedback document | `.orchestra/handover/feedback.md` | Implementor guidance |
| Progress update | `.orchestra/progress/sprint-{id}-progress.yaml` | Attempt tracking |
| JSON output | Terminal (with `--json`) | Scripting integration |

### Evidence Verification

```powershell
# Check feedback was created
Test-Path ".orchestra/handover/feedback.md"

# View feedback content
Get-Content ".orchestra/handover/feedback.md"

# Check progress updated
Get-Content ".orchestra/progress/sprint-001-progress.yaml"
```

### JSON Output Format

```json
{
  "success": true,
  "taskId": 3,
  "attempt": 2,
  "maxAttempts": 3,
  "canRetry": true,
  "feedbackPath": ".orchestra/handover/feedback.md",
  "issues": [
    {
      "severity": "major",
      "category": "functionality",
      "problem": "Configuration loader does not handle missing files",
      "impact": "Application crashes on missing config",
      "guidance": "Add error handling for FileNotFoundError"
    }
  ],
  "nextStep": "retry"
}
```

---

## Implementation Reference

| Component | File | Purpose |
|-----------|------|---------|
| Command | [src/commands/feedback.ts](../../src/commands/feedback.ts) | CLI command definition |
| Core logic | [src/core/feedback.ts](../../src/core/feedback.ts) | `runFeedback()` function |
| Template | [templates/common/templates/feedback.md.hbs](../../templates/common/templates/feedback.md.hbs) | Feedback template |
| Tests | [test/commands/feedback.test.ts](../../test/commands/feedback.test.ts) | Unit tests |
| Spec | [spec/implementation/phase-1.2-cli/commands/feedback.md](../../spec/implementation/phase-1.2-cli/commands/feedback.md) | Full specification |
| Process | [spec/04-processes/failure-handling.md](../../spec/04-processes/failure-handling.md) | Failure handling protocol |

### Core Function

```typescript
// src/core/feedback.ts

/**
 * Transform verification check results into implementor-friendly feedback.
 * CRITICAL: This function strips any information that reveals HOW we detected issues.
 *
 * ALLOWED in output:
 * - description (human-readable issue description)
 * - severity (critical/major/minor)
 *
 * FORBIDDEN in output:
 * - check.type (file_exists, pattern_match, etc.)
 * - check.path (file paths from hidden criteria)
 * - check.pattern (regex patterns from hidden criteria)
 * - check.details (internal check data)
 */
function transformToFeedback(checks: VerifyCheckResult[]): FeedbackIssue[] {
  return checks
    .filter((c) => !c.passed)
    .map((check) => ({
      severity: mapSeverity(check.severity),
      category: "verification",
      problem: check.description,  // ONLY the description
      impact: "Verification cannot pass until this is resolved",
      guidance: "Please review and address this issue",
    }));
}
```

---

## Troubleshooting

### Issue: "No verification results found"

**Cause**: `orchestra verify` wasn't run or results not saved.

**Solution**:
```bash
# Run verification first
orchestra verify

# Then generate feedback
orchestra feedback
```

### Issue: Feedback too generic

**Cause**: Verification check descriptions not specific enough.

**Solution**:
1. Improve check descriptions in verification YAML during prepare
2. Manually edit feedback file with specific guidance
3. Never reveal the check type or detection method

### Issue: Attempt counter not incrementing

**Cause**: Progress file not updated properly.

**Solution**:
```bash
# Check progress file
Get-Content ".orchestra/progress/sprint-001-progress.yaml"

# Manually specify attempt if needed
orchestra feedback --attempt 2
```

### Issue: Template not found

**Cause**: `feedback.md.hbs` missing from templates folder.

**Solution**:
The command has fallback logic that generates basic feedback without template. To fix properly:
```bash
# Check template exists
Test-Path ".orchestra/common/templates/feedback.md.hbs"

# If missing, copy from templates folder
Copy-Item "templates/common/templates/feedback.md.hbs" ".orchestra/common/templates/"
```

### Issue: Want to add custom guidance

**Cause**: Auto-generated feedback is too generic for complex issues.

**Solution**:
1. Let command generate initial feedback
2. Edit `.orchestra/handover/feedback.md`
3. Add specific examples, code snippets
4. **Never reveal** check types, paths, or patterns

---

## Attempt-Based Guidance

As attempts increase, provide more detailed guidance:

| Attempt | Guidance Level | Approach |
|---------|----------------|----------|
| 1 | Standard | Basic feedback from verification |
| 2 | Enhanced | Add examples, clarify ambiguity |
| 3 | Maximum | Consider if spec needs revision |
| >3 | Escalate | Human intervention required |

### Example: Attempt 2 Enhanced Guidance

```markdown
### Issue: Configuration loader does not handle missing files

**Problem**: The loader crashes when config file is missing.

**What we expect**: Graceful error handling that:
- Catches FileNotFoundError
- Returns a meaningful error message
- Suggests possible fixes to the user

**Example approach**:
```python
try:
    config = load_config(path)
except FileNotFoundError:
    raise ConfigError(f"Config file not found: {path}. Create one with 'init'.")
```

**Impact**: Without this, users see cryptic crash instead of helpful message.
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-05 | Initial creation |

---

*This is the authoritative documentation for the feedback workflow step.*
