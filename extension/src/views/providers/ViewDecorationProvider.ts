/**
 * View Decoration Provider (TD-016)
 *
 * Provides file decorations for tree view items using custom URI scheme.
 * This enables rich styling (colors, badges) on tasks based on status.
 *
 * Pattern based on GitLens viewDecorationProvider.ts
 */

import * as vscode from "vscode";

/**
 * Custom URI scheme for Orchestra view decorations
 */
export const ORCHESTRA_VIEW_SCHEME = "orchestra-view";

/**
 * Task status decoration state
 */
interface TaskStatusDecoration {
  status: string;
  retryCount?: number;
  maxRetries?: number;
  codeReviewStatus?: string;
}

/**
 * Parse decoration state from URI query string
 */
function getDecorationState(uri: vscode.Uri): TaskStatusDecoration | undefined {
  if (uri.scheme !== ORCHESTRA_VIEW_SCHEME) {
    return undefined;
  }

  try {
    const params = new URLSearchParams(uri.query);
    const stateJson = params.get("state");
    if (stateJson) {
      return JSON.parse(stateJson) as TaskStatusDecoration;
    }
  } catch {
    // Invalid state, return undefined
  }

  return undefined;
}

/**
 * Creates a decoration URI for a task with the given status
 */
export function createTaskDecorationUri(
  taskId: number,
  status: string,
  retryCount?: number,
  maxRetries?: number,
  codeReviewStatus?: string,
): vscode.Uri {
  const state: TaskStatusDecoration = { status };
  if (retryCount !== undefined) state.retryCount = retryCount;
  if (maxRetries !== undefined) state.maxRetries = maxRetries;
  if (codeReviewStatus !== undefined) state.codeReviewStatus = codeReviewStatus;

  const query = new URLSearchParams();
  query.set("state", JSON.stringify(state));

  return vscode.Uri.parse(
    `${ORCHESTRA_VIEW_SCHEME}://task/${taskId}?${query.toString()}`,
  );
}

/**
 * Provides file decorations for Orchestra tree view items
 */
export class OrchestraViewDecorationProvider
  implements vscode.FileDecorationProvider
{
  private readonly _onDidChangeFileDecorations = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();

  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  dispose(): void {
    this._onDidChangeFileDecorations.dispose();
  }

  /**
   * Trigger decoration refresh for specific URIs or all
   */
  refresh(uris?: vscode.Uri | vscode.Uri[]): void {
    this._onDidChangeFileDecorations.fire(uris);
  }

  provideFileDecoration(
    uri: vscode.Uri,
    _token: vscode.CancellationToken,
  ): vscode.FileDecoration | undefined {
    const state = getDecorationState(uri);
    if (!state) {
      return undefined;
    }

    return this._getDecorationForStatus(state);
  }

  private _getDecorationForStatus(
    state: TaskStatusDecoration,
  ): vscode.FileDecoration | undefined {
    const codeReviewStatus = state.codeReviewStatus;
    const appendCodeReview = (
      base: vscode.FileDecoration | undefined,
    ): vscode.FileDecoration | undefined => {
      if (!codeReviewStatus) {
        return base;
      }

      const statusText = codeReviewStatus.replace(/_/g, " ");
      const tooltipSuffix = ` | Code Review: ${statusText}`;
      const badge = "CR";

      let color = base?.color;
      if (
        codeReviewStatus === "CHANGES_REQUESTED" ||
        codeReviewStatus === "REJECTED"
      ) {
        color = new vscode.ThemeColor("errorForeground");
      } else if (codeReviewStatus === "PENDING") {
        color = new vscode.ThemeColor("editorWarning.foreground");
      } else if (codeReviewStatus === "APPROVED") {
        color = new vscode.ThemeColor("gitDecoration.addedResourceForeground");
      }

      return {
        ...base,
        badge,
        color,
        tooltip: base?.tooltip
          ? `${base.tooltip}${tooltipSuffix}`
          : `Code Review: ${statusText}`,
      };
    };

    // Icons-only design: status is shown via ThemeIcon, not badges.
    // Only color and tooltip are returned to avoid double indicators.
    switch (state.status) {
      case "ESCALATED":
        return appendCodeReview({
          color: new vscode.ThemeColor("errorForeground"),
          tooltip: "Escalated - Requires human supervisor intervention",
        });

      case "VERIFY_FAILED":
        return appendCodeReview({
          color: new vscode.ThemeColor("errorForeground"),
          tooltip: `Verification failed (attempt ${state.retryCount || "?"}/${
            state.maxRetries || "?"
          })`,
        });

      case "GATE_CHECK":
        return appendCodeReview({
          color: new vscode.ThemeColor("editorWarning.foreground"),
          tooltip: "Awaiting verification",
        });

      case "VERIFY":
        return appendCodeReview({
          color: new vscode.ThemeColor("gitDecoration.addedResourceForeground"),
          tooltip: "Verification passed - Ready to complete",
        });

      case "COMPLETE":
        return appendCodeReview({
          color: new vscode.ThemeColor("gitDecoration.addedResourceForeground"),
          tooltip: "Completed",
        });

      case "IMPLEMENT":
        return appendCodeReview({
          color: new vscode.ThemeColor("editorInfo.foreground"),
          tooltip: "In progress",
        });

      case "PENDING":
        return appendCodeReview({
          tooltip: "Not started",
        });

      default:
        return appendCodeReview(undefined);
    }
  }
}
