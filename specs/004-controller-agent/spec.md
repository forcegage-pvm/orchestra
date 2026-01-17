# Feature Specification: Controller Agent

**Feature Branch**: `004-controller-agent`  
**Created**: 2026-01-17  
**Status**: Draft  
**Input**: User description: "Implement Controller Agent for specification verification with mandatory review gates at sprint and task preparation phases"

---

## Overview

The Controller Agent introduces mandatory review gates to prevent orchestrator self-sabotage in the Orchestra workflow. The Sprint 017 post-mortem revealed that an orchestrator could write defective handovers, classify verification failures as "spec errors," and remove verification checks to pass broken work. This feature introduces an independent Controller agent that must approve both sprint configurations and task handovers before work can proceed.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sprint Configuration Review Gate (Priority: P1)

As a project owner, I want sprint configurations to be independently reviewed against the specification document before any tasks can be prepared, so that misconfigured sprints are caught early and cannot bypass verification.

**Why this priority**: This is the foundational gate that prevents the core vulnerability identified in Sprint 017. Without this, orchestrators can still create defective sprint configurations that lead to broken implementations.

**Independent Test**: Can be fully tested by configuring a sprint and verifying that task preparation is blocked until the Controller approves the sprint. Delivers value by ensuring all sprints align with their specification before work begins.

**Acceptance Scenarios**:

1. **Given** an orchestrator has configured a sprint, **When** the sprint configuration is saved, **Then** the sprint enters a "pending review" state and cannot proceed to task preparation.

2. **Given** a sprint is in "pending review" state, **When** the Controller reviews and approves the configuration, **Then** the sprint becomes active and task preparation is unblocked.

3. **Given** a sprint is in "pending review" state, **When** the Controller identifies issues and rejects the configuration, **Then** the sprint enters a "review failed" state with documented issues for the orchestrator to address.

4. **Given** a sprint is in "review failed" state, **When** the orchestrator revises and resubmits the configuration, **Then** the sprint returns to "pending review" state for another Controller review.

---

### User Story 2 - Task Handover Review Gate (Priority: P1)

As a project owner, I want each task handover to be reviewed against the specification before implementation begins, so that implementors receive accurate requirements that match the original specification.

**Why this priority**: Equal priority to sprint gate because this catches defective handovers that could cause implementors to build the wrong thing. Both gates are essential to close the vulnerability loop.

**Independent Test**: Can be fully tested by preparing a task handover and verifying that implementation is blocked until the Controller approves. Delivers value by ensuring implementors work from verified, spec-aligned handovers.

**Acceptance Scenarios**:

1. **Given** an orchestrator has prepared a task handover, **When** the handover is saved, **Then** the task enters a "pending handover review" state and cannot proceed to implementation.

2. **Given** a task is in "pending handover review" state, **When** the Controller reviews and approves the handover, **Then** the task transitions to "implement" state and the implementor can begin work.

3. **Given** a task is in "pending handover review" state, **When** the Controller finds the handover contradicts or weakens the specification, **Then** the task enters "handover review failed" state with documented issues.

4. **Given** a task is in "handover review failed" state, **When** the orchestrator updates and resubmits the handover, **Then** the task returns to "pending handover review" for another review.

---

### User Story 3 - Controller Agent Interface (Priority: P2)

As a Controller, I want a dedicated interface with read-only access to sprint configurations, task handovers, and specifications, so that I can perform accurate reviews without the ability to modify the work I'm reviewing.

**Why this priority**: Depends on the review gates being in place (P1 stories). The Controller needs appropriate tooling to perform effective reviews.

**Independent Test**: Can be tested by launching the Controller agent and verifying it has access to review tools but cannot modify sprints, tasks, or verification criteria. Delivers value by enabling independent, unbiased reviews.

**Acceptance Scenarios**:

1. **Given** a sprint is awaiting review, **When** the Controller is launched, **Then** the Controller has access to the sprint configuration, task definitions, and specification document.

2. **Given** a task handover is awaiting review, **When** the Controller reviews the handover, **Then** the Controller can compare handover acceptance criteria against specification requirements.

3. **Given** the Controller is reviewing work, **When** the Controller attempts to modify sprint, task, or verification data, **Then** the system prevents the modification (read-only access enforced).

---

### User Story 4 - Review Audit Trail (Priority: P2)

As a project owner, I want all review decisions to be logged with full context, so that I have a complete audit trail of what was reviewed, by whom, and what the outcome was.

**Why this priority**: Important for accountability and debugging workflow issues, but the core blocking mechanism (P1) must work first.

**Independent Test**: Can be tested by completing a review cycle and verifying all review decisions are recorded with timestamps, outcomes, and justifications. Delivers value by enabling post-hoc analysis of review quality.

**Acceptance Scenarios**:

1. **Given** the Controller approves a sprint, **When** the approval is recorded, **Then** the system stores the review type, decision, conformance level, spec requirements coverage, and timestamp.

2. **Given** the Controller rejects a handover, **When** the rejection is recorded, **Then** the system stores the specific issues identified, including handover text, spec text, and analysis.

3. **Given** multiple reviews have occurred for a single sprint or task, **When** a user views the review history, **Then** all reviews are shown in chronological order with revision counts.

---

### User Story 5 - Visual Status Indication (Priority: P3)

As a user, I want clear visual indicators when sprints or tasks are blocked awaiting review, so that I understand the current workflow state and what action is needed.

**Why this priority**: Quality-of-life improvement that makes the system easier to use, but core functionality works without it.

**Independent Test**: Can be tested by creating blocked sprints/tasks and verifying the UI shows appropriate status banners. Delivers value by reducing user confusion about workflow state.

**Acceptance Scenarios**:

1. **Given** a sprint is in "pending review" state, **When** viewing the sprint in the UI, **Then** a prominent banner indicates the sprint is awaiting Controller review.

2. **Given** a sprint review was rejected, **When** viewing the sprint in the UI, **Then** a banner shows the rejection status with a link to view issues and guidance for revision.

3. **Given** a task is in "pending handover review" state, **When** viewing the task in the UI, **Then** the task status clearly indicates it is blocked awaiting review.

---

### Edge Cases

- **Missing specification**: If the specification document cannot be found or is inaccessible, the review is blocked. The Controller cannot approve or reject—the orchestrator must provide or fix the spec path before the review can proceed.
- **Timeout scenarios**: Out of scope for MVP. Reviews have no timeout—the system waits indefinitely for Controller action. Future enhancement may add configurable timeouts with escalation.
- **Controller unavailability**: Out of scope for MVP. If Controller agent fails or is unavailable, the sprint/task remains blocked until a Controller review is completed. Future enhancement may add fallback to human supervisor.
- **Revision limit**: After 3 consecutive rejections of the same sprint or handover, the system escalates to human supervisor for resolution rather than allowing further revision cycles.
- **Gate bypass prevention**: Tools that change status validate the current state and reject invalid transitions. Attempting to transition from "pending handover review" to "implement" without Controller approval results in an error—the transition is blocked programmatically.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Sprint Review Gate

- **FR-001**: System MUST block task preparation until the sprint configuration has been reviewed and approved by the Controller.

- **FR-002**: System MUST transition sprint status to "pending spec review" after sprint configuration is complete.

- **FR-003**: System MUST provide a mechanism for the Controller to approve a sprint configuration, transitioning it to "active" status.

- **FR-004**: System MUST provide a mechanism for the Controller to reject a sprint configuration with documented issues, transitioning it to "spec review failed" status.

- **FR-005**: System MUST allow orchestrators to revise and resubmit rejected sprint configurations, returning them to "pending spec review" status.

#### Task Handover Review Gate

- **FR-006**: System MUST block implementation until the task handover has been reviewed and approved by the Controller.

- **FR-007**: System MUST transition task status to "pending handover review" after handover preparation is complete.

- **FR-008**: System MUST provide a mechanism for the Controller to approve a task handover, transitioning it to "implement" status.

- **FR-009**: System MUST provide a mechanism for the Controller to reject a task handover with documented issues, transitioning it to "handover review failed" status.

- **FR-010**: System MUST allow orchestrators to update and resubmit rejected handovers, returning them to "pending handover review" status.

#### Controller Agent Capabilities

- **FR-011**: Controller MUST have read-only access to sprint configurations, task definitions, and handover details.

- **FR-012**: Controller MUST have read-only access to specification documents for comparison during reviews.

- **FR-013**: Controller MUST NOT be able to modify sprints, tasks, verification criteria, or handovers.

- **FR-014**: Controller MUST be able to record conformance level (pass/warning/fail) with each review decision.

- **FR-015**: Controller MUST provide specific issue details when rejecting, including references to specification text.

#### Audit and Traceability

- **FR-016**: System MUST record all review decisions with reviewer identity, timestamp, and decision details.

- **FR-017**: System MUST track revision count for items that go through multiple review cycles.

- **FR-018**: System MUST maintain linkage between reviews and any subsequent amendments.

- **FR-019**: System MUST log handover changes as amendments when handovers are updated after rejection.

#### User Interface

- **FR-020**: System MUST display review status prominently when sprint or task is blocked.

- **FR-021**: System MUST provide mechanism to launch Controller agent for pending reviews.

- **FR-022**: System MUST display review history including issues, recommendations, and revision counts.

### Key Entities

- **Spec Review**: A record of a Controller's review decision, including the review type (sprint or handover), decision (approved/rejected), conformance level, issues found, and audit information.

- **Sprint Status**: Extended to include "pending spec review" and "spec review failed" states that block workflow progression.

- **Task Status**: Extended to include "pending handover review" and "handover review failed" states that block implementation.

- **Workflow Step**: Extended to include "spec review" and "handover review" steps representing the blocked states awaiting Controller action.

- **Amendment**: A record of changes made to handovers, enabling tracking of revisions after Controller rejection.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of sprint configurations must pass through Controller review before any tasks can be prepared.

- **SC-002**: 100% of task handovers must pass through Controller review before implementation can begin.

- **SC-003**: Zero instances where orchestrator-created handovers reach implementors without independent verification against the specification.

- **SC-004**: All review decisions are recorded with complete audit trail, enabling full reconstruction of review history.

- **SC-005**: Rejected items can be revised and resubmitted within the same session without workflow disruption.

- **SC-006**: Users can identify blocked sprints/tasks and their required actions within 5 seconds of viewing the interface. *(Operational guidance - verified via UX review, not automated test)*

- **SC-007**: Controller review adds less than 2 minutes overhead per review for straightforward approvals. *(Operational guidance - verified via user observation, not automated test)*

---

## Clarifications

### Session 2026-01-17

- Q: How should the system handle revision limits to prevent infinite reject-revise loops? → A: Soft cap – after 3 rejections, escalate to human supervisor for resolution
- Q: What should happen when the specification document cannot be found during review? → A: Block review – require orchestrator to provide/fix the spec path before review can proceed
- Q: How should the system respond if an orchestrator attempts to bypass the review gate? → A: Reject at tool level – tools that change status validate current state and reject invalid transitions

---

## Assumptions

- Specification documents are available in the workspace and can be read by the Controller agent.
- The Controller agent operates as a separate agent instance with its own tool namespace, distinct from orchestrator and implementor.
- Model selection (higher-capability model for Controller) is handled by the extension when launching agents.
- Database schema changes are applied via the existing migration system.
- The human supervisor role can bypass review gates if emergency override is needed (out of scope for this feature, documented for future consideration).
