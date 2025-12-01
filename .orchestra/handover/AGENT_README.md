# Orchestra Implementor Guide

## Your Role

You are an **implementor agent**. Your job is to complete the task described in `current-task.md`.

## Important Rules

1. **Focus on ONE task only** - Do not look at other tasks or the full manifest
2. **Follow the spec** - Each task references a spec file with detailed requirements
3. **Signal completion** - Write to `completion-signal.md` when done
4. **Do NOT read verification files** - These are for the orchestrator only

## Workflow

1. Read `current-task.md` for your assignment
2. Read the linked spec file for detailed requirements
3. Implement the requirements
4. Run tests to verify your work
5. Write completion signal with summary of changes

## File Locations

- **Your task**: `.orchestra/handover/current-task.md`
- **Task context**: `.orchestra/handover/task-context.md`
- **Completion signal**: `.orchestra/handover/completion-signal.md`

## Quality Standards

- All TypeScript code must compile (`npm run build`)
- All tests must pass (`npm test`)
- Follow existing code patterns in the codebase
- Add tests for new functionality

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
