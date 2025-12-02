# Command: `orchestra complete`

> **Navigation**: [Phase 1 Index](../readme.md) | **Prev**: [verify](verify.md) | **Next**: [status](status.md)

---

## Purpose

Complete the current task after successful verification. This implements the **post-verification closeout** steps that ensure proper task closure, artifact archival, and preparation for the next task.

**This command is part of Process 2: Task Verification** and implements Steps 5-7 (PASS flow closeout) from:
- `.orchestra/orchestrator/processes/02-TASK-VERIFICATION.md`

## Process Reference

This command implements **Process 2 (Task Verification), Steps 5-7** - the post-verification closeout:

| Step | Description | Implementation |
|------|-------------|----------------|
| 6a | Git commit all changes | Step 7 below |
| 6b | Git push to remote | Step 7 below |
| 6c | Create task results file | Step 2 below |
| 6d | Update progress.yaml | Step 3 below |
| 6e | Record commit hash | Step 3 below |
| 6f | Update manifest status | Step 4 below |
| 6g | Update SpecKit tasks.md | Step 5 below |
| 6h | Archive handover folder | Step 6 below |
| 6i | Clear completion signal | Step 6 below |
| 6j | Clear pre-signal artifact | Step 6 below |
| 6k | Prepare results for pre-flight | Step 8 below |

## Synopsis

```bash
orchestra complete [OPTIONS] [MESSAGE]
```

## Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `MESSAGE` | STR | No | Commit message (if --commit) |

## Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `--task` | INT | No | current | Task ID to complete |
| `--commit` | FLAG | No | config | Commit changes to git |
| `--no-commit` | FLAG | No | false | Skip git commit |
| `--push` | FLAG | No | false | Push after commit |
| `--next` | FLAG | No | true | Prepare next task automatically |
| `--no-next` | FLAG | No | false | Don't prepare next task |
| `--force` | FLAG | No | false | Complete without verification |
| `--json` | FLAG | No | false | Output JSON format |

## Preconditions

1. **Task in progress**: Task must have status "in_progress"
2. **Verification passed**: Latest verification must be PASSED (unless --force)
3. **Accept-signal passed**: Pre-signal artifact exists and passed
4. **Clean git state**: No merge conflicts (if --commit)

### Verification Requirement

The complete command should only be called after `orchestra verify` passes:

```typescript
async function validateComplete(taskId: number, force: boolean): Promise<void> {
  const reportPath = `.orchestra/orchestrator/results/task-${String(taskId).padStart(3, '0')}-verification.yaml`;
  
  if (!force) {
    if (!fs.existsSync(reportPath)) {
      throw new Error('No verification report found. Run "orchestra verify" first.');
    }
    
    const report = loadYaml(reportPath);
    if (report.overall !== 'PASSED') {
      throw new VerificationNotPassedError(
        `Verification status is ${report.overall}. Cannot complete task.`,
        report.failed_checks
      );
    }
    
    // Check report is recent (within 30 minutes)
    const reportAge = (Date.now() - new Date(report.timestamp).getTime()) / (1000 * 60);
    if (reportAge > 30) {
      console.warn(`⚠️  Verification report is ${Math.round(reportAge)} minutes old.`);
      console.warn('   Consider re-running "orchestra verify" to ensure current state.');
    }
  }
}
```

## Behavior

### Step 1: Validate Completion

```typescript
async function validateComplete(taskId: string, force: boolean): Promise<void> {
  /**
   * Validate task can be completed.
   * 
   * Throws:
   *   TaskNotInProgressError: Task not in in_progress state
   *   VerificationNotPassedError: Latest verification failed (without force)
   *   GitConflictError: Merge conflicts exist
   */
  const reportPath = path.join(
    '.orchestra', 'orchestrator', 'results', 
    `task-${taskId}-verification.yaml`
  );
  
  if (!force) {
    const report = readYaml(reportPath, VerificationReportSchema);
    if (report.overall !== 'PASSED') {
      throw new VerificationNotPassedError(report.failedChecks);
    }
  }
}
```

### Step 2: Archive Task

Create archive folder with all artifacts:

```
.orchestra/orchestrator/results/task-003/
├── metadata.json           # Completion metadata
├── current-task.md         # Original task handover
├── completion-signal.md    # Filled signal from implementor
├── verification-report.yaml # Verification results
└── verification/           # Task artifacts
    ├── y_axis_config.dart  # Copy of created file
    └── y_axis_config_test.dart
```

#### metadata.json

```json
{
  "task_id": 3,
  "title": "Create YAxisConfig Model",
  "category": "INTEGRATION",
  "completed_at": "2025-12-01T15:00:00Z",
  "attempts": 1,
  "duration_minutes": 45,
  "commit": "abc1234",
  "verification": {
    "overall": "PASSED",
    "blocking_passed": 3,
    "major_passed": 2,
    "minor_passed": 1
  },
  "files_created": [
    "lib/src/models/y_axis_config.dart",
    "test/unit/y_axis_config_test.dart"
  ],
  "speckit_tasks_completed": [
    "SPEC-011-3.1",
    "SPEC-011-3.2"
  ]
}
```

### Step 3: Update Progress

```yaml
# .orchestra/orchestrator/.orchestrator-only/progress.yaml
current_task: null  # Will be set by prepare
current_phase: 1

summary:
  total: 12
  completed: 3      # Incremented
  in_progress: 0    # Decremented
  pending: 9
  failed: 0

tasks:
  3:
    status: "completed"
    attempts: 1
    started_at: "2025-12-01T14:15:00Z"
    completed_at: "2025-12-01T15:00:00Z"
    commit: "abc1234"
```

### Step 4: Update Manifest

```yaml
# .orchestra/orchestrator/.orchestrator-only/manifest.yaml
tasks:
  - id: 3
    status: "completed"     # Changed from "in-progress"
    commit: "abc1234"
```

### Step 5: Update SpecKit Traceability

If task has `speckit_tasks`, mark them complete in `specs/*/tasks.md`:

```typescript
async function updateSpeckitTasks(speckitTasks: string[]): Promise<void> {
  for (const taskRef of speckitTasks) {
    // Parse SPEC-011-3.1 → specs/011-*/tasks.md, item 3.1
    const { specId, itemId } = parseSpeckitRef(taskRef);
    const tasksFile = await findTasksFile(specId);
    await markComplete(tasksFile, itemId);
  }
}
```

### Step 6: Clear Handover (Post-Verification Closeout Steps 6h-6j)

Clear all handover artifacts to prepare for next task:

```typescript
async function clearHandover(taskId: number, archivePath: string): Promise<void> {
  // 6h: Archive handover folder first (already done in Step 2)
  console.log('Clearing handover folder...');
  
  // 6i: Clear completion signal
  const signalPath = '.orchestra/handover/completion-signal.md';
  if (fs.existsSync(signalPath)) {
    fs.unlinkSync(signalPath);
    console.log('  ✓ Cleared completion-signal.md');
  }
  
  // 6j: Clear pre-signal artifact (CRITICAL)
  const preSignalPath = '.orchestra/handover/verification/pre-signal.yaml';
  if (fs.existsSync(preSignalPath)) {
    fs.unlinkSync(preSignalPath);
    console.log('  ✓ Cleared pre-signal.yaml');
  }
  
  // Clear current task
  const taskPath = '.orchestra/handover/current-task.md';
  if (fs.existsSync(taskPath)) {
    fs.unlinkSync(taskPath);
    console.log('  ✓ Cleared current-task.md');
  }
  
  // Clear verification folder (except pre-signal which was already deleted)
  const verificationDir = '.orchestra/handover/verification';
  if (fs.existsSync(verificationDir)) {
    const files = fs.readdirSync(verificationDir);
    for (const file of files) {
      fs.unlinkSync(path.join(verificationDir, file));
    }
    console.log(`  ✓ Cleared ${files.length} verification file(s)`);
  }
  
  // Keep task-context.md (will be updated by prepare)
  // Keep templates folder
}
```

**Why clearing pre-signal.yaml matters:**
- Prevents stale artifacts from passing `accept-signal` on next task
- Forces implementor to run fresh pre-signal check for each task
- Part of the "trust but verify" workflow

### Step 7: Git Commit (if enabled)

```bash
# Stage all changes
git add .

# Commit with message
git commit -m "feat(orchestra): Task 3 - Create YAxisConfig Model

- Created lib/src/models/y_axis_config.dart
- Created test/unit/y_axis_config_test.dart
- All verification checks passed

Orchestra: Task 3/12 complete"

# Push if requested
git push origin HEAD
```

### Step 8: Prepare Next Task (if enabled)

```typescript
if (prepareNext) {
  const nextTaskId = findNextPendingTask(manifest);
  if (nextTaskId) {
    await prepareTask(nextTaskId);
  } else {
    // Check if sprint complete
    if (allTasksComplete(manifest)) {
      await handleSprintComplete(manifest);
    }
  }
}
```

## Output

### Success (Human)

```
Task Completed
─────────────────────────────────────────
Task: 3 - Create YAxisConfig Model
Status: ✓ COMPLETED

Archived:
  ✓ .orchestra/orchestrator/results/task-003/
  ✓ metadata.json
  ✓ verification-report.yaml
  ✓ Artifacts copied

Progress:
  ✓ progress.yaml updated (3/12 complete)
  ✓ manifest.yaml updated

SpecKit:
  ✓ SPEC-011-3.1 marked complete
  ✓ SPEC-011-3.2 marked complete

Git:
  ✓ Committed: abc1234
  ✓ Message: "feat(orchestra): Task 3 - Create YAxisConfig Model"

Next Task: 4 - Create YAxisConfigCollection
  → Run 'orchestra prepare' or handover is ready
```

### Sprint Complete (Human)

```
Sprint Completed!
─────────────────────────────────────────
Sprint: 011-multi-axis-normalization
Tasks: 16/16 complete

Summary:
  First-attempt passes: 12
  Second-attempt passes: 3
  Third-attempt passes: 1
  Escalations: 0

Duration: 5 days
Commits: 16

All verification checks passed.
Consider running retrospective review.
```

### JSON Output

```json
{
  "success": true,
  "task": {
    "id": 3,
    "title": "Create YAxisConfig Model",
    "status": "completed",
    "attempts": 1,
    "commit": "abc1234"
  },
  "archive_path": ".orchestra/orchestrator/results/task-003/",
  "progress": {
    "completed": 3,
    "total": 12,
    "remaining": 9
  },
  "speckit_tasks_completed": ["SPEC-011-3.1", "SPEC-011-3.2"],
  "git": {
    "committed": true,
    "commit_hash": "abc1234",
    "pushed": false
  },
  "next_task": {
    "id": 4,
    "title": "Create YAxisConfigCollection",
    "prepared": true
  }
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Task not in progress |
| 2 | Verification not passed |
| 3 | Archive failed |
| 4 | Git commit failed |
| 5 | SpecKit update failed |

## Examples

```bash
# Complete current task (uses config for commit behavior)
orchestra complete

# Complete with commit message
orchestra complete "feat: add YAxisConfig model"

# Complete and push
orchestra complete --push "feat: add YAxisConfig model"

# Complete without preparing next task
orchestra complete --no-next

# Force complete without verification
orchestra complete --force

# Skip git commit
orchestra complete --no-commit

# Complete specific task
orchestra complete --task 3

# JSON output
orchestra complete --json
```

## Commit Message Format

Default format (configurable in config.yaml):

```
{{type}}({{scope}}): Task {{task_id}} - {{title}}

{{body}}

Orchestra: Task {{task_id}}/{{total}} complete
```

Configuration:

```yaml
# .orchestra/config.yaml
git:
  commit:
    type: "feat"
    scope: "orchestra"
    include_files: true
    include_footer: true
```

## Implementation Notes

1. **Atomicity**: All updates succeed or all rollback
2. **Archive immutability**: Once archived, task folder is read-only
3. **Idempotency**: Completing already-complete task is no-op
4. **Backup**: Keep backup before clearing handover
5. **Metrics**: Track duration, attempts for sprint retrospective
