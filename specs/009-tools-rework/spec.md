# Feature Specification: Agent Tools Rework

**Feature Branch**: `009-tools-rework`  
**Created**: 2026-01-29  
**Status**: Draft  
**Input**: Replace current agent tools with VS Code API-native implementations aligned with LanguageModelTool interface, featuring standardized ToolResult types, structured error handling, WorkspaceEdit for file mutations, shell integration for terminal capture, and observability-ready architecture

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Agent Executes File Edit Successfully (Priority: P1)

As an agent (orchestrator or implementor), I can request a file edit using the `edit-file` tool, and the system reliably finds the target text, applies the replacement atomically via WorkspaceEdit, and returns a structured result indicating success with the file path.

**Why this priority**: File editing is the most common agent operation. Without reliable edit tools, agents cannot modify code.

**Independent Test**: Can be tested by invoking the edit-file tool with a known file and oldString/newString, verifying the file content changes and the result contains `success: true`.

**Acceptance Scenarios**:

1. **Given** a file exists with known content, **When** agent calls edit-file with matching oldString, **Then** file is updated and result has `success: true` with content describing the change
2. **Given** a file with CRLF line endings, **When** agent provides oldString with LF endings, **Then** line ending normalization succeeds and edit applies correctly
3. **Given** an edit is applied, **When** user presses Ctrl+Z, **Then** the edit is undone as a single atomic operation (WorkspaceEdit integration)

---

### User Story 2 - Agent Runs Terminal Command with Output Capture (Priority: P1)

As an agent, I can execute terminal commands and receive the complete output along with the exit code, enabling me to verify command success and parse output for decision-making.

**Why this priority**: Agents need to run build commands, tests, and scripts. Without output capture, they cannot verify results.

**Independent Test**: Can be tested by running a simple command like `echo hello` and verifying the result contains the output text and exit code 0.

**Acceptance Scenarios**:

1. **Given** shell integration is available, **When** agent runs `echo test`, **Then** result contains output "test" and exitCode 0
2. **Given** shell integration is NOT available, **When** agent runs a command, **Then** command executes with fallback and result indicates shell integration unavailable
3. **Given** a long-running command, **When** cancellation is requested, **Then** command execution stops and result has error code `CANCELLED`

---

### User Story 3 - Agent Receives Actionable Error on Failure (Priority: P1)

As an agent, when a tool operation fails, I receive a structured error with a machine-readable code, human-readable message, and actionable suggestion for recovery.

**Why this priority**: Without actionable errors, agents cannot self-correct or provide meaningful feedback to users.

**Independent Test**: Can be tested by calling read-file with a non-existent path and verifying the result contains `success: false`, error code `FILE_NOT_FOUND`, and a suggestion.

**Acceptance Scenarios**:

1. **Given** file does not exist, **When** agent calls read-file, **Then** result has `error.code: "FILE_NOT_FOUND"` and `error.suggestion` with recovery guidance
2. **Given** edit-file oldString matches multiple locations, **When** agent attempts edit, **Then** result has `error.code: "MULTIPLE_MATCHES"` and suggestion to provide more context
3. **Given** create-file targets existing file, **When** agent attempts create, **Then** result has `error.code: "FILE_EXISTS"` and suggestion to use edit-file instead

---

### User Story 4 - Agent Reads File Content with Line Range (Priority: P2)

As an agent, I can read file contents optionally specifying a line range, enabling efficient context gathering without loading entire large files.

**Why this priority**: Context window efficiency is critical. Reading only needed lines reduces token usage.

**Independent Test**: Can be tested by reading lines 5-10 of a known file and verifying only those lines are returned.

**Acceptance Scenarios**:

1. **Given** a file with 100 lines, **When** agent calls read-file with startLine=10 endLine=20, **Then** result contains only lines 10-20
2. **Given** a file with UTF-8 encoding, **When** agent reads it, **Then** content is correctly decoded
3. **Given** a binary file, **When** agent attempts to read, **Then** result indicates file type issue gracefully

---

### User Story 5 - Agent Creates New File with Content (Priority: P2)

As an agent, I can create new files with specified content, with atomic creation that fails if the file already exists.

**Why this priority**: Agents need to scaffold new code files. Preventing overwrites protects existing work.

**Independent Test**: Can be tested by creating a file in a temp directory and verifying its content matches.

**Acceptance Scenarios**:

1. **Given** target path does not exist, **When** agent calls create-file, **Then** file is created with content and result has `success: true`
2. **Given** parent directory does not exist, **When** agent calls create-file, **Then** parent directories are created automatically
3. **Given** file already exists, **When** agent calls create-file, **Then** result has `error.code: "FILE_EXISTS"`

---

### User Story 6 - Agent Runs VS Code Task (Priority: P2)

As an agent, I can execute VS Code tasks defined in tasks.json and wait for completion.

**Why this priority**: Build and test tasks are defined as VS Code tasks. Agents need to trigger them.

**Independent Test**: Can be tested by defining a simple shell task and verifying it executes.

**Acceptance Scenarios**:

1. **Given** task "build" exists in tasks.json, **When** agent calls run-task, **Then** task executes and result indicates completion
2. **Given** task does not exist, **When** agent calls run-task, **Then** result has `error.code: "TASK_NOT_FOUND"`

---

### User Story 7 - Agent Gets Diagnostic Problems (Priority: P3)

As an agent, I can retrieve diagnostics (errors, warnings) from VS Code's Problems panel, optionally filtered by file or severity.

**Why this priority**: Agents need to check for lint/compile errors after edits.

**Independent Test**: Can be tested by opening a file with known errors and verifying they appear in the result.

**Acceptance Scenarios**:

1. **Given** TypeScript file has errors, **When** agent calls get-problems with filePath, **Then** result contains error diagnostics with line numbers
2. **Given** no problems exist, **When** agent calls get-problems, **Then** result contains empty problems array with counts of 0

---

### Edge Cases

- What happens when file path contains special characters or spaces? (Must handle correctly on Windows)
- How does system handle very large file reads? → Warn and truncate at 1MB with suggestion to use line ranges
- What happens when terminal command produces binary output? (Should handle gracefully)
- How does system handle concurrent tool executions? (Each gets unique callId)
- What happens when workspace root is undefined? (Should fail gracefully with clear error)

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: All file mutation tools MUST use `vscode.WorkspaceEdit` for atomic, undo-able operations
- **FR-002**: All tools MUST return standardized `ToolResult` with `success`, `content[]`, optional `error`, and `metadata`
- **FR-003**: All error results MUST include structured `ToolError` with `code`, `message`, and `suggestion`
- **FR-004**: Terminal tools MUST use VS Code shell integration API for output capture when available
- **FR-005**: Terminal tools MUST fall back to sendText when shell integration is unavailable, with warning in result
- **FR-006**: All tools MUST accept `CancellationToken` and check it periodically during long operations
- **FR-007**: Edit-file tool MUST normalize line endings (CRLF/LF) for matching
- **FR-008**: Edit-file tool MUST reject edits where oldString matches multiple locations
- **FR-009**: Create-file tool MUST fail if file already exists (no silent overwrite)
- **FR-010**: All tools MUST accept optional `ToolObserver` in context without requiring it
- **FR-011**: MCP tools MUST be wrapped using consistent adapter pattern with standardized error conversion
- **FR-012**: Tools MUST enforce execution timeout: 30s default for file operations, 240s for terminal operations, configurable per-tool
- **FR-013**: Read-file tool MUST warn and truncate content exceeding 1MB, with suggestion to use line range parameters
- **FR-014**: Migration is full replacement - old tool implementations are removed, AgentRunner updated to use new ToolResult interface

### Key Entities

- **ToolResult**: Standardized response from all tools (success, content[], error?, metadata)
- **ToolError**: Structured error with code, message, suggestion, and optional details
- **ToolErrorCode**: Fixed enum of error codes:
  - File operations: `FILE_NOT_FOUND`, `FILE_EXISTS`, `PATH_TRAVERSAL`, `PERMISSION_DENIED`, `BINARY_FILE`, `FILE_TOO_LARGE`
  - Edit operations: `MULTIPLE_MATCHES`, `NO_MATCH`, `INVALID_RANGE`
  - Terminal operations: `SHELL_INTEGRATION_UNAVAILABLE`, `COMMAND_FAILED`, `NO_OUTPUT`
  - Task operations: `TASK_NOT_FOUND`, `TASK_FAILED`
  - General: `TIMEOUT`, `CANCELLED`, `INVALID_INPUT`, `WORKSPACE_REQUIRED`, `UNKNOWN`
- **ToolMetadata**: Execution info including toolName, callId, durationMs
- **ToolInvocationContext**: Context passed to all tools (workspaceRoot, sessionId, token, optional observer)
- **AgentTool**: Interface for tool implementations with invoke() and optional prepareInvocation()

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: All 9 coding tools replaced with new implementations (read-file, edit-file, create-file, delete-file, list-directory, search-files, grep-search, find-usages, create-directory)
- **SC-002**: All 5 system tools replaced (run-terminal, run-task, get-problems, run-tests, get-terminal-output)
- **SC-003**: 100% of tool failures return structured ToolError with code and suggestion
- **SC-004**: All file mutation tools use WorkspaceEdit (verified by undo working)
- **SC-005**: Terminal tools capture output on Windows with PowerShell via shell integration
- **SC-006**: >80% test coverage for new tool implementations
- **SC-007**: All tools check CancellationToken and can be interrupted
- **SC-008**: AgentRunner updated to consume new ToolResult interface directly (no legacy adapter)

## Assumptions

- VS Code version 1.93+ is available (required for TerminalShellIntegration API)
- Shell integration is enabled in VS Code settings (default behavior)
- Workspace has at least one folder open
- MCP server tools remain unchanged in their handler logic, only adapter layer updated

## Security

- **SEC-001**: All file tools MUST validate that resolved paths remain within the workspace root (path traversal protection)
- **SEC-002**: Terminal command construction is trusted (agent-generated); command injection protection deferred to observability sprint

## Dependencies

- VS Code API: workspace.fs, WorkspaceEdit, Terminal.shellIntegration, tasks, languages.getDiagnostics
- Node.js: EventEmitter, crypto for callId generation
- Existing: Zod for input validation

## Out of Scope (Deferred to Future Sprint)

- Full ToolObserver EventEmitter implementation
- Subscriber implementations (OutputChannel, FileLog, TreeView, StatusBar)
- UI integration with real-time tool status updates
- Telemetry integration

## Clarifications

### Session 2026-01-29

- Q: What security controls should file and terminal tools implement? → A: Path protection only - validate file paths stay within workspace root; trust agent-constructed commands
- Q: What timeout behavior should tools enforce? → A: 30 seconds default, per-tool override - File ops: 30s, terminal: 240s configurable
- Q: How should large file reads be handled? → A: Warn and truncate at 1MB, suggest line range reads
- Q: What migration strategy for old to new tools? → A: Full replacement - no backward compatibility needed; AgentRunner will be updated to use new interface directly
- Q: How should error codes be standardized? → A: Fixed enum of ~18 error codes covering file, edit, terminal, task, and general categories
