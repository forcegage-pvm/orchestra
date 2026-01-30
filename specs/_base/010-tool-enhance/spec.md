# Feature Specification: Enhanced Agent Tools

**Feature Branch**: `010-tool-enhance`  
**Created**: 2026-01-30  
**Status**: Draft  
**Input**: Research from `docs/research/tools/002/` - terminal tools analysis, file manipulation analysis, bulk refactoring research

## Executive Summary

This specification defines enhanced tools for AI coding agents to address the core failure modes identified in production tools (Claude Code, Cursor, Aider, RooCode, SWE-agent). The focus is on three areas:

1. **Terminal Tools** - Background process management, output capture, long-running process supervision
2. **File Editing Tools** - Fuzzy matching, line-based editing, validation before apply
3. **Refactoring Tools** - Semantic rename via LSP, bulk pattern replacement via ast-grep

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Agent Starts Development Server and Continues Working (Priority: P1)

As an agent, I can start a long-running process like `npm run dev`, immediately continue with other work, and later check if the server is ready by monitoring its output.

**Why this priority**: The #1 problem identified across all research - agents get blocked waiting for dev servers.

**Independent Test**: Start a process with `start_process`, verify it returns immediately, then use `get_process_output` to check status.

**Acceptance Scenarios**:

1. **Given** agent starts `npm run dev`, **When** process launches, **Then** tool returns immediately with process_id and agent can continue
2. **Given** a running process with `ready_pattern: "ready on port"`, **When** server emits that pattern, **Then** status changes to `ready` and port is captured
3. **Given** agent needs to stop a server, **When** calling `stop_process` with SIGTERM, **Then** process terminates gracefully and final output is captured

---

### User Story 2 - Agent Runs Command with Reliable Output Capture (Priority: P1)

As an agent, I can run a terminal command and receive complete output with exit code, even when VS Code shell integration is unavailable.

**Why this priority**: Shell integration failures cause cascading tool failures and auto-escalation.

**Independent Test**: Run `echo hello` and verify output contains "hello" with exit code 0.

**Acceptance Scenarios**:

1. **Given** shell integration is available, **When** agent runs command, **Then** output is captured via shell integration stream
2. **Given** shell integration unavailable, **When** agent runs command, **Then** tool falls back to subprocess with warning (not failure)
3. **Given** command times out, **When** timeout_ms is exceeded, **Then** partial output is returned and process is terminated cleanly
4. **Given** output exceeds 500 lines, **When** command completes, **Then** output is truncated with head/tail preservation

---

### User Story 3 - Agent Edits File with Fuzzy Match Fallback (Priority: P1)

As an agent, I can edit a file even when my `old_text` has minor whitespace or indentation differences from the actual file content.

**Why this priority**: "String not found" is the #1 file editing failure - fuzzy matching solves 80% of cases.

**Independent Test**: Provide `old_text` with wrong indentation, verify edit still applies via fuzzy matching.

**Acceptance Scenarios**:

1. **Given** exact match exists, **When** agent calls smart_replace, **Then** exact match is used (fastest path)
2. **Given** no exact match but whitespace-normalized match exists, **When** agent calls smart_replace, **Then** normalized match is used
3. **Given** no normalized match but fuzzy match above threshold exists, **When** agent calls smart_replace, **Then** fuzzy match is used with similarity reported
4. **Given** multiple matches exist, **When** agent provides `occurrence: 2`, **Then** second occurrence is replaced
5. **Given** start_line_hint provided, **When** fuzzy searching, **Then** middle-out search starts from hint location

---

### User Story 4 - Agent Edits by Line Number (Priority: P2)

As an agent, when I know the exact line range, I can edit directly by line numbers without needing to match text.

**Why this priority**: Bypasses uniqueness constraint - critical for test files with duplicate patterns.

**Independent Test**: Read file, identify line range, call `edit_lines` with that range.

**Acceptance Scenarios**:

1. **Given** valid line range, **When** agent calls edit_lines, **Then** lines are replaced with new content
2. **Given** `preserve_indentation: true`, **When** replacement has different indent, **Then** surrounding indentation is matched
3. **Given** invalid line range, **When** agent calls edit_lines, **Then** error with valid range suggestion

---

### User Story 5 - Agent Validates Edit Before Applying (Priority: P2)

As an agent, I can preview and validate an edit before applying it to catch syntax errors before they cause infinite retry loops.

**Why this priority**: Infinite retry loops from syntax errors are a major failure mode.

**Independent Test**: Propose edit that would cause syntax error, verify validation catches it.

**Acceptance Scenarios**:

1. **Given** valid edit, **When** agent calls validate_edit, **Then** success with diff preview
2. **Given** edit introduces syntax error, **When** agent calls validate_edit, **Then** failure with specific error location and fix suggestion
3. **Given** edit with dry_run: true, **When** agent calls edit tool, **Then** changes previewed but not applied

---

### User Story 6 - Agent Renames Symbol Across Codebase (Priority: P2)

As an agent, I can rename a class, function, or variable and have all references updated correctly across the entire codebase.

**Why this priority**: Multi-file refactoring without proper tools leads to broken code.

**Independent Test**: Rename a class, verify all import statements and usages update.

**Acceptance Scenarios**:

1. **Given** cursor on renameable symbol, **When** agent calls rename_symbol, **Then** all references updated via LSP
2. **Given** preview mode, **When** agent calls rename_symbol with preview: true, **Then** list of all changes returned without applying
3. **Given** language server not available, **When** agent calls rename_symbol, **Then** helpful error explaining requirement

---

### User Story 7 - Agent Performs Bulk Pattern Replacement (Priority: P3)

As an agent, I can replace a code pattern across the entire codebase using AST-aware structural matching.

**Why this priority**: API migrations and codemod-style changes are common but error-prone with text replace.

**Independent Test**: Replace `console.log($MSG)` with `logger.info($MSG)` across all files.

**Acceptance Scenarios**:

1. **Given** pattern with metavariables, **When** agent calls bulk_replace, **Then** all structural matches replaced
2. **Given** dry_run: true, **When** agent calls bulk_replace, **Then** preview of all changes without applying
3. **Given** exclude_patterns, **When** agent calls bulk_replace, **Then** excluded paths are skipped

---

### User Story 8 - Agent Moves File with Import Updates (Priority: P3)

As an agent, I can move a file to a new location and have all import statements across the codebase update automatically.

**Why this priority**: File moves without import updates break builds.

**Independent Test**: Move a file, verify all importing files are updated.

**Acceptance Scenarios**:

1. **Given** file with imports, **When** agent calls move_file, **Then** file moved and imports updated via LSP
2. **Given** LSP unavailable, **When** agent calls move_file with update_imports: true, **Then** fallback to AST-based import update
3. **Given** preview mode, **When** agent calls move_file, **Then** list of affected files returned

---

## Requirements _(mandatory)_

### Functional Requirements

#### Terminal Tools

- **FR-001**: `start_process` MUST return immediately with process_id, not block on completion
- **FR-002**: `start_process` MUST support `ready_pattern` for detecting server ready state
- **FR-003**: `get_process_output` MUST support incremental output (only new lines since last read)
- **FR-004**: `get_process_output` MUST truncate large output with head/tail preservation (20% head, 80% tail)
- **FR-005**: `stop_process` MUST support graceful shutdown with timeout and force escalation
- **FR-006**: `run_command` MUST fall back to subprocess when shell integration unavailable (success with warning, not failure)
- **FR-007**: `run_command` MUST capture partial output on timeout
- **FR-008**: All terminal tools MUST clean ANSI escape codes from output
- **FR-009**: `send_input` MUST support sending text and special keys (ctrl+c, ctrl+d) to running processes
- **FR-010**: ProcessManager MUST clean up all processes on extension deactivation

#### File Editing Tools

- **FR-011**: `smart_replace` MUST try exact match first, then whitespace-normalized, then fuzzy match
- **FR-012**: `smart_replace` MUST use Levenshtein distance with configurable threshold (default 0.85)
- **FR-013**: `smart_replace` MUST support `start_line_hint` for middle-out fuzzy search
- **FR-014**: `smart_replace` MUST support `occurrence` parameter for multiple matches
- **FR-015**: `edit_lines` MUST allow direct line-range editing without text matching
- **FR-016**: `edit_lines` MUST support `preserve_indentation` to auto-match surrounding code
- **FR-017**: `insert_at_line` MUST insert content before specified line with auto-indent option
- **FR-018**: `validate_edit` MUST run syntax validation before applying (linter for Python, TypeScript compiler, etc.)
- **FR-019**: `validate_edit` MUST return actionable error messages with line numbers and fix suggestions
- **FR-020**: All edit tools MUST support `dry_run` mode for previewing changes

#### Refactoring Tools

- **FR-021**: `rename_symbol` MUST use VS Code LSP rename provider for semantic understanding
- **FR-022**: `rename_symbol` MUST support preview mode returning all affected files
- **FR-023**: `bulk_replace` MUST use ast-grep for AST-aware pattern matching
- **FR-024**: `bulk_replace` MUST support metavariables ($VAR, $ARGS, $$$BODY)
- **FR-025**: `bulk_replace` MUST support exclusion patterns (node_modules, dist, etc.)
- **FR-026**: `move_file` MUST use LSP willRenameFiles for import updates when available
- **FR-027**: `move_file` MUST fall back to AST-based import update when LSP unavailable
- **FR-028**: `find_references` MUST return all usages of a symbol with file:line locations

### Key Entities

#### Terminal Entities

```typescript
type ProcessStatus =
  | "starting" // Process spawned, waiting for ready signal
  | "running" // Process running normally
  | "ready" // Process signaled ready (for servers)
  | "completed" // Process exited with code 0
  | "failed" // Process exited with non-zero code
  | "killed" // Process was terminated by agent
  | "timeout"; // Process was killed due to timeout

interface ProcessInfo {
  id: string;
  name: string;
  command: string;
  status: ProcessStatus;
  pid: number;
  startedAt: string; // ISO timestamp
  port?: number; // Detected port for servers
  exitCode?: number;
}
```

#### File Editing Entities

```typescript
type MatchType = "exact" | "whitespace_normalized" | "fuzzy" | "not_found";

interface SmartReplaceResult {
  success: boolean;
  matchType: MatchType;
  matchLine?: number;
  similarityScore?: number;
  diffPreview?: string;
  suggestion?: string;
}
```

### Non-Functional Requirements

- **NFR-001**: Process output buffer MUST NOT exceed 10MB per process (truncate oldest)
- **NFR-002**: Fuzzy match MUST complete within 100ms for files under 10,000 lines
- **NFR-003**: All tools MUST respect CancellationToken for interruptibility
- **NFR-004**: Terminal tools MUST work on Windows (PowerShell), macOS (zsh), Linux (bash)

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: `start_process` returns in <100ms for any command (does not block)
- **SC-002**: `run_command` fallback mode works when shell integration unavailable (100% of cases)
- **SC-003**: `smart_replace` finds matches that would fail with exact-match-only in >80% of fuzzy cases
- **SC-004**: `validate_edit` catches syntax errors before apply in 100% of cases
- **SC-005**: `rename_symbol` updates all references correctly (verified by TypeScript compilation after rename)
- **SC-006**: Zero zombie processes after agent session ends (ProcessManager cleanup)
- **SC-007**: >80% test coverage for new tool implementations
- **SC-008**: Agent can complete "start dev server, make edit, verify in browser" workflow without manual intervention

---

## Assumptions

- VS Code version 1.93+ available (for TerminalShellIntegration API)
- Language servers installed for languages requiring semantic operations (TypeScript, Python, etc.)
- ast-grep CLI installed for bulk pattern operations (optional - graceful degradation)
- Node.js child_process available for subprocess fallback

---

## Security

- **SEC-001**: All file tools MUST validate paths remain within workspace (path traversal protection)
- **SEC-002**: ProcessManager MUST not allow arbitrary command execution outside workspace context
- **SEC-003**: Subprocess fallback MUST inherit restricted environment from VS Code

---

## Dependencies

- VS Code API: Terminal.shellIntegration, workspace.applyEdit, commands.executeCommand
- Node.js: child_process.spawn, EventEmitter
- Optional: ast-grep CLI (for bulk_replace)
- Existing: ToolResult, ToolError types from 009-tools-rework

---

## Out of Scope (Deferred)

- Full PTY support for truly interactive commands (vim, htop)
- Docker container execution backend
- Remote SSH terminal execution
- Cross-repository refactoring
- Custom language server integration

---

## Tool Inventory

### Terminal Tools (6)

| Tool                 | Priority | Description                                     |
| -------------------- | -------- | ----------------------------------------------- |
| `run_command`        | P1       | Enhanced single command execution with fallback |
| `start_process`      | P1       | Start long-running process, return immediately  |
| `get_process_output` | P1       | Retrieve incremental output from process        |
| `stop_process`       | P1       | Gracefully terminate a process                  |
| `list_processes`     | P2       | List all managed processes                      |
| `send_input`         | P2       | Send stdin/special keys to running process      |

### File Editing Tools (5)

| Tool             | Priority | Description                             |
| ---------------- | -------- | --------------------------------------- |
| `smart_replace`  | P1       | Fuzzy string replace with line hints    |
| `edit_lines`     | P1       | Line-number based editing               |
| `insert_at_line` | P2       | Insert content at line with auto-indent |
| `validate_edit`  | P2       | Pre-flight syntax validation            |
| `delete_lines`   | P2       | Delete line range safely                |

### Refactoring Tools (4)

| Tool              | Priority | Description                   |
| ----------------- | -------- | ----------------------------- |
| `rename_symbol`   | P2       | LSP-based semantic rename     |
| `find_references` | P2       | Find all symbol usages        |
| `bulk_replace`    | P3       | AST-aware pattern replacement |
| `move_file`       | P3       | Move file with import updates |

---

## Clarifications

### Session 2026-01-30

- Q: Should run_command fail when shell integration unavailable? → A: No, fall back to subprocess with warning in result (not error)
- Q: What process cleanup strategy? → A: ProcessManager singleton with cleanup on extension deactivation and SIGTERM handlers
- Q: How to handle large output? → A: Truncate with head/tail preservation (20% head, 80% tail), configurable max lines
- Q: ast-grep required? → A: Optional dependency - bulk_replace returns helpful error if not installed
- Q: Fuzzy match threshold default? → A: 0.85 (85% similarity) based on RooCode/Aider research
