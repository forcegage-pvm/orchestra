# Task 5: Closeout Command

## Overview

Implement the `orchestra closeout` command that verifies the previous task is fully closed out before preparing a new task. This is Step 0 of Process 1 (Handover Creation).

## Objective

Verify previous task completion through 6 automated checks and provide auto-fix capability for common issues.

## Spec Files

📄 **Task spec**: `spec/implementation/phase-1-cli/tasks/1.4a-closeout-command.md` (does not exist - use command spec)
📄 **Command spec**: `spec/implementation/phase-1-cli/commands/closeout.md`

Please read the spec file(s) for full implementation details including code samples.

## Acceptance Criteria

- [ ] `orchestra closeout` runs 6 checks (C1-C6)
- [ ] Check C1: No uncommitted changes
- [ ] Check C2: Previous task status = "completed"
- [ ] Check C3: Commit hash recorded in progress.yaml
- [ ] Check C4: SpecKit tasks.md checkboxes checked
- [ ] Check C5: Completion signal cleared
- [ ] Check C6: Results file exists
- [ ] Exit code 0 if all pass, 1 if any fail
- [ ] `--fix` attempts auto-repair (C1, C5 auto-fixable)
- [ ] `--force` skips checks (with warning)
- [ ] `--json` outputs valid JSON structure
- [ ] `--verbose` shows detailed check results
- [ ] First task handling (no previous task = pass with N/A)

## Dependencies

These tasks must be completed first:

- Task 2: Core Libraries (for config, manifest, progress, errors modules)

## File Operations

**IMPORTANT**: Use this exact table format for validation to pass:

| Action | File Path                        | Purpose                                   |
| ------ | -------------------------------- | ----------------------------------------- |
| CREATE | `src/commands/closeout.ts`       | CLI command with options and action       |
| CREATE | `src/core/closeout.ts`           | Reusable closeout logic (NO CLI deps)     |
| CREATE | `test/commands/closeout.test.ts` | Comprehensive tests (20+ test cases)      |

## TDD Requirements

**Test-First Approach**: Write tests before implementing.

**Test File**: `test/commands/closeout.test.ts`

**Test Cases Required** (aim for 20+):

1. Command definition (name, options, description)
2. C1 check passes when git clean
3. C1 check fails when uncommitted files exist
4. C1 auto-fix with --fix (commits changes)
5. C2 check passes when previous task status = completed
6. C2 check fails when previous task status != completed
7. C3 check passes when commit hash present
8. C3 check fails when commit hash missing
9. C4 check passes when SpecKit tasks checked
10. C4 check fails when SpecKit tasks unchecked
11. C4 skips when no speckit_task_ref
12. C5 check passes when signal file cleared
13. C5 check fails when signal has content
14. C5 auto-fix with --fix (deletes signal file)
15. C6 check passes when results file exists
16. C6 check fails when results file missing
17. First task handling (no previous task, most checks N/A)
18. --force skips all checks
19. --json outputs valid JSON structure
20. --verbose shows detailed output
21. Exit code 0 when all pass
22. Exit code 1 when any fail

**Sample Test Data**:

```typescript
// Mock progress.yaml state
const mockProgressCompleted = {
  current_task: 5,
  tasks: {
    4: {
      id: 4,
      status: 'completed',
      started_at: '2025-12-01T10:00:00Z',
      completed_at: '2025-12-01T12:00:00Z',
      completed_commit: 'abc1234def5678'
    }
  }
};

const mockProgressIncomplete = {
  current_task: 5,
  tasks: {
    4: {
      id: 4,
      status: 'in-progress',
      started_at: '2025-12-01T10:00:00Z'
    }
  }
};

// Mock git status
const mockGitClean = { files: [] };
const mockGitDirty = {
  files: [
    { path: 'src/test.ts', working_dir: 'M' },
    { path: 'README.md', working_dir: 'M' }
  ]
};

// Expected check result structure
interface CheckResult {
  id: string;
  check: string;
  passed: boolean;
  expected: string;
  actual: string;
  fix?: string;
  fixError?: string;
}

// Expected report structure
interface CloseoutReport {
  taskId: number | null;
  timestamp: string;
  overall: 'PASSED' | 'FAILED';
  checks: CheckResult[];
  canProceed: boolean;
}
```

## Implementation Details

### Files to Create

#### src/commands/closeout.ts

**What to create**:

- Command definition with 5 options (--task, --fix, --force, --json, --verbose)
- CLI entrypoint that calls core closeout logic
- Output formatting (human-readable and JSON)
- Exit code handling (0=pass, 1=fail)

**Code scaffold**:

```typescript
import { Command } from 'commander';
import { runCloseoutChecks, attemptAutoFix } from '../core/closeout.js';

export interface CloseoutOptions {
  task?: number;
  fix?: boolean;
  force?: boolean;
  json?: boolean;
  verbose?: boolean;
}

export function createCloseoutCommand(): Command {
  return new Command('closeout')
    .description('Verify previous task fully closed before preparing next task')
    .option('--task <id>', 'Task ID to check (default: previous)', parseInt)
    .option('--fix', 'Attempt to auto-fix issues')
    .option('--force', 'Skip closeout check (use with caution)')
    .option('--json', 'Output JSON format')
    .option('--verbose', 'Show detailed check output')
    .action(async (options: CloseoutOptions) => {
      await runCloseout(options);
    });
}

export async function runCloseout(options: CloseoutOptions): Promise<void> {
  try {
    // 1. Determine previous task ID
    // 2. Run closeout checks
    // 3. If --fix, attempt auto-repair
    // 4. Output results (human or JSON)
    // 5. Exit with appropriate code
  } catch (error) {
    // Handle errors
  }
}
```

#### src/core/closeout.ts

**What to create**:

- 6 check functions (checkUncommittedChanges, checkPreviousTaskStatus, checkCommitHashRecorded, checkSpecKitTasks, checkCompletionSignalCleared, checkResultsFileExists)
- runCloseoutChecks() to execute all checks
- attemptAutoFix() for auto-fixable checks (C1, C5)
- TypeScript interfaces (CloseoutReport, CheckResult)
- NO CLI dependencies (reusable library)

**Code scaffold**:

```typescript
import simpleGit from 'simple-git';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadProgress } from './progress.js';
import { loadManifest } from './manifest.js';

export interface CheckResult {
  id: string;
  check: string;
  passed: boolean;
  expected: string;
  actual: string;
  fix?: string;
  fixError?: string;
}

export interface CloseoutReport {
  taskId: number | null;
  timestamp: string;
  overall: 'PASSED' | 'FAILED';
  checks: CheckResult[];
  canProceed: boolean;
}

export async function runCloseoutChecks(
  orchestraRoot: string,
  taskId?: number
): Promise<CloseoutReport> {
  const checks: CheckResult[] = [];
  
  // Run all 6 checks
  checks.push(await checkUncommittedChanges());
  
  if (taskId !== null && taskId !== undefined) {
    checks.push(await checkPreviousTaskStatus(orchestraRoot, taskId));
    checks.push(await checkCommitHashRecorded(orchestraRoot, taskId));
    checks.push(await checkSpecKitTasks(orchestraRoot, taskId));
    checks.push(await checkResultsFileExists(orchestraRoot, taskId));
  }
  
  checks.push(await checkCompletionSignalCleared(orchestraRoot));
  
  const allPassed = checks.every(c => c.passed);
  
  return {
    taskId: taskId ?? null,
    timestamp: new Date().toISOString(),
    overall: allPassed ? 'PASSED' : 'FAILED',
    checks,
    canProceed: allPassed
  };
}

async function checkUncommittedChanges(): Promise<CheckResult> {
  // Implementation from spec
}

async function checkPreviousTaskStatus(orchestraRoot: string, taskId: number): Promise<CheckResult> {
  // Implementation from spec
}

async function checkCommitHashRecorded(orchestraRoot: string, taskId: number): Promise<CheckResult> {
  // Implementation from spec
}

async function checkSpecKitTasks(orchestraRoot: string, taskId: number): Promise<CheckResult> {
  // Implementation from spec
}

async function checkCompletionSignalCleared(orchestraRoot: string): Promise<CheckResult> {
  // Implementation from spec
}

async function checkResultsFileExists(orchestraRoot: string, taskId: number): Promise<CheckResult> {
  // Implementation from spec
}

export async function attemptAutoFix(
  orchestraRoot: string,
  checks: CheckResult[]
): Promise<CheckResult[]> {
  // Auto-fix C1 (git commit) and C5 (delete signal)
  // Return updated checks array
}
```

#### test/commands/closeout.test.ts

**What to create**:

- Test suite with 20+ tests covering all checks
- Mock filesystem and git operations
- Test auto-fix functionality
- Test JSON output
- Test error handling

**Code scaffold**:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCloseoutCommand, runCloseout } from '../../src/commands/closeout.js';
import { runCloseoutChecks } from '../../src/core/closeout.js';

describe('closeout command', () => {
  describe('command definition', () => {
    it('should have correct name and options', () => {
      const cmd = createCloseoutCommand();
      expect(cmd.name()).toBe('closeout');
      // Test options
    });
  });
  
  describe('check C1: uncommitted changes', () => {
    it('should pass when git is clean', async () => {
      // Mock clean git
      // Run check
      // Assert passed
    });
    
    it('should fail when uncommitted files exist', async () => {
      // Mock dirty git
      // Run check
      // Assert failed
    });
    
    it('should auto-fix with --fix flag', async () => {
      // Mock dirty git
      // Run with --fix
      // Assert auto-commit happened
    });
  });
  
  // Repeat for C2-C6
  
  describe('first task handling', () => {
    it('should pass with N/A for checks when no previous task', async () => {
      // Mock taskId = null
      // Run checks
      // Assert C2-C4, C6 show N/A
    });
  });
  
  describe('JSON output', () => {
    it('should output valid JSON with --json', async () => {
      // Run with --json
      // Parse output
      // Assert structure
    });
  });
});
```

## Core Functions Available

From Task 2 (Core Libraries):

- `loadProgress(orchestraRoot: string): Promise<OrchestraProgress>` - Load progress.yaml
- `saveProgress(orchestraRoot: string, progress: OrchestraProgress): Promise<void>` - Save progress.yaml
- `loadManifest(orchestraRoot: string): Promise<OrchestraManifest>` - Load manifest.yaml
- `loadConfig(orchestraRoot: string): Promise<OrchestraConfig>` - Load config
- `findOrchestraRoot(): string | null` - Find .orchestra directory
- `FileError`, `ValidationError` - Error classes

From npm dependencies:

- `simple-git` - Git operations already installed
- `commander` - CLI framework already installed

## ⚠️ BEFORE YOU START - MANDATORY VALIDATION

**STOP! Before implementing anything, validate this handover:**

```powershell
.\.orchestra\implementor\.implementor-only\scripts\validate-handover.ps1
```

If validation **FAILS**:

- Document issues in `.orchestra/handover/completion-signal.md`
- Say: "Task validation failed - see completion-signal.md"
- **STOP** and wait for orchestrator to fix

If validation **PASSES**: Proceed with implementation.

---

## Quality Gates

Before signaling completion:

1. **Build**: `npm run build` must succeed
2. **Type check**: `npx tsc --noEmit` must pass
3. **Tests**: `npm test` must pass all tests
4. **Lint**: `npm run lint` must pass (if configured)

## Completion Protocol

When ready for review:

1. Run pre-signal check:

   ```powershell
   .\.orchestra\implementor\.implementor-only\scripts\pre-signal-check.ps1 -TaskId 5
   ```

2. Update `.orchestra/handover/completion-signal.md` with:

   - Task ID and status
   - What was implemented
   - Test results
   - Any notes

3. Signal ready: Say "ready for review" or "task complete"

---

_This handover was generated by Orchestra. Do not read files in `.orchestra/orchestrator/.orchestrator-only/`._
