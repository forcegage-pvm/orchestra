# TD-023: Code Review Workflow Critical Gaps

**Created**: 2026-01-20  
**Severity**: CRITICAL  
**Sprint**: 005-code-review-workflow  
**Status**: RESOLVED - Implementation Complete  
**Resolution Sprint**: [006-code-review-fix-workflow](../specs/006-code-review-fix-workflow/spec.md)

---

> **Update 2026-01-20**: Sprint 006 has been created to address all issues identified in this document.
> See [spec.md](../specs/006-code-review-fix-workflow/spec.md), [tasks.md](../specs/006-code-review-fix-workflow/tasks.md), and [test-plan.md](../specs/006-code-review-fix-workflow/test-plan.md).

> **Update 2026-01-22**: All items in this TD have been implemented and verified in Sprint 006.

---

## Executive Summary

The code review workflow implemented in Sprint 005 has **critical usability and safety gaps** that make it nearly unusable in practice. The workflow is fragmented, IDs are confusing, there's no clear handoff between agents, and the implementor has no documented instructions for fixing code review issues.

---

## Resolution Summary (Sprint 006)

All P1-P4 issues are resolved with the following implemented changes:

- **Consolidated fix workflow**: Implementor uses a single `fix_code_review` tool with `GET_ISSUES`, `RESOLVE_ISSUE`, and `SUBMIT_FIXES` actions.
- **User-visible task IDs**: All code review flows use the user-facing task number, eliminating internal ID discovery.
- **Controller verification loop**: Controller re-verifies fixes via `submit_code_review` with `verifying_fixes: true`, moving reviews to `PENDING_VERIFICATION` until approved.
- **UI handoff improvements**: Action buttons provide correct agent prompts and reduce manual ID hunting.
- **Safety gate**: Pre-submit validation runs tests before accepting fix submissions.
- **Integration coverage**: End-to-end code review fix workflow validated in Sprint 006 integration tests (Task 10).

Implementation references:

- `fix_code_review` handler and tool registration (Sprint 006 implementation)
- Code review verification flow updates in `submit_code_review`
- Sprint 006 integration test suite for code review fixes

---

## Problems Identified

### 🔴 P1: ID Confusion Nightmare

**Severity**: CRITICAL  
**Impact**: Implementors cannot find their code review issues without manual ID hunting

There are **three different IDs** in play with no clear mapping:

| ID Type              | Example | Where Used          | Who Knows It       |
| -------------------- | ------- | ------------------- | ------------------ |
| `sprint_task_id`     | `5`     | Sprint config, UI   | User, Orchestrator |
| `task_id` (internal) | `16`    | Database, MCP tools | Database only      |
| `review_id`          | `15`    | Code review tools   | Controller only    |

**Current Pain Point**:

```
User: "Fix issues for task 5"
Implementor: calls get_open_code_review_issues({task_id: 5})
Result: "No issues found"  // Wrong ID!

Implementor: "What ID should I use?"
User: "Try 16?" (guessing)
Implementor: calls get_open_code_review_issues({task_id: 16})
Result: Success - but now needs review_id: 15 for submit_code_review_fixes
```

**Root Cause**: Tools require internal database IDs but users only know sprint task IDs.

---

### 🔴 P2: Missing Handoff Mechanism

**Severity**: CRITICAL  
**Impact**: No clear path from "Controller requests changes" to "Implementor fixes"

After Controller calls `request_changes_code_review`:

- ❌ No instruction on HOW to invoke the implementor
- ❌ No indication of what mode/model/chat to use
- ❌ No message template with correct IDs
- ❌ No "next action" button in UI
- ❌ No status visible that action is needed

**Current State**: Controller says "Implementor should submit fixes" then... nothing happens. Human must manually invoke implementor with guessed IDs.

---

### 🔴 P3: Implementor Agent Missing Code Review Instructions

**Severity**: CRITICAL  
**Impact**: Implementor doesn't know how to use code review fix tools

Looking at [orchestra.implementor.agent.md](../extension/agents/orchestra.implementor.agent.md):

**Tools listed but NOT documented**:

- `resolve_code_review_issue` - no usage instructions
- `submit_code_review_fixes` - no usage instructions
- `get_open_code_review_issues` - no usage instructions

The implementor section focuses entirely on the normal task workflow (get_current_task → implement → signal_completion). There is **zero documentation** for the code review fix workflow.

---

### 🔴 P4: No Re-verification Loop

**Severity**: HIGH  
**Impact**: Controller has no notification when fixes are submitted

Current flow:

1. Controller calls `request_changes_code_review` ✅
2. Issues created in database ✅
3. Implementor (somehow) fixes issues ⚠️
4. Implementor calls `submit_code_review_fixes` ✅
5. A record is created in `code_review_fixes` ✅
6. **Nothing happens** ❌

**Missing**:

- No notification to Controller
- No status transition to "awaiting verification"
- No UI indicator that fixes are pending
- Controller must manually poll or be told

---

### 🟡 P5: Dangerous - No Safety Check on Fixes

**Severity**: HIGH  
**Impact**: Fixes may break other things without detection

Current workflow allows:

1. Implementor makes code changes
2. Implementor claims they ran tests
3. Implementor calls `resolve_code_review_issue`
4. Issue marked RESOLVED ✅

**No verification that**:

- Tests actually passed
- Build succeeds
- New issues weren't introduced
- The fix actually addresses the issue

This is in contrast to the normal task workflow which runs pre-signal checks.

---

### 🟡 P6: Two Conflicting Workflows

**Severity**: MEDIUM  
**Impact**: Confusion about which path to use

**Path A (Implementor-centric)** - from code-review-process.md:

1. Implementor calls `get_open_code_review_issues`
2. Implementor calls `resolve_code_review_issue` per issue
3. Implementor calls `submit_code_review_fixes`
4. Controller calls `verify_code_review_fixes`

**Path B (Orchestrator-centric)** - from orchestrator agent:

1. Orchestrator calls `reopen_task`
2. Orchestrator updates handover with `update_handover`
3. Implementor goes through normal signal/verify cycle

**Question**: When should each be used? Are they mutually exclusive? The documentation doesn't clarify.

---

### 🟡 P7: Missing State Machine Enforcement

**Severity**: MEDIUM  
**Impact**: Sprint can complete with unresolved code review issues

The `code_reviews` table has statuses but no enforcement:

- `PENDING` → `IN_REVIEW` → `APPROVED` | `CHANGES_REQUESTED` | `REJECTED`

**Missing states**:

- `FIXING_ISSUES` - implementor is working on fixes
- `PENDING_VERIFICATION` - fixes submitted, awaiting controller

**Missing enforcement**:

- Sprint completion blocked if reviews have `CHANGES_REQUESTED`?
- What happens after 3 rejections?
- How does `CHANGES_REQUESTED` → `APPROVED` happen?

---

## Proposed Solutions

### Solution 1: Add `get_my_code_review_issues` Tool (P1 Fix)

A new implementor tool that requires NO parameters and returns everything needed:

```typescript
// Tool: get_my_code_review_issues
// Role: implementor
// Parameters: none (uses current sprint context)

// Response:
{
  "success": true,
  "review_id": 15,
  "task_id": 16,
  "sprint_task_id": 5,  // User-visible ID
  "task_title": "Implement Orders Tab",
  "review_status": "CHANGES_REQUESTED",
  "issues": [
    {
      "issue_id": 9,
      "severity": "MAJOR",
      "issue": "OrdersTab default pageSize should be 25",
      "file": "src/OrdersTab.tsx",
      "recommendation": "Update default from 10 to 25",
      "status": "OPEN"
    }
  ],
  "next_steps": [
    "Fix each issue listed above",
    "Run tests to verify: npm test",
    "For each issue, call resolve_code_review_issue with issue_id",
    "When all fixed, call submit_code_review_fixes with review_id=15"
  ]
}
```

**Benefits**:

- Zero ID confusion
- Clear next steps
- Works from implementor context

---

### Solution 2: Add New Review States + Transitions (P4, P7 Fix)

Add new states to `code_reviews.status`:

```
PENDING → IN_REVIEW → APPROVED (terminal)
                    → CHANGES_REQUESTED → FIXING_ISSUES → PENDING_VERIFICATION → APPROVED
                                                                              → CHANGES_REQUESTED (loop)
                    → REJECTED (terminal, escalate)
```

**New states**:

- `FIXING_ISSUES`: Auto-set when `request_changes_code_review` is called
- `PENDING_VERIFICATION`: Auto-set when `submit_code_review_fixes` is called

**State transitions enforced by handlers**.

---

### Solution 3: Automatic Status Transitions (P4 Fix)

Modify handlers to auto-transition:

| Handler                       | Current Behavior       | Proposed Behavior                                  |
| ----------------------------- | ---------------------- | -------------------------------------------------- |
| `request_changes_code_review` | Sets CHANGES_REQUESTED | Sets CHANGES_REQUESTED + notifies                  |
| `submit_code_review_fixes`    | Creates fix record     | Creates fix record + sets PENDING_VERIFICATION     |
| `verify_code_review_fixes`    | Updates decision       | Updates decision + sets APPROVED/CHANGES_REQUESTED |

---

### Solution 4: Pre-Submit Validation (P5 Fix)

Before `submit_code_review_fixes` succeeds:

1. Run sprint's configured test command
2. Run typecheck
3. If either fails, reject submission with error
4. Only allow submission if checks pass

This mirrors the pre-signal checks in `signal_completion`.

---

### Solution 5: Add Implementor Code Review Section (P3 Fix)

Add to [orchestra.implementor.agent.md](../extension/agents/orchestra.implementor.agent.md):

```markdown
## Code Review Fix Workflow

When code review identifies issues, you may be invoked to fix them.

### Step 1: Get Your Issues
```

mcp_orchestra-imp_get_my_code_review_issues

````

This returns all open code review issues for your current task. No parameters needed.

### Step 2: Fix Each Issue

1. Read each issue and its recommendation
2. Make the necessary code changes
3. Run tests: `npm test`
4. Verify fixes don't break other functionality

### Step 3: Mark Issues Resolved

For each issue you've fixed:

```json
{
  "issue_id": 9,  // From get_my_code_review_issues
  "summary": "Updated pageSize default to 25 per spec NFR-CM-006",
  "files_changed": ["src/OrdersTab.tsx"],
  "tests_run": ["npm test"]
}
````

### Step 4: Submit All Fixes

When ALL issues are fixed:

```json
{
  "review_id": 15, // From get_my_code_review_issues
  "summary": "Fixed all 3 issues: pageSize, validation, error handling",
  "files_changed": ["src/OrdersTab.tsx", "src/validation.ts"],
  "tests_run": ["npm test"]
}
```

### What Happens Next

After you submit fixes:

1. Review status changes to `PENDING_VERIFICATION`
2. Controller will verify your fixes
3. If approved → Done
4. If more changes needed → You'll be invoked again

```

---

### Solution 6: Clarify Path A vs Path B (P6 Fix)

Update documentation to clarify:

**Path A (Code Review Fix Loop)**: For issues found during code review
- Use when: Controller found issues in completed code
- Flow: Fix issues → submit fixes → controller verifies → approve/loop
- Stays within code review workflow

**Path B (Task Reopen)**: For fundamental rework
- Use when: Implementation is fundamentally wrong and needs complete redo
- Flow: Reopen task → re-prepare handover → full implementation cycle
- Re-enters task workflow

**Decision rule**: If >50% of the code needs rewriting, use Path B. Otherwise, use Path A.

---

### Solution 7: UI Enhancements (P2 Fix)

The "Fix code review issues" button should:

1. Generate correct prompt for implementor:
```

You are being invoked to fix code review issues.

Call `mcp_orchestra-imp_get_my_code_review_issues` to get your assigned issues.
Fix all issues, run tests, then submit fixes.

```

2. Include context in prompt (review_id, task info)

3. After `submit_code_review_fixes`, show UI banner:
   - "Fixes submitted - awaiting controller verification"
   - "Verify Fixes" button that invokes controller

---

## Implementation Priority

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P1 | `get_my_code_review_issues` tool | 2h | Eliminates ID confusion |
| P1 | Implementor agent instructions | 1h | Enables self-service |
| P2 | Auto status transitions | 2h | Clear workflow state |
| P2 | Pre-submit validation | 3h | Safety gate |
| P3 | UI handoff improvements | 4h | Better UX |
| P3 | Documentation cleanup | 2h | Reduces confusion |

**Recommended Approach**: Create a new sprint (006-code-review-workflow-fixes) to address these gaps.

---

## References

- [spec.md](../specs/005-code-review-workflow/spec.md) - Original spec
- [code-review-process.md](../specs/005-code-review-workflow/code-review-process.md) - Process requirements
- [orchestra.implementor.agent.md](../extension/agents/orchestra.implementor.agent.md) - Missing instructions
- [orchestra.controller.agent.md](../extension/agents/orchestra.controller.agent.md) - Has instructions but no handoff

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-20 | Created TD-023 | User reported workflow unusable in practice |
| 2026-01-20 | Prioritized get_my_code_review_issues | Solves biggest pain point with minimal effort |
```
