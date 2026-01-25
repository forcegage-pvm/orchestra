import * as vscode from "vscode";
import type { SprintFilter } from "../database/queries.js";
import type { SprintTreeProvider } from "../views/treeview/SprintTreeProvider.js";

interface SprintFilterQuickPickItem extends vscode.QuickPickItem {
  value: SprintFilter;
}

export async function handleFilterSprints(
  treeProvider: SprintTreeProvider,
): Promise<void> {
  const options: SprintFilterQuickPickItem[] = [
    {
      label: "Active Sprints",
      description: "Show non-archived sprints",
      value: "active",
    },
    {
      label: "Archived Sprints",
      description: "Show archived sprints only",
      value: "archived",
    },
    {
      label: "All Sprints",
      description: "Show all sprints",
      value: "all",
    },
  ];

  const selection = await vscode.window.showQuickPick(options, {
    placeHolder: "Select sprint filter",
  });

  if (!selection) {
    return;
  }

  treeProvider.setFilter(selection.value);
}
