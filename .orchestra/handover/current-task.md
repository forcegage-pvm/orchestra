# Task 6: Prepare Command

## Overview

Implement the `orchestra prepare` command that prepares the handover folder for a specific task. This command generates `current-task.md` from templates, updates context files, and readies the handover for the implementor. This is the core of **Process 1: Handover Creation**, implementing Steps 1-12.

## Objective

Create a command that orchestrators can use to automatically generate complete, actionable task handovers for implementors, eliminating manual template filling and ensuring consistency across all task preparations.

## Spec Files

📄 **Task spec**: `spec/implementation/phase-1-cli/tasks/1.5-prepare-command.md`
📄 **Command spec**: `spec/implementation/phase-1-cli/commands/prepare.md`

Please read the spec file(s) for full implementation details including code samples.

## Acceptance Criteria

- [ ] `orchestra prepare` prepares the next pending task
- [ ] `orchestra prepare --task <id>` prepares a specific task by ID
- [ ] Validates dependencies are complete before preparing
- [ ] Validates no other task is in-progress (without `--force`)
- [ ] Generates `handover/current-task.md` from template
- [ ] Generates `handover/completion-signal.md` template
- [ ] Generates `handover/task-context.md` with sprint info
- [ ] Clears `handover/verification/` folder
- [ ] Updates manifest status to `in-progress`
- [ ] `--dry-run` shows actions without executing
- [ ] `--force` bypasses in-progress check
- [ ] `--json` outputs valid JSON
- [ ] Optionally runs closeout check first (default: yes, `--skip-closeout` to bypass)
- [ ] Exit code 0 on success, non-zero on failure
- [ ] At least 20 unit tests covering all scenarios

## Dependencies

These tasks must be completed first:

- Task 2: Core Libraries (status, manifest, progress services)
- Task 5: Closeout Command (for pre-prepare validation)

## SpecKit Traceability

This task implements:
- Command: `orchestra prepare` from `spec/implementation/phase-1-cli/commands/prepare.md`
- Process 1 (Handover Creation) Steps 1-12 from `.orchestra/orchestrator/processes/01-HANDOVER-CREATION.md`

## File Operations

| Action | File Path                         | Purpose                                           |
| ------ | --------------------------------- | ------------------------------------------------- |
| CREATE | `src/commands/prepare.ts`         | CLI command wrapper with Commander.js integration |
| CREATE | `src/core/prepare.ts`             | Core prepare logic (no CLI dependencies)          |
| CREATE | `test/commands/prepare.test.ts`   | Command tests (integration-style)                 |
| UPDATE | `src/cli.ts`                      | Wire up createPrepareCommand()                    |
| UPDATE | `src/core/index.ts`               | Export prepare functions                          |
| CREATE | `.orchestra/common/templates/*.hbs` | Handlebars templates (if not exist)             |

## TDD Requirements

**Test-First Approach**: Write tests before implementing.

**Test Files**: 
- `test/commands/prepare.test.ts` - Command-level tests

**Test Cases Required**:

1. **Command Definition** (6 tests)
   - Should have correct name and description
   - Should have `--task` option
   - Should have `--force` option
   - Should have `--dry-run` option
   - Should have `--json` option
   - Should have `--skip-closeout` option

2. **Task Selection** (4 tests)
   - Should prepare next pending task when no `--task` specified
   - Should prepare specific task when `--task <id>` provided
   - Should fail when task ID not found
   - Should fail when task already in-progress or completed

3. **Dependency Validation** (3 tests)
   - Should pass when all dependencies complete
   - Should fail when any dependency incomplete
   - Should fail when dependency not found in manifest

4. **In-Progress Check** (3 tests)
   - Should fail when another task is in-progress (without `--force`)
   - Should proceed when `--force` flag used
   - Should proceed when no task is in-progress

5. **Closeout Integration** (3 tests)
   - Should run closeout check by default before preparing
   - Should skip closeout when `--skip-closeout` flag used
   - Should fail when closeout check fails (without `--skip-closeout`)

6. **File Generation** (5 tests)
   - Should generate `handover/current-task.md`
   - Should generate `handover/completion-signal.md`
   - Should generate `handover/task-context.md`
   - Should clear `handover/verification/` folder
   - Should use Handlebars templates

7. **Manifest Updates** (4 tests)
   - Should update task status from PENDING to IMPLEMENT
   - Should update `current_task` in manifest
   - Should update `current_phase` correctly
   - Should not modify other tasks

8. **Dry Run** (3 tests)
   - Should show what would be generated
   - Should not modify any files when `--dry-run`
   - Should not update manifest when `--dry-run`

9. **JSON Output** (2 tests)
   - Should output valid JSON when `--json` flag used
   - JSON should include task info, files generated, dependencies

10. **Error Handling** (4 tests)
    - Should handle missing manifest gracefully
    - Should handle missing templates gracefully
    - Should handle file system errors
    - Should have correct exit codes

**Minimum: 37 tests total**

**Sample Test Data**:

```typescript
// Mock manifest for testing
const mockManifest = {
  sprint: "test-sprint",
  spec: "spec/test.md",
  created: "2025-12-02",
  status: "ACTIVE",
  phases: [
    {
      id: "setup",
      name: "Setup",
      description: "Test phase",
      tasks: [
        {
          id: 1,
          title: "First Task",
          description: "Test task 1",
          category: "INFRASTRUCTURE",
          status: "COMPLETE",
          depends_on: [],
          spec_file: "spec/task1.md",
          deliverables: ["file1.ts"],
          verification_criteria: ["test passes"]
        },
        {
          id: 2,
          title: "Second Task",
          description: "Test task 2",
          category: "INFRASTRUCTURE",
          status: "PENDING",
          depends_on: [1],
          spec_file: "spec/task2.md",
          deliverables: ["file2.ts"],
          verification_criteria: ["test passes"]
        },
        {
          id: 3,
          title: "Third Task",
          description: "Test task 3",
          category: "INFRASTRUCTURE",
          status: "PENDING",
          depends_on: [1, 2],
          spec_file: "spec/task3.md",
          deliverables: ["file3.ts"],
          verification_criteria: ["test passes"]
        }
      ]
    }
  ],
  current_task: 1,
  current_phase: "setup",
  summary: {
    total_tasks: 3,
    completed: 1,
    in_progress: 0,
    pending: 2,
    failed: 0
  }
};

// Mock template content
const mockCurrentTaskTemplate = `# Task {{id}}: {{title}}

## Description
{{description}}

## Deliverables
{{#each deliverables}}
- {{this}}
{{/each}}`;

const mockSignalTemplate = `# Completion Signal

Task: {{id}} - {{title}}

Status: [COMPLETE/FAILED]`;

const mockContextTemplate = `# Sprint Context

Sprint: {{sprint}}
Current Task: {{current_task}}
Phase: {{current_phase}}`;
```

## Implementation Details

### Architecture

```
src/commands/prepare.ts     ← CLI wrapper (Commander.js)
        ↓ calls
src/core/prepare.ts          ← Core logic (reusable)
        ↓ uses
src/core/manifest.ts         ← Task queries
src/core/templates.ts        ← Template rendering
src/core/closeout.ts         ← Optional pre-check
```

### Files to Create

#### src/commands/prepare.ts (283 lines expected)

**What to create**:
- Export `createPrepareCommand()` function returning Commander Command
- Define `PrepareOptions` interface
- Implement command options (--task, --force, --dry-run, --json, --skip-closeout)
- Call core `runPrepare()` function
- Handle errors with proper exit codes
- Format output (human-readable and JSON)

**Code scaffold**:

```typescript
/**
 * Orchestra Prepare Command
 *
 * Aligned with Orchestra Bible v0.7.0
 * Prepares handover for next task (Process 1, Steps 1-12).
 */

import { Command } from "commander";
import chalk from "chalk";
import {
  runPrepare,
  type PrepareOptions,
  type PrepareResult,
} from "../core/prepare.js";
import * as output from "../core/output.js";

/**
 * Create the prepare command
 */
export function createPrepareCommand(): Command {
  return new Command("prepare")
    .description("Prepare handover for next task")
    .option("--task <id>", "Specific task ID to prepare (default: next pending)")
    .option("-f, --force", "Prepare even if another task in-progress", false)
    .option("--skip-closeout", "Skip closeout check (not recommended)", false)
    .option("--dry-run", "Show what would be generated without executing", false)
    .option("--json", "Output JSON format", false)
    .action(async (options: PrepareOptions) => {
      await prepareCommand(options);
    });
}

/**
 * Execute prepare command
 */
async function prepareCommand(options: PrepareOptions): Promise<void> {
  try {
    const result = await runPrepare(options);
    
    if (options.json) {
      console.log(JSON.stringify({
        success: true,
        task: result.task,
        files: result.filesGenerated,
        statusUpdated: result.statusUpdated
      }, null, 2));
    } else {
      showSuccess(result);
    }
    
    process.exit(0);
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }, null, 2));
    } else {
      output.print.error(error instanceof Error ? error.message : String(error));
    }
    
    process.exit(1);
  }
}

/**
 * Show success message with details
 */
function showSuccess(result: PrepareResult): void {
  console.log("");
  output.print.success("Task prepared!");
  console.log("");
  console.log(chalk.bold("Task:") + ` ${result.task.id} - ${result.task.title}`);
  console.log(chalk.bold("Category:") + ` ${result.task.category}`);
  console.log("");
  console.log(chalk.bold("Handover files:"));
  result.filesGenerated.forEach(file => {
    console.log(`  ✓ ${file}`);
  });
  console.log("");
  
  if (result.dependencies && result.dependencies.length > 0) {
    console.log(chalk.bold("Dependencies (met):"));
    result.dependencies.forEach(dep => {
      console.log(`  ✓ Task ${dep.id}: ${dep.title}`);
    });
    console.log("");
  }
  
  console.log(chalk.bold("Next:") + " Implementor can begin work");
  console.log("");
}

export { prepareCommand };
```

#### src/core/prepare.ts (650+ lines expected)

**What to create**:
- Export `runPrepare()` async function
- Define `PrepareOptions` and `PrepareResult` interfaces
- Implement task selection logic (next pending vs specific ID)
- Implement validation (dependencies, in-progress check)
- Integrate closeout check (optional)
- Implement file generation (current-task.md, completion-signal.md, task-context.md)
- Clear verification folder
- Update manifest status
- Support dry-run mode
- NO CLI dependencies (no chalk, ora, Commander)

**Reference the full code scaffold in the spec file** at `spec/implementation/phase-1-cli/tasks/1.5-prepare-command.md` for complete implementation details.

**Key functions to implement**:
1. `runPrepare(options)` - Main entry point
2. `selectTask(manifest, taskId?)` - Find task to prepare
3. `validatePrepare(manifest, task, force)` - Validation logic
4. `validateDependencies(manifest, task)` - Check dependencies
5. `generateHandoverFiles(root, manifest, task)` - Create handover files
6. `updateManifestForTask(root, taskId)` - Update manifest
7. `determinePreviousTask(manifest, taskId)` - For closeout check
8. `generateTaskContext(manifest, task)` - Create context content

#### test/commands/prepare.test.ts (37+ tests expected)

**What to create**:
- Import necessary test utilities and mocks
- Test command definition (6 tests)
- Test task selection (4 tests)
- Test validation (6 tests)
- Test closeout integration (3 tests)
- Test file generation (5 tests)
- Test manifest updates (4 tests)
- Test dry-run mode (3 tests)
- Test JSON output (2 tests)
- Test error handling (4 tests)

**Code scaffold start**:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPrepareCommand } from "../../src/commands/prepare.js";
import * as prepareCore from "../../src/core/prepare.js";

describe("prepare command", () => {
  describe("command definition", () => {
    it("should have correct name and description", () => {
      const command = createPrepareCommand();
      expect(command.name()).toBe("prepare");
      expect(command.description()).toContain("Prepare handover");
    });
    
    // ... 5 more option tests
  });
  
  describe("task selection", () => {
    // ... 4 tests
  });
  
  // ... 8 more test suites
});
```

### Files to Update

#### src/cli.ts

**Current state**: Has stub for prepare command at lines ~70-78

**What to change**:
1. Add import at top: `import { createPrepareCommand } from "./commands/prepare.js";`
2. Replace stub with: `program.addCommand(createPrepareCommand());`

**Exact location**:
```typescript
// Around line 70-78, replace:
program
  .command("prepare")
  .description("Prepare handover for next task")
  .option("--task <id>", "Task ID to prepare")
  .action(async () => {
    console.log("Prepare command not yet implemented");
    // TODO: Implement prepare command
  });

// With:
program.addCommand(createPrepareCommand());
```

#### src/core/index.ts

**Current state**: Exports other core modules

**What to add**:
```typescript
// Add near other exports
export * from "./prepare.js";
```

## Core Functions Available

From previous tasks, you have access to:

**From `src/core/config.ts`**:
- `findOrchestraRoot()` - Find .orchestra directory
- `getResolvedPaths(root)` - Get all Orchestra paths
- `loadConfig(root)` - Load orchestra.yaml

**From `src/core/manifest.ts`**:
- `loadManifest(root)` - Load and parse manifest.yaml
- `saveManifest(manifest, root)` - Save manifest.yaml
- `getTask(manifest, id)` - Get task by ID
- `getCurrentTask(manifest)` - Get current task
- `getSprintProgress(manifest)` - Get progress stats

**From `src/core/templates.ts`**:
- `loadTemplate(name, root)` - Load Handlebars template
- `renderTemplate(name, context, root)` - Render template with data
- `renderTemplateString(content, context)` - Render template string

**From `src/core/closeout.ts`**:
- `runCloseoutChecks(options)` - Run closeout verification
- `CloseoutReport` interface - Closeout results

**From `src/core/types.ts`**:
- `Task` - Task interface
- `Manifest` - Manifest interface
- `TaskStatus` - Status enum

## Anti-Patterns to Avoid

❌ **DO NOT**:
- Import CLI libraries (chalk, ora, Commander) in `src/core/prepare.ts`
- Modify task status of other tasks (only the target task)
- Generate handover files if dry-run is true
- Proceed if dependencies are not met (without clear error)
- Skip closeout check silently (user must explicitly use --skip-closeout)

✅ **DO**:
- Keep core logic completely separate from CLI presentation
- Validate all inputs before making changes
- Clear verification folder before generating new files
- Use Handlebars templates for all generated content
- Return structured results for both CLI and JSON consumers

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
3. **Tests**: `npm test` must pass all tests (at least 37 tests for this command)
4. **Integration**: Wire up command in cli.ts and verify `orchestra prepare --help` works
5. **Manual test**: Run `orchestra prepare --dry-run` and verify output

## Completion Protocol

When ready for review:

1. Run pre-signal check:

   ```powershell
   .\.orchestra\implementor\.implementor-only\scripts\pre-signal-check.ps1 -TaskId 6
   ```

2. Update `.orchestra/handover/completion-signal.md` with:

   - Task ID: 6
   - Status: COMPLETE/FAILED
   - Files created (3 new files, 2 updated)
   - Test count (37+ tests)
   - Any notes or decisions

3. Signal ready: Say "ready for review" or "task complete"

---

_This handover was generated by Orchestra. Do not read files in `.orchestra/orchestrator/.orchestrator-only/`._
