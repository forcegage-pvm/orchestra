# TD-013: Signal Recording on Pre-Signal Failure

## Status: COMPLETE

## Problem

When `signal_completion` pre-signal checks fail, the signal is NOT recorded in the database. This means:
- No evidence the implementor attempted completion
- `get_signal` returns null
- Orchestrator has no visibility into what happened

## Evidence

Implementor called `signal_completion` for Task 1:
- Pre-signal `npm test` failed (24 unrelated legacy test failures)
- Signal was rejected with error
- `signals` table has 0 records
- `get_signal(task_id=1)` returns nothing

## Root Cause

`signal-completion.ts` runs pre-signal checks first, and only inserts to `signals` table if checks pass.

## Solution

1. Insert signal record FIRST with PENDING status
2. Run pre-signal checks
3. Update signal status based on check results
4. Store pre-signal check results in signal record

## Implementation

✅ Modified `src/mcp-server/handlers/signal-completion.ts`:

1. Signal inserted BEFORE running pre-signal checks with `build_status: "PENDING"`, `test_status: "PENDING"`
2. Pre-signal checks run after signal creation
3. Signal updated with actual build/test results regardless of pass/fail
4. Error message includes signal_id for reference
5. Added audit logging via `logToolExecution()`

## Priority

P1 - Critical for debugging and process visibility

## Created

2025-12-10 during Sprint 001 Extension Foundation post-mortem

## Completed

2025-12-10 - Implemented signal-first approach with audit logging
