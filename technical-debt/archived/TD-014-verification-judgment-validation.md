# TD-014: Verification Judgment Validation Uses All Historical Results

**Created**: 2025-12-10
**Status**: OPEN → FIXING NOW
**Priority**: HIGH (blocking workflow)
**Sprint**: sprint-001-extension-foundation

## Problem

The `submit_verification_judgment` handler's validation logic (JVC-2) checks for BLOCKING failures across ALL historical verification results for a task, not just the most recent run.

When a task fails verification and is retried:
1. First run: 5 checks run, 1 fails (behav-0) → stored in DB
2. Implementor fixes issue
3. Second run: 5 checks run, all pass → stored in DB  
4. Submit PASS judgment → validation queries ALL 10 results, finds the old failure, rejects

## Expected Behavior

Judgment validation should only consider verification results from the **current signal/attempt**, not historical results from previous failed attempts.

## Observed Error

```
"JVC-2": "PASS judgment not allowed with BLOCKING failures"
"reason": "1 BLOCKING check(s) failed"
"Found 20 verification result(s)"  // Should only be 5 from latest run
```

## Root Cause

The `submit_verification_judgment` handler likely queries:
```sql
SELECT * FROM verification_results WHERE task_id = ?
```

Instead of:
```sql
SELECT * FROM verification_results 
WHERE task_id = ? AND signal_id = (current signal)
```

## Fix Location

`src/mcp-server/handlers/submit-verification-judgment.ts` - Update query to filter by current signal_id

## Related Files

- `src/mcp-server/handlers/submit-verification-judgment.ts`
- `src/db/schema.ts` - verification_results table
