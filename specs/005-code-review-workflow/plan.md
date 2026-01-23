# Implementation Plan: Code Review Workflow

**Branch**: `005-code-review-workflow` | **Date**: 2026-01-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-code-review-workflow/spec.md`

## Summary

Add a Controller-driven code review workflow for completed tasks with configurable gating and auto-triggers. Defaults enforce phase-level review but can be overridden per sprint. Manual review actions remain available.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode, `exactOptionalPropertyTypes: true`)  
**Primary Dependencies**: Drizzle ORM, Zod, MCP SDK, VS Code Extension API  
**Storage**: SQLite (via better-sqlite3) with Drizzle ORM  
**Testing**: Vitest with factory functions for test fixtures  
**Target Platform**: VS Code Extension + MCP Server  
**Constraints**: Role separation; no access to verification criteria; ESM imports use `.js`.

## Constitution Check

| Principle                                    | Status  | Notes                                                                   |
| -------------------------------------------- | ------- | ----------------------------------------------------------------------- |
| **I. Core-First Architecture**               | ✅ PASS | Code review logic can live in `src/core/` and shared by MCP + extension |
| **II. Hidden Verification (NON-NEGOTIABLE)** | ✅ PASS | Controller review is separate from verification criteria                |
| **III. Zod-Validated YAML**                  | ✅ PASS | Config changes use Zod schemas                                          |
| **IV. Structured Error Hierarchy**           | ✅ PASS | New errors use `OrchestraError` subclasses                              |
| **V. ESM with Strict TypeScript**            | ✅ PASS | `.js` extensions for imports                                            |
| **VI. Extension Build & Packaging**          | ✅ PASS | No native module changes                                                |

## Project Structure

```text
specs/005-code-review-workflow/
├── spec.md
├── data-model.md
├── plan.md
├── quickstart.md
└── contracts/
    ├── approve-code-review.schema.ts
    ├── request-changes-code-review.schema.ts
    ├── reject-code-review.schema.ts
    ├── get-latest-code-review.schema.ts
    ├── get-code-review-history.schema.ts
    ├── get-code-review-summary.schema.ts
    ├── get-open-code-review-issues.schema.ts
    ├── submit-code-review-fixes.schema.ts
    ├── resolve-code-review-issue.schema.ts
    ├── verify-code-review-fixes.schema.ts
    ├── resubmit-code-review.schema.ts
    └── request-code-review.schema.ts  # DEPRECATED: Review requests are UI-triggered, not agent tools
```

## Phase Deliverables

### Phase 0: Research

- Confirm current task lifecycle transitions around `VERIFY` → `COMPLETE`.
- Identify where phase transitions are enforced (phase selection, next-phase activation).

### Phase 1: Design & Contracts

- Finalize code review data model and status transitions.
- Define MCP tool contracts for review decisions and issue resolution.
- Define configuration schema extensions for review gating.
- Define UI integration points for sprint panel and summary screen.
- Define fix/verify loop contracts for issue resolution.
- Define updates to controller agent prompt for code review workflow.

### Phase 2: Task Breakdown

- Generate task list via `/speckit.tasks` with:
  - DB schema + migrations
  - MCP handlers + tools registration
  - Extension UI changes (task view + phase view)
  - Tests (unit + integration)

## Requirement Traceability

| Spec Requirement | Implementation Component                         |
| ---------------- | ------------------------------------------------ |
| FR-001           | UI/system trigger + review record creation       |
| FR-002           | Controller tools: approve/request changes/reject |
| FR-003           | `code_reviews` table + audit fields              |
| FR-004           | Default `code_review_policy = phase_gate`        |
| FR-005           | Task status transitions to `PENDING_CODE_REVIEW` |
| FR-006           | Phase status transitions and review enforcement  |
| FR-007           | Role-based tool filtering in MCP server          |
| FR-008           | UI history panel + query handlers                |
| FR-009           | Sprint tree panel + snapshot API                 |
| FR-010           | Summary screen + summary API                     |
| FR-011           | Issue routing action to agent                    |
| FR-012           | Fix submission + verification tools              |
| FR-013           | Sprint config settings + validation              |
| FR-014           | Ad-hoc review action (all unreviewed tasks)      |
| FR-015           | Single task review from Current Task card        |
| FR-016           | Auto-trigger logic on task/phase completion      |
| FR-017           | Manual UI triggers (always available)            |
| FR-018           | Open issues tool for implementor                 |
| FR-019           | Issue resolution tool                            |
| FR-020           | Controller confirmation step                     |
| FR-021           | Update controller agent prompt                   |

## Risk Assessment

| Risk                                 | Likelihood | Impact | Mitigation                              |
| ------------------------------------ | ---------- | ------ | --------------------------------------- |
| Workflow confusion if gating enabled | Medium     | High   | Strong UI banners + clear status labels |
| Review records balloon in size       | Low        | Medium | Store summaries, avoid large diffs      |
| Phase gate complexity                | Medium     | Medium | Keep phase gate behind config flag      |
