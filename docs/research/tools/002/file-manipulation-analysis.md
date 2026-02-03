# AI Coding Agent File Manipulation: Problems & Solutions

## Executive Summary

After extensive research across Cursor, Claude Code, Aider, RooCode, SWE-agent, OpenHands, Gemini CLI, and Cline, I've identified the **core problems** coding agents face with file manipulation and **concrete solutions** that can be implemented as custom agent tools.

---

## Part 1: The Core Problems

### 1. 🔴 Search String Not Found (The #1 Problem)

**What happens:** Agent generates `old_str` that doesn't exactly match the file content.

**Root causes:**
- **Whitespace mismatches**: Tabs vs spaces, trailing whitespace, different line endings
- **Indentation errors**: LLM generates code with wrong indent level
- **Stale file view**: File changed since LLM last read it
- **Hallucinated content**: LLM imagines code that doesn't exist

**Real examples from GitHub issues:**
```
"Failed to edit, 0 occurrences found for old_string"
"The exact text in old_string was not found"
```

### 2. 🔴 Multiple Occurrences Found (Ambiguous Match)

**What happens:** `old_str` appears multiple times in file, tool doesn't know which to replace.

**Common scenarios:**
- Unit test files with similar test setups
- Boilerplate code patterns (imports, class definitions)
- Configuration files with repeated structures

**From OpenHands issue #8112:**
> "When writing unit tests for code of more than trivial complexity, it is common to have duplicate lines in the unit test file. This makes it extremely difficult to edit the file with str_replace_editor due to the uniqueness constraint."

### 3. 🔴 Line Number Drift

**What happens:** Multiple edits to same file cause line numbers to shift, breaking subsequent edits.

**From Aider issue #6:**
> "If there's two edits to the same file, and the first edit changes a number of lines, the second edit doesn't seem to take this into account, and applies the changes wrongly."

**From VS Code issue #279589:**
> "With the rise of AI agents... we are seeing a specific class of file corruption. Agents often generate multiple concurrent WorkspaceEdit calls targeting the same file."

### 4. 🔴 Infinite Retry Loops on Syntax Errors

**What happens:** Agent makes edit that introduces syntax error, linter blocks it, agent retries with same bad edit.

**From SWE-agent documentation:**
> "If the system detects a syntax error, the edit will not be executed. Simply try to edit the file again... Issuing the same command a second time will just lead to the same error message again."

**From SWE-agent issues:**
> "I've seen cases where Claude gets stuck in loop with SWE-A base tools"
> "Agent gets stuck for some instances at a particular step but on re-running gets un-stuck"

### 5. 🔴 Indentation Corruption

**What happens:** Replacement text has wrong indentation, breaking Python/YAML/other whitespace-sensitive code.

**From Cursor research:**
> "Incorrect indentation is a common frustration with automated edits"

### 6. 🔴 Large File "Laziness"

**What happens:** For large files, LLMs replace code with placeholder comments.

**From Aider research:**
> "With other edit formats the GPT-4 Turbo models tended to elide large sections of code and replace them with '# ... original code here ...' style comments"

### 7. 🔴 Whole-File Rewrites are Expensive

**What happens:** For small edits, rewriting entire file wastes tokens and time.

**Trade-off discovered by Cursor:**
> "We find that fully rewriting the full file outperforms aider-like diffs for files under 400 lines"

But this is only viable with speculative decoding optimizations.

### 8. 🔴 Multi-File Coordination Failures

**What happens:** Changes that should propagate across files (renames, API changes) don't.

**The semantic gap:**
- Text-based tools can't understand that renaming `UserService` in one file requires updates in 15 other files
- No access to IDE's "rename symbol" functionality

---

## Part 2: Solutions Found in Production Tools

### Solution A: Fuzzy Matching (RooCode, Aider)

**How it works:**
1. Try exact string match
2. If fails, try match with normalized whitespace
3. If fails, use Levenshtein distance to find closest match
4. Accept if similarity above threshold (typically 80-90%)

**RooCode's "middle-out" search:**
```
1. Use :start_line: hint to estimate location
2. Search outward from that point
3. Score similarity with Levenshtein distance
4. Select best match above threshold
```

**Aider's layered fallback:**
```
1. Exact match
2. Match ignoring line endings  
3. Match with all whitespace trimmed
4. Break hunk into smaller sub-hunks and try each
```

### Solution B: Two-Phase Apply (Cursor)

**How it works:**
1. **Planning LLM**: Generates "sketch" of intended change
2. **Apply Model**: Specialized fine-tuned model integrates sketch into codebase

**Why it works:**
> "Even powerful LLMs, skilled at code generation and reasoning, may struggle to produce perfectly formatted, precisely located diffs that apply cleanly"

Cursor trained a Llama-3-70b model specifically for the "apply" task, achieving 1000+ tokens/sec with speculative edits.

### Solution C: Line Number Hints (RooCode, SWE-agent)

**How it works:**
- Include `:start_line:` marker in edit block
- Tool uses this as starting point for fuzzy search
- Provides buffer zone around expected location

**Example:**
```
<<<<<<< SEARCH :start_line:42
def old_function():
    pass
=======
def new_function():
    pass
>>>>>>> REPLACE
```

### Solution D: Lint-Before-Apply (SWE-agent)

**How it works:**
1. Parse proposed edit
2. Create temporary version of file with edit applied
3. Run linter (flake8 for Python)
4. If syntax errors, reject edit and return error to LLM
5. Only apply if linter passes

**Key insight:** Return detailed, actionable error messages:
```
"Your proposed edit has introduced new syntax error(s). 
Please read this error message carefully...
DO NOT re-run the same failed edit command."
```

### Solution E: Draft Editor LLM (OpenHands)

**How it works:**
1. Primary LLM specifies target line range
2. Tool extracts that code section
3. Sends to specialized "draft editor" LLM with focused prompt
4. Editor LLM rewrites just that section
5. Tool reintegrates into file

**Advantage:** Separates "what to change" from "how to change it"

### Solution F: Indentation Preservation (RooCode)

**How it works:**
1. Capture leading whitespace of matched lines
2. Analyze indentation pattern (tabs vs spaces, indent size)
3. Apply same indentation to replacement text
4. Auto-adjust if replacement has different structure

---

## Part 3: Recommended Tool Improvements

Based on this research, here are **concrete, high-impact tools** to add:

### 🥇 Tool 1: `smart_replace` - Fuzzy String Replace with Line Hints

**Solves:** Problems #1, #2, #3

```typescript
interface SmartReplaceParams {
  file_path: string;
  old_text: string;
  new_text: string;
  start_line_hint?: number;     // Optional: approximate location
  occurrence?: number;          // Which occurrence (1st, 2nd, etc.) if multiple
  fuzzy_threshold?: number;     // Default 0.85 (85% similarity)
  dry_run?: boolean;            // Preview changes without applying
}
```

**Implementation strategy:**
1. Read file content
2. Try exact match first
3. If multiple matches found, use `start_line_hint` or `occurrence` to disambiguate
4. If no exact match, normalize whitespace and retry
5. If still no match, use Levenshtein distance with middle-out search from hint
6. Return detailed result: match found, location, similarity score, diff preview

### 🥇 Tool 2: `edit_lines` - Line-Number Based Editing

**Solves:** Problems #2, #3 (bypasses uniqueness constraint)

```typescript
interface EditLinesParams {
  file_path: string;
  start_line: number;           // 1-indexed
  end_line: number;             // Inclusive, or -1 for "to end"
  new_content: string;          // Replacement text (empty = delete)
  preserve_indentation?: boolean; // Auto-match surrounding indent
  validate_syntax?: boolean;    // Run linter before applying
}
```

**Why this helps:**
- When LLM knows exact line range, bypasses string matching entirely
- Perfect for "delete lines 45-67" or "replace function starting at line 100"
- Pairs well with `view` tool that shows line numbers

### 🥇 Tool 3: `insert_at_line` - Clean Insertion Without Replace

**Solves:** Common case of adding new code

```typescript  
interface InsertAtLineParams {
  file_path: string;
  line: number;                 // Insert BEFORE this line (1-indexed)
  content: string;              // Text to insert
  auto_indent?: boolean;        // Match indentation of surrounding code
}
```

**Use cases:**
- Adding new imports at top of file
- Adding new methods to a class
- Inserting error handling code

### 🥈 Tool 4: `delete_section` - Safe Section Removal

**Solves:** Common editing pattern

```typescript
interface DeleteSectionParams {
  file_path: string;
  // Either line-based:
  start_line?: number;
  end_line?: number;
  // Or pattern-based:
  start_pattern?: string;       // Delete from first line matching this
  end_pattern?: string;         // To first line matching this (inclusive)
  include_patterns?: boolean;   // Whether to delete the pattern lines too
}
```

### 🥈 Tool 5: `validate_edit` - Pre-Flight Check

**Solves:** Problem #4 (infinite retry loops)

```typescript
interface ValidateEditParams {
  file_path: string;
  new_content: string;          // Full proposed file content
  // OR
  edit_preview: string;         // Diff/patch to apply
}

interface ValidateEditResult {
  valid: boolean;
  syntax_errors?: SyntaxError[];
  lint_warnings?: LintWarning[];
  diff_preview: string;         // What would change
  suggestions?: string[];       // How to fix issues
}
```

**Key feature:** Returns actionable fix suggestions, not just "syntax error"

### 🥈 Tool 6: `bulk_replace` - Multi-Occurrence Replace

**Solves:** Refactoring patterns (rename variable, update API calls)

```typescript
interface BulkReplaceParams {
  file_path: string;            // Or glob pattern for multiple files
  find: string;                 // Text or regex pattern
  replace: string;              // Replacement (can use capture groups)
  is_regex?: boolean;
  whole_word?: boolean;         // Only match complete words
  preview_only?: boolean;
  max_replacements?: number;
}

interface BulkReplaceResult {
  files_modified: number;
  total_replacements: number;
  changes: FileChange[];        // Details of each change
}
```

### 🥉 Tool 7: `semantic_rename` (Advanced - requires LSP)

**Solves:** Problem #8 (multi-file coordination)

```typescript
interface SemanticRenameParams {
  file_path: string;
  line: number;
  column: number;
  new_name: string;
  preview_only?: boolean;
}
```

**Requires:** VS Code extension with LSP access
**Benefit:** True "rename symbol" that updates all references across codebase

---

## Part 4: Implementation Priority Matrix

| Tool | Impact | Complexity | Recommendation |
|------|--------|------------|----------------|
| `smart_replace` | 🔥 High | Medium | **Implement first** - Solves most common failures |
| `edit_lines` | 🔥 High | Low | **Implement first** - Simple, high value |
| `insert_at_line` | Medium | Low | Quick win |
| `validate_edit` | 🔥 High | Medium | Prevents infinite loops |
| `delete_section` | Medium | Low | Quick win |
| `bulk_replace` | Medium | Low | Enables refactoring |
| `semantic_rename` | 🔥 High | High | Requires LSP integration |

---

## Part 5: Best Practices for Tool Design

### 1. Always Return Rich Feedback

Bad:
```
Error: String not found
```

Good:
```
Error: Exact match not found for search string.
- Closest match found at line 47 (92% similarity)
- Difference: Expected 4 spaces indent, found 2 spaces
- Suggestion: Try with fuzzy_threshold=0.9 or correct indentation
```

### 2. Support Dry-Run/Preview Mode

Every destructive operation should have a preview option that shows what would change without applying.

### 3. Include Line Numbers in View Output

When displaying file content, always show line numbers. This enables the LLM to use line-based editing tools effectively.

### 4. Validate Before Apply

Run syntax validation before committing changes. If validation fails, return the error without applying.

### 5. Track Edit History

Keep track of recent edits to a file. If same edit fails twice, suggest alternative approaches.

### 6. Handle Concurrent Edits

If file was modified since last read, require re-read before editing. Use file content hash or modification timestamp.

---

## Part 6: File Copy/Move Operations

### Problems Specific to Copy/Move

#### 🔴 Import/Reference Updates Not Happening

**The #1 Problem:** Moving `src/utils/helpers.ts` to `src/lib/helpers.ts` doesn't update the 15 files that `import { helper } from '../utils/helpers'`

**From Aider issue #651:**
> "When asking aider to suggest improvements to my repo, it suggested that I move files into subdirectories. Because these files are long, I needed to move them manually and then change imports/references across the code base."

**From VS Code issue #215271:**
> "In 99% of cases, renaming or moving a file did not update the imports across other files."

#### 🔴 Language-Specific Support Gaps

| Language | Import Update Support | Notes |
|----------|----------------------|-------|
| TypeScript/JavaScript | ✅ Good (via tsserver) | Works most of the time |
| Python | ⚠️ Limited (Pylance) | Feature request since 2020 |
| Rust | ⚠️ Partial (rust-analyzer) | Works for some cases |
| Go | ⚠️ Partial | gopls has support |
| Java | ✅ Good | JDT.LS handles well |

#### 🔴 Agent "Forgets" File Locations

**From "How to keep your AI coding agent from going rogue":**
> "Your agent forgot where it wrote a file and re-created it elsewhere in your workspace."

Agents create duplicate files in wrong paths, especially in large projects.

#### 🔴 LSP Complexity

LSP 3.16 added `workspace/willRenameFiles` but:
- Folder renames don't always trigger import updates
- Ordering of text edits + file renames in WorkspaceEdit is fragile
- Must complete text edits BEFORE the rename operation

### Recommended Copy/Move Tools

#### 🥇 Tool: `move_file` - Move with Import Updates

```typescript
interface MoveFileParams {
  source_path: string;
  dest_path: string;
  update_imports?: boolean;      // Default true - use LSP if available
  dry_run?: boolean;             // Preview changes
}

interface MoveFileResult {
  success: boolean;
  imports_updated: number;
  files_modified: string[];      // List of files where imports changed
  error?: string;
}
```

**Implementation Strategy:**
1. Check if destination exists (fail if so, unless overwrite flag)
2. If `update_imports`:
   - Use VS Code's `WorkspaceEdit.renameFile()` to trigger LSP
   - Wait for language server's `willRenameFiles` response
   - Apply the returned WorkspaceEdit (contains import updates)
3. If LSP not available, fall back to:
   - Find all files importing the old path
   - Calculate new relative import paths
   - Apply bulk string replacement
4. Return summary of all changes

#### 🥇 Tool: `copy_file` - Copy with Path Adjustment

```typescript
interface CopyFileParams {
  source_path: string;
  dest_path: string;
  adjust_relative_imports?: boolean;  // Fix imports inside copied file
}
```

**Note:** Copy typically doesn't need import updates in OTHER files, but may need to adjust imports INSIDE the copied file if relative paths change.

#### 🥈 Tool: `move_directory` - Move Folder with All Imports

```typescript
interface MoveDirectoryParams {
  source_dir: string;
  dest_dir: string;
  update_imports?: boolean;
  file_pattern?: string;         // e.g., "**/*.ts" - which files to update
}
```

**Challenge:** LSP often doesn't handle folder renames well. May need to:
1. Enumerate all files in folder
2. Move each file individually, collecting import updates
3. Apply all updates atomically

#### 🥈 Tool: `find_importers` - Find All Files Importing a Module

```typescript
interface FindImportersParams {
  file_path: string;             // The file being imported
  include_patterns?: string[];   // Glob patterns for files to search
}

interface FindImportersResult {
  importers: {
    file: string;
    line: number;
    import_statement: string;
  }[];
  total_count: number;
}
```

**Use case:** Before moving a file, understand the blast radius.

### Implementation Approaches

#### Approach A: LSP-Based (Best for VS Code Extensions)

```typescript
async function moveFileWithLSP(source: string, dest: string): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.renameFile(
    vscode.Uri.file(source),
    vscode.Uri.file(dest),
    { overwrite: false }
  );
  
  // This triggers onWillRenameFiles, which calls the language server
  // The LS returns additional edits for import updates
  const success = await vscode.workspace.applyEdit(edit);
}
```

**Caveat:** Works well for TypeScript, less reliable for other languages.

#### Approach B: AST-Based (Language Independent)

1. Parse all source files to build import graph
2. Find all files importing the moved file
3. Calculate new relative paths
4. Apply text replacements

```typescript
// Example: Updating TypeScript imports
function updateImportPath(
  importingFile: string,
  oldImportedPath: string,
  newImportedPath: string
): string {
  const oldRelative = path.relative(path.dirname(importingFile), oldImportedPath);
  const newRelative = path.relative(path.dirname(importingFile), newImportedPath);
  
  // Handle ./foo vs foo vs ../foo
  const oldImport = normalizeImportPath(oldRelative);
  const newImport = normalizeImportPath(newRelative);
  
  return fileContent.replace(
    new RegExp(`from ['"]${escapeRegex(oldImport)}['"]`, 'g'),
    `from '${newImport}'`
  );
}
```

#### Approach C: Hybrid (Recommended)

1. Try LSP first (fastest, most accurate for supported languages)
2. Fall back to AST-based if LSP unavailable or fails
3. Provide dry-run preview showing all affected files

### Best Practices for File Operations

1. **Always dry-run first** - Show user what imports will change before moving
2. **Atomic operations** - Either all changes succeed or none do
3. **Handle edge cases:**
   - Re-exports (`export * from './moved-file'`)
   - Dynamic imports (`import('./moved-file')`)
   - Type-only imports (`import type { Foo } from './moved-file'`)
   - Side-effect imports (`import './moved-file'`)
4. **Preserve file metadata** - Timestamps, permissions where relevant
5. **Create parent directories** - `move_file('a.ts', 'new/dir/a.ts')` should create `new/dir/`

---

## Appendix: Key Sources

1. **Fabian Hertwig's Blog** - "Code Surgery: How AI Assistants Make Precise Edits" (April 2025)
   - Comprehensive analysis of Codex, Aider, RooCode, Cursor approaches

2. **Cursor Blog** - "Instant Apply" (May 2024)  
   - Details on speculative edits and fast-apply model

3. **Aider Documentation** - Edit formats and troubleshooting
   - Multiple edit format strategies, unified diff research

4. **RooCode Documentation** - apply_diff tool
   - Fuzzy matching with Levenshtein, middle-out search

5. **SWE-agent GitHub Issues** - Real-world failure patterns
   - Syntax error loops, edit command failures

6. **OpenHands Issues** - str_replace_editor limitations
   - Uniqueness constraint problems, large file handling

7. **VS Code Issue #279589** - Concurrent edit corruption
   - Race conditions in AI agent editing
