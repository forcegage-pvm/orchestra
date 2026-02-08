# Auto-Fix Agent Tool — Design Document

## 1. Problem Statement

Orchestra's custom AI coding agents (in `extension/src/agents/`) have tools that create and edit files (`editFile`, `createFile`, `bulkReplace`, `smartReplace`, etc.). After these file mutations, language servers (TypeScript, ESLint, Dart, etc.) often detect fixable issues — unused imports, missing semicolons, import ordering problems, etc.

Currently, agents must:

1. Edit a file
2. Optionally use `validate: true` to see diagnostics
3. Read the diagnostics
4. Manually fix each issue with another edit call

This is wasteful. VS Code's `editor.codeActionsOnSave` mechanism automatically fixes these issues when a human saves a file. We want to bring that same capability into Orchestra's agent tool pipeline — programmatically applying the same auto-fixes that VS Code applies on save.

---

## 2. Research Findings

### 2.1 How VS Code's `codeActionsOnSave` Works Internally

Source: `microsoft/vscode` — `src/vs/workbench/contrib/codeEditor/browser/saveParticipants.ts`

The `CodeActionOnSaveParticipant` class implements `ITextFileSaveParticipant`. On every file save:

1. **Reads settings**: Parses `editor.codeActionsOnSave` from user/workspace settings, filtered by language ID
2. **Builds kind list**: Converts setting keys (e.g., `"source.fixAll"`, `"source.organizeImports"`) into `HierarchicalKind` objects
3. **Prioritizes `source.fixAll`**: Sorts so `SourceFixAll` kinds run first
4. **Iterates each kind**: For each code action kind:
   - Calls `getCodeActions()` with `{ type: Auto, triggerAction: OnSave, filter: { include: kind, includeSourceActions: true } }`
   - This queries all registered `CodeActionProvider`s that match the kind
   - For each returned valid action, calls `applyCodeAction(action, ApplyCodeActionReason.OnSave)`
5. **`applyCodeAction`** resolves the action (lazy-loads the `WorkspaceEdit` if needed via `provider.resolveCodeAction()`), then:
   - Applies `action.edit` via `bulkEditService.apply()` (which is essentially `WorkspaceEdit`)
   - Executes `action.command` if present (e.g., `applyCodeActionCommand` for TS)

Key source references:

- `saveParticipants.ts:390-441` — `applyOnSaveActions()` loop
- `saveParticipants.ts:434-441` — `getActionsToRun()` using `getCodeActions()`
- `codeAction.ts:271-332` — `applyCodeAction()` applying edits + commands
- `codeAction.ts:356-383` — `_executeCodeActionProvider` command registration

### 2.2 The Extension API Surface

#### `vscode.executeCodeActionProvider` (Built-in Command)

This is the **key API** for programmatic access from an extension:

```typescript
const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
  "vscode.executeCodeActionProvider",
  uri, // vscode.Uri — the file
  rangeOrSelection, // vscode.Range | vscode.Selection — scope
  kind, // string (optional) — e.g., 'source.fixAll'
  itemResolveCount, // number (optional) — how many to pre-resolve
);
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `uri` | `vscode.Uri` | File URI to get code actions for |
| `rangeOrSelection` | `vscode.Range \| vscode.Selection` | Document range (use full range for source actions) |
| `kind` | `string` (optional) | Filter by `CodeActionKind` value, e.g. `'source.fixAll'` |
| `itemResolveCount` | `number` (optional) | Number of actions to pre-resolve (populate `.edit`) |

**Returns:** `Promise<vscode.CodeAction[]>` — array of code actions matching the criteria.

Each `CodeAction` has:

- `.title` — human-readable description
- `.kind` — `CodeActionKind` (e.g., `Source.FixAll`, `Source.OrganizeImports`)
- `.edit` — `WorkspaceEdit` (may be `undefined` until resolved)
- `.command` — optional `Command` to execute after applying edit
- `.isPreferred` — whether this is the "preferred" fix
- `.diagnostics` — related diagnostics this action fixes

#### `CodeActionKind` Hierarchy

```
CodeActionKind.Empty ("")
├── QuickFix ("quickfix")
├── Refactor ("refactor")
│   ├── Extract ("refactor.extract")
│   ├── Inline ("refactor.inline")
│   ├── Move ("refactor.move")
│   └── Rewrite ("refactor.rewrite")
└── Source ("source")
    ├── FixAll ("source.fixAll")
    │   ├── source.fixAll.ts          (TypeScript)
    │   ├── source.fixAll.eslint      (ESLint)
    │   └── source.fixAll.<provider>  (any provider)
    └── OrganizeImports ("source.organizeImports")
        ├── source.organizeImports.ts
        └── source.organizeImports.<provider>
```

Language servers/extensions register `CodeActionProvider`s for specific kinds. For example:

- **TypeScript**: `source.fixAll.ts`, `source.organizeImports.ts`, `source.removeUnused.ts`, `source.addMissingImports.ts`
- **ESLint extension**: `source.fixAll.eslint`
- **Dart**: `source.fixAll`, `source.organizeImports`

#### Applying Code Actions

```typescript
// 1. Get the document and its full range
const doc = await vscode.workspace.openTextDocument(uri);
const fullRange = new vscode.Range(
  doc.positionAt(0),
  doc.positionAt(doc.getText().length),
);

// 2. Request code actions with pre-resolution
const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
  "vscode.executeCodeActionProvider",
  uri,
  fullRange,
  "source.fixAll", // kind filter
  100, // resolve up to 100 actions
);

// 3. Apply each action's WorkspaceEdit
for (const action of actions) {
  if (action.edit) {
    await vscode.workspace.applyEdit(action.edit);
  }
  if (action.command) {
    await vscode.commands.executeCommand(
      action.command.command,
      ...(action.command.arguments ?? []),
    );
  }
}
```

**Important consideration**: After applying one action's edit, the document content changes, which may invalidate subsequent actions' ranges. VS Code's internal implementation handles this by re-querying actions after each application in the save participant loop. For `source.fixAll`, typically a single action covers all fixes, so this is less of a concern.

### 2.3 Resolution Requirement

Some `CodeActionProvider` implementations use **lazy resolution** — the `.edit` property is `undefined` when first returned, and only populated when `resolveCodeAction()` is called. The `itemResolveCount` parameter in `vscode.executeCodeActionProvider` controls how many are pre-resolved.

From VS Code source (`codeAction.ts:373-380`):

```typescript
const resolveCount = Math.min(
  codeActionSet.validActions.length,
  typeof itemResolveCount === "number" ? itemResolveCount : 0,
);
for (let i = 0; i < resolveCount; i++) {
  resolving.push(codeActionSet.validActions[i].resolve(CancellationToken.None));
}
```

**Recommendation**: Always pass a generous `itemResolveCount` (e.g., 50) to ensure edits are populated.

---

## 3. Existing Infrastructure in Orchestra

### 3.1 Diagnostics Utility (`tools/utils/diagnostics.ts`)

Already provides:

- `getDiagnosticsForFile(uri, delayMs)` — waits for lang server, returns `DiagnosticsResult`
- `formatDiagnosticsSummary(result)` — human-readable output
- `DiagnosticsResult` type with `errorCount`, `warningCount`, `hasErrors`, `diagnostics[]`

### 3.2 editFile Tool (`tools/coding/editFile.ts`)

Already has `validate?: boolean` option that:

- After applying the edit, calls `getDiagnosticsForFile(uri)`
- Appends diagnostics summary to the tool result
- Reports error/warning counts

### 3.3 createFile Tool (`tools/coding/createFile.ts`)

Creates files with content. Does not currently have validation or auto-fix.

### 3.4 Other File-Mutating Tools

- `bulkReplace` — multiple replacements in one file
- `smartReplace` / `smartReplaces` — fuzzy matching replacements
- `editLines` — line-range based editing
- `insertAtLine` — insert text at line number
- `deleteSection` — delete line ranges

### 3.5 Tool Architecture Patterns

All tools follow this pattern:

```typescript
export const myTool: AgentTool<MyInput> = {
  name: "tool_name",
  description: "...",
  inputSchema: { type: "object", properties: {...}, required: [...] },
  invoke: async (input, context) => { ... return ToolResult }
};
```

Key utilities used:

- `validatePath()` from `utils/pathValidation.ts` — security check for workspace containment
- `successResult()` / `errorResult()` from `utils/resultBuilder.ts` — build `ToolResult`
- `createToolError()` from `errors.ts` — structured errors with codes
- `context.observer?.onProgress()` — progress reporting
- `context.observer?.onFileOperation()` — file change tracking

---

## 4. Implementation Plan

### 4.1 Inventory of All File-Mutating Tools

Before designing the changes, here is the **complete list** of coding tools that mutate files and therefore need the `autofix` option:

| #   | Tool Name        | File               |  Mutates Files  |     Has `validate` Today      | Needs `autofix` |
| --- | ---------------- | ------------------ | :-------------: | :---------------------------: | :-------------: |
| 1   | `edit_file`      | `editFile.ts`      |       ✅        |     ✅ (local interface)      |       ✅        |
| 2   | `create_file`    | `createFile.ts`    |       ✅        |              ❌               |       ✅        |
| 3   | `smart_replace`  | `smartReplace.ts`  |       ✅        | ✅ (Zod schema in `types.ts`) |       ✅        |
| 4   | `smart_replaces` | `smartReplaces.ts` |       ✅        |     ✅ (local interface)      |       ✅        |
| 5   | `edit_lines`     | `editLines.ts`     |       ✅        | ✅ (Zod schema in `types.ts`) |       ✅        |
| 6   | `insert_at_line` | `insertAtLine.ts`  |       ✅        |              ❌               |       ✅        |
| 7   | `delete_section` | `deleteSection.ts` |       ✅        |              ❌               |       ✅        |
| 8   | `bulk_replace`   | `bulkReplace.ts`   | ✅ (multi-file) |              ❌               |       ✅        |

**Not applicable** (read-only or non-code):

- `read_file`, `read_files` — read-only
- `search_files`, `grep_search` — search only
- `list_directory` — listing only
- `find_usages` — reference lookup only
- `validate_edit` — dry-run validation only
- `create_directory` — creates directories, no code content to fix
- `delete_file` — removes files, nothing to fix

### 4.2 New Utility: `autofix.ts` (in `tools/utils/`)

A shared utility function that programmatically applies VS Code code actions to a file. Lives alongside `diagnostics.ts` as a utility that multiple tools can use.

**File**: `extension/src/agents/tools/utils/autofix.ts`

```typescript
/**
 * Auto-fix utility for applying VS Code code actions programmatically.
 *
 * Uses the same mechanism as editor.codeActionsOnSave to apply
 * source.fixAll, source.organizeImports, and other source actions
 * to files after agent edits.
 */

import * as vscode from "vscode";

/** Kinds of code actions that can be auto-applied */
export type AutoFixKind =
  | "source.fixAll"
  | "source.organizeImports"
  | "source.fixAll.eslint"
  | "source.fixAll.ts"
  | "source.removeUnused"
  | "source.addMissingImports"
  | "source.sortImports";

/** Default kinds to apply (order matters — fixAll first) */
export const DEFAULT_AUTOFIX_KINDS: AutoFixKind[] = [
  "source.fixAll",
  "source.organizeImports",
];

/** Result of an auto-fix operation */
export interface AutoFixResult {
  /** Whether any fixes were applied */
  applied: boolean;
  /** Total number of code actions that were applied */
  actionsApplied: number;
  /** Descriptions of applied actions */
  actionDescriptions: string[];
  /** Kinds that had no available actions */
  kindsWithNoActions: string[];
  /** Errors encountered (non-fatal) */
  errors: string[];
}

/** Options for auto-fix */
export interface AutoFixOptions {
  /** Which code action kinds to apply. Defaults to fixAll + organizeImports */
  kinds?: AutoFixKind[];
  /** How many actions to pre-resolve. Default: 50 */
  resolveCount?: number;
  /** Delay in ms before requesting code actions (for lang server). Default: 300 */
  delayMs?: number;
}

/**
 * Apply auto-fix code actions to a file.
 *
 * Programmatically invokes `vscode.executeCodeActionProvider` for each
 * requested kind, then applies the returned WorkspaceEdits — the same
 * mechanism VS Code uses for `editor.codeActionsOnSave`.
 *
 * @param uri - File URI to fix
 * @param options - Configuration options
 * @returns Summary of what was applied
 */
export async function applyAutoFixes(
  uri: vscode.Uri,
  options: AutoFixOptions = {},
): Promise<AutoFixResult> {
  const kinds = options.kinds ?? DEFAULT_AUTOFIX_KINDS;
  const resolveCount = options.resolveCount ?? 50;
  const delayMs = options.delayMs ?? 300;

  const result: AutoFixResult = {
    applied: false,
    actionsApplied: 0,
    actionDescriptions: [],
    kindsWithNoActions: [],
    errors: [],
  };

  // Wait for language server to be ready
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  for (const kind of kinds) {
    try {
      // Open document to get full range
      const doc = await vscode.workspace.openTextDocument(uri);
      const fullRange = new vscode.Range(
        doc.positionAt(0),
        doc.positionAt(doc.getText().length),
      );

      // Request code actions from all providers
      const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
        "vscode.executeCodeActionProvider",
        uri,
        fullRange,
        kind,
        resolveCount,
      );

      if (!actions || actions.length === 0) {
        result.kindsWithNoActions.push(kind);
        continue;
      }

      // Apply each action
      for (const action of actions) {
        try {
          if (action.edit) {
            const applied = await vscode.workspace.applyEdit(action.edit);
            if (applied) {
              result.actionsApplied++;
              result.actionDescriptions.push(`[${kind}] ${action.title}`);
            }
          }
          if (action.command) {
            await vscode.commands.executeCommand(
              action.command.command,
              ...(action.command.arguments ?? []),
            );
          }
        } catch (actionError) {
          const msg =
            actionError instanceof Error
              ? actionError.message
              : String(actionError);
          result.errors.push(`Failed to apply "${action.title}": ${msg}`);
        }
      }
    } catch (kindError) {
      const msg =
        kindError instanceof Error ? kindError.message : String(kindError);
      result.errors.push(`Failed to get actions for ${kind}: ${msg}`);
    }
  }

  result.applied = result.actionsApplied > 0;
  return result;
}

/**
 * Format auto-fix result as human-readable summary.
 */
export function formatAutoFixSummary(result: AutoFixResult): string | null {
  if (!result.applied && result.errors.length === 0) {
    return null; // Nothing to report
  }

  const parts: string[] = [];

  if (result.applied) {
    parts.push(`🔧 Auto-fix: ${result.actionsApplied} action(s) applied:`);
    for (const desc of result.actionDescriptions) {
      parts.push(`  • ${desc}`);
    }
  }

  if (result.errors.length > 0) {
    parts.push(`⚠️ Auto-fix errors:`);
    for (const err of result.errors) {
      parts.push(`  • ${err}`);
    }
  }

  return parts.join("\n");
}
```

### 4.3 New Tool: `auto_fix_file` (in `tools/coding/`) — Direct Agent Invocation

A **standalone agent tool** that agents can call directly to apply auto-fixes to any file. This is the primary entry point for agents who want explicit control over when fixes are applied, without coupling it to a specific edit operation.

**File**: `extension/src/agents/tools/coding/autoFixFile.ts`

```typescript
/**
 * autoFixFile tool — Apply VS Code auto-fixes (source.fixAll, organizeImports, etc.)
 *
 * Standalone tool for direct agent invocation. Agents use this to:
 * - Fix lint/compile errors after a series of edits
 * - Organize imports after adding new dependencies
 * - Clean up a file before committing
 * - Apply auto-fixes to files they didn't just edit
 */

import * as vscode from "vscode";

import type { AgentTool, ToolInvocationContext, ToolResult } from "../types.js";
import {
  applyAutoFixes,
  formatAutoFixSummary,
  type AutoFixKind,
} from "../utils/autofix.js";
import {
  formatDiagnosticsSummary,
  getDiagnosticsForFile,
} from "../utils/diagnostics.js";
import { validatePath } from "../utils/pathValidation.js";
import { errorResult, successResult } from "../utils/resultBuilder.js";
import { ToolErrorCode } from "../errors.js";

interface AutoFixFileInput {
  /** File path relative to workspace root */
  path: string;
  /** Code action kinds to apply. Defaults to ["source.fixAll", "source.organizeImports"] */
  kinds?: string[];
  /** If true, report remaining diagnostics after fix. Default: true */
  reportDiagnostics?: boolean;
}

const TOOL_NAME = "auto_fix_file";

export const autoFixFileTool: AgentTool<AutoFixFileInput> = {
  name: TOOL_NAME,
  description:
    "Apply automatic code fixes to a file using VS Code's code action providers " +
    "(same mechanism as editor.codeActionsOnSave). Applies source.fixAll and " +
    "source.organizeImports by default. Use after editing files to auto-fix " +
    "lint errors, organize imports, remove unused imports, etc.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path relative to workspace root",
      },
      kinds: {
        type: "string", // JSON array in practice; agents pass arrays
        description:
          'Code action kinds to apply, e.g. ["source.fixAll", "source.organizeImports"]. ' +
          "Defaults to both. Other options: source.fixAll.eslint, source.fixAll.ts, " +
          "source.removeUnused, source.addMissingImports, source.sortImports",
      },
      reportDiagnostics: {
        type: "boolean",
        description:
          "If true (default), report remaining diagnostics after fixes are applied.",
        default: true,
      },
    },
    required: ["path"],
  },
  invoke: async (
    input: AutoFixFileInput,
    context: ToolInvocationContext,
  ): Promise<ToolResult> => {
    const callId = crypto.randomUUID();
    context.observer?.onProgress?.(callId, `Auto-fixing: ${input.path}`);

    // Validate path
    const validatedPath = await validatePath(input.path, context.workspaceRoot);
    if (!validatedPath.isValid) {
      return {
        success: false,
        content: [{ type: "error", value: validatedPath.error.message }],
        error: validatedPath.error,
        metadata: { toolName: TOOL_NAME, callId: "", durationMs: 0 },
      };
    }

    const uri = vscode.Uri.file(validatedPath.absolutePath);

    // Parse kinds if provided
    const kinds = input.kinds as AutoFixKind[] | undefined;

    // Apply auto-fixes
    const fixResult = await applyAutoFixes(uri, { kinds });
    const fixSummary = formatAutoFixSummary(fixResult);

    // Optionally check remaining diagnostics
    const reportDiagnostics = input.reportDiagnostics !== false;
    let diagSummary: string | null = null;
    if (reportDiagnostics) {
      const diagResult = await getDiagnosticsForFile(uri, 300);
      diagSummary = formatDiagnosticsSummary(diagResult);
    }

    // Build result message
    const contentParts: { type: "text"; value: string }[] = [];

    if (fixResult.applied) {
      contentParts.push({
        type: "text",
        value: `Auto-fixed ${input.path}: ${fixResult.actionsApplied} action(s) applied.`,
      });
    } else {
      contentParts.push({
        type: "text",
        value: `No auto-fixes available for ${input.path}.`,
      });
    }

    if (fixSummary) {
      contentParts.push({ type: "text", value: fixSummary });
    }

    if (diagSummary) {
      contentParts.push({ type: "text", value: diagSummary });
    } else if (reportDiagnostics) {
      contentParts.push({
        type: "text",
        value: "✅ No remaining diagnostics after auto-fix.",
      });
    }

    // Track as file operation if changes were made
    if (fixResult.applied) {
      context.observer?.onFileOperation?.(callId, {
        operation: "update",
        path: input.path,
        linesChanged: 0, // unknown exact count
      });
    }

    return {
      success: true,
      content: contentParts,
      metadata: { toolName: TOOL_NAME, callId, durationMs: 0 },
    };
  },
};
```

### 4.4 `autofix` Option on Every File-Mutating Tool

Every tool that creates or modifies file content gets an `autofix?: boolean` input option. When set to `true`, the tool calls `applyAutoFixes(uri)` after its primary operation succeeds, **before** any `validate` diagnostics check. This ensures diagnostics reflect the post-fix state.

The pattern is identical across all tools:

1. **Add `autofix?: boolean` to the input interface / Zod schema**
2. **Add `autofix` to `inputSchema.properties`** in the tool definition
3. **Import `applyAutoFixes` and `formatAutoFixSummary`** from `../utils/autofix.js`
4. **After successful file mutation, before diagnostics**, insert the autofix block
5. **Append autofix summary to result content** if fixes were applied

#### Standard autofix block (inserted after successful edit, before diagnostics):

```typescript
import {
  applyAutoFixes,
  formatAutoFixSummary,
  type AutoFixResult,
} from "../utils/autofix.js";

// ... after the edit/create is applied successfully ...

// Auto-fix if requested (runs BEFORE validate diagnostics)
let autoFixResult: AutoFixResult | undefined;
let autoFixSummary: string | null = null;

if (input.autofix) {
  autoFixResult = await applyAutoFixes(uri);
  autoFixSummary = formatAutoFixSummary(autoFixResult);
}

// ... then do validate diagnostics if input.validate is true ...
// ... then build result, appending autoFixSummary to content ...
```

#### Standard inputSchema property (added to every tool):

```typescript
autofix: {
  type: "boolean",
  description:
    "If true, apply auto-fixes after the operation (organize imports, fix lint " +
    "errors, etc.) using VS Code's code action providers. Adds ~300ms delay.",
  default: false,
},
```

#### Per-tool specifics:

##### 4.4.1 `edit_file` (`editFile.ts`)

- **Input type**: Local `interface EditFileInput` — add `autofix?: boolean`
- **Insert point**: After `const applied = await vscode.workspace.applyEdit(edit)` succeeds, before the existing `if (input.validate)` block
- **inputSchema**: Add `autofix` property alongside existing `validate`

##### 4.4.2 `create_file` (`createFile.ts`)

- **Input type**: Local `interface CreateFileInput` — add `autofix?: boolean`
- **Insert point**: After file is written and document is created, before building the success result
- **inputSchema**: Add `autofix` property
- **Note**: Needs new import for `applyAutoFixes`, `formatAutoFixSummary`, and `vscode.Uri`

##### 4.4.3 `smart_replace` (`smartReplace.ts`)

- **Input type**: Zod schema `SmartReplaceInputSchema` in `types.ts` — add `autofix: z.boolean().optional()`
- **Insert point**: After the replacement `WorkspaceEdit` is applied, before the existing `if (input.validate)` block
- **inputSchema**: Add `autofix` property alongside existing `validate`

##### 4.4.4 `smart_replaces` (`smartReplaces.ts`)

- **Input type**: Local `interface SmartReplacesInput` — add `autofix?: boolean`
- **Insert point**: After all replacements are applied across all files. Since this tool operates on multiple files, autofix runs on **each unique file** that was modified.
- **inputSchema**: Add `autofix` property alongside existing `validate`
- **Special consideration**: Collect unique file URIs from successful replacements, then run `applyAutoFixes()` on each

```typescript
// After all replacements applied
if (input.autofix) {
  const uniqueUris = new Map<string, vscode.Uri>();
  for (const result of successfulResults) {
    const absPath = path.resolve(context.workspaceRoot, result.file_path);
    uniqueUris.set(absPath, vscode.Uri.file(absPath));
  }
  for (const [, fileUri] of uniqueUris) {
    await applyAutoFixes(fileUri);
  }
}
```

##### 4.4.5 `edit_lines` (`editLines.ts`)

- **Input type**: Zod schema `EditLinesInputSchema` in `types.ts` — add `autofix: z.boolean().optional()`
- **Insert point**: After the line replacement edit is applied, before the existing `if (input.validate)` block
- **inputSchema**: Add `autofix` property alongside existing `validate`

##### 4.4.6 `insert_at_line` (`insertAtLine.ts`)

- **Input type**: Zod schema `InsertAtLineInputSchema` in `types.ts` — add `autofix: z.boolean().optional()`
- **Insert point**: After the insertion edit is applied, before building the success result
- **inputSchema**: Add `autofix` property
- **Note**: Needs new imports for `applyAutoFixes`, `formatAutoFixSummary`

##### 4.4.7 `delete_section` (`deleteSection.ts`)

- **Input type**: Zod schema `DeleteSectionInputSchema` in `types.ts` — add `autofix: z.boolean().optional()`
- **Insert point**: After the deletion edit is applied, before building the success result
- **inputSchema**: Add `autofix` property
- **Note**: Needs new imports for `applyAutoFixes`, `formatAutoFixSummary`
- **Use case**: Deleting code may leave orphaned imports — autofix cleans them up

##### 4.4.8 `bulk_replace` (`bulkReplace.ts`)

- **Input type**: Local `interface BulkReplaceInput` — add `autofix?: boolean`
- **Insert point**: After all file replacements are applied (and `preview_only` is false), before building the success result
- **inputSchema**: Add `autofix` property
- **Special consideration**: Multi-file tool. Autofix runs on **each modified file**.

```typescript
// After all replacements applied (when not preview_only)
if (input.autofix && !input.preview_only) {
  for (const change of fileChanges) {
    const absPath = path.resolve(context.workspaceRoot, change.file_path);
    await applyAutoFixes(vscode.Uri.file(absPath));
  }
}
```

### 4.5 Zod Schema Changes in `types.ts`

The following Zod schemas in `extension/src/agents/tools/types.ts` need an `autofix` field added:

```typescript
// SmartReplaceInputSchema — add after validate field:
autofix: z.boolean().optional(),

// EditLinesInputSchema — add after validate field:
autofix: z.boolean().optional(),

// InsertAtLineInputSchema — add after dry_run field:
autofix: z.boolean().optional(),

// DeleteSectionInputSchema — add after dry_run field:
autofix: z.boolean().optional(),
```

The JSDoc for each type should also be updated to document the new field.

### 4.6 Changes to `coding/index.ts`

Register the new standalone tool:

```typescript
import { autoFixFileTool } from "./autoFixFile.js";

export const codingTools = [
  // ... existing tools ...
  autoFixFileTool,
] as const;

export {
  // ... existing exports ...
  autoFixFileTool,
};
```

### 4.7 Optional: Pipeline-Level Integration in AgentRunner (Phase 2)

For a more seamless experience, auto-fix could be applied automatically after ANY file-mutating tool call, controlled by agent configuration. This would be in `AgentRunner.executeToolCalls()`:

```typescript
// After executing a tool that mutated files:
if (
  toolResult.success &&
  fileOperations.length > 0 &&
  agentConfig.autoFixOnEdit
) {
  for (const op of fileOperations) {
    if (op.operation === "create" || op.operation === "update") {
      await applyAutoFixes(
        vscode.Uri.file(path.resolve(workspaceRoot, op.path)),
      );
    }
  }
}
```

This is a higher-risk change and could be a Phase 2 enhancement. It removes the need for agents to pass `autofix: true` on every call — the orchestrator config would control it globally.

---

## 5. File Change Summary

### New Files

| File                                               | Purpose                                                           |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| `extension/src/agents/tools/utils/autofix.ts`      | Core utility: `applyAutoFixes()`, `formatAutoFixSummary()`, types |
| `extension/src/agents/tools/coding/autoFixFile.ts` | Standalone agent tool: `auto_fix_file` for direct invocation      |

### Modified Files — Tool Implementations (add `autofix` option)

| File                                                 | Tool Name        | Current `validate` | Change                                                              |
| ---------------------------------------------------- | ---------------- | :----------------: | ------------------------------------------------------------------- |
| `extension/src/agents/tools/coding/editFile.ts`      | `edit_file`      |      ✅ local      | Add `autofix?: boolean` to interface + schema + invoke              |
| `extension/src/agents/tools/coding/createFile.ts`    | `create_file`    |         ❌         | Add `autofix?: boolean` to interface + schema + invoke; add imports |
| `extension/src/agents/tools/coding/smartReplace.ts`  | `smart_replace`  |       ✅ Zod       | Add autofix invoke block; add imports (schema change in `types.ts`) |
| `extension/src/agents/tools/coding/smartReplaces.ts` | `smart_replaces` |      ✅ local      | Add `autofix?: boolean` to interface + schema + invoke (multi-file) |
| `extension/src/agents/tools/coding/editLines.ts`     | `edit_lines`     |       ✅ Zod       | Add autofix invoke block; add imports (schema change in `types.ts`) |
| `extension/src/agents/tools/coding/insertAtLine.ts`  | `insert_at_line` |         ❌         | Add autofix invoke block; add imports (schema change in `types.ts`) |
| `extension/src/agents/tools/coding/deleteSection.ts` | `delete_section` |         ❌         | Add autofix invoke block; add imports (schema change in `types.ts`) |
| `extension/src/agents/tools/coding/bulkReplace.ts`   | `bulk_replace`   |         ❌         | Add `autofix?: boolean` to interface + schema + invoke (multi-file) |

### Modified Files — Type Definitions

| File                                  | Change                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extension/src/agents/tools/types.ts` | Add `autofix: z.boolean().optional()` to `SmartReplaceInputSchema`, `EditLinesInputSchema`, `InsertAtLineInputSchema`, `DeleteSectionInputSchema` |

### Modified Files — Registration

| File                                         | Change                                |
| -------------------------------------------- | ------------------------------------- |
| `extension/src/agents/tools/coding/index.ts` | Import and register `autoFixFileTool` |

### Optional Future Files

| File                                                     | Change                                                 |
| -------------------------------------------------------- | ------------------------------------------------------ |
| `extension/src/agents/AgentRunner.ts`                    | Pipeline-level auto-fix after file mutations (Phase 2) |
| `extension/test/agents/tools/utils/autofix.test.ts`      | Unit tests                                             |
| `extension/test/agents/tools/coding/autoFixFile.test.ts` | Integration tests                                      |

---

## 6. API Risks and Mitigations

### Risk: `vscode.executeCodeActionProvider` returns no actions

**Cause**: Language server not ready, no provider registered for the kind, no fixable issues.  
**Mitigation**: The delay before requesting (default 300ms) gives the lang server time. Track `kindsWithNoActions` in result for transparency. This is not an error — just report "no fixes available."

### Risk: Actions have unresolved `.edit` (undefined)

**Cause**: `itemResolveCount` too low or provider doesn't support lazy resolution.  
**Mitigation**: Default `resolveCount: 50`. Always check `if (action.edit)` before applying.

### Risk: Applying one action invalidates another's ranges

**Cause**: Multiple actions for the same kind may conflict after document changes.  
**Mitigation**: For `source.fixAll`, providers typically return a single action with a comprehensive `WorkspaceEdit`. For `source.organizeImports`, same. Process kinds sequentially (fixAll first, then organizeImports). If needed, re-query after each kind.

### Risk: Infinite loop — fixes create new issues that need fixing

**Cause**: Unlikely but theoretically possible with conflicting providers.  
**Mitigation**: Single pass only. No re-application. If there are remaining issues, they'll show in diagnostics.

### Risk: Agent misuses the tool or applies unwanted fixes

**Mitigation**: Tool is opt-in (explicit `autofix: true` flag or explicit `auto_fix_file` call). Default behavior of existing tools is unchanged.

### Risk: Performance impact from delay + code action resolution

**Mitigation**: 300ms delay is much less than the 500ms diagnostic delay. Code action resolution is fast (typically <100ms). Total overhead: ~400-500ms per invocation — acceptable for file edits.

---

## 7. Testing Strategy

### Unit Tests (`autofix.ts`)

These need to mock `vscode.commands.executeCommand` and `vscode.workspace.applyEdit`:

```typescript
describe("applyAutoFixes", () => {
  it("should return applied=false when no actions available", ...);
  it("should apply WorkspaceEdit from returned actions", ...);
  it("should execute action.command after applying edit", ...);
  it("should handle errors in individual actions gracefully", ...);
  it("should process multiple kinds in order", ...);
  it("should respect custom kinds option", ...);
  it("should respect custom delayMs option", ...);
});

describe("formatAutoFixSummary", () => {
  it("should return null when nothing was applied", ...);
  it("should list applied actions", ...);
  it("should include errors if any", ...);
});
```

### Integration Tests (`autoFixFile.ts`)

Harder to test without real language servers. Consider:

- Mock the `vscode.commands.executeCommand` to return pre-built `CodeAction` objects
- Test the tool's path validation, error handling, result formatting
- E2E test in a real VS Code extension host with a TypeScript file

### Manual Verification

1. Create a `.ts` file with unused imports and lint issues via `createFile`
2. Call `auto_fix_file` on it
3. Verify imports are organized and fixable issues resolved
4. Verify diagnostics report clean file

---

## 8. Agent Prompt Guidance

Update agent prompt files (`extension/agents/*.agent.md`) to mention the new capabilities:

```markdown
### Auto-Fix After Edits

All file-mutating tools support `autofix: true` to automatically apply code
fixes (organize imports, fix lint errors, etc.) after the change. This is
equivalent to VS Code's "codeActionsOnSave" behavior.

Tools that support `autofix: true`:

- `edit_file`
- `create_file`
- `smart_replace`
- `smart_replaces`
- `edit_lines`
- `insert_at_line`
- `delete_section`
- `bulk_replace`

For standalone auto-fixing (e.g., after multiple edits, or on files you didn't
just edit), use the `auto_fix_file` tool directly:

- Applies `source.fixAll` and `source.organizeImports` by default
- Reports remaining diagnostics after fixing
- Supports custom code action kinds via the `kinds` parameter

Typical workflow:

1. Make several edits without `autofix` (faster)
2. Call `auto_fix_file` once on the final file
   OR
3. Use `autofix: true` on the final edit to a file
```

---

## 9. Execution Order

1. **Create `utils/autofix.ts`** — the core utility (no dependencies on other changes)
2. **Create `coding/autoFixFile.ts`** — standalone tool (depends on #1)
3. **Update `coding/index.ts`** — register new tool (depends on #2)
4. **Update `types.ts`** — add `autofix` to Zod schemas for `SmartReplaceInput`, `EditLinesInput`, `InsertAtLineInput`, `DeleteSectionInput` (depends on #1)
5. **Update `coding/editFile.ts`** — add `autofix` option (depends on #1)
6. **Update `coding/createFile.ts`** — add `autofix` option (depends on #1)
7. **Update `coding/smartReplace.ts`** — add `autofix` invoke block (depends on #1, #4)
8. **Update `coding/smartReplaces.ts`** — add `autofix` option with multi-file support (depends on #1)
9. **Update `coding/editLines.ts`** — add `autofix` invoke block (depends on #1, #4)
10. **Update `coding/insertAtLine.ts`** — add `autofix` invoke block + imports (depends on #1, #4)
11. **Update `coding/deleteSection.ts`** — add `autofix` invoke block + imports (depends on #1, #4)
12. **Update `coding/bulkReplace.ts`** — add `autofix` option with multi-file support (depends on #1)
13. **Verify compilation** — `npm run typecheck` in extension/
14. **Write tests** — matching existing test patterns
15. **Update agent prompts** — document capability for agents
