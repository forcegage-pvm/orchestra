````markdown
# Command: `orchestra closeout`

> **Navigation**: [Phase 1 Index](../readme.md) | **Prev**: [init](init.md) | **Next**: [prepare](prepare.md)

---

## Purpose

Verify that the previous task is fully closed out before preparing a new task. This is **Step 0** of the Handover Creation process and must pass before proceeding to `orchestra prepare`.

This command ensures:
- No uncommitted changes lingering from previous work
- Previous task status is "completed" (not "in_progress" or "failed")
- Commit hash is recorded in progress.yaml
- SpecKit tasks.md checkboxes are marked complete
- Completion signal from previous task is cleared

## Process Reference

This command implements **Process 1 (Handover Creation), Step 0** from:
- `.orchestra/orchestrator/processes/01-HANDOVER-CREATION.md`

## Synopsis

```bash
orchestra closeout [OPTIONS]
```

## Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `--task` | INT | No | previous | Task ID to check (default: last completed) |
| `--fix` | FLAG | No | false | Attempt to auto-fix issues |
| `--force` | FLAG | No | false | Skip closeout check (use with caution) |
| `--json` | FLAG | No | false | Output JSON format |
| `--verbose` | FLAG | No | false | Show detailed check output |

## Preconditions

1. **Config exists**: `.orchestra/config.yaml` must exist
2. **Progress exists**: `progress.yaml` must exist
3. **Has history**: At least one task must have been attempted (unless first task)

## Checks Performed

The closeout command validates these conditions:

### Check 1: No Uncommitted Changes

```typescript
async function checkUncommittedChanges(): Promise<CheckResult> {
  const git = simpleGit();
  const status = await git.status();
  
  if (status.files.length > 0) {
    return {
      passed: false,
      id: 'C1',
      check: 'Uncommitted changes',
      expected: 'No uncommitted changes',
      actual: `${status.files.length} uncommitted file(s): ${status.files.map(f => f.path).join(', ')}`,
      fix: 'git add -A && git commit -m "chore: closeout previous task"'
    };
  }
  return { passed: true, id: 'C1', check: 'Uncommitted changes', expected: 'None', actual: 'Clean' };
}
```

### Check 2: Previous Task Status

```typescript
async function checkPreviousTaskStatus(taskId: number): Promise<CheckResult> {
  const progress = await loadProgress();
  const task = progress.tasks[taskId];
  
  if (!task) {
    // No previous task - this is first task, OK
    return { passed: true, id: 'C2', check: 'Previous task status', expected: 'N/A', actual: 'First task' };
  }
  
  if (task.status !== 'completed') {
    return {
      passed: false,
      id: 'C2',
      check: 'Previous task status',
      expected: 'completed',
      actual: task.status,
      fix: `Update progress.yaml: tasks.${taskId}.status = "completed"`
    };
  }
  return { passed: true, id: 'C2', check: 'Previous task status', expected: 'completed', actual: 'completed' };
}
```

### Check 3: Commit Hash Recorded

```typescript
async function checkCommitHashRecorded(taskId: number): Promise<CheckResult> {
  const progress = await loadProgress();
  const task = progress.tasks[taskId];
  
  if (!task || task.status === 'pending') {
    return { passed: true, id: 'C3', check: 'Commit hash', expected: 'N/A', actual: 'First task' };
  }
  
  if (!task.completed_commit) {
    const git = simpleGit();
    const log = await git.log({ maxCount: 1 });
    return {
      passed: false,
      id: 'C3',
      check: 'Commit hash recorded',
      expected: 'Commit hash in progress.yaml',
      actual: 'No commit hash recorded',
      fix: `Add to progress.yaml: tasks.${taskId}.completed_commit = "${log.latest?.hash}"`
    };
  }
  return { passed: true, id: 'C3', check: 'Commit hash recorded', expected: 'Present', actual: task.completed_commit };
}
```

### Check 4: SpecKit Tasks Complete

```typescript
async function checkSpecKitTasks(taskId: number): Promise<CheckResult> {
  const manifest = await loadManifest();
  const task = manifest.tasks.find(t => t.id === taskId);
  
  if (!task || !task.speckit_task_ref) {
    return { passed: true, id: 'C4', check: 'SpecKit tasks', expected: 'N/A', actual: 'No SpecKit refs' };
  }
  
  // Read tasks.md and check if referenced tasks are checked
  const tasksPath = '.orchestra/orchestrator/.orchestrator-only/tasks.md';
  const content = fs.readFileSync(tasksPath, 'utf-8');
  
  for (const ref of task.speckit_task_ref) {
    const pattern = new RegExp(`\\[x\\].*${ref}`, 'i');
    if (!pattern.test(content)) {
      return {
        passed: false,
        id: 'C4',
        check: 'SpecKit tasks complete',
        expected: `Task ${ref} checked in tasks.md`,
        actual: `Task ${ref} not checked`,
        fix: `Edit tasks.md: Change "[ ]" to "[x]" for task ${ref}`
      };
    }
  }
  return { passed: true, id: 'C4', check: 'SpecKit tasks', expected: 'All checked', actual: 'All checked' };
}
```

### Check 5: Completion Signal Cleared

```typescript
async function checkCompletionSignalCleared(): Promise<CheckResult> {
  const signalPath = '.orchestra/handover/completion-signal.md';
  
  if (!fs.existsSync(signalPath)) {
    return { passed: true, id: 'C5', check: 'Completion signal', expected: 'Cleared', actual: 'Not present' };
  }
  
  const content = fs.readFileSync(signalPath, 'utf-8');
  
  // Check if it's a template (empty) or filled out
  if (content.includes('<!-- Implementor:') && !content.includes('## Summary\n\n')) {
    return { passed: true, id: 'C5', check: 'Completion signal', expected: 'Template', actual: 'Empty template' };
  }
  
  // Signal has content - should be cleared
  return {
    passed: false,
    id: 'C5',
    check: 'Completion signal cleared',
    expected: 'Signal cleared or reset to template',
    actual: 'Signal contains previous task content',
    fix: 'rm .orchestra/handover/completion-signal.md'
  };
}
```

### Check 6: Results File Exists (for non-first tasks)

```typescript
async function checkResultsFileExists(taskId: number): Promise<CheckResult> {
  if (taskId === 0) {
    return { passed: true, id: 'C6', check: 'Results file', expected: 'N/A', actual: 'First task' };
  }
  
  const resultsPath = `.orchestra/orchestrator/results/task-${String(taskId).padStart(3, '0')}-result.yaml`;
  
  if (!fs.existsSync(resultsPath)) {
    return {
      passed: false,
      id: 'C6',
      check: 'Results file exists',
      expected: resultsPath,
      actual: 'Not found',
      fix: 'Run orchestra verify && orchestra complete for previous task'
    };
  }
  return { passed: true, id: 'C6', check: 'Results file', expected: 'Present', actual: resultsPath };
}
```

## Behavior

### Step 1: Determine Previous Task

```typescript
async function determinePreviousTask(explicitTaskId?: number): Promise<number | null> {
  if (explicitTaskId !== undefined) {
    return explicitTaskId;
  }
  
  const progress = await loadProgress();
  const currentTask = progress.current_task;
  
  if (currentTask <= 1) {
    return null; // No previous task
  }
  
  return currentTask - 1;
}
```

### Step 2: Run All Checks

```typescript
async function runCloseoutChecks(taskId: number | null): Promise<CloseoutReport> {
  const checks: CheckResult[] = [];
  
  // Always run uncommitted changes check
  checks.push(await checkUncommittedChanges());
  
  if (taskId !== null) {
    checks.push(await checkPreviousTaskStatus(taskId));
    checks.push(await checkCommitHashRecorded(taskId));
    checks.push(await checkSpecKitTasks(taskId));
    checks.push(await checkResultsFileExists(taskId));
  }
  
  checks.push(await checkCompletionSignalCleared());
  
  const allPassed = checks.every(c => c.passed);
  
  return {
    taskId,
    timestamp: new Date().toISOString(),
    overall: allPassed ? 'PASSED' : 'FAILED',
    checks,
    canProceed: allPassed
  };
}
```

### Step 3: Auto-Fix (if --fix)

```typescript
async function autoFix(report: CloseoutReport): Promise<CloseoutReport> {
  const fixedChecks: CheckResult[] = [];
  
  for (const check of report.checks) {
    if (check.passed) {
      fixedChecks.push(check);
      continue;
    }
    
    if (!check.fix) {
      fixedChecks.push(check);
      continue;
    }
    
    // Attempt fix
    try {
      if (check.id === 'C1') {
        // Auto-commit
        const git = simpleGit();
        await git.add('-A');
        await git.commit('chore: closeout previous task');
        fixedChecks.push({ ...check, passed: true, actual: 'Auto-committed' });
      } else if (check.id === 'C5') {
        // Clear completion signal
        fs.unlinkSync('.orchestra/handover/completion-signal.md');
        fixedChecks.push({ ...check, passed: true, actual: 'Cleared' });
      } else {
        // Manual fix required
        fixedChecks.push(check);
      }
    } catch (error) {
      fixedChecks.push({ ...check, fixError: String(error) });
    }
  }
  
  const allPassed = fixedChecks.every(c => c.passed);
  return { ...report, checks: fixedChecks, overall: allPassed ? 'PASSED' : 'FAILED', canProceed: allPassed };
}
```

### Step 4: Generate Report

```typescript
interface CloseoutReport {
  taskId: number | null;
  timestamp: string;
  overall: 'PASSED' | 'FAILED';
  checks: CheckResult[];
  canProceed: boolean;
}

interface CheckResult {
  id: string;
  check: string;
  passed: boolean;
  expected: string;
  actual: string;
  fix?: string;
  fixError?: string;
}
```

## Output

### Success (Human)

```
Closeout Check
─────────────────────────────────────────
Previous Task: 15 - Multi-axis demo implementation
Result: ✓ PASSED

Checks:
  ✓ [C1] No uncommitted changes
  ✓ [C2] Previous task status: completed
  ✓ [C3] Commit hash recorded: abc1234
  ✓ [C4] SpecKit tasks: All checked
  ✓ [C5] Completion signal: Cleared
  ✓ [C6] Results file: Present

All checks passed. Ready to prepare next task.
Next: Run 'orchestra prepare --task 16'
```

### Failure (Human)

```
Closeout Check
─────────────────────────────────────────
Previous Task: 15 - Multi-axis demo implementation
Result: ✗ FAILED

Checks:
  ✗ [C1] No uncommitted changes
      Expected: None
      Actual:   3 uncommitted file(s): lib/x.dart, test/y.dart, README.md
      Fix:      git add -A && git commit -m "chore: closeout previous task"
  
  ✓ [C2] Previous task status: completed
  
  ✗ [C3] Commit hash recorded
      Expected: Commit hash in progress.yaml
      Actual:   No commit hash recorded
      Fix:      Add to progress.yaml: tasks.15.completed_commit = "abc1234"
  
  ✓ [C4] SpecKit tasks: All checked
  ✓ [C5] Completion signal: Cleared
  ✓ [C6] Results file: Present

2 check(s) failed. Fix issues before preparing next task.

Suggested fixes:
  1. git add -A && git commit -m "chore: closeout task 15"
  2. Add completed_commit to progress.yaml

Or run with --fix to attempt auto-repair:
  orchestra closeout --fix
```

### JSON Output

```json
{
  "task_id": 15,
  "timestamp": "2025-12-01T10:00:00Z",
  "overall": "FAILED",
  "can_proceed": false,
  "checks": [
    {
      "id": "C1",
      "check": "No uncommitted changes",
      "passed": false,
      "expected": "None",
      "actual": "3 uncommitted file(s)",
      "fix": "git add -A && git commit -m \"chore: closeout previous task\""
    },
    {
      "id": "C2",
      "check": "Previous task status",
      "passed": true,
      "expected": "completed",
      "actual": "completed"
    }
  ],
  "failed_checks": ["C1", "C3"],
  "suggested_fixes": [
    "git add -A && git commit -m \"chore: closeout task 15\"",
    "Add completed_commit to progress.yaml"
  ]
}
```

### First Task (No Previous)

```
Closeout Check
─────────────────────────────────────────
Previous Task: None (preparing first task)
Result: ✓ PASSED

Checks:
  ✓ [C1] No uncommitted changes
  ○ [C2] Previous task status: N/A (first task)
  ○ [C3] Commit hash recorded: N/A (first task)
  ○ [C4] SpecKit tasks: N/A (first task)
  ✓ [C5] Completion signal: Not present
  ○ [C6] Results file: N/A (first task)

All checks passed. Ready to prepare first task.
Next: Run 'orchestra prepare --task 1'
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All checks passed, ready to proceed |
| 1 | One or more checks failed |
| 2 | Configuration error |
| 3 | Could not determine previous task |

## Examples

```bash
# Check closeout for previous task
orchestra closeout

# Check specific task closeout
orchestra closeout --task 15

# Attempt to auto-fix issues
orchestra closeout --fix

# Skip closeout check (use with caution!)
orchestra closeout --force

# JSON output for scripting
orchestra closeout --json

# Pipeline with prepare
orchestra closeout && orchestra prepare --task 16
```

## Integration with `prepare`

The `prepare` command should call closeout automatically:

```typescript
// In prepare command
async function prepareTask(taskId: number, options: PrepareOptions): Promise<void> {
  if (!options.force) {
    const closeoutReport = await runCloseoutChecks(taskId - 1);
    
    if (!closeoutReport.canProceed) {
      console.error('Closeout check failed. Run "orchestra closeout" for details.');
      console.error('Use --force to skip closeout check (not recommended).');
      process.exit(1);
    }
  }
  
  // Proceed with prepare...
}
```

## Implementation Notes

1. **First task edge case**: When preparing task 1, most checks are skipped
2. **Idempotent**: Safe to run multiple times
3. **Auto-fix safety**: Only auto-fixes safe operations (commit, clear signal)
4. **Manual fixes**: Some fixes require manual intervention (progress.yaml edits)
5. **Git dependency**: Requires git repository to check uncommitted changes

## Related Process Steps

This command implements the following steps from **Process 1: Handover Creation**:

- **Step 0.1**: Git status check (no uncommitted changes)
- **Step 0.2**: Previous task status check
- **Step 0.3**: Commit hash verification
- **Step 0.4**: SpecKit tasks verification
- **Step 0.5**: Completion signal cleared
- **Step 0.6**: Results file existence

Reference: `.orchestra/orchestrator/processes/01-HANDOVER-CREATION.md`
````