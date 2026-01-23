# Implementation Plan: Controller Agent

**Branch**: `004-controller-agent` | **Date**: 2026-01-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-controller-agent/spec.md`
**Technical Design**: `spec/08-custom-agents/spec-verification-technical-spec.md`

## Summary

Implement a Controller Agent with mandatory review gates to prevent orchestrator self-sabotage. The system introduces two blocking gates: a Sprint Gate (after `configure_sprint`) and a Handover Gate (after `prepare_task`), both requiring Controller approval before workflow can proceed. This includes new database tables, MCP tools, schema updates, and UI changes.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode, `exactOptionalPropertyTypes: true`)  
**Primary Dependencies**: Drizzle ORM, Zod, MCP SDK, VS Code Extension API  
**Storage**: SQLite (via better-sqlite3) with Drizzle ORM  
**Testing**: Vitest with factory functions for test fixtures  
**Target Platform**: VS Code Extension (Electron) + MCP Server (Node.js)  
**Project Type**: VS Code Extension with embedded MCP server  
**Performance Goals**: Controller review adds < 2 minutes overhead per straightforward approval  
**Constraints**: Must maintain role separation (orchestrator/implementor/controller trust boundaries)  
**Scale/Scope**: Single-user VS Code extension, workflow blocking is per-sprint/per-task

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Core-First Architecture** | ✅ PASS | MCP handlers delegate to db layer; extension entrypoints thin |
| **II. Hidden Verification (NON-NEGOTIABLE)** | ✅ PASS | Controller has read-only access; cannot see verification criteria |
| **III. Zod-Validated YAML** | ✅ PASS | All new schemas use Zod with `z.output<>` |
| **IV. Structured Error Hierarchy** | ✅ PASS | Will use existing OrchestraError classes |
| **V. ESM with Strict TypeScript** | ✅ PASS | All imports use `.js` extensions |
| **VI. Extension Build & Packaging** | ✅ PASS | No native module changes required |

**Pre-Design Gate Result**: ✅ PASS - No violations, proceed to Phase 0

### Post-Design Re-Check (2026-01-17)

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Core-First Architecture** | ✅ PASS | Contracts in `specs/`, handlers in `src/mcp-server/handlers/` |
| **II. Hidden Verification** | ✅ PASS | Controller tools only access handovers, not verification criteria |
| **III. Zod-Validated YAML** | ✅ PASS | All schemas use `z.output<>` for type inference |
| **IV. Structured Error Hierarchy** | ✅ PASS | New tools will throw appropriate OrchestraError subclasses |
| **V. ESM with Strict TypeScript** | ✅ PASS | Contract files use `.js` extensions in imports |
| **VI. Extension Build & Packaging** | ✅ PASS | No changes to native modules |

**Post-Design Gate Result**: ✅ PASS - Design complies with all principles

## Project Structure

### Documentation (this feature)

```text
specs/004-controller-agent/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
# Existing structure - additions marked with (+)

src/
├── db/
│   ├── schema.ts              # (+) Add spec_reviews table
│   └── migrations.ts          # (+) Add migration 007
├── schemas/
│   └── shared.ts              # (+) Extend TaskStatus, WorkflowStep
├── mcp-server/
│   ├── tools.ts               # (+) Register controller tools
│   └── handlers/
│       ├── configure-sprint.ts    # (M) Change output to PENDING_SPEC_REVIEW
│       ├── prepare-task.ts        # (M) Add sprint check, change output
│       ├── update-handover.ts     # (M) Add amendment logging
│       ├── approve-sprint.ts      # (+) NEW
│       ├── reject-sprint.ts       # (+) NEW
│       ├── approve-handover.ts    # (+) NEW
│       ├── reject-handover.ts     # (+) NEW
│       ├── resubmit-sprint.ts     # (+) NEW
│       └── resubmit-handover.ts   # (+) NEW
└── core/                       # Shared logic (if needed)

extension/
├── agents/
│   ├── orchestra.controller.agent.md  # (+) NEW
│   └── orchestra.orchestrator.agent.md  # (M) Add awareness section
├── src/
│   ├── commands/
│   │   └── startAgent.ts       # (M) Add Controller invocation
│   ├── database/
│   │   └── queries.ts          # (+) Add review/amendment queries
│   └── views/
│       └── webview/
│           └── currentTaskTemplate.ts  # (+) Amendments section

test/
└── mcp-server/
    ├── approve-sprint.test.ts         # (+) NEW
    ├── reject-sprint.test.ts          # (+) NEW
    ├── approve-handover.test.ts       # (+) NEW
    ├── reject-handover.test.ts        # (+) NEW
    └── spec-review-flow.test.ts       # (+) Integration test
```

**Structure Decision**: Follows existing Orchestra architecture - MCP handlers in `src/mcp-server/handlers/`, extension code in `extension/src/`, tests mirror source structure.

## Complexity Tracking

> No constitution violations - this section remains empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | - | - |

---

## Phase Deliverables

### Phase 0: Outline & Research

**Objective**: Resolve any remaining technical unknowns from Technical Context.

**Research Tasks**:
1. Confirm existing database migration pattern (migrations.ts) for new `spec_reviews` table
2. Verify tool registration pattern in tools.ts for new Controller role
3. Confirm VS Code Chat API for agent model selection (Claude Opus 4.5 for Controller)
4. Review amendment logging pattern in update-verification.ts for handover amendments

**Output**: `research.md` with decisions and rationale

### Phase 1: Design & Contracts

**Objective**: Define data model and API contracts for Controller system.

**Deliverables**:
1. `data-model.md` - Extended schemas for:
   - `spec_reviews` table
   - Extended `TaskStatusSchema` (add PENDING_HANDOVER_REVIEW, HANDOVER_REVIEW_FAILED)
   - Extended `SprintStatusSchema` (add PENDING_SPEC_REVIEW, SPEC_REVIEW_FAILED)
   - Extended `WorkflowStepSchema` (add SPEC_REVIEW, HANDOVER_REVIEW)

2. `contracts/` - MCP tool contracts:
   - `approve-sprint.schema.ts` - Input/output schemas
   - `reject-sprint.schema.ts`
   - `approve-handover.schema.ts`
   - `reject-handover.schema.ts`
   - `resubmit-sprint.schema.ts`
   - `resubmit-handover.schema.ts`

3. `quickstart.md` - Developer guide for testing the feature

**Output**: data-model.md, contracts/*, quickstart.md

### Phase 2: Task Breakdown

**Objective**: Create implementable tasks from design artifacts.

**Covered by**: `/speckit.tasks` command (not this plan)

---

## Requirement Traceability

| Spec Requirement | Implementation Component |
|------------------|-------------------------|
| FR-001: Block task preparation | `prepare-task.ts` sprint status check |
| FR-002: Transition to pending spec review | `configure-sprint.ts` output change |
| FR-003: Approve sprint | `approve-sprint.ts` handler |
| FR-004: Reject sprint | `reject-sprint.ts` handler |
| FR-005: Resubmit sprint | `resubmit-sprint.ts` handler |
| FR-006: Block implementation | Controller tools status validation |
| FR-007: Transition to pending handover review | `prepare-task.ts` output change |
| FR-008: Approve handover | `approve-handover.ts` handler |
| FR-009: Reject handover | `reject-handover.ts` handler |
| FR-010: Resubmit handover | `resubmit-handover.ts` handler |
| FR-011-013: Controller read-only access | Tool role filtering in `tools.ts` |
| FR-014-015: Conformance recording | `spec_reviews` table |
| FR-016-019: Audit trail | `spec_reviews` table + amendment logging |
| FR-020-022: UI indicators | Extension webview updates |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Tool role filtering complexity | Medium | High | Use existing role pattern from orchestrator/implementor |
| Migration breaks existing sprints | Low | High | Test migration on copy of production DB |
| VS Code Chat API changes | Low | Medium | Pin to known working API, abstract invocation |
| Revision cycle escalation logic | Low | Low | Simple counter check, already clarified (3 rejections → escalate) |

---

## Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| MCP SDK | External | Available |
| Drizzle ORM | External | Available |
| VS Code Chat API | External | Requires research (model selection) |
| Existing amendment table | Internal | Available (reuse pattern) |
| Existing tool registration | Internal | Available (extend pattern) |
