# Feature Specification: Custom AI Coding Agents

**Feature Branch**: `002-custom-agents`  
**Created**: January 12, 2026  
**Status**: Draft  
**Input**: Build custom AI coding agents in the Orchestra VS Code extension with real-time transparency, interruptability, persistent context and memory, file change tracking, and cross-session orchestrator context

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Implementor Executes Task Autonomously (Priority: P0)

A developer clicks the Play button on an IMPLEMENT-phase task, and the Implementor agent runs autonomously to complete the task. The agent reads the handover, implements the required changes by editing/creating files, runs tests if specified, and signals completion when done—all without requiring manual intervention.

**Why this priority**: This is the core value proposition of Orchestra agents. Without autonomous task execution, the entire custom agent system has no purpose.

**Independent Test**: Can be fully tested by triggering an agent on a prepared task and observing it read handover, make file changes, and signal completion.

**Acceptance Scenarios**:

1. **Given** a task in IMPLEMENT phase with a prepared handover, **When** user clicks Play on the task, **Then** the Implementor agent starts, reads the handover using `get_current_task`, implements changes using coding tools, and signals completion using `signal_completion`.
2. **Given** the agent is running, **When** a tool execution fails, **Then** the agent retries with a different approach or reports the failure clearly in the output panel.
3. **Given** the agent has completed its work, **When** verification fails and task returns to IMPLEMENT, **Then** the agent can retry using feedback from `get_feedback`.

---

### User Story 2 - Real-Time Transparency During Execution (Priority: P0)

While an agent runs, the user sees everything happening in real-time: the agent's thinking/reasoning, which tools are being called, tool parameters, and results. This transparency builds trust and allows users to understand what the agent is doing.

**Why this priority**: Without visibility into agent actions, users cannot trust autonomous execution or debug when things go wrong. This is essential for user confidence.

**Independent Test**: Can be tested by running any agent and observing that thinking, tool calls, and results stream to the output panel in real-time.

**Acceptance Scenarios**:

1. **Given** an agent is running, **When** the agent reasons about its next action, **Then** the thinking/reasoning text appears immediately in the Agent Output Panel.
2. **Given** an agent calls a tool, **When** the tool is invoked, **Then** the tool name and input parameters are displayed before the tool executes.
3. **Given** a tool finishes execution, **When** the result is returned, **Then** the result (success/failure and output) is displayed in a collapsible card.

---

### User Story 3 - User Controls Agent Execution (Priority: P0)

Users can pause, resume, stop, and redirect the agent at any time. This ensures users remain in control and can intervene when needed.

**Why this priority**: Autonomous agents without user control are dangerous. Users must be able to stop runaway agents or change direction when they spot issues.

**Independent Test**: Can be tested by starting an agent, using pause/resume/stop controls, and observing correct state transitions and continuation behavior.

**Acceptance Scenarios**:

1. **Given** an agent is running, **When** user clicks Pause, **Then** the agent completes its current step and halts, displaying "Paused" status.
2. **Given** an agent is paused, **When** user clicks Resume, **Then** the agent continues from where it stopped.
3. **Given** an agent is running, **When** user clicks Stop, **Then** the agent terminates, saves its state, and displays "Stopped" status.
4. **Given** an agent is paused or running, **When** user types a new instruction and clicks Send, **Then** the instruction is injected into the conversation and the agent adapts its behavior.

---

### User Story 4 - Track and Undo File Changes (Priority: P1)

Users see all files the agent has created, modified, or deleted in a Changed Files panel. Users can view diffs for any file and undo individual changes or all changes at once.

**Why this priority**: Users need to understand and control what the agent changed. Without this, users may accept harmful changes unknowingly.

**Independent Test**: Can be tested by running an agent that modifies files, then verifying the Changed Files panel shows all changes with working Diff and Undo buttons.

**Acceptance Scenarios**:

1. **Given** an agent modifies a file, **When** the change is applied, **Then** the file appears in the Changed Files panel with its modification type (create/modify/delete).
2. **Given** a file in the Changed Files panel, **When** user clicks Diff, **Then** a diff view shows the before/after comparison.
3. **Given** a file in the Changed Files panel, **When** user clicks Undo, **Then** the file is restored to its pre-agent state.
4. **Given** multiple files in the Changed Files panel, **When** user clicks "Undo All", **Then** all agent changes are reverted in reverse order.

---

### User Story 5 - Session Persistence and Resume (Priority: P1)

If VS Code restarts or the user stops the agent, the session state is preserved. When the user returns, they can resume the agent from where it left off.

**Why this priority**: Long-running tasks may be interrupted. Without persistence, all progress is lost and users must start over.

**Independent Test**: Can be tested by running an agent, closing VS Code, reopening, and observing the agent can resume from its last checkpoint.

**Acceptance Scenarios**:

1. **Given** an agent is running, **When** VS Code is closed unexpectedly, **Then** the session state (conversation, iteration, files changed) is saved to disk.
2. **Given** a saved session exists, **When** VS Code restarts, **Then** the user is prompted to resume the interrupted session.
3. **Given** user chooses to resume, **When** the agent restarts, **Then** it continues from its last checkpoint with full context.

---

### User Story 6 - Orchestrator Cross-Session Context (Priority: P1)

The Orchestrator agent remembers what happened in previous tasks within the same sprint. When preparing a new task, the Orchestrator has context about architecture decisions, what patterns worked, what mistakes implementors made, and lessons learned.

**Why this priority**: Orchestrator operates across many tasks. Without memory, each task preparation is done in isolation, leading to inconsistent guidance and repeated mistakes.

**Independent Test**: Can be tested by having the Orchestrator complete multiple tasks, then verifying that context from earlier tasks influences later task preparation.

**Acceptance Scenarios**:

1. **Given** the Orchestrator completes verifying Task 1, **When** it begins preparing Task 2, **Then** it has access to a summary of Task 1 (outcome, lessons learned, key decisions).
2. **Given** an implementor made a specific mistake in a previous task, **When** the Orchestrator prepares the next task, **Then** it can reference that pattern to provide better guidance.
3. **Given** the sprint has been running for many tasks, **When** memory grows large, **Then** older task summaries are compacted while preserving key insights.

---

### User Story 7 - Verbosity Configuration (Priority: P2)

Users can configure how much detail they see in the Agent Output Panel. Minimal shows only tool calls and results. Normal adds agent reasoning. Detailed shows full LLM responses. Debug includes token counts and timing.

**Why this priority**: Different users have different needs. Power users want details; casual users want clean output.

**Independent Test**: Can be tested by changing verbosity settings and observing the output panel shows more or less information accordingly.

**Acceptance Scenarios**:

1. **Given** verbosity is set to MINIMAL, **When** the agent runs, **Then** only tool calls and results are shown (no thinking text).
2. **Given** verbosity is set to NORMAL, **When** the agent runs, **Then** agent thinking/reasoning is also displayed.
3. **Given** verbosity is set to DEBUG, **When** the agent runs, **Then** token usage, timing, and raw message details are shown.

---

### User Story 8 - Model Selection Per Agent (Priority: P2)

Users can choose which Copilot model each agent uses. The Orchestrator might use a more powerful model while the Implementor uses a faster one.

**Why this priority**: Different tasks benefit from different models. Orchestrator needs reasoning; Implementor needs speed for code edits.

**Independent Test**: Can be tested by changing model settings and observing the agents use the selected models.

**Acceptance Scenarios**:

1. **Given** no model is configured, **When** user first runs an agent, **Then** a quick pick appears with available models.
2. **Given** user selects a model, **When** the agent runs, **Then** it uses the selected model.
3. **Given** models are configured per-agent, **When** switching between Orchestrator and Implementor, **Then** each uses its own configured model.

---

### Edge Cases

- What happens when the agent exceeds the maximum iteration limit?
  - **Answer**: Agent stops gracefully, saves state, and warns user about incomplete task.
- How does the system handle LLM rate limits?
  - **Answer**: Implement exponential backoff, pause gracefully, notify user of delay.
- What happens if a tool call fails repeatedly?
  - **Answer**: Agent tries alternative approaches; at retry limit, warns user; at max retries, auto-escalates.
- How is context managed when conversations exceed token limits?
  - **Answer**: ContextManager summarizes old tool results and drops old iterations while preserving essential context.
- What happens if user edits files while agent is paused?
  - **Answer**: Agent tracks only its own changes; user's manual edits are their responsibility.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST provide an AgentRunner component that executes an autonomous agent loop using VS Code's `vscode.lm` API.
- **FR-002**: System MUST provide a ToolRegistry that registers, manages, and executes agent tools.
- **FR-003**: System MUST implement all required coding tools: edit, read_file, new (create file), delete, search, grep_search, problems, runTests, runCommands, runTasks, usages, test_failure, fetch, list_directory.
- **FR-003a**: System MAY implement optional tools in a future sprint: changes (git diffs), todos (todo management). These are deferred as the agent can use terminal git commands and todos are orthogonal to task execution.
- **FR-004**: System MUST implement Orchestra-specific tools for Implementor: get_current_task, signal_completion, get_feedback, get_progress, escalate_task.
- **FR-005**: System MUST implement Orchestra-specific tools for Orchestrator: get_sprint_status, prepare_task, run_verification_checks, submit_verification_judgment.
- **FR-006**: System MUST display real-time agent output (thinking, tool calls, results) in a dedicated Webview Panel in the editor area with rich formatting (collapsible cards for tool results).
- **FR-007**: System MUST provide Pause, Resume, and Stop controls that correctly manage agent state.
- **FR-008**: System MUST allow users to inject new instructions via a Redirect mechanism.
- **FR-009**: System MUST track all file changes (create/modify/delete) made by agent tools.
- **FR-010**: System MUST display file changes in a Changed Files panel with Diff and Undo capabilities.
- **FR-011**: System MUST persist agent session state to disk for resume after interruption.
- **FR-012**: System MUST restore agent sessions from persisted state.
- **FR-013**: System MUST maintain sprint-level memory for the Orchestrator across tasks.
- **FR-014**: System MUST inject relevant sprint context when Orchestrator starts a new task.
- **FR-015**: System MUST compact sprint memory after every 5 completed tasks, summarizing older task entries while preserving key insights.
- **FR-016**: System MUST support configurable verbosity levels (MINIMAL, NORMAL, DETAILED, DEBUG).
- **FR-017**: System MUST allow per-agent model selection (Orchestrator and Implementor can use different models).
- **FR-018**: System MUST enforce maximum iteration limits to prevent infinite loops.
- **FR-019**: System MUST handle tool execution errors gracefully with retry logic.
- **FR-020**: System MUST manage context window size using summarization and compaction strategies.
- **FR-021**: System MUST stream LLM responses in real-time (not wait for complete response).
- **FR-022**: System MUST auto-escalate tasks after maximum retry attempts.

### Key Entities

- **AgentSession**: Represents one execution lifecycle of an agent, including identity, state, conversation history, files modified, and checkpoints.
- **AgentTool**: A capability the agent can invoke, with name, description, input schema, and execution function.
- **FileChange**: Records a file modification with URI, operation type, original content, new content, timestamp, and tool call ID.
- **SprintMemory**: Cross-session context for the Orchestrator including sprint goals, architecture decisions, task summaries, and implementor patterns.
- **TaskSummary**: Compact record of a completed task for sprint memory, including outcome, attempt count, and lessons learned.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can complete a full task lifecycle (Play → agent runs → completion) without manual intervention in under 10 minutes for typical tasks.
- **SC-002**: Agent thinking and tool calls appear in the output panel within 1 second of occurring.
- **SC-003**: Users can pause a running agent and resume it successfully 100% of the time.
- **SC-004**: Users can stop an agent and resume later (including after VS Code restart) 95% of the time.
- **SC-005**: All file changes made by the agent are visible in the Changed Files panel with 100% accuracy.
- **SC-006**: Users can undo agent file changes with 100% success rate for files not manually modified during the session.
- **SC-007**: Orchestrator demonstrates use of previous task context when preparing subsequent tasks in the same sprint.
- **SC-008**: Agent sessions never exceed the configured maximum iteration limit (default 50).
- **SC-009**: Context compaction maintains agent functionality even after 20+ tool calls in a single session.
- **SC-010**: 90% of users successfully complete their first agent-executed task on first attempt.

## Assumptions

- The VS Code `vscode.lm` API is available and provides access to Copilot language models.
- Users have GitHub Copilot access with appropriate permissions to use language models.
- The existing Orchestra MCP database infrastructure is in place for Orchestra-specific tools.
- The extension already has a Play button mechanism that can be connected to agent invocation.
- Users understand that agents operate autonomously and will be given appropriate onboarding.
- Sprint memory files stored in `.orchestra/sprint-memory/` will be committed to git for team sharing.
- Agent sessions stored in `.orchestra/agent-sessions/` will be gitignored (local to each developer).

## Dependencies

- **VS Code Language Model API** (`vscode.lm`): Required for LLM access.
- **Orchestra MCP Database**: Required for Orchestra-specific tools to read/write task and sprint data.
- **VS Code Workspace Edit API**: Required for file modifications.
- **VS Code Webview API**: Required for Agent Output Panel and Changed Files panel.
- **Existing Extension Infrastructure**: Play button handlers, session management, database connections.

## Out of Scope

- Chat participant integration (using `@mention` in VS Code chat) - agents are invoked programmatically only.
- Multi-agent concurrency (running Orchestrator and Implementor simultaneously) - only one agent active at a time.
- External LLM providers (only Copilot via `vscode.lm` is supported).
- Per-tool consent dialogs - user consents by invoking the agent.
- Thumbs up/down feedback on agent responses - not critical for initial release.
- Automatic learning from user feedback to improve agent behavior.
- Tool execution sandboxing or command restrictions - user consent at agent invocation implies trust for all tool operations.

## Clarifications

### Session 2026-01-12

- Q: When the agent executes potentially dangerous tools (like `runCommands`, `delete`, or `runTasks`), what restrictions should apply? → A: No restrictions—user consents by invoking agent, all commands allowed.
- Q: What threshold triggers sprint memory compaction? → A: Task count—compact after every 5 completed tasks.
- Q: Where should the Agent Output Panel appear in VS Code's layout? → A: Webview Panel in the editor area with rich formatting (collapsible cards).
