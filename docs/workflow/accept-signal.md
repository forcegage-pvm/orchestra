# Accept Signal

> **Phase**: GATE_CHECK  
> **CLI Command**: `orchestra accept-signal`  
> **Source**: [src/commands/accept-signal.ts](../../src/commands/accept-signal.ts)

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
- [Validation Check Matrix](#validation-check-matrix)
- [Git Actions](#git-actions)
- [Outcome](#outcome)
- [Next Step](#next-step)
- [Evidence Produced](#evidence-produced)
- [Implementation Reference](#implementation-reference)
- [Troubleshooting](#troubleshooting)

---

## Overview

| Attribute | Value |
|-----------|-------|
| **Phase** | GATE_CHECK |
| **Role** | Orchestrator Agent |
| **Trigger** | After implementor signals "ready for review" |
| **Preconditions** | Task status is IMPLEMENT; implementor has signaled completion |

---

## Purpose

Verify that the implementor has properly signaled task completion before running verification. This is **Step 1** of Task Verification.

This step:

1. **Checks pre-signal artifact exists** - Proves implementor ran self-verification
2. **Validates pre-signal passed** - Implementor's checks succeeded
3. **Confirms correct task** - Artifact matches current task
4. **Ensures freshness** - Artifact is recent, not stale
5. **Validates completion signal** - Implementor filled out signal template
6. **Checks deliverables** - Required files exist per pre-signal

The orchestrator **should not waste time** verifying obviously broken submissions.

---

## Philosophy

Accept-signal is the **gatekeeper** - ensuring implementor did their due diligence before orchestrator invests verification time.

### Why This Matters

Before this check exists, implementors might:
- Signal "done" without running any checks
- Forget to run pre-signal verification
- Submit stale work from a previous task
- Leave completion signal unfilled

With accept-signal:
- **Proof of effort**: Pre-signal artifact proves implementor ran checks
- **Fail fast**: Obvious failures caught before expensive verification
- **Fresh state**: Stale artifacts rejected - current code state verified
- **Audit trail**: Clear record of implementor's self-verification

### Trust But Verify

The pre-signal artifact is **implementor-generated** - we trust they ran it, but we verify:

| What We Trust | What We Verify |
|---------------|----------------|
| Implementor ran their script | Artifact file exists |
| Implementor passed their checks | Artifact status is PASSED |
| Implementor verified this task | Task ID matches current |
| Checks reflect current code | Artifact is fresh (< 60 min) |
| Implementor documented work | Completion signal is filled |

### Anti-Patterns This Prevents

| Anti-Pattern | How Accept-Signal Prevents It |
|--------------|------------------------------|
| Premature signaling | Pre-signal artifact required |
| Skip self-verification | Must have PASSED status |
| Wrong task submission | Task ID validation |
| Stale artifact reuse | Freshness check |
| Empty completion signal | Signal content validation |
| Missing deliverables | Deliverables check in artifact |

---

## Actions

> Quick reference for all actions in this workflow step.  
> Use Action IDs to reference specific actions in other sections.

### CLI Actions

| ID | Action | Command |
|----|--------|---------|
| A-ASIG-01 | Accept signal check | `orchestra accept-signal` |

### Agent Actions

| ID | Role | Action |
|----|------|--------|
| A-ASIG-02 | Orchestrator | Review pre-signal details |
| A-ASIG-03 | Orchestrator | Check for warnings |
| A-ASIG-04 | Orchestrator | Decide proceed/reject |

### Conditional Actions

| ID | Condition | Action |
|----|-----------|--------|
| A-ASIG-05 | Signal ACCEPTED | Proceed to `orchestra verify` |
| A-ASIG-06 | Signal REJECTED | Return to implementor with details |
| A-ASIG-07 | No artifact | Return to implementor - must run pre-signal |

---

## Execution Sequence

The complete ordered execution of this workflow step:

| Order | Action ID | Type | Action |
|-------|-----------|------|--------|
| 1 | A-ASIG-01 | CLI | `orchestra accept-signal` |
| 2 | A-ASIG-02 | Agent | Review pre-signal details (if verbose) |
| 3 | A-ASIG-03 | Agent | Check for warnings in artifact |
| 4 | A-ASIG-04 | Agent | Decision point based on result |
| 5a | A-ASIG-05 | Flow | If ACCEPTED → proceed to verify |
| 5b | A-ASIG-06 | Flow | If REJECTED → return to implementor |
| 5c | A-ASIG-07 | Flow | If no artifact → return to implementor |

---

## Agent Process

The orchestrator agent validates the implementor's completion signal before verification.

### A-ASIG-01: Run Accept Signal Check

When implementor signals "ready for review", run:

```bash
orchestra accept-signal
```

Expected output (success):

```
Accept Signal Check
────────────────────────────────────────────────────────────────
Task: 16
Result: ✓ ACCEPTED

Pre-Signal Artifact:
  Timestamp: 2025-12-01T14:30:00Z (5 minutes ago)
  Status: PASSED

Checks:
  ✓ [S1] Pre-signal artifact: Found
  ✓ [S2] Pre-signal status: PASSED
  ✓ [S3] Task ID: 16
  ✓ [S4] Artifact freshness: 5m (< 60m)
  ✓ [S5] Completion signal: Complete
  ✓ [S6] Deliverables: All exist

Pre-Signal Summary:
  • flutter analyze: 15 files, 0 issues
  • flutter test: 42/42 tests passed (3.5s)
  • Deliverables: 2/2 files exist

Signal accepted. Ready to run verification.
Next: Run 'orchestra verify'
```

### A-ASIG-02: Review Pre-Signal Details

If using `--verbose`, review the detailed pre-signal checks:

```bash
orchestra accept-signal --verbose
```

This shows full details of each check performed by the implementor's pre-signal script.

### A-ASIG-04: Decision Point

Based on the result:

| Result | Exit Code | Next Action |
|--------|-----------|-------------|
| ACCEPTED | 0 | Proceed to A-ASIG-05 (verify) |
| REJECTED | 1 | Proceed to A-ASIG-06 (return to implementor) |
| No artifact | 3 | Proceed to A-ASIG-07 (return to implementor) |
| Stale artifact | 4 | Proceed to A-ASIG-06 (return to implementor) |

### A-ASIG-05: Signal Accepted - Proceed to Verify

If all checks pass:

```bash
# Proceed immediately to verification
orchestra verify
```

Or combine in pipeline:

```bash
orchestra accept-signal && orchestra verify
```

### A-ASIG-06: Signal Rejected - Return to Implementor

If checks fail, inform implementor of required actions:

```
Signal rejected. Cannot proceed to verification.

Action Required:
  1. Implementor must fix the failing pre-signal checks
  2. Implementor must re-run: orchestra pre-signal-check
  3. Orchestrator re-runs: orchestra accept-signal
```

**Say to implementor:**
> "Your signal was rejected. [Specific failure]. Please fix and re-run pre-signal-check, then signal again."

### A-ASIG-07: No Artifact - Return to Implementor

If pre-signal artifact is missing:

```
Signal rejected. No pre-signal artifact found.

This means the implementor has NOT run their pre-signal verification.
The orchestrator should NOT proceed until this is done.

Action Required:
  1. Return task to implementor
  2. Implementor runs: orchestra pre-signal-check
  3. Orchestrator re-runs: orchestra accept-signal
```

**Say to implementor:**
> "You signaled completion but haven't run pre-signal-check. Please run `orchestra pre-signal-check` first, then signal again."

---

## CLI Command

### `orchestra accept-signal`

Verify implementor completion signal before verification.

```bash
orchestra accept-signal [OPTIONS]
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--task <id>` | INT | current | Task ID to check (default: current in-progress) |
| `--max-age <minutes>` | INT | 60 | Maximum age in minutes for pre-signal artifact |
| `-f, --force` | FLAG | false | Accept signal without checks (emergency only) |
| `--json` | FLAG | false | Output JSON format |
| `-v, --verbose` | FLAG | false | Show detailed check output |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Signal accepted, ready to verify |
| 1 | Signal rejected (checks failed) |
| 2 | No task in progress |
| 3 | Pre-signal artifact not found |
| 4 | Pre-signal artifact is stale |

### Examples

```bash
# Check signal for current task
orchestra accept-signal

# Check specific task
orchestra accept-signal --task 16

# Allow older pre-signal artifacts (2 hours)
orchestra accept-signal --max-age 120

# Force accept (emergency only!)
orchestra accept-signal --force

# JSON output for scripting
orchestra accept-signal --json

# Verbose output showing all details
orchestra accept-signal --verbose

# Pipeline with verify
orchestra accept-signal && orchestra verify
```

---

## Input

### Required Files

| File | Purpose | Created By |
|------|---------|------------|
| `.orchestra/handover/verification/pre-signal.yaml` | Implementor's self-verification artifact | `orchestra pre-signal-check` |
| `.orchestra/handover/completion-signal.md` | Implementor's completion documentation | Implementor agent |

### Pre-Signal Artifact Format

```yaml
# .orchestra/handover/verification/pre-signal.yaml
task_id: 16
timestamp: "2025-12-01T14:30:00Z"
status: "PASSED"  # or "FAILED"

checks:
  flutter_analyze:
    status: "PASSED"
    files_checked: 15
    issues: 0
    
  flutter_test:
    status: "PASSED"
    tests_run: 42
    tests_passed: 42
    duration_ms: 3500
    
  deliverables:
    status: "PASSED"
    files_exist:
      - lib/src/models/y_axis_config.dart
      - test/unit/y_axis_config_test.dart
      
  completion_signal:
    status: "PASSED"
    filled_out: true
    sections_complete:
      - summary
      - artifacts_created
      - tests
```

### Context Required

| Input | Source | Required |
|-------|--------|----------|
| Task ID | Progress log or `--task` option | Yes |
| Pre-signal artifact | `.orchestra/handover/verification/pre-signal.yaml` | Yes |
| Completion signal | `.orchestra/handover/completion-signal.md` | Yes |

---

## File Impact

### Read

| File | Purpose |
|------|---------|
| `.orchestra/manifest.yaml` | Get current sprint ID |
| `.orchestra/progress/sprint-{id}-progress.yaml` | Determine current task |
| `.orchestra/handover/verification/pre-signal.yaml` | Implementor's verification artifact |
| `.orchestra/handover/completion-signal.md` | Implementor's completion documentation |

### Written

None. This command only reads and validates - it does not modify any files.

### Created

None.

### Deleted

None.

---

## Validation Check Matrix

The accept-signal command performs 6 checks (S1-S6):

| ID | Check | Expected | Blocking |
|----|-------|----------|----------|
| S1 | Pre-signal artifact exists | File present | Yes |
| S2 | Pre-signal status | PASSED | Yes |
| S3 | Task ID matches | Current task ID | Yes |
| S4 | Artifact freshness | < max-age minutes | Yes |
| S5 | Completion signal filled | Not empty template | Yes |
| S6 | Deliverables check passed | All files exist | Yes |

### Check Details

#### S1: Pre-Signal Artifact Exists

```typescript
// Check that implementor ran pre-signal-check
const artifactPath = '.orchestra/handover/verification/pre-signal.yaml';
if (!fs.existsSync(artifactPath)) {
  return {
    passed: false,
    id: 'S1',
    check: 'Pre-signal artifact exists',
    fix: 'Implementor: Run orchestra pre-signal-check'
  };
}
```

#### S2: Pre-Signal Status is PASSED

```typescript
// Implementor's checks must have passed
if (artifact.status !== 'PASSED') {
  return {
    passed: false,
    id: 'S2',
    check: 'Pre-signal status',
    expected: 'PASSED',
    actual: artifact.status,
    fix: 'Implementor: Fix failing checks and re-run pre-signal'
  };
}
```

#### S3: Task ID Matches

```typescript
// Prevent stale artifact from wrong task
if (artifact.task_id !== expectedTaskId) {
  return {
    passed: false,
    id: 'S3',
    check: 'Task ID matches',
    fix: 'Implementor: Run pre-signal check for correct task'
  };
}
```

#### S4: Artifact is Fresh

```typescript
// Artifact should reflect current code state
const ageMinutes = (now - timestamp) / 60000;
if (ageMinutes > maxAgeMinutes) {
  return {
    passed: false,
    id: 'S4',
    check: 'Artifact freshness',
    expected: `< ${maxAgeMinutes} minutes old`,
    actual: `${ageMinutes} minutes old`,
    fix: 'Implementor: Re-run pre-signal check to get fresh results'
  };
}
```

#### S5: Completion Signal Filled

```typescript
// Implementor must document their work
const content = fs.readFileSync(signalPath, 'utf-8');
if (content.includes('<!-- Implementor:') && content.match(/## Summary\s*\n\s*\n/)) {
  return {
    passed: false,
    id: 'S5',
    check: 'Completion signal filled',
    fix: 'Implementor: Fill out all sections in completion-signal.md'
  };
}
```

#### S6: Deliverables Check Passed

```typescript
// Pre-signal should have verified deliverables exist
if (artifact.checks.deliverables?.status !== 'PASSED') {
  return {
    passed: false,
    id: 'S6',
    check: 'Deliverables check',
    fix: 'Implementor: Create all required deliverable files'
  };
}
```

---

## Git Actions

No git actions are required for accept-signal. This is a read-only validation step.

---

## Outcome

### Success Path

```
✓ Signal ACCEPTED
  → All 6 checks passed
  → Pre-signal artifact is fresh and PASSED
  → Completion signal is properly filled
  → Ready to proceed to verification
```

**Next**: Run `orchestra verify` (Step 7)

### Failure Paths

#### Failure: No Pre-Signal Artifact

```
✗ Signal REJECTED
  → S1 failed: Pre-signal artifact not found
  → Implementor never ran pre-signal check
  → Return to implementor with instructions
```

**Action**: Implementor must run `orchestra pre-signal-check`

#### Failure: Pre-Signal Failed

```
✗ Signal REJECTED
  → S2 failed: Pre-signal status is FAILED
  → Implementor's checks found issues
  → Return to implementor with details
```

**Action**: Implementor must fix issues and re-run pre-signal-check

#### Failure: Wrong Task ID

```
✗ Signal REJECTED
  → S3 failed: Task ID mismatch
  → Pre-signal artifact is for different task
  → Likely stale from previous work
```

**Action**: Implementor must run pre-signal-check for current task

#### Failure: Stale Artifact

```
✗ Signal REJECTED
  → S4 failed: Artifact too old
  → Pre-signal may not reflect current code
  → Could be leftover from earlier attempt
```

**Action**: Implementor must re-run pre-signal-check to get fresh results

#### Failure: Completion Signal Empty

```
✗ Signal REJECTED
  → S5 failed: Completion signal not filled
  → Implementor didn't document their work
  → Template markers still present
```

**Action**: Implementor must complete completion-signal.md

#### Failure: Deliverables Missing

```
✗ Signal REJECTED
  → S6 failed: Deliverables check failed
  → Pre-signal reported missing files
  → Required files not created
```

**Action**: Implementor must create all required deliverable files

---

## Next Step

| Condition | Next Document | Command |
|-----------|---------------|---------|
| Signal ACCEPTED | [verify.md](verify.md) | `orchestra verify` |
| Signal REJECTED | [implement.md](implement.md) | Return to implementor |

---

## Evidence Produced

| Evidence | Location | Purpose |
|----------|----------|---------|
| Accept-signal output | Terminal/logs | Proof orchestrator validated signal |
| Check results | `--json` output | Detailed validation record |
| Pre-signal artifact | `.orchestra/handover/verification/pre-signal.yaml` | Implementor's self-verification |

### Evidence Verification

```powershell
# Verify pre-signal artifact exists
Test-Path ".orchestra/handover/verification/pre-signal.yaml"

# Check artifact content
Get-Content ".orchestra/handover/verification/pre-signal.yaml"

# Verify completion signal exists
Test-Path ".orchestra/handover/completion-signal.md"

# Get JSON evidence for audit
orchestra accept-signal --json > accept-signal-result.json
```

---

## Implementation Reference

| Component | File | Purpose |
|-----------|------|---------|
| Command | [src/commands/accept-signal.ts](../../src/commands/accept-signal.ts) | CLI command definition |
| Core logic | [src/core/signal.ts](../../src/core/signal.ts) | `runAcceptSignal()` function |
| Tests | [test/commands/accept-signal.test.ts](../../test/commands/accept-signal.test.ts) | Unit tests |
| Spec | [spec/implementation/phase-1-cli/commands/accept-signal.md](../../spec/implementation/phase-1-cli/commands/accept-signal.md) | Full specification |

### Core Function

```typescript
// src/core/signal.ts
export async function runAcceptSignal(
  options: AcceptSignalOptions
): Promise<SignalReport> {
  // If force mode, bypass checks
  if (options.force) {
    return { taskId, overall: 'ACCEPTED', checks: [], canVerify: true };
  }

  // Determine task ID
  const taskId = await determineCurrentTask(options.task);

  // Run all checks
  const checks: CheckResult[] = [];
  
  const artifactCheck = await checkPreSignalExists();
  checks.push(artifactCheck);

  if (artifactCheck.passed) {
    const artifact = await loadPreSignalArtifact();
    checks.push(await checkPreSignalPassed(artifact));
    checks.push(await checkCorrectTaskId(taskId, artifact));
    checks.push(await checkNotStale(maxAge, artifact));
    checks.push(await checkCompletionSignalFilled());
    checks.push(await checkDeliverablesInPreSignal(artifact));
  }

  const allPassed = checks.every((c) => c.passed);
  return {
    taskId,
    overall: allPassed ? 'ACCEPTED' : 'REJECTED',
    checks,
    canVerify: allPassed,
    preSignalDetails: artifact
  };
}
```

---

## Troubleshooting

### Issue: "No task in progress"

**Cause**: No task currently has status `in_progress` in progress log.

**Solution**:
```bash
# Check current status
orchestra status

# If needed, specify task explicitly
orchestra accept-signal --task 16
```

### Issue: "Pre-signal artifact not found"

**Cause**: Implementor signaled completion without running pre-signal check.

**Solution**:
1. Inform implementor they must run pre-signal-check first
2. Implementor runs: `orchestra pre-signal-check`
3. Implementor signals again
4. Orchestrator re-runs: `orchestra accept-signal`

### Issue: "Artifact is stale (> 60 minutes)"

**Cause**: Pre-signal artifact is old - implementor may have made changes since.

**Solution**:
```bash
# Option 1: Have implementor re-run pre-signal
# Implementor: orchestra pre-signal-check
# Then: orchestra accept-signal

# Option 2: Increase max age if appropriate
orchestra accept-signal --max-age 120
```

### Issue: "Task ID mismatch"

**Cause**: Pre-signal artifact is from a different task (possibly stale from previous work).

**Solution**:
1. Delete stale artifact: `rm .orchestra/handover/verification/pre-signal.yaml`
2. Implementor runs: `orchestra pre-signal-check`
3. Orchestrator re-runs: `orchestra accept-signal`

### Issue: "Pre-signal status is FAILED"

**Cause**: Implementor's pre-signal checks found issues.

**Solution**:
```bash
# Get details of what failed
orchestra accept-signal --verbose

# Implementor must fix issues, then:
# orchestra pre-signal-check
# orchestra accept-signal
```

### Issue: "Completion signal not filled"

**Cause**: Implementor left template markers in completion-signal.md.

**Solution**:
1. Implementor must edit `.orchestra/handover/completion-signal.md`
2. Fill out all sections (Summary, Artifacts Created, Tests)
3. Remove template markers (`<!-- Implementor: ... -->`)
4. Orchestrator re-runs: `orchestra accept-signal`

### Emergency: Force Accept

**Use with extreme caution** - only when you understand why checks fail and accept the risk:

```bash
# Skip all checks (emergency only!)
orchestra accept-signal --force
```

This logs a warning but proceeds. Use only when:
- You've manually verified the work is acceptable
- There's a valid reason checks can't pass (e.g., infrastructure issue)
- You're prepared to handle verification failures manually

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-05 | Initial creation |

---

*This is the authoritative documentation for the accept-signal workflow step.*
