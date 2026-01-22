# Feature Specification: Interface Contract Validation

**Feature Branch**: `007-interface-contract-validation`  
**Created**: 2026-01-22  
**Status**: Draft  
**Input**: Technical Debt TD-025 - Interface Contract Validation

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Build-Time Schema Validation (Priority: P1)

As a developer working on Orchestra MCP tools, I want interface contract definitions to be validated against their specifications at build time, so that invalid schemas are caught before they reach production.

**Why this priority**: This is the core value proposition. The root cause incident (Sprint 006 `submit_code_review` shipping with invalid JSON Schema) would have been prevented by this feature. Build-time validation provides the earliest feedback loop.

**Independent Test**: Can be fully tested by introducing an intentionally invalid MCP schema (e.g., `{ type: "array" }` without `items`) and verifying the build fails with a clear error message.

**Acceptance Scenarios**:

1. **Given** a codebase with MCP tool definitions, **When** a developer introduces an invalid JSON Schema (array without `items`), **Then** the build process fails with a clear error indicating the specific schema violation.

2. **Given** a codebase with valid MCP tool definitions, **When** the build process runs, **Then** all schemas pass validation and the build completes successfully.

3. **Given** an invalid schema is detected, **When** the error message is displayed, **Then** it includes the specific file, property path, and JSON Schema specification requirement that was violated.

---

### User Story 2 - Orchestrator Verification Guidance (Priority: P2)

As an Orchestrator agent, I want clear guidance on including interface validation in verification criteria, so that I design tasks that catch contract violations before implementation completes.

**Why this priority**: Orchestrator agents prepare tasks with verification criteria. If they're unaware of interface validation requirements, they won't include appropriate checks. This is a preventive measure in the workflow.

**Independent Test**: Can be tested by having an Orchestrator prepare a task that modifies interface files and verifying the verification criteria include interface validity checks.

**Acceptance Scenarios**:

1. **Given** a task that modifies interface definition files, **When** the Orchestrator prepares the task, **Then** the verification criteria include a behavioral check for interface spec compliance.

2. **Given** agent instructions are updated, **When** an Orchestrator reads the interface validation section, **Then** they understand the principle of validating interfaces against their specifications with examples of common types.

---

### User Story 3 - Controller Code Review Validation (Priority: P2)

As a Controller agent reviewing code, I want to ensure interface validation is performed during code review, so that invalid contracts are caught even if the Orchestrator forgot to include validation in verification criteria.

**Why this priority**: This is the final safety net before code ships. Even if previous layers missed the validation requirement, the Controller should catch it during code review. Defense-in-depth requires this layer.

**Independent Test**: Can be tested by submitting code for review that contains an invalid interface definition and verifying the Controller detects and rejects it.

**Acceptance Scenarios**:

1. **Given** a code review for changes touching interface definition files, **When** the Controller runs the review, **Then** the Controller verifies interface validation was executed.

2. **Given** interface validation fails during code review, **When** the Controller submits the review, **Then** the decision is automatically CHANGES_REQUESTED with a BLOCKING severity issue.

3. **Given** interface validation passes during code review, **When** the Controller submits the review, **Then** the Controller proceeds with normal review considerations.

---

### User Story 4 - Controller Handover Review Check (Priority: P3)

As a Controller agent reviewing handovers, I want to verify that tasks touching interfaces include validation checks, so that the Orchestrator's verification design is complete.

**Why this priority**: This provides an intermediate checkpoint between task preparation and code review. It ensures the verification criteria are designed correctly before implementation begins.

**Independent Test**: Can be tested by having a Controller review a handover for an interface-modifying task and verifying the Controller checks for validation criteria.

**Acceptance Scenarios**:

1. **Given** a handover for a task that modifies interface files, **When** the Controller reviews the handover, **Then** the Controller verifies that verification criteria include interface validity checks.

2. **Given** a handover lacks interface validation criteria, **When** the Controller reviews it for the first time, **Then** the Controller issues a warning recommending validation be added.

3. **Given** a handover still lacks validation criteria after revision, **When** the Controller reviews it again, **Then** the Controller rejects the handover.

---

### Edge Cases

All edge cases have been resolved through clarification:

- **Validation tool not installed** → Hard failure (FR-003)
- **No registered validation pattern** → No validation; opt-in mechanism
- **File matches multiple patterns** → Configuration error (FR-002a)
- **Registration location** → Dedicated config file with sprint and mid-sprint amendment capability (FR-010, FR-011, FR-012)

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide a mechanism for projects to define interface validations, where each validation specifies: file patterns to match, validation command to run, and expected success criteria.

- **FR-002**: System MUST fail the build when any registered interface validation fails, with clear error messages indicating the file, validation type, and specific violation.

- **FR-002a**: Interface validation patterns MUST be mutually exclusive; if a file matches multiple patterns, the system MUST report a configuration error.

- **FR-003**: System MUST fail the build with a clear error message if a required validation tool is not installed (hard failure, no soft warnings).

- **FR-004**: Agent instructions MUST teach the principle "validate interfaces against their specifications" as a general practice, with examples of common interface types (e.g., JSON Schema, OpenAPI, package.json).

- **FR-005**: Agent instructions MUST require Orchestrators to include interface validation in verification criteria when tasks modify files that define external contracts.

- **FR-006**: Agent instructions MUST require Controllers to verify interface validation exists during code review when changes touch interface definition files.

- **FR-007**: Agent instructions MUST require Controllers to verify interface validation is included in verification criteria during handover review.

- **FR-008**: Validation errors MUST indicate the specific requirement that was violated (e.g., for JSON Schema: "arrays require 'items' property").

- **FR-009**: System MUST provide at least one reference implementation of interface validation (MCP tool JSON Schema validation) as an example for other interface types.

- **FR-010**: Interface validations MUST be stored in a dedicated project configuration file that persists across sprints.

- **FR-011**: Sprint configuration MUST be able to amend/add new interface validations to the project configuration.

- **FR-012**: System MUST provide a mechanism to add new interface validations mid-sprint when new interface types are discovered during implementation.

### Key Entities

- **Interface Definition**: A data structure that defines an external contract (schema, spec, config) consumed by external systems.

- **Interface Type**: The specification that governs an interface definition (JSON Schema, OpenAPI, GraphQL SDL, protobuf, etc.).

- **Validation Command**: The command or test that verifies an interface definition complies with its specification.

- **Interface Pattern**: File path patterns that indicate a file contains interface definitions.

- **Interface Validation Config**: Project-level configuration file storing registered interface validations (patterns, commands, success criteria).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Invalid interface definitions are caught at build time when validation is registered (zero production escapes for registered validations).

- **SC-002**: Developers receive actionable error messages within the normal build/test cycle (no runtime-only detection).

- **SC-003**: New interface validation capabilities require no changes to the existing Orchestra workflow (additive enhancement only).

- **SC-004**: At least one interface validation is implemented as a reference example (MCP tool JSON Schema validation).

- **SC-005**: The validation mechanism is extensible — adding a new interface type requires only configuration, not code changes.

- **SC-006**: Interface validation failures during Controller code review automatically result in CHANGES_REQUESTED decisions.

## Assumptions

- Projects define their own interface validations based on the contracts they expose (not limited to a predefined list).
- Validation commands are available in the project's development environment.
- The mechanism is extensible — new interface types can be added via configuration.
- MCP tool JSON Schema validation serves as the reference implementation/example.

## Clarifications

### Session 2026-01-22

- Q: What should happen when the validation tool for an interface type is not installed? → A: Hard failure - build fails with error if validation tool is missing (tools are easy to install).

- Q: Should we support only specific interface types (JSON Schema, OpenAPI, etc.)? → A: No. The system provides a generic mechanism for validating ANY interface type. Specific types (JSON Schema, OpenAPI, etc.) are EXAMPLES, not a fixed supported list. Projects define their own validations.

- Q: What happens when a file matches multiple interface patterns? → A: Patterns must be mutually exclusive by design. If a file matches multiple patterns, that is a configuration error that must be fixed.

- Q: How does the system handle files with no registered validation pattern? → A: No pattern = no validation. The mechanism is entirely opt-in/configuration-driven. Projects must register patterns for their interface types; agents are trained to ensure validations exist for interfaces they modify.

- Q: How are interface validations registered in a project? → A: Dedicated config file in project. Sprint configuration can amend/add new validations. Additionally, a mechanism must exist to add validations mid-sprint when new interface types are discovered during implementation.
