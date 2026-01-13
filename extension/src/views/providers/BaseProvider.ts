/**
 * Base TreeDataProvider with Reactive Updates
 *
 * Abstract base class for all TreeDataProviders in the extension.
 * Subscribes to DatabaseWatcher and automatically refreshes views when
 * the database changes.
 *
 * Subclasses must implement:
 * - refresh(): Reload data and fire onDidChangeTreeData
 * - getTreeItem(): Return TreeItem for an element
 * - getChildren(): Return children for an element
 */

import type Database from "better-sqlite3";
import * as vscode from "vscode";
import type { DatabaseWatcher } from "../../database/watcher.js";

export abstract class BaseProvider<T>
  implements vscode.TreeDataProvider<T>, vscode.Disposable
{
  protected readonly _onDidChangeTreeData = new vscode.EventEmitter<
    T | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly dbSubscription: vscode.Disposable;

  constructor(
    protected readonly db: Database.Database,
    protected readonly dbWatcher: DatabaseWatcher
  ) {
    // Subscribe to database changes and trigger refresh
    this.dbSubscription = this.dbWatcher.onDidChange(() => this.refresh());
  }

  /**
   * Refresh the tree view.
   * Subclasses should override to invalidate caches, then call super.refresh()
   * or fire _onDidChangeTreeData directly.
   */
  abstract refresh(): void;

  /**
   * Get TreeItem representation for an element.
   * Required by TreeDataProvider interface.
   */
  abstract getTreeItem(element: T): vscode.TreeItem | Thenable<vscode.TreeItem>;

  /**
   * Get children for an element.
   * Required by TreeDataProvider interface.
   */
  abstract getChildren(element?: T): vscode.ProviderResult<T[]>;

  /**
   * Dispose and cleanup subscriptions.
   */
  dispose(): void {
    this.dbSubscription.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
