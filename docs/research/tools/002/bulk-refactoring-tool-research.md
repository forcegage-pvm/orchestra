# Bulk Replacement & Refactoring Tool Research

## Executive Summary

AI coding agents currently struggle with bulk replacements and semantic refactoring (like renaming a class and having all references update across the codebase). This document explores implementation options for solving this problem through a VS Code extension tool.

**Key Finding:** There are **three viable approaches**, each with different tradeoffs:

| Approach | Semantic Awareness | Language Support | Complexity | Best For |
|----------|-------------------|------------------|------------|----------|
| **LSP-Based** | ✅ Full type-aware | Language-specific | Medium | True semantic rename (classes, methods, variables) |
| **AST-Based (ast-grep)** | ⚠️ Structural only | 30+ languages | Low-Medium | Bulk structural patterns, API migrations |
| **Hybrid** | ✅ Best of both | Varies | High | Most comprehensive solution |

---

## Problem Statement

### Current Pain Points for AI Agents

1. **Rename Symbol** - Renaming a class/function requires updates across hundreds of files
2. **API Migrations** - Changing `oldApi.method()` → `newApi.differentMethod()` across codebase
3. **Structural Refactoring** - Extract method, change signatures, add parameters
4. **Bulk Pattern Replacement** - Convert `var` → `const`, update import paths, etc.

### Why Simple Find-Replace Fails

- **False positives**: `User` in comments, strings, unrelated code
- **No type awareness**: Can't distinguish between different `User` classes
- **No scope understanding**: Renames local `user` variable, breaks global `User` class
- **No import handling**: Doesn't update import statements

---

## Approach 1: LSP-Based Semantic Refactoring

### Overview

Leverage VS Code's existing Language Server Protocol (LSP) integration to perform semantically-aware refactoring.

### Key VS Code APIs

```typescript
// Execute rename across workspace - Returns WorkspaceEdit with all changes
const workspaceEdit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
  'vscode.executeDocumentRenameProvider',
  uri,           // Uri of the text document
  position,      // Position of the symbol to rename
  newName        // The new symbol name
);

// Prepare rename - Validates if rename is possible at this location
const prepareResult = await vscode.commands.executeCommand<{
  range: vscode.Range;
  placeholder: string;
}>('vscode.prepareRename', uri, position);

// Find all references - Useful for preview
const references = await vscode.commands.executeCommand<vscode.Location[]>(
  'vscode.executeReferenceProvider',
  uri,
  position
);

// Get symbol definition
const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
  'vscode.executeDefinitionProvider',
  uri,
  position
);
```

### LSP Protocol Details

The Language Server Protocol defines:

```typescript
// textDocument/rename request
interface RenameParams {
  textDocument: TextDocumentIdentifier;
  position: Position;
  newName: string;
}

// Response is a WorkspaceEdit
interface WorkspaceEdit {
  changes?: { [uri: string]: TextEdit[] };
  documentChanges?: (TextDocumentEdit | CreateFile | RenameFile | DeleteFile)[];
}
```

### Implementation Strategy

```typescript
// Tool: semanticRename
interface SemanticRenameInput {
  filePath: string;          // File containing the symbol
  line: number;              // 0-indexed line number
  character: number;         // 0-indexed character position
  newName: string;           // New name for the symbol
  preview?: boolean;         // If true, return changes without applying
}

export async function semanticRename(input: SemanticRenameInput): Promise<ToolResult> {
  const uri = vscode.Uri.file(input.filePath);
  const position = new vscode.Position(input.line, input.character);
  
  // Step 1: Validate the rename is possible
  const prepareResult = await vscode.commands.executeCommand<any>(
    'vscode.prepareRename', uri, position
  );
  
  if (!prepareResult) {
    return { 
      success: false, 
      error: 'Cannot rename at this position. Ensure cursor is on a renameable symbol.' 
    };
  }
  
  // Step 2: Get the WorkspaceEdit with all changes
  const workspaceEdit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
    'vscode.executeDocumentRenameProvider',
    uri,
    position,
    input.newName
  );
  
  if (!workspaceEdit) {
    return { success: false, error: 'Rename provider returned no edits' };
  }
  
  // Step 3: Preview or Apply
  if (input.preview) {
    return {
      success: true,
      preview: formatWorkspaceEditForPreview(workspaceEdit)
    };
  }
  
  const success = await vscode.workspace.applyEdit(workspaceEdit);
  return {
    success,
    filesModified: workspaceEdit.entries().length
  };
}

function formatWorkspaceEditForPreview(edit: vscode.WorkspaceEdit): PreviewResult {
  const changes: FileChange[] = [];
  
  for (const [uri, textEdits] of edit.entries()) {
    changes.push({
      file: uri.fsPath,
      edits: textEdits.map(e => ({
        range: { 
          startLine: e.range.start.line, 
          endLine: e.range.end.line 
        },
        oldText: '(would be replaced)',
        newText: e.newText
      }))
    });
  }
  
  return { changes, totalFiles: changes.length };
}
```

### Pros & Cons

**Pros:**
- ✅ **True semantic understanding** - Knows the difference between class `User` and variable `user`
- ✅ **Handles complex cases** - Renames across imports, exports, inheritance
- ✅ **Built into VS Code** - Just call existing APIs
- ✅ **Language-specific intelligence** - TypeScript server, Python server, etc. each know their language

**Cons:**
- ❌ **Requires language server running** - Must have document open or LS active
- ❌ **Position-based** - Need exact cursor position on the symbol
- ❌ **One symbol at a time** - Can't rename multiple unrelated symbols in batch
- ❌ **Language dependent** - Quality varies by language server

---

## Approach 2: AST-Based Structural Refactoring (ast-grep)

### Overview

Use ast-grep for tree-sitter-based structural pattern matching and replacement. This approach is structural (AST-aware) but not semantic (doesn't understand types).

### Why ast-grep?

- **30+ language support** via tree-sitter
- **Pattern syntax uses code** - Write patterns that look like the code you're matching
- **Metavariables** - `$VAR`, `$ARGS`, `$$$BODY` capture code nodes
- **CLI and library** - Can be integrated as MCP server or called via CLI
- **Already has MCP wrapper** - `ast-grep-mcp` exists!

### Pattern Examples

```yaml
# Find all console.log calls
pattern: console.log($MSG)
language: javascript

# Find function declarations
pattern: function $NAME($PARAMS) { $$$BODY }
language: javascript

# Rename class usage (structural match)
pattern: new OldClassName($ARGS)
replacement: new NewClassName($ARGS)

# API migration
pattern: oldApi.fetchData($URL)
replacement: newApi.getData($URL)
```

### Integration Options

#### Option A: Use Existing ast-grep-mcp

```json
{
  "mcpServers": {
    "ast-grep": {
      "command": "ast-grep-mcp"
    }
  }
}
```

The MCP server provides:
- `file_search` - Search for patterns in files
- `file_replace` - Replace patterns with dry-run support
- `generate_ast` - Get AST for debugging patterns
- `list_languages` - Get supported languages

#### Option B: Direct CLI Integration

```typescript
import { exec } from 'child_process';

interface AstGrepReplaceInput {
  pattern: string;
  replacement: string;
  language: string;
  pathPattern: string;  // e.g., "src/**/*.ts"
  dryRun?: boolean;
}

export async function astGrepReplace(input: AstGrepReplaceInput): Promise<ToolResult> {
  const args = [
    'run',
    '--pattern', input.pattern,
    '--rewrite', input.replacement,
    '--lang', input.language,
    input.pathPattern
  ];
  
  if (input.dryRun) {
    args.push('--dry-run');
  }
  
  return new Promise((resolve, reject) => {
    exec(`sg ${args.join(' ')}`, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, error: stderr });
      } else {
        resolve({ 
          success: true, 
          output: stdout,
          changes: parseAstGrepOutput(stdout)
        });
      }
    });
  });
}
```

#### Option C: Native tree-sitter Integration

```typescript
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

// Build your own pattern matcher using tree-sitter directly
// More control but significantly more work
```

### Pros & Cons

**Pros:**
- ✅ **Structural matching** - Understands AST, not just text
- ✅ **Multi-language** - 30+ languages supported
- ✅ **Bulk operations** - Replace across entire codebase
- ✅ **Pattern-based** - One pattern handles many variations
- ✅ **Fast** - Rust-based, handles 10k+ files easily

**Cons:**
- ❌ **Not semantically aware** - Can't distinguish between `User` class in different modules
- ❌ **Pattern learning curve** - Metavariable syntax takes practice
- ❌ **No type information** - Can't match "all functions returning Promise<User>"
- ❌ **Manual syntax responsibility** - Must ensure valid replacement syntax

---

## Approach 3: Hybrid Solution (Recommended)

### Overview

Combine LSP for semantic operations and ast-grep for bulk structural operations.

### Tool Design

```typescript
// Tool 1: Semantic Rename (LSP-based)
interface SemanticRenameToolInput {
  symbolName: string;         // The symbol to find and rename
  newName: string;            // New name
  filePath?: string;          // Optional: Specific file to start from
  position?: { line: number; character: number };  // Optional: Exact position
}

// Tool 2: Bulk Pattern Replace (ast-grep based)
interface BulkReplaceToolInput {
  pattern: string;            // ast-grep pattern
  replacement: string;        // Replacement pattern
  language: string;           // Language for parsing
  pathPattern?: string;       // Glob pattern, default: "**/*"
  excludePatterns?: string[]; // Exclusions
  dryRun?: boolean;          // Preview mode
}

// Tool 3: Find References (LSP-based)
interface FindReferencesToolInput {
  filePath: string;
  line: number;
  character: number;
  includeDeclaration?: boolean;
}

// Tool 4: Rename File/Move (Hybrid)
interface RenameFileToolInput {
  oldPath: string;
  newPath: string;
  updateImports?: boolean;    // Use LSP to update imports
}
```

### Implementation Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Refactoring Tool Layer                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────┐    ┌────────────────────────────────┐   │
│  │  Semantic Tools   │    │     Structural Tools           │   │
│  │  (LSP-based)      │    │     (ast-grep based)           │   │
│  │                   │    │                                │   │
│  │  • renameSymbol   │    │  • bulkReplace                │   │
│  │  • findReferences │    │  • patternSearch              │   │
│  │  • getDefinition  │    │  • apiMigration               │   │
│  │  • renameFile     │    │  • codemodTransform           │   │
│  └─────────┬─────────┘    └─────────────┬──────────────────┘   │
│            │                            │                       │
│            ▼                            ▼                       │
│  ┌─────────────────────┐    ┌────────────────────────────────┐ │
│  │   VS Code LSP API   │    │        ast-grep CLI/MCP        │ │
│  │                     │    │                                │ │
│  │  executeCommand()   │    │  sg run --pattern --rewrite   │ │
│  │  - RenameProvider   │    │  ast-grep-mcp tools           │ │
│  │  - ReferenceProvider│    │                                │ │
│  │  - DefinitionProvider│   │                                │ │
│  └─────────┬───────────┘    └─────────────┬──────────────────┘ │
│            │                              │                     │
│            ▼                              ▼                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Language Servers / Tree-sitter              │   │
│  │   TypeScript Server │ Python Server │ Rust Analyzer │ ...│   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Sample Tool Implementations

```typescript
// ============================================================
// TOOL 1: Semantic Rename
// ============================================================
const semanticRenameTool: AgentTool = {
  name: 'renameSymbol',
  description: `Rename a symbol (class, function, variable, etc.) across the entire codebase.
Uses the language server for semantic understanding - will correctly rename:
- All usages of the symbol
- Import/export statements  
- Inheritance/implementation references
- Comments and documentation (if supported by language server)

Note: Requires the cursor position to be on the exact symbol to rename.`,
  
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { 
        type: 'string', 
        description: 'Path to the file containing the symbol' 
      },
      line: { 
        type: 'number', 
        description: '0-indexed line number where the symbol is located' 
      },
      character: { 
        type: 'number', 
        description: '0-indexed character position within the line' 
      },
      newName: { 
        type: 'string', 
        description: 'The new name for the symbol' 
      },
      preview: { 
        type: 'boolean', 
        description: 'If true, return preview of changes without applying',
        default: true
      }
    },
    required: ['filePath', 'line', 'character', 'newName']
  },

  async execute(input, context): Promise<ToolResult> {
    const uri = vscode.Uri.file(input.filePath);
    const position = new vscode.Position(input.line, input.character);

    // Open document to ensure language server is active
    const document = await vscode.workspace.openTextDocument(uri);
    
    // Validate rename is possible
    const prepareResult = await vscode.commands.executeCommand<any>(
      'vscode.prepareRename', uri, position
    );
    
    if (!prepareResult) {
      return {
        success: false,
        output: `Cannot rename at position ${input.line}:${input.character}. ` +
                `Make sure the cursor is on a renameable symbol (class name, function name, variable, etc.)`
      };
    }

    // Get the edit
    const workspaceEdit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
      'vscode.executeDocumentRenameProvider',
      uri, position, input.newName
    );

    if (!workspaceEdit || workspaceEdit.size === 0) {
      return {
        success: false,
        output: 'Rename provider returned no edits. The symbol may not have any references.'
      };
    }

    // Format preview
    const preview = formatWorkspaceEditPreview(workspaceEdit);
    
    if (input.preview) {
      return {
        success: true,
        output: `Preview of rename "${prepareResult.placeholder || '(symbol)'}" → "${input.newName}":\n\n` +
                `Files to modify: ${preview.fileCount}\n` +
                `Total edits: ${preview.editCount}\n\n` +
                preview.summary +
                `\n\nTo apply, call again with preview: false`
      };
    }

    // Apply the edit
    const success = await vscode.workspace.applyEdit(workspaceEdit);
    
    if (success) {
      // Save all modified files
      await vscode.workspace.saveAll();
      return {
        success: true,
        output: `Successfully renamed across ${preview.fileCount} files (${preview.editCount} edits)`
      };
    } else {
      return {
        success: false,
        output: 'Failed to apply rename edits'
      };
    }
  }
};

// ============================================================
// TOOL 2: Bulk Pattern Replace
// ============================================================
const bulkReplaceTool: AgentTool = {
  name: 'bulkReplace',
  description: `Replace code patterns across the codebase using structural matching.
Uses AST-based pattern matching (ast-grep) for reliable structural replacements.

Pattern syntax:
- $VAR matches a single identifier or expression
- $$$BODY matches multiple statements
- Patterns match code structure, not just text

Examples:
- Pattern: "console.log($MSG)" → Replacement: "logger.info($MSG)"
- Pattern: "var $X = $Y" → Replacement: "const $X = $Y"
- Pattern: "new OldClass($ARGS)" → Replacement: "new NewClass($ARGS)"

Use for: API migrations, code style changes, bulk refactoring patterns`,

  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The code pattern to search for (use $VAR for metavariables)'
      },
      replacement: {
        type: 'string', 
        description: 'The replacement pattern (use captured $VAR names)'
      },
      language: {
        type: 'string',
        description: 'Programming language: javascript, typescript, python, rust, java, go, etc.'
      },
      pathPattern: {
        type: 'string',
        description: 'Glob pattern for files to search (default: entire workspace)',
        default: '**/*'
      },
      excludePatterns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Patterns to exclude (e.g., node_modules, dist)',
        default: ['**/node_modules/**', '**/dist/**', '**/.git/**']
      },
      dryRun: {
        type: 'boolean',
        description: 'Preview changes without applying',
        default: true
      }
    },
    required: ['pattern', 'replacement', 'language']
  },

  async execute(input, context): Promise<ToolResult> {
    // Build ast-grep command
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return { success: false, output: 'No workspace folder open' };
    }

    const args = [
      'run',
      '--pattern', JSON.stringify(input.pattern),
      '--rewrite', JSON.stringify(input.replacement),
      '--lang', input.language,
      '--json'  // Get structured output
    ];

    if (input.dryRun !== false) {
      // ast-grep doesn't modify files by default, --update-all applies changes
    } else {
      args.push('--update-all');
    }

    // Add path patterns
    args.push(input.pathPattern || '.');

    try {
      const result = await executeCommand('sg', args, { cwd: workspaceRoot });
      const changes = parseAstGrepJsonOutput(result.stdout);

      if (input.dryRun !== false) {
        return {
          success: true,
          output: `Preview of bulk replace:\n\n` +
                  `Pattern: ${input.pattern}\n` +
                  `Replacement: ${input.replacement}\n` +
                  `Language: ${input.language}\n\n` +
                  `Files affected: ${changes.fileCount}\n` +
                  `Matches found: ${changes.matchCount}\n\n` +
                  changes.preview +
                  `\n\nTo apply, call again with dryRun: false`
        };
      }

      return {
        success: true,
        output: `Successfully replaced ${changes.matchCount} matches in ${changes.fileCount} files`
      };
    } catch (error) {
      return {
        success: false,
        output: `ast-grep error: ${error.message}\n\nEnsure ast-grep (sg) is installed: cargo install ast-grep`
      };
    }
  }
};

// ============================================================
// TOOL 3: Find All References
// ============================================================
const findReferencesTool: AgentTool = {
  name: 'findReferences',
  description: `Find all references to a symbol across the codebase.
Returns locations where the symbol is used, including:
- Direct usages
- Import statements
- Type annotations
- Inheritance/implementation

Useful before renaming to understand impact.`,

  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'File containing the symbol' },
      line: { type: 'number', description: '0-indexed line number' },
      character: { type: 'number', description: '0-indexed character position' },
      includeDeclaration: { 
        type: 'boolean', 
        description: 'Include the declaration in results',
        default: true
      }
    },
    required: ['filePath', 'line', 'character']
  },

  async execute(input, context): Promise<ToolResult> {
    const uri = vscode.Uri.file(input.filePath);
    const position = new vscode.Position(input.line, input.character);

    const references = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeReferenceProvider',
      uri, position
    );

    if (!references || references.length === 0) {
      return {
        success: true,
        output: 'No references found for the symbol at this position'
      };
    }

    const grouped = groupReferencesByFile(references);
    
    return {
      success: true,
      output: `Found ${references.length} references across ${Object.keys(grouped).length} files:\n\n` +
              formatGroupedReferences(grouped)
    };
  }
};
```

---

## Recommended Implementation Plan

### Phase 1: Core Semantic Rename Tool

**Goal:** Enable true IDE-style rename symbol for AI agents

```typescript
// Minimum viable tool
const tools = [
  'renameSymbol'  // LSP-based semantic rename
];
```

**Implementation Steps:**
1. Create VS Code extension with `LanguageModelTool` registration
2. Implement `vscode.executeDocumentRenameProvider` wrapper
3. Add preview mode support
4. Handle error cases (no language server, invalid position, etc.)

### Phase 2: Add Bulk Structural Operations

**Goal:** Enable codemod-style bulk operations

```typescript
const tools = [
  'renameSymbol',   // From Phase 1
  'bulkReplace',    // ast-grep based
  'findReferences'  // LSP-based
];
```

**Implementation Steps:**
1. Integrate ast-grep CLI or MCP server
2. Create pattern documentation/examples
3. Add dry-run preview support

### Phase 3: Advanced Operations

**Goal:** Complete refactoring toolkit

```typescript
const tools = [
  // Semantic (LSP)
  'renameSymbol',
  'findReferences',
  'goToDefinition',
  
  // Structural (ast-grep)
  'bulkReplace',
  'searchPattern',
  
  // File operations
  'renameFile',        // With import update support
  'moveFile',
  
  // Code generation
  'extractMethod',     // Select code → new function
  'extractVariable',   // Expression → variable
];
```

---

## Dependencies & Requirements

### For LSP-Based Tools

- VS Code Extension API (`@types/vscode`)
- Language servers must be installed/active:
  - TypeScript: Built into VS Code
  - Python: Pylance extension
  - Rust: rust-analyzer extension
  - etc.

### For ast-grep Tools

**Option A: CLI**
```bash
cargo install ast-grep --locked
# or
npm install -g @ast-grep/cli
```

**Option B: MCP Server**
```bash
cargo install --git https://github.com/nnunley/ast-grep-mcp
```

**Option C: Native (tree-sitter)**
```bash
npm install tree-sitter tree-sitter-typescript tree-sitter-javascript
# etc. for each language
```

---

## Comparison with Existing Solutions

| Feature | VS Code Native | Claude Code | Cursor | ast-grep MCP |
|---------|---------------|-------------|--------|--------------|
| Semantic Rename | ✅ | ❌ | ⚠️ | ❌ |
| Bulk Replace | ⚠️ | ❌ | ❌ | ✅ |
| Multi-file Edit | ✅ | ✅ | ✅ | ✅ |
| Language Support | Per LS | All | All | 30+ |
| Agent Integration | ❌ | Via tools | Built-in | MCP |

**Key Gap:** No existing tool provides both semantic rename AND bulk structural operations via a unified agent interface.

---

## Appendix: VS Code API Reference

### Key Commands

| Command | Purpose | Returns |
|---------|---------|---------|
| `vscode.executeDocumentRenameProvider` | Rename symbol | `WorkspaceEdit` |
| `vscode.prepareRename` | Validate rename | `{range, placeholder}` |
| `vscode.executeReferenceProvider` | Find references | `Location[]` |
| `vscode.executeDefinitionProvider` | Go to definition | `Location[]` |
| `vscode.executeTypeDefinitionProvider` | Go to type definition | `Location[]` |
| `vscode.executeImplementationProvider` | Find implementations | `Location[]` |
| `vscode.executeDocumentSymbolProvider` | Get document symbols | `SymbolInformation[]` |
| `vscode.executeWorkspaceSymbolProvider` | Search workspace symbols | `SymbolInformation[]` |

### WorkspaceEdit API

```typescript
class WorkspaceEdit {
  // Check if edit has any changes
  readonly size: number;
  
  // Text edits
  replace(uri: Uri, range: Range, newText: string): void;
  insert(uri: Uri, position: Position, newText: string): void;
  delete(uri: Uri, range: Range): void;
  
  // File operations
  createFile(uri: Uri, options?: { overwrite?: boolean; ignoreIfExists?: boolean }): void;
  deleteFile(uri: Uri, options?: { recursive?: boolean; ignoreIfNotExists?: boolean }): void;
  renameFile(oldUri: Uri, newUri: Uri, options?: { overwrite?: boolean; ignoreIfExists?: boolean }): void;
  
  // Get all changes
  entries(): [Uri, TextEdit[]][];
}

// Apply edit atomically
const success = await vscode.workspace.applyEdit(workspaceEdit);
```

---

## Conclusion

**Recommended Approach:** Start with **Approach 3 (Hybrid)** implementing:

1. **`renameSymbol`** - LSP-based for semantic correctness
2. **`bulkReplace`** - ast-grep for structural patterns
3. **`findReferences`** - LSP-based for impact analysis

This gives agents the best of both worlds: true semantic understanding for rename operations, and fast bulk pattern matching for API migrations and codemod-style transformations.

**Estimated Implementation Time:**
- Phase 1 (Core rename): 2-3 days
- Phase 2 (Bulk operations): 2-3 days  
- Phase 3 (Advanced): 1-2 weeks

**Key Risk:** Language servers must be active for semantic operations. Consider fallback to structural matching if LSP unavailable.
