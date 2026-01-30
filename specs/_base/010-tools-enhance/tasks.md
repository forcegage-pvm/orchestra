# Tasks: Enhanced Agent Tools (010-tool-enhance)

**Spec Reference**: [spec.md](spec.md)  
**Research Summary**: [research.md](research.md)

---

## Phase 1: Foundation Infrastructure

### Task 1.1: ProcessManager Core

**Priority**: P1  
**Estimate**: 4 hours  
**Dependencies**: None

Create the ProcessManager singleton that handles background process lifecycle.

**Files to Create/Modify**:

- `extension/src/agents/tools/infrastructure/ProcessManager.ts` (new)
- `extension/src/agents/tools/infrastructure/index.ts` (new)

**Acceptance Criteria**:

- [ ] ProcessManager is a singleton with workspace-scoped instances
- [ ] Tracks process state: STARTING, RUNNING, READY, STOPPED, FAILED
- [ ] Auto-generates unique process IDs
- [ ] Maintains output buffers per process
- [ ] Emits events: `output`, `ready`, `exit`
- [ ] Cleanup on extension deactivation

**Test File**: `extension/test/agents/tools/infrastructure/ProcessManager.test.ts`

---

### Task 1.2: Output Buffer & Truncation

**Priority**: P1  
**Estimate**: 2 hours  
**Dependencies**: Task 1.1

Implement ring buffer for output with configurable size and smart truncation.

**Files to Create/Modify**:

- `extension/src/agents/tools/infrastructure/OutputBuffer.ts` (new)

**Acceptance Criteria**:

- [ ] Ring buffer with configurable max lines (default: 500)
- [ ] Head/tail truncation (20% head, 80% tail)
- [ ] ANSI escape code cleanup
- [ ] Progress bar deduplication (collapse repeated patterns)
- [ ] `getSince(lastReadLine)` for incremental reads

**Test File**: `extension/test/agents/tools/infrastructure/OutputBuffer.test.ts`

---

### Task 1.3: FuzzyMatcher Module

**Priority**: P1  
**Estimate**: 3 hours  
**Dependencies**: None

Create fuzzy matching engine for file editing tools.

**Files to Create/Modify**:

- `extension/src/agents/tools/infrastructure/FuzzyMatcher.ts` (new)

**Acceptance Criteria**:

- [ ] Levenshtein distance calculation
- [ ] Similarity ratio computation
- [ ] Match cascade: exact → whitespace-normalized → fuzzy
- [ ] Middle-out search from line hint
- [ ] Configurable threshold (default: 0.85)
- [ ] Returns MatchResult with type, location, confidence

**Test File**: `extension/test/agents/tools/infrastructure/FuzzyMatcher.test.ts`

---

## Phase 2: Terminal Tools

### Task 2.1: run_command Tool

**Priority**: P1  
**Estimate**: 3 hours  
**Dependencies**: Task 1.1, Task 1.2

Enhanced command execution with shell integration fallback.

**Files to Create/Modify**:

- `extension/src/agents/tools/system/runCommand.ts` (new, replaces runTerminal.ts)
- `extension/src/agents/tools/system/index.ts` (update)

**Acceptance Criteria**:

- [ ] Executes command and waits for completion
- [ ] Default timeout: 30 seconds (configurable)
- [ ] Shell integration with graceful fallback
- [ ] Returns exit_code, stdout, stderr, duration_ms
- [ ] Warning (not error) when shell integration unavailable
- [ ] Truncates output if exceeds limit

**Test File**: `extension/test/agents/tools/system/runCommand.test.ts`

---

### Task 2.2: start_process / stop_process Tools

**Priority**: P1  
**Estimate**: 4 hours  
**Dependencies**: Task 2.1

Background process management for dev servers, watchers, etc.

**Files to Create/Modify**:

- `extension/src/agents/tools/system/startProcess.ts` (new)
- `extension/src/agents/tools/system/stopProcess.ts` (new)

**Acceptance Criteria**:

- [ ] `start_process` returns immediately with process_id
- [ ] Optional `ready_pattern` to detect when service is ready
- [ ] Optional `ready_timeout_ms` (default: 30000)
- [ ] Returns initial_output (first lines before return)
- [ ] `stop_process` sends SIGTERM, escalates to SIGKILL after timeout
- [ ] Process cleanup removes from ProcessManager

**Test File**: `extension/test/agents/tools/system/startProcess.test.ts`

---

### Task 2.3: get_process_output / list_processes Tools

**Priority**: P1  
**Estimate**: 2 hours  
**Dependencies**: Task 2.2

Process monitoring and inventory.

**Files to Create/Modify**:

- `extension/src/agents/tools/system/getProcessOutput.ts` (new)
- `extension/src/agents/tools/system/listProcesses.ts` (new)

**Acceptance Criteria**:

- [ ] `get_process_output` retrieves buffered output
- [ ] Option: `since_last_read` for incremental reads
- [ ] Option: `max_lines` for truncation
- [ ] `list_processes` returns all tracked processes with status
- [ ] Include: process_id, command, status, started_at, pid

**Test File**: `extension/test/agents/tools/system/getProcessOutput.test.ts`

---

### Task 2.4: send_input Tool

**Priority**: P2  
**Estimate**: 2 hours  
**Dependencies**: Task 2.2

Send stdin to running processes.

**Files to Create/Modify**:

- `extension/src/agents/tools/system/sendInput.ts` (new)

**Acceptance Criteria**:

- [ ] Sends text to process stdin
- [ ] Option: `press_enter` (default: true)
- [ ] Special key support: `\x03` (Ctrl+C), `\t` (Tab)
- [ ] Validates process is RUNNING before sending

**Test File**: `extension/test/agents/tools/system/sendInput.test.ts`

---

### Task 2.5: wait_for_pattern Tool

**Priority**: P3  
**Estimate**: 2 hours  
**Dependencies**: Task 2.2

Wait for specific pattern in process output.

**Files to Create/Modify**:

- `extension/src/agents/tools/system/waitForPattern.ts` (new)

**Acceptance Criteria**:

- [ ] Waits for regex pattern match in process output
- [ ] Checks existing buffer first, then listens for new output
- [ ] Configurable timeout (default: 30000ms)
- [ ] Returns matched_line and wait_time_ms
- [ ] Returns timed_out: true if timeout exceeded

**Test File**: `extension/test/agents/tools/system/waitForPattern.test.ts`

---

### Task 2.6: find_port_process Tool

**Priority**: P3  
**Estimate**: 2 hours  
**Dependencies**: Task 2.3

Find what process is using a specific port.

**Files to Create/Modify**:

- `extension/src/agents/tools/system/findPortProcess.ts` (new)

**Acceptance Criteria**:

- [ ] Checks managed processes first (by detected port)
- [ ] Falls back to system check (lsof on Linux/Mac, netstat on Windows)
- [ ] Returns in_use, process_id (if managed), pid, command
- [ ] Cross-platform support

**Test File**: `extension/test/agents/tools/system/findPortProcess.test.ts`

---

### Task 2.7: execute_with_retry Tool

**Priority**: P3  
**Estimate**: 2 hours  
**Dependencies**: Task 2.1

Run command with automatic retry on failure.

**Files to Create/Modify**:

- `extension/src/agents/tools/system/executeWithRetry.ts` (new)

**Acceptance Criteria**:

- [ ] Configurable max_retries (default: 3)
- [ ] Configurable retry_delay_ms (default: 1000)
- [ ] Configurable success_exit_codes (default: [0])
- [ ] Optional success_pattern regex for output validation
- [ ] Returns attempt count, final result, total duration

**Test File**: `extension/test/agents/tools/system/executeWithRetry.test.ts`

---

## Phase 3: File Editing Tools

### Task 3.1: smart_replace Tool

**Priority**: P1  
**Estimate**: 4 hours  
**Dependencies**: Task 1.3

Fuzzy-matched string replacement.

**Files to Create/Modify**:

- `extension/src/agents/tools/coding/smartReplace.ts` (new)

**Acceptance Criteria**:

- [ ] Uses FuzzyMatcher for search
- [ ] `start_line_hint` for guided search
- [ ] `occurrence` selector (1st, 2nd, etc.)
- [ ] `dry_run` mode returns preview without changes
- [ ] Returns match_type (exact, normalized, fuzzy), confidence, lines_changed
- [ ] Preserves original indentation

**Test File**: `extension/test/agents/tools/coding/smartReplace.test.ts`

---

### Task 3.2: edit_lines Tool

**Priority**: P1  
**Estimate**: 2 hours  
**Dependencies**: None

Direct line-range editing without uniqueness constraint.

**Files to Create/Modify**:

- `extension/src/agents/tools/coding/editLines.ts` (new)

**Acceptance Criteria**:

- [ ] Replace lines `start` to `end` with new content
- [ ] Validates line numbers within file bounds
- [ ] Creates file if not exists (with warning)
- [ ] Handles edge cases: empty file, single line, end of file

**Test File**: `extension/test/agents/tools/coding/editLines.test.ts`

---

### Task 3.3: insert_at_line / delete_section Tools

**Priority**: P2  
**Estimate**: 2 hours  
**Dependencies**: Task 3.2

Additional line operations.

**Files to Create/Modify**:

- `extension/src/agents/tools/coding/insertAtLine.ts` (new)
- `extension/src/agents/tools/coding/deleteSection.ts` (new)

**Acceptance Criteria**:

- [ ] `insert_at_line`: Insert before specified line
- [ ] Auto-indentation based on surrounding context
- [ ] `delete_section`: Remove line range or pattern-matched section
- [ ] Returns lines_affected count
- [ ] Returns deleted_content for potential undo

**Test File**: `extension/test/agents/tools/coding/lineOperations.test.ts`

---

### Task 3.4: validate_edit Tool

**Priority**: P2  
**Estimate**: 2 hours  
**Dependencies**: Task 3.1

Pre-flight validation before applying edits.

**Files to Create/Modify**:

- `extension/src/agents/tools/coding/validateEdit.ts` (new)

**Acceptance Criteria**:

- [ ] Applies edit to temp file
- [ ] Runs language diagnostics (via VS Code API)
- [ ] Returns syntax_valid, errors[], warnings[]
- [ ] Does NOT modify original file
- [ ] Timeout for diagnostic collection: 3 seconds

**Test File**: `extension/test/agents/tools/coding/validateEdit.test.ts`

---

### Task 3.5: bulk_replace Tool (Text-Based)

**Priority**: P2  
**Estimate**: 3 hours  
**Dependencies**: None

Multi-file text/regex replacement.

**Files to Create/Modify**:

- `extension/src/agents/tools/coding/bulkReplace.ts` (new)

**Acceptance Criteria**:

- [ ] Supports literal text and regex patterns
- [ ] Supports capture group replacement ($1, $2, etc.)
- [ ] File glob patterns for include/exclude
- [ ] preview_only mode returns changes without applying
- [ ] whole_word option for complete word matches
- [ ] case_sensitive option (default: true)
- [ ] max_replacements limit
- [ ] Returns files_scanned, files_modified, total_replacements

**Test File**: `extension/test/agents/tools/coding/bulkReplace.test.ts`

---

## Phase 4: File Operations

### Task 4.1: move_file Tool (Basic)

**Priority**: P3  
**Estimate**: 2 hours  
**Dependencies**: None

Move file to new location (no import updates).

**Files to Create/Modify**:

- `extension/src/agents/tools/filesystem/moveFile.ts` (new)

**Acceptance Criteria**:

- [ ] Moves file to new destination
- [ ] Creates parent directories if needed
- [ ] Fails with error if destination exists (unless overwrite: true)
- [ ] Returns old_path, new_path confirmation
- [ ] Validates source exists before moving

**Test File**: `extension/test/agents/tools/filesystem/moveFile.test.ts`

---

### Task 4.2: copy_file Tool

**Priority**: P3  
**Estimate**: 2 hours  
**Dependencies**: Task 4.1

Copy file to new location.

**Files to Create/Modify**:

- `extension/src/agents/tools/filesystem/copyFile.ts` (new)

**Acceptance Criteria**:

- [ ] Copies file preserving content
- [ ] Creates parent directories if needed
- [ ] Fails with error if destination exists (unless overwrite: true)
- [ ] Returns source_path, destination_path confirmation

**Test File**: `extension/test/agents/tools/filesystem/copyFile.test.ts`

---

### Task 4.3: move_directory Tool

**Priority**: P3  
**Estimate**: 2 hours  
**Dependencies**: Task 4.1

Recursively move directory tree.

**Files to Create/Modify**:

- `extension/src/agents/tools/filesystem/moveDirectory.ts` (new)

**Acceptance Criteria**:

- [ ] Recursively moves entire directory tree
- [ ] Preserves directory structure
- [ ] Fails with error if destination exists (unless overwrite: true)
- [ ] Returns files_moved count
- [ ] Validates source is a directory

**Test File**: `extension/test/agents/tools/filesystem/moveDirectory.test.ts`

---

## Phase 5: Tool Registration & Documentation

### Task 5.1: Agent Tool Registry Update

**Priority**: P1  
**Estimate**: 2 hours  
**Dependencies**: Phase 2-4 tools

Register all new tools for agent consumption.

**Files to Create/Modify**:

- `extension/src/agents/tools/registry.ts` (update or create)
- `extension/src/agents/AgentRunner.ts` (update tool loading)

**Acceptance Criteria**:

- [ ] All P1 tools registered
- [ ] Tool descriptions follow consistent format
- [ ] Parameter schemas complete with descriptions
- [ ] Role filtering maintained (if applicable)

---

### Task 5.2: Deprecate Old Tools

**Priority**: P2  
**Estimate**: 1 hour  
**Dependencies**: Task 5.1

Mark replaced tools as deprecated with migration path.

**Files to Create/Modify**:

- `extension/src/agents/tools/system/runTerminal.ts` (add deprecation)
- `extension/src/agents/tools/system/getTerminalOutput.ts` (add deprecation)

**Acceptance Criteria**:

- [ ] Deprecated tools log warning on first use
- [ ] Deprecation message includes replacement tool name:
  - `runTerminal` → `run_command`
  - `getTerminalOutput` → `get_process_output`
- [ ] Keep functional for backward compatibility (1 sprint)

---

### Task 5.3: Tool Documentation

**Priority**: P2  
**Estimate**: 2 hours  
**Dependencies**: All tools complete

Update agent prompt documentation with new tool descriptions.

**Files to Create/Modify**:

- `extension/agents/tools.md` (new or update)
- Agent prompt files (update tool sections)

**Acceptance Criteria**:

- [ ] Each tool documented with: purpose, parameters, examples
- [ ] Common patterns documented (e.g., background server workflow)
- [ ] Error handling guidance

---

## Dependency Graph

```
Phase 1 (Foundation)
├── Task 1.1 (ProcessManager)
│   └── Task 1.2 (OutputBuffer)
│       └── Task 2.1 (run_command)
│           ├── Task 2.2 (start/stop_process)
│           │   ├── Task 2.3 (get_output/list)
│           │   ├── Task 2.4 (send_input)
│           │   ├── Task 2.5 (wait_for_pattern)
│           │   └── Task 2.6 (find_port_process)
│           └── Task 2.7 (execute_with_retry)
│
└── Task 1.3 (FuzzyMatcher)
    └── Task 3.1 (smart_replace)
        └── Task 3.4 (validate_edit)

Phase 3 (File Editing - Independent)
├── Task 3.2 (edit_lines)
│   └── Task 3.3 (insert/delete_section)
└── Task 3.5 (bulk_replace) - Independent

Phase 4 (File Operations - Independent)
├── Task 4.1 (move_file)
│   ├── Task 4.2 (copy_file)
│   └── Task 4.3 (move_directory)

Phase 5 (Registration)
└── Task 5.1 (Registry) → depends on Phase 2-4
    ├── Task 5.2 (Deprecation)
    └── Task 5.3 (Documentation)
```

---

## Summary

| Phase              | Tasks  | Estimate      | Priority |
| ------------------ | ------ | ------------- | -------- |
| 1. Foundation      | 3      | 9 hours       | P1       |
| 2. Terminal        | 7      | 15 hours      | P1/P2/P3 |
| 3. File Editing    | 5      | 13 hours      | P1/P2    |
| 4. File Operations | 3      | 6 hours       | P3       |
| 5. Registration    | 3      | 5 hours       | P1/P2    |
| **Total**          | **21** | **~48 hours** |          |

**Critical Path**: Tasks 1.1 → 1.2 → 2.1 → 2.2 → 5.1

**Parallel Opportunities**:

- Task 1.3 (FuzzyMatcher) can be done parallel with Task 1.1
- Task 3.2 (edit_lines) can be done parallel with terminal tools
- Task 3.5 (bulk_replace) is independent
- Phase 4 (File Operations) can be done parallel with Phase 3
