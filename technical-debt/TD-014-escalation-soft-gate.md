# TD-014: Escalation Soft Gate

## Status: COMPLETE

## Problem

`escalate_task` allows immediate escalation without requiring any retry attempts. This enables:
- Premature escalation on first difficulty
- Skipping the retry → feedback → retry loop
- Gaming of the process

## Evidence

Task 1 escalation:
- Implementor received `signal_completion` rejection
- Immediately called `escalate_task` (retry_count was 0/3)
- No attempts to address feedback
- System allowed it

## Root Cause

`escalate-task.ts` does not check retry history before accepting escalation.

## Solution

Add soft gate to escalation:
1. Check task retry count before allowing escalation
2. If retry_count = 0, require `early_escalation_reason` field
3. Record early escalation justification
4. Still allow legitimate early escalations (external blockers, access issues)

## Implementation

✅ Modified `src/schemas/completion.ts`:
- Added `early_escalation_reason` optional field to `EscalateTaskInputSchema`

✅ Modified `src/mcp-server/handlers/escalate-task.ts`:
- Check `task.retry_count === 0` before allowing escalation
- If 0 retries, require `early_escalation_reason` with clear error message
- Log early escalations to `system_logs` via `logSystemEvent()`
- Added audit logging for all escalation attempts

✅ Modified `src/mcp-server/tools.ts`:
- Added `early_escalation_reason` to escalate_task input schema

## Priority

P2 - Important for process integrity

## Created

2025-12-10 during Sprint 001 Extension Foundation post-mortem

## Completed

2025-12-10 - Implemented soft gate with early escalation tracking
