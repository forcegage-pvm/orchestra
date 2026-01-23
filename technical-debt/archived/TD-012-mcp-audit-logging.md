# TD-012: MCP Handler Audit Logging

## Status: PARTIALLY COMPLETE

## Problem

MCP tool handlers do not write to the `tool_executions` or `system_logs` tables. When issues occur, we cannot:
- Debug what happened after the fact
- Track agent behavior patterns
- Maintain accountability trail

## Evidence

Task 1 was escalated, but:
- `tool_executions` table is empty
- `system_logs` table is empty
- `signals` table is empty (failed signal not recorded)

## Root Cause

Handlers return results directly without logging to database.

## Solution

Add logging wrapper to all MCP handlers that records:
- Tool name and role
- Input parameters
- Output/result
- Success/failure status
- Error messages
- Duration
- Timestamp

## Implementation

1. ✅ Created `src/mcp-server/handlers/audit-logging.ts` with:
   - `logToolExecution()` - records to tool_executions table
   - `logSystemEvent()` - records to system_logs table
   - `withAuditLogging()` - wrapper for handlers

2. ✅ Updated handlers with audit logging:
   - `escalate-task.ts`
   - `signal-completion.ts`

3. ⏳ Remaining handlers need logging added:
   - All other 20+ handlers

## Priority

P1 - Critical for observability and debugging

## Created

2025-12-10 during Sprint 001 Extension Foundation post-mortem

## Updated

2025-12-10 - Implemented core logging infrastructure and added to critical handlers
