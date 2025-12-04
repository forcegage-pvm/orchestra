# Orchestra Implementor Guide

## Your Role

You are an **implementor agent**. Your job is to complete the task described in `current-task.md`.

## Important Rules

1. **Focus on ONE task only** - Do not look at other tasks or the full manifest
2. **Follow the spec** - Each task references a spec file with detailed requirements
3. **Signal completion** - Run `signal-complete.ps1` when done (creates signal file)
4. **Do NOT read verification files** - These are for the orchestrator only

## Workflow

### 0. Validate Task Structure (MANDATORY FIRST STEP)

Before any implementation, run:

```powershell
.\.orchestra\implementor\.implementor-only\scripts\validate-handover.ps1
```

If validation FAILS: 
- Write failure details to completion-signal.md
- Say: "Task validation failed - see completion-signal.md for required fixes"
- STOP and wait for orchestrator to fix

### 1. Read Your Task

Your current task is in: **`current-task.md`** (this folder)

### 2. Understand Context

Background information is in: **`task-context.md`** (this folder)

### 3. Implement the Task

- Follow all requirements in `current-task.md` exactly
- If TDD is required, write tests FIRST
- Use the quality patterns established in previous phases

### 4. Stage Your Changes

```bash
git add .
```

### 5. Run Pre-Signal Check (MANDATORY)

```powershell
.\.orchestra\implementor\.implementor-only\scripts\pre-signal-check.ps1
```

If the script FAILS:
- Fix ALL issues it reports
- Run it again until it PASSES
- Only then proceed to step 6

### 6. Signal Completion (MANDATORY)

Run the signal-complete script:

```powershell
.\.orchestra\implementor\.implementor-only\scripts\signal-complete.ps1
```

This creates a signal file that triggers orchestrator verification.

**Also update** `.orchestra/handover/completion-signal.md`:
- Change status to **COMPLETE**
- List files created/modified
- Include test results summary

### 7. Notify

Say: **"ready for review"**

Then STOP and wait. The orchestrator will verify your work.

## Quality Standards

All code should follow these patterns:

- **TypeScript strict mode** - No `any` types, proper error handling
- **Comprehensive tests** - Cover happy path and edge cases
- **Clean architecture** - Core library has NO CLI dependencies
- **Full documentation** - JSDoc comments on public APIs

## Completion Signal Format

```markdown
# Completion Signal

## Task ID
1.X

## Status
COMPLETE | BLOCKED | NEEDS_REVIEW

## Summary
Brief description of what was implemented.

## Changes Made
- File 1: Description
- File 2: Description

## Tests Added
- Test file and what it covers

## Notes
Any issues, concerns, or suggestions for the orchestrator.
```

## File Locations

| Type | Location |
|------|----------|
| Implementation | `src/core/**/*.ts` |
| Tests | `test/core/**/*.test.ts` |
| CLI Commands | `src/cli/**/*.ts` |

## Commands Reference

```bash
# Build project
npm run build

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint

# Stage changes
git add .
```

## When You're Stuck

1. Re-read `current-task.md` carefully
2. Check `task-context.md` for background
3. Look at the spec file linked in the task
4. Look at existing files in `src/core/` for patterns
5. Make a reasonable decision and proceed

Do NOT stop and ask - implement your best solution.
