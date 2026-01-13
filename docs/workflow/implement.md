# Implement Task

> **Phase**: IMPLEMENT  
> **CLI Command**: `orchestra validate-handover` (first step)  
> **Source**: [templates/handover/agent_readme.md](../../templates/handover/agent_readme.md)

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
- [Quality Gates](#quality-gates)
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
| **Phase** | IMPLEMENT |
| **Role** | Implementor Agent |
| **Trigger** | After orchestrator runs `orchestra prepare` and completes handover |
| **Preconditions** | Handover exists; task status is IMPLEMENT |

---

## Purpose

Execute the task defined in the handover documents. This step:

1. **Reads the handover** - Understand what to build
2. **Implements the solution** - Write code following acceptance criteria
3. **Runs quality checks** - Build, test, lint pass
4. **Creates completion signal** - Document what was done
5. **Stages changes** - Ready for orchestrator review

The implementor agent **works blind** - only the handover documents are visible, never the verification criteria.

---

## Philosophy

Implement is the **execution phase** - translating specifications into working code.

### Why This Matters

The implementor has a focused, constrained view:
- Only sees the current task handover
- Cannot access verification criteria
- Cannot see other tasks or manifest details
- Must work from handover alone

This isolation ensures:
- **No gaming** - Can't optimize for hidden checks
- **Real verification** - Tests real-world understanding
- **Clean boundaries** - Clear responsibility separation

### Trust Boundary

| Implementor CAN Access | Implementor CANNOT Access |
|------------------------|---------------------------|
| `.orchestra/handover/current-task.md` | `.orchestra/orchestrator/.orchestrator-only/` |
| `.orchestra/handover/task-context.md` | `.orchestra/orchestrator/results/` |
| `.orchestra/handover/completion-signal.md` | `.orchestra/manifest.yaml` (full) |
| `.orchestra/handover/agent_readme.md` | Verification criteria anywhere |
| Source code | Other task handovers |
| Test files | Progress history |

### Anti-Patterns This Prevents

| Anti-Pattern | How Implement Prevents It |
|--------------|--------------------------|
| Criteria gaming | Implementor never sees hidden criteria |
| Scope creep | Focused handover limits work |
| Parallel confusion | One task at a time |
| Incomplete signals | Mandatory signal template |
| Untested code | Pre-signal checks enforce quality |

---

## Actions

> Quick reference for all actions in this workflow step.  
> Use Action IDs to reference specific actions in other sections.

### CLI Actions

| ID | Action | Command |
|----|--------|--------|
| A-IMPL-00 | Validate handover | `orchestra validate-handover` |
| A-IMPL-09 | Pre-signal check | `orchestra pre-signal-check` |

### Agent Actions

| ID | Role | Action |
|----|------|--------|
| A-IMPL-01 | Implementor | Read handover documents |
| A-IMPL-02 | Implementor | Understand task requirements |
| A-IMPL-03 | Implementor | Implement solution (code) |
| A-IMPL-04 | Implementor | Write tests (TDD if required) |
| A-IMPL-06 | Implementor | Complete completion signal |
| A-IMPL-07 | Implementor | Stage all changes |
| A-IMPL-08 | Implementor | Notify "ready for review" |

### Manual Actions

| ID | Role | Action | Notes |
|----|------|--------|-------|
| A-IMPL-10 | Human | Assist with blockers | Only if escalated |

### Git Actions

| ID | Action | Level | Command |
|----|--------|-------|--------|
| A-IMPL-11 | Stage changes | **Mandatory** | `git add .` |
| A-IMPL-12 | Commit changes | Recommended | `git commit -m "feat(task-N): description"` |

---

## Execution Sequence

The complete ordered execution of this workflow step:

| Order | Action ID | Type | Action |
|-------|-----------|------|--------|
| 1 | A-IMPL-00 | CLI | `orchestra validate-handover` (MANDATORY) |
| 2 | A-IMPL-01 | Agent | Read `current-task.md` |
| 3 | A-IMPL-02 | Agent | Read `task-context.md` (if present) |
| 4 | A-IMPL-03 | Agent | Implement solution |
| 5 | A-IMPL-04 | Agent | Write tests (TDD first if required) |
| 6 | A-IMPL-09 | CLI | `orchestra pre-signal-check` (MANDATORY) |
| 7 | A-IMPL-06 | Agent | Complete `completion-signal.md` |
| 8 | A-IMPL-11 | Git | Stage all changes |
| 9 | A-IMPL-08 | Agent | Say "ready for review" |

---

## Agent Process

The implementor agent executes the task based solely on handover documents.

### A-IMPL-00: Validate Handover (MANDATORY FIRST STEP)

**Before reading or implementing anything**, validate the handover is complete:

```bash
orchestra validate-handover
```

This command validates:

| Check | What It Verifies |
|-------|------------------|
| V1: Task title | Has proper `# Task N: Title` format |
| V2: Objective | Has objective/overview section |
| V3: Deliverables | Has file operations section |
| V4: TDD section | Has testing requirements |
| V5-V6: CREATE paths | Paths specified, files don't exist yet |
| V7-V8: UPDATE paths | Paths specified, files DO exist |
| V9: No TODOs | No `[TODO]`, `[TBD]`, `[PLACEHOLDER]` markers |
| V10: Code scaffold | Has code examples for new files |
| V11: Test data | Has sample test objects |
| V12-V13: Integration | MUST USE section, demo file (if applicable) |

**Exit Codes:**
- `0`: All checks pass → proceed to A-IMPL-01
- `1`: Blocking checks failed → STOP, notify orchestrator
- `2`: Warnings only → proceed with caution

**If Validation Fails:**
1. Write failure details to `completion-signal.md`
2. Set status to `BLOCKED`
3. Say: "Task validation failed - see completion-signal.md for required fixes"
4. **STOP** and wait for orchestrator to fix handover

### A-IMPL-01: Read Handover Documents

Navigate to the handover folder and read your assignment:

```
.orchestra/handover/
├── current-task.md        # ← PRIMARY: Task instructions
├── task-context.md        # Background context
├── completion-signal.md   # Template to fill out
└── agent_readme.md        # Your workflow guide
```

**Read in order**:
1. `agent_readme.md` - Understand the workflow
2. `current-task.md` - Understand the task
3. `task-context.md` - Understand context (if present)

### A-IMPL-02: Understand Task Requirements

Extract from `current-task.md`:

| Section | What to Extract |
|---------|-----------------|
| `objective` | What you're building |
| `acceptance_criteria` | What "done" looks like |
| `file_operations` | Files to create/modify |
| `test_cases` | Tests to write |
| `dependencies` | External requirements |

**Critical**: If something is unclear, make a reasonable decision and document it in your completion signal. Do NOT stop to ask.

### A-IMPL-03: Implement Solution

Write the code according to acceptance criteria:

```bash
# Typical implementation pattern
1. Create/modify source files per file_operations
2. Follow existing project patterns
3. Use TypeScript strict mode (no `any`)
4. Add JSDoc comments on public APIs
```

**File Locations** (typical):

| Type | Location |
|------|----------|
| Implementation | `src/core/**/*.ts` |
| CLI Commands | `src/commands/**/*.ts` |
| Tests | `test/**/*.test.ts` |

### A-IMPL-04: Write Tests (TDD If Required)

If handover specifies TDD:
1. Write tests FIRST
2. Run tests (should fail)
3. Implement code
4. Run tests (should pass)

If not TDD:
1. Implement code
2. Write tests covering functionality
3. Run tests

**Test Coverage Requirements**:
- Happy path scenarios
- Edge cases mentioned in acceptance criteria
- Error handling paths

### A-IMPL-09: Run Pre-Signal Check (MANDATORY)

**Before completing the signal**, run the pre-signal check:

```bash
orchestra pre-signal-check
```

This command validates your deliverables:

| Check | What It Verifies |
|-------|------------------|
| P1: CREATE files exist | Files specified as CREATE were created |
| P2: CREATE files have content | Created files are not empty (min size) |
| P3: UPDATE files modified | Files specified as UPDATE have git changes |
| P4: Test files exist | Required test files were created |
| P5: Tests pass | All tests execute successfully |
| P6: Build succeeds | TypeScript/build compiles without errors |
| P7: Lint passes | No linting errors |
| P8: Analyzer clean | No analyzer issues in touched files |
| P9: No TODO/FIXME | New files don't contain TODO comments |
| P10: Demo exists (visual) | Demo file created for visual tasks |
| P11: Demo has content | Demo has widget/runnable content |
| P12: Git has changes | You have changes to commit |

**Exit Codes:**
- `0`: All checks pass → creates PASSED artifact, proceed to A-IMPL-06
- `1`: Blocking checks failed → creates FAILED artifact, fix issues first
- `2`: Warnings only → creates PASSED artifact with warnings, can proceed

**Artifact Created:**
```
.orchestra/handover/verification/pre-signal.yaml
```

This artifact is verified by `orchestra accept-signal` when the orchestrator reviews your work.

**If Pre-Signal Check Fails:**
1. Review the failure output
2. Fix the failing checks
3. Re-run `orchestra pre-signal-check`
4. Repeat until all blocking checks pass

### A-IMPL-06: Complete Completion Signal

Fill out `.orchestra/handover/completion-signal.md`:

```markdown
# Completion Signal

## Task ID
[Your task ID]

## Status
COMPLETE

## Summary
[Brief description of what was implemented]

## Changes Made
- [File 1]: [Description of changes]
- [File 2]: [Description of changes]

## Tests Added
- [Test file]: [What it covers]

## Build Status
✓ Passed

## Test Status
✓ X tests passed

## Notes
[Any issues, concerns, or suggestions for the orchestrator]
```

### A-IMPL-07: Stage All Changes

Stage everything for the orchestrator to review:

```bash
git add .
```

**Include**:
- Source files
- Test files
- Completion signal
- Any artifacts created

### A-IMPL-08: Notify Ready

Say exactly:

> **"ready for review"**

Then **STOP**. Wait for the orchestrator to run `orchestra accept-signal`.

---

## CLI Command

### Validate Handover (MANDATORY First Step)

```bash
orchestra validate-handover [options]
```

**Purpose**: Validate handover is complete before starting implementation.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--verbose` | boolean | false | Show all validation checks |
| `--json` | boolean | false | JSON output for scripting |

**Examples:**

```bash
# Validate current handover (normal mode)
orchestra validate-handover

# Verbose output showing all checks
orchestra validate-handover --verbose

# JSON output for automation
orchestra validate-handover --json
```

**Exit Codes:**

| Code | Meaning | Action |
|------|---------|--------|
| 0 | All checks pass | Proceed to implementation |
| 1 | Blocking checks failed | STOP - notify orchestrator |
| 2 | Warnings only | Proceed with caution |

**Validation Checks (V1-V13):**

| ID | Check | Severity |
|----|-------|----------|
| V1 | Has task title format | BLOCKING |
| V2 | Has objective section | BLOCKING |
| V3 | Has deliverables section | BLOCKING |
| V4 | Has TDD/testing section | BLOCKING |
| V5 | CREATE paths specified | BLOCKING |
| V6 | CREATE files don't exist | BLOCKING |
| V7 | UPDATE paths specified | WARNING |
| V8 | UPDATE files exist | BLOCKING |
| V9 | No TODO/TBD markers | BLOCKING |
| V10 | Has code scaffold | WARNING |
| V11 | Has test sample data | WARNING |
| V12 | MUST USE section (integration) | WARNING |
| V13 | Demo file (visual) | WARNING |

### Related Commands (Run by Orchestrator)

| Command | Purpose | When |
|---------|---------|------|
| `orchestra status` | Check current task | Anytime |
| `orchestra accept-signal` | Verify completion signal | After implementor signals |

### Pre-Signal Check (MANDATORY Before Signaling)

```bash
orchestra pre-signal-check [options]
```

**Purpose**: Validate deliverables before signaling completion.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--verbose` | boolean | false | Show all validation checks |
| `--json` | boolean | false | JSON output for scripting |
| `--force` | boolean | false | Create artifact even if checks fail |

**Examples:**

```bash
# Run pre-signal check (normal mode)
orchestra pre-signal-check

# Verbose output showing all checks
orchestra pre-signal-check --verbose

# JSON output for automation
orchestra pre-signal-check --json
```

**Exit Codes:**

| Code | Meaning | Action |
|------|---------|--------|
| 0 | All checks pass | Proceed to signal completion |
| 1 | Blocking checks failed | Fix issues, re-run check |
| 2 | Warnings only | Can proceed with caution |

**Validation Checks (P1-P13):**

| ID | Check | Severity |
|----|-------|----------|
| P1 | CREATE files exist | BLOCKING |
| P2 | CREATE files have content | BLOCKING |
| P3 | UPDATE files modified (git) | BLOCKING |
| P4 | Test files exist | BLOCKING |
| P5 | Tests pass | BLOCKING |
| P6 | Build succeeds | BLOCKING |
| P7 | Lint passes | BLOCKING |
| P8 | Analyzer clean (touched files) | BLOCKING |
| P9 | No TODO/FIXME in new files | WARNING |
| P10 | Demo file exists (visual) | WARNING |
| P11 | Demo has widget content | WARNING |
| P12 | Git has changes | WARNING |
| P13 | Completion signal format valid | BLOCKING |

**Artifact Created:**

```yaml
# .orchestra/handover/verification/pre-signal.yaml
task_id: 3
timestamp: "2025-12-05T10:30:00Z"
status: "PASSED"

checks:
  deliverables:
    status: "PASS"
  tests:
    status: "PASS"
    count: 15
  build:
    status: "PASS"
```

---

## Input

### Required

| Input | Source | Purpose |
|-------|--------|---------|
| `.orchestra/handover/agent_readme.md` | Template | CRITICAL - Core instructions and Workflow guide |
| `.orchestra/handover/current-task.md` | Handover | Primary task instructions |
| `.orchestra/handover/completion-signal.md` | Template | Signal template to fill |


### Optional

| Input | Source | Purpose |
|-------|--------|---------|
| `.orchestra/handover/task-context.md` | Handover | Background context |
| Spec files (linked in handover) | Project | Detailed requirements |

### Forbidden (DO NOT READ)

| Path | Reason |
|------|--------|
| `.orchestra/orchestrator/.orchestrator-only/` | Contains hidden verification |
| `.orchestra/orchestrator/results/` | Verification results |
| `.orchestra/manifest.yaml` | Contains all tasks (focus on one) |
| `.orchestra/progress.yaml` | Contains history (not needed) |

---

## File Impact

### Created (by Implementor)

| Path | Purpose | Created By |
|------|---------|------------|
| `src/**/*.ts` | Implementation files | Implementor |
| `test/**/*.test.ts` | Test files | Implementor |
| `.orchestra/handover/verification/pre-signal.yaml` | Pre-signal check results | CLI |

### Updated (by Implementor)

| Path | Purpose | Updated By |
|------|---------|------------|
| `.orchestra/handover/completion-signal.md` | Fill out signal | Implementor |
| Existing source files | Per file_operations | Implementor |

### Read (by Implementor)

| Path | Purpose |
|------|---------|
| `.orchestra/handover/current-task.md` | Task instructions |
| `.orchestra/handover/task-context.md` | Background context |
| `.orchestra/handover/agent_readme.md` | Workflow guide |
| Spec files (linked) | Detailed requirements |
| Existing source code | Patterns and context |

### Not Touched

| Path | Purpose |
|------|---------|
| `.orchestra/manifest.yaml` | Updated by orchestrator only |
| `.orchestra/progress.yaml` | Updated by orchestrator only |
| `.orchestra/orchestrator/` | Orchestrator domain |

---

## Quality Gates

### Mandatory Before Signaling

| Gate | Command | Must Pass |
|------|---------|-----------|
| Build | `npm run build` | ✅ Zero errors |
| Tests | `npm test` | ✅ All pass |
| Types | `npm run typecheck` | ✅ Zero errors |
| Lint | `npm run lint` | ✅ Zero errors |

### Quality Standards

| Standard | Requirement |
|----------|-------------|
| TypeScript strict mode | No `any` types |
| Error handling | All error paths handled |
| Documentation | JSDoc on public APIs |
| Test coverage | Cover acceptance criteria |
| Clean code | Follow existing patterns |

---

## Git Actions

### Enforcement Levels

| Action | Level | Reason |
|--------|-------|--------|
| Stage changes | **Mandatory** | Orchestrator needs to see all changes |
| Commit changes | **Recommended** | Create checkpoint before review |

### Git Workflow

```bash
# After implementation complete
git add .

# Optional: Create commit
git commit -m "feat(task-N): implement [description]"
```

### Commit Message Format

```
<type>(task-N): <description>

[optional body]

[optional footer]
```

**Types**: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`

---

## Outcome

### Success

| Outcome | Description |
|---------|-------------|
| Code implemented | Source files created/modified |
| Tests written | Test files cover acceptance criteria |
| Quality gates pass | Build, tests, types, lint all pass |
| Signal complete | `completion-signal.md` filled out |
| Changes staged | All files staged with `git add .` |

**What Implementor Says:**
> "ready for review"

### Failure

| Failure | Cause | Resolution |
|---------|-------|------------|
| Build fails | Syntax/import errors | Fix errors, rebuild |
| Tests fail | Logic errors | Debug and fix |
| Type errors | Strict mode violations | Fix type issues |
| Lint fails | Style violations | Fix lint issues |
| Unclear requirements | Incomplete handover | Make best judgment, document in notes |

### Blocked

If completely blocked:
1. Document the blocker in completion signal
2. Set status to `BLOCKED`
3. Say "blocked on [reason]"
4. Wait for orchestrator/human intervention

---

## Next Step

After successful implementation:

| Action | Actor | Purpose |
|--------|-------|---------|
| **Wait** | Implementor | Wait for orchestrator review |
| **Accept signal** | Orchestrator | Run `orchestra accept-signal` |
| **Gate check** | System | Automated verification |
| **Verify** | Orchestrator | Run `orchestra verify` |

> **Next Workflow Step**: [verify.md](verify.md) (Orchestrator phase - after gate check)

---

## Evidence Produced

| Evidence | Location | Purpose |
|----------|----------|---------|
| Source files | `src/**/*.ts` | Implementation |
| Test files | `test/**/*.test.ts` | Verification |
| Completion signal | `.orchestra/handover/completion-signal.md` | Formal completion |
| Pre-signal results | `.orchestra/handover/verification/pre-signal.yaml` | Quality gate proof |
| Staged changes | Git staging area | Ready for review |

### Verification

```bash
# Verify implementation
npm run build
npm test
npm run typecheck
npm run lint

# Check completion signal exists
cat .orchestra/handover/completion-signal.md

# Verify changes staged
git status
```

---

## Implementation Reference

### Source Files

| File | Purpose |
|------|---------|
| [src/commands/validate-handover.ts](../../src/commands/validate-handover.ts) | Validate handover CLI command |
| [src/core/validate-handover.ts](../../src/core/validate-handover.ts) | Validation logic (13 checks) |
| [src/commands/pre-signal-check.ts](../../src/commands/pre-signal-check.ts) | Pre-signal check CLI command |
| [src/core/pre-signal-check.ts](../../src/core/pre-signal-check.ts) | Pre-signal validation logic (12 checks) |
| [templates/handover/agent_readme.md](../../templates/handover/agent_readme.md) | Implementor workflow guide |
| [templates/common/templates/completion-signal.md.hbs](../../templates/common/templates/completion-signal.md.hbs) | Signal template |
| [src/core/signal.ts](../../src/core/signal.ts) | Signal validation logic |
| [src/commands/accept-signal.ts](../../src/commands/accept-signal.ts) | Accept signal command |

### Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `runValidateHandover()` | validate-handover.ts | Handover validation entry point |
| `checkTaskStructure()` | validate-handover.ts | V1-V4 structure checks |
| `checkFilePaths()` | validate-handover.ts | V5-V8 path validation |
| `checkCompleteness()` | validate-handover.ts | V9-V11 completeness checks |
| `checkIntegrationTask()` | validate-handover.ts | V12-V13 integration checks |
| `runPreSignalCheck()` | pre-signal-check.ts | Pre-signal check entry point |
| `checkDeliverables()` | pre-signal-check.ts | P1-P3 deliverable checks |
| `checkTests()` | pre-signal-check.ts | P4-P5 test checks |
| `checkQuality()` | pre-signal-check.ts | P6-P9 quality checks |
| `checkVisualTask()` | pre-signal-check.ts | P10-P11 visual checks |
| `runAcceptSignal()` | signal.ts | Validate completion signal |
| `checkPreSignalExists()` | signal.ts | Check pre-signal artifact |
| `checkPreSignalStatus()` | signal.ts | Verify pre-signal passed |

### Original Scripts (Reference for CLI Implementation)

> ⚠️ **IMPORTANT**: The CLI commands must restore ALL validation from the original scripts.
> See [TD-008](technical-debt.md#td-008-handover-validation-command) and [TD-010](technical-debt.md#td-010-pre-signal-check-command) for degradation analysis.

| Script | Location | Purpose |
|--------|----------|---------|
| `validate-handover.ps1` (Original) | `docs/case-study/.orchestra-original/implementor/.implementor-only/scripts/` | **Full handover validation (~220 lines, 13 checks)** |
| `pre-signal-check.ps1` (Original) | `docs/case-study/.orchestra-original/implementor/.implementor-only/scripts/` | **Full pre-signal validation (~411 lines, 12 checks)** |
| `task-validator.md` (Original) | `docs/case-study/.orchestra-original/implementor/.implementor-only/` | Validation rules reference |
| `check-utils.ps1` | `docs/case-study/.orchestra-original/common/scripts/` | Shared utilities |

**Degraded Scripts (Do NOT Use as Reference):**
| Script | Location | Status |
|--------|----------|--------|
| `validate-handover.ps1` (Latest) | `docs/case-study/.orchestra.latest/.../scripts/` | ❌ Degraded (~50 lines) |
| `pre-signal-check.ps1` (Latest) | `docs/case-study/.orchestra.latest/.../scripts/` | ❌ Degraded (~274 lines) |

---

## Troubleshooting

### Common Issues

#### "Handover validation failed" (Exit Code 1)

```
Error: Handover validation failed - 3 blocking checks failed
```

**Cause**: Handover is incomplete or malformed.

**Resolution**:
```bash
# See detailed validation output
orchestra validate-handover --verbose

# Write failure to signal
# Edit completion-signal.md:
#   Status: BLOCKED
#   Notes: [Copy validation failures]

# Notify orchestrator
# Say: "Task validation failed - see completion-signal.md for required fixes"
# STOP and wait
```

**Common Blocking Failures:**

| Failure | Fix (Orchestrator Must Do) |
|---------|----------------------------|
| No task title | Add `# Task N: Title` format |
| No objective | Add objective/overview section |
| No deliverables | Add file operations section |
| No TDD section | Add testing requirements |
| TODO markers remain | Complete all `[TODO]` placeholders |
| CREATE file exists | Change to UPDATE or delete file first |
| UPDATE file missing | Fix path or change to CREATE |

#### "Handover validation warnings" (Exit Code 2)

```
Warning: Handover validation passed with 2 warnings
```

**Cause**: Non-critical issues detected.

**Resolution**:
- Review warnings carefully
- Decide if you can proceed safely
- Document any assumptions in completion signal notes
- Proceed with implementation

#### "Build failed"

```
Error: TypeScript compilation failed
```

**Cause**: Syntax errors, missing imports, type errors.

**Resolution**:
```bash
# Check errors
npm run build

# Fix issues in source files
# Rebuild
npm run build
```

#### "Tests failed"

```
Error: 2 tests failed
```

**Cause**: Logic errors, incorrect expectations.

**Resolution**:
```bash
# Run tests with details
npm test -- --reporter=verbose

# Debug failing tests
# Fix implementation or tests
npm test
```

#### "Type errors"

```
Error: Type 'string' is not assignable to type 'number'
```

**Cause**: TypeScript strict mode violations.

**Resolution**:
```bash
# Check type errors
npm run typecheck

# Fix type annotations
# Re-check
npm run typecheck
```

#### "Unclear requirements"

**Cause**: Handover doesn't fully specify something.

**Resolution**:
1. Re-read handover carefully
2. Check linked spec files
3. Look at existing code patterns
4. Make a reasonable decision
5. **Document decision in completion signal notes**

Do NOT stop to ask - implement your best judgment.

#### "Missing context file"

```
Error: Cannot find file referenced in handover
```

**Cause**: File path incorrect or file doesn't exist.

**Resolution**:
1. Check if file exists at specified path
2. Search for similar file names
3. If truly missing, document in signal notes

#### "Pre-signal check fails"

```
Pre-signal status: FAILED
```

**Cause**: Quality gates not passing.

**Resolution**:
```bash
# Check which gate failed
cat .orchestra/handover/verification/pre-signal.yaml

# Fix the failing gate
# Re-run pre-signal check
```

---

## TDD Workflow

When handover specifies TDD (Test-Driven Development):

### Step 1: Write Failing Test

```typescript
// test/core/example.test.ts
describe('Example', () => {
  it('should do something', () => {
    const result = doSomething();
    expect(result).toBe('expected');
  });
});
```

### Step 2: Run Test (Should Fail)

```bash
npm test -- test/core/example.test.ts
# Should fail - implementation doesn't exist
```

### Step 3: Implement Minimum Code

```typescript
// src/core/example.ts
export function doSomething(): string {
  return 'expected';
}
```

### Step 4: Run Test (Should Pass)

```bash
npm test -- test/core/example.test.ts
# Should pass now
```

### Step 5: Refactor (If Needed)

Improve code while keeping tests green.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-05 | Initial creation |
| 1.1.0 | 2025-12-05 | Added A-IMPL-00: `orchestra validate-handover` as mandatory first step |
| 1.2.0 | 2025-12-05 | Changed A-IMPL-09 from script to CLI: `orchestra pre-signal-check` |
