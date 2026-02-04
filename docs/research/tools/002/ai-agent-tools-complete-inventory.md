# AI Coding Agent Tools: Complete Inventory

## Overview

This document catalogs **21 custom tools** researched across three categories to improve AI coding agent reliability. Each tool addresses specific failure patterns observed in production systems including Cursor, Claude Code, Aider, RooCode, SWE-agent, OpenHands, Gemini CLI, Cline, and GitHub Copilot.

**Research Sources:**
- file-manipulation-analysis.md - File editing problems & solutions
- bulk-refactoring-tool-research.md - LSP and AST-based refactoring
- terminal-tools-analysis.md - Terminal/console command execution
- refactoring-tools-implementation.ts - TypeScript implementation
- terminal-tools-implementation.ts - TypeScript implementation

---

## Table of Contents

1. [File Manipulation Tools](#1-file-manipulation-tools-7-tools)
2. [Refactoring Tools](#2-refactoring-tools-5-tools)
3. [Terminal/Process Tools](#3-terminalprocess-tools-9-tools)
4. [Implementation Priority](#4-implementation-priority)
5. [Problems Solved Matrix](#5-problems-solved-matrix)
6. [References](#6-references)

---

## 1. File Manipulation Tools (7 Tools)

These tools address the most common file editing failures in AI coding agents.

### 1.1 `smart_replace` ⭐ CRITICAL

**Purpose:** Fuzzy string replacement with line hints and disambiguation

**Problems Solved:**
- Search string not found (whitespace mismatches, indentation errors)
- Multiple occurrences found (ambiguous matches)
- Line number drift across edits

**Interface:**
```typescript
interface SmartReplaceParams {
  file_path: string;           // Path to file
  old_text: string;            // Text to find
  new_text: string;            // Replacement text
  start_line_hint?: number;    // Approximate location (1-indexed)
  occurrence?: number;         // Which match (1st, 2nd, etc.) if multiple
  fuzzy_threshold?: number;    // Similarity threshold (default: 0.85)
  dry_run?: boolean;           // Preview without applying
}

interface SmartReplaceResult {
  success: boolean;
  match_found: boolean;
  match_line: number;
  similarity_score: number;    // 0.0-1.0
  diff_preview: string;
  error?: string;
}
```

**Implementation Strategy:**
1. Read file content
2. Try exact string match
3. If multiple matches: use `start_line_hint` or `occurrence` to disambiguate
4. If no exact match: normalize whitespace (tabs→spaces, trim trailing) and retry
5. If still no match: use Levenshtein distance with middle-out search from hint
6. Return detailed result with match location, similarity score, diff preview

**Key Features:**
- Levenshtein distance fuzzy matching
- Whitespace normalization (tabs vs spaces, line endings)
- Middle-out search from line hint (RooCode pattern)
- Occurrence selector for duplicate patterns
- Dry-run preview mode

**Complexity:** Medium | **Impact:** 🔥 High

**Source:** RooCode's apply_diff, Aider's layered fallback matching

---

### 1.2 `edit_lines` ⭐ CRITICAL

**Purpose:** Direct line-number based editing, bypassing string matching

**Problems Solved:**
- Multiple occurrences (bypasses uniqueness constraint entirely)
- Line number drift (direct addressing)
- Ambiguous matches in test files/boilerplate

**Interface:**
```typescript
interface EditLinesParams {
  file_path: string;
  start_line: number;           // 1-indexed
  end_line: number;             // Inclusive, -1 for "to end of file"
  new_content: string;          // Replacement (empty string = delete)
  preserve_indentation?: boolean; // Auto-match surrounding indent
  validate_syntax?: boolean;    // Run linter before applying
}

interface EditLinesResult {
  success: boolean;
  lines_affected: number;
  new_line_count: number;
  syntax_valid?: boolean;
  diff_preview: string;
}
```

**Implementation Strategy:**
1. Read file as line array
2. Validate line range exists
3. If `preserve_indentation`: analyze indent of surrounding lines, apply to new_content
4. If `validate_syntax`: create temp file, run language-appropriate linter
5. Splice new content into line array
6. Write file

**Key Features:**
- Bypasses string matching entirely
- Perfect for "delete lines 45-67" or "replace function at line 100"
- Pairs with `view` tool that shows line numbers
- Optional syntax validation before apply
- Auto-indentation preservation

**Complexity:** Low | **Impact:** 🔥 High

**Source:** OpenHands draft editor pattern, SWE-agent line-based editing

---

### 1.3 `insert_at_line`

**Purpose:** Clean insertion without replacement

**Problems Solved:**
- Adding new code (imports, methods, error handling)
- Avoiding string matching for pure insertions

**Interface:**
```typescript
interface InsertAtLineParams {
  file_path: string;
  line: number;                 // Insert BEFORE this line (1-indexed)
  content: string;              // Text to insert
  auto_indent?: boolean;        // Match indentation of target line
}

interface InsertAtLineResult {
  success: boolean;
  inserted_at_line: number;
  lines_inserted: number;
}
```

**Use Cases:**
- Adding new imports at top of file
- Adding new methods to a class
- Inserting error handling code
- Adding configuration entries

**Complexity:** Low | **Impact:** Medium

---

### 1.4 `delete_section`

**Purpose:** Safe section removal with flexible targeting

**Problems Solved:**
- Clean deletion without replacement text
- Pattern-based boundaries for dynamic content

**Interface:**
```typescript
interface DeleteSectionParams {
  file_path: string;
  // Line-based targeting:
  start_line?: number;
  end_line?: number;
  // OR Pattern-based targeting:
  start_pattern?: string;       // Delete from first line matching this
  end_pattern?: string;         // To first line matching this (inclusive)
  include_patterns?: boolean;   // Delete the boundary lines too (default: true)
}

interface DeleteSectionResult {
  success: boolean;
  lines_deleted: number;
  start_line: number;
  end_line: number;
  deleted_content: string;      // For undo capability
}
```

**Key Features:**
- Dual targeting: line numbers OR regex patterns
- Boundary inclusion control
- Returns deleted content for potential undo
- Safe bounds checking

**Complexity:** Low | **Impact:** Medium

---

### 1.5 `validate_edit` ⭐ CRITICAL

**Purpose:** Pre-flight syntax and lint check before applying edits

**Problems Solved:**
- Infinite retry loops on syntax errors
- Agent retrying same bad edit repeatedly
- Wasted tokens on invalid code generation

**Interface:**
```typescript
interface ValidateEditParams {
  file_path: string;
  new_content: string;          // Full proposed file content
  // OR
  edit_preview?: {              // Specific edit to validate
    start_line: number;
    end_line: number;
    replacement: string;
  };
}

interface ValidateEditResult {
  valid: boolean;
  syntax_errors?: Array<{
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning';
  }>;
  lint_warnings?: Array<{
    line: number;
    rule: string;
    message: string;
  }>;
  diff_preview: string;
  suggestions?: string[];       // Actionable fix suggestions
}
```

**Implementation Strategy:**
1. Create temporary file with proposed content
2. Detect language from file extension
3. Run appropriate linter:
   - TypeScript/JavaScript: `tsc --noEmit` or ESLint
   - Python: `flake8` or `ruff`
   - Rust: `cargo check`
   - Go: `go vet`
4. Parse errors into structured format
5. Generate actionable suggestions (not just "syntax error")
6. Return validation result WITHOUT applying

**Key Feature:** Returns actionable fix suggestions, not just "syntax error"

**Source:** SWE-agent lint-before-apply pattern

**Complexity:** Medium | **Impact:** 🔥 High

---

### 1.6 `bulk_replace`

**Purpose:** Multi-occurrence and multi-file replacement

**Problems Solved:**
- Refactoring patterns (rename variable across file)
- API migrations
- Code style updates

**Interface:**
```typescript
interface BulkReplaceParams {
  file_path: string;            // Single file OR glob pattern ("src/**/*.ts")
  find: string;                 // Text or regex pattern
  replace: string;              // Replacement (supports capture groups: $1, $2)
  is_regex?: boolean;           // Treat find as regex (default: false)
  whole_word?: boolean;         // Only match complete words (default: false)
  case_sensitive?: boolean;     // Case-sensitive match (default: true)
  preview_only?: boolean;       // Preview without applying (default: true)
  max_replacements?: number;    // Limit total replacements
}

interface BulkReplaceResult {
  success: boolean;
  files_scanned: number;
  files_modified: number;
  total_replacements: number;
  changes: Array<{
    file: string;
    replacements: number;
    diff_preview: string;
  }>;
}
```

**Use Cases:**
- Convert `var` → `const` across codebase
- Update import paths after restructure
- Rename internal API methods
- Fix consistent typos

**Complexity:** Low | **Impact:** Medium

---

### 1.7 `semantic_rename` ⭐ CRITICAL (Requires LSP)

**Purpose:** True IDE-style "Rename Symbol" across entire codebase

**Problems Solved:**
- Multi-file coordination failures
- Import/export updates
- Type-aware renaming (distinguishes local vs global)

**Interface:**
```typescript
interface SemanticRenameParams {
  file_path: string;            // File containing the symbol
  line: number;                 // 1-indexed line number
  column: number;               // 1-indexed column position
  new_name: string;             // New symbol name
  preview_only?: boolean;       // Preview without applying (default: true)
}

interface SemanticRenameResult {
  success: boolean;
  original_name: string;
  files_affected: number;
  total_edits: number;
  changes: Array<{
    file: string;
    edits: Array<{
      line: number;
      old_text: string;
      new_text: string;
    }>;
  }>;
}
```

**Requirements:**
- VS Code extension with LSP access
- Language server active for target language

**What It Handles:**
- All usages of the symbol
- Import/export statements
- Inheritance/implementation references
- Type annotations
- JSDoc/documentation (language-dependent)

**Complexity:** High | **Impact:** 🔥 High

**Source:** VS Code `vscode.executeDocumentRenameProvider` API

---

## 2. Refactoring Tools (5 Tools)

Advanced refactoring capabilities using LSP and AST-based approaches.

### 2.1 `renameSymbol` (LSP-Based) ⭐ CRITICAL

**Purpose:** Semantic rename using VS Code's Language Server Protocol

**Interface:**
```typescript
interface RenameSymbolInput {
  filePath: string;             // File containing the symbol
  line: number;                 // 0-indexed line number
  character: number;            // 0-indexed character position
  newName: string;              // New name for the symbol
  preview?: boolean;            // Preview mode (default: true)
}

interface RenameSymbolResult {
  success: boolean;
  output: string;               // Human-readable summary
  preview?: {
    fileCount: number;
    editCount: number;
    changes: Array<{
      filePath: string;
      edits: Array<{
        line: number;
        oldText: string;
        newText: string;
      }>;
    }>;
  };
}
```

**VS Code API Used:**
```typescript
// Validate rename is possible
await vscode.commands.executeCommand('vscode.prepareRename', uri, position);

// Execute rename
await vscode.commands.executeCommand(
  'vscode.executeDocumentRenameProvider',
  uri, position, newName
);
```

**Supported Languages:** TypeScript, JavaScript, Python (Pylance), Rust (rust-analyzer), Java, Go, C#, and any language with LSP rename support

**Complexity:** Medium | **Impact:** 🔥 High

---

### 2.2 `findReferences` (LSP-Based)

**Purpose:** Find all references to a symbol for impact analysis

**Interface:**
```typescript
interface FindReferencesInput {
  filePath: string;
  line: number;                 // 0-indexed
  character: number;            // 0-indexed
  includeDeclaration?: boolean; // Include the definition itself (default: true)
}

interface FindReferencesResult {
  success: boolean;
  totalReferences: number;
  fileCount: number;
  references: Array<{
    file: string;
    line: number;
    column: number;
    context?: string;           // Surrounding code snippet
  }>;
}
```

**Use Cases:**
- Impact analysis before refactoring
- Understanding symbol usage
- Finding dead code (zero references)

**VS Code API:** `vscode.executeReferenceProvider`

**Complexity:** Low | **Impact:** Medium

---

### 2.3 `bulkReplace` (AST-Based) ⭐ CRITICAL

**Purpose:** Structural pattern matching and replacement using ast-grep

**Interface:**
```typescript
interface BulkReplaceInput {
  pattern: string;              // ast-grep pattern with metavariables
  replacement: string;          // Replacement using captured variables
  language: string;             // javascript, typescript, python, rust, etc.
  pathPattern?: string;         // Glob pattern (default: "**/*")
  excludePatterns?: string[];   // Exclusions (default: node_modules, dist, .git)
  dryRun?: boolean;            // Preview mode (default: true)
}

interface BulkReplaceResult {
  success: boolean;
  filesAffected: number;
  matchCount: number;
  changes: Array<{
    file: string;
    matches: Array<{
      line: number;
      original: string;
      replacement: string;
    }>;
  }>;
}
```

**Pattern Syntax (ast-grep):**
```yaml
# Metavariables
$VAR        - Matches single identifier/expression
$$$BODY     - Matches multiple statements
$_          - Matches anything (wildcard)

# Examples
console.log($MSG)              → logger.info($MSG)
var $X = $Y                    → const $X = $Y
new OldClass($ARGS)            → new NewClass($ARGS)
oldApi.fetchData($URL)         → newApi.getData($URL)
function $NAME($PARAMS) { $$$BODY }
```

**Supported Languages:** 30+ via tree-sitter (JavaScript, TypeScript, Python, Rust, Go, Java, C, C++, Ruby, and more)

**Requirements:** ast-grep CLI (`cargo install ast-grep` or `npm install -g @ast-grep/cli`)

**Complexity:** Medium | **Impact:** 🔥 High

---

### 2.4 `searchPattern` (AST-Based)

**Purpose:** Find code patterns without modification

**Interface:**
```typescript
interface SearchPatternInput {
  pattern: string;              // ast-grep pattern
  language: string;
  pathPattern?: string;
  maxResults?: number;          // Limit results (default: 50)
}

interface SearchPatternResult {
  success: boolean;
  matchCount: number;
  matches: Array<{
    file: string;
    line: number;
    column: number;
    matchedText: string;
    context: string;            // Surrounding lines
  }>;
}
```

**Use Cases:**
- Discover usage patterns before refactoring
- Find deprecated API usage
- Code audit and analysis
- Dry-run before bulk replace

**Complexity:** Low | **Impact:** Medium

---

### 2.5 `renameFile`

**Purpose:** Rename/move files with automatic import updates

**Interface:**
```typescript
interface RenameFileInput {
  oldPath: string;
  newPath: string;
  updateImports?: boolean;      // Update imports via LSP (default: true)
}

interface RenameFileResult {
  success: boolean;
  oldPath: string;
  newPath: string;
  importsUpdated?: number;      // Count of import statements updated
  filesModified?: string[];     // Files with updated imports
}
```

**Implementation:**
1. Use VS Code `WorkspaceEdit.renameFile()`
2. If `updateImports`: allow language server to process (TypeScript does this automatically)
3. Save all modified documents

**Complexity:** Medium | **Impact:** Medium

---

## 3. Terminal/Process Tools (9 Tools)

Tools for command execution, background process management, and output handling.

### 3.1 `run_command` ⭐ CRITICAL

**Purpose:** Execute shell commands synchronously with timeout and output capture

**Problems Solved:**
- Proper timeout handling
- Exit code reporting
- Output capture (stdout/stderr separation)
- Partial output on timeout

**Interface:**
```typescript
interface RunCommandInput {
  command: string;              // Shell command to execute
  working_dir?: string;         // Working directory
  timeout_ms?: number;          // Timeout in milliseconds (default: 30000)
  stdin?: string;               // Input to send to stdin
  env?: Record<string, string>; // Additional environment variables
}

interface RunCommandResult {
  success: boolean;             // exit_code === 0 && !timed_out
  exit_code?: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  timed_out: boolean;
}
```

**Implementation Features:**
- Configurable timeout with SIGTERM → SIGKILL escalation
- Captures partial output even on timeout
- ANSI escape code stripping
- Progress bar collapsing (carriage return handling)
- Clean exit code reporting

**Complexity:** Low | **Impact:** 🔥 Critical

---

### 3.2 `start_process` ⭐ CRITICAL

**Purpose:** Launch long-running background processes (dev servers, watchers)

**Problems Solved:**
- Agent blocking on non-terminating processes
- Single-threaded execution model limitations
- Blind to process state after backgrounding

**Interface:**
```typescript
interface StartProcessInput {
  command: string;
  working_dir?: string;
  name?: string;                // Human-readable identifier
  ready_pattern?: string;       // Regex to detect "ready" state
  ready_timeout_ms?: number;    // How long to wait for ready (default: 30000)
  env?: Record<string, string>;
}

interface StartProcessResult {
  process_id: string;           // Unique ID for later reference
  name: string;
  status: 'starting' | 'ready' | 'running' | 'failed';
  pid: number;                  // OS process ID
  port?: number;                // Auto-detected port if applicable
  initial_output: string;       // First N lines of output
}
```

**Key Features:**
- Returns immediately with process ID
- Optional ready pattern detection (e.g., "Server running on port")
- Automatic port detection from output
- Named processes for easy reference
- Non-blocking execution

**Ready Pattern Examples:**
```typescript
// Next.js
ready_pattern: "Ready in"

// Vite
ready_pattern: "Local:.*http"

// Express
ready_pattern: "listening on port"

// Django
ready_pattern: "Starting development server"
```

**Source:** Claude Code background task system, OpenAI Codex supervisor pattern

**Complexity:** Medium | **Impact:** 🔥 Critical

---

### 3.3 `get_process_output` ⭐ CRITICAL

**Purpose:** Retrieve output from background processes incrementally

**Problems Solved:**
- Context window overflow from full output dumps
- Missing output from long-running processes
- No visibility into background process state

**Interface:**
```typescript
interface GetProcessOutputInput {
  process_id: string;
  since_last_read?: boolean;    // Only NEW output (default: true)
  max_lines?: number;           // Limit output lines (default: 500)
  filter_pattern?: string;      // Regex to filter relevant lines
  include_stderr?: boolean;     // Include stderr (default: true)
}

interface GetProcessOutputResult {
  process_id: string;
  status: 'starting' | 'running' | 'ready' | 'completed' | 'failed' | 'killed';
  exit_code?: number;           // If completed
  stdout: string;
  stderr: string;
  truncated: boolean;
  lines_omitted?: number;
}
```

**Truncation Strategy:**
- Keep 20% head, 80% tail
- Insert truncation marker in middle
- Configurable max lines
- Run-length encoding for repeated lines

**Source:** Claude Code BashOutput tool, incremental output pattern

**Complexity:** Medium | **Impact:** 🔥 Critical

---

### 3.4 `stop_process` ⭐ CRITICAL

**Purpose:** Gracefully terminate background processes

**Problems Solved:**
- Zombie processes
- Port conflicts from lingering servers
- Environment corruption

**Interface:**
```typescript
interface StopProcessInput {
  process_id: string;
  signal?: 'SIGTERM' | 'SIGKILL' | 'SIGINT';  // Default: SIGTERM
  timeout_ms?: number;          // Wait for graceful shutdown (default: 5000)
  force_after_timeout?: boolean; // SIGKILL if timeout (default: true)
}

interface StopProcessResult {
  process_id: string;
  status: 'stopped' | 'force_killed' | 'already_stopped' | 'not_found';
  exit_code?: number;
  final_output: string;         // Last N lines before termination
}
```

**Shutdown Sequence:**
1. Send SIGTERM
2. Wait for `timeout_ms`
3. If still running and `force_after_timeout`: send SIGKILL
4. Capture final output
5. Clean up resources

**Complexity:** Low | **Impact:** 🔥 Critical

---

### 3.5 `list_processes`

**Purpose:** Get inventory of all managed processes

**Interface:**
```typescript
interface ListProcessesInput {
  include_completed?: boolean;  // Include finished processes (default: false)
  name_filter?: string;         // Filter by name pattern
}

interface ListProcessesResult {
  count: number;
  processes: Array<{
    process_id: string;
    name: string;
    command: string;
    status: ProcessStatus;
    pid: number;
    port?: number;
    started_at: string;         // ISO timestamp
    duration_ms: number;
    exit_code?: number;
  }>;
}

type ProcessStatus = 
  | 'starting'    // Process spawned, waiting for ready
  | 'running'     // Process running normally
  | 'ready'       // Process signaled ready (servers)
  | 'completed'   // Exited with code 0
  | 'failed'      // Exited with non-zero code
  | 'killed'      // Terminated by agent
  | 'timeout';    // Killed due to timeout
```

**Use Cases:**
- Visibility into all background tasks
- Basis for `/bashes`-style interactive UI
- Debug port conflicts
- Clean up before shutdown

**Complexity:** Low | **Impact:** Medium

---

### 3.6 `send_input`

**Purpose:** Send input to running processes (stdin)

**Problems Solved:**
- Interactive processes requiring user input
- Answering prompts (y/n questions)
- REPL interaction

**Interface:**
```typescript
interface SendInputInput {
  process_id: string;
  input: string;                // Text to send to stdin
  press_enter?: boolean;        // Append newline (default: true)
  special_key?: 'ctrl+c' | 'ctrl+d' | 'ctrl+z';
}

interface SendInputResult {
  success: boolean;
  output_after: string;         // Output received after input
  status: ProcessStatus;
}
```

**Special Keys:**
- `ctrl+c`: Send SIGINT (interrupt)
- `ctrl+d`: Send EOF (end of file)
- `ctrl+z`: Send SIGTSTP (suspend)

**Use Cases:**
- Answer y/n prompts
- Provide configuration values
- Send commands to REPLs
- Interrupt running commands

**Complexity:** Medium | **Impact:** Medium

---

### 3.7 `wait_for_pattern`

**Purpose:** Wait for specific pattern in process output

**Problems Solved:**
- Detecting server ready states
- Waiting for build completion
- Synchronizing on process state

**Interface:**
```typescript
interface WaitForPatternInput {
  process_id: string;
  pattern: string;              // Regex pattern to match
  timeout_ms?: number;          // Max wait time (default: 30000)
  in_stderr?: boolean;          // Check stderr instead of stdout
}

interface WaitForPatternResult {
  found: boolean;
  matched_line?: string;        // The line that matched
  wait_time_ms: number;
  timed_out: boolean;
}
```

**Use Cases:**
- Wait for "Server ready" message
- Detect compilation errors
- Wait for test completion
- Detect specific log entries

**Implementation:**
1. Check existing output buffer for pattern
2. If not found, set up listener for new output
3. Return when pattern matches or timeout

**Source:** OpenAI Codex event-driven state detection

**Complexity:** Low | **Impact:** Medium

---

### 3.8 `find_port_process`

**Purpose:** Find what process is using a specific port

**Problems Solved:**
- Port conflicts ("EADDRINUSE")
- Identifying zombie servers
- Debug network issues

**Interface:**
```typescript
interface FindPortProcessInput {
  port: number;
}

interface FindPortProcessResult {
  in_use: boolean;
  process_id?: string;          // Our managed process ID (if applicable)
  pid?: number;                 // OS process ID
  command?: string;             // Command that owns the port
}
```

**Implementation:**
1. Check managed processes first (by detected port)
2. Fall back to system check:
   - Linux/Mac: `lsof -i:PORT`
   - Windows: `netstat -ano | findstr :PORT`
3. Get command name via `ps -p PID -o comm=`

**Use Cases:**
- Check port availability before starting server
- Find and kill process blocking a port
- Debug "address already in use" errors

**Complexity:** Low | **Impact:** Medium

---

### 3.9 `execute_with_retry`

**Purpose:** Robust command execution with automatic retry

**Problems Solved:**
- Flaky commands (network, resource contention)
- Transient failures
- Intermittent CI issues

**Interface:**
```typescript
interface ExecuteWithRetryInput {
  command: string;
  max_retries?: number;         // Default: 3
  retry_delay_ms?: number;      // Delay between retries (default: 1000)
  success_exit_codes?: number[]; // Exit codes considered success (default: [0])
  success_pattern?: string;     // Regex that indicates success
  working_dir?: string;
  timeout_ms?: number;
}

interface ExecuteWithRetryResult {
  success: boolean;
  attempts: number;
  final_exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;          // Total time including retries
}
```

**Retry Strategy:**
1. Execute command
2. Check exit code against `success_exit_codes`
3. Optionally check output for `success_pattern`
4. If failed and attempts < max_retries: wait, retry
5. Return final result with attempt count

**Use Cases:**
- Network requests with intermittent failures
- Package installation with registry issues
- File operations with lock contention

**Complexity:** Low | **Impact:** Low

---

## 4. Implementation Priority

### Phase 1: Critical Foundation (Week 1)

| Priority | Tool | Category | Rationale |
|----------|------|----------|-----------|
| 1 | `run_command` | Terminal | Base command execution |
| 2 | `start_process` | Terminal | Enables dev servers, watchers |
| 3 | `get_process_output` | Terminal | Essential for async workflows |
| 4 | `stop_process` | Terminal | Cleanup capability |
| 5 | `smart_replace` | File | Solves #1 failure mode |
| 6 | `edit_lines` | File | Simple, high value |

### Phase 2: High Value (Week 2)

| Priority | Tool | Category | Rationale |
|----------|------|----------|-----------|
| 7 | `validate_edit` | File | Prevents infinite loops |
| 8 | `renameSymbol` | Refactor | LSP semantic rename |
| 9 | `list_processes` | Terminal | Process visibility |
| 10 | `bulkReplace` | Refactor | AST-based refactoring |

### Phase 3: Quality of Life (Week 3+)

| Priority | Tool | Category | Rationale |
|----------|------|----------|-----------|
| 11 | `findReferences` | Refactor | Impact analysis |
| 12 | `insert_at_line` | File | Quick win |
| 13 | `delete_section` | File | Quick win |
| 14 | `send_input` | Terminal | Interactive support |
| 15 | `wait_for_pattern` | Terminal | State detection |
| 16 | `searchPattern` | Refactor | Discovery tool |
| 17 | `find_port_process` | Terminal | Debug utility |
| 18 | `bulk_replace` | File | Multi-file edits |
| 19 | `renameFile` | Refactor | Import updates |
| 20 | `semantic_rename` | File | LSP integration |
| 21 | `execute_with_retry` | Terminal | Flaky command handling |

---

## 5. Problems Solved Matrix

| Problem | Tools That Solve It |
|---------|---------------------|
| **"String not found" errors** | `smart_replace`, `edit_lines` |
| **Multiple occurrences ambiguity** | `smart_replace` (occurrence param), `edit_lines` |
| **Line number drift** | `edit_lines`, `smart_replace` (line hints) |
| **Infinite retry loops on syntax errors** | `validate_edit` |
| **Multi-file refactoring coordination** | `semantic_rename`, `renameSymbol`, `bulkReplace` |
| **Dev server blocking agent** | `start_process`, `get_process_output` |
| **Zombie processes** | `stop_process`, `list_processes` |
| **No command output visibility** | `run_command`, `get_process_output` |
| **Port conflicts** | `find_port_process`, `stop_process` |
| **Interactive prompts** | `send_input` |
| **Server ready detection** | `wait_for_pattern`, `start_process` (ready_pattern) |
| **Context window overflow** | `get_process_output` (truncation), `validate_edit` |
| **API migrations** | `bulkReplace`, `bulk_replace` |
| **Import updates on file move** | `renameFile`, `renameSymbol` |

---

## 6. References

### Research Documents

| Document | Description |
|----------|-------------|
| `file-manipulation-analysis.md` | Core file editing problems and solutions |
| `bulk-refactoring-tool-research.md` | LSP and AST-based refactoring approaches |
| `terminal-tools-analysis.md` | Terminal/console command execution |
| `refactoring-tools-implementation.ts` | TypeScript implementation of refactoring tools |
| `terminal-tools-implementation.ts` | TypeScript implementation of terminal tools |

### External Sources

| Source | Contribution |
|--------|--------------|
| **RooCode** | Fuzzy matching with Levenshtein, middle-out search, apply_diff tool |
| **Aider** | Layered fallback matching, edit format research |
| **Cursor** | Two-phase apply model, speculative edits |
| **SWE-agent** | Lint-before-apply, syntax validation |
| **OpenHands** | Draft editor pattern, uniqueness constraint issues |
| **Claude Code** | Background task system, BashOutput tool, /bashes command |
| **OpenAI Codex** | Supervisor pattern, async process management |
| **Gemini CLI** | PTY integration, interactive shell support |
| **VS Code** | Shell integration (OSC 633), LSP APIs |
| **ast-grep** | Structural pattern matching, tree-sitter integration |

### GitHub Issues Referenced

| Issue | Topic |
|-------|-------|
| OpenHands #8112 | Uniqueness constraint in test files |
| Aider #6 | Line number drift on multi-edit |
| VS Code #279589 | Concurrent edit corruption |
| OpenAI Codex #3836 | Async process management |
| OpenAI Codex #4775 | Timeout handling |
| Claude Code #9881 | Interactive terminal support |

---

## Appendix: Quick Reference

### File Tools Summary
```
smart_replace  - Fuzzy find/replace with line hints
edit_lines     - Direct line-number editing
insert_at_line - Insert without replace
delete_section - Line or pattern-based deletion
validate_edit  - Syntax check before apply
bulk_replace   - Multi-file regex replace
semantic_rename - LSP rename symbol
```

### Refactoring Tools Summary
```
renameSymbol   - LSP semantic rename
findReferences - Find all usages
bulkReplace    - AST pattern replace
searchPattern  - AST pattern search
renameFile     - Move with import updates
```

### Terminal Tools Summary
```
run_command        - Sync command execution
start_process      - Background process launch
get_process_output - Incremental output fetch
stop_process       - Graceful termination
list_processes     - Process inventory
send_input         - Stdin interaction
wait_for_pattern   - Output pattern detection
find_port_process  - Port usage lookup
execute_with_retry - Retry failed commands
```

---

*Document Version: 1.0*
*Last Updated: January 2025*
*Total Tools: 21*
