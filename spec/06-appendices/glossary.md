# Appendix A: Glossary of Terms

> Aligned with Orchestra Bible v0.7.0 - Appendix A

## Core Entities

### Orchestrator
The supervisory AI agent responsible for project management, task decomposition, progress tracking, and quality verification. The Orchestrator never writes production code directly. See [Roles Specification](../02-architecture/roles.md) Section 4.1.

### Implementor  
The AI agent invoked to execute specific, bounded tasks. Works exclusively from handover documents without access to broader project context. See [Roles Specification](../02-architecture/roles.md) Section 4.2.

### Human Supervisor
The human user who retains ultimate authority over the project. May intervene at checkpoints, approve escalations, or provide clarifications. See [Roles Specification](../02-architecture/roles.md) Section 4.3.

### Manifest
The `manifest.yaml` file at the root of `.orchestra/` that tracks sprint state, task statuses, timestamps, retry counts, and metadata. The single source of truth for project progress.

### Handover Document
A Markdown file prepared by the Orchestrator containing everything an Implementor needs to complete a task: context, specifications, implementation guidelines, and verification criteria. Stored in `.orchestra/implementor/handovers/`.

---

## Task Lifecycle States

### INITIALIZATION
The first phase where Orchestrator reads the manifest (or creates one for new sprints), validates the last known state, and determines what work to perform.

### PENDING
A task has been defined in the manifest but no work has begun. The task awaits preparation.

### PREPARE
The Orchestrator creates the handover document containing full specifications, context, implementation guidelines, and verification criteria for the Implementor.

### IMPLEMENT
The Implementor is actively working on the task using only the handover document as context. This phase ends when the Implementor signals completion.

### GATE_CHECK
Post-implementation validation phase. Orchestrator runs automated verification scripts (tests, linting, schema validation) before human review.

### VERIFY
Human and/or automated review of the completed work. May result in acceptance, feedback for revision, or escalation.

### COMPLETE
The task has passed all verification and is marked done. Artifacts are archived and the manifest is updated.

### RETRY
A task that failed verification and is being re-attempted. Retry count is tracked; exceeding max retries triggers escalation.

### ESCALATED
A task that has exceeded retry limits or encountered unrecoverable errors. Requires human intervention before proceeding.

---

## File Artifacts

### Signal File
A marker file created by the Implementor to indicate task completion. Stored in `.orchestra/implementor/signals/` with naming convention `task-{id}-complete.signal`.

### Feedback File
A document from the Orchestrator providing revision instructions when verification fails. Stored in `.orchestra/handover/feedback.md` (transient - cleared when task passes).

### Sprint Directory
The `.orchestra/sprints/{sprint-id}/` folder containing all artifacts, logs, and metadata for a specific sprint.

### Verification Report
Output from verification scripts documenting what passed, what failed, and recommended actions. Stored in sprint artifacts.

---

## Script Categories

### Lifecycle Scripts
Scripts that manage task state transitions: `sprint-init.ps1`, `prepare-handover.ps1`, `signal-complete.ps1`, `task-closeout-check.ps1`.

### Validation Scripts
Scripts that verify correctness without changing state: `validate-handover.ps1`, `pre-signal-check.ps1`, `accept-signal-check.ps1`.

### Gate Scripts
Scripts that perform post-implementation verification: `gate-check.ps1`, `verification-audit.ps1`.

### Support Scripts
Scripts for monitoring, diagnostics, and error handling: `sprint-status.ps1`, `generate-feedback.ps1`, `escalate-failure.ps1`, `environment-check.ps1`.

---

## Workflow Concepts

### Sprint
A bounded work period containing one or more related tasks. Each sprint has its own directory and manifest section.

### Task Decomposition
The process by which the Orchestrator breaks down user requests into specific, implementable tasks with clear boundaries.

### Context Boundary
The principle that Implementors work exclusively from handover documents without access to broader project context, conversation history, or other tasks.

### Retry Loop
The automatic process of re-attempting a failed task with feedback, up to a configured maximum number of retries before escalation.

### Escalation
The process of flagging a task for human intervention when automated resolution is not possible.

---

## Verification Concepts

### Verification Criteria
Specific, measurable conditions defined in the handover document that must be satisfied for a task to pass verification.

### Gate Check
Automated verification performed after implementation but before human review. Includes tests, linting, and schema validation.

### Acceptance Criteria
High-level conditions that define when a task is considered complete from a product perspective.

---

## Document Types

### Task Specification
A detailed description of what needs to be implemented, including requirements, constraints, and expected outcomes.

### Implementation Guidelines
Step-by-step guidance for how to approach the implementation, including code patterns, file locations, and best practices.

### Context Section
Background information in a handover document explaining the broader purpose and how the task fits into the project.

---

## Operational Terms

### Cold Start
Starting a sprint or task with no prior state. The system initializes fresh context.

### Warm Continue
Resuming work on an existing sprint or task using persisted state from the manifest.

### State Persistence
The practice of storing all progress in files (manifest.yaml, signals, feedback) rather than relying on conversation memory.

### Checkpoint
A defined point in the workflow where human review or intervention is possible.

---

## Error Handling Terms

### Recoverable Error
An error that can be addressed through retry with feedback (e.g., failed tests, incomplete implementation).

### Unrecoverable Error
An error requiring human intervention (e.g., ambiguous requirements, infrastructure failure, exceeded retry limit).

### Graceful Degradation
The system's ability to continue operating in a reduced capacity when errors occur, rather than failing completely.

---

## Quality Concepts

### Code Quality Standards
Automated checks including linting, formatting, type checking, and static analysis that must pass during gate check.

### Test Coverage
The requirement that new code include appropriate tests as part of verification criteria.

### Documentation Debt
Missing or incomplete documentation that should be addressed as part of task completion.

---

## Abbreviations

| Abbreviation | Full Term |
|--------------|-----------|
| DTD | Dart Tooling Daemon |
| FOMO | Fear of Missing Output (anti-pattern: excessive context) |
| GATE | Go/No-Go Automated Testing Evaluation |
| MCP | Model Context Protocol |
| PR | Pull Request |
| QA | Quality Assurance |
| SISO | Signal In, Signal Out (completion pattern) |
| SoT | Source of Truth |
| WIP | Work in Progress |

---

## Anti-Patterns

### Context Bleed
When an Implementor receives or uses information beyond their handover document.

### State Drift
When actual project state diverges from what's recorded in the manifest.

### Over-Decomposition
Breaking tasks into pieces so small that overhead exceeds implementation value.

### Under-Specification
Handover documents lacking sufficient detail for independent implementation.

### Retry Storm
Excessive retries that waste resources without resolving underlying issues.

---

*This glossary provides standardized terminology for the Orchestra system. Terms should be used consistently across all documentation and implementation.*
