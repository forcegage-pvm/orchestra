# Sprint: Verification Rules Implementation

**Sprint ID**: VER-001  
**Created**: 2025-12-09  
**Source Spec**: `spec/07-db-driven/08-verification-rules-spec.md`  
**Status**: 🟡 In Progress

---

## Overview

Implement verification rules alignment between the Orchestra specification and the MCP server. This sprint addresses 8 gaps identified in the verification rules audit.

**Development Approach**: TDD - Write tests first, then implement.

---

## Phase 1: Pre-Signal Checks Fix (GAP-01)

> **Goal**: Make `signal_completion` actually execute build/test/lint commands instead of trusting agent claims.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| VER-001 | Create command executor utility | ✅ | `src/core/command-executor.ts` - Execute shell commands with timeout, capture stdout/stderr |
| VER-002 | Refactor `runPreSignalChecks` to execute commands | ✅ | Replace claim-based checks with actual command execution |
| VER-003 | Add artifact path validation | ✅ | Verify files in `artifacts_created` actually exist |
| VER-004 | Add pre-signal configuration support | ✅ | Read build/test/lint commands from task or sprint config |
| VER-005 | Unit tests for pre-signal execution | ⬜ | Mock command execution, test all scenarios |

**Acceptance Criteria**:
- [ ] `signal_completion` runs actual `npm run build` (or configured command)
- [ ] `signal_completion` runs actual `npm test` (or configured command)
- [ ] `signal_completion` validates artifact paths exist on filesystem
- [ ] Failed commands block signal with actionable error messages

---

## Phase 2: Verification Check Execution (GAP-02, GAP-03)

> **Goal**: Create `run_verification_checks` tool that executes actual verification logic, not just stores results.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| VER-006 | Create check executor module | ⬜ | `src/core/check-executor.ts` - Framework for running checks |
| VER-007 | Implement structural check execution | ⬜ | File existence, export verification, schema validation |
| VER-008 | Implement behavioral check execution | ⬜ | Test execution, coverage thresholds |
| VER-009 | Implement quality check execution | ⬜ | Lint, type-check, documentation checks |
| VER-010 | Create `run_verification_checks` handler | ⬜ | MCP tool handler in `src/mcp-server/handlers/` |
| VER-011 | Add Zod schemas for `run_verification_checks` | ⬜ | Input/output schemas in `src/schemas/` |
| VER-012 | Register `run_verification_checks` tool | ⬜ | Add to MCP server tool registry |
| VER-013 | Implement evidence storage | ⬜ | Store execution evidence in `verification_results` table |
| VER-014 | Unit tests for check executor | ⬜ | Test each check type with mocked filesystem/commands |
| VER-015 | Integration tests for verification flow | ⬜ | End-to-end verification scenarios |

**Acceptance Criteria**:
- [ ] `run_verification_checks` tool exists and is callable
- [ ] Structural checks verify file existence and exports
- [ ] Behavioral checks run tests and check coverage
- [ ] Quality checks run linters and type-checkers
- [ ] Evidence (command output, timestamps) stored in database

---

## Phase 3: Accept-Signal Validation (GAP-05)

> **Goal**: Implement `accept-signal` validation that runs before orchestrator sees signal.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| VER-016 | Implement accept-signal validation checks | ⬜ | Structural validation of signal content |
| VER-017 | Implement signal staleness check | ⬜ | Reject signals older than task's last modification |
| VER-018 | Enforce accept-signal gate | ⬜ | Block `get_signal` if validation fails |
| VER-019 | Unit tests for accept-signal validation | ⬜ | Test validation scenarios |

**Acceptance Criteria**:
- [ ] Signals with missing required fields are rejected
- [ ] Stale signals (pre-dating task changes) are rejected
- [ ] `get_signal` only returns validated signals
- [ ] Clear error messages for validation failures

---

## Phase 4: Judgment Constraints (GAP-06, GAP-08)

> **Goal**: Enforce judgment rules - must have verification results, PASS requires no BLOCKING failures.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| VER-020 | Add verification prerequisite to judgment | ⬜ | Block judgment if no verification results exist |
| VER-021 | Add judgment consistency validation | ⬜ | PASS not allowed with BLOCKING failures |
| VER-022 | Add audit rationale storage | ⬜ | Store judgment rationale for audit trail |
| VER-023 | Unit tests for judgment constraints | ⬜ | Test all constraint scenarios |

**Acceptance Criteria**:
- [ ] `submit_verification_judgment` requires prior `run_verification_checks`
- [ ] PASS judgment rejected if any BLOCKING check failed
- [ ] Rationale stored in database for audit
- [ ] Clear error messages explain constraint violations

---

## Phase 5: Enhanced Results (GAP-04)

> **Goal**: Improve `get_verification_results` output with severity breakdown and system-computed pass/fail.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| VER-024 | Enhanced `get_verification_results` output | ⬜ | Add structured result format |
| VER-025 | Add severity breakdown to results | ⬜ | Count by BLOCKING/MAJOR/MINOR/INFO |
| VER-026 | Add system-computed `overall_passed` | ⬜ | Boolean based on BLOCKING check results |
| VER-027 | Unit tests for enhanced results | ⬜ | Test output format and calculations |

**Acceptance Criteria**:
- [ ] Results include severity breakdown counts
- [ ] `overall_passed` is system-computed, not agent-provided
- [ ] Results include execution timestamps and evidence
- [ ] Output is structured for easy consumption

---

## Phase 6: Documentation & Integration Testing

> **Goal**: Update documentation and ensure end-to-end flows work.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| VER-028 | Update tool documentation | ⬜ | Document new/changed MCP tools |
| VER-029 | Update workflow documentation | ⬜ | Update `spec/07-db-driven/05-mcp-workflows.md` |
| VER-030 | End-to-end integration tests | ⬜ | Full signal → verify → judgment flow |
| VER-031 | Update spec with implementation notes | ⬜ | Add implementation details to `08-verification-rules-spec.md` |

**Acceptance Criteria**:
- [ ] All tool schemas documented
- [ ] Workflow documentation reflects actual implementation
- [ ] Integration tests cover happy path and error scenarios
- [ ] Spec updated with implementation notes

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
| Phase 1 | 5 | 4 | 80% |
| Phase 2 | 10 | 0 | 0% |
| Phase 3 | 4 | 0 | 0% |
| Phase 4 | 4 | 0 | 0% |
| Phase 5 | 4 | 0 | 0% |
| Phase 6 | 4 | 0 | 0% |
| **Total** | **31** | **4** | **13%** |

---

## Notes

- **TDD Approach**: For each task, write failing tests first, then implement to make them pass
- **Dependencies**: Phase 1 must complete before Phase 2; Phase 2 before Phase 3-5; Phase 6 last
- **Source Spec**: All requirements derived from `spec/07-db-driven/08-verification-rules-spec.md`
