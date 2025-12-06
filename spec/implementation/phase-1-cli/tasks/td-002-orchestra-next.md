# TD-002: `orchestra next` Command Specification

> **Status**: Draft  
> **Priority**: High  
> **Created**: 2025-12-05  
> **Author**: Copilot + Human Review

---

## 1. Problem Statement

Users and agents need to know **what workflow action to take next** at any point. Currently:
- Each command outputs its own "Next steps" message
- No unified way to query current workflow position
- No mechanism to detect and report blockers
- Error states don't provide resolution guidance

### Key Distinction

There are TWO tracking dimensions in Orchestra:

| Dimension | Tracks | Example | Stored In |
|-----------|--------|---------|-----------|
| **Sprint Task** | Which task (1, 2, 3...) | "Task 2 is active" | `manifest.current_task_id` |
| **Workflow Step** | Which action within task | "Signal completion" | **TBD - this spec** |

`orchestra next` answers: *"For the current sprint task, what is the next workflow action?"*

---

## 2. Workflow Step Model

### 2.1 Fixed Workflow Sequence

The Orchestra workflow is **fixed and linear** within a task:

```
┌─────────────────────────────────────────────────────────────────┐
│                    TASK WORKFLOW STEPS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [1] PREPARE ──► [2] IMPLEMENT ──► [3] SIGNAL ──► [4] VERIFY   │
│                                           │              │      │
│                                           │         ┌────┴───┐  │
│                                           │         ▼        ▼  │
│                                           │     [5a] PASS  [5b] FAIL
│                                           │         │        │  │
│                                           │         ▼        ▼  │
│                                           │    COMPLETE    RETRY │
│                                           │                  │  │
│                                           ◄──────────────────┘  │
│                                                                 │
│  Special: ESCALATED (terminal until human intervention)        │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Step Definitions

| Step | Actor | Entry Condition | Exit Condition | CLI Command |
|------|-------|-----------------|----------------|-------------|
| PREPARE | Orchestrator | Task is PENDING | Handover files created | `orchestra prepare` |
| IMPLEMENT | Implementor | Handover exists | Work complete | (external) |
| SIGNAL | Implementor | Work complete | Signal file created | `orchestra signal` |
| VERIFY | Orchestrator | Signal exists | Verification report created | `orchestra verify` |
| PASS→COMPLETE | Orchestrator | Verification passed | Task archived | `orchestra complete` |
| FAIL→RETRY | Orchestrator | Verification failed | Feedback created | `orchestra feedback` |
| ESCALATED | Human | Max retries exceeded | Human resolves | `orchestra escalate` |

### 2.3 Sprint-Level Steps (No Active Task)

| Step | Entry Condition | Exit Condition | CLI Command |
|------|-----------------|----------------|-------------|
| INIT | No `.orchestra/` | Orchestra initialized | `orchestra init` |
| CONFIGURE | Orchestra exists, no tasks | Manifest has tasks | (manual edit) |
| SELECT_TASK | Tasks exist, none active | Task prepared | `orchestra prepare` |
| SPRINT_COMPLETE | All tasks complete | Sprint closed | `orchestra closeout` |

---

## 3. State Detection Strategy

### 3.1 Primary Approach: Artifact Inference

Determine workflow step by checking **which artifacts exist**:

```typescript
interface WorkflowState {
  // Sprint-level
  initialized: boolean;      // .orchestra/ exists
  configured: boolean;       // manifest.yaml has tasks
  sprintComplete: boolean;   // all tasks COMPLETE
  
  // Task-level (when task active)
  currentTaskId: number | null;
  currentTaskStatus: TaskStatus | null;
  
  // Workflow step indicators
  handoverExists: boolean;   // .orchestra/handover/current-task.md
  signalExists: boolean;     // .orchestra/handover/completion-signal.md  
  verificationExists: boolean; // .orchestra/orchestrator/results/task-N-verification.yaml
  verificationPassed: boolean | null;
  feedbackExists: boolean;   // .orchestra/handover/feedback.md
  
  // Error states
  errors: WorkflowError[];
}
```

### 3.2 Step Inference Logic

```typescript
function inferWorkflowStep(state: WorkflowState): WorkflowStep {
  // Sprint-level checks first
  if (!state.initialized) return "INIT";
  if (!state.configured) return "CONFIGURE";
  if (state.sprintComplete) return "SPRINT_COMPLETE";
  if (!state.currentTaskId) return "SELECT_TASK";
  
  // Task-level inference
  const task = state.currentTaskStatus;
  
  if (task === "ESCALATED") return "ESCALATED";
  if (task === "BLOCKED") return "BLOCKED";
  
  // Check artifacts in reverse order (most recent action first)
  if (state.feedbackExists) return "IMPLEMENT"; // Retry cycle
  if (state.verificationExists) {
    return state.verificationPassed ? "COMPLETE" : "RETRY";
  }
  if (state.signalExists) return "VERIFY";
  if (state.handoverExists) return "IMPLEMENT";
  
  return "PREPARE";
}
```

### 3.3 Risk Analysis: Inference-Only Approach

| Risk | Scenario | Mitigation |
|------|----------|------------|
| **Stale artifacts** | Signal exists from previous attempt | Check timestamps vs verification |
| **Missing artifacts** | File deleted accidentally | Validate artifact chain |
| **Partial state** | Prepare started but didn't finish | Check for required file set |
| **Race conditions** | Two agents checking simultaneously | N/A for CLI (single user) |

### 3.4 Hybrid Approach: Inference + Explicit Tracking

Add optional explicit state to `progress.yaml`:

```yaml
# progress.yaml
sprint_id: "sprint-001"
workflow_state:
  current_step: "VERIFY"           # Explicit step (optional)
  step_entered_at: "2025-12-05T10:30:00Z"
  last_command: "orchestra signal"
  last_command_at: "2025-12-05T10:30:00Z"
entries:
  - ...
```

**Reconciliation rule**: If explicit state conflicts with inferred state, **trust inference** but log warning.

---

## 4. Command Behavior

### 4.1 Output Format

```bash
$ orchestra next

══════════════════════════════════════════════════════════════════
  ORCHESTRA NEXT
══════════════════════════════════════════════════════════════════

  Sprint:  sprint-001
  Task:    2 - Implement authentication module
  Step:    VERIFY (3 of 5)

──────────────────────────────────────────────────────────────────
  RECOMMENDED ACTION
──────────────────────────────────────────────────────────────────

  ▶ Run verification
  
    Command:  orchestra verify
    Reason:   Completion signal received, verification pending

──────────────────────────────────────────────────────────────────
  ALTERNATIVE ACTIONS
──────────────────────────────────────────────────────────────────

  • orchestra status     View full sprint status
  • orchestra signal     Re-submit completion signal

══════════════════════════════════════════════════════════════════
```

### 4.2 Error State Output

```bash
$ orchestra next

══════════════════════════════════════════════════════════════════
  ORCHESTRA NEXT
══════════════════════════════════════════════════════════════════

  Sprint:  sprint-001
  Task:    2 - Implement authentication module
  Step:    BLOCKED ⚠

──────────────────────────────────────────────────────────────────
  BLOCKER DETECTED
──────────────────────────────────────────────────────────────────

  ✗ Verification failed (attempt 2 of 3)
  
    Error:    Unit tests failing - 3 assertions failed
    Location: .orchestra/orchestrator/results/task-002-verification.yaml
    
  Resolution:
    1. Read feedback: .orchestra/handover/feedback.md
    2. Fix the issues identified
    3. Run: orchestra signal

──────────────────────────────────────────────────────────────────
  CURRENT STATE
──────────────────────────────────────────────────────────────────

  Attempts:     2 / 3
  Last Action:  orchestra feedback (2 minutes ago)
  Blocking:     Verification failures

══════════════════════════════════════════════════════════════════
```

### 4.3 JSON Output

```bash
$ orchestra next --json
```

```json
{
  "sprint": {
    "id": "sprint-001",
    "status": "ACTIVE"
  },
  "task": {
    "id": 2,
    "title": "Implement authentication module",
    "status": "IMPLEMENT"
  },
  "workflow": {
    "step": "VERIFY",
    "stepIndex": 3,
    "totalSteps": 5,
    "enteredAt": "2025-12-05T10:30:00Z"
  },
  "recommendation": {
    "action": "verify",
    "command": "orchestra verify",
    "reason": "Completion signal received, verification pending"
  },
  "alternatives": [
    { "command": "orchestra status", "description": "View full sprint status" },
    { "command": "orchestra signal", "description": "Re-submit completion signal" }
  ],
  "blocker": null,
  "errors": []
}
```

### 4.4 Blocker JSON

```json
{
  "blocker": {
    "type": "VERIFICATION_FAILED",
    "message": "Unit tests failing - 3 assertions failed",
    "location": ".orchestra/orchestrator/results/task-002-verification.yaml",
    "resolution": [
      "Read feedback: .orchestra/handover/feedback.md",
      "Fix the issues identified", 
      "Run: orchestra signal"
    ],
    "attempts": {
      "current": 2,
      "max": 3
    }
  }
}
```

---

## 5. Integration with Existing Commands

### 5.1 Command Output Reuse

Each command already emits "next step" information. Centralize this:

```typescript
// src/core/workflow-hints.ts

export interface WorkflowHint {
  command: string;
  reason: string;
  alternatives?: string[];
}

export const WORKFLOW_HINTS: Record<WorkflowStep, WorkflowHint> = {
  INIT: {
    command: "orchestra init",
    reason: "Orchestra not initialized in this directory",
  },
  CONFIGURE: {
    command: "Edit .orchestra/manifest.yaml",
    reason: "Add tasks to your sprint manifest",
  },
  SELECT_TASK: {
    command: "orchestra prepare",
    reason: "No task in progress, prepare the next one",
  },
  PREPARE: {
    command: "orchestra prepare",
    reason: "Task selected but handover not created",
  },
  IMPLEMENT: {
    command: "Complete implementation, then: orchestra signal",
    reason: "Handover ready, implementor should work and signal",
  },
  SIGNAL: {
    command: "orchestra signal",
    reason: "Implementation complete, submit completion signal",
  },
  VERIFY: {
    command: "orchestra verify",
    reason: "Signal received, run verification",
  },
  COMPLETE: {
    command: "orchestra complete",
    reason: "Verification passed, complete the task",
  },
  RETRY: {
    command: "orchestra feedback",
    reason: "Verification failed, generate feedback for retry",
  },
  ESCALATED: {
    command: "Awaiting human intervention",
    reason: "Task escalated after max retries",
    alternatives: ["orchestra complete --force", "Edit manifest and reset"],
  },
  SPRINT_COMPLETE: {
    command: "orchestra closeout",
    reason: "All tasks complete, close out the sprint",
  },
};
```

### 5.2 Tap Into Existing Command Results

Commands could optionally return their "next hint":

```typescript
// In each command result type
interface PrepareResult {
  // ... existing fields
  nextHint?: WorkflowHint;  // Optional hint for next action
}
```

---

## 6. Implementation Plan

### Phase 1: Core Infrastructure
1. Create `src/core/workflow-state.ts` - State detection logic
2. Create `src/core/workflow-hints.ts` - Hint registry
3. Add `WorkflowStep` type to `src/core/types.ts`

### Phase 2: Command Implementation
1. Create `src/core/next.ts` - Core logic
2. Create `src/commands/next.ts` - CLI command
3. Add tests for state detection

### Phase 3: Integration
1. Add explicit state tracking to `progress.yaml` (optional)
2. Update other commands to record last action
3. Add `--next` flag to other commands to show next step after completion

---

## 7. Open Questions

### Q1: Should we add explicit step tracking?

**Option A**: Inference only
- Pro: No additional state to maintain
- Con: Edge cases may be ambiguous

**Option B**: Inference + explicit tracking ✅ SELECTED
- Pro: Can detect anomalies
- Con: State can get out of sync

**Decision**: Use both inference AND explicit tracking. If they conflict, trust inference but log warning.

### Q2: What about the Implementor role?

The Implementor agent doesn't run orchestrator commands. How do we guide them?

**Options**:
- A) `orchestra next` is orchestrator-only ✅ SELECTED (for now)
- B) Add `--role implementor` flag for implementor-specific guidance
- C) Separate command: `orchestra next-impl` 

**Decision**: Orchestrator-only for now. Implementor guidance via `agent_readme.md`. Parked for future.

### Q3: Should `next` update state?

Should running `orchestra next` record that it was run?

**Decision**: No. `next` is read-only and idempotent. ✅

---

## 8. Success Criteria

- [ ] `orchestra next` exists and runs without error
- [ ] Correctly detects all workflow steps via artifact inference
- [ ] Provides actionable command for each step
- [ ] Shows blockers with resolution steps
- [ ] JSON output works for agent consumption
- [ ] Handles edge cases (missing files, partial state)
- [ ] Tests cover all workflow transitions

---

## 9. Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/core/types.ts` | Modify | Add `WorkflowStep` type |
| `src/core/workflow-state.ts` | Create | State detection logic |
| `src/core/workflow-hints.ts` | Create | Hint registry |
| `src/core/next.ts` | Create | Core `runNext()` function |
| `src/commands/next.ts` | Create | CLI command |
| `src/cli.ts` | Modify | Register command |
| `test/core/workflow-state.test.ts` | Create | State detection tests |
| `test/commands/next.test.ts` | Create | Command tests |

---

## Appendix A: Full State Transition Matrix

| Current Step | Artifact Created | Next Step |
|--------------|-----------------|-----------|
| INIT | `.orchestra/` | CONFIGURE |
| CONFIGURE | `manifest.yaml` with tasks | SELECT_TASK |
| SELECT_TASK | `current-task.md` | IMPLEMENT |
| PREPARE | `current-task.md` | IMPLEMENT |
| IMPLEMENT | `completion-signal.md` | VERIFY |
| SIGNAL | `completion-signal.md` | VERIFY |
| VERIFY (pass) | `verification.yaml` (passed) | COMPLETE |
| VERIFY (fail) | `verification.yaml` (failed) | RETRY |
| COMPLETE | Task archived | SELECT_TASK or SPRINT_COMPLETE |
| RETRY | `feedback.md` | IMPLEMENT |
| ESCALATED | Human intervention | IMPLEMENT or COMPLETE |

---

## Appendix B: Artifact Locations

| Artifact | Path | Indicates |
|----------|------|-----------|
| Orchestra dir | `.orchestra/` | Initialized |
| Manifest | `.orchestra/manifest.yaml` | Configured |
| Current task handover | `.orchestra/handover/current-task.md` | Task prepared |
| Completion signal | `.orchestra/handover/completion-signal.md` | Implementor signaled |
| Verification report | `.orchestra/orchestrator/results/task-NNN-verification.yaml` | Verification run |
| Feedback | `.orchestra/handover/feedback.md` | Retry requested |
| Task archive | `.orchestra/orchestrator/results/task-NNN/` | Task completed |
