import * as vscode from "vscode";
import { archiveSprint } from "../database/mutations.js";
import type { DatabaseWatcher } from "../database/watcher.js";
import type { SprintTreeProvider } from "../views/treeview/SprintTreeProvider.js";

export async function handleArchiveSprint(
  workspaceRoot: string,
  sprintId: string,
  treeProvider: SprintTreeProvider,
  watcher?: DatabaseWatcher,
): Promise<void> {
  try {
    const result = archiveSprint(workspaceRoot, sprintId, watcher);
    treeProvider.refresh();
    vscode.window.showInformationMessage(
      `Orchestra: "${result.sprintName}" archived.`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Orchestra: Failed to archive sprint - ${message}`,
    );
  }
}
