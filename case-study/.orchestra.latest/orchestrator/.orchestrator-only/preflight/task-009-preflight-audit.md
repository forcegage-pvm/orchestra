# Completion Signal

## Task ID
9

## Status
COMPLETE

## Summary
Implemented the `orchestra complete` command that performs post-verification closeout. The command archives task artifacts, updates progress/manifest, clears handover folder, and optionally commits changes.

## Changes Made

### Files Created
- `src/core/complete.ts` - Core completion logic with zero CLI dependencies
  - `runComplete()` - Main function for post-verification closeout
  - `resolveTaskId()` - Resolves task ID from options or current-task.md
  - `validateComplete()` - Validates completion preconditions
  - `createArchive()` - Creates task archive with artifacts
  - `updateProgress()` - Updates progress.yaml with completion
  - `updateManifest()` - Updates manifest.yaml task status
  - `clearHandover()` - Clears handover folder artifacts
  - `gitOperations()` - Git commit and push operations

- `src/commands/complete.ts` - CLI command wrapper
  - `createCompleteCommand()` - Creates Commander command with all options
  - `completeCommand()` - Executes the command
  - Human-readable and JSON output formatting

- `test/commands/complete.test.ts` - Comprehensive test suite with 39 tests
  - Command registration tests (8)
  - Precondition validation tests (4)
  - Archive creation tests (4)
  - Progress update tests (3)
  - Manifest update tests (2)
  - Handover clearing tests (4)
  - Git operations tests (4)
  - Exit codes tests (5)
  - Output formatting tests (5)

### Files Modified
- `src/commands/index.ts` - Added export for complete command
- `src/cli.ts` - Registered complete command with program

## Tests Added
- `test/commands/complete.test.ts` - 39 tests covering:
  - Command registration and option parsing
  - Precondition validation (verification passed, task in progress)
  - Archive creation with metadata
  - Progress/manifest updates
  - Handover clearing (completion-signal, current-task, pre-signal artifacts)
  - Git commit/push operations
  - Exit codes (0=success, 1=not in progress, 2=verification failed, 4=git error)
  - JSON and human-readable output formatting

## Command Interface
```
orchestra complete [options] [message]

Options:
  -t, --task <id>    Task ID to complete
  --commit           Commit changes to git
  --no-commit        Skip git commit
  --push             Push after commit
  --force            Complete without verification check
  --no-next          Don't prepare next task
  --json             Output JSON format
  -v, --verbose      Verbose output
```

## Verification Results
- ✅ TypeScript compiles without errors
- ✅ All 346 tests pass (including 39 new tests)
- ✅ Lint passes (only pre-existing warnings in signal.ts)
- ✅ Pre-signal check passed

## Notes
- Core library has ZERO CLI dependencies (pure logic functions)
- Uses simple-git for git operations (same as closeout.ts)
- Archive includes metadata.json, current-task.md, completion-signal.md, verification report
- Preserves task-context.md and AGENT_README.md during handover clearing
- Follows TDD methodology with 25+ tests as required
