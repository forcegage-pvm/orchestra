# Task 9: Complete Command - Handover Document

## Task Overview
| Field | Value |
|-------|-------|
| Task ID | 9 |
| Title | Complete Command |
| Category | INFRASTRUCTURE |
| Status | not-started |
| Dependencies | Task 2 (Core Libraries), Task 8 (Verify Command) |
| Spec File | spec/implementation/phase-1-cli/tasks/1.7-complete-command.md |
| Command Spec | spec/implementation/phase-1-cli/commands/complete.md |

## Objective
Implement the `orchestra complete` command that performs post-verification closeout. This command archives task artifacts, updates progress/manifest, clears handover folder, and optionally commits changes. It implements Process 2 Steps 5-7 (PASS flow closeout).

## Acceptance Criteria
1. `orchestra complete` archives task to `.orchestra/orchestrator/results/task-NNN/`
2. Updates `progress.yaml` (status: completed, commit hash, completed_at)
3. Updates `manifest.yaml` (status: completed, commit hash)
4. Clears handover folder (completion-signal.md, current-task.md, pre-signal artifacts)
5. Optionally commits with `--commit` flag
6. Optionally pushes with `--push` flag
7. Validates verification passed before completing (unless `--force`)
8. Exit code 0 on success

## File Operations

| Operation | File Path | Purpose |
|-----------|-----------|---------|
| CREATE | `src/commands/complete.ts` | CLI command wrapper with options |
| CREATE | `src/core/complete.ts` | Core completion logic (zero CLI deps) |
| CREATE | `test/commands/complete.test.ts` | CLI and core tests |
| UPDATE | `src/commands/index.ts` | Export complete command |
| UPDATE | `src/cli.ts` | Register complete command with program |

## Command Interface

### Usage
```
orchestra complete [options] [message]
```

### Options
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--task, -t` | number | current | Task ID to complete |
| `--commit` | boolean | false | Commit changes to git |
| `--no-commit` | boolean | false | Explicitly skip git commit |
| `--push` | boolean | false | Push after commit |
| `--force` | boolean | false | Complete without verification check |
| `--no-next` | boolean | false | Don't prepare next task |
| `--json` | boolean | false | Output JSON format |
| `--verbose, -v` | boolean | false | Verbose output |

### Arguments
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `message` | string | No | Commit message (if --commit) |

### Exit Codes
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Task not in progress |
| 2 | Verification not passed |
| 3 | Archive failed |
| 4 | Git commit failed |

## TDD Requirements

### Test Structure
```
test/commands/complete.test.ts
├── describe('complete command')
│   ├── describe('command registration')
│   │   ├── it('registers with correct name')
│   │   ├── it('has --task option')
│   │   ├── it('has --commit flag')
│   │   ├── it('has --push flag')
│   │   ├── it('has --force flag')
│   │   ├── it('has --no-next flag')
│   │   └── it('has --json and --verbose flags')
│   ├── describe('precondition validation')
│   │   ├── it('requires verification passed (unless --force)')
│   │   ├── it('allows force completion without verification')
│   │   ├── it('requires task in progress')
│   │   └── it('fails if no current task')
│   ├── describe('archive creation')
│   │   ├── it('creates task archive directory')
│   │   ├── it('copies handover artifacts')
│   │   ├── it('creates metadata.json')
│   │   └── it('copies verification report')
│   ├── describe('progress update')
│   │   ├── it('updates progress.yaml status')
│   │   ├── it('records commit hash')
│   │   └── it('sets completed_at timestamp')
│   ├── describe('manifest update')
│   │   ├── it('updates manifest status to completed')
│   │   └── it('records commit in manifest')
│   ├── describe('handover clearing')
│   │   ├── it('clears completion-signal.md')
│   │   ├── it('clears current-task.md')
│   │   ├── it('clears pre-signal artifacts')
│   │   └── it('preserves task-context.md')
│   ├── describe('git operations')
│   │   ├── it('commits when --commit flag set')
│   │   ├── it('uses provided commit message')
│   │   ├── it('pushes when --push flag set')
│   │   └── it('skips commit without --commit')
│   └── describe('exit codes')
│       ├── it('returns 0 on success')
│       ├── it('returns 1 if task not in progress')
│       ├── it('returns 2 if verification not passed')
│       └── it('returns 4 if git commit fails')
```

### Minimum Test Count: 25+

## Core Interfaces

### CompleteOptions
```typescript
export interface CompleteOptions {
  taskId?: number;
  commit?: boolean;
  push?: boolean;
  force?: boolean;
  noNext?: boolean;
  json?: boolean;
  verbose?: boolean;
  message?: string;
}
```

### CompleteResult
```typescript
export interface CompleteResult {
  taskId: number;
  taskTitle: string;
  status: 'completed' | 'failed';
  archivePath: string;
  commit?: string;
  pushed: boolean;
  progressUpdated: boolean;
  manifestUpdated: boolean;
  handoverCleared: boolean;
  exitCode: number;
}
```

### ArchiveMetadata
```typescript
export interface ArchiveMetadata {
  task_id: number;
  title: string;
  category: string;
  completed_at: string;
  attempts: number;
  duration_minutes?: number;
  commit?: string;
  verification: {
    overall: 'PASSED' | 'FAILED';
    checks_passed: number;
    checks_failed: number;
  };
  files_created: string[];
}
```

## Implementation Flow

### Execution Sequence
```
1. Parse options
2. Resolve task ID (from --task or current-task.md)
3. Validate preconditions:
   - Task exists and is in progress
   - Verification passed (unless --force)
4. Create archive:
   - Create results/task-NNN/ directory
   - Copy handover artifacts
   - Copy verification report
   - Create metadata.json
5. Update progress.yaml:
   - Set status: completed
   - Record commit hash
   - Set completed_at timestamp
6. Update manifest.yaml:
   - Set status: completed
   - Record commit hash
7. Clear handover:
   - Delete completion-signal.md
   - Delete current-task.md
   - Delete pre-signal artifacts
   - Keep task-context.md
8. Git operations (if --commit):
   - Stage all changes
   - Commit with message
   - Push if --push
9. Return result with exit code
```

## Code Scaffolds

### src/commands/complete.ts
```typescript
import { Command } from 'commander';
import { runComplete, CompleteOptions } from '../core/complete.js';

export function createCompleteCommand(): Command {
  const command = new Command('complete')
    .description('Complete the current task after verification')
    .argument('[message]', 'Commit message (if --commit)')
    .option('-t, --task <id>', 'Task ID to complete', parseInt)
    .option('--commit', 'Commit changes to git', false)
    .option('--no-commit', 'Skip git commit')
    .option('--push', 'Push after commit', false)
    .option('--force', 'Complete without verification check', false)
    .option('--no-next', 'Don\'t prepare next task', false)
    .option('--json', 'Output JSON format', false)
    .option('-v, --verbose', 'Verbose output', false)
    .action(async (message: string | undefined, options) => {
      try {
        const result = await runComplete({
          taskId: options.task,
          commit: options.commit,
          push: options.push,
          force: options.force,
          noNext: options.noNext,
          json: options.json,
          verbose: options.verbose,
          message,
        });
        
        process.exit(result.exitCode);
      } catch (error) {
        console.error('Execution error:', error);
        process.exit(4);
      }
    });

  return command;
}
```

### src/core/complete.ts (structure)
```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import { simpleGit } from 'simple-git';
import { getResolvedPaths, loadConfig } from './config.js';
import { loadManifest, updateManifestTask } from './manifest.js';
import { loadProgress, updateProgressTask } from './progress.js';
import { readYamlRaw, writeYaml } from './yaml.js';

export interface CompleteOptions { /* ... */ }
export interface CompleteResult { /* ... */ }
export interface ArchiveMetadata { /* ... */ }

/**
 * Main complete function - runs post-verification closeout
 */
export async function runComplete(options: CompleteOptions): Promise<CompleteResult> {
  // 1. Resolve task ID
  // 2. Validate preconditions
  // 3. Create archive
  // 4. Update progress.yaml
  // 5. Update manifest.yaml
  // 6. Clear handover
  // 7. Git operations
  // 8. Return result
}

/**
 * Validate completion preconditions
 */
async function validateComplete(
  taskId: number, 
  force: boolean, 
  paths: ResolvedPaths
): Promise<{ valid: boolean; error?: string; exitCode?: number }> {
  // Check task exists
  // Check task status is in_progress
  // Check verification passed (unless force)
}

/**
 * Create task archive with all artifacts
 */
async function createArchive(
  taskId: number,
  paths: ResolvedPaths
): Promise<string> {
  // Create results/task-NNN/ directory
  // Copy current-task.md
  // Copy completion-signal.md
  // Copy verification report
  // Create metadata.json
  return archivePath;
}

/**
 * Clear handover folder artifacts
 */
async function clearHandover(paths: ResolvedPaths): Promise<void> {
  // Delete completion-signal.md
  // Delete current-task.md
  // Delete pre-signal artifacts
  // Keep task-context.md
}

/**
 * Git commit and push if requested
 */
async function gitOperations(
  commit: boolean,
  push: boolean,
  message: string,
  cwd: string
): Promise<{ commitHash?: string; pushed: boolean }> {
  if (!commit) return { pushed: false };
  
  const git = simpleGit(cwd);
  await git.add('-A');
  const result = await git.commit(message);
  
  if (push) {
    await git.push();
    return { commitHash: result.commit, pushed: true };
  }
  
  return { commitHash: result.commit, pushed: false };
}
```

## Existing Code to Leverage

### From Task 2 (core libraries)
- `src/core/config.ts` - `getResolvedPaths()`, `loadConfig()`
- `src/core/manifest.ts` - `loadManifest()`, task management
- `src/core/progress.ts` - `loadProgress()`, task tracking
- `src/core/yaml.ts` - YAML read/write utilities

### From Task 5 (closeout command)
- `src/core/closeout.ts` - Similar check patterns, git operations with simple-git

### From Task 8 (verify command)
- Verification report reading patterns

## Verification Criteria (for task-009.yaml)

```yaml
checks:
  - id: F1
    type: file_exists
    path: "src/commands/complete.ts"
    severity: critical
    
  - id: F2
    type: file_exists
    path: "src/core/complete.ts"
    severity: critical
    
  - id: F3
    type: file_exists
    path: "test/commands/complete.test.ts"
    severity: critical
    
  - id: P1
    type: pattern_match
    file: "src/commands/complete.ts"
    pattern: "export.*createCompleteCommand"
    severity: critical
    
  - id: P2
    type: pattern_match
    file: "src/core/complete.ts"
    pattern: "export.*async.*function.*runComplete"
    severity: critical
    
  - id: C1
    type: command
    command: "npx tsc --noEmit"
    expected_exit_code: 0
    severity: critical
    
  - id: C2
    type: command
    command: "npm test"
    expected_exit_code: 0
    severity: critical
```

## Implementation Notes

### Key Points
1. **Zero CLI deps in core**: `src/core/complete.ts` must not import commander
2. **Verification check**: Should call verification report, not re-run verify
3. **Archive immutability**: Once created, archive folder should not be modified
4. **Preserve task-context.md**: Don't delete, will be updated by next prepare
5. **simple-git usage**: Use same patterns as closeout.ts

### Handover Clearing Details
Files to DELETE:
- `.orchestra/handover/completion-signal.md`
- `.orchestra/handover/current-task.md`
- `.orchestra/implementor/artifacts/pre-signal/task-N-*.txt`
- `.orchestra/implementor/signals/task-N-*.yaml`

Files to KEEP:
- `.orchestra/handover/task-context.md`
- `.orchestra/handover/AGENT_README.md`

---

## Handover Checklist
- [x] Task ID and dependencies identified
- [x] All deliverables listed with purposes
- [x] Command interface fully specified
- [x] Core interfaces defined
- [x] TDD test structure outlined (25+ tests)
- [x] Implementation flow documented
- [x] Code scaffolds provided
- [x] Verification criteria specified
- [x] Handover clearing details explicit

---

*Generated: Process 1 Step 5 | Task 9 Handover*
