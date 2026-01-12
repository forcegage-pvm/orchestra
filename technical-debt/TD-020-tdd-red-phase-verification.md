# TD-020: TDD Red Phase Verification Support

**Status**: DRAFT  
**Priority**: P1 (Blocks TDD workflow)  
**Category**: Feature Enhancement  
**Created**: 2026-01-12

---

## Problem Statement

Orchestra's current verification system requires ALL tests to pass during pre-signal checks. This is fundamentally incompatible with TDD red phase tasks where the explicit requirement is to write a test that MUST fail.

### Current Behavior (Broken)

```
Task: "Add TDD red phase test for feature X"
  Requirement: Test MUST fail
  Pre-signal check: ALL tests must pass
  Result: IMPOSSIBLE TO COMPLETE ❌
```

### Core Issue

The "all tests pass" requirement exists to prevent regressions - an implementor breaking existing functionality. But TDD red phase requires:
- ✅ ONE specific new test fails (by design)
- ✅ ALL other existing tests pass (no regressions)
- ✅ The new test fails for the CORRECT reason

We need **surgical test isolation**, not blanket "allow all failures".

---

## Proposed Solution: Tagged Test Exclusion

Use test framework tagging to isolate intentionally-failing tests from regression checks.

### Solution Overview

1. **Red phase tests** are tagged with `@Tags(['tdd-red'])` (Dart) or placed in `test/tdd-red/` (TypeScript)
2. **`prepare_task` ALWAYS cleans up** any existing tdd-red markers before preparing any task (orchestrator commits cleanup)
3. **Verification** runs two separate test commands for red-phase tasks:
   - `test --tags tdd-red` → MUST fail (exit code 1)
   - `test --exclude-tags tdd-red` → MUST pass (exit code 0)
4. **Pre-signal checks** run same verification as orchestrator
5. Per-task `tdd_red_phase` flag controls which verification mode applies

### State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│                     TDD RED-GREEN LIFECYCLE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  EVERY TASK PREPARE (regardless of tdd_red_phase):              │
│  ├─ Check for existing tdd-red markers                          │
│  ├─ IF found: orchestrator removes them, commits cleanup        │
│  └─ Proceed with normal prepare                                 │
│                                                                 │
│  Task N (RED): tdd_red_phase = true                             │
│  ├─ Starts with clean workspace (no stale tdd-red)              │
│  ├─ Implementor adds test with @Tags(['tdd-red'])               │
│  ├─ Pre-signal check:                                           │
│  │   ✅ test --tags tdd-red → exit 1 (fails correctly)          │
│  │   ✅ test --exclude-tags tdd-red → exit 0 (no regressions)   │
│  ├─ Verification:                                               │
│  │   ✅ At least 1 file contains tdd-red marker                 │
│  │   ✅ Tagged tests fail                                       │
│  └─ COMPLETE (tdd-red markers remain in codebase)               │
│                                                                 │
│  Task N+1 (any task, e.g., GREEN): prepare_task runs            │
│  ├─ Orchestrator detects tdd-red markers from Task N            │
│  ├─ Orchestrator removes markers, commits cleanup               │
│  ├─ Handover generated for clean workspace                      │
│  ├─ Implementor implements feature (tests now pass)             │
│  ├─ Pre-signal check:                                           │
│  │   ✅ No tdd-red markers exist                                │
│  │   ✅ test → exit 0 (all tests pass)                          │
│  └─ COMPLETE                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Design

### 1. Task Metadata Extension

Add optional `tdd_red_phase` flag to task schema:

**Database Schema** (`src/db/schema.ts`):

```typescript
// src/db/schema.ts
export const tasks = sqliteTable("tasks", {
  // ... existing fields
  tdd_red_phase: integer("tdd_red_phase", { mode: "boolean" }).default(false),
});

// src/core/types.ts
export const TaskSchema = z.object({
  // ... existing fields
  tdd_red_phase: z.boolean().default(false),
});
```

### 2. Prepare-Task Cleanup Logic (NEW)

**Every** `prepare_task` call cleans up stale tdd-red markers before preparing:

```typescript
// src/mcp-server/handlers/prepare-task.ts

async function cleanupTddRedMarkers(workspaceRoot: string): Promise<CleanupResult> {
  const language = detectProjectLanguage(workspaceRoot);
  
  if (language === 'dart') {
    // Find files with @Tags(['tdd-red'])
    const files = await glob('test/**/*.dart', { cwd: workspaceRoot });
    const markedFiles: string[] = [];
    
    for (const file of files) {
      const content = await fs.readFile(path.join(workspaceRoot, file), 'utf-8');
      if (content.includes("@Tags(['tdd-red'])")) {
        // Remove the tag annotation
        const cleaned = content.replace(/@Tags\(\['tdd-red'\]\)\s*/g, '');
        await fs.writeFile(path.join(workspaceRoot, file), cleaned);
        markedFiles.push(file);
      }
    }
    
    return { cleaned: markedFiles.length > 0, files: markedFiles };
  }
  
  if (language === 'typescript') {
    // Move files from test/tdd-red/ to test/unit/
    const tddRedDir = path.join(workspaceRoot, 'test', 'tdd-red');
    if (await fs.pathExists(tddRedDir)) {
      const files = await fs.readdir(tddRedDir);
      const movedFiles: string[] = [];
      
      for (const file of files) {
        if (file.endsWith('.test.ts')) {
          const src = path.join(tddRedDir, file);
          const dest = path.join(workspaceRoot, 'test', 'unit', file);
          await fs.move(src, dest);
          movedFiles.push(file);
        }
      }
      
      return { cleaned: movedFiles.length > 0, files: movedFiles };
    }
  }
  
  return { cleaned: false, files: [] };
}

// In prepare_task handler, BEFORE generating handover:
const cleanup = await cleanupTddRedMarkers(workspaceRoot);
if (cleanup.cleaned) {
  // Auto-commit the cleanup
  await autoCommitIfEnabled({
    toolName: "prepare_task",
    commitMessage: `chore(orchestra): cleanup tdd-red markers for Task ${taskId}\n\nCleaned:\n${cleanup.files.map(f => `- ${f}`).join('\n')}`,
    sprintId: sprint.id,
    taskInternalId: task.id,
    cwd: workspaceRoot,
  });
}
```

### 3. Verification Check Generation

When `tdd_red_phase = true`, auto-inject dual verification:

```typescript
// src/mcp-server/handlers/prepare-task.ts

function generateTDDRedPhaseChecks(taskCategory: string): VerificationCriteria {
  return {
    behavioral_checks: [
      {
        description: "TDD red-phase tests fail as expected",
        command: "flutter test --tags tdd-red",
        expect_exit_code: 1,
        severity: "BLOCKING"
      },
      {
        description: "All other tests pass (no regressions)",
        command: "flutter test --exclude-tags tdd-red",
        expect_exit_code: 0,
        severity: "BLOCKING"
      }
    ],
    structural_checks: [
      {
        description: "At least one test has tdd-red tag",
        path: "test/**/*.dart",
        pattern: "@Tags\\(\\['tdd-red'\\]\\)",
        min_matches: 1,
        severity: "BLOCKING"
      }
    ]
  };
}
```

When `tdd_red_phase = false`, enforce cleanup:

```typescript
function generateTDDCleanupChecks(): VerificationCriteria {
  return {
    structural_checks: [
      {
        description: "No tdd-red tags remain in codebase",
        path: "test/**/*.dart",
        pattern: "@Tags\\(\\['tdd-red'\\]\\)",
        min_matches: 0,  // MUST be zero
        severity: "BLOCKING"
      }
    ]
  };
}
```

### 3. Pre-Signal Check Integration

Update pre-signal logic to handle tagged tests:

```typescript
// Existing pre-signal test check
if (runTests && !task.tdd_red_phase) {
  // Normal: all tests must pass
  const testResult = await runCommand(testCommand);
  if (testResult.exitCode !== 0) {
    checks.push({
      id: "tests",
      name: "All tests pass",
      passed: false,
      severity: "BLOCKING",
      message: "Tests failed"
    });
  }
}

// New: TDD red phase handling
if (runTests && task.tdd_red_phase) {
  // 1. Tagged tests must fail
  const redResult = await runCommand(`${testCommand} --tags tdd-red`);
  if (redResult.exitCode === 0) {
    checks.push({
      id: "tdd-red-fails",
      name: "TDD red-phase tests fail",
      passed: false,
      severity: "BLOCKING",
      message: "Tests tagged with tdd-red should fail but passed"
    });
  }
  
  // 2. Other tests must pass
  const greenResult = await runCommand(`${testCommand} --exclude-tags tdd-red`);
  if (greenResult.exitCode !== 0) {
    checks.push({
      id: "regression-tests",
      name: "Non-red tests pass",
      passed: false,
      severity: "BLOCKING",
      message: "Regression tests failed (tests without tdd-red tag)"
    });
  }
}
```

---

## MCP Tool Specification

The MCP server is Orchestra's interface for AI agents. All tool schemas, handlers, and documentation must be updated to support TDD red-phase verification.

### Tools Requiring Updates

| Tool | Role | Change Type | Impact |
|------|------|-------------|--------|
| `configure_sprint` | Orchestrator | Input Schema | Add `tdd_red_phase` to task definition |
| `add_task` | Orchestrator | Input Schema + Handler | Add `tdd_red_phase?: boolean` parameter |
| `prepare_task` | Orchestrator | Input/Handler | Add param, cleanup logic, auto-inject verification |
| `update_task` | Orchestrator | Input Schema | Add `tdd_red_phase` update capability |
| `get_task` | Orchestrator | Output Schema | Include `tdd_red_phase` in response |
| `get_tasks` | Orchestrator | Output Schema | Include `tdd_red_phase` per task |
| `get_current_task` | Implementor | Output + Handler | Include flag + test commands for implementor |
| `signal_completion` | Implementor | Handler | Dual-command pre-signal when flag is true |
| `run_verification_checks` | Orchestrator | Handler | Handle `expect_exit_code: 1` correctly |

---

### 4.1 configure_sprint Tool

**File**: `src/mcp-server/tools.ts` (lines 47-120)  
**Schema**: `src/schemas/sprint-config.ts`

**Current task schema in input:**
```typescript
tasks: [{
  task_id: number,
  phase_id: string,
  title: string,
  description: string,
  category: enum,
  dependencies: number[],
  speckit_task_ref?: string,
  verification: { ... }
}]
```

**Required addition:**
```typescript
tdd_red_phase: {
  type: "boolean",
  description: "Mark task as TDD red-phase. When true, verification expects tagged tests to FAIL (exit 1) and non-tagged tests to PASS (exit 0). Default: false."
}
```

**Handler change** (`configure-sprint.ts`):
- Store `tdd_red_phase` in database when creating tasks

---

### 4.2 add_task Tool

**File**: `src/mcp-server/tools.ts` (lines 121-196)  
**Handler**: `src/mcp-server/handlers/add-task.ts`  
**Schema**: `src/schemas/sprint-config.ts` (AddTaskInputSchema)

**Required addition to inputSchema:**
```typescript
tdd_red_phase: {
  type: "boolean",
  description: "Mark as TDD red-phase task. When true:\n" +
    "- Verification expects tagged tests to FAIL (exit code 1)\n" +
    "- Verification expects non-tagged tests to PASS (exit code 0)\n" +
    "- Implementor must use @Tags(['tdd-red']) (Dart) or test/tdd-red/ (TypeScript)\n" +
    "Use for TDD red phase where implementor writes a failing test first."
}
```

**Handler change**:
```typescript
// In addTask() function
await db.insert(tasks).values({
  // ... existing fields
  tdd_red_phase: input.tdd_red_phase ?? false,
});
```

---

### 4.3 prepare_task Tool (Critical)

**File**: `src/mcp-server/tools.ts` (lines 379-440)  
**Handler**: `src/mcp-server/handlers/prepare-task.ts`  
**Schema**: `src/schemas/handover.ts` (PrepareTaskInputSchema)

**Current inputSchema properties:**
- task_id, acceptance_criteria, file_operations, deliverables, priority, context, context_files

**Required additions:**

```typescript
tdd_red_phase: {
  type: "boolean",
  description: 
    "Set/override task's TDD red-phase flag. When true:\n" +
    "1. Auto-injects dual verification: tagged tests must FAIL, others must PASS\n" +
    "2. Auto-injects structural check for tdd-red tag presence\n" +
    "3. Handover includes test commands and tagging instructions\n\n" +
    "CRITICAL: Always set this for TDD red-phase tasks. The flag persists on the task."
}
```

**Description update** (tool-level):
```typescript
description: 
  "Create handover for implementor with acceptance criteria and file operations.\n\n" +
  "CLEANUP: Before preparing ANY task, this tool automatically removes stale tdd-red\n" +
  "markers from previous tasks and commits the cleanup.\n\n" +
  "TDD RED PHASE: Set tdd_red_phase=true to auto-inject dual verification checks\n" +
  "(tagged tests must fail, others must pass) and include tagging instructions in handover."
```

**Handler changes (3 additions)**:

1. **Cleanup at start** (before handover generation):
```typescript
// ALWAYS run cleanup, regardless of current task's tdd_red_phase flag
const cleanup = await cleanupTddRedMarkers(workspaceRoot);
if (cleanup.cleaned) {
  await autoCommitIfEnabled({
    toolName: "prepare_task",
    commitMessage: `chore(orchestra): cleanup tdd-red markers for Task ${taskId}`,
    // ...
  });
  console.error(`[TDD] Cleaned ${cleanup.files.length} tdd-red markers before prepare`);
}
```

2. **Store flag on task**:
```typescript
if (input.tdd_red_phase !== undefined) {
  await db.update(tasks)
    .set({ tdd_red_phase: input.tdd_red_phase })
    .where(eq(tasks.id, task.id));
}
```

3. **Auto-inject verification checks**:
```typescript
const effectiveTddRedPhase = input.tdd_red_phase ?? task.tdd_red_phase ?? false;

if (effectiveTddRedPhase) {
  // Inject red-phase checks
  const redPhaseChecks = generateTDDRedPhaseChecks(language);
  await insertVerificationChecks(task.id, redPhaseChecks);
} else {
  // Inject "no markers" check for non-red tasks
  const cleanupChecks = generateTDDCleanupChecks(language);
  await insertVerificationChecks(task.id, cleanupChecks);
}
```

---

### 4.4 update_task Tool

**File**: `src/mcp-server/tools.ts` (lines 243-250)  
**Handler**: `src/mcp-server/handlers/update-task.ts`

**Required addition to inputSchema:**
```typescript
tdd_red_phase: {
  type: "boolean",
  description: "Update task's TDD red-phase status. Can only be changed before task is prepared (PENDING status)."
}
```

**Handler validation**:
```typescript
if (input.tdd_red_phase !== undefined && task.status !== 'PENDING') {
  throw new Error('tdd_red_phase can only be changed for PENDING tasks');
}
```

---

### 4.5 get_task Tool (Orchestrator)

**File**: `src/mcp-server/tools.ts` (lines 345-358)  
**Handler**: `src/mcp-server/handlers/get-task.ts`

**Output must include:**
```typescript
{
  task_id: number,
  phase_id: string,
  title: string,
  description: string,
  category: string,
  status: string,
  dependencies: number[],
  tdd_red_phase: boolean,  // NEW - orchestrator sees the flag
  verification: { ... }
}
```

**Handler change**:
```typescript
return {
  // ... existing fields
  tdd_red_phase: task.tdd_red_phase ?? false,
};
```

---

### 4.6 get_tasks Tool (Orchestrator)

**File**: `src/mcp-server/tools.ts` (lines 359-375)  
**Handler**: `src/mcp-server/handlers/get-tasks.ts`

**Output per task must include:**
```typescript
{
  task_id: number,
  title: string,
  status: string,
  // ... other fields
  tdd_red_phase: boolean  // NEW
}
```

**Optional filter addition:**
```typescript
inputSchema.properties.tdd_red_phase = {
  type: "boolean",
  description: "Filter by TDD red-phase status"
}
```

---

### 4.7 get_current_task Tool (Implementor) - Critical

**File**: `src/mcp-server/tools.ts` (lines 441-445)  
**Handler**: `src/mcp-server/handlers/get-current-task.ts`  
**Schema**: `src/schemas/handover.ts` (GetCurrentTaskOutputSchema)

This is the implementor's view of the task. It must include clear guidance when `tdd_red_phase=true`.

**Output additions:**
```typescript
{
  task_id: number,
  title: string,
  // ... existing fields
  
  // NEW: TDD red-phase information
  tdd_red_phase: boolean,
  tdd_instructions: {
    // Only present when tdd_red_phase=true
    tagging_mechanism: string,  // "Use @Tags(['tdd-red']) annotation"
    red_test_command: string,   // "flutter test --tags tdd-red"
    green_test_command: string, // "flutter test --exclude-tags tdd-red"
    expected_behavior: string,  // "Red test must FAIL (exit 1), others must PASS (exit 0)"
    example: string             // Code example showing tag usage
  } | null
}
```

**Handler change**:
```typescript
const tddRedPhase = task.tdd_red_phase ?? false;

let tddInstructions = null;
if (tddRedPhase) {
  const language = detectProjectLanguage(workspacePath);
  tddInstructions = generateTddInstructions(language);
}

return {
  // ... existing fields
  tdd_red_phase: tddRedPhase,
  tdd_instructions: tddInstructions,
};

function generateTddInstructions(language: string) {
  if (language === 'dart') {
    return {
      tagging_mechanism: "Add @Tags(['tdd-red']) annotation to test class or function",
      red_test_command: "flutter test --tags tdd-red",
      green_test_command: "flutter test --exclude-tags tdd-red",
      expected_behavior: "The tagged test MUST fail (exit code 1). All other tests MUST pass (exit code 0).",
      example: `
import 'package:flutter_test/flutter_test.dart';

@Tags(['tdd-red'])  // <-- Add this annotation
void main() {
  test('feature should work', () {
    // This test MUST fail - we haven't implemented the feature yet
    expect(actualValue, expectedValue);
  });
}`
    };
  }
  
  if (language === 'typescript') {
    return {
      tagging_mechanism: "Place test file in test/tdd-red/ directory",
      red_test_command: "npm test -- test/tdd-red",
      green_test_command: "npm test -- --testPathIgnorePatterns=tdd-red",
      expected_behavior: "Tests in tdd-red/ MUST fail (exit code 1). All other tests MUST pass (exit code 0).",
      example: `
// File: test/tdd-red/feature.test.ts
describe('Feature', () => {
  it('should work', () => {
    // This test MUST fail - we haven't implemented the feature yet
    expect(actual).toBe(expected);
  });
});`
    };
  }
  
  return null;
}
```

---

### 4.8 signal_completion Tool (Implementor)

**Handler**: `src/mcp-server/handlers/signal-completion.ts`  
**Core**: `src/core/pre-signal-executor.ts`

**Handler changes**:

1. **Fetch tdd_red_phase from task**:
```typescript
const tddRedPhase = task.tdd_red_phase ?? false;
```

2. **Pass to pre-signal executor**:
```typescript
const preSignalConfig = await getPreSignalConfig();
preSignalConfig.tddRedPhase = tddRedPhase;

const preSignalChecks = await runPreSignalChecks(preSignalConfig);
```

**pre-signal-executor.ts changes**:

```typescript
export interface PreSignalConfig {
  workspacePath: string;
  buildCommand?: string;
  testCommand?: string;
  lintCommand?: string;
  timeout?: number;
  skipBuild?: boolean;
  skipTest?: boolean;
  skipLint?: boolean;
  // NEW
  tddRedPhase?: boolean;
}

export async function runPreSignalChecks(config: PreSignalConfig): Promise<PreSignalResult> {
  // ... existing build/lint checks
  
  // Test check - different behavior for TDD red phase
  if (!config.skipTest) {
    if (config.tddRedPhase) {
      // TDD RED PHASE: Run dual commands
      const redResult = await runSingleCheck(
        getRedPhaseTestCommand(config),  // "flutter test --tags tdd-red"
        config.workspacePath,
        config.timeout
      );
      
      const greenResult = await runSingleCheck(
        getNonRedPhaseTestCommand(config),  // "flutter test --exclude-tags tdd-red"
        config.workspacePath,
        config.timeout
      );
      
      // Red tests MUST fail (exit 1 = pass for red phase)
      const redPassed = redResult.exitCode !== 0;
      // Green tests MUST pass (exit 0)
      const greenPassed = greenResult.exitCode === 0;
      
      result.test = {
        passed: redPassed && greenPassed,
        output: formatDualTestOutput(redResult, greenResult, redPassed, greenPassed),
        duration_ms: redResult.duration_ms + greenResult.duration_ms,
      };
    } else {
      // NORMAL: All tests must pass
      const testResult = await runSingleCheck(
        config.testCommand ?? getDefaultTestCommand(projectType),
        config.workspacePath,
        config.timeout
      );
      
      result.test = {
        passed: testResult.exitCode === 0,
        output: testResult.output,
        duration_ms: testResult.duration_ms,
      };
    }
  }
  
  return result;
}

function formatDualTestOutput(
  redResult: ExecuteResult,
  greenResult: ExecuteResult,
  redPassed: boolean,
  greenPassed: boolean
): string {
  return `
=== TDD Red-Phase Verification ===

[Tagged Tests (must FAIL)]: ${redPassed ? 'PASS ✓' : 'FAIL ✗'}
${redResult.output}

[Other Tests (must PASS)]: ${greenPassed ? 'PASS ✓' : 'FAIL ✗'}
${greenResult.output}
`.trim();
}
```

---

### 4.9 run_verification_checks Tool (Orchestrator)

**Handler**: `src/mcp-server/handlers/run-verification-checks.ts`

The verification runner already supports `expect_exit_code` in check configs. However, we need to ensure the behavioral check executor correctly handles `expect_exit_code: 1`.

**check-executor.ts validation**:
```typescript
// Behavioral check execution
if (config.expect_exit_code !== undefined) {
  // Check passes if exit code matches expectation (could be 0, 1, or any value)
  passed = result.exitCode === config.expect_exit_code;
} else {
  // Default: exit code 0 = pass
  passed = result.exitCode === 0;
}
```

**Handler enhancement** - Include task's tdd_red_phase in output:
```typescript
return {
  success: true,
  task_id: input.task_id,
  tdd_red_phase: task.tdd_red_phase,  // NEW - for context
  checks_run: results.length,
  // ... rest of output
};
```

---

### Files Summary

| File | Type | Changes |
|------|------|---------|
| `src/mcp-server/tools.ts` | Schema | Update 6+ tool inputSchemas and descriptions |
| `src/schemas/sprint-config.ts` | Schema | Add tdd_red_phase to task schemas |
| `src/schemas/handover.ts` | Schema | Add tdd_red_phase + tdd_instructions to output |
| `src/db/schema.ts` | Database | Add tdd_red_phase column to tasks table |
| `src/db/migrations.ts` | Database | Migration for new column |
| `src/core/types.ts` | Types | Add tdd_red_phase to TaskSchema |
| `src/mcp-server/handlers/configure-sprint.ts` | Handler | Store tdd_red_phase |
| `src/mcp-server/handlers/add-task.ts` | Handler | Store tdd_red_phase |
| `src/mcp-server/handlers/prepare-task.ts` | Handler | Cleanup + inject checks + set flag |
| `src/mcp-server/handlers/update-task.ts` | Handler | Update tdd_red_phase |
| `src/mcp-server/handlers/get-task.ts` | Handler | Return tdd_red_phase |
| `src/mcp-server/handlers/get-tasks.ts` | Handler | Return tdd_red_phase per task |
| `src/mcp-server/handlers/get-current-task.ts` | Handler | Return tdd_red_phase + instructions |
| `src/mcp-server/handlers/signal-completion.ts` | Handler | Pass flag to pre-signal executor |
| `src/mcp-server/handlers/run-verification-checks.ts` | Handler | Return tdd_red_phase in output |
| `src/core/pre-signal-executor.ts` | Core | Dual-command test execution |
| `src/core/check-executor.ts` | Core | Verify expect_exit_code handling |

---

## Multi-Language Support

Each language has its own mechanism for TDD red-phase isolation. Cross-language standardization is not feasible - agents must adapt to the language-specific approach.

### Dart/Flutter: Tag-Based

```dart
@Tags(['tdd-red'])
test('should use correct default label color', () {
  expect(actualColor, equals(expectedColor));
});
```

**Commands**:
```bash
# Run ONLY red-phase tests (must fail)
flutter test --tags tdd-red

# Run all EXCEPT red-phase tests (must pass)
flutter test --exclude-tags tdd-red
```

**Structural Check** (red phase):
```typescript
{
  path: "test/**/*.dart",
  pattern: "@Tags\\(\\['tdd-red'\\]\\)",
  min_matches: 1,
  severity: "BLOCKING"
}
```

**Cleanup Check** (green phase):
```typescript
{
  path: "test/**/*.dart",
  pattern: "@Tags\\(\\['tdd-red'\\]\\)",
  min_matches: 0,  // Must be zero - all tags removed
  severity: "BLOCKING"
}
```

**Green Phase Action**: Remove `@Tags(['tdd-red'])` annotation from test file.

---

### TypeScript/Jest: Directory-Based

Jest lacks native tag support, so we use **directory-based separation**:

```
test/
├── tdd-red/              # Red-phase tests (must fail)
│   └── feature.test.ts
└── unit/                 # Normal tests (must pass)
    └── other.test.ts
```

**Commands**:
```bash
# Run ONLY red-phase tests (must fail)
# Note: We invert exit code because Jest returns 1 on failure
npm test -- test/tdd-red --passWithNoTests
# If this returns 0, the test passed (BAD for red phase)
# If this returns 1, the test failed (GOOD for red phase)

# Run all EXCEPT red-phase tests (must pass)
npm test -- --testPathIgnorePatterns="tdd-red"
```

**Verification Logic** (red phase):
```typescript
behavioral_checks: [
  {
    description: "Red-phase tests exist and fail",
    command: "npm test -- test/tdd-red --passWithNoTests 2>&1; if [ $? -eq 0 ]; then exit 1; else exit 0; fi",
    expect_exit_code: 0,  // Inverted: success means tests failed
    severity: "BLOCKING"
  },
  {
    description: "All other tests pass (no regressions)",
    command: "npm test -- --testPathIgnorePatterns=tdd-red",
    expect_exit_code: 0,
    severity: "BLOCKING"
  }
],
structural_checks: [
  {
    description: "At least one test file in tdd-red directory",
    path: "test/tdd-red/**/*.test.ts",
    pattern: "describe|test|it",
    min_matches: 1,
    severity: "BLOCKING"
  }
]
```

**Cleanup Check** (green phase):
```typescript
structural_checks: [
  {
    description: "No test files remain in tdd-red directory",
    path: "test/tdd-red/**/*.test.ts",
    pattern: ".*",
    min_matches: 0,  // Directory should be empty
    severity: "BLOCKING"
  }
]
```

**Green Phase Action**: Move test file from `test/tdd-red/feature.test.ts` to appropriate location (e.g., `test/unit/feature.test.ts`).

---

### Python/pytest: Marker-Based

```python
import pytest

@pytest.mark.tdd_red
def test_feature():
    assert actual == expected
```

**Commands**:
```bash
# Run ONLY red-phase tests (must fail)
pytest -m tdd_red

# Run all EXCEPT red-phase tests (must pass)
pytest -m "not tdd_red"
```

**Structural Check** (red phase):
```typescript
{
  path: "test/**/*.py",
  pattern: "@pytest\\.mark\\.tdd_red",
  min_matches: 1,
  severity: "BLOCKING"
}
```

**Green Phase Action**: Remove `@pytest.mark.tdd_red` decorator from test function.

---

### Language Summary

| Language | Mechanism | Red-Phase Marker | Cleanup Action |
|----------|-----------|------------------|----------------|
| **Dart/Flutter** | Tags | `@Tags(['tdd-red'])` | Remove annotation |
| **TypeScript/Jest** | Directory | `test/tdd-red/*.test.ts` | Move file out |
| **TypeScript/Vitest** | Directory | `test/tdd-red/*.test.ts` | Move file out |
| **Python/pytest** | Markers | `@pytest.mark.tdd_red` | Remove decorator |
| **Go** | File naming | `*_tddred_test.go` | Rename file |
| **Rust** | Module | `mod tdd_red_tests` | Move to normal module |
| **C#/xUnit** | Traits | `[Trait("Category", "TddRed")]` | Remove attribute |
| **Ruby/RSpec** | Tags | `it "test", :tdd_red do` | Remove tag |

---

## Verification Rules Reference

### Rule Matrix

| Task Type | tdd_red_phase | Verification Checks | Pre-Signal Checks |
|-----------|---------------|---------------------|-------------------|
| **Red Phase** | `true` | ✅ At least 1 `tdd-red` tag exists<br>✅ `test --tags tdd-red` → exit 1<br>✅ `test --exclude-tags tdd-red` → exit 0 | Same as verification |
| **Green Phase** | `false` | ✅ Zero `tdd-red` tags exist<br>✅ `test` → exit 0 | ✅ No `tdd-red` tags<br>✅ All tests pass |
| **Normal Task** | `false` | ✅ Zero `tdd-red` tags exist<br>✅ `test` → exit 0 | ✅ No `tdd-red` tags<br>✅ All tests pass |

### Defense Against Abuse

**Attack Vector 1**: Implementor tags broken tests to hide failures
- **Defense**: Red phase tasks explicitly document WHICH test should fail
- **Verification**: Orchestrator reviews that ONLY intended test is tagged
- **Manual Review**: Required in `submit_verification_judgment`

**Attack Vector 2**: Implementor forgets to remove tags
- **Defense**: All non-red tasks enforce zero `tdd-red` tags at pre-signal
- **Result**: Implementor cannot signal completion until tags removed

**Attack Vector 3**: Typo in tag name (`tdd-reed`)
- **Defense**: Pre-signal runs actual test commands with exclusions
- **Result**: Mistagged tests run normally and must pass, revealing typo

**Attack Vector 4**: Multiple unrelated tests tagged
- **Defense**: Orchestrator manual review checks tag placement
- **Limitation**: Trust boundary - orchestrator must verify correctly

---

## Sprint Settings Integration

Add TDD red-phase configuration to Sprint Settings panel:

```typescript
interface SprintSettings {
  // ... existing fields
  tddRedPhaseEnabled: boolean;
  tddRedPhaseTag: string; // default: "tdd-red"
}
```

UI:
```
[x] Enable TDD red-phase support
    Tag name: [tdd-red        ]
    When enabled, tasks can be marked as red-phase and tagged tests
    will be isolated during verification.
```

Configuration storage:
```sql
INSERT INTO config (key, value) VALUES 
  ('tdd.red_phase_enabled', 'true'),
  ('tdd.red_phase_tag', 'tdd-red');
```

---

## Orchestrator Workflow

### Preparing a Red Phase Task

```typescript
// Call: prepare_task
{
  "task_id": 42,
  "context": "This is a TDD RED PHASE task. The implementor must add a test that intentionally fails to demonstrate the missing feature. The test should be tagged with @Tags(['tdd-red']) so it can be isolated from regression tests.",
  "acceptance_criteria": [
    {
      "criterion": "Test file created with tdd-red tag",
      "verification": "test/unit/feature_test.dart contains @Tags(['tdd-red'])"
    },
    {
      "criterion": "Tagged test fails with expected error",
      "verification": "flutter test --tags tdd-red exits with code 1"
    },
    {
      "criterion": "No regressions in other tests",
      "verification": "flutter test --exclude-tags tdd-red exits with code 0"
    }
  ],
  "file_operations": [
    {
      "operation": "CREATE",
      "path": "test/unit/feature_test.dart",
      "description": "Red-phase test with @Tags(['tdd-red'])"
    }
  ],
  "deliverables": [
    "Test file with tdd-red tag",
    "Test fails with expected error message"
  ],
  "priority": "P1"
}

// Then update task metadata
// UPDATE tasks SET tdd_red_phase = true WHERE task_id = 42;
```

### Preparing the Green Phase Task

```typescript
// Call: prepare_task
{
  "task_id": 43,
  "context": "This is the GREEN PHASE of the TDD cycle. Implement the feature to make the previously failing test pass. CRITICAL: Remove the @Tags(['tdd-red']) annotation from the test file created in Task 42.",
  "acceptance_criteria": [
    {
      "criterion": "No tdd-red tags remain",
      "verification": "grep -r \"tdd-red\" test/ returns no matches"
    },
    {
      "criterion": "All tests pass including former red test",
      "verification": "flutter test exits with code 0"
    },
    {
      "criterion": "Feature implemented",
      "verification": "Manual review of implementation code"
    }
  ],
  "file_operations": [
    {
      "operation": "UPDATE",
      "path": "test/unit/feature_test.dart",
      "description": "Remove @Tags(['tdd-red']) annotation"
    },
    {
      "operation": "CREATE",
      "path": "lib/src/feature.dart",
      "description": "Feature implementation"
    }
  ],
  "deliverables": [
    "Cleaned test file (no tdd-red tag)",
    "Feature implementation",
    "All tests passing"
  ],
  "priority": "P1"
}
```

---

## Implementation Phases

### Phase 1: Database Schema (P0)
- [ ] Add `tdd_red_phase` column to tasks table in `src/db/schema.ts`
- [ ] Add database migration in `src/db/migrations.ts`
- [ ] Update `TaskSchema` in `src/core/types.ts`

### Phase 2: MCP Tool Schemas (P0)
- [ ] Update `configure_sprint` inputSchema - add `tdd_red_phase` to task definition
- [ ] Update `add_task` inputSchema - add `tdd_red_phase?: boolean`
- [ ] Update `prepare_task` inputSchema - add `tdd_red_phase?: boolean`
- [ ] Update `update_task` inputSchema - add `tdd_red_phase?: boolean`
- [ ] Update Zod schemas in `src/schemas/sprint-config.ts`
- [ ] Update Zod schemas in `src/schemas/handover.ts`

### Phase 3: MCP Handler Updates - Orchestrator (P0)
- [ ] `configure-sprint.ts` - Store `tdd_red_phase` when creating tasks
- [ ] `add-task.ts` - Store `tdd_red_phase` when adding task
- [ ] `update-task.ts` - Allow updating `tdd_red_phase` for PENDING tasks
- [ ] `get-task.ts` - Return `tdd_red_phase` in output
- [ ] `get-tasks.ts` - Return `tdd_red_phase` per task + optional filter

### Phase 4: Prepare-Task Handler (P0)
- [ ] Add `cleanupTddRedMarkers()` function with language detection
- [ ] Call cleanup at START of prepare (before handover generation)
- [ ] Auto-commit cleanup with descriptive message
- [ ] Store `tdd_red_phase` flag on task if provided in input
- [ ] Auto-inject red-phase verification checks when `tdd_red_phase=true`
- [ ] Auto-inject "no markers" check when `tdd_red_phase=false`

### Phase 5: Implementor Tools (P0)
- [ ] `get-current-task.ts` - Return `tdd_red_phase` + `tdd_instructions` object
- [ ] Create `generateTddInstructions(language)` function
- [ ] Include tagging mechanism, test commands, examples per language

### Phase 6: Pre-Signal Integration (P0)
- [ ] Update `PreSignalConfig` interface with `tddRedPhase?: boolean`
- [ ] Modify `runPreSignalChecks()` for dual-command execution
- [ ] Red-phase: run tagged command (expect exit 1) + non-tagged (expect exit 0)
- [ ] Normal: run all tests (expect exit 0)
- [ ] Update `signal-completion.ts` to pass flag to executor

### Phase 7: Verification Runner (P1)
- [ ] Verify `check-executor.ts` handles `expect_exit_code: 1` correctly
- [ ] Update `run-verification-checks.ts` to return `tdd_red_phase` in output

### Phase 8: Multi-Language Support (P1)
- [ ] Dart/Flutter: Tag removal in `cleanupTddRedMarkers()`
- [ ] TypeScript/Jest: File move in `cleanupTddRedMarkers()`
- [ ] Language-appropriate test commands in verification checks
- [ ] Language-appropriate instructions in `generateTddInstructions()`

### Phase 9: Documentation (P2)
- [ ] Update Orchestra Bible with TDD red-phase workflow
- [ ] Add orchestrator guide for preparing red-phase tasks
- [ ] Add implementor guide with test commands per language
- [ ] Create troubleshooting guide

---

## Testing Strategy

### Unit Tests
- [ ] Test `cleanupTddRedMarkers()` for Dart (removes tags)
- [ ] Test `cleanupTddRedMarkers()` for TypeScript (moves files)
- [ ] Test `generateTDDRedPhaseChecks()` output per language
- [ ] Test `generateTddInstructions()` output per language
- [ ] Test pre-signal logic with `tdd_red_phase` variations
- [ ] Test marker pattern detection across languages

### Integration Tests
- [ ] `configure_sprint` with `tdd_red_phase: true` task
- [ ] `add_task` with `tdd_red_phase: true`
- [ ] `prepare_task` sets flag and injects checks
- [ ] `get_task` returns `tdd_red_phase`
- [ ] `get_current_task` returns `tdd_instructions`
- [ ] `signal_completion` runs dual-command verification
- [ ] Cleanup auto-commits before handover

### E2E Tests
- [ ] Full TDD cycle: red → green → refactor
- [ ] Consecutive red tasks: verify cleanup between each
- [ ] Abuse testing: implementor tags broken tests
- [ ] Typo testing: wrong tag name gets caught

---

## Migration Path

### For Existing Workspaces

1. **Database Migration**
   ```sql
   -- Add column with default false
   ALTER TABLE tasks ADD COLUMN tdd_red_phase INTEGER DEFAULT 0;
   ```

2. **No Global Toggle**
   - Per-task `tdd_red_phase` flag only
   - No workspace-level enable/disable
   - Orchestrator sets flag when preparing red-phase tasks

3. **No Breaking Changes**
   - Existing tasks unaffected (flag defaults to `false`)
   - Existing verification checks unchanged
   - Cleanup only runs if markers are detected

---

## Resolved Design Decisions

1. **Global vs Per-Task Control**
   - **Decision**: Per-task only. No global `tdd.red_phase_enabled` toggle. A task either has `tdd_red_phase = true` or it doesn't.

2. **Tag Count Limits**
   - **Decision**: No hard limit. All tests tagged with `tdd-red` MUST fail. If any pass, verification fails. Multiple red tests per task are allowed.

3. **Multi-language Mechanism**
   - **Decision**: Each language uses its native approach (Dart: tags, TypeScript: directories, Python: markers). No cross-language standardization - agents adapt to the language-specific mechanism.

4. **Cleanup Timing**
   - **Decision**: Cleanup happens at the START of `prepare_task` for EVERY task (if markers exist). Orchestrator removes markers and commits before generating handover.

5. **Cleanup Responsibility**
   - **Decision**: Orchestrator performs cleanup (not implementor). This is housekeeping, not implementation. Orchestrator commits with message like `chore(orchestra): cleanup tdd-red markers for Task N`.

6. **Consecutive Red Tasks**
   - **Decision**: Doesn't matter. Cleanup always happens at prepare, regardless of whether current task is also red-phase. Each task starts with clean slate.

7. **Pre-signal vs Verification**
   - **Decision**: Both. Pre-signal gives implementor early feedback. Verification provides orchestrator confirmation. Same checks run at both stages.

8. **TypeScript Cleanup Location**
   - **Decision**: Move from `test/tdd-red/feature.test.ts` to `test/unit/feature.test.ts` (or appropriate location). Orchestrator handles this during cleanup.

9. **Typo Protection**
   - **Decision**: Pre-signal runs actual test commands. Misnamed tags/folders won't be excluded, so tests run normally and must pass - revealing the typo immediately.

10. **Refactor Phase**
    - **Decision**: No explicit `tdd_refactor_phase` flag. Refactor uses normal verification (all tests pass).

---

## Success Criteria

### Core Functionality
- [ ] Red-phase tasks can signal completion with failing tests
- [ ] Non-red tasks start with clean workspace (markers auto-removed)
- [ ] Cleanup is committed by orchestrator before handover
- [ ] No false negatives: legit red tests verify correctly
- [ ] No false positives: broken tests cannot hide behind markers
- [ ] Implementor gets clear feedback with correct test commands
- [ ] At least 2 languages supported (Dart + TypeScript)

### MCP Tool Coverage
- [ ] `configure_sprint` accepts `tdd_red_phase` per task
- [ ] `add_task` accepts and stores `tdd_red_phase`
- [ ] `prepare_task` accepts, stores, and acts on `tdd_red_phase`
- [ ] `update_task` can modify `tdd_red_phase` for PENDING tasks
- [ ] `get_task` returns `tdd_red_phase` in output
- [ ] `get_tasks` returns `tdd_red_phase` for each task
- [ ] `get_current_task` returns `tdd_red_phase` + `tdd_instructions`
- [ ] `signal_completion` runs dual-command verification when flag is true
- [ ] `run_verification_checks` handles `expect_exit_code: 1` correctly

### Agent Experience
- [ ] Orchestrator can set `tdd_red_phase: true` when preparing task
- [ ] Implementor sees clear instructions in `get_current_task` output
- [ ] Pre-signal error messages guide implementor to correct commands
- [ ] Tool descriptions document TDD red-phase usage

---

## References

- Orchestra Bible Section 7: Task Lifecycle
- Orchestra Bible Section 9: Verification Model
- TD-019: TDD Language Detection
- Flutter Test Documentation: https://api.flutter.dev/flutter/flutter_test/flutter_test-library.html
- Jest CLI: https://jestjs.io/docs/cli
- pytest Markers: https://docs.pytest.org/en/stable/how-to/mark.html
