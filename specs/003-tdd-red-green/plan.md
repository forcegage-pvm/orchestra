# Implementation Plan: TDD Red-Green Enforcement

**Branch**: `003-tdd-red-green` | **Date**: 2026-01-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-tdd-red-green/spec.md`

## Summary

Implement a TDD Red-Green Registry and enforcement workflow to guarantee all red-phase tests transition to green status before sprint completion. This addresses the Sprint 015 failure where 40 tasks were marked COMPLETE with zero functional changes because tdd-red tests were never greened.

The solution introduces:
1. An implementor tool (`register_tdd_red_test`) for explicit test registration
2. Bidirectional pre-signal validation ensuring consistency between registered tests and markers
3. Mandatory green task assignment at red task completion
4. Green task verification ensuring tests pass and markers are removed
5. Sprint closeout gate blocking completion if any tests remain non-GREEN

## Technical Context

**Language/Version**: TypeScript 5.x (ESM with `.js` extensions)
**Primary Dependencies**: drizzle-orm (SQLite), Zod (validation), VS Code Extension API (for MCP tool exposure)
**Storage**: SQLite via better-sqlite3 + drizzle ORM (existing infrastructure)
**Testing**: Vitest (existing test framework)
**Target Platform**: VS Code Extension + MCP Server (Node.js runtime for MCP)
**Project Type**: Single project with extension/ and src/ directories
**Performance Goals**: N/A (workflow enforcement, not high-throughput)
**Constraints**: Must integrate with existing MCP tool infrastructure and pre-signal executor
**Scale/Scope**: Per-sprint tracking, typically 10-50 tests per sprint

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Core-First Architecture | ✅ PASS | Registry logic goes in `src/core/`, MCP handlers remain thin |
| II. Hidden Verification | ✅ PASS | Registry is shared (not hidden), but green task assignment is orchestrator-only |
| III. Zod-Validated YAML | ✅ PASS | No new YAML files; database schema uses drizzle |
| IV. Structured Error Hierarchy | ✅ PASS | Will use existing `ValidationError`, `TaskError` classes |
| V. ESM with Strict TypeScript | ✅ PASS | All imports use `.js` extensions, `exactOptionalPropertyTypes` observed |
| VI. Extension Build & Packaging | ✅ N/A | No new native modules; uses existing better-sqlite3 |

**Gate Result**: ✅ PASS - No violations. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/003-tdd-red-green/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (MCP tool schemas)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── tdd-registry.ts          # NEW: Registry CRUD operations
│   ├── tdd-marker-scanner.ts    # NEW: Dart + TS marker detection (used by validation)
│   └── tdd-validation.ts        # NEW: Pre-signal validation logic (uses marker-scanner)
├── db/
│   ├── schema.ts                # MODIFY: Add tdd_task_relationships, tdd_red_registry tables
│   └── migrations/              # NEW: Migration for new tables
├── mcp-server/
│   ├── handlers/
│   │   ├── register-tdd-red-test.ts  # NEW: Implementor tool handler
│   │   ├── complete-task.ts          # MODIFY: Add green task assignment + verification
│   │   ├── signal-completion.ts      # MODIFY: Add pre-signal TDD validation
│   │   └── configure-sprint.ts       # MODIFY: Add tdd_green_for_tasks parsing
│   └── tools.ts                      # MODIFY: Register new tool

test/
├── core/
│   ├── tdd-registry.test.ts     # NEW: Registry unit tests
│   └── tdd-validation.test.ts   # NEW: Validation unit tests
├── mcp-server/
│   └── handlers/
│       └── register-tdd-red-test.test.ts  # NEW: Handler tests
└── integration/
    └── tdd-red-green-workflow.test.ts     # NEW: End-to-end workflow test
```

**Structure Decision**: Single project structure. All new code integrates with existing `src/` and `test/` directories following the established patterns.

## Complexity Tracking

> No constitution violations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |

## Phase Status

### Phase 0: Research ✅ COMPLETE

| Artifact | Status | Path |
|----------|--------|------|
| research.md | ✅ Created | [research.md](research.md) |

Research questions resolved:
- RQ-001: Existing TDD infrastructure patterns documented
- RQ-002: Drizzle schema patterns confirmed (foreign keys, indexes, cascade)
- RQ-003: MCP tool registration patterns documented
- RQ-004: Test marker scanning approaches (Dart tags, TS directory/name)
- RQ-005: Pre-signal executor integration points identified

### Phase 1: Design ✅ COMPLETE

| Artifact | Status | Path |
|----------|--------|------|
| data-model.md | ✅ Created | [data-model.md](data-model.md) |
| quickstart.md | ✅ Created | [quickstart.md](quickstart.md) |
| contracts/ | ✅ Created | [contracts/mcp-tools.md](contracts/mcp-tools.md) |
| Agent context | ✅ Updated | `.github/agents/copilot-instructions.md` |

### Phase 2: Tasks ✅ COMPLETE

| Artifact | Status | Path |
|----------|--------|------|
| tasks.md | ✅ Created | [tasks.md](tasks.md) |

**Summary**:
- Total tasks: 58 (after analysis remediation)
- MVP scope (US1-4): 41 tasks
- Parallel opportunities: 8 tasks marked [P]
- User stories: 6 (P1×4, P2×1, P3×1)
