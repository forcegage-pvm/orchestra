# Task 8: Verify Command - Handover Document

## Task Overview
| Field | Value |
|-------|-------|
| Task ID | 8 |
| Title | Verify Command |
| Category | INFRASTRUCTURE |
| Status | not-started |
| Dependencies | Task 2 (Core Libraries), Task 7 (Accept-Signal Command) |
| Spec File | spec/implementation/phase-1-cli/tasks/1.6-verify-command.md |
| Command Spec | spec/implementation/phase-1-cli/commands/verify.md |

## Objective
Implement the `orchestra verify` command that runs verification checks from YAML criteria files. This command implements Process 2 Steps 2-4 of the orchestration workflow (loading verification YAML, executing checks, reporting results).

## Acceptance Criteria
1. `orchestra verify` runs checks from verification YAML (`verification/task-NNN.yaml`)
2. Runs `accept-signal` first (unless `--skip-accept` provided)
3. Supports check types: `file_exists`, `dir_exists`, `pattern_match`, `command`, `screenshot_exists`, `json_valid`, `yaml_valid`, `export_exists`
4. Generates verification report saved to `.orchestra/reports/verification/`
5. Exit code 0 if all checks pass, 1 if any fail
6. Additional exit codes: 2 (no task), 3 (criteria not found), 4 (execution error)

## Deliverables

### File Operations
| Operation | File Path | Purpose |
|-----------|-----------|---------|
| CREATE | `src/commands/verify.ts` | CLI command wrapper with options/flags |
| CREATE | `src/core/verification.ts` | Core verification logic (check execution) |
| CREATE | `test/commands/verify.test.ts` | CLI command tests |
| UPDATE | `src/commands/index.ts` | Export verify command |
| UPDATE | `src/index.ts` | Register verify command with program |

## Command Interface

### Usage
```
orchestra verify [options]
```

### Options
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--task, -t` | number | auto-detect | Task ID to verify |
| `--check, -c` | string[] | all | Specific check IDs to run |
| `--severity` | string | "all" | Filter by severity (critical/warning/info) |
| `--continue-on-error` | boolean | false | Continue after check failure |
| `--skip-accept` | boolean | false | Skip accept-signal check |
| `--json` | boolean | false | Output JSON format |
| `--verbose, -v` | boolean | false | Verbose output |

### Exit Codes
| Code | Meaning |
|------|---------|
| 0 | All checks passed |
| 1 | One or more checks failed |
| 2 | No current task (no handover) |
| 3 | Verification criteria not found |
| 4 | Execution error |

## Check Types Specification

### file_exists
```yaml
- id: F1
  type: file_exists
  description: "Command file exists"
  path: "src/commands/verify.ts"
  severity: critical
```

### dir_exists
```yaml
- id: D1
  type: dir_exists
  description: "Reports directory exists"
  path: ".orchestra/reports/verification"
  severity: warning
```

### pattern_match
```yaml
- id: P1
  type: pattern_match
  description: "Function exported"
  file: "src/commands/verify.ts"
  pattern: "export.*function.*createVerifyCommand"
  severity: critical
```

### command
```yaml
- id: C1
  type: command
  description: "Tests pass"
  command: "npm test -- --grep verify"
  expected_exit_code: 0
  severity: critical
```

### screenshot_exists
```yaml
- id: S1
  type: screenshot_exists
  description: "Visual verification"
  path: "screenshots/task-008.png"
  severity: warning
```

### export_exists
```yaml
- id: E1
  type: export_exists
  description: "Module exports verification"
  module: "src/core/verification.ts"
  exports: ["runVerification", "VerificationReport"]
  severity: critical
```

## TDD Requirements

### Test Structure
```
test/commands/verify.test.ts
├── describe('verify command')
│   ├── describe('command registration')
│   │   ├── it('registers with correct name')
│   │   ├── it('has --task option')
│   │   ├── it('has --check option')
│   │   ├── it('has --severity option')
│   │   ├── it('has --continue-on-error flag')
│   │   ├── it('has --skip-accept flag')
│   │   └── it('has --json and --verbose flags')
│   ├── describe('check execution')
│   │   ├── it('executes file_exists checks')
│   │   ├── it('executes pattern_match checks')
│   │   ├── it('executes command checks')
│   │   ├── it('handles check failures')
│   │   └── it('continues on error when flag set')
│   ├── describe('accept-signal integration')
│   │   ├── it('runs accept-signal before verification')
│   │   ├── it('skips accept-signal with --skip-accept')
│   │   └── it('fails fast if accept-signal fails')
│   ├── describe('report generation')
│   │   ├── it('generates verification report')
│   │   ├── it('saves report to correct path')
│   │   └── it('includes all check results')
│   └── describe('exit codes')
│       ├── it('returns 0 when all pass')
│       ├── it('returns 1 when any fail')
│       ├── it('returns 2 when no task')
│       ├── it('returns 3 when criteria missing')
│       └── it('returns 4 on execution error')
```

### Minimum Test Count: 20+

## Core Interfaces

### VerificationOptions
```typescript
interface VerificationOptions {
  taskId?: number;
  checks?: string[];           // Specific check IDs
  severity?: 'critical' | 'warning' | 'info' | 'all';
  continueOnError?: boolean;
  skipAccept?: boolean;
  json?: boolean;
  verbose?: boolean;
}
```

### VerificationCheck
```typescript
interface VerificationCheck {
  id: string;
  type: 'file_exists' | 'dir_exists' | 'pattern_match' | 'command' | 
        'screenshot_exists' | 'json_valid' | 'yaml_valid' | 'export_exists';
  description: string;
  severity: 'critical' | 'warning' | 'info';
  // Type-specific fields
  path?: string;              // For file/dir/screenshot checks
  file?: string;              // For pattern_match
  pattern?: string;           // For pattern_match
  command?: string;           // For command checks
  expected_exit_code?: number; // For command checks
  module?: string;            // For export_exists
  exports?: string[];         // For export_exists
}
```

### CheckResult
```typescript
interface CheckResult {
  checkId: string;
  type: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
  duration: number;           // Milliseconds
}
```

### VerificationReport
```typescript
interface VerificationReport {
  taskId: number;
  taskTitle: string;
  timestamp: string;
  duration: number;           // Total milliseconds
  acceptSignal?: {
    passed: boolean;
    skipped: boolean;
    report?: SignalReport;    // From Task 7
  };
  checks: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  results: CheckResult[];
  overallPassed: boolean;
}
```

## Implementation Flow

### Execution Sequence
```
1. Parse options
2. Resolve task ID (from --task or current-task.md)
3. Load verification YAML (verification/task-{id}.yaml)
4. Unless --skip-accept: Run accept-signal check
   - If accept-signal fails and not --continue-on-error: Exit 1
5. Filter checks by --check and --severity
6. Execute each check in order
   - For each check: Execute → Record result → Continue/Stop
7. Aggregate results
8. Generate and save report
9. Output results (JSON or formatted)
10. Exit with appropriate code
```

### Check Execution Logic
```typescript
async function executeCheck(check: VerificationCheck): Promise<CheckResult> {
  const start = Date.now();
  
  switch (check.type) {
    case 'file_exists':
      return checkFileExists(check.path!, check, start);
    case 'dir_exists':
      return checkDirExists(check.path!, check, start);
    case 'pattern_match':
      return checkPatternMatch(check.file!, check.pattern!, check, start);
    case 'command':
      return checkCommand(check.command!, check.expected_exit_code ?? 0, check, start);
    case 'screenshot_exists':
      return checkFileExists(check.path!, check, start);
    case 'export_exists':
      return checkExports(check.module!, check.exports!, check, start);
    // ... other check types
  }
}
```

## Existing Code to Leverage

### From Task 7 (accept-signal)
- `src/core/signal.ts` - `runAcceptSignal()` function, `SignalReport` interface
- Pattern for check execution and result aggregation

### From Task 2 (core libraries)
- `src/core/validation.ts` - `validateFileExists()`, `validateFilesExist()` utilities
- `src/core/paths.ts` - Path resolution utilities
- `src/core/yaml.ts` - YAML parsing utilities (if exists)

## Code Scaffolds

### src/commands/verify.ts
```typescript
import { Command } from 'commander';
import { runVerification, VerificationOptions } from '../core/verification';

export function createVerifyCommand(): Command {
  const command = new Command('verify')
    .description('Run verification checks for a task')
    .option('-t, --task <id>', 'Task ID to verify', parseInt)
    .option('-c, --check <ids...>', 'Specific check IDs to run')
    .option('--severity <level>', 'Filter by severity', 'all')
    .option('--continue-on-error', 'Continue after failures', false)
    .option('--skip-accept', 'Skip accept-signal check', false)
    .option('--json', 'Output JSON format', false)
    .option('-v, --verbose', 'Verbose output', false)
    .action(async (options) => {
      try {
        const result = await runVerification({
          taskId: options.task,
          checks: options.check,
          severity: options.severity,
          continueOnError: options.continueOnError,
          skipAccept: options.skipAccept,
          json: options.json,
          verbose: options.verbose,
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

### src/core/verification.ts (structure)
```typescript
import { runAcceptSignal, SignalReport } from './signal';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';  // Already in package.json
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface VerificationOptions { /* ... */ }
export interface VerificationCheck { /* ... */ }
export interface CheckResult { /* ... */ }
export interface VerificationReport { /* ... */ }

export interface VerificationResult {
  report: VerificationReport;
  exitCode: number;
}

export async function runVerification(options: VerificationOptions): Promise<VerificationResult> {
  // 1. Resolve task ID
  // 2. Load verification YAML
  // 3. Run accept-signal (unless skipped)
  // 4. Execute checks
  // 5. Generate report
  // 6. Return result with exit code
}

// Check executor functions
async function checkFileExists(filePath: string, check: VerificationCheck, startTime: number): Promise<CheckResult>;
async function checkDirExists(dirPath: string, check: VerificationCheck, startTime: number): Promise<CheckResult>;
async function checkPatternMatch(file: string, pattern: string, check: VerificationCheck, startTime: number): Promise<CheckResult>;
async function checkCommand(cmd: string, expectedExit: number, check: VerificationCheck, startTime: number): Promise<CheckResult>;
async function checkExports(module: string, exports: string[], check: VerificationCheck, startTime: number): Promise<CheckResult>;
```

## Verification Criteria (for this task)

To be added to `verification/task-008.yaml`:
```yaml
task_id: 8
task_title: "Verify Command"
created_at: "{{timestamp}}"
checks:
  - id: F1
    type: file_exists
    description: "Command file exists"
    path: "src/commands/verify.ts"
    severity: critical
    
  - id: F2
    type: file_exists
    description: "Core verification module exists"
    path: "src/core/verification.ts"
    severity: critical
    
  - id: F3
    type: file_exists
    description: "Test file exists"
    path: "test/commands/verify.test.ts"
    severity: critical
    
  - id: P1
    type: pattern_match
    description: "Command function exported"
    file: "src/commands/verify.ts"
    pattern: "export.*createVerifyCommand"
    severity: critical
    
  - id: P2
    type: pattern_match
    description: "runVerification function exported"
    file: "src/core/verification.ts"
    pattern: "export.*runVerification"
    severity: critical
    
  - id: P3
    type: pattern_match
    description: "VerificationReport interface exported"
    file: "src/core/verification.ts"
    pattern: "export.*interface.*VerificationReport"
    severity: critical
    
  - id: C1
    type: command
    description: "All tests pass"
    command: "npm test"
    expected_exit_code: 0
    severity: critical
    
  - id: C2
    type: command
    description: "TypeScript compiles"
    command: "npx tsc --noEmit"
    expected_exit_code: 0
    severity: critical
```

## Implementation Notes

### Key Distinctions
- **validation.ts** (existing): Validates handover structure, signals, artifacts
- **verification.ts** (NEW): Executes check types from YAML, generates reports

### Accept-Signal Integration
The verify command should call `runAcceptSignal()` from Task 7 before executing checks:
```typescript
if (!options.skipAccept) {
  const signalResult = await runAcceptSignal({ taskId, verbose: options.verbose });
  if (!signalResult.overallPassed && !options.continueOnError) {
    return { report, exitCode: 1 };
  }
}
```

### Report Storage
Save verification reports to: `.orchestra/reports/verification/task-{id}-{timestamp}.json`

---

## Handover Checklist
- [x] Task ID and dependencies identified
- [x] All deliverables listed with purposes
- [x] Command interface fully specified
- [x] Check types documented with YAML examples
- [x] Core interfaces defined
- [x] TDD test structure outlined (20+ tests)
- [x] Implementation flow documented
- [x] Code scaffolds provided
- [x] Verification criteria specified

---

*Generated: Process 1 Step 5 | Task 8 Handover*
