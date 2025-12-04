# Feature Specification: MCP Server for Orchestra

**Feature Branch**: `001-mcp-server`  
**Created**: December 4, 2025  
**Status**: Draft  
**Input**: User description: "Phase 2: MCP Server - Expose Orchestra operations as MCP tools for AI agents"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - AI Agent Prepares Task via MCP (Priority: P1)

An AI agent (such as GitHub Copilot in agent mode) needs to prepare the next task for implementation. The agent calls the Orchestra MCP server to get task details and handover instructions, enabling it to begin working on the assigned task without requiring the user to manually run CLI commands.

**Why this priority**: This is the core value proposition of the MCP server - enabling AI agents to participate in the Orchestra task orchestration workflow. Without this capability, agents cannot receive task assignments programmatically.

**Independent Test**: Can be fully tested by starting the MCP server, connecting an MCP client, and calling the `prepare` tool. Delivers immediate value by providing task context to the agent.

**Acceptance Scenarios**:

1. **Given** an initialized Orchestra sprint with pending tasks, **When** the AI agent calls the `prepare` tool, **Then** the agent receives complete task details including handover path, dependencies, and task metadata.
2. **Given** no Orchestra project in the current directory, **When** the AI agent calls the `prepare` tool, **Then** the agent receives a clear error indicating no Orchestra project was found.
3. **Given** all tasks are already completed, **When** the AI agent calls the `prepare` tool, **Then** the agent receives a message indicating no pending tasks are available.

---

### User Story 2 - AI Agent Views Sprint Status (Priority: P1)

An AI agent needs to understand the current state of the sprint - which tasks are completed, which is in progress, and overall progress metrics. This context helps the agent provide relevant assistance.

**Why this priority**: Status visibility is fundamental for any agent interaction. The agent must understand the current context before taking any action.

**Independent Test**: Can be fully tested by calling the `status` tool and verifying it returns accurate sprint and task information.

**Acceptance Scenarios**:

1. **Given** an Orchestra sprint with some completed tasks, **When** the AI agent calls the `status` tool, **Then** the agent receives sprint ID, current task details, and progress percentage.
2. **Given** an Orchestra sprint with a task in progress, **When** the AI agent calls the `status` tool, **Then** the agent receives the current task's ID, title, status, and category.
3. **Given** no current task is active, **When** the AI agent calls the `status` tool, **Then** the agent receives null for current task with clear indication of next steps.

---

### User Story 3 - Implementor Agent Signals Task Completion (Priority: P2)

An AI agent acting as an Implementor has finished implementing a task and needs to signal completion. The agent creates a signal file with implementation summary, modified files, and any notes for the Orchestrator.

**Why this priority**: Signal creation is essential for the verification workflow, but depends on P1 functionality (status and prepare) working first.

**Independent Test**: Can be tested by having an agent call `signal` with summary and files, then verifying the signal file is created correctly.

**Acceptance Scenarios**:

1. **Given** a task is in progress, **When** the Implementor agent calls `signal` with summary and files, **Then** a signal file is created with timestamp and the agent receives confirmation.
2. **Given** no task is currently in progress, **When** the Implementor agent attempts to signal, **Then** the agent receives an error indicating no active task.
3. **Given** a task is in progress, **When** the Implementor agent calls `signal` without specifying files, **Then** the system auto-detects modified files and includes them in the signal.

---

### User Story 4 - Orchestrator Agent Runs Verification (Priority: P2)

An AI agent acting as an Orchestrator needs to verify that the Implementor's work meets hidden verification criteria. The agent runs verification and receives results to determine next steps.

**Why this priority**: Verification is the core of Orchestra's value - preventing "implementation theater." However, it requires signal acceptance first.

**Independent Test**: Can be tested by having an Orchestrator agent call `verify` after signal acceptance and checking results.

**Acceptance Scenarios**:

1. **Given** a signal has been accepted, **When** the Orchestrator calls `verify`, **Then** the agent receives verification results with pass/fail for each criterion.
2. **Given** all verification criteria pass, **When** the Orchestrator calls `verify`, **Then** the agent receives success status and guidance to proceed to completion.
3. **Given** some criteria fail, **When** the Orchestrator calls `verify`, **Then** the agent receives failure details (without exposing criteria to Implementor) and guidance to generate feedback.

---

### User Story 5 - Orchestrator Agent Completes Task Workflow (Priority: P2)

An AI agent acting as an Orchestrator needs to complete the full task lifecycle: accept signal, verify, and mark complete. This enables end-to-end task orchestration.

**Why this priority**: Completing tasks closes the loop in the workflow but depends on earlier steps.

**Independent Test**: Can be tested by completing the full workflow: prepare → signal → accept_signal → verify → complete.

**Acceptance Scenarios**:

1. **Given** verification has passed, **When** the Orchestrator calls `complete`, **Then** the task status updates to "completed" and the agent receives next task information.
2. **Given** verification has not passed, **When** the Orchestrator attempts to complete, **Then** the agent receives an error indicating verification must pass first.
3. **Given** this is the last task in the sprint, **When** the Orchestrator completes it, **Then** the agent receives confirmation that the sprint is complete.

---

### User Story 6 - Orchestrator Agent Handles Verification Failures (Priority: P3)

When verification fails, the Orchestrator agent needs to generate actionable feedback for the Implementor or escalate persistent failures to a human supervisor.

**Why this priority**: Error handling is important but represents edge case flows after the happy path works.

**Independent Test**: Can be tested by intentionally failing verification and calling feedback/escalate tools.

**Acceptance Scenarios**:

1. **Given** verification failed, **When** the Orchestrator calls `feedback`, **Then** actionable guidance is generated without exposing hidden criteria.
2. **Given** 3 failed verification attempts, **When** the Orchestrator calls `escalate`, **Then** an escalation report is created for human review.
3. **Given** attempt count reaches 3, **When** the Orchestrator checks feedback response, **Then** the `canRetry` flag is false indicating escalation is required.

---

### Edge Cases

- What happens when the MCP server is called before Orchestra is initialized?
  - Return error with guidance to run `init` first.
- What happens when multiple agents try to access the same sprint concurrently?
  - Fail-fast: return error immediately with "operation in progress" message; caller is expected to retry after brief delay.
- What happens if the Implementor agent tries to call Orchestrator-only tools (verify, complete)?
  - Role separation is enforced; Implementor agents receive permission denied error.
- What happens if the .orchestra folder is corrupted or incomplete?
  - Validation errors returned with specific guidance on what's missing.
- What happens during network interruption while MCP server is processing?
  - STDIO transport handles disconnect gracefully; state is persisted before response.

## Requirements *(mandatory)*

### Functional Requirements

#### MCP Server Infrastructure
- **FR-001**: System MUST expose Orchestra operations as MCP tools following Model Context Protocol specification.
- **FR-002**: System MUST use STDIO transport for communication with MCP clients.
- **FR-003**: System MUST return JSON-RPC 2.0 compliant responses for all tool calls.
- **FR-004**: System MUST handle errors with appropriate MCP error codes (-32000 for application errors, -32600 for invalid requests).

#### Tool Registry
- **FR-005**: System MUST register exactly 10 tools matching CLI command names: init, status, closeout, prepare, signal, accept_signal, verify, complete, feedback, escalate.
- **FR-006**: System MUST provide input schemas for each tool defining required and optional parameters.
- **FR-007**: System MUST return structured responses matching documented TypeScript interfaces.

#### Core Functionality
- **FR-008**: System MUST wrap existing core library functions without duplicating business logic.
- **FR-009**: System MUST read and write to the `.orchestra/` folder structure as defined by Phase 1 CLI.
- **FR-010**: System MUST use lowercase status values (pending, in_progress, completed) consistent with Phase 1.
- **FR-011**: System MUST preserve role separation: Implementor tools (signal, status) vs Orchestrator tools (all others).

#### Role Enforcement
- **FR-012**: All tool calls MUST include a `role` parameter (value: "implementor" or "orchestrator"); calls without role MUST be rejected with descriptive error.
- **FR-013**: Implementor role MUST only access signal and status tools; attempts to access other tools MUST return permission denied error.
- **FR-014**: Orchestrator role MUST have access to all tools.
- **FR-015**: Verification results and hidden criteria MUST never be exposed through Implementor-accessible responses.

#### VS Code Integration
- **FR-016**: System MUST work with VS Code's Copilot MCP integration configuration.
- **FR-017**: System MUST be startable via node command for MCP client connections.

#### Retry and Escalation
- **FR-018**: System MUST track verification attempt count per task.
- **FR-019**: After 3 failed verification attempts, `feedback` tool MUST return `canRetry: false` indicating escalation is required.

### Key Entities

- **Tool**: An MCP-callable operation that wraps a CLI command. Has name, description, input schema, and returns structured response.
- **Signal**: Implementor's completion claim including summary, files modified, tests added, and notes. Created via `signal` tool.
- **Verification Result**: Outcome of running hidden criteria. Contains pass/fail per criterion. Never exposed to Implementor.
- **MCP Request**: JSON-RPC 2.0 message with method, params, and id. Processed by tool handlers.
- **MCP Response**: JSON-RPC 2.0 message with result or error. Formatted per tool's response schema.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: MCP server starts and responds to tool discovery requests within 2 seconds.
- **SC-002**: All 10 tools are callable from an MCP client and return valid responses.
- **SC-003**: AI agents can complete a full task lifecycle (prepare → signal → accept → verify → complete) without manual CLI intervention.
- **SC-004**: Error responses include actionable guidance with 100% coverage (no generic error messages).
- **SC-005**: Role separation prevents Implementor access to verification details with 100% enforcement.
- **SC-006**: Integration with VS Code Copilot agent mode allows task orchestration via natural language.
- **SC-007**: Existing test suite passes (346+ tests) after MCP integration without regression.
- **SC-008**: Documentation enables developers to configure MCP client within 5 minutes.

## Clarifications

### Session 2025-12-04

- Q: How should the MCP server enforce role separation between Implementor and Orchestrator agents? → A: Technical enforcement - MCP server requires a `role` parameter on each call and rejects unauthorized tool access.
- Q: What should happen when multiple agents try to modify sprint state concurrently? → A: Fail-fast - return error immediately if another operation is in progress; caller retries.
- Q: What is the maximum number of verification retry attempts before escalation is required? → A: 3 attempts.

## Assumptions

- Phase 1.2 CLI Technical Debt is completed before Phase 2 begins (specifically: `orchestra signal`, `orchestra feedback`, `orchestra escalate` commands exist).
- MCP SDK (@modelcontextprotocol/sdk) version 0.6.0+ is stable and supports STDIO transport.
- VS Code Copilot supports MCP tool discovery and calling via `github.copilot.chat.mcpServers` configuration.
- Core library functions (`runPrepare`, `runVerification`, etc.) have stable APIs that don't require modification for MCP wrapping.
