# Feature Specification: Controller Code Review Workflow

**Feature Branch**: `005-code-review-workflow`  
**Created**: 2026-01-17  
**Status**: Draft  
**Input**: User description: "Expand controller agent with a code-review workflow for completed tasks; ad-hoc now, configurable to be blocking after each phase later."

---

## Overview

This feature extends the Controller agent with a formal code review workflow. Reviews can be run ad-hoc against completed tasks today, and the system is designed to support configurable gating (per task, per phase, or ad-hoc). The workflow captures review artifacts (summary, issues, files, tests run, risk rating), enforces role separation, and provides an auditable trail of decisions. The UI adds a persistent sprint-level code review panel and a summary screen for status visibility and actions.

---

## Goals

1. **Ad-hoc code review** of completed tasks with a structured, auditable record.
2. **Controller-only review actions** that cannot modify sprint/task data beyond review status transitions.
3. **Configurable gating** so code review can be optional, task-gated, or phase-gated.
4. **Transparent reporting** in the extension UI and audit logs.
5. **Actionable issue resolution** by routing issues to the right agent with explicit verification of fixes.

## Non-Goals (MVP)

- No auto-diffing or SCM integration beyond storing commit ranges.
- No automated code quality scoring or lint enforcement.
- No non-configurable gating; gating must always be switchable per sprint.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Ad-hoc Code Review (Priority: P1)

As a project owner, I want to request a code review on a completed task so that code quality and maintainability are assessed even after verification is done.

**Acceptance Scenarios**:

1. **Given** a task is in `COMPLETE`, **When** a human supervisor or extension checkpoint triggers a code review, **Then** a review record is created and displayed in the task view.
2. **Given** a pending review exists, **When** the Controller submits approval, **Then** the review record is marked approved with summary, risk, and artifacts.
3. **Given** a pending review exists, **When** the Controller requests changes, **Then** the review record records issues and a decision of `NEEDS_REVISION`.
4. **Given** a pending review exists, **When** the Controller rejects, **Then** the review record records `REJECTED` with blocking issues.

---

### User Story 2 - Optional Task Gate (Priority: P2)

As a project owner, I want to optionally gate task completion on code review so that tasks cannot be marked complete without approval.

**Acceptance Scenarios**:

1. **Given** a sprint is configured with `code_review_policy = task_gate`, **When** a task passes verification, **Then** it transitions to `PENDING_CODE_REVIEW` instead of `COMPLETE`.
2. **Given** a task is `PENDING_CODE_REVIEW`, **When** the Controller approves, **Then** the task transitions to `COMPLETE`.
3. **Given** a task is `PENDING_CODE_REVIEW`, **When** the Controller requests changes, **Then** the task transitions to `CODE_REVIEW_CHANGES_REQUESTED` with review issues logged.

---

### User Story 3 - Phase Gate (Priority: P3)

As a project owner, I want to optionally gate phase transitions on code review so that phases cannot advance until their completed tasks have passed review.

**Acceptance Scenarios**:

1. **Given** a sprint is configured with `code_review_policy = phase_gate`, **When** all tasks in a phase are complete, **Then** the phase transitions to `PENDING_CODE_REVIEW` until all completed tasks in the phase have approved reviews.
2. **Given** all completed tasks in the phase are approved, **When** the next phase is selected, **Then** the system allows workflow progression.
3. **Given** a task review is rejected, **When** the implementor resolves issues and the Controller verifies fixes, **Then** the task can be re-reviewed and approved to unblock the phase.

---

### User Story 4 - Audit Trail (Priority: P2)

As a project owner, I want every code review decision to be logged with artifacts and rationale so that future audits can trace quality decisions.

**Acceptance Scenarios**:

1. **Given** a code review is submitted, **Then** the system records reviewer, timestamp, decision, risk, and issues.
2. **Given** multiple review cycles exist for a task, **Then** the system shows revision counts and prior review links.

---

### User Story 5 - Sprint Code Review Panel (Priority: P1)

As a project owner, I want a persistent sprint-level code review panel in the tree view so I can see status at a glance and take immediate actions.

**Acceptance Scenarios**:

1. **Given** a sprint is active, **When** I view the tree, **Then** I see a Code Review panel below Sprint Explorer with a status snapshot (counts by status and gate mode).
2. **Given** the panel is visible, **When** I click “Run ad-hoc review now”, **Then** reviews are queued for all completed, unreviewed tasks.
3. **Given** review issues exist, **When** I click “Fix code review issues”, **Then** the system launches the implementor agent to resolve issues.

---

### User Story 6 - Code Review Summary Screen (Priority: P2)

As a project owner, I want a summary view of code review status so I can track overall health and unresolved issues.

**Acceptance Scenarios**:

1. **Given** a sprint has reviews, **When** I open the summary screen, **Then** I see totals by status and severity, plus a list of open issues.
2. **Given** I select an issue, **When** I view details, **Then** I see the review decision, files, tests, and recommended fixes.

---

### User Story 7 - Issue Resolution Workflow (Priority: P1)

As a project owner, I want a structured way to fix code review issues and verify they are resolved.

**Acceptance Scenarios**:

1. **Given** a review has issues, **When** fixes are submitted, **Then** the system records fix evidence (summary, files, tests).
2. **Given** fixes are submitted, **When** the Controller verifies them, **Then** the review status updates to approved or changes requested.

---

## Code Review Process (Detailed)

The detailed process requirements are defined in a standalone document: [specs/005-code-review-workflow/code-review-process.md](specs/005-code-review-workflow/code-review-process.md).

---

## UI Requirements (Mandatory)

- A persistent **Code Review** panel in the tree view below Sprint Explorer.
- Panel must show sprint-level snapshot: counts by status, gate mode, and blocking severity threshold.
- Panel must include context-sensitive actions:
  - **Run ad-hoc review now** (requests code review for all completed tasks not yet reviewed)
  - **Fix code review issues** (launches implementor agent in a new chat; disabled when no open issues)
- A **Code Review Summary** screen with:
  - Status totals by decision
  - Open issues list with severity filters (default to at or above blocking threshold). Open issues include decisions of NEEDS_REVISION or REJECTED.
  - Links to review details
- The **Current Task** card must include a **Run code review for this task** action.
  - This is the only action that limits review scope to a single task.
  - Available only for completed tasks.
  - Allows re-review even if already reviewed (creates a new revision).
  - No justification is required to trigger a re-review.

### Trigger Matrix (When vs What)

**Default scope**: All completed tasks that have not been reviewed.

**Triggers**:

- **Current Task card** → Review this task only.
- **Code Review panel** → Ad-hoc review now (all unreviewed).
- **Code Review panel** → Post-phase review (all unreviewed; context-sensitive label).
- **Code Review panel** → Post-task review (all unreviewed; context-sensitive label).

When phase/task gating is enabled, completion forces review (blocking gate). Manual triggers remain available mid-phase but do not override required post-completion review.

Manual trigger actions are disabled when there are zero completed, unreviewed tasks.

Auto-triggered reviews only enqueue unreviewed tasks; all reviews are performed manually by the Controller agent.

Any review decision counts as reviewed for the purposes of “unreviewed” selection. Failed reviews are handled via the fix/verify loop and do not clear gating until approved.

Phase gating does not create phase-level review records in the MVP; reviews are task-scoped. Phase-level records are reserved for future use.

---

## MCP Tooling (Proposed)

**Orchestrator tools**:

- `resubmit_code_review`

**Implementor tools**:

- `resolve_code_review_issue`
- `submit_code_review_fixes`

**Controller tools**:

- `approve_code_review`
- `request_changes_code_review`
- `reject_code_review`
- `verify_code_review_fixes`

**Shared tools**:

- `get_latest_code_review`
- `get_code_review_history`
- `get_code_review_summary`
- `get_open_code_review_issues`

**System/UI actions (not agent tools)**:

- Trigger code review for a single task (explicit)
- Trigger code review for all completed, unreviewed tasks (default)

---

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST allow a human supervisor or extension checkpoint to trigger a code review for a completed task.
- **FR-002**: Controller MUST be able to submit a code review decision with required artifacts.
- **FR-003**: System MUST record code review decisions with full audit context.
- **FR-004**: System MUST support ad-hoc reviews without changing task status by default.
- **FR-005**: System MUST support an optional task-level gate that inserts `PENDING_CODE_REVIEW` between `VERIFY` and `COMPLETE`.
- **FR-006**: System MUST support a phase-level gate that blocks phase progression on review.
- **FR-007**: Controller MUST NOT be able to modify tasks, handovers, or verification criteria.
- **FR-008**: System MUST expose code review history and status in UI and via MCP tools.
- **FR-009**: System MUST provide a sprint-level code review panel in the tree view with status snapshot and action buttons.
- **FR-010**: System MUST provide a code review summary screen with issue filtering.
- **FR-011**: System MUST allow issues to be routed to a resolution agent with context.
- **FR-012**: System MUST support submitting fix evidence and verifying fixes.
- **FR-013**: System MUST allow sprint-level configuration for code review enablement, gate scope, and blocking severity threshold.
- **FR-014**: System MUST allow ad-hoc review of all completed, unreviewed tasks in the sprint.
- **FR-015**: System MUST allow ad-hoc review of a single task from the Current Task card.
- **FR-016**: System MUST support configurable auto-trigger of code review on task completion, phase completion, or both.
- **FR-017**: System MUST allow manual UI triggers regardless of auto-trigger settings.
- **FR-018**: System MUST expose open code review issues via a dedicated tool for implementor use.
- **FR-019**: Implementor MUST be able to mark individual code review issues as resolved.
- **FR-020**: Controller MUST confirm resolved issues before the review is considered complete.
- **FR-021**: Controller agent prompt MUST be updated to include the code review workflow and reference [specs/005-code-review-workflow/code-review-process.md](specs/005-code-review-workflow/code-review-process.md).

### Non-Functional Requirements

- **NFR-001**: Review submission must be idempotent per revision cycle (duplicate submissions rejected).
- **NFR-002**: No change to verification secrecy; Controller never sees hidden verification criteria.
- **NFR-003**: Review record creation must add < 100ms latency per request on local SQLite.

---

## Security & Role Separation

- Controller tools are **read-only** for sprint/task data and **write-only** for code review records.
- Orchestrator can request or resubmit reviews but cannot edit Controller decisions.
- Implementor has **no access** to review tooling or review records beyond task status.

---

## Success Criteria _(mandatory)_

- **SC-001**: 100% of code reviews include required artifacts (summary, risk, files, tests).
- **SC-002**: Ad-hoc reviews can be created without changing task state.
- **SC-003**: When `task_gate` is enabled, tasks cannot reach `COMPLETE` without Controller approval.
- **SC-004**: Review history is accessible in the UI and via MCP tools.
- **SC-005**: Sprint panel and summary screen are visible with accurate counts and actions.
- **SC-006**: Fix submission and verification loop is auditable end-to-end.

---

## Edge Cases

- **Missing commits**: If commit range is missing, review proceeds but must record `commit_range = null` and `tests_run = NOT_RUN`.
- **Re-review after changes**: A new review must reference previous review and increment revision count.
- **Controller unavailable**: Tasks remain in `PENDING_CODE_REVIEW` when gating is enabled.
- **Task reverted**: If a task is reopened, prior code reviews remain as historical records.

---

## Open Configuration

Global defaults with per-sprint overrides (via sprint settings table):

- `code_review_enabled`: `true | false` (default: `true`)
- `code_review_policy`: `ad_hoc | task_gate | phase_gate` (default: `phase_gate`)
- `code_review_blocking_severity`: `BLOCKING | MAJOR | MINOR` (default: `BLOCKING`)
- `code_review_auto_trigger`: `manual | task | phase | both` (default: `both`)
- `code_review_required_steps`: optional list of workflow steps; if set, applies to all phases in the app

Per-sprint overrides MUST allow changing policy and enablement.

---

## Process Definition

Code review is a Controller-led workflow with evidence-based decisions, tiered issue severity, and a fix/verify loop owned by the implementor. The full process requirements live in [specs/005-code-review-workflow/code-review-process.md](specs/005-code-review-workflow/code-review-process.md).
