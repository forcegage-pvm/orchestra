/**
 * Code Review TreeView Provider
 *
 * Implements TreeDataProvider for Code Review panel showing:
 * - Status snapshot (review counts by status)
 * - Gate mode (ad_hoc, task_gate, phase_gate)
 * - Action buttons (run ad-hoc review, fix issues)
 */

import * as vscode from "vscode";
import {
  getCodeReviewSummary,
  getCompletedUnreviewedTasks,
  type CodeReviewSummary,
} from "../../database/queries.js";
import type { DatabaseWatcher } from "../../database/watcher.js";

/**
 * Tree item types for hierarchy
 */
type TreeElement = vscode.TreeItem;

export class CodeReviewTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TreeElement | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _summary: CodeReviewSummary | null = null;
  private _unreviewedCount: number = 0;

  constructor(
    private readonly _workspaceRoot: string,
    private readonly _dbWatcher: DatabaseWatcher,
  ) {
    // Subscribe to database changes
    this._dbWatcher.onDidChange(() => this.refresh());

    // Load initial data
    this._loadData();
  }

  private _loadData(): void {
    this._summary = getCodeReviewSummary(this._workspaceRoot);
    const unreviewedTasks = getCompletedUnreviewedTasks(this._workspaceRoot);
    this._unreviewedCount = unreviewedTasks.length;
  }

  refresh(): void {
    this._loadData();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeElement): TreeElement[] {
    if (!element) {
      // Root level - return main sections
      return this._getRootItems();
    }

    // Check if this is the Actions item
    if (element.contextValue === "actions") {
      return this._getActionItems();
    }

    return [];
  }

  private _getRootItems(): TreeElement[] {
    const items: TreeElement[] = [];

    if (!this._summary) {
      this._summary = getCodeReviewSummary(this._workspaceRoot);
    }

    // Status Snapshot section
    const statusItem = new vscode.TreeItem(
      "Status Snapshot",
      vscode.TreeItemCollapsibleState.Expanded,
    );
    statusItem.iconPath = new vscode.ThemeIcon("dashboard");
    items.push(statusItem);

    // Total reviews
    const totalItem = new vscode.TreeItem(
      `${this._summary.totalReviews} reviews`,
      vscode.TreeItemCollapsibleState.None,
    );
    totalItem.iconPath = new vscode.ThemeIcon("list-unordered");
    items.push(totalItem);

    // Status counts
    const pendingItem = new vscode.TreeItem(
      `Pending: ${this._summary.byStatus.PENDING}`,
      vscode.TreeItemCollapsibleState.None,
    );
    pendingItem.iconPath = new vscode.ThemeIcon("clock");
    items.push(pendingItem);

    const approvedItem = new vscode.TreeItem(
      `Approved: ${this._summary.byStatus.APPROVED}`,
      vscode.TreeItemCollapsibleState.None,
    );
    approvedItem.iconPath = new vscode.ThemeIcon("check");
    items.push(approvedItem);

    const needsRevisionItem = new vscode.TreeItem(
      `Needs Revision: ${this._summary.byStatus.NEEDS_REVISION}`,
      vscode.TreeItemCollapsibleState.None,
    );
    needsRevisionItem.iconPath = new vscode.ThemeIcon("warning");
    items.push(needsRevisionItem);

    const rejectedItem = new vscode.TreeItem(
      `Rejected: ${this._summary.byStatus.REJECTED}`,
      vscode.TreeItemCollapsibleState.None,
    );
    rejectedItem.iconPath = new vscode.ThemeIcon("error");
    items.push(rejectedItem);

    // Open issues
    const issuesItem = new vscode.TreeItem(
      `${this._summary.openIssuesCount} open issues`,
      vscode.TreeItemCollapsibleState.None,
    );
    issuesItem.iconPath = new vscode.ThemeIcon("issues");
    items.push(issuesItem);

    // Blocking severity
    const severityItem = new vscode.TreeItem(
      `Blocking Severity: ${this._summary.blockingSeverity}`,
      vscode.TreeItemCollapsibleState.None,
    );
    severityItem.iconPath = new vscode.ThemeIcon("shield");
    items.push(severityItem);

    // Gate Mode section
    const gateModeItem = new vscode.TreeItem(
      "Gate Mode",
      vscode.TreeItemCollapsibleState.None,
    );
    gateModeItem.description = this._summary.policy;
    gateModeItem.iconPath = new vscode.ThemeIcon("lock");
    items.push(gateModeItem);

    // Actions section
    const actionsItem = new vscode.TreeItem(
      "Actions",
      vscode.TreeItemCollapsibleState.Expanded,
    );
    actionsItem.iconPath = new vscode.ThemeIcon("symbol-event");
    actionsItem.contextValue = "actions";
    items.push(actionsItem);

    return items;
  }

  private _getActionItems(): TreeElement[] {
    const items: TreeElement[] = [];

    // Open Code Review Summary
    const openSummaryItem = new vscode.TreeItem(
      "Open Code Review Summary",
      vscode.TreeItemCollapsibleState.None,
    );
    openSummaryItem.iconPath = new vscode.ThemeIcon("list-unordered");
    openSummaryItem.command = {
      command: "orchestra.openCodeReviewSummary",
      title: "Open Code Review Summary",
    };
    items.push(openSummaryItem);

    // Run ad-hoc review now
    const runReviewItem = new vscode.TreeItem(
      "Run ad-hoc review now",
      vscode.TreeItemCollapsibleState.None,
    );
    runReviewItem.iconPath = new vscode.ThemeIcon("play");
    runReviewItem.command = {
      command: "orchestra.runAdHocReview",
      title: "Run ad-hoc review now",
    };

    // Disable if no pending reviews AND no unreviewed tasks
    const hasPendingReviews =
      this._summary && this._summary.byStatus.PENDING > 0;
    if (this._unreviewedCount === 0 && !hasPendingReviews) {
      runReviewItem.description = "(no pending reviews)";
      runReviewItem.command = undefined;
      runReviewItem.iconPath = new vscode.ThemeIcon("debug-pause");
    } else if (this._unreviewedCount === 0 && hasPendingReviews) {
      // Has pending reviews but no unreviewed tasks - still allow running
      runReviewItem.description = `(${this._summary!.byStatus.PENDING} pending)`;
    }

    items.push(runReviewItem);

    // Fix code review issues
    const fixIssuesItem = new vscode.TreeItem(
      "Fix code review issues",
      vscode.TreeItemCollapsibleState.None,
    );
    fixIssuesItem.iconPath = new vscode.ThemeIcon("tools");
    fixIssuesItem.command = {
      command: "orchestra.fixCodeReviewIssues",
      title: "Fix code review issues",
    };

    // Disable if no open issues
    if (!this._summary || this._summary.openIssuesCount === 0) {
      fixIssuesItem.description = "(no open issues)";
      fixIssuesItem.command = undefined;
      fixIssuesItem.iconPath = new vscode.ThemeIcon("pass");
    }

    items.push(fixIssuesItem);

    return items;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
