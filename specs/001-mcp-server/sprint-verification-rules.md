# Sprint: Verification Rules Implementation

**Sprint ID**: VER-001  
**Created**: 2025-12-09  
**Source Spec**: `spec/07-db-driven/08-verification-rules-spec.md`  
**Status**: 🟡 In Progress (15/31 tasks complete)

---

## Overview

Implement verification rules alignment between the Orchestra specification and the MCP server. This sprint addresses 8 gaps identified in the verification rules audit.

**Development Approach**: TDD - Write tests first, then implement.

---

## Phase 1: Pre-Signal Checks Fix (GAP-01) ✅ COMPLETE

> **Goal**: Make `signal_completion` actually execute build/test/lint commands instead of trusting agent claims.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| VER-001 | Create command executor utility | ✅ | `src/core/command-executor.ts` - 14 tests |
| VER-002 | Refactor `runPreSignalChecks` to execute commands | ✅ | Uses async command execution - 11 tests |
| VER-003 | Add artifact path validation | ✅ | `src/core/artifact-validator.ts` - 10 tests |
| VER-004 | Add pre-signal configuration support | ✅ | `set_config` MCP tool - 6 tests |
| VER-005 | Unit tests for pre-signal execution | ✅ | 41 tests total in Phase 1 |

**Acceptance Criteria**:
- [x] `signal_completion` runs actual `npm run build` (or configured command)
- [x] `signal_completion` runs actual `npm test` (or configured command)
- [x] `signal_completion` validates artifact paths exist on filesystem
- [x] Failed commands block signal with actionable error messages

---

## Phase 2: Verification Check Execution (GAP-02, GAP-03)

> **Goal**: Create `run_verification_checks` tool that executes actual verification logic, not just stores results.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| VER-006 | Create check executor module | ✅ | `src/core/check-executor.ts` - 17 tests |
| VER-007 | Implement structural check execution | ✅ | file_exists, exports, json_schema in check-executor.ts |
| VER-008 | Implement behavioral check execution | ✅ | tests, coverage in check-executor.ts |
| VER-009 | Implement quality check execution | ✅ | lint, typecheck in check-executor.ts |
| VER-010 | Create `run_verification_checks` handler | ✅ | `src/mcp-server/handlers/run-verification-checks.ts` |
| VER-011 | Add Zod schemas for `run_verification_checks` | ✅ | Input/output schemas in `src/schemas/verification.ts` |
| VER-012 | Register `run_verification_checks` tool | ✅ | MCP server now has 22 tools |
| VER-013 | Implement evidence storage | ✅ | Results stored in `verification_results` table |
| VER-014 | Unit tests for check executor | ✅ | 17 tests in check-executor.test.ts |
| VER-015 | Integration tests for verification flow | ✅ | 13 tests in run-verification-checks.test.ts |

**Acceptance Criteria**:
- [x] `run_verification_checks` tool exists and is callable
- [x] Structural checks verify file existence and exports
- [x] Behavioral checks run tests and check coverage
- [x] Quality checks run linters and type-checkers
- [x] Evidence (command output, timestamps) stored in database

---

## Phase 3: Accept-Signal Validation (GAP-05) ✅ COMPLETE

> **Goal**: Implement `accept-signal` validation that runs before orchestrator sees signal.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| VER-016 | Implement accept-signal validation checks | ✅ | `accept-signal-validator.ts` with 5 ASV checks |
| VER-017 | Implement signal staleness check | ✅ | Configurable maxAgeMinutes (default 60) |
| VER-018 | Enforce accept-signal gate | ✅ | Integrated into `run_verification_checks` |
| VER-019 | Unit tests for accept-signal validation | ✅ | 12 tests covering all ASV checks |

**Acceptance Criteria**:
- [x] Signals with missing required fields are rejected (ASV-1)
- [x] Stale signals (pre-dating task changes) are rejected (ASV-3)
- [x] `run_verification_checks` only proceeds with validated signals
- [x] Clear error messages for validation failures

---

## Phase 4: Judgment Constraints (GAP-06, GAP-08) ✅ COMPLETE

> **Goal**: Enforce judgment rules - must have verification results, PASS requires no BLOCKING failures.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| VER-020 | Add verification prerequisite to judgment | ✅ | JVC-1: Blocks if no verification results |
| VER-021 | Add judgment consistency validation | ✅ | JVC-2: PASS rejected with BLOCKING failures |
| VER-022 | Add audit rationale storage | ✅ | JVC-3: Rationale min 10 chars, stored in progress |
| VER-023 | Unit tests for judgment constraints | ✅ | 12 tests for judgment validation |

**Acceptance Criteria**:
- [x] `submit_verification_judgment` requires prior `run_verification_checks`
- [x] PASS judgment rejected if any BLOCKING check failed
- [x] Rationale stored in database for audit
- [x] Clear error messages explain constraint violations

---

## Phase 5: Enhanced Results (GAP-04) ✅ COMPLETE

> **Goal**: Improve `get_verification_results` output with severity breakdown and system-computed pass/fail.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| VER-024 | Enhanced `get_verification_results` output | ✅ | Added type, description, severity per result |
| VER-025 | Add severity breakdown to results | ✅ | Count by BLOCKING/MAJOR/MINOR/INFO in summary |
| VER-026 | Add system-computed `overall_passed` | ✅ | Based on BLOCKING check results only |
| VER-027 | Unit tests for enhanced results | ✅ | 7 tests for enhanced output |

**Acceptance Criteria**:
- [x] Results include severity breakdown counts
- [x] `overall_passed` is system-computed, not agent-provided
- [x] Results include execution timestamps and evidence
- [x] Output is structured for easy consumption

---

## Phase 6: Documentation & Integration Testing

> **Goal**: Update documentation and ensure end-to-end flows work.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| VER-028 | Update tool documentation | ✅ | Document new/changed MCP tools |
| VER-029 | Update workflow documentation | ✅ | Update `spec/07-db-driven/05-mcp-workflows.md` |
| VER-030 | End-to-end integration tests | ✅ | Full signal → verify → judgment flow |
| VER-031 | Update spec with implementation notes | ✅ | Add implementation details to `08-verification-rules-spec.md` |

**Acceptance Criteria**:
- [x] All tool schemas documented
- [x] Workflow documentation reflects actual implementation
- [x] Integration tests cover happy path and error scenarios
- [x] Spec updated with implementation notes

---

## Gap Reference

| Gap ID | Description | Phase | Priority |
|--------|-------------|-------|----------|
| GAP-01 | Pre-signal checks trust claims instead of executing | Phase 1 | P0 |
| GAP-02 | No `run_verification_checks` tool | Phase 2 | P0 |
| GAP-03 | Verification checks not executed, only stored | Phase 2 | P0 |
| GAP-04 | `get_verification_results` lacks severity breakdown | Phase 5 | P1 |
| GAP-05 | No `accept-signal` validation | Phase 3 | P0 |
| GAP-06 | Judgment not gated on verification completion | Phase 4 | P1 |
| GAP-07 | Severity mapping incomplete | Phase 2 | P1 |
| GAP-08 | PASS judgment allowed despite BLOCKING failures | Phase 4 | P0 |

---

## Progress Tracking

**Legend**: ⬜ Not Started | 🔄 In Progress | ✅ Complete | ❌ Blocked

| Phase | Tasks | Complete | Progress |
|-------|-------|----------|-----------|
| Phase 1 | 5 | 5 | 100% ✅ |
| Phase 2 | 10 | 10 | 100% ✅ |
| Phase 3 | 4 | 4 | 100% ✅ |
| Phase 4 | 4 | 4 | 100% ✅ |
| Phase 5 | 4 | 4 | 100% ✅ |
| Phase 6 | 4 | 4 | 100% ✅ |
| **Total** | **31** | **31** | **100%** ✅ |

---

## Notes

- **TDD Approach**: For each task, write failing tests first, then implement to make them pass
- **Dependencies**: Phase 1 must complete before Phase 2; Phase 2 before Phase 3-5; Phase 6 last
- **Source Spec**: All requirements derived from `spec/07-db-driven/08-verification-rules-spec.md`
- **Sprint Completed**: 2024-12-09
