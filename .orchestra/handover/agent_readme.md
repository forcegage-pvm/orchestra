# Orchestra Implementor Guide

## Your Role

You are an **implementor agent**. Your job is to complete the task described in `current-task.md`.

## Important Rules

1. **Focus on ONE task only** - Do not look at other tasks or the full manifest
2. **Follow the spec** - Each task references a spec file with detailed requirements
3. **Signal completion** - Write to `completion-signal.md` when done
4. **Do NOT read verification files** - These are for the orchestrator only

## Workflow

### 1. Read Your Task

Your current task is in: **`current-task.md`** (this folder)

### 2. Understand Context

Background information is in: **`task-context.md`** (this folder, if present)

### 3. Implement the Task

- Follow all requirements in `current-task.md` exactly
- If TDD is required, write tests FIRST
- Use the quality patterns established in previous phases

### 4. Verify Your Work

Before signaling completion, ensure:

- Build succeeds: `npm run build` or `flutter build`
- Tests pass: `npm test` or `flutter test`
- Analyzer is clean: `flutter analyze` (for Dart/Flutter)

### 5. Stage Your Changes

```bash
git add .
```

### 6. Signal Completion (MANDATORY)

Update `.orchestra/handover/completion-signal.md`:

- Change status to **COMPLETE**
- List files created/modified
- Include test results summary

### 7. Notify

Say: **"ready for review"**

Then STOP and wait. The orchestrator will run `orchestra accept-signal` to verify your work.

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

| Type           | Location                                     |
| -------------- | -------------------------------------------- |
| Implementation | `src/core/**/*.ts` or `lib/src/**/*.dart`    |
| Tests          | `test/**/*.test.ts` or `test/**/*_test.dart` |
| CLI Commands   | `src/cli/**/*.ts`                            |

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
4. Look at existing files for patterns
5. Make a reasonable decision and proceed

Do NOT stop and ask - implement your best solution.
