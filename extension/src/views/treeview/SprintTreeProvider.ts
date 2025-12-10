/**
 * Sprint TreeView Provider (Stub)
 *
 * Implements TreeDataProvider for Sprint → Phase → Task hierarchy.
 * Full implementation in Task 14.
 */

import type Database from "better-sqlite3";
import * as vscode from "vscode";
import type { DatabaseWatcher } from "../../database/watcher.js";

export class SprintTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private readonly _db: Database.Database,
    private readonly _dbWatcher: DatabaseWatcher
  ) {
    void this._db; // Reserved for Task 14 implementation

    // Subscribe to database changes
    this._dbWatcher.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(_element?: vscode.TreeItem): vscode.TreeItem[] {
    void _element; // Reserved for Task 14 implementation
    // Stub: Return empty array (implemented in Task 14)
    return [];
  }
}
