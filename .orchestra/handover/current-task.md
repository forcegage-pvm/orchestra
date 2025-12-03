# Task 7: Accept-Signal Command

## Overview

Implement the `orchestra accept-signal` command that verifies the implementor has properly signaled task completion by running their pre-signal check script. This is **Step 1** of Process 2 (Task Verification) and must pass before running `orchestra verify`.

## Objective

Create a CLI command that validates the implementor's pre-signal artifact to ensure they actually ran self-verification, all checks passed, the artifact is fresh, and the completion signal is filled out.

## Spec Files

📄 **Command spec**: `spec/implementation/phase-1-cli/commands/accept-signal.md`
📄 **Task spec**: *(Not created yet - command spec is primary source)*

Please read the command spec for full implementation details including code samples and all 6 verification checks.

## Acceptance Criteria

- [ ] `orchestra accept-signal` command is registered and callable
- [ ] Runs 6 checks: artifact exists, passed, task ID matches, not stale, completion signal filled, deliverables check passed
- [ ] Exit code 0 if all checks pass (ACCEPTED), exit code 1 if any check fails (REJECTED)
- [ ] `--task` option allows checking specific task (defaults to current in-progress task)
- [ ] `--max-age` option configures freshness threshold in minutes (default: 60)
- [ ] `--force` flag bypasses all checks (emergency only, logs warning)
- [ ] `--json` flag outputs structured JSON format
- [ ] `--verbose` flag shows detailed check output
- [ ] Human-readable output shows check results, pre-signal summary, and action guidance
- [ ] Pre-signal artifact details included in output when checks fail

## Dependencies

These tasks must be completed first:

- Task 2: Core Libraries (manifest, progress, types modules)


## File Operations

**IMPORTANT**: Use this exact table format for validation to pass:

| Action | File Path                                     | Purpose                                    |
| ------ | --------------------------------------------- | ------------------------------------------ |
| CREATE | `src/commands/accept-signal.ts`               | CLI command wrapper                        |
| CREATE | `src/core/signal.ts`                          | Core accept-signal logic (zero CLI deps)   |
| CREATE | `test/commands/accept-signal.test.ts`         | CLI command tests                          |
| CREATE | `test/core/signal.test.ts`                    | Core signal logic tests                    |
| UPDATE | `src/cli.ts`                                  | Register accept-signal command             |
| CREATE | `.orchestra/handover/verification/pre-signal.yaml` | Example artifact for tests (test fixture) |

## TDD Requirements

**Test-First Approach**: Write tests before implementing.

**Test Files**: 
- `test/commands/accept-signal.test.ts` - CLI integration tests
- `test/core/signal.test.ts` - Core logic unit tests

**Test Cases Required**:

**Core logic tests (`signal.test.ts`)** - Minimum 15 tests:
1. Check 1 (S1): Pre-signal artifact exists - PASS case
2. Check 1 (S1): Pre-signal artifact missing - FAIL with guidance
3. Check 2 (S2): Pre-signal status PASSED - PASS case
4. Check 2 (S2): Pre-signal status FAILED - FAIL with details
5. Check 3 (S3): Task ID matches - PASS case
6. Check 3 (S3): Task ID mismatch (stale artifact) - FAIL case
7. Check 4 (S4): Artifact fresh (< 60 minutes) - PASS case
8. Check 4 (S4): Artifact stale (> 60 minutes) - FAIL case
9. Check 4 (S4): Custom max-age threshold - PASS/FAIL scenarios
10. Check 5 (S5): Completion signal exists and filled - PASS case
11. Check 5 (S5): Completion signal missing - FAIL case
12. Check 5 (S5): Completion signal empty/template - FAIL case
13. Check 6 (S6): Deliverables check passed in pre-signal - PASS case
14. Check 6 (S6): Deliverables check failed in pre-signal - FAIL case
15. Overall: All checks pass → ACCEPTED
16. Overall: Any check fails → REJECTED
17. Force mode bypasses all checks

**CLI tests (`accept-signal.test.ts`)** - Minimum 8 tests:
1. Command registered and callable
2. `--task` option uses explicit task ID
3. Default uses current in-progress task
4. `--max-age` option configures freshness threshold
5. `--force` flag bypasses checks
6. `--json` flag outputs JSON format
7. `--verbose` flag shows detailed output
8. Exit code 0 (ACCEPTED) vs exit code 1 (REJECTED)

**Sample Test Data**:

```typescript
// Mock pre-signal artifact (PASSED)
const mockPreSignalPassed = {
  task_id: 7,
  timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
  status: 'PASSED',
  checks: {
    flutter_analyze: { status: 'PASSED', files_checked: 15, issues: 0 },
    flutter_test: { status: 'PASSED', tests_run: 42, tests_passed: 42, duration_ms: 3500 },
    deliverables: { status: 'PASSED', files_exist: ['src/commands/accept-signal.ts', 'test/commands/accept-signal.test.ts'] },
    completion_signal: { status: 'PASSED', filled_out: true, sections_complete: ['summary', 'artifacts_created', 'tests'] }
  }
};

// Mock pre-signal artifact (FAILED)
const mockPreSignalFailed = {
  task_id: 7,
  timestamp: new Date().toISOString(),
  status: 'FAILED',
  checks: {
    flutter_analyze: { status: 'FAILED', issues: 3 },
    flutter_test: { status: 'PASSED', tests_passed: 42 },
    deliverables: { status: 'PASSED' }
  }
};

// Mock pre-signal artifact (STALE)
const mockPreSignalStale = {
  task_id: 7,
  timestamp: new Date(Date.now() - 120 * 60 * 1000).toISOString(), // 2 hours ago
  status: 'PASSED',
  checks: { /* ... */ }
};

// Mock completion signal (filled)
const mockCompletionSignalFilled = `
## Summary
Implemented accept-signal command with all 6 checks.

## Artifacts Created
- src/commands/accept-signal.ts
- src/core/signal.ts
- test files

## Tests
23 tests, all passing
`;

// Mock completion signal (empty template)
const mockCompletionSignalEmpty = `
<!-- Implementor: Fill out sections below -->

## Summary

`;
```


## Implementation Details

### Files to Create

#### `src/commands/accept-signal.ts`

**What to create**: CLI command wrapper following existing command patterns

**Requirements**:
- Export `createAcceptSignalCommand()` function that returns a Commander Command
- Add options: `--task`, `--max-age`, `--force`, `--json`, `--verbose`
- Call `runAcceptSignal()` from core module (zero logic in CLI layer)
- Handle errors and exit codes: 0 (ACCEPTED), 1 (REJECTED), 2 (no task), 3 (no artifact)

**Code scaffold**:

```typescript
/**
 * Orchestra Accept-Signal Command
 * 
 * Aligned with Orchestra Bible v0.7.0
 * Verifies implementor completion signal (Process 2, Step 1).
 */

import { Command } from 'commander';
import { runAcceptSignal, type AcceptSignalOptions } from '../core/signal.js';

export function createAcceptSignalCommand(): Command {
  return new Command('accept-signal')
    .description('Verify implementor completion signal')
    .option('--task <id>', 'Task ID to check (default: current in-progress)')
    .option('--max-age <minutes>', 'Maximum artifact age in minutes', '60')
    .option('-f, --force', 'Accept signal without checks (emergency only)', false)
    .option('--json', 'Output JSON format', false)
    .option('-v, --verbose', 'Show detailed check output', false)
    .action(async (options: AcceptSignalOptions) => {
      await acceptSignalCommand(options);
    });
}

async function acceptSignalCommand(options: AcceptSignalOptions): Promise<void> {
  try {
    const result = await runAcceptSignal(options);
    
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      // Human-readable output (see command spec for format)
      printAcceptSignalReport(result, options.verbose);
    }
    
    process.exit(result.canVerify ? 0 : 1);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

function printAcceptSignalReport(result: SignalReport, verbose: boolean): void {
  // Format output according to spec examples
  // Show checks with ✓/✗, pre-signal summary, action guidance
}
```

---

#### `src/core/signal.ts`

**What to create**: Core accept-signal logic with ZERO CLI dependencies

**Requirements**:
- Implement all 6 checks as separate functions (S1-S6)
- `runAcceptSignal()`: orchestrates all checks, returns SignalReport
- `determineCurrentTask()`: gets task from --task option or progress.yaml
- All functions must work independently of CLI (importable by other modules)
- Use existing core utilities: `readYaml()`, `yamlExists()`, manifest/progress loaders

**6 Check Functions** (see command spec for full implementation):
1. `checkPreSignalExists()` - Check artifact file exists
2. `checkPreSignalPassed()` - Check status is 'PASSED'
3. `checkCorrectTaskId()` - Verify task ID matches
4. `checkNotStale()` - Check timestamp freshness
5. `checkCompletionSignalFilled()` - Validate completion-signal.md filled
6. `checkDeliverablesInPreSignal()` - Check deliverables section passed

**Code scaffold**:

```typescript
/**
 * Accept-Signal Core Logic
 *
 * Process 2, Step 1: Verify implementor completion signal
 * ZERO CLI dependencies - pure logic functions.
 */

import * as fs from 'fs';
import * as path from 'path';
import { readYaml, yamlExists } from './yaml.js';
import { loadProgress } from './progress.js';
import { z } from 'zod';

// Types
export interface AcceptSignalOptions {
  task?: string;
  maxAge?: string;
  force?: boolean;
  json?: boolean;
  verbose?: boolean;
}

export interface CheckResult {
  id: string;
  check: string;
  passed: boolean;
  expected: string | number;
  actual: string | number;
  message?: string;
  details?: unknown;
  fix?: string;
}

export interface SignalReport {
  taskId: number;
  timestamp: string;
  overall: 'ACCEPTED' | 'REJECTED';
  checks: CheckResult[];
  canVerify: boolean;
  preSignalDetails?: PreSignalArtifact;
}

// Pre-signal artifact schema
const PreSignalSchema = z.object({
  task_id: z.number(),
  timestamp: z.string(),
  status: z.enum(['PASSED', 'FAILED']),
  checks: z.record(z.unknown())
});

type PreSignalArtifact = z.infer<typeof PreSignalSchema>;

/**
 * Main orchestration function
 */
export async function runAcceptSignal(options: AcceptSignalOptions): Promise<SignalReport> {
  // If force mode, bypass checks
  if (options.force) {
    console.warn('⚠ Force mode: Skipping all checks');
    // Return accepted report
  }
  
  // Determine task ID
  const taskId = await determineCurrentTask(options.task);
  
  // Run all checks
  const maxAge = parseInt(options.maxAge || '60', 10);
  const checks: CheckResult[] = [];
  
  checks.push(await checkPreSignalExists());
  
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

async function determineCurrentTask(explicitTaskId?: string): Promise<number> {
  if (explicitTaskId) {
    return parseInt(explicitTaskId, 10);
  }
  
  const progress = await loadProgress();
  return progress.current_task;
}

// Implement each check function (see command spec for details):
async function checkPreSignalExists(): Promise<CheckResult> { /* ... */ }
async function checkPreSignalPassed(): Promise<CheckResult> { /* ... */ }
async function checkCorrectTaskId(taskId: number): Promise<CheckResult> { /* ... */ }
async function checkNotStale(maxAge: number): Promise<CheckResult> { /* ... */ }
async function checkCompletionSignalFilled(): Promise<CheckResult> { /* ... */ }
async function checkDeliverablesInPreSignal(): Promise<CheckResult> { /* ... */ }
```

---

#### `test/commands/accept-signal.test.ts`

**What to create**: CLI integration tests (minimum 8 tests)

**Test structure**:
- Mock `runAcceptSignal()` from core module
- Test command registration and options parsing
- Verify exit codes (0 = accepted, 1 = rejected)
- Test JSON vs human output formats

**Code scaffold**:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { createAcceptSignalCommand } from '../../src/commands/accept-signal.js';

// Mock core module
vi.mock('../../src/core/signal.js', () => ({
  runAcceptSignal: vi.fn()
}));

describe('accept-signal command', () => {
  let command: Command;
  
  beforeEach(() => {
    command = createAcceptSignalCommand();
  });
  
  it('should be registered with correct name', () => {
    expect(command.name()).toBe('accept-signal');
  });
  
  it('should parse --task option', async () => {
    // Test --task option parsing
  });
  
  it('should parse --max-age option', async () => {
    // Test --max-age option
  });
  
  // Add remaining 5+ tests...
});
```

---

#### `test/core/signal.test.ts`

**What to create**: Core logic unit tests (minimum 15 tests)

**Test structure**:
- Mock filesystem operations (fs.existsSync, fs.readFileSync)
- Mock YAML reading (yamlExists, readYaml)
- Test each check function independently
- Test overall orchestration in `runAcceptSignal()`

**Code scaffold**:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as signal from '../../src/core/signal.js';

// Mock dependencies
vi.mock('fs');
vi.mock('../../src/core/yaml.js');

describe('accept-signal core logic', () => {
  describe('Check S1: Pre-signal artifact exists', () => {
    it('should pass when artifact exists', async () => {
      // Mock yamlExists to return true
      // Call checkPreSignalExists()
      // Expect passed: true
    });
    
    it('should fail when artifact missing', async () => {
      // Mock yamlExists to return false
      // Call checkPreSignalExists()
      // Expect passed: false, with fix guidance
    });
  });
  
  describe('Check S2: Pre-signal status PASSED', () => {
    // 2 tests: status PASSED (pass), status FAILED (fail with details)
  });
  
  // Implement remaining check tests (S3-S6)...
  
  describe('runAcceptSignal orchestration', () => {
    it('should return ACCEPTED when all checks pass', async () => {
      // Mock all checks passing
      // Expect overall: 'ACCEPTED', canVerify: true
    });
    
    it('should return REJECTED when any check fails', async () => {
      // Mock one check failing
      // Expect overall: 'REJECTED', canVerify: false
    });
  });
});
```

---

### Files to Update

#### `src/cli.ts`

**Current state**: Has stub for accept-signal command that just logs "not yet implemented"

**What to implement**:
- Import `createAcceptSignalCommand` from `./commands/accept-signal.js`
- Replace stub with `program.addCommand(createAcceptSignalCommand())`
- Remove the manual `.command('accept-signal')` block

**Code change**:

```typescript
// At top with other imports
import { createAcceptSignalCommand } from './commands/accept-signal.js';

// Replace existing stub with:
program.addCommand(createAcceptSignalCommand());

// DELETE this stub block:
// program
//   .command('accept-signal')
//   .description('Verify implementor completion signal')
//   .action(async () => {
//     console.log('Accept-signal command not yet implemented');
//   });
```

---

## Core Functions Available

From **Task 2 (Core Libraries)**, these functions are available for use:

### YAML Operations (`src/core/yaml.ts`)
- `readYaml<T>(filePath, schema)` - Read and validate YAML file
- `writeYaml<T>(filePath, data, schema)` - Write validated YAML
- `yamlExists(filePath)` - Check if YAML file exists
- `readYamlRaw(filePath)` - Read YAML without validation

### Progress Management (`src/core/progress.ts`)
- `loadProgress()` - Load progress.yaml with validation
- `updateTaskStatus(taskId, status, commit?)` - Update task status
- `getCurrentTask()` - Get current in-progress task ID

### Manifest Operations (`src/core/manifest.ts`)
- `loadManifest()` - Load manifest.yaml with validation
- `getTask(taskId)` - Get task by ID from manifest
- `getTasksByStatus(status)` - Filter tasks by status

### Types (`src/core/types.ts`)
- `Task`, `TaskStatus`, `TaskCategory` types
- `Progress`, `Manifest`, `Sprint` types
- All Zod schemas for validation

### Validation (`src/core/validation.ts`)
- `validateFileExists(path)` - Check file existence
- `validateFilesExist(paths[])` - Check multiple files
- `ValidationCheck` interface for check results

### Output Formatting (`src/core/output.ts`)
- `formatSuccess()`, `formatError()`, `formatWarning()` - Chalk formatting helpers

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
   .\.orchestra\implementor\.implementor-only\scripts\pre-signal-check.ps1 -TaskId 7
   ```

2. Update `.orchestra/handover/completion-signal.md` with:

   - Task ID and status
   - What was implemented
   - Test results
   - Any notes

3. Signal ready: Say "ready for review" or "task complete"

---

_This handover was generated by Orchestra. Do not read files in `.orchestra/orchestrator/.orchestrator-only/`._
