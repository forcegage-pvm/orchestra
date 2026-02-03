# Feature Specification: Enhanced Agent Tools

**Feature Branch**: `010-tool-enhance`  
**Created**: 2026-01-30  
**Status**: Draft  
**Input**: Research from `docs/research/tools/002/` - terminal tools analysis, file manipulation analysis, bulk refactoring research

## Executive Summary

This specification defines enhanced tools for AI coding agents to address the core failure modes identified in production tools (Claude Code, Cursor, Aider, RooCode, SWE-agent). The focus is on three categories:

1. **Terminal Tools (9)** - Background process management, output capture, long-running process supervision
2. **File Editing Tools (6)** - Fuzzy matching, line-based editing, validation before apply, text-based bulk replace
3. **File Operations (3)** - Basic file move/copy/directory operations without import updates

**Scope Note:** LSP-dependent refactoring tools (semantic rename, find references) and ast-grep dependent tools (AST bulk replace) are explicitly out of scope for this sprint. See [Out of Scope](#out-of-scope-deferred) section.

**Total In-Scope Tools:** 18

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

### User Story 6 - Agent Moves and Copies Files (Priority: P3)

As an agent, I can move or copy files and directories using simple file system operations.

**Why this priority**: Basic file operations are needed for restructuring code, but import updates are deferred.

**Independent Test**: Move a file from `src/old.ts` to `src/new/location.ts`, verify file exists at new location.

**Acceptance Scenarios**:

1. **Given** source file exists, **When** agent calls move_file, **Then** file is moved to destination
2. **Given** source file exists, **When** agent calls copy_file, **Then** file is copied to destination (original remains)
3. **Given** source directory exists, **When** agent calls move_directory, **Then** entire directory tree is moved
4. **Given** destination already exists, **When** agent calls move_file without overwrite flag, **Then** error is returned
5. **Given** destination parent doesn't exist, **When** agent calls move_file, **Then** parent directories are created

---

### User Story 7 - Agent Performs Bulk Text Replacement (Priority: P2)

As an agent, I can replace text patterns across multiple files using regex or literal matching.

**Why this priority**: API migrations and consistent refactoring are common tasks that benefit from multi-file operations.

**Independent Test**: Replace `oldFunction(` with `newFunction(` across all `.ts` files in `src/`.

**Acceptance Scenarios**:

1. **Given** literal text pattern, **When** agent calls bulk_replace, **Then** all occurrences replaced across matching files
2. **Given** regex pattern with capture groups, **When** agent calls bulk_replace, **Then** replacements use captured groups ($1, $2)
3. **Given** preview_only: true, **When** agent calls bulk_replace, **Then** changes are listed without applying
4. **Given** file glob pattern, **When** agent calls bulk_replace, **Then** only matching files are processed
5. **Given** whole_word: true, **When** agent calls bulk_replace, **Then** only complete word matches are replaced

---

### User Story 8 - Agent Waits for Process Output Pattern (Priority: P3)

As an agent, I can wait for specific output from a background process before continuing.

**Why this priority**: Synchronizing on server startup or build completion is a common workflow.

**Independent Test**: Start a dev server, wait for "ready" pattern, then continue with next task.

**Acceptance Scenarios**:

1. **Given** running process, **When** agent calls wait_for_pattern with regex, **Then** tool blocks until pattern matches or timeout
2. **Given** pattern already in output buffer, **When** agent calls wait_for_pattern, **Then** tool returns immediately with match
3. **Given** timeout exceeded, **When** pattern not found, **Then** tool returns with timed_out: true

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

#### File Operations

- **FR-021**: `move_file` MUST move file to new location without import updates
- **FR-022**: `move_file` MUST create parent directories if they don't exist
- **FR-023**: `copy_file` MUST copy file preserving content and creating parent directories
- **FR-024**: `move_directory` MUST recursively move entire directory tree
- **FR-025**: All file operations MUST fail with error if destination exists and overwrite not specified
- **FR-026**: `bulk_replace` MUST support literal text and regex patterns (no AST)
- **FR-027**: `bulk_replace` MUST support capture group replacement ($1, $2, etc.)
- **FR-028**: `bulk_replace` MUST support file glob patterns for targeting

### Design Decisions

- **DD-001**: `validate_edit` is a standalone tool only. Edit tools (smart_replace, edit_lines) do NOT have built-in validation - agents must explicitly call validate_edit if desired.

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
- **SC-005**: `bulk_replace` correctly handles regex capture groups in replacement
- **SC-006**: Zero zombie processes after agent session ends (ProcessManager cleanup)
- **SC-007**: >80% test coverage for new tool implementations
- **SC-008**: Agent can complete "start dev server, make edit, verify in browser" workflow without manual intervention
- **SC-009**: `move_file`, `copy_file`, `move_directory` complete file system operations correctly

---

## Assumptions

- VS Code version 1.93+ available (for TerminalShellIntegration API)
- Node.js child_process available for subprocess fallback
- File system access via VS Code workspace API

---

## Security

- **SEC-001**: All file tools MUST validate paths remain within workspace (path traversal protection)
- **SEC-002**: ProcessManager MUST not allow arbitrary command execution outside workspace context
- **SEC-003**: Subprocess fallback MUST inherit restricted environment from VS Code

---

## Dependencies

- VS Code API: Terminal.shellIntegration, workspace.applyEdit, workspace.fs
- Node.js: child_process.spawn, EventEmitter, fs/promises
- Existing: ToolResult, ToolError types from 009-tools-rework

---

## Out of Scope (Deferred)

### Deferred to Future Sprint - LSP-Dependent Tools

These tools require Language Server Protocol integration and are deferred until LSP infrastructure is established:

| Tool                       | Rationale for Deferral                                                |
| -------------------------- | --------------------------------------------------------------------- |
| `rename_symbol`            | Requires LSP rename provider (vscode.executeDocumentRenameProvider)   |
| `find_references`          | Requires LSP reference provider (vscode.executeReferenceProvider)     |
| `go_to_definition`         | Requires LSP definition provider                                      |
| `extract_method`           | Requires LSP code actions                                             |
| `extract_variable`         | Requires LSP code actions                                             |
| `move_file` (with imports) | Full version requires LSP willRenameFiles for import updates          |
| `find_importers`           | Can be approximated with grepSearch; full version pairs with LSP move |

### Deferred to Future Sprint - AST-Dependent Tools

These tools require ast-grep CLI dependency and are deferred:

| Tool                   | Rationale for Deferral                                |
| ---------------------- | ----------------------------------------------------- |
| `bulk_replace` (AST)   | Requires ast-grep CLI for structural pattern matching |
| `search_pattern` (AST) | Requires ast-grep CLI for AST pattern discovery       |

### Not Planned

- Full PTY support for truly interactive commands (vim, htop)
- Docker container execution backend
- Remote SSH terminal execution
- Cross-repository refactoring
- Custom language server integration

---

## Tool Inventory (18 Tools)

### Terminal Tools (9)

| Tool                 | Priority | Description                                     |
| -------------------- | -------- | ----------------------------------------------- |
| `run_command`        | P1       | Enhanced single command execution with fallback |
| `start_process`      | P1       | Start long-running process, return immediately  |
| `get_process_output` | P1       | Retrieve incremental output from process        |
| `stop_process`       | P1       | Gracefully terminate a process                  |
| `list_processes`     | P2       | List all managed processes                      |
| `send_input`         | P2       | Send stdin/special keys to running process      |
| `wait_for_pattern`   | P3       | Wait for specific pattern in process output     |
| `find_port_process`  | P3       | Find process using a specific port              |
| `execute_with_retry` | P3       | Run command with automatic retry on failure     |

### File Editing Tools (6)

| Tool             | Priority | Description                                |
| ---------------- | -------- | ------------------------------------------ |
| `smart_replace`  | P1       | Fuzzy string replace with line hints       |
| `edit_lines`     | P1       | Line-number based editing                  |
| `insert_at_line` | P2       | Insert content at line with auto-indent    |
| `delete_section` | P2       | Delete line range or pattern-based section |
| `validate_edit`  | P2       | Pre-flight syntax validation (standalone)  |
| `bulk_replace`   | P2       | Text/regex multi-file replacement          |

### File Operations (3)

| Tool             | Priority | Description                     |
| ---------------- | -------- | ------------------------------- |
| `move_file`      | P3       | Move file (no import updates)   |
| `copy_file`      | P3       | Copy file to new location       |
| `move_directory` | P3       | Recursively move directory tree |

---

## Clarifications

### Session 2026-01-30

- Q: Should run_command fail when shell integration unavailable? → A: No, fall back to subprocess with warning in result (not error)
- Q: What process cleanup strategy? → A: ProcessManager singleton with cleanup on extension deactivation and SIGTERM handlers
- Q: How to handle large output? → A: Truncate with head/tail preservation (20% head, 80% tail), configurable max lines
- Q: Fuzzy match threshold default? → A: 0.85 (85% similarity) based on RooCode/Aider research
- Q: LSP tools (rename_symbol, find_references, etc.)? → A: **OUT OF SCOPE** - deferred until LSP infrastructure is established
- Q: ast-grep dependent tools? → A: **OUT OF SCOPE** - deferred to future sprint
- Q: move_file with import updates? → A: **OUT OF SCOPE** - basic move_file (no imports) in scope
- Q: find_importers tool? → A: **OUT OF SCOPE** - can use grepSearch for now
- Q: bulk_replace implementation? → A: Text/regex based only (no AST), supports capture groups
- Q: validate_edit integration with edit tools? → A: **Standalone only** (DD-001) - no built-in validation in edit tools
- Q: Basic file operations? → A: **IN SCOPE** - move_file (basic), copy_file, move_directory
