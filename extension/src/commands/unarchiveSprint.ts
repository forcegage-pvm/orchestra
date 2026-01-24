import * as vscode from "vscode";
import { unarchiveSprint } from "../database/mutations.js";
import type { DatabaseWatcher } from "../database/watcher.js";
import type { SprintTreeProvider } from "../views/treeview/SprintTreeProvider.js";

export async function handleUnarchiveSprint(
  workspaceRoot: string,
  sprintId: string,
  treeProvider: SprintTreeProvider,
  watcher?: DatabaseWatcher,
): Promise<void> {
  try {
    const result = unarchiveSprint(workspaceRoot, sprintId, watcher);
    treeProvider.refresh();
    vscode.window.showInformationMessage(
      `Orchestra: "${result.sprintName}" unarchived.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to unarchive sprint - ${message}`,
    );
  }
}
