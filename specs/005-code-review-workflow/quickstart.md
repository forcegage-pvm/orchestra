# Quickstart: Code Review Workflow

**Feature**: 005-code-review-workflow  
**Status**: Draft

---

## Purpose

This guide explains how to request and complete code reviews using the Controller agent. Defaults enforce phase-level review but can be overridden per sprint.

---

## Manual Review Flow

1. **Complete a task** through the normal verification process.
2. **Trigger a code review** from the UI (sprint panel or Current Task card).
3. **Launch the Controller agent** and perform the review using the `approve_code_review`, `request_changes_code_review`, or `reject_code_review` tools.
4. **View review history** in the task view or via `get_code_review_history`.
5. **If issues are raised**, implementor submits fixes with `submit_code_review_fixes` and asks the Controller to verify via `verify_code_review_fixes`.

---

## Enabling Task Gate (Optional)

Set sprint override `code_review_policy = task_gate`. This inserts a `PENDING_CODE_REVIEW` status between `VERIFY` and `COMPLETE`.

---

## Phase Gate (Default)

Phase completion triggers task-scoped reviews for all completed, unreviewed tasks. Progression is blocked until those tasks are approved unless overridden per sprint.

---

## Auto-Trigger Configuration

Set config `code_review_auto_trigger` to `task`, `phase`, or `both` to automatically start reviews on completion (default: `both`). Use `manual` to require UI actions only.

---

## Artifacts Required for Approval

- Summary (min 30 chars)
- Risk rating (LOW/MEDIUM/HIGH)
- Files reviewed list
- Tests run list (or `NOT_RUN`)
- Issues for `NEEDS_REVISION` or `REJECTED`

---

## Sprint Panel and Summary Screen

- Use the **Code Review** tree panel (below Sprint Explorer) to view sprint status and trigger actions.
- Use the **Code Review Summary** screen to view open issues and overall status.
