# Quickstart: Code Review Fix Workflow

**Sprint**: 006-code-review-fix-workflow  
**Status**: Draft  
**Revised**: 2026-01-20

---

## Purpose

This guide explains how to use the **refactored code review workflow**. Sprint 006 consolidated 12 tools into 4 and standardized on user-visible task numbers.

---

## Key Changes in Sprint 006

| Before                   | After                                  |
| ------------------------ | -------------------------------------- |
| 12 separate tools        | 4 consolidated tools                   |
| Internal IDs (45, 46...) | User-visible task numbers (1, 2, 5...) |
| Complex ID discovery     | Auto-discovery, no params needed       |
| No pre-submit validation | Tests run before accepting fixes       |

---

## The 4 Code Review Tools

| Tool                      | Role        | Purpose              |
| ------------------------- | ----------- | -------------------- |
| `submit_code_review`      | Controller  | All review decisions |
| `get_code_review`         | Shared      | All queries          |
| `fix_code_review`         | Implementor | All fix actions      |
| `get_code_review_summary` | Shared      | Sprint dashboard     |

---

## For Implementors: Fixing Code Review Issues

### Step 1: Discover Your Issues

When invoked to fix code review issues, call this first:

```json
// Call: fix_code_review
{ "action": "GET_ISSUES" }
```

**No other parameters needed!** The tool discovers everything from context.

Example response:

```json
{
  "success": true,
  "task": 5,
  "task_title": "Implement Orders Tab",
  "review_status": "CHANGES_REQUESTED",
  "issues": [
    {
      "issue_id": 9,
      "severity": "MAJOR",
      "issue": "OrdersTab default pageSize should be 25",
      "file": "src/OrdersTab.tsx",
      "line": 42,
      "recommendation": "Update default from 10 to 25"
    }
  ],
  "next_steps": [
    "Fix each issue listed above",
    "Run tests locally",
    "For each issue, call fix_code_review with action=RESOLVE_ISSUE",
    "When all fixed, call fix_code_review with action=SUBMIT_FIXES"
  ]
}
```

### Step 2: Fix the Code

1. Read each issue and its recommendation
2. Make the necessary code changes
3. Run tests locally: `npm test`
4. Verify your fixes don't break other functionality

### Step 3: Mark Issues Resolved

For each issue you've fixed:

```json
// Call: fix_code_review
{
  "action": "RESOLVE_ISSUE",
  "issue_id": 9,
  "fix_summary": "Updated pageSize default to 25 per spec NFR-CM-006"
}
```

### Step 4: Submit All Fixes

When ALL issues are fixed and tests pass:

```json
// Call: fix_code_review
{
  "action": "SUBMIT_FIXES",
  "summary": "Fixed pageSize default to 25, added validation",
  "files_changed": ["src/OrdersTab.tsx"],
  "tests_run": ["npm test"]
}
```

**Note**: Pre-submit validation will run your tests. If they fail, submission is rejected.

### What Happens Next

1. Review status changes to `PENDING_VERIFICATION`
2. Controller will be notified to verify
3. If approved → Done!
4. If more changes needed → You'll be invoked again

---

## For Controllers: Reviewing Code

### Submitting a Review

Use `submit_code_review` for ALL decisions:

**Approve:**

```json
// Call: submit_code_review
{
  "task": 5,
  "decision": "APPROVED",
  "summary": "Implementation meets all requirements, well tested",
  "risk": "LOW",
  "files_reviewed": ["src/OrdersTab.tsx", "test/OrdersTab.test.ts"]
}
```

**Request Changes:**

```json
// Call: submit_code_review
{
  "task": 5,
  "decision": "CHANGES_REQUESTED",
  "summary": "Several issues found requiring fixes",
  "risk": "MEDIUM",
  "files_reviewed": ["src/OrdersTab.tsx"],
  "issues": [
    {
      "severity": "MAJOR",
      "issue": "OrdersTab default pageSize should be 25",
      "file": "src/OrdersTab.tsx",
      "line": 42,
      "recommendation": "Update default from 10 to 25"
    }
  ]
}
```

### Verifying Submitted Fixes

When fixes are submitted and ready for verification:

```json
// Call: submit_code_review
{
  "task": 5,
  "decision": "APPROVED",
  "verifying_fixes": true,
  "summary": "All issues addressed correctly, tests passing",
  "risk": "LOW",
  "files_reviewed": ["src/OrdersTab.tsx"]
}
```

Or if more changes needed:

```json
// Call: submit_code_review
{
  "task": 5,
  "decision": "CHANGES_REQUESTED",
  "verifying_fixes": true,
  "summary": "PageSize fix applied but validation logic still incorrect",
  "risk": "MEDIUM",
  "files_reviewed": ["src/OrdersTab.tsx"],
  "issues": [
    {
      "severity": "MAJOR",
      "issue": "Validation still allows pageSize > 100",
      "recommendation": "Add validation to reject pageSize > 100"
    }
  ]
}
```

### Finding Reviews

**Get a specific review:**

```json
// Call: get_code_review
{ "task": 5 }
```

**Get sprint summary:**

```json
// Call: get_code_review
// No params - returns summary
```

**Get open issues only:**

```json
// Call: get_code_review
{ "task": 5, "issues_status": "OPEN" }
```

---

## UI Actions

### Code Review Panel Buttons

| Review Status        | Button            | Action                             |
| -------------------- | ----------------- | ---------------------------------- |
| CHANGES_REQUESTED    | "Fix Issues"      | Opens implementor chat with prompt |
| FIXING_ISSUES        | "Continue Fixing" | Opens implementor chat with prompt |
| PENDING_VERIFICATION | "Verify Fixes"    | Opens controller chat with prompt  |
| APPROVED             | (none)            | Status badge only                  |
| REJECTED             | "Escalate"        | Opens escalation dialog            |

### Button Prompts

**Fix Issues button sends:**

```
You are being invoked to fix code review issues.

Call this tool to get your issues:
  fix_code_review({ action: "GET_ISSUES" })

This returns all open issues. Fix each one, then submit.
```

**Verify Fixes button sends:**

```
Fixes have been submitted for task 5 and are ready for verification.

Call this to submit your decision:
  submit_code_review({
    task: 5,
    decision: "APPROVED",  // or "CHANGES_REQUESTED"
    verifying_fixes: true,
    ...
  })
```

---

## State Machine

```
           ┌─────────────────┐
           │     PENDING     │
           └────────┬────────┘
                    │ submit_code_review
                    ▼
           ┌─────────────────┐
           │    IN_REVIEW    │
           └────────┬────────┘
                    │
      ┌─────────────┼─────────────┐
      │             │             │
      ▼             ▼             ▼
┌──────────┐ ┌────────────────┐ ┌──────────┐
│ APPROVED │ │CHANGES_REQUESTED│ │ REJECTED │
└──────────┘ └───────┬────────┘ └──────────┘
                     │ fix_code_review(RESOLVE_ISSUE) - first
                     ▼
            ┌─────────────────┐
            │  FIXING_ISSUES  │
            └────────┬────────┘
                     │ fix_code_review(SUBMIT_FIXES)
                     ▼
            ┌─────────────────────┐
            │ PENDING_VERIFICATION │
            └──────────┬──────────┘
                       │ submit_code_review(verifying_fixes)
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
   ┌──────────┐ ┌────────────────┐ ┌──────────┐
   │ APPROVED │ │CHANGES_REQUESTED│ │ REJECTED │
   └──────────┘ └────────────────┘ └──────────┘
                       ↑
                       └── (loop back to fix)
```

---

## Troubleshooting

### "Task 5 not found in sprint sprint-006"

**Cause**: Task number doesn't exist in current sprint  
**Solution**: Check sprint configuration for valid task numbers

### "Pre-submit validation failed"

**Cause**: Tests are failing  
**Solution**: Run tests locally, fix failures, then submit again

### "Review not in fixable state"

**Cause**: Review is APPROVED, PENDING, or IN_REVIEW  
**Solution**: Only reviews in CHANGES_REQUESTED or FIXING_ISSUES can have issues resolved

### Can I skip validation?

**Yes, but only for exceptional cases**:

```json
{
  "action": "SUBMIT_FIXES",
  "summary": "...",
  "skip_validation": true
}
```

A warning is recorded and visible in the review.

---

## ID Reference (Simplified!)

| Parameter  | What It Is                               | Example        |
| ---------- | ---------------------------------------- | -------------- |
| `task`     | User-visible task number                 | `5`            |
| `sprint`   | Sprint ID (optional, defaults to active) | `"sprint-006"` |
| `issue_id` | Individual issue ID                      | `9`            |

**Best Practice**: You never need to know internal database IDs. Just use the task number from the sprint configuration.

---

## Migration from Old Tools

If you were using the old tools, here's the mapping:

| Old Tool                      | New Tool                                                |
| ----------------------------- | ------------------------------------------------------- |
| `claim_code_review`           | `submit_code_review` (auto-claims)                      |
| `approve_code_review`         | `submit_code_review({ decision: "APPROVED" })`          |
| `request_changes_code_review` | `submit_code_review({ decision: "CHANGES_REQUESTED" })` |
| `reject_code_review`          | `submit_code_review({ decision: "REJECTED" })`          |
| `add_code_review_issues`      | Issues included in `submit_code_review`                 |
| `verify_code_review_fixes`    | `submit_code_review({ verifying_fixes: true })`         |
| `get_latest_code_review`      | `get_code_review({ task: N })`                          |
| `get_code_review_history`     | `get_code_review({ task: N, include_history: true })`   |
| `get_open_code_review_issues` | `get_code_review({ task: N, issues_status: "OPEN" })`   |
| `get_my_code_review_issues`   | `fix_code_review({ action: "GET_ISSUES" })`             |
| `resolve_code_review_issue`   | `fix_code_review({ action: "RESOLVE_ISSUE" })`          |
| `submit_code_review_fixes`    | `fix_code_review({ action: "SUBMIT_FIXES" })`           |
