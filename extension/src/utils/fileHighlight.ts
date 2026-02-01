/**
 * File Highlight Utility
 *
 * Applies temporary visual highlights to line ranges in VS Code editors.
 * Used when opening files to draw attention to modified lines.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 5.1
 */

import * as vscode from "vscode";

/**
 * Highlight a range of lines in the editor with a temporary visual decoration.
 *
 * Creates a visible highlight using VS Code's decoration API, then automatically
 * removes it after 2 seconds to avoid visual clutter.
 *
 * @param editor - The text editor to apply the highlight to
 * @param line - The starting line number (1-based)
 * @param endLine - The ending line number (1-based). Defaults to line if not provided.
 * @returns A disposable to manually cancel the highlight early, or undefined if editor is invalid
 *
 * @example
 * ```typescript
 * const editor = await vscode.window.showTextDocument(document);
 * highlightRange(editor, 10, 15); // Highlights lines 10-15 for 2 seconds
 * ```
 */
export function highlightRange(
  editor: vscode.TextEditor | undefined,
  line: number,
  endLine?: number,
): vscode.Disposable | undefined {
  if (!editor) {
    return undefined;
  }

  // Calculate 0-based range
  const startLine = Math.max(0, line - 1);
  const finalLine = Math.max(0, (endLine ?? line) - 1);
  const range = new vscode.Range(
    new vscode.Position(startLine, 0),
    new vscode.Position(finalLine, Number.MAX_SAFE_INTEGER),
  );

  // Create decoration type with visible highlight
  const decorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(255, 200, 0, 0.15)", // Yellow highlight with transparency
    isWholeLine: true,
    overviewRulerColor: "rgba(255, 200, 0, 0.5)",
    overviewRulerLane: vscode.OverviewRulerLane.Full,
  });

  // Apply decoration
  editor.setDecorations(decorationType, [range]);

  // Auto-dispose after 2 seconds
  const timeout = setTimeout(() => {
    decorationType.dispose();
  }, 2000);

  // Return disposable to allow early cancellation
  return {
    dispose: () => {
      clearTimeout(timeout);
      decorationType.dispose();
    },
  };
}
