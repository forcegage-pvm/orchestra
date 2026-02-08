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
 * Default delay in milliseconds before requesting code actions.
 * Gives language servers time to process file changes.
 */
export const DEFAULT_AUTOFIX_DELAY_MS = 300;

/**
 * Default number of code actions to pre-resolve.
 * Ensures .edit is populated on returned actions.
 */
export const DEFAULT_RESOLVE_COUNT = 50;

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
 *
 * @example
 * ```typescript
 * const uri = vscode.Uri.file("/path/to/file.ts");
 * const result = await applyAutoFixes(uri);
 * if (result.applied) {
 *   console.log(`Applied ${result.actionsApplied} fixes`);
 * }
 * ```
 */
export async function applyAutoFixes(
  uri: vscode.Uri,
  options: AutoFixOptions = {},
): Promise<AutoFixResult> {
  const kinds = options.kinds ?? DEFAULT_AUTOFIX_KINDS;
  const resolveCount = options.resolveCount ?? DEFAULT_RESOLVE_COUNT;
  const delayMs = options.delayMs ?? DEFAULT_AUTOFIX_DELAY_MS;

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
      const actions =
        await vscode.commands.executeCommand<vscode.CodeAction[]>(
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
 * Format auto-fix result as human-readable summary for inclusion in tool output.
 *
 * @param result - The auto-fix result to format
 * @returns A formatted string summary, or null if nothing to report
 *
 * @example
 * ```typescript
 * const result = await applyAutoFixes(uri);
 * const summary = formatAutoFixSummary(result);
 * // "🔧 Auto-fix: 2 action(s) applied:\n  • [source.fixAll] Fix all auto-fixable problems"
 * ```
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
