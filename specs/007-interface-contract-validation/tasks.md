# Tasks: Interface Contract Validation

**Input**: Design documents from `/specs/007-interface-contract-validation/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Test tasks are included as per the spec's requirement for a reference implementation (FR-009).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project structure**: Following existing Orchestra patterns
- Core logic: `src/core/`
- Schemas: `src/schemas/`
- MCP handlers: `src/mcp-server/handlers/`
- Tests: `test/`
- Agent instructions: `.github/agents/` (mirrored to `extension/agents/`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project dependencies and configuration schema

- [ ] T001 Add AJV dependency to package.json with `npm install ajv`
- [ ] T002 [P] Create Zod schema for interface validation config in src/schemas/interface-validation.ts
- [ ] T003 [P] Create configuration file `.orchestra/interface-validations.yaml` with MCP schema validation entry

---

## Phase 2: Foundational (Core Validation Logic)

**Purpose**: Core validation functions that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Implement `loadValidationConfig()` function in src/core/interface-validation.ts
- [ ] T005 Implement `validatePatternExclusivity()` function in src/core/interface-validation.ts (FR-002a)
- [ ] T006 Implement `validateJsonSchema()` function in src/core/interface-validation.ts (JSON Schema meta-validation with AJV)
- [ ] T007 Implement `runValidation()` function in src/core/interface-validation.ts (includes FR-003: detect missing validation tool and throw hard error)
- [ ] T008 [P] Add custom check for "array without items" semantic validation
- [ ] T009 Implement `runAllValidations()` function in src/core/interface-validation.ts
- [ ] T010 [P] Add error codes and structured errors per contracts/api.md (INTERFACE_CONFIG_NOT_FOUND, etc.)

**Checkpoint**: Core validation logic ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Build-Time Schema Validation (Priority: P1) 🎯 MVP

**Goal**: Invalid interface definitions are caught at build/test time (FR-001, FR-002, FR-003, FR-008, FR-009)

**Independent Test**: Introduce an intentionally invalid MCP schema and verify test fails with clear error message

### Tests for User Story 1

- [ ] T011 [US1] Create MCP tool schema validation test in test/mcp-server/tool-schema-validation.test.ts
- [ ] T012 [P] [US1] Create unit tests for interface validation core functions in test/core/interface-validation.test.ts

### Implementation for User Story 1

- [ ] T013 [US1] Implement `validateAllMcpToolSchemas()` utility in src/core/interface-validation.ts
- [ ] T014 [US1] Wire up validation test to iterate over all TOOLS_WITH_ROLES from tools.ts
- [ ] T015 [US1] Verify validation correctly catches known-bad schema (array without items)
- [ ] T016 [US1] Ensure error messages include file path, property path, and specification requirement (FR-008)

**Checkpoint**: Running `npm test` catches invalid MCP tool schemas with actionable error messages

---

## Phase 4: User Story 2 - Orchestrator Verification Guidance (Priority: P2)

**Goal**: Orchestrator agents include interface validation in verification criteria (FR-004, FR-005)

**Independent Test**: Have Orchestrator prepare a task modifying interface files; verify verification criteria include interface validity checks

### Implementation for User Story 2

- [ ] T017 [US2] Add "Interface Contract Validation" section to .github/agents/orchestra.orchestrator.agent.md
- [ ] T018 [US2] Document the principle "validate interfaces against their specifications" with examples
- [ ] T019 [US2] Add requirement to include interface validation in verification criteria for tasks modifying external contracts
      **Checkpoint**: Orchestrator agent instructions include interface validation guidance (mirroring handled in T035a)

---

## Phase 5: User Story 3 - Controller Code Review Validation (Priority: P2)

**Goal**: Controller verifies interface validation during code review (FR-006)

**Independent Test**: Submit code containing invalid interface for review; verify Controller catches it

### Implementation for User Story 3

- [ ] T021 [US3] Add interface validation check to Controller code review section in .github/agents/orchestra.controller.agent.md
- [ ] T022 [US3] Document that interface validation failures result in automatic CHANGES_REQUESTED
      **Checkpoint**: Controller code review section includes interface validation requirements (mirroring handled in T035a)

---

## Phase 6: User Story 4 - Controller Handover Review Check (Priority: P3)

**Goal**: Controller verifies handovers for interface-modifying tasks include validation checks (FR-007)

**Independent Test**: Controller reviews handover for interface-modifying task; verifies validation criteria check

### Implementation for User Story 4

- [ ] T024 [US4] Add interface validation check to Controller handover review section in .github/agents/orchestra.controller.agent.md
- [ ] T025 [US4] Document warning-then-reject pattern for missing validation criteria
      **Checkpoint**: Controller handover review section includes interface validation verification (mirroring handled in T035a)

---

## Phase 7: Mid-Sprint Validation Registration (FR-010, FR-011, FR-012)

**Goal**: Mechanism to add new interface validations mid-sprint

### Implementation for Mid-Sprint Registration

- [ ] T027 Create MCP tool handler `add_interface_validation` in src/mcp-server/handlers/add-interface-validation.ts (handler MUST be thin and delegate to core per Constitution I)
- [ ] T027a [FR-011] Document in quickstart.md how `configure_sprint` can reference interface validations to add during sprint setup
- [ ] T028 Register handler in src/mcp-server/tools.ts with both orchestrator and implementor roles (implementor may discover new interface types during implementation per FR-012)
- [ ] T029 [P] Add unit test for `add_interface_validation` handler in test/mcp-server/add-interface-validation.test.ts
- [ ] T030 Document mid-sprint addition workflow in quickstart.md

**Checkpoint**: New interface validations can be added mid-sprint via MCP tool

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, and final integration

- [ ] T031 [P] Update plan.md with implementation status
- [ ] T032 [P] Verify all error codes from contracts/api.md are implemented
- [ ] T033 Run quickstart.md validation scenarios end-to-end
- [ ] T034 Verify existing tests pass with new validation infrastructure
- [ ] T035 [P] Update DOCUMENTATION_AUDIT.md if new documentation added
- [ ] T035a Mirror all agent instruction changes from `.github/agents/` to `extension/agents/` (canonical source is `.github/agents/`; extension copies are synced)

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational) ←── BLOCKS ALL USER STORIES
    ↓
┌───────────────────┬───────────────────┬───────────────────┬───────────────────┐
│ Phase 3 (US1)     │ Phase 4 (US2)     │ Phase 5 (US3)     │ Phase 6 (US4)     │
│ Build Validation  │ Orchestrator      │ Controller Review │ Handover Check    │
│ P1 🎯 MVP         │ P2                │ P2                │ P3                │
└───────────────────┴───────────────────┴───────────────────┴───────────────────┘
                              ↓ (all user stories can run in parallel)
                    Phase 7 (Mid-Sprint)
                              ↓
                    Phase 8 (Polish)
```

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Independent agent instruction updates
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Independent agent instruction updates
- **User Story 4 (P3)**: Can start after Foundational (Phase 2) - Independent agent instruction updates

### Within Each User Story

- Tests written first where applicable
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

**Within Phase 1 (Setup)**:

```bash
# Can run in parallel:
T002: Zod schema for config
T003: Config file creation
```

**Within Phase 2 (Foundational)**:

```bash
# Can run in parallel:
T008: Custom array-items check
T010: Error codes and structured errors
```

**After Foundational Completes (All User Stories)**:

```bash
# All user stories can start in parallel:
Phase 3: US1 - Build-time validation (T011-T016)
Phase 4: US2 - Orchestrator guidance (T017-T020)
Phase 5: US3 - Controller review (T021-T023)
Phase 6: US4 - Controller handover (T024-T026)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T010) - CRITICAL
3. Complete Phase 3: User Story 1 (T011-T016)
4. **STOP and VALIDATE**: Run `npm test` and verify invalid schemas are caught
5. Deploy MVP - the core value proposition is delivered

### Incremental Delivery

1. MVP: Build-time validation catches invalid MCP schemas
2. Add US2: Orchestrator guidance ensures verification design
3. Add US3: Controller code review catches escapes
4. Add US4: Controller handover review prevents design gaps
5. Add Mid-Sprint: Dynamic validation registration

### Success Criteria Mapping

| Success Criteria                  | Primary Tasks                      |
| --------------------------------- | ---------------------------------- |
| SC-001: Zero production escapes   | T011-T016 (MVP)                    |
| SC-002: Actionable error messages | T016                               |
| SC-003: Additive enhancement      | All - no existing workflow changes |
| SC-004: Reference implementation  | T011, T013-T014                    |
| SC-005: Extensible mechanism      | T002, T004, T027-T028, T027a       |
| SC-006: Auto-CHANGES_REQUESTED    | T021-T022                          |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- **Agent file convention**: `.github/agents/` is the canonical source; `extension/agents/` contains mirrors synced via T035a
- AJV is used for JSON Schema meta-validation per research decision
- Config stored in `.orchestra/interface-validations.yaml` per research decision
- FR-003 (hard failure on missing tool) is covered by T007's implementation of `runValidation()`
