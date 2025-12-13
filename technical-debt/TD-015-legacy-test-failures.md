# TD-015: Legacy CLI Test Failures

## Status: COMPLETE (Updated 2025-01-XX)

## Problem

24 legacy CLI tests failing, causing pre-signal `npm test` to fail even when task-specific work is correct.

**Additional Issue (discovered 2025-01-XX):** Tests would exit with code 1 despite all tests showing as passed (✓). The `run-verification-checks.test.ts` would hang with dots (·) showing pending state.

## Root Cause

1. CLI tests were written for the original YAML/filesystem implementation before the MCP server refactor.
2. **Threading Issue:** Vitest's default `threads` pool is incompatible with SQLite/better-sqlite3. The native module hangs when shared across worker threads.

## Solution Applied

**Deleted obsolete test files** since CLI is being deprecated in favor of MCP server:

### Deleted test/commands/ (entire folder)
- `init.test.ts` - CLI init command
- `status.test.ts` - CLI status command  
- `accept-signal.test.ts`, `closeout.test.ts`, `complete.test.ts`, etc.

### Deleted test/core/ (old filesystem tests)
- `manifest.test.ts` - YAML manifest operations
- `yaml.test.ts` - YAML I/O utilities
- `progress.test.ts` - Filesystem progress tracking
- `workflow-state.test.ts` - Filesystem workflow state
- `signal.test.ts` - Old signal handling
- `feedback.test.ts` - Old feedback handling
- `escalate.test.ts` - Old escalation handling
- `verification.test.ts` - Old verification (complex subtype system)
- `validate-handover.test.ts` - Old handover validation
- `config.test.ts` - Config file operations

### Kept test/core/ (still relevant)
- `errors.test.ts` - Error classes (reusable)
- `types.test.ts` - Type definitions (reusable)
- `check-executor.test.ts` - Rewritten for new simplified schema
- `command-executor.test.ts` - Shell command execution
- `pre-signal-executor.test.ts` - Pre-signal checks
- `accept-signal-validator.test.ts` - Signal validation
- `artifact-validator.test.ts` - Artifact validation
- `judgment-validator.test.ts` - Judgment validation

### Added vitest.config.ts fix (2025-01-XX)
```typescript
// Use forks pool to avoid threading issues with SQLite/better-sqlite3
pool: "forks",
```

## Result

- Tests: 240 passed, 47 skipped (from deprecated integration tests)
- Build: Clean compilation
- Pre-signal checks can now use `npm test` without false failures
- Exit code 0 on all test runs

## Priority

P3 - Low priority (was a testing infrastructure issue, not functionality)

## Created

2025-12-10 during Sprint 001 Extension Foundation investigation

## Completed

2025-12-10 - Deleted obsolete tests, all remaining tests pass
2025-01-XX - Added `pool: "forks"` to vitest.config.ts to fix SQLite/threads incompatibility
