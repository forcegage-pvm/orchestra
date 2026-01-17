# Sprint Task List: 005-code-review-workflow

**Date**: 2026-01-17  
**Status**: Draft  
**Spec**: [spec.md](spec.md)

---

## TDD Approach

Each feature slice includes:

1. **Red**: write failing tests (unit/integration) for new behavior.
2. **Green**: implement minimal behavior to pass tests.
3. **Refactor**: clean up while keeping tests green.

---

## Phase 0 — Foundations & Schema (TDD)

### T001 — Add code review DB schema + migration (Red)

- **Goal**: Create migrations/tests that fail until schema is added.
- **Scope**:
  - `code_reviews`, `code_review_issues`, `code_review_fixes` tables
  - indexes per spec
  - update migration registry
- **Tests**:
  - Migration creates tables/columns and indexes
  - Migration idempotency

### T002 — Implement schema & migration (Green)

- **Goal**: Implement DB schema and migration so T001 passes.
- **Files**:
  - [src/db/schema.ts](src/db/schema.ts)
  - [src/db/migrations.ts](src/db/migrations.ts)

### T003 — Add shared schemas & config defaults (Red)

- **Goal**: Write tests for Zod schema additions and config defaults.
- **Tests**:
  - `CodeReviewStatus`, `CodeReviewDecision`, `CodeReviewRisk`, `CodeReviewIssue`
  - `code_review_*` config defaults + validation

### T004 — Implement shared schemas & config defaults (Green)

- **Files**:
  - [src/schemas/shared.ts](src/schemas/shared.ts)
  - [src/schemas/config.ts](src/schemas/config.ts)

---

## Phase 1 — MCP Tools (TDD)

### T005 — Tests for review decision tools (Red)

- **Tools**:
  - `approve_code_review`
  - `request_changes_code_review`
  - `reject_code_review`
- **Tests**:
  - Validate input requirements
  - Insert review records
  - Write issues to `code_review_issues`
  - Ensure status transitions per spec

### T006 — Implement review decision tools (Green)

- **Files**:
  - [src/mcp-server/handlers/approve-code-review.ts](src/mcp-server/handlers/approve-code-review.ts)
  - [src/mcp-server/handlers/request-changes-code-review.ts](src/mcp-server/handlers/request-changes-code-review.ts)
  - [src/mcp-server/handlers/reject-code-review.ts](src/mcp-server/handlers/reject-code-review.ts)
  - [src/mcp-server/tools.ts](src/mcp-server/tools.ts)

### T007 — Tests for issue retrieval & resolution tools (Red)

- **Tools**:
  - `get_open_code_review_issues`
  - `resolve_code_review_issue`
- **Tests**:
  - Filter by sprint/task/review
  - Only OPEN issues returned
  - Resolve updates status and audit fields

### T008 — Implement issue retrieval & resolution tools (Green)

- **Files**:
  - [src/mcp-server/handlers/get-open-code-review-issues.ts](src/mcp-server/handlers/get-open-code-review-issues.ts)
  - [src/mcp-server/handlers/resolve-code-review-issue.ts](src/mcp-server/handlers/resolve-code-review-issue.ts)
  - [src/mcp-server/tools.ts](src/mcp-server/tools.ts)

### T009 — Tests for fix submission & verification tools (Red)

- **Tools**:
  - `submit_code_review_fixes`
  - `verify_code_review_fixes`
- **Tests**:
  - Fix submission stores evidence
  - Verification updates review decision/status
  - Only controller can verify

### T010 — Implement fix submission & verification tools (Green)

- **Files**:
  - [src/mcp-server/handlers/submit-code-review-fixes.ts](src/mcp-server/handlers/submit-code-review-fixes.ts)
  - [src/mcp-server/handlers/verify-code-review-fixes.ts](src/mcp-server/handlers/verify-code-review-fixes.ts)
  - [src/mcp-server/tools.ts](src/mcp-server/tools.ts)

### T011 — Tests for summary/history tools (Red)

- **Tools**:
  - `get_latest_code_review`
  - `get_code_review_history`
  - `get_code_review_summary`
- **Tests**:
  - Only task-scope
  - Summary counts by status and open issues

### T012 — Implement summary/history tools (Green)

- **Files**:
  - [src/mcp-server/handlers/get-latest-code-review.ts](src/mcp-server/handlers/get-latest-code-review.ts)
  - [src/mcp-server/handlers/get-code-review-history.ts](src/mcp-server/handlers/get-code-review-history.ts)
  - [src/mcp-server/handlers/get-code-review-summary.ts](src/mcp-server/handlers/get-code-review-summary.ts)
  - [src/mcp-server/tools.ts](src/mcp-server/tools.ts)

---

## Phase 2 — Workflow Triggers & Gating (TDD)

### T013 — Tests for trigger logic (Red)

- **Triggers**:
  - Auto: task completion, phase completion
  - Manual: UI actions
- **Tests**:
  - Only completed, unreviewed tasks are queued
  - Disabled when none exist
  - Re-review allowed per task action

### T014 — Implement trigger logic (Green)

- **Files**:
  - [src/core](src/core) (new helper)
  - [src/mcp-server/handlers](src/mcp-server/handlers) (if any)
  - [extension/src/](extension/src/) (UI wiring)

### T015 — Tests for gating enforcement (Red)

- **Tests**:
  - Phase gate blocks progression until approvals
  - Task gate blocks completion until approvals
  - Failed reviews keep gate closed

### T016 — Implement gating enforcement (Green)

- **Files**:
  - [src/core](src/core)
  - [src/commands](src/commands)
  - [src/mcp-server/handlers](src/mcp-server/handlers)

---

## Phase 3 — Extension UI (TDD)

### T017 — Tests for Code Review panel (Red)

- **Scope**:
  - Snapshot counts
  - Action buttons enabled/disabled
- **Files**:
  - [extension/src/views](extension/src/views)

### T018 — Implement Code Review panel (Green)

- **Scope**:
  - Tree view panel below Sprint Explorer
  - Buttons: ad-hoc review, post-phase, post-task, fix issues

### T019 — Tests for Current Task action (Red)

- **Scope**:
  - Run review for this task (completed only)
  - Re-review allowed

### T020 — Implement Current Task action (Green)

- **Files**:
  - [extension/src/views/webview/currentTaskTemplate.ts](extension/src/views/webview/currentTaskTemplate.ts)
  - [extension/src/views](extension/src/views)

### T021 — Tests for Summary screen (Red)

- **Scope**:
  - Counts and issue list filtering
  - Default filter at or above blocking severity

### T022 — Implement Summary screen (Green)

- **Files**:
  - [extension/src/views](extension/src/views)
  - [extension/src/commands](extension/src/commands)

---

## Phase 4 — Agent Prompt Update

### T023 — Update controller agent instructions

- **Scope**:
  - Add code review workflow section
  - Reference [specs/005-code-review-workflow/code-review-process.md](specs/005-code-review-workflow/code-review-process.md)
- **Files**:
  - [extension/agents/orchestra.controller.agent.md](extension/agents/orchestra.controller.agent.md)

---

## Phase 5 — Validation & Regression

### T024 — Integration tests for end‑to‑end flow (Red)

- **Flow**:
  - Create completed task → auto trigger → controller review → issues → implementor resolution → verification

### T025 — Implement integration tests + docs updates (Green)

- **Scope**:
  - Update quickstart examples
  - Add test harness notes

---

## Notes

- All tests should be written first (red), then implementation (green).
- Keep handler logic in `src/core` where reusable.
- Ensure role separation in MCP tools (`controller`, `implementor`, `shared`).
