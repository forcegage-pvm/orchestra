````markdown
# Command: `orchestra accept-signal`

> **Navigation**: [Phase 1 Index](../readme.md) | **Prev**: [prepare](prepare.md) | **Next**: [verify](verify.md)

---

## Purpose

Verify that the implementor has properly signaled task completion by running their pre-signal check. This is **Step 1** of the Task Verification process and must pass before running `orchestra verify`.

This command ensures:
- The implementor actually ran the pre-signal verification script
- The pre-signal check passed (not just ran)
- The pre-signal artifact is recent (not stale from previous task)
- The implementor's completion signal exists and is filled out

## Process Reference

This command implements **Process 2 (Task Verification), Step 1** from:
- `.orchestra/orchestrator/processes/02-TASK-VERIFICATION.md`

## Synopsis

```bash
orchestra accept-signal [OPTIONS]
```

## Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `--task` | INT | No | current | Task ID to check (default: current in-progress) |
| `--max-age` | INT | No | 60 | Maximum age in minutes for pre-signal artifact |
| `--force` | FLAG | No | false | Accept signal without checks (emergency only) |
| `--json` | FLAG | No | false | Output JSON format |
| `--verbose` | FLAG | No | false | Show detailed check output |

## Background

The **pre-signal check** is a script the implementor must run before signaling completion. It creates an artifact that proves:
1. The implementor actually ran self-verification
2. All basic checks passed before bothering the orchestrator
3. The artifact is timestamped to prevent stale signals

Without this, implementors might signal "done" without verifying their own work, wasting orchestrator time on obvious failures.

## Pre-Signal Artifact

The implementor's pre-signal script creates:

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

## Checks Performed

### Check 1: Pre-Signal Artifact Exists

```typescript
async function checkPreSignalExists(): Promise<CheckResult> {
  const artifactPath = '.orchestra/handover/verification/pre-signal.yaml';
  
  if (!fs.existsSync(artifactPath)) {
    return {
      passed: false,
      id: 'S1',
      check: 'Pre-signal artifact exists',
      expected: artifactPath,
      actual: 'Not found',
      message: 'Implementor must run pre-signal check before signaling completion',
      fix: 'Implementor: Run .orchestra/implementor/scripts/pre-signal-check.ps1'
    };
  }
  return { passed: true, id: 'S1', check: 'Pre-signal artifact', expected: 'Present', actual: 'Found' };
}
```

### Check 2: Pre-Signal Passed

```typescript
async function checkPreSignalPassed(): Promise<CheckResult> {
  const artifact = loadYaml('.orchestra/handover/verification/pre-signal.yaml');
  
  if (artifact.status !== 'PASSED') {
    return {
      passed: false,
      id: 'S2',
      check: 'Pre-signal status',
      expected: 'PASSED',
      actual: artifact.status,
      message: 'Implementor\'s pre-signal check did not pass',
      details: artifact.checks,
      fix: 'Implementor: Fix failing checks and re-run pre-signal script'
    };
  }
  return { passed: true, id: 'S2', check: 'Pre-signal status', expected: 'PASSED', actual: 'PASSED' };
}
```

### Check 3: Correct Task ID

```typescript
async function checkCorrectTaskId(expectedTaskId: number): Promise<CheckResult> {
  const artifact = loadYaml('.orchestra/handover/verification/pre-signal.yaml');
  
  if (artifact.task_id !== expectedTaskId) {
    return {
      passed: false,
      id: 'S3',
      check: 'Task ID matches',
      expected: expectedTaskId,
      actual: artifact.task_id,
      message: 'Pre-signal artifact is for a different task (possibly stale)',
      fix: 'Implementor: Run pre-signal check for correct task'
    };
  }
  return { passed: true, id: 'S3', check: 'Task ID', expected: expectedTaskId, actual: artifact.task_id };
}
```

### Check 4: Artifact Not Stale

```typescript
async function checkNotStale(maxAgeMinutes: number): Promise<CheckResult> {
  const artifact = loadYaml('.orchestra/handover/verification/pre-signal.yaml');
  const timestamp = new Date(artifact.timestamp);
  const now = new Date();
  const ageMinutes = (now.getTime() - timestamp.getTime()) / (1000 * 60);
  
  if (ageMinutes > maxAgeMinutes) {
    return {
      passed: false,
      id: 'S4',
      check: 'Artifact freshness',
      expected: `< ${maxAgeMinutes} minutes old`,
      actual: `${Math.round(ageMinutes)} minutes old`,
      message: 'Pre-signal artifact is stale - implementor may have made changes since',
      fix: 'Implementor: Re-run pre-signal check to get fresh results'
    };
  }
  return { 
    passed: true, 
    id: 'S4', 
    check: 'Artifact freshness', 
    expected: `< ${maxAgeMinutes}m`, 
    actual: `${Math.round(ageMinutes)}m` 
  };
}
```

### Check 5: Completion Signal Filled

```typescript
async function checkCompletionSignalFilled(): Promise<CheckResult> {
  const signalPath = '.orchestra/handover/completion-signal.md';
  
  if (!fs.existsSync(signalPath)) {
    return {
      passed: false,
      id: 'S5',
      check: 'Completion signal exists',
      expected: signalPath,
      actual: 'Not found',
      fix: 'Implementor: Fill out completion-signal.md'
    };
  }
  
  const content = fs.readFileSync(signalPath, 'utf-8');
  
  // Check for unfilled template markers
  if (content.includes('<!-- Implementor:') && content.match(/## Summary\s*\n\s*\n/)) {
    return {
      passed: false,
      id: 'S5',
      check: 'Completion signal filled',
      expected: 'Summary section completed',
      actual: 'Template not filled out',
      fix: 'Implementor: Fill out all sections in completion-signal.md'
    };
  }
  
  // Check for required sections
  const requiredSections = ['## Summary', '## Artifacts Created', '## Tests'];
  for (const section of requiredSections) {
    if (!content.includes(section)) {
      return {
        passed: false,
        id: 'S5',
        check: 'Completion signal complete',
        expected: `Section "${section}" present`,
        actual: 'Section missing',
        fix: `Implementor: Add ${section} section to completion-signal.md`
      };
    }
  }
  
  return { passed: true, id: 'S5', check: 'Completion signal', expected: 'Filled', actual: 'Complete' };
}
```

### Check 6: Deliverables Check Passed

```typescript
async function checkDeliverablesInPreSignal(): Promise<CheckResult> {
  const artifact = loadYaml('.orchestra/handover/verification/pre-signal.yaml');
  
  if (!artifact.checks?.deliverables) {
    return {
      passed: false,
      id: 'S6',
      check: 'Deliverables check',
      expected: 'Deliverables section in pre-signal',
      actual: 'Not found',
      fix: 'Implementor: Pre-signal script should check deliverables'
    };
  }
  
  if (artifact.checks.deliverables.status !== 'PASSED') {
    return {
      passed: false,
      id: 'S6',
      check: 'Deliverables check',
      expected: 'All deliverables exist',
      actual: `Status: ${artifact.checks.deliverables.status}`,
      details: artifact.checks.deliverables,
      fix: 'Implementor: Create all required deliverable files'
    };
  }
  
  return { passed: true, id: 'S6', check: 'Deliverables', expected: 'All exist', actual: 'PASSED' };
}
```

## Behavior

### Step 1: Determine Current Task

```typescript
async function determineCurrentTask(explicitTaskId?: number): Promise<number> {
  if (explicitTaskId !== undefined) {
    return explicitTaskId;
  }
  
  const progress = await loadProgress();
  const currentTask = progress.current_task;
  
  const taskStatus = progress.tasks[currentTask]?.status;
  if (taskStatus !== 'in_progress') {
    throw new Error(`Task ${currentTask} is not in_progress (status: ${taskStatus})`);
  }
  
  return currentTask;
}
```

### Step 2: Run All Checks

```typescript
async function runAcceptSignalChecks(taskId: number, maxAge: number): Promise<SignalReport> {
  const checks: CheckResult[] = [];
  
  checks.push(await checkPreSignalExists());
  
  // Only run remaining checks if artifact exists
  if (checks[0].passed) {
    checks.push(await checkPreSignalPassed());
    checks.push(await checkCorrectTaskId(taskId));
    checks.push(await checkNotStale(maxAge));
    checks.push(await checkCompletionSignalFilled());
    checks.push(await checkDeliverablesInPreSignal());
  }
  
  const allPassed = checks.every(c => c.passed);
  
  return {
    taskId,
    timestamp: new Date().toISOString(),
    overall: allPassed ? 'ACCEPTED' : 'REJECTED',
    checks,
    canVerify: allPassed
  };
}
```

### Step 3: Generate Report

```typescript
interface SignalReport {
  taskId: number;
  timestamp: string;
  overall: 'ACCEPTED' | 'REJECTED';
  checks: CheckResult[];
  canVerify: boolean;
  preSignalDetails?: PreSignalArtifact;
}
```

## Output

### Accepted (Human)

```
Accept Signal Check
─────────────────────────────────────────
Task: 16 - Multi-axis demo verification
Result: ✓ ACCEPTED

Pre-Signal Artifact:
  Timestamp: 2025-12-01T14:30:00Z (5 minutes ago)
  Status: PASSED

Checks:
  ✓ [S1] Pre-signal artifact exists
  ✓ [S2] Pre-signal status: PASSED
  ✓ [S3] Task ID matches: 16
  ✓ [S4] Artifact freshness: 5m (< 60m)
  ✓ [S5] Completion signal: Filled
  ✓ [S6] Deliverables check: PASSED

Pre-Signal Summary:
  • flutter analyze: 15 files, 0 issues
  • flutter test: 42/42 tests passed (3.5s)
  • Deliverables: 2/2 files exist

Signal accepted. Ready to run verification.
Next: Run 'orchestra verify'
```

### Rejected (Human)

```
Accept Signal Check
─────────────────────────────────────────
Task: 16 - Multi-axis demo verification
Result: ✗ REJECTED

Checks:
  ✓ [S1] Pre-signal artifact exists
  ✗ [S2] Pre-signal status: FAILED
      Expected: PASSED
      Actual:   FAILED
      Message:  Implementor's pre-signal check did not pass
      
      Pre-Signal Details:
        flutter_analyze: FAILED (3 issues found)
        flutter_test: PASSED (42/42)
        deliverables: PASSED (2/2)
      
      Fix: Implementor must fix analyzer issues and re-run pre-signal
  
  ✓ [S3] Task ID matches: 16
  ✓ [S4] Artifact freshness: 5m
  ✓ [S5] Completion signal: Filled
  ✓ [S6] Deliverables check: PASSED

Signal rejected. Cannot proceed to verification.

Action Required:
  1. Implementor must fix the failing pre-signal checks
  2. Implementor must re-run: .orchestra/implementor/scripts/pre-signal-check.ps1
  3. Orchestrator re-runs: orchestra accept-signal
```

### No Artifact (Human)

```
Accept Signal Check
─────────────────────────────────────────
Task: 16 - Multi-axis demo verification
Result: ✗ REJECTED

Checks:
  ✗ [S1] Pre-signal artifact exists
      Expected: .orchestra/handover/verification/pre-signal.yaml
      Actual:   Not found
      Message:  Implementor must run pre-signal check before signaling completion

Signal rejected. No pre-signal artifact found.

This means the implementor has NOT run their pre-signal verification.
The orchestrator should NOT proceed until this is done.

Action Required:
  1. Return task to implementor
  2. Implementor runs: .orchestra/implementor/scripts/pre-signal-check.ps1
  3. Orchestrator re-runs: orchestra accept-signal
```

### JSON Output

```json
{
  "task_id": 16,
  "timestamp": "2025-12-01T14:35:00Z",
  "overall": "REJECTED",
  "can_verify": false,
  "checks": [
    {
      "id": "S1",
      "check": "Pre-signal artifact exists",
      "passed": true,
      "expected": "Present",
      "actual": "Found"
    },
    {
      "id": "S2",
      "check": "Pre-signal status",
      "passed": false,
      "expected": "PASSED",
      "actual": "FAILED",
      "message": "Implementor's pre-signal check did not pass"
    }
  ],
  "pre_signal_details": {
    "task_id": 16,
    "timestamp": "2025-12-01T14:30:00Z",
    "status": "FAILED",
    "checks": {
      "flutter_analyze": { "status": "FAILED", "issues": 3 },
      "flutter_test": { "status": "PASSED", "tests_passed": 42 },
      "deliverables": { "status": "PASSED" }
    }
  },
  "action_required": [
    "Implementor must fix failing pre-signal checks",
    "Implementor must re-run pre-signal script"
  ]
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Signal accepted, ready to verify |
| 1 | Signal rejected (checks failed) |
| 2 | No task in progress |
| 3 | Pre-signal artifact not found |
| 4 | Pre-signal artifact is stale |

## Examples

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

# Pipeline with verify
orchestra accept-signal && orchestra verify
```

## Integration with `verify`

The `verify` command should call accept-signal automatically:

```typescript
// In verify command
async function verifyTask(taskId: number, options: VerifyOptions): Promise<void> {
  if (!options.force) {
    const signalReport = await runAcceptSignalChecks(taskId, options.maxAge ?? 60);
    
    if (!signalReport.canVerify) {
      console.error('Accept signal check failed. Run "orchestra accept-signal" for details.');
      console.error('The implementor must run their pre-signal check before verification.');
      console.error('Use --force to skip this check (not recommended).');
      process.exit(3);
    }
  }
  
  // Proceed with verification...
}
```

## Why This Matters

Without the accept-signal check:
1. Implementors might skip their own verification
2. Orchestrator wastes time on obviously broken submissions
3. No proof that implementor did due diligence
4. Stale signals could be accidentally accepted

With the accept-signal check:
1. Implementors must self-verify before signaling
2. Orchestrator only reviews verified submissions
3. Clear audit trail of implementor's verification
4. Fresh signals ensure current state

## Implementation Notes

1. **Trust but verify**: The pre-signal artifact proves the implementor ran checks
2. **Freshness matters**: Stale artifacts may not reflect current code state
3. **Fail fast**: If artifact missing, stop immediately
4. **Details preserved**: Pre-signal details included in report for context
5. **Force escape hatch**: `--force` exists for emergencies but is logged

## Related Process Steps

This command implements the following steps from **Process 2: Task Verification**:

- **Step 1.1**: Check pre-signal artifact exists
- **Step 1.2**: Verify pre-signal status is PASSED
- **Step 1.3**: Validate correct task ID
- **Step 1.4**: Check artifact freshness
- **Step 1.5**: Verify completion signal filled out
- **Step 1.6**: Validate deliverables check passed

Reference: `.orchestra/orchestrator/processes/02-TASK-VERIFICATION.md`
````