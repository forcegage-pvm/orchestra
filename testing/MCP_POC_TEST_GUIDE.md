# MCP Server POC Testing Guide

**Date**: 2025-12-09  
**Status**: Ready for testing  
**Build**: All type errors fixed, database schema corrected

---

## Prerequisites

1. **Server Built**: `npm run build` ✅
2. **Server Running**: `npx @modelcontextprotocol/inspector node dist/mcp-server/index.js` ✅
3. **Inspector Open**: MCP Inspector should be running in browser

---

## Test Sequence

### Test 1: Basic Server Connection

**Verify**: Server initializes without errors

**Expected**:
- No SQL errors in server logs
- MCP Inspector shows connected status
- Server reports 21 available tools

**Check**:
```
Tools list in Inspector should show:
- configure_sprint
- add_task, update_task, remove_task
- get_task, get_tasks
- prepare_task
- update_handover, update_verification
- get_current_task
- signal_completion, get_signal
- get_feedback, enhance_feedback
- get_verification_results
- submit_verification_judgment
- complete_task
- escalate_task
- get_sprint_status, get_progress, get_task_history
- closeout
```

---

### Test 2: Configure Sprint (Minimal)

**Tool**: `configure_sprint`

**Input**:
```json
{
  "sprint": {
    "id": "test-sprint-001",
    "name": "Test Sprint",
    "description": "POC test sprint",
    "workflow_step": "CONFIGURE"
  },
  "phases": [
    {
      "phase_id": "setup",
      "phase_name": "Setup Phase",
      "order": 1
    }
  ],
  "tasks": [
    {
      "task_id": 1,
      "phase_id": "setup",
      "title": "Test Task 1",
      "description": "Simple test task",
      "category": "INFRASTRUCTURE",
      "dependencies": [],
      "verification": {
        "structural_checks": [
          {
            "description": "Test file exists",
            "severity": "BLOCKING",
            "path": "test.txt",
            "pattern": ".*"
          }
        ]
      }
    }
  ]
}
```

**Expected Output**:
```json
{
  "success": true,
  "sprint_id": "test-sprint-001",
  "tasks_created": 1,
  "phases_created": 1,
  "summary": {
    "total_tasks": 1,
    "total_phases": 1,
    "total_verification_checks": 1
  }
}
```

**Validation**:
- ✅ No errors
- ✅ Database file created at `data/orchestra.db`
- ✅ Task count matches
- ✅ Verification checks stored

---

### Test 3: Get Sprint Status

**Tool**: `get_sprint_status`

**Input**: `{}` (no parameters)

**Expected Output**:
```json
{
  "sprint_id": "test-sprint-001",
  "name": "Test Sprint",
  "status": "ACTIVE",
  "workflow_step": "CONFIGURE",
  "started_at": "<timestamp>",
  "summary": {
    "total": 1,
    "completed": 0,
    "in_progress": 0,
    "pending": 1
  },
  "phases": [
    {
      "phase_id": "setup",
      "phase_name": "Setup Phase",
      "status": "PENDING",
      "task_count": 1,
      "completed_count": 0
    }
  ],
  "current_task": null
}
```

**Validation**:
- ✅ Sprint metadata correct
- ✅ Phase summaries accurate
- ✅ Task counts correct

---

### Test 4: Get Task Details

**Tool**: `get_task`

**Input**:
```json
{
  "task_id": 1
}
```

**Expected Output**:
```json
{
  "task_id": 1,
  "phase_id": "setup",
  "title": "Test Task 1",
  "description": "Simple test task",
  "category": "INFRASTRUCTURE",
  "status": "PENDING",
  "dependencies": [],
  "verification": {
    "structural_checks": [
      {
        "description": "Test file exists",
        "severity": "BLOCKING",
        "path": "test.txt",
        "pattern": ".*"
      }
    ]
  },
  "retry_count": 0,
  "max_retries": 3,
  "created_at": "<timestamp>",
  "updated_at": "<timestamp>"
}
```

**Validation**:
- ✅ Task details returned
- ✅ Verification criteria visible (orchestrator view)
- ✅ Status is PENDING

---

### Test 5: Prepare Task

**Tool**: `prepare_task`

**Input**:
```json
{
  "task_id": 1,
  "deliverables": [
    "Create test.txt file"
  ],
  "acceptance_criteria": [
    {
      "criterion": "File exists",
      "verification": "test.txt present in root"
    }
  ],
  "file_operations": [
    {
      "operation": "CREATE",
      "path": "test.txt",
      "description": "Create test file"
    }
  ],
  "priority": "P1"
}
```

**Expected Output**:
```json
{
  "success": true,
  "task_id": 1,
  "status": "IMPLEMENT"
}
```

**Validation**:
- ✅ Task status changed to IMPLEMENT
- ✅ Handover created in database
- ✅ No verification criteria leaked

---

### Test 6: Get Current Task (Implementor View)

**Tool**: `get_current_task`

**Input**: `{}` (no parameters)

**Expected Output**:
```json
{
  "task_id": 1,
  "title": "Test Task 1",
  "description": "Simple test task",
  "priority": "P1",
  "acceptance_criteria": [
    {
      "criterion": "File exists",
      "verification": "test.txt present in root"
    }
  ],
  "dependencies": [],
  "file_operations": [
    {
      "operation": "CREATE",
      "path": "test.txt",
      "description": "Create test file"
    }
  ],
  "deliverables": [
    "Create test.txt file"
  ]
}
```

**CRITICAL Validation**:
- ✅ No `verification` field in response
- ✅ Only sees handover data
- ✅ Cannot see other tasks

---

### Test 7: Signal Completion

**Tool**: `signal_completion`

**Input**:
```json
{
  "task_id": 1,
  "summary": "Created test.txt file as specified",
  "artifacts_created": [
    {
      "path": "test.txt",
      "type": "CREATE",
      "description": "Test file created"
    }
  ],
  "tests": [],
  "build_status": "PASS",
  "test_status": "PASS"
}
```

**Expected Output**:
```json
{
  "success": true,
  "signal_id": "<uuid>",
  "status": "GATE_CHECK",
  "pre_signal_checks": {
    "build": { "passed": true, "duration_ms": 0 },
    "test": { "passed": true, "duration_ms": 0 },
    "lint": { "passed": true, "duration_ms": 0 }
  },
  "next_step": "Orchestrator will run verification checks"
}
```

**Validation**:
- ✅ Pre-signal checks ran automatically
- ✅ Signal stored in database
- ✅ Task status changed to GATE_CHECK

---

### Test 8: Get Signal

**Tool**: `get_signal`

**Input**:
```json
{
  "task_id": 1
}
```

**Expected Output**:
```json
{
  "task_id": 1,
  "signal_id": "<uuid>",
  "signaled_at": "<timestamp>",
  "attempt": 1,
  "summary": "Created test.txt file as specified",
  "artifacts_created": [...],
  "tests": [],
  "build_status": "PASS",
  "test_status": "PASS",
  "pre_signal_checks": { ... }
}
```

**Validation**:
- ✅ Signal details returned
- ✅ Artifacts list present
- ✅ Pre-checks visible

---

### Test 9: Submit Verification Judgment (PASS)

**Tool**: `submit_verification_judgment`

**Input**:
```json
{
  "task_id": 1,
  "judgment": "PASS",
  "rationale": "All structural checks passed. File exists as expected."
}
```

**Expected Output**:
```json
{
  "success": true,
  "judgment": "PASS",
  "status": "VERIFY",
  "retry_count": 0,
  "max_retries": 3,
  "can_retry": false,
  "next_step": "Task ready for completion"
}
```

**Validation**:
- ✅ Task status changed to VERIFY
- ✅ No feedback generated (pass case)
- ✅ Ready for completion

---

### Test 10: Complete Task

**Tool**: `complete_task`

**Input**:
```json
{
  "task_id": 1,
  "notes": "Test task completed successfully"
}
```

**Expected Output**:
```json
{
  "success": true,
  "task_id": 1,
  "status": "COMPLETE",
  "completed_at": "<timestamp>",
  "progress": {
    "total_tasks": 1,
    "completed": 1,
    "remaining": 0,
    "next_task_id": null
  }
}
```

**Validation**:
- ✅ Task marked COMPLETE
- ✅ Progress updated
- ✅ Completion timestamp set

---

### Test 11: Get Progress

**Tool**: `get_progress`

**Input**: `{}` (no parameters)

**Expected Output**:
```json
{
  "sprint_id": "test-sprint-001",
  "name": "Test Sprint",
  "summary": {
    "total_tasks": 1,
    "completed": 1,
    "in_progress": 0,
    "pending": 0,
    "percent_complete": 100
  },
  "current_task": null,
  "completed_tasks": [
    {
      "task_id": 1,
      "title": "Test Task 1",
      "completed_at": "<timestamp>"
    }
  ]
}
```

**Validation**:
- ✅ All tasks completed
- ✅ Progress accurate
- ✅ Completed list populated

---

## Advanced Tests (Optional)

### Test 12: Verification Failure Flow

1. Create new task
2. Prepare task
3. Signal completion (implementor)
4. Submit FAIL judgment with failures
5. Get feedback (implementor)
6. Verify feedback sanitized (no verification details)
7. Re-signal after "fixes"
8. Submit PASS judgment
9. Complete task

### Test 13: Task Escalation

1. Create task with max_retries = 1
2. Prepare → Signal → FAIL → RETRY
3. Signal again → FAIL → Max retries exceeded
4. Escalate task
5. Verify status = ESCALATED
6. Check notification created

### Test 14: Multi-Task Workflow

1. Configure sprint with 3 tasks (dependencies: T2 depends on T1, T3 depends on T2)
2. Try to prepare T2 before T1 complete → Should fail
3. Complete T1
4. Prepare T2 → Should succeed
5. Complete T2
6. Prepare T3 → Should succeed

---

## Error Cases to Test

### Database Errors
- [ ] Invalid sprint_id reference
- [ ] Duplicate task_id
- [ ] Invalid dependency reference

### Validation Errors
- [ ] Missing required fields
- [ ] Invalid enum values
- [ ] Circular dependencies

### State Errors
- [ ] Signal on PENDING task
- [ ] Complete on IMPLEMENT task
- [ ] Prepare already IMPLEMENT task

### Role Enforcement (Future)
- [ ] Implementor tries to call orchestrator tool
- [ ] Implementor tries to see verification criteria

---

## Success Criteria

**Minimum POC Success**:
- ✅ Server starts without errors
- ✅ Tests 1-11 pass
- ✅ Database persists data correctly
- ✅ State transitions work
- ✅ No verification leakage (Test 6 critical)

**Full POC Success**:
- ✅ All basic tests pass
- ✅ At least 2 advanced tests pass
- ✅ Error handling works correctly
- ✅ Audit trail complete (get_task_history)

---

## Current Status

**Fixed Issues**:
- ✅ 105 type errors → 0 errors
- ✅ SQL syntax error (references keyword) → Fixed
- ✅ Database schema validated
- ✅ Build successful

**Ready for Testing**:
- Server is running in inspector
- All tools registered
- Database initialization should work now

**Next Steps**:
1. Restart server (with fixed schema)
2. Run Test 1 (verify connection)
3. Run Test 2 (configure sprint)
4. Continue through test sequence

---

## Troubleshooting

**Server won't start**:
- Check `data/orchestra.db` doesn't exist (delete if corrupt)
- Check build succeeded: `npm run build`
- Check Node version: >= 18

**Database errors**:
- Delete `data/orchestra.db` and restart server
- Check schema in `src/db/schema.ts`
- Check init.ts for table creation

**Tool not found**:
- Check `src/mcp-server/tools.ts` for registration
- Check handler file exists in `src/mcp-server/handlers/`
- Rebuild: `npm run build`

**Type errors in responses**:
- Check Zod schema in `src/schemas/`
- Check handler return type matches schema
- Verify JSON.stringify/parse for complex fields

---

## Notes

- Database: SQLite, stored at `data/orchestra.db`
- All JSON fields use `JSON.stringify()` for storage
- Timestamps: ISO 8601 format
- UUIDs: Standard v4 format for signal_id
- Progress tracking: Automatic on all status changes
