# Task Validator Reference

This document describes what the `validate-handover.ps1` script checks.

## Validation Rules

### 1. Required Files

- `current-task.md` must exist in handover folder
- `task-context.md` must exist in handover folder

### 2. Task ID Format

The current-task.md must contain a valid task ID in the format:
```
# Task X.Y: Title
```

Where X.Y is a version-like identifier (e.g., 1.1, 1.2, 2.1).

### 3. Required Sections

current-task.md must contain:
- `## Overview` - What the task is about
- `## Acceptance Criteria` - Checklist of completion criteria
- `## Files to Create/Modify` - What files you'll work on

### 4. Spec File (Optional)

If a spec file is referenced:
- It should be a valid path relative to project root
- The file should exist

## What to Do If Validation Fails

1. Write failure details to `completion-signal.md`
2. Set status to `BLOCKED`
3. Describe what's missing
4. Say: "Task validation failed - see completion-signal.md for required fixes"
5. STOP and wait for orchestrator
