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
  getCompletedTasksWithApprovedReviews,
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
  private _approvedCompleteCount: number = 0;

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
    const approvedCompletedTasks = getCompletedTasksWithApprovedReviews(
      this._workspaceRoot,
    );
    this._approvedCompleteCount = approvedCompletedTasks.length;
  }

  private _getStatusCount(status: string): number {
    const statusCounts =
      (this._summary?.byStatus as Record<string, number> | undefined) ?? {};
    return statusCounts[status] ?? 0;
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
      `Pending: ${this._getStatusCount("PENDING")}`,
      vscode.TreeItemCollapsibleState.None,
    );
    pendingItem.iconPath = new vscode.ThemeIcon("clock");
    items.push(pendingItem);

    const approvedItem = new vscode.TreeItem(
      `Approved: ${this._getStatusCount("APPROVED")}`,
      vscode.TreeItemCollapsibleState.None,
    );
    approvedItem.iconPath = new vscode.ThemeIcon("check");
    items.push(approvedItem);

    const needsRevisionItem = new vscode.TreeItem(
      `Needs Revision: ${this._getStatusCount("NEEDS_REVISION")}`,
      vscode.TreeItemCollapsibleState.None,
    );
    needsRevisionItem.iconPath = new vscode.ThemeIcon("warning");
    items.push(needsRevisionItem);

    const rejectedItem = new vscode.TreeItem(
      `Rejected: ${this._getStatusCount("REJECTED")}`,
      vscode.TreeItemCollapsibleState.None,
    );
    rejectedItem.iconPath = new vscode.ThemeIcon("error");
    items.push(rejectedItem);

    const changesRequestedItem = new vscode.TreeItem(
      `Changes Requested: ${this._getStatusCount("CHANGES_REQUESTED")}`,
      vscode.TreeItemCollapsibleState.None,
    );
    changesRequestedItem.iconPath = new vscode.ThemeIcon("request-changes");
    items.push(changesRequestedItem);

    const fixingIssuesItem = new vscode.TreeItem(
      `Fixing Issues: ${this._getStatusCount("FIXING_ISSUES")}`,
      vscode.TreeItemCollapsibleState.None,
    );
    fixingIssuesItem.iconPath = new vscode.ThemeIcon("tools");
    items.push(fixingIssuesItem);

    const pendingVerificationItem = new vscode.TreeItem(
      `Pending Verification: ${this._getStatusCount("PENDING_VERIFICATION")}`,
      vscode.TreeItemCollapsibleState.None,
    );
    pendingVerificationItem.iconPath = new vscode.ThemeIcon("checklist");
    items.push(pendingVerificationItem);

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
    const hasPendingReviews = this._getStatusCount("PENDING") > 0;
    if (this._unreviewedCount === 0 && !hasPendingReviews) {
      runReviewItem.description = "(no pending reviews)";
      delete runReviewItem.command;
      runReviewItem.iconPath = new vscode.ThemeIcon("debug-pause");
    } else if (this._unreviewedCount === 0 && hasPendingReviews) {
      // Has pending reviews but no unreviewed tasks - still allow running
      runReviewItem.description = `(${this._getStatusCount("PENDING")} pending)`;
    }

    items.push(runReviewItem);

    if (this._getStatusCount("CHANGES_REQUESTED") > 0) {
      const fixIssuesItem = new vscode.TreeItem(
        "Fix Issues",
        vscode.TreeItemCollapsibleState.None,
      );
      fixIssuesItem.iconPath = new vscode.ThemeIcon("tools");
      fixIssuesItem.command = {
        command: "orchestra.fixCodeReviewIssues",
        title: "Fix Issues",
      };
      items.push(fixIssuesItem);
    }

    if (this._getStatusCount("FIXING_ISSUES") > 0) {
      const continueFixingItem = new vscode.TreeItem(
        "Continue Fixing",
        vscode.TreeItemCollapsibleState.None,
      );
      continueFixingItem.iconPath = new vscode.ThemeIcon("debug-continue");
      continueFixingItem.command = {
        command: "orchestra.fixCodeReviewIssues",
        title: "Continue Fixing",
      };
      items.push(continueFixingItem);
    }

    if (this._getStatusCount("PENDING_VERIFICATION") > 0) {
      const verifyFixesItem = new vscode.TreeItem(
        "Verify Fixes",
        vscode.TreeItemCollapsibleState.None,
      );
      verifyFixesItem.iconPath = new vscode.ThemeIcon("checklist");
      verifyFixesItem.command = {
        command: "orchestra.verifyCodeReviewFixes",
        title: "Verify Fixes",
      };
      items.push(verifyFixesItem);
    }

    if (this._getStatusCount("REJECTED") > 0) {
      const escalateItem = new vscode.TreeItem(
        "Escalate",
        vscode.TreeItemCollapsibleState.None,
      );
      escalateItem.iconPath = new vscode.ThemeIcon("warning");
      escalateItem.command = {
        command: "orchestra.escalateRejectedReview",
        title: "Escalate",
      };
      items.push(escalateItem);
    }

    if (this._approvedCompleteCount > 0) {
      const reReviewItem = new vscode.TreeItem(
        "Re-review",
        vscode.TreeItemCollapsibleState.None,
      );
      reReviewItem.iconPath = new vscode.ThemeIcon("refresh");
      reReviewItem.command = {
        command: "orchestra.reReviewTask",
        title: "Re-review",
      };
      items.push(reReviewItem);
    }

    return items;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
