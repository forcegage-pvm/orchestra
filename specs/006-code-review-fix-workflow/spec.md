# Feature Specification: Code Review Workflow Refactor

**Feature Branch**: `006-code-review-fix-workflow`  
**Created**: 2026-01-20  
**Revised**: 2026-01-20  
**Status**: Draft  
**Priority**: CRITICAL  
**Input**: TD-023 - Critical usability and safety gaps in code review workflow

---

## Overview

Sprint 005 introduced a code review workflow with **critical usability gaps** and **excessive tool proliferation**. This sprint performs a comprehensive refactor:

1. **ID Architecture Refactor** - Eliminate internal DB IDs from agent interface; use `(sprint_id, task)` everywhere
2. **Tool Consolidation** - Reduce 12 code review tools → 4 focused tools
3. **State Machine** - Add `FIXING_ISSUES`, `PENDING_VERIFICATION`, and `VERIFIED` states with auto-transitions
4. **Pre-Submit Validation** - Run tests before accepting fixes (only gate for fix submissions)
5. **UI Actions** - Clear buttons to invoke correct agent with correct prompt
6. **Agent Documentation** - Complete instructions for all agents
7. **Full Context Handoffs** - Tool responses include complete handover context for fresh agent instances

---

## Goals

1. **User-Visible IDs Only**: Agents never need to know internal database IDs
2. **Minimal Tools**: 4 code review tools instead of 12
3. **Clear State Machine**: Unambiguous status at every step
4. **Safety Enforcement**: Pre-submit validation prevents broken fixes (only gate for fix submissions)
5. **Seamless Handoffs**: UI buttons invoke correct agent; tools return full context for fresh agent instances
6. **Comprehensive Testing**: End-to-end workflow tests
7. **VERIFIED Task Status**: Tasks transition to VERIFIED after orchestrator verification; COMPLETE only after code review APPROVED

## Non-Goals

- No changes to non-code-review tools (deferred to TD-024)
- No automated code quality scoring
- No AI-assisted issue detection

---

## Part 1: ID Architecture Refactor

### The Problem

The current system has **three confusing IDs**:

| Current Name          | What It Is           | Example |
| --------------------- | -------------------- | ------- |
| `id` (column)         | Auto-increment PK    | 45      |
| `task_id` (column)    | User-visible number  | 5       |
| `task_id` (MCP param) | Actually means `id`! | 45      |

Agents must guess which ID to use, leading to errors like:

```
Agent: get_open_code_review_issues({task_id: 5})  // User thinks "task 5"
Result: "No issues found"  // Wrong! System wanted internal ID 45
```

### The Solution: User-Visible IDs Everywhere

**All MCP tools use user-visible task numbers.** Internal IDs are resolved by handlers.

#### New ID Naming Convention

| Parameter | Meaning                                     | Example        |
| --------- | ------------------------------------------- | -------------- |
| `task`    | User-visible task number from sprint config | `5`            |
| `sprint`  | Sprint ID (optional, defaults to active)    | `"sprint-006"` |
| `phase`   | Phase ID from sprint config                 | `"phase-1"`    |

**Internal IDs (`id` column) are NEVER exposed to agents.**

#### Resolution Pattern (All Handlers)

```typescript
async function resolveTaskId(
  sprint_id: string,
  task_number: number,
): Promise<number> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.sprint_id, sprint_id),
        eq(tasks.task_id, task_number), // task_id column = user-visible number
      ),
    );
  if (!task)
    throw new Error(`Task ${task_number} not found in sprint ${sprint_id}`);
  return task.id; // Return internal ID for DB operations
}
```

#### Backward Compatibility

**None.** We are not in production. Clean break is preferred.

---

## Part 2: Tool Consolidation

### Current State: 12 Code Review Tools

| Tool                          | Role        | Verdict                                      |
| ----------------------------- | ----------- | -------------------------------------------- |
| `claim_code_review`           | controller  | **REMOVE** - Merge into `submit_code_review` |
| `approve_code_review`         | controller  | **REMOVE** - Merge into `submit_code_review` |
| `request_changes_code_review` | controller  | **REMOVE** - Merge into `submit_code_review` |
| `reject_code_review`          | controller  | **REMOVE** - Merge into `submit_code_review` |
| `add_code_review_issues`      | controller  | **REMOVE** - Issues included in decision     |
| `verify_code_review_fixes`    | controller  | **REMOVE** - Merge into `submit_code_review` |
| `get_latest_code_review`      | shared      | **REMOVE** - Merge into `get_code_review`    |
| `get_code_review_history`     | shared      | **REMOVE** - Merge into `get_code_review`    |
| `get_code_review_summary`     | shared      | **KEEP** - Needed for UI dashboards          |
| `get_open_code_review_issues` | shared      | **REMOVE** - Merge into `get_code_review`    |
| `resolve_code_review_issue`   | implementor | **REMOVE** - Merge into `fix_code_review`    |
| `submit_code_review_fixes`    | implementor | **REMOVE** - Merge into `fix_code_review`    |

### New State: 4 Code Review Tools

| Tool                      | Role        | Purpose                           |
| ------------------------- | ----------- | --------------------------------- |
| `submit_code_review`      | controller  | All review decisions              |
| `get_code_review`         | shared      | All queries (both roles can use)  |
| `fix_code_review`         | implementor | All fix actions with full context |
| `get_code_review_summary` | shared      | Sprint dashboard                  |

#### 1. `submit_code_review` (Controller)

**One tool for all controller decisions.** Decision type determines behavior.

```typescript
// Tool: submit_code_review
// Role: controller

interface SubmitCodeReviewInput {
  task: number; // User-visible task number
  sprint?: string; // Optional, defaults to active sprint

  decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";

  summary: string; // Min 30 chars
  risk: "LOW" | "MEDIUM" | "HIGH";
  files_reviewed: string[];
  tests_run?: string[];

  // For CHANGES_REQUESTED / REJECTED:
  issues?: Array<{
    severity: "BLOCKING" | "MAJOR" | "MINOR";
    issue: string;
    file?: string;
    line?: number;
    recommendation?: string;
  }>;

  // For fix verification (controller verifying implementor fixes):
  verifying_fixes?: boolean; // True when verifying submitted fixes
}

interface SubmitCodeReviewOutput {
  success: boolean;
  review_id: number;
  task: number;
  decision: string;
  status: string;
  next_action?: string; // What should happen next
}
```

**Behavior**:

- If no review exists for task → Creates review, claims it, applies decision
- If review in `PENDING` → Claims and applies decision
- If review in `IN_REVIEW` → Applies decision
- If review in `PENDING_VERIFICATION` + `verifying_fixes: true` → Verifies fixes
- Auto-transitions based on decision

#### 2. `get_code_review` (Shared)

**One query tool for all code review information.**

```typescript
// Tool: get_code_review
// Role: shared

interface GetCodeReviewInput {
  // All optional - defaults to active sprint summary
  task?: number; // User-visible task number
  sprint?: string; // Defaults to active sprint

  // Filters
  include_history?: boolean; // Include revision history
  include_issues?: boolean; // Include issues (default: true if task specified)
  issues_status?: "OPEN" | "RESOLVED" | "ALL";
}

interface GetCodeReviewOutput {
  success: boolean;

  // If task specified - single review details
  review?: {
    review_id: number;
    task: number; // User-visible
    task_title: string;
    status: ReviewStatus;
    summary?: string;
    risk?: string;
    decision?: string;
    issues?: CodeReviewIssue[];
    history?: ReviewHistoryEntry[];
    latest_fixes?: FixSubmission;
  };

  // Full handover context for fresh agent instances (always included when task specified)
  handover?: {
    context: string; // Why the task exists, architectural decisions
    context_files: string[]; // Files to read for additional context
    acceptance_criteria: Array<{ criterion: string; verification: string }>;
    deliverables: string[];
    file_operations: Array<{
      operation: string;
      path: string;
      description: string;
    }>;
  };

  // If no task - sprint summary
  summary?: {
    sprint: string;
    total_reviews: number;
    by_status: Record<ReviewStatus, number>;
    pending_verification: number;
    open_issues: number;
  };

  next_action?: string;
}
```

#### 3. `fix_code_review` (Implementor)

**One tool for all implementor fix actions.**

```typescript
// Tool: fix_code_review
// Role: implementor

interface FixCodeReviewInput {
  // Action determines behavior
  action: "GET_ISSUES" | "RESOLVE_ISSUE" | "SUBMIT_FIXES";

  // No task param for GET_ISSUES - auto-discovers from context

  // For RESOLVE_ISSUE:
  issue_id?: number; // Which issue to mark resolved
  fix_summary?: string; // What was done (min 10 chars)

  // For SUBMIT_FIXES:
  summary?: string; // Overall fix summary (min 10 chars)
  files_changed?: string[];
  tests_run?: string[];
  skip_validation?: boolean; // Skip pre-submit test validation
}

interface FixCodeReviewOutput {
  success: boolean;

  // For GET_ISSUES - Full context for fresh implementor instance:
  task?: number; // User-visible task number
  task_title?: string;
  task_description?: string;
  review_status?: string;

  // Full handover context from original task preparation
  handover?: {
    context: string; // Why the task exists, architectural decisions
    context_files: string[]; // Files to read for additional context
    acceptance_criteria: Array<{ criterion: string; verification: string }>;
    deliverables: string[];
    file_operations: Array<{
      operation: string;
      path: string;
      description: string;
    }>;
  };

  // Code review issues to fix
  issues?: Array<{
    issue_id: number;
    severity: string;
    issue: string;
    file?: string;
    line?: number;
    recommendation?: string;
    status: string;
  }>;

  // For RESOLVE_ISSUE:
  issue_id?: number;
  issue_status?: string;
  review_status?: string; // May transition to FIXING_ISSUES

  // For SUBMIT_FIXES:
  fixes_id?: number;
  validation_passed?: boolean;
  validation_output?: string; // Test output if failed
  review_status?: string; // PENDING_VERIFICATION if success

  next_steps: string[]; // Always included - clear guidance
}
```

**Behavior**:

- `GET_ISSUES`: Discovers task from active sprint context, returns all open issues
- `RESOLVE_ISSUE`: Marks issue resolved, transitions to `FIXING_ISSUES` on first resolve
- `SUBMIT_FIXES`: Runs pre-submit validation, transitions to `PENDING_VERIFICATION`

#### 4. `get_code_review_summary` (Shared)

**Keep existing** - needed for UI dashboards. Already well-designed.

```typescript
// Tool: get_code_review_summary
// Role: shared

interface GetCodeReviewSummaryInput {
  sprint?: string; // Defaults to active sprint
}

interface GetCodeReviewSummaryOutput {
  success: boolean;
  sprint: string;
  total_reviews: number;
  by_status: Record<ReviewStatus, number>;
  by_decision: Record<string, number>;
  pending_verification: number;
  open_issues_count: number;
  reviews_needing_action: Array<{
    task: number;
    task_title: string;
    status: string;
    action_needed: string;
  }>;
}
```

---

## Part 3: State Machine Improvements

### New Review Statuses

Add to `code_reviews.status` enum:

- `FIXING_ISSUES` - Implementor actively working on fixes
- `PENDING_VERIFICATION` - Fixes submitted, awaiting controller

### New Task Status: VERIFIED

Add to `tasks.status` enum:

- `VERIFIED` - Orchestrator has verified the task (between VERIFY and COMPLETE)

**Task Lifecycle Change**:

- `complete_task` now transitions to `VERIFIED` (not `COMPLETE`)
- `COMPLETE` is reached only when code review is `APPROVED`
- This ensures every verified task goes through code review before final completion

```
IMPLEMENT → VERIFY → VERIFIED → (code review) → COMPLETE
                         │
                         └──> APPROVED triggers auto-transition to COMPLETE
```

### Complete State Transition Matrix

```
                                    ┌─────────────────────────────────────┐
                                    │            PENDING                  │
                                    │  (Review created, not yet claimed)  │
                                    └──────────────┬──────────────────────┘
                                                   │
                                    submit_code_review (any decision)
                                                   │
                                                   ▼
                                    ┌─────────────────────────────────────┐
                                    │           IN_REVIEW                 │
                                    │    (Controller actively reviewing)  │
                                    └──────────────┬──────────────────────┘
                                                   │
                      ┌────────────────────────────┼────────────────────────────┐
                      │                            │                            │
                      ▼                            ▼                            ▼
        ┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
        │      APPROVED       │     │  CHANGES_REQUESTED  │     │      REJECTED       │
        │   (Terminal state)  │     │  (Needs fixes)      │     │  (Terminal/Escalate)│
        └─────────────────────┘     └──────────┬──────────┘     └─────────────────────┘
                                               │
                               fix_code_review(RESOLVE_ISSUE) - first
                                               │
                                               ▼
                                    ┌─────────────────────────────────────┐
                                    │          FIXING_ISSUES              │
                                    │   (Implementor working on fixes)    │
                                    └──────────────┬──────────────────────┘
                                                   │
                                fix_code_review(SUBMIT_FIXES) - validated
                                                   │
                                                   ▼
                                    ┌─────────────────────────────────────┐
                                    │       PENDING_VERIFICATION          │
                                    │  (Fixes submitted, awaiting review) │
                                    └──────────────┬──────────────────────┘
                                                   │
                      ┌────────────────────────────┼────────────────────────────┐
                      │                            │                            │
    submit_code_review          submit_code_review          submit_code_review
    (APPROVED,                  (CHANGES_REQUESTED,         (REJECTED,
     verifying_fixes)            verifying_fixes)            verifying_fixes)
                      │                            │                            │
                      ▼                            ▼                            ▼
        ┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
        │      APPROVED       │     │  CHANGES_REQUESTED  │     │      REJECTED       │
        │   (Terminal state)  │     │  (Loop back)        │     │  (Terminal/Escalate)│
        └─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

### Auto-Creation of PENDING Review (FR-023)

When `complete_task` transitions a task to VERIFIED:

1. Check if a `code_reviews` record exists for this task
2. If not, auto-create one with `status = PENDING`
3. This ensures every VERIFIED task has a review record awaiting Controller action

```typescript
// In complete_task handler, after setting status = VERIFIED:
const [existingReview] = await db
  .select()
  .from(codeReviews)
  .where(eq(codeReviews.task_id, task.id))
  .limit(1);

if (!existingReview) {
  await db.insert(codeReviews).values({
    sprint_id: sprint.id,
    task_id: task.id,
    phase_id: task.phase_id,
    review_scope: "TASK",
    status: "PENDING",
    summary: `Review pending for task ${task.task_id}: ${task.title}`,
    requested_by: "orchestrator",
    requested_at: new Date().toISOString(),
  });
}
```

### Policy Interaction with VERIFIED (FR-024)

The VERIFIED→COMPLETE transition respects the existing `code_review_policy` configuration:

| Policy       | Behavior for VERIFIED Tasks                                          |
| ------------ | -------------------------------------------------------------------- |
| `ad_hoc`     | Tasks can complete without code review (VERIFIED→COMPLETE automatic) |
| `task_gate`  | Each VERIFIED task requires APPROVED review before COMPLETE          |
| `phase_gate` | Phase blocks until ALL VERIFIED tasks in phase have APPROVED reviews |

**Note**: When `code_review_policy = ad_hoc`:

- A PENDING review is still auto-created (for optional retroactive review)
- However, task immediately transitions VERIFIED → COMPLETE (no blocking)
- The PENDING review can be completed retroactively but is not required
- This differs from `task_gate` where COMPLETE is blocked until APPROVED

### REJECTED Blocking Behavior (FR-025)

When a code review is REJECTED:

1. The task remains at VERIFIED status (cannot complete)
2. **Sprint progression is blocked**: `prepare_task` for ANY task will fail until resolution
3. Error message: `"Sprint blocked: Task {N} has REJECTED code review. Address rejection before preparing new tasks."`

**Resolution paths**:

- Controller re-reviews and approves/requests changes instead
- Human supervisor escalates the task (removes from blocking consideration)

```typescript
// In prepare_task handler, add check:
const rejectedReviews = await db
  .select({ task_id: tasks.task_id })
  .from(codeReviews)
  .innerJoin(tasks, eq(codeReviews.task_id, tasks.id))
  .where(
    and(
      eq(codeReviews.sprint_id, sprint.id),
      eq(codeReviews.status, "REJECTED"),
    ),
  );

if (rejectedReviews.length > 0) {
  throw new Error(
    `Sprint blocked: Task ${rejectedReviews[0].task_id} has REJECTED code review. ` +
      `Address rejection before preparing new tasks.`,
  );
}
```

---

## Part 4: Pre-Submit Validation

### Requirements

- **FR-011**: `fix_code_review(SUBMIT_FIXES)` MUST run sprint's `test_command` before accepting
- **FR-012**: If tests fail, submission MUST be rejected with test output
- **FR-013**: `skip_validation: true` allows bypass with warning recorded
- **FR-014**: Validation timeout follows sprint's `pre_signal_timeout` (default 60s)

### Implementation

```typescript
async function validateBeforeSubmit(sprint: Sprint): Promise<ValidationResult> {
  const testCommand = sprint.test_command || "npm test";
  const timeout = sprint.pre_signal_timeout || 60000;

  const result = await executeWithTimeout(testCommand, timeout);

  return {
    passed: result.exitCode === 0,
    output: result.stdout + result.stderr,
    duration: result.duration,
  };
}
```

---

## Part 5: UI Actions

### Action Button Matrix

| Task Status | Primary Button    | Agent      | Behavior                          |
| ----------- | ----------------- | ---------- | --------------------------------- |
| `VERIFIED`  | **"Code Review"** | Controller | Opens controller for review       |
| `COMPLETE`  | **"Re-review"**   | Controller | Reverts to VERIFIED, opens review |

| Review Status          | Primary Button        | Agent       | Behavior                      |
| ---------------------- | --------------------- | ----------- | ----------------------------- |
| `PENDING`              | "Start Review"        | Controller  | Opens controller chat         |
| `IN_REVIEW`            | (none)                | -           | In progress                   |
| `CHANGES_REQUESTED`    | **"Fix Issues"**      | Implementor | Opens implementor with prompt |
| `FIXING_ISSUES`        | **"Continue Fixing"** | Implementor | Same as above                 |
| `PENDING_VERIFICATION` | **"Verify Fixes"**    | Controller  | Opens controller with context |
| `APPROVED`             | (none)                | -           | Status badge only             |
| `REJECTED`             | "Escalate"            | -           | Opens escalation dialog       |

### Prompts (Minimal - Tools Provide Context)

The prompts are intentionally minimal because the tools return full context. This ensures
fresh agent instances always get complete information from the authoritative source (database).

**Fix Issues (Implementor)**:

```
You are being invoked to fix code review issues.

Call this tool first to get your full task context and issues:

  fix_code_review({ action: "GET_ISSUES" })

This returns:
- Full task handover (context, acceptance criteria, deliverables)
- Context files to read
- All open code review issues with recommendations

Fix each issue, run tests, then submit.
```

**Verify Fixes (Controller)**:

```
Fixes have been submitted for task {task} and are ready for verification.

Call this tool first to get full context:

  get_code_review({ task: {task} })

This returns:
- Full task handover (context, acceptance criteria, deliverables)
- Code review history and issues
- Fix submission details

Review the changes and submit your decision using submit_code_review.
```

**Re-review (Controller)** - For COMPLETE tasks:

```
You are being invoked to re-review a completed task.

This task was previously approved but has been sent back for re-review.
The task status has been reverted from COMPLETE to VERIFIED.

Call this tool first to get full context:

  get_code_review({ task: {task} })

Then perform your review and submit your decision.
```

---

## Part 6: Requirements Summary

### Functional Requirements

| ID     | Requirement                                                                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | All MCP tools MUST use user-visible task numbers, not internal IDs                                                                                                                                                        |
| FR-002 | Handlers MUST resolve `(sprint, task)` → internal ID                                                                                                                                                                      |
| FR-003 | `submit_code_review` MUST handle all controller decisions                                                                                                                                                                 |
| FR-004 | `get_code_review` MUST handle all query scenarios                                                                                                                                                                         |
| FR-005 | `fix_code_review` MUST handle GET_ISSUES, RESOLVE_ISSUE, SUBMIT_FIXES                                                                                                                                                     |
| FR-006 | `fix_code_review(GET_ISSUES)` MUST require no parameters                                                                                                                                                                  |
| FR-007 | State transitions MUST follow state machine diagram                                                                                                                                                                       |
| FR-008 | First issue resolution MUST transition to `FIXING_ISSUES`                                                                                                                                                                 |
| FR-009 | Fix submission MUST transition to `PENDING_VERIFICATION`                                                                                                                                                                  |
| FR-010 | Verification MUST transition based on decision                                                                                                                                                                            |
| FR-011 | Pre-submit validation MUST run tests                                                                                                                                                                                      |
| FR-012 | Failed validation MUST block submission                                                                                                                                                                                   |
| FR-013 | `skip_validation` flag MUST allow bypass with warning                                                                                                                                                                     |
| FR-014 | UI buttons MUST invoke correct agent with correct prompt                                                                                                                                                                  |
| FR-015 | All tools MUST return `next_steps` for agent guidance                                                                                                                                                                     |
| FR-016 | `fix_code_review(GET_ISSUES)` MUST return full handover context                                                                                                                                                           |
| FR-017 | `get_code_review` MUST return handover context when task specified                                                                                                                                                        |
| FR-018 | Handover context MUST include context_files array                                                                                                                                                                         |
| FR-019 | `complete_task` MUST transition to VERIFIED, not COMPLETE                                                                                                                                                                 |
| FR-020 | Code review APPROVED MUST auto-transition task from VERIFIED to COMPLETE                                                                                                                                                  |
| FR-021 | Pre-submit validation is the ONLY gate for fix submissions (no re-verification)                                                                                                                                           |
| FR-022 | UI MUST provide re-review action for COMPLETE tasks (reverts to VERIFIED)                                                                                                                                                 |
| FR-023 | When task transitions to VERIFIED, a `code_reviews` record MUST be auto-created with `status=PENDING` if none exists                                                                                                      |
| FR-024 | VERIFIED→COMPLETE transition MUST respect `code_review_policy`: `ad_hoc` allows completion without review; `task_gate` requires APPROVED review; `phase_gate` blocks phase until all VERIFIED tasks have APPROVED reviews |
| FR-025 | REJECTED code review MUST block `prepare_task` for new tasks until the rejection is resolved (task re-reviewed and approved, or escalated)                                                                                |

### Non-Functional Requirements

| ID      | Requirement                                                   |
| ------- | ------------------------------------------------------------- |
| NFR-001 | All handlers MUST have >90% test coverage                     |
| NFR-002 | `fix_code_review(GET_ISSUES)` MUST respond in <100ms          |
| NFR-003 | Pre-submit validation MUST timeout per sprint config          |
| NFR-004 | All state transitions MUST be audit-logged                    |
| NFR-005 | Breaking changes to old tools MUST remove handlers completely |

---

## Part 7: Agent Instructions Update

### Controller Agent Updates

Update `orchestra.controller.agent.md` with:

````markdown
## Code Review Workflow

### Submitting Reviews

Use `submit_code_review` for ALL code review decisions:

**Approve:**

```json
{
  "task": 5,
  "decision": "APPROVED",
  "summary": "Implementation meets requirements...",
  "risk": "LOW",
  "files_reviewed": ["src/handler.ts", "test/handler.test.ts"]
}
```
````

**Request Changes:**

```json
{
  "task": 5,
  "decision": "CHANGES_REQUESTED",
  "summary": "Several issues found requiring fixes...",
  "risk": "MEDIUM",
  "files_reviewed": ["src/handler.ts"],
  "issues": [
    {
      "severity": "BLOCKING",
      "issue": "Missing input validation",
      "file": "src/handler.ts",
      "line": 45,
      "recommendation": "Add zod schema validation"
    }
  ]
}
```

### Verifying Fixes

When fixes are submitted, verify with:

```json
{
  "task": 5,
  "decision": "APPROVED",
  "verifying_fixes": true,
  "summary": "Fixes properly address all issues...",
  "risk": "LOW",
  "files_reviewed": ["src/handler.ts"]
}
```

````

### Implementor Agent Updates

Update `orchestra.implementor.agent.md` with:

```markdown
## Code Review Fix Workflow

When code review identifies issues, you will be invoked to fix them.

### Step 1: Get Your Issues

Call with no parameters - your issues are auto-discovered:

```json
{ "action": "GET_ISSUES" }
````

Response includes all issues with severity, file, line, and recommendations.

### Step 2: Fix Each Issue

1. Read each issue and recommendation
2. Make code changes to fix each issue
3. Run tests locally
4. Mark each issue resolved:

```json
{
  "action": "RESOLVE_ISSUE",
  "issue_id": 9,
  "fix_summary": "Added input validation per recommendation"
}
```

### Step 3: Submit All Fixes

When ALL issues are fixed and tests pass:

```json
{
  "action": "SUBMIT_FIXES",
  "summary": "Fixed all issues: input validation, error handling",
  "files_changed": ["src/handler.ts", "src/validation.ts"],
  "tests_run": ["npm test"]
}
```

### What Happens Next

1. Pre-submit validation runs your tests
2. If tests fail → Fix issues and try again
3. If tests pass → Review moves to `PENDING_VERIFICATION`
4. Controller verifies your fixes
5. If approved → Done!
6. If changes needed → You'll be invoked again

```

---

## Migration Plan

### Tools to Remove

Delete the following handlers and tool definitions:
- `claim_code_review`
- `approve_code_review`
- `request_changes_code_review`
- `reject_code_review`
- `add_code_review_issues`
- `verify_code_review_fixes`
- `get_latest_code_review`
- `get_code_review_history`
- `get_open_code_review_issues`
- `resolve_code_review_issue`
- `submit_code_review_fixes`

### Tools to Add

Create new handlers:
- `submit_code_review` (controller)
- `get_code_review` (shared)
- `fix_code_review` (implementor)

### Database Changes

1. Add enum values: `FIXING_ISSUES`, `PENDING_VERIFICATION`
2. No schema changes to columns (status is TEXT, not enum constraint)

---

## Testing Strategy

### Unit Tests

| Component | Coverage |
|-----------|----------|
| ID resolution utility | All edge cases |
| `submit_code_review` handler | All decisions, all transitions |
| `get_code_review` handler | All query modes |
| `fix_code_review` handler | All actions, all transitions |
| Pre-submit validation | Pass, fail, timeout, skip |

### Integration Tests

| Scenario | Description |
|----------|-------------|
| Happy path | Controller reviews → Changes → Fix → Submit → Verify → Approved |
| Revision loop | Multiple rounds of changes requested |
| Validation failure | Submit blocked by failing tests |
| ID resolution | User-visible task numbers work end-to-end |

### E2E Tests

| Scenario | Description |
|----------|-------------|
| Full agent workflow | Simulate controller + implementor |
| UI button invocation | Buttons open correct chat |
| Sprint completion gate | Cannot complete with pending reviews |

---

## References

- [TD-023-code-review-workflow-gaps.md](../../technical-debt/TD-023-code-review-workflow-gaps.md) - Problem analysis
- [005-code-review-workflow/spec.md](../005-code-review-workflow/spec.md) - Original spec
- [TD-024](../../technical-debt/TD-024-tool-proliferation-audit.md) - Broader tool audit (to be created)
```
