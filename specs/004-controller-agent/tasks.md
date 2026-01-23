# Tasks: Controller Agent

**Input**: Design documents from `/specs/004-controller-agent/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Not explicitly requested in spec - test tasks included only where critical for workflow verification.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- All paths relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database schema extensions and shared types required by all Controller functionality

- [x] T001 Add SprintStatusSchema to src/schemas/shared.ts
- [x] T002 [P] Extend TaskStatusSchema with PENDING_HANDOVER_REVIEW and HANDOVER_REVIEW_FAILED in src/schemas/shared.ts
- [x] T003 [P] Extend WorkflowStepSchema with SPEC_REVIEW and HANDOVER_REVIEW in src/schemas/shared.ts
- [x] T004 [P] Add ReviewTypeSchema, ReviewDecisionSchema, ConformanceSchema to src/schemas/shared.ts
- [x] T005 [P] Add AlignmentIssueSchema to src/schemas/shared.ts
- [x] T006 Add spec_reviews table definition to src/db/schema.ts
- [x] T007 Add status column to sprints table in src/db/schema.ts
- [x] T008 Create migration 20260117_007_add_spec_reviews_table in src/db/migrations.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T009 Extend ServerRole type to include "controller" in src/mcp-server/tools.ts
- [x] T010 Extend ToolRole type to include "controller" in src/mcp-server/tools.ts
- [x] T011 Add controller role to ConfigService with Opus 4.5 model in extension/src/config/ConfigService.ts
- [x] T012 Create invokeController() method in extension/src/chat/SessionManager.ts
- [x] T013 Add escalation check helper function in src/core/escalation.ts

**Checkpoint**: Foundation ready - tool implementation can now begin

---

## Phase 3: User Story 1 - Sprint Configuration Review Gate (Priority: P1) 🎯 MVP

**Goal**: Block task preparation until Controller approves sprint configuration

**Independent Test**: Configure a sprint → verify task preparation blocked → Controller approves → verify tasks can be prepared

### Implementation for User Story 1

- [x] T014 [US1] Modify configure_sprint handler to set status=PENDING_SPEC_REVIEW in src/mcp-server/handlers/configure-sprint.ts
- [x] T015 [US1] Modify configure_sprint handler to set workflow_step=SPEC_REVIEW in src/mcp-server/handlers/configure-sprint.ts
- [x] T016 [US1] Modify prepare_task handler to check sprint.status and block if PENDING_SPEC_REVIEW in src/mcp-server/handlers/prepare-task.ts
- [x] T017 [P] [US1] Create approve_sprint handler in src/mcp-server/handlers/approve-sprint.ts
- [x] T018 [P] [US1] Create reject_sprint handler in src/mcp-server/handlers/reject-sprint.ts
- [x] T019 [US1] Create resubmit_sprint handler in src/mcp-server/handlers/resubmit-sprint.ts
- [x] T020 [US1] Register approve_sprint, reject_sprint tools with role=controller in src/mcp-server/tools.ts
- [x] T021 [US1] Register resubmit_sprint tool with role=orchestrator in src/mcp-server/tools.ts
- [x] T022 [US1] Add escalation check to reject_sprint (3 rejections → escalate) in src/mcp-server/handlers/reject-sprint.ts

**Checkpoint**: Sprint review gate fully functional - task prep blocked until Controller approval

---

## Phase 4: User Story 2 - Task Handover Review Gate (Priority: P1) 🎯 MVP

**Goal**: Block implementation until Controller approves task handover

**Independent Test**: Prepare task handover → verify implementation blocked → Controller approves → verify implementor can begin

### Implementation for User Story 2

- [x] T023 [US2] Modify prepare_task handler to set task status=PENDING_HANDOVER_REVIEW in src/mcp-server/handlers/prepare-task.ts
- [x] T024 [US2] Modify prepare_task handler to set workflow_step=HANDOVER_REVIEW in src/mcp-server/handlers/prepare-task.ts
- [x] T025 [P] [US2] Create approve_handover handler in src/mcp-server/handlers/approve-handover.ts
- [x] T026 [P] [US2] Create reject_handover handler in src/mcp-server/handlers/reject-handover.ts
- [x] T027 [US2] Create resubmit_handover handler in src/mcp-server/handlers/resubmit-handover.ts
- [x] T028 [US2] Register approve_handover, reject_handover tools with role=controller in src/mcp-server/tools.ts
- [x] T029 [US2] Register resubmit_handover tool with role=orchestrator in src/mcp-server/tools.ts
- [x] T030 [US2] Add escalation check to reject_handover (3 rejections → escalate) in src/mcp-server/handlers/reject-handover.ts
- [x] T031 [US2] Block get_current_task from returning task if status=PENDING_HANDOVER_REVIEW in src/mcp-server/handlers/get-current-task.ts
- [x] T031a [US2] Block signal_completion if task status is PENDING_HANDOVER_REVIEW or HANDOVER_REVIEW_FAILED in src/mcp-server/handlers/signal-completion.ts

**Checkpoint**: Handover review gate fully functional - implementation blocked until Controller approval

---

## Phase 5: User Story 3 - Controller Agent Interface (Priority: P2)

**Goal**: Provide Controller with dedicated read-only access and review tools

**Independent Test**: Launch Controller agent → verify access to sprint configs and handovers → verify cannot modify verification criteria

### Implementation for User Story 3

- [x] T032 [P] [US3] Create orchestra.controller.agent.md in extension/agents/
- [x] T033 [P] [US3] Add Controller-specific system prompt with review guidelines in extension/agents/orchestra.controller.agent.md
- [x] T034 [US3] Add Controller launch command to extension/src/commands/startAgent.ts
- [x] T035 [US3] Configure shared read-only tools (get_sprint_status, get_task, get_handover) for controller role in src/mcp-server/tools.ts
- [x] T036 [US3] Verify controller role cannot access orchestrator-only tools (update_verification) in src/mcp-server/tools.ts
- [x] T036a [US3] Add unit test verifying controller role tool filtering excludes update_verification in test/mcp-server/tools.test.ts
- [x] T037 [US3] Add spec file read capability to controller tools in src/mcp-server/tools.ts

**Checkpoint**: Controller agent can be launched and has proper tool access for reviews

---

## Phase 6: User Story 4 - Review Audit Trail (Priority: P2)

**Goal**: Record all review decisions with complete audit trail

**Independent Test**: Complete review cycle → query spec_reviews table → verify all decisions logged with timestamps

### Implementation for User Story 4

- [x] T038 [US4] Add spec_reviews insert in approve_sprint handler in src/mcp-server/handlers/approve-sprint.ts
- [x] T039 [P] [US4] Add spec_reviews insert in reject_sprint handler in src/mcp-server/handlers/reject-sprint.ts
- [x] T040 [P] [US4] Add spec_reviews insert in approve_handover handler in src/mcp-server/handlers/approve-handover.ts
- [x] T041 [P] [US4] Add spec_reviews insert in reject_handover handler in src/mcp-server/handlers/reject-handover.ts
- [x] T042 [US4] Implement revision_count tracking (increment on resubmit) in src/mcp-server/handlers/resubmit-sprint.ts
- [x] T043 [US4] Implement revision_count tracking in src/mcp-server/handlers/resubmit-handover.ts
- [x] T044 [US4] Add amendment logging to update_handover when in HANDOVER_REVIEW_FAILED state in src/mcp-server/handlers/update-handover.ts
- [x] T045 [US4] Link previous_review_id when creating follow-up reviews in resubmit handlers

**Checkpoint**: All review decisions are logged with full audit trail

---

## Phase 7: User Story 5 - Visual Status Indication (Priority: P3)

**Goal**: Display clear status banners when sprints/tasks are blocked awaiting review

**Independent Test**: Create blocked sprint → view UI → verify prominent status banner shown

### Implementation for User Story 5

- [x] T046 [P] [US5] Add review status display to sprint view in extension/src/views/webview/
- [x] T047 [P] [US5] Add review status display to task view in extension/src/views/webview/currentTaskTemplate.ts
- [x] T048 [US5] Add amendments section to handover view in extension/src/views/webview/currentTaskTemplate.ts
- [x] T049 [US5] Add Controller launch button when item is pending review in extension/src/views/webview/
- [x] T050 [US5] Add review history display (issues, recommendations, revision counts) in extension/src/views/webview/
- [x] T051 [US5] Add database queries for review history in extension/src/database/queries.ts

**Checkpoint**: Users can clearly see blocked status and take action

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, testing, and validation

- [x] T052 [P] Update orchestra.orchestrator.agent.md with Controller awareness section in extension/agents/
- [x] T053 [P] Add controller role documentation to docs/mcp-server-config.md
- [x] T054 Run quickstart.md validation scenarios
- [x] T055 Update .github/copilot-instructions.md with Controller role information

**Checkpoint**: Documentation complete, all features validated

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational - Sprint gate
- **User Story 2 (Phase 4)**: Depends on Foundational - Handover gate (can parallel with US1)
- **User Story 3 (Phase 5)**: Depends on US1+US2 handlers being registered
- **User Story 4 (Phase 6)**: Can parallel with US3 - adds logging to existing handlers
- **User Story 5 (Phase 7)**: Depends on US1+US2+US4 (needs data to display)
- **Polish (Phase 8)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - Sprint review gate
- **User Story 2 (P1)**: Can start after Foundational in parallel with US1 - Handover review gate
- **User Story 3 (P2)**: Depends on US1+US2 tool registration - Controller agent definition
- **User Story 4 (P2)**: Can parallel with US3 - Audit trail for handlers
- **User Story 5 (P3)**: Depends on US1+US2+US4 - Visual indicators need data

### Within Each User Story

- Handler implementation before tool registration
- Core functionality before escalation logic
- Database inserts after handler structure

### Parallel Opportunities

**Within Phase 1 (Setup)**:
- T002, T003, T004, T005 can all run in parallel (different schema sections)

**Within Phase 3 (US1)**:
- T017, T018 can run in parallel (different handlers)

**Within Phase 4 (US2)**:
- T025, T026 can run in parallel (different handlers)

**Phase 3 + Phase 4**:
- US1 and US2 can run in parallel after Foundational (different files, no dependencies)

**Within Phase 6 (US4)**:
- T039, T040, T041 can run in parallel (different handlers)

**Phase 5 + Phase 6**:
- US3 and US4 can run in parallel (different concerns)

---

## Parallel Example: User Story 1 + User Story 2

```bash
# After Foundational phase completes, launch both P1 stories in parallel:

# US1 - Sprint Gate:
Task T014: "Modify configure_sprint handler to set status=PENDING_SPEC_REVIEW"
Task T017: "Create approve_sprint handler"
Task T018: "Create reject_sprint handler"

# US2 - Handover Gate (parallel):
Task T023: "Modify prepare_task handler to set task status=PENDING_HANDOVER_REVIEW"
Task T025: "Create approve_handover handler"
Task T026: "Create reject_handover handler"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (schema + migration)
2. Complete Phase 2: Foundational (role extensions)
3. Complete Phase 3: User Story 1 - Sprint Gate
4. Complete Phase 4: User Story 2 - Handover Gate
5. **STOP and VALIDATE**: Test both gates work per quickstart.md
6. Deploy MVP - blocks orchestrator self-sabotage

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add US1 + US2 → Test independently → Deploy MVP (blocking gates work!)
3. Add US3 → Controller agent can be launched → Deploy
4. Add US4 → Full audit trail → Deploy
5. Add US5 → Visual polish → Deploy

### Task Counts by Phase

| Phase | Story | Task Count |
|-------|-------|------------|
| 1 | Setup | 8 |
| 2 | Foundational | 5 |
| 3 | US1 - Sprint Gate | 9 |
| 4 | US2 - Handover Gate | 10 |
| 5 | US3 - Controller Interface | 7 |
| 6 | US4 - Audit Trail | 8 |
| 7 | US5 - Visual Indicators | 6 |
| 8 | Polish | 4 |
| **Total** | | **57** |

---

## Requirement Traceability

| Task | Requirement |
|------|-------------|
| T014-T015 | FR-002 (Transition to pending spec review) |
| T016 | FR-001 (Block task preparation) |
| T017 | FR-003 (Approve sprint) |
| T018, T022 | FR-004 (Reject sprint) |
| T019 | FR-005 (Resubmit sprint) |
| T023-T024 | FR-007 (Transition to pending handover review) |
| T025 | FR-008 (Approve handover) |
| T026, T030 | FR-009 (Reject handover) |
| T027 | FR-010 (Resubmit handover) |
| T031, T031a | FR-006 (Block implementation) |
| T032-T037, T036a | FR-011-013 (Controller access) |
| T038-T045 | FR-014-019 (Audit trail) |
| T046-T051 | FR-020-022 (UI indicators) |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US2 are both P1 priority - implement together for MVP
- Escalation (3 rejections → human supervisor) is built into reject handlers
- All file paths are relative to repository root
- Migration ID: 20260117_007 per research.md
