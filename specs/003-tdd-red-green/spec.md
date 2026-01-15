# Feature Specification: TDD Red-Green Enforcement

**Feature Branch**: `003-tdd-red-green`  
**Created**: 2026-01-14  
**Status**: Draft  
**Input**: Implement TDD Red-Green Enforcement registry and workflow to guarantee all red-phase tests transition to green, preventing the Sprint 015 failure mode

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Implementor Registers TDD Red Tests (Priority: P1)

As an Implementor working on a TDD red-phase task, I create failing tests and register them in the TDD registry so that the system tracks them and ensures they will be greened later.

**Why this priority**: This is the foundation of the enforcement model. Without registration, there's nothing to track or enforce.

**Independent Test**: Can be tested by creating a red-phase task, calling `register_tdd_red_test` for each test, and verifying registry entries are created with status REGISTERED.

**Acceptance Scenarios**:

1. **Given** I am working on a task with `tdd_red_phase=true`, **When** I call `register_tdd_red_test({ test_identifier: "test/unit/axis_test.dart::color test" })`, **Then** a registry entry is created with status "REGISTERED" and my task_id as red_task_id.

2. **Given** I have created 3 tests with tdd-red markers, **When** I register all 3 via the tool, **Then** each has a separate registry entry with unique test_identifier.

3. **Given** I try to register a test that's already registered, **When** I call `register_tdd_red_test`, **Then** I receive an "already_registered" response with the existing task that registered it.

---

### User Story 2 - Pre-Signal Validation Enforces Consistency (Priority: P1)

As an Implementor completing a red-phase task, the system validates that all my registered tests have tdd-red markers AND all marked tests are registered, preventing mismatches.

**Why this priority**: Critical for enforcement. Without bidirectional validation, tests could slip through untracked.

**Independent Test**: Can be tested by creating mismatches (registered but no marker, marked but not registered, passing test) and verifying signal_completion blocks with specific errors.

**Acceptance Scenarios**:

1. **Given** I registered test X but forgot to add the tdd-red marker, **When** I signal completion, **Then** I receive an error: "Registered test X has no tdd-red marker."

2. **Given** I created a test with tdd-red marker but forgot to register it, **When** I signal completion, **Then** I receive an error: "Test Y has tdd-red marker but is NOT registered."

3. **Given** I registered a test that is passing (not failing), **When** I signal completion, **Then** I receive an error: "Registered test Z is PASSING. Red-phase tests should FAIL."

4. **Given** all registered tests have markers and are failing, **When** I signal completion, **Then** validation passes and all entries update to status "VALIDATED."

---

### User Story 3 - Orchestrator Assigns Green Task at Red Completion (Priority: P1)

As an Orchestrator completing a red-phase task, I must assign which task will green these tests, either via upfront declaration or at completion time.

**Why this priority**: Ensures every red test has a designated green task. Without this, tests could remain in limbo forever.

**Independent Test**: Can be tested by completing a red task without green_task_id (should block), then with green_task_id (should succeed and update registry).

**Acceptance Scenarios**:

1. **Given** a red task with validated tests but no upfront relationship, **When** I call `complete_task({ task_id: 10 })` without green_task_id, **Then** completion is blocked with error: "No green task assigned."

2. **Given** a red task with validated tests, **When** I call `complete_task({ task_id: 10, green_task_id: 15 })`, **Then** all VALIDATED entries update to PENDING_GREEN with green_task_id=15.

3. **Given** a red task with upfront relationship declared in configure_sprint, **When** I complete the task without providing green_task_id, **Then** the relationship is used automatically and entries update to PENDING_GREEN.

---

### User Story 4 - Green Task Completion Verifies Tests Pass (Priority: P1)

As an Orchestrator completing a green-phase task, the system verifies that all assigned tests now pass and markers are removed.

**Why this priority**: This is the final verification that the red-green cycle completed successfully.

**Independent Test**: Can be tested by completing a green task with assigned tests, verifying it checks for passing tests and removed markers.

**Acceptance Scenarios**:

1. **Given** a task has PENDING_GREEN entries assigned, **When** I complete the task and a test still fails, **Then** completion is blocked with error: "Test X still failing."

2. **Given** a task has PENDING_GREEN entries assigned, **When** I complete the task and a marker is still present, **Then** completion is blocked with error: "Test X still has tdd-red marker."

3. **Given** all assigned tests pass and markers are removed, **When** I complete the task, **Then** all entries update to status "GREEN" with greened_at timestamp.

---

### User Story 5 - Sprint Closeout Blocks on Non-GREEN Entries (Priority: P2)

As a Supervisor closing a sprint, the system blocks completion if any TDD registry entries are not GREEN.

**Why this priority**: This is the ultimate safety net preventing Sprint 015-style failures.

**Independent Test**: Can be tested by attempting sprint closeout with PENDING_GREEN entries and verifying it blocks with actionable guidance.

**Acceptance Scenarios**:

1. **Given** a sprint has 3 entries with status PENDING_GREEN, **When** I attempt sprint closeout, **Then** closeout is blocked with a list of pending tests and their assigned green tasks.

2. **Given** all registry entries for a sprint are GREEN, **When** I attempt sprint closeout, **Then** closeout succeeds.

---

### User Story 6 - Upfront Task Relationship Declaration (Priority: P3)

As an Orchestrator configuring a sprint, I can declare red-to-green task relationships upfront so assignment happens automatically.

**Why this priority**: Quality of life improvement. The core enforcement works without this, but this makes planning easier.

**Independent Test**: Can be tested by configuring a sprint with `tdd_green_for_tasks` and verifying relationships are created.

**Acceptance Scenarios**:

1. **Given** I configure a sprint with `tdd_relationships: [{ red_task_id: 10, green_task_id: 15 }, { red_task_id: 11, green_task_id: 15 }]`, **When** configuration completes, **Then** relationships are created: T10→T15, T11→T15.

2. **Given** relationships exist, **When** red task 10 completes with validated tests, **Then** entries are automatically assigned to task 15 without needing green_task_id parameter.

---

### Edge Cases

- What happens when a test identifier format doesn't match the scanning pattern? System logs warning to output and includes `warnings` array in response, but does NOT block.
- How does the system handle tests that are renamed between red and green phases? Implementor uses `update_tdd_red_test` tool to modify test_identifier (status must be REGISTERED or VALIDATED).
- What if the assigned green task is deleted or removed from sprint? Block sprint closeout with error: "Green task {id} assigned to {count} tests no longer exists."
- What if an implementor registers a test for a non-red-phase task? Tool rejects with error: "Task {id} does not have tdd_red_phase=true."

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide `register_tdd_red_test` tool accessible only to implementor role
- **FR-002**: System MUST store registry entries with status lifecycle: REGISTERED → VALIDATED → PENDING_GREEN → GREEN
- **FR-003**: System MUST scan workspace for tdd-red markers during pre-signal validation (Dart and TypeScript patterns)
- **FR-004**: System MUST perform bidirectional cross-check: registered↔marked during pre-signal
- **FR-005**: System MUST verify registered tests are FAILING during pre-signal validation
- **FR-006**: System MUST block red task completion if no green task is assigned (either upfront or provided)
- **FR-007**: System MUST update registry entries from VALIDATED to PENDING_GREEN when green task is assigned
- **FR-008**: System MUST verify tests pass AND markers removed when green task completes
- **FR-009**: System MUST block sprint closeout if ANY registry entry is not GREEN
- **FR-010**: System MUST support upfront task relationship declaration via `tdd_green_for_tasks` in configure_sprint
- **FR-011**: System MUST provide clear, actionable error messages at each blocking point

### Key Entities

- **tdd_task_relationships**: Links red tasks to their corresponding green tasks. Declared at sprint config or red task completion.
- **tdd_red_registry**: Individual test entries tracking status through the red-green lifecycle. Created by implementor registration, validated at pre-signal, assigned at red completion, greened at green completion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero TDD red-phase tests can reach sprint completion without transitioning to GREEN status
- **SC-002**: Implementors receive immediate, actionable feedback if registration/marker consistency fails
- **SC-003**: Orchestrators are blocked with clear guidance if attempting to complete red task without green assignment
- **SC-004**: Sprint 015 failure mode (40 tasks complete with zero functional changes) becomes structurally impossible
- **SC-005**: Full audit trail exists for every test's journey through REGISTERED → VALIDATED → PENDING_GREEN → GREEN

## Assumptions

- The existing tdd_red_phase flag on tasks is the trigger for TDD workflow
- Dart tests use `@Tags(['tdd-red:task-N'])` or inline `tags: ['tdd-red:task-N']` for marking
- TypeScript tests use `[tdd-red:task-N]` in test/describe name for marking
- The pre-signal executor infrastructure exists and can be extended
- SQLite database with drizzle ORM is the persistence layer
- Test execution uses vitest with JSON reporter (`vitest run --reporter=json`); exit code 0 = pass, non-zero = fail
- marker_type is inferred during validation scan; NULL in registry means "not yet validated" and is acceptable until pre-signal
