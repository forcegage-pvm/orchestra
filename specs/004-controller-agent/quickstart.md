# Controller Agent Quick Start

**Date**: 2026-01-17  
**Feature**: 004-controller-agent  
**Purpose**: Developer guide for testing and using the Controller Agent feature

---

## Overview

The Controller Agent introduces mandatory review gates in the Orchestra workflow:

1. **Sprint Gate**: After `configure_sprint`, the sprint is blocked until Controller approves
2. **Handover Gate**: After `prepare_task`, the task is blocked until Controller approves

---

## Prerequisites

1. Orchestra extension installed and activated
2. MCP server running with database initialized
3. A specification document in the workspace

---

## Testing the Sprint Review Flow

### Step 1: Configure a Sprint

```typescript
// Using MCP tool
await mcp.call("configure_sprint", {
  sprint: { id: "sprint-test", name: "Test Sprint" },
  phases: [{ phase_id: "phase-1", phase_name: "Phase 1" }],
  tasks: [{
    task_id: 1,
    phase_id: "phase-1",
    title: "Test Task",
    description: "A test task",
    category: "INFRASTRUCTURE",
    dependencies: [],
    verification: { success_criteria: ["It works"] }
  }]
});
```

**Expected**: Sprint status is `PENDING_SPEC_REVIEW`, workflow_step is `SPEC_REVIEW`

### Step 2: Attempt to Prepare Task (Should Fail)

```typescript
await mcp.call("prepare_task", { task_id: 1 });
// Expected: Error "Cannot prepare tasks: Sprint is in PENDING_SPEC_REVIEW status"
```

### Step 3: Controller Approves Sprint

```typescript
await mcp.call("approve_sprint", {
  sprint_id: "sprint-test",
  spec_path: "specs/004-controller-agent/spec.md",
  conformance: "PASS",
  spec_requirements: [
    { id: "FR-001", description: "Test requirement", covered_by_tasks: [1] }
  ]
});
```

**Expected**: Sprint status is `ACTIVE`, workflow_step is `SELECT_TASK`

### Step 4: Prepare Task (Should Work Now)

```typescript
await mcp.call("prepare_task", { task_id: 1 });
```

**Expected**: Task status is `PENDING_HANDOVER_REVIEW`

---

## Testing the Handover Review Flow

### Step 1: Controller Reviews Handover

**Approve**:
```typescript
await mcp.call("approve_handover", {
  task_id: 1,
  spec_path: "specs/004-controller-agent/spec.md",
  spec_task_ref: "T001",
  conformance: "PASS"
});
```

**Or Reject**:
```typescript
await mcp.call("reject_handover", {
  task_id: 1,
  spec_path: "specs/004-controller-agent/spec.md",
  spec_task_ref: "T001",
  issues: [{
    severity: "BLOCKING",
    issue: "Handover missing error handling requirement",
    spec_text: "System MUST handle errors gracefully",
    analysis: "No acceptance criterion for error cases"
  }],
  recommendation: "Add acceptance criteria for error scenarios"
});
```

### Step 2: If Rejected, Orchestrator Revises and Resubmits

```typescript
// First, update the handover
await mcp.call("update_handover", {
  task_id: 1,
  acceptance_criteria: [
    { criterion: "Feature works correctly", verification: "Test passes" },
    { criterion: "Errors handled gracefully", verification: "Error test passes" }  // Added
  ],
  rationale: "Added error handling criteria per Controller feedback"
});

// Then resubmit for review
await mcp.call("resubmit_handover", {
  task_id: 1,
  revision_notes: "Added error handling acceptance criteria as requested"
});
```

---

## Testing Escalation (3 Rejections)

After 3 consecutive rejections of the same sprint or handover, the system should escalate to human supervisor.

```typescript
// Simulate 3 rejections
for (let i = 0; i < 3; i++) {
  await mcp.call("reject_sprint", { sprint_id: "sprint-test", ... });
  await mcp.call("resubmit_sprint", { sprint_id: "sprint-test", ... });
}

// 4th rejection should trigger escalation
const result = await mcp.call("reject_sprint", { sprint_id: "sprint-test", ... });
// Expected: result.escalated = true, result.message = "Escalated to human supervisor"
```

---

## UI Testing

### Sprint Pending Review

1. Configure a sprint
2. Open Sprint Explorer panel
3. **Verify**: Sprint shows yellow "⏳ Awaiting Review" badge
4. Click sprint → webview shows banner: "Awaiting Controller Review"

### Sprint Rejected

1. Reject a sprint via Controller
2. **Verify**: Sprint shows red "❌ Review Failed" badge
3. Webview shows issues and revision guidance

### Task Pending Handover Review

1. Prepare a task (after sprint approved)
2. **Verify**: Task shows "Pending Review" status
3. "Start Implementation" button is disabled

---

## Agent Invocation Testing

### Launch Controller for Sprint Review

1. Configure a sprint (status becomes `PENDING_SPEC_REVIEW`)
2. Click "Start Review" button on sprint
3. **Verify**: 
   - New chat window opens
   - Agent mode is `orchestra.controller`
   - Model is `claude-opus-4-5`
   - Context includes sprint config and spec path

### Launch Controller for Handover Review

1. Prepare a task (status becomes `PENDING_HANDOVER_REVIEW`)
2. Click "Start Review" button on task
3. **Verify**:
   - New chat window opens
   - Agent has handover details and spec in context

---

## Database Verification

### Check spec_reviews table

```sql
SELECT * FROM spec_reviews ORDER BY reviewed_at DESC;
```

**Expected columns**:
- id, sprint_id, task_id, review_type
- decision, conformance
- spec_path, spec_requirements, issues
- reviewed_by, reviewed_at
- revision_count, previous_review_id

### Check amendments table (for handover revisions)

```sql
SELECT * FROM amendments WHERE tool_name = 'update_handover';
```

**Expected**: Amendment records with before/after state for handover updates.

---

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Cannot prepare tasks" | Sprint not approved | Run Controller and approve sprint |
| "Task not in PENDING_HANDOVER_REVIEW" | Wrong status | Check task status, may already be approved |
| Review not recorded | Database not initialized | Run migrations |
| Controller tools not available | Wrong role | Start MCP server with `--role=controller` |

---

## Next Steps

1. Run unit tests: `npm test -- --grep "approve-sprint\|reject-sprint"`
2. Run integration tests: `npm test -- --grep "spec-review-flow"`
3. Test with real sprint and specification document
