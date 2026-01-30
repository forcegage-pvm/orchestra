# Research Summary: Enhanced Agent Tools

**Source Documents**: `docs/research/tools/002/`  
**Compiled**: 2026-01-30

## Overview

This document summarizes research findings from analysis of terminal tools, file manipulation, and bulk refactoring implementations across production AI coding tools.

---

## Terminal Tools Research

**Source**: `terminal-tools-analysis.md`

### Core Problems Identified

| Problem                         | Severity    | Description                                         |
| ------------------------------- | ----------- | --------------------------------------------------- |
| Long-Running Process Blocking   | 🔴 Critical | Agent's main thread blocked waiting for dev servers |
| Shell Integration Failures      | 🔴 Critical | Can't read output, spins forever waiting            |
| Output Capture Problems         | 🔴 Critical | Truncated, buffered, or missing output              |
| Command Completion Detection    | 🔴 Critical | No exit code, no "finished" signal                  |
| Interactive Process Handling    | 🟡 Major    | Commands requiring stdin hang indefinitely          |
| Timeout Handling                | 🟡 Major    | No default timeout, zombie processes                |
| Context Pollution               | 🟡 Major    | Large output consumes context window                |
| Concurrent Command Coordination | 🟡 Major    | Can't track which process is which                  |

### Solutions from Production Tools

| Solution                   | Source         | Approach                                                                |
| -------------------------- | -------------- | ----------------------------------------------------------------------- |
| Background Task Management | Claude Code    | `run_in_background: true`, returns task ID, check later with BashOutput |
| Shell Integration          | VS Code        | OSC 633 escape sequences for command lifecycle                          |
| Inline Terminal            | RooCode/Cline  | Bypass shell integration, use execa provider                            |
| Output Truncation          | Cline          | Keep 20% head, 80% tail, collapse progress bars                         |
| Stateless Shell            | Mini-SWE-Agent | subprocess.run per command, no persistent state                         |
| Process Supervision        | Proposed       | Event-driven status updates, ready detection                            |

### Recommended Terminal Tools

1. **`run_command`** - Enhanced single command with timeout, stdin support
2. **`start_process`** - Long-running process, returns immediately with ID
3. **`get_process_output`** - Incremental output retrieval with filtering
4. **`stop_process`** - Graceful termination with timeout escalation
5. **`list_processes`** - Process inventory
6. **`send_input`** - Send stdin/special keys to running process
7. **`wait_for_pattern`** - Wait for specific output pattern
8. **`find_port_process`** - Check what's using a port

### Key Implementation Patterns

```typescript
// Background process with ready detection
interface StartProcessInput {
  command: string;
  ready_pattern?: string; // Regex for "ready" state
  ready_timeout_ms?: number;
}

// Incremental output retrieval
interface GetOutputInput {
  process_id: string;
  since_last_read?: boolean; // Only new lines
  max_lines?: number; // Truncation limit
}

// Output truncation algorithm
function truncateOutput(output: string, maxLines: number): string {
  const lines = output.split("\n");
  if (lines.length <= maxLines) return output;

  const headLines = Math.floor(maxLines * 0.2);
  const tailLines = maxLines - headLines - 1;

  return [
    ...lines.slice(0, headLines),
    `[... ${lines.length - headLines - tailLines} lines omitted ...]`,
    ...lines.slice(-tailLines),
  ].join("\n");
}
```

---

## File Manipulation Research

**Source**: `file-manipulation-analysis.md`

### Core Problems Identified

| Problem                 | Severity    | Description                              |
| ----------------------- | ----------- | ---------------------------------------- |
| Search String Not Found | 🔴 Critical | Whitespace/indentation mismatches        |
| Multiple Occurrences    | 🔴 Critical | Ambiguous which occurrence to replace    |
| Line Number Drift       | 🟡 Major    | Multiple edits shift line numbers        |
| Infinite Retry Loops    | 🟡 Major    | Syntax errors cause endless retries      |
| Indentation Corruption  | 🟡 Major    | Wrong indent breaks Python/YAML          |
| Large File "Laziness"   | 🟡 Major    | LLM replaces code with `// ... code ...` |
| Multi-File Coordination | 🟡 Major    | Renames don't propagate                  |

### Solutions from Production Tools

| Solution                 | Source             | Approach                                      |
| ------------------------ | ------------------ | --------------------------------------------- |
| Fuzzy Matching           | RooCode, Aider     | Levenshtein distance with 85% threshold       |
| Two-Phase Apply          | Cursor             | Planning LLM + specialized apply model        |
| Line Number Hints        | RooCode, SWE-agent | `:start_line:` marker for fuzzy search origin |
| Lint-Before-Apply        | SWE-agent          | Parse, lint temp file, reject if errors       |
| Draft Editor LLM         | OpenHands          | Specialized model for edit integration        |
| Indentation Preservation | RooCode            | Capture and reapply surrounding indent        |

### Recommended File Editing Tools

1. **`smart_replace`** - Fuzzy matching with line hints and occurrence selection
2. **`edit_lines`** - Direct line-range editing (bypasses uniqueness constraint)
3. **`insert_at_line`** - Insert content with auto-indentation
4. **`delete_section`** - Safe section removal by line or pattern
5. **`validate_edit`** - Pre-flight syntax validation

### Key Implementation Patterns

```typescript
// Fuzzy matching with middle-out search
interface SmartReplaceParams {
  file_path: string;
  old_text: string;
  new_text: string;
  start_line_hint?: number; // Approximate location
  occurrence?: number; // Which match (1st, 2nd, etc.)
  fuzzy_threshold?: number; // Default 0.85
  dry_run?: boolean;
}

// Match strategy cascade
function findMatch(content: string, search: string): MatchResult {
  // 1. Try exact match
  // 2. Try whitespace-normalized match
  // 3. Try fuzzy match with Levenshtein
  // 4. Return best match above threshold
}

// Levenshtein similarity
function similarityRatio(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / Math.max(str1.length, str2.length);
}
```

---

## Bulk Refactoring Research

**Source**: `bulk-refactoring-tool-research.md`

### Three Viable Approaches

| Approach             | Semantic Awareness | Language Support  | Best For                 |
| -------------------- | ------------------ | ----------------- | ------------------------ |
| LSP-Based            | ✅ Full type-aware | Language-specific | True semantic rename     |
| AST-Based (ast-grep) | ⚠️ Structural only | 30+ languages     | API migrations, codemods |
| Hybrid               | ✅ Best of both    | Varies            | Most comprehensive       |

### LSP-Based Refactoring

Uses VS Code's built-in language server integration:

```typescript
// Execute semantic rename
const workspaceEdit =
  await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
    "vscode.executeDocumentRenameProvider",
    uri,
    position,
    newName,
  );

// Find all references
const references = await vscode.commands.executeCommand<vscode.Location[]>(
  "vscode.executeReferenceProvider",
  uri,
  position,
);
```

**Pros**: True semantic understanding, handles imports/exports/inheritance  
**Cons**: Requires language server, position-based, one symbol at a time

### AST-Based (ast-grep)

Pattern matching with metavariables:

```yaml
# Pattern syntax
pattern: console.log($MSG)
replacement: logger.info($MSG)

# Metavariables
$VAR      # Single expression/identifier
$$$BODY   # Multiple statements
```

**Pros**: 30+ languages, bulk operations, structural matching  
**Cons**: Not semantically aware, no type information

### Recommended Refactoring Tools

1. **`rename_symbol`** - LSP-based semantic rename with preview
2. **`find_references`** - Find all usages of a symbol
3. **`bulk_replace`** - ast-grep pattern replacement
4. **`move_file`** - Move with import updates (LSP + fallback)

### File Move with Import Updates

```typescript
// LSP-based approach (TypeScript, Java)
const edit = new vscode.WorkspaceEdit();
edit.renameFile(oldUri, newUri);
await vscode.workspace.applyEdit(edit);
// LSP willRenameFiles triggers import updates

// Fallback approach
function updateImportPath(
  file: string,
  oldPath: string,
  newPath: string,
): string {
  const oldRelative = path.relative(path.dirname(file), oldPath);
  const newRelative = path.relative(path.dirname(file), newPath);
  return content.replace(`from '${oldRelative}'`, `from '${newRelative}'`);
}
```

---

## Implementation Priority

Based on research impact analysis:

### P1 - Critical (Implement First)

| Tool                     | Impact  | Rationale                                              |
| ------------------------ | ------- | ------------------------------------------------------ |
| `start_process`          | 🔥 High | Solves #1 problem - dev server blocking                |
| `get_process_output`     | 🔥 High | Essential for async process monitoring                 |
| `run_command` (enhanced) | 🔥 High | Shell integration fallback prevents cascading failures |
| `smart_replace`          | 🔥 High | Solves #1 file editing failure                         |
| `edit_lines`             | 🔥 High | Bypasses uniqueness constraint                         |

### P2 - Important

| Tool             | Impact | Rationale                     |
| ---------------- | ------ | ----------------------------- |
| `stop_process`   | High   | Cleanup capability            |
| `validate_edit`  | High   | Prevents infinite retry loops |
| `rename_symbol`  | High   | True semantic refactoring     |
| `insert_at_line` | Medium | Common operation, simple      |
| `list_processes` | Medium | Debugging/visibility          |
| `send_input`     | Medium | Enables interactive commands  |

### P3 - Nice to Have

| Tool                | Impact | Rationale                    |
| ------------------- | ------ | ---------------------------- |
| `bulk_replace`      | Medium | Requires ast-grep dependency |
| `move_file`         | Medium | Complex with fallback logic  |
| `wait_for_pattern`  | Low    | Quality of life              |
| `find_port_process` | Low    | Debugging tool               |

---

## References

1. Claude Code - Background commands, /bashes, KillShell
2. OpenAI Codex Issues - #3836 (async process), #4775 (timeout)
3. Cursor Issues - #3327 (infinite loops), #3501 (interrupted)
4. VS Code - Shell integration escape sequences (OSC 633)
5. RooCode/Cline - Inline terminal, fuzzy matching, middle-out search
6. SWE-agent - Lint-before-apply, stateless execution
7. Aider - Multiple edit format strategies, unified diff
8. OpenHands - str_replace_editor limitations, draft editor
9. ast-grep - Structural pattern matching, MCP wrapper
