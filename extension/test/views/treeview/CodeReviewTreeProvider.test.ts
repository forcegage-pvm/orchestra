/**
 * Tests for CodeReviewTreeProvider
 *
 * Tests for Code Review tree view panel showing sprint-level
 * status snapshot and action buttons.
 *
 * Spec: specs/005-code-review-workflow/spec.md
 * User Story 5: Sprint Code Review Panel (Priority: P1)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { DatabaseWatcher } from "../../../src/database/watcher.js";
import { CodeReviewTreeProvider } from "../../../src/views/treeview/CodeReviewTreeProvider.js";

// Mock vscode module
vi.mock("vscode", () => ({
  TreeItem: vi.fn((label: string) => ({ label })),
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  ThemeIcon: vi.fn((id: string) => ({ id })),
  EventEmitter: vi.fn(() => ({
    event: vi.fn(),
    fire: vi.fn(),
    dispose: vi.fn(),
  })),
  Uri: {
    file: (path: string) => ({ fsPath: path }),
  },
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    })),
  },
}));

// Mock database queries module
vi.mock("../../../src/database/queries.js", () => ({
  getCodeReviewSummary: vi.fn(() => ({
    totalReviews: 0,
    byStatus: {
      PENDING: 0,
      APPROVED: 0,
      NEEDS_REVISION: 0,
      REJECTED: 0,
      CHANGES_REQUESTED: 0,
      FIXING_ISSUES: 0,
      PENDING_VERIFICATION: 0,
      COMPLETE: 0,
    },
    openIssuesCount: 0,
    policy: "ad_hoc",
    blockingSeverity: "BLOCKING",
  })),
  getCompletedUnreviewedTasks: vi.fn(() => []),
}));

describe("CodeReviewTreeProvider", () => {
  let provider: CodeReviewTreeProvider;
  let mockDbWatcher: DatabaseWatcher;
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = "/test/workspace";

    // Mock DatabaseWatcher
    const mockEmitter = new vscode.EventEmitter<void>();
    mockDbWatcher = {
      onDidChange: mockEmitter.event,
      dispose: vi.fn(),
    } as unknown as DatabaseWatcher;

    provider = new CodeReviewTreeProvider(workspaceRoot, mockDbWatcher);
  });

  afterEach(() => {
    provider.dispose();
    vi.clearAllMocks();
  });

  describe("class structure", () => {
    it("should exist and be constructible", () => {
      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(CodeReviewTreeProvider);
    });

    it("should implement TreeDataProvider interface", () => {
      expect(provider.getTreeItem).toBeDefined();
      expect(typeof provider.getTreeItem).toBe("function");
      expect(provider.getChildren).toBeDefined();
      expect(typeof provider.getChildren).toBe("function");
    });

    it("should have onDidChangeTreeData event", () => {
      expect(provider.onDidChangeTreeData).toBeDefined();
    });

    it("should have refresh method", () => {
      expect(provider.refresh).toBeDefined();
      expect(typeof provider.refresh).toBe("function");
    });

    it("should have dispose method", () => {
      expect(provider.dispose).toBeDefined();
      expect(typeof provider.dispose).toBe("function");
    });
  });

  describe("getChildren", () => {
    it("should return root items when no element provided", async () => {
      const children = await provider.getChildren();

      expect(children).toBeDefined();
      expect(Array.isArray(children)).toBe(true);
    });

    it("should return status snapshot item", async () => {
      const children = await provider.getChildren();

      const statusItem = children?.find((item) =>
        item.label?.toString().includes("Status"),
      );
      expect(statusItem).toBeDefined();
    });

    it("should return gate mode item", async () => {
      const children = await provider.getChildren();

      const gateModeItem = children?.find((item) =>
        item.label?.toString().includes("Gate Mode"),
      );
      expect(gateModeItem).toBeDefined();
    });

    it("should return action items section", async () => {
      const children = await provider.getChildren();

      const actionsItem = children?.find((item) =>
        item.label?.toString().includes("Actions"),
      );
      expect(actionsItem).toBeDefined();
    });

    it("should return children for actions item", async () => {
      const children = await provider.getChildren();
      const actionsItem = children?.find((item) =>
        item.label?.toString().includes("Actions"),
      );

      if (actionsItem) {
        const actionChildren = await provider.getChildren(actionsItem);
        expect(actionChildren).toBeDefined();
        expect(Array.isArray(actionChildren)).toBe(true);
      }
    });
  });

  describe("status snapshot", () => {
    it("should show total review count", async () => {
      const children = await provider.getChildren();

      const hasReviewCount = children?.some((item) =>
        item.label?.toString().match(/\d+\s+reviews?/i),
      );
      expect(hasReviewCount).toBe(true);
    });

    it("should show count by status (APPROVED)", async () => {
      const children = await provider.getChildren();

      const hasApprovedCount = children?.some(
        (item) =>
          item.label?.toString().includes("APPROVED") ||
          item.label?.toString().includes("Approved"),
      );
      expect(hasApprovedCount).toBe(true);
    });

    it("should show count by status (NEEDS_REVISION)", async () => {
      const children = await provider.getChildren();

      const hasNeedsRevisionCount = children?.some(
        (item) =>
          item.label?.toString().includes("NEEDS_REVISION") ||
          item.label?.toString().includes("Needs Revision"),
      );
      expect(hasNeedsRevisionCount).toBe(true);
    });

    it("should show count by status (REJECTED)", async () => {
      const children = await provider.getChildren();

      const hasRejectedCount = children?.some(
        (item) =>
          item.label?.toString().includes("REJECTED") ||
          item.label?.toString().includes("Rejected"),
      );
      expect(hasRejectedCount).toBe(true);
    });

    it("should show count by status (CHANGES_REQUESTED)", async () => {
      const children = await provider.getChildren();

      const hasChangesRequestedCount = children?.some(
        (item) =>
          item.label?.toString().includes("CHANGES_REQUESTED") ||
          item.label?.toString().includes("Changes Requested"),
      );
      expect(hasChangesRequestedCount).toBe(true);
    });

    it("should show count by status (FIXING_ISSUES)", async () => {
      const children = await provider.getChildren();

      const hasFixingIssuesCount = children?.some(
        (item) =>
          item.label?.toString().includes("FIXING_ISSUES") ||
          item.label?.toString().includes("Fixing Issues"),
      );
      expect(hasFixingIssuesCount).toBe(true);
    });

    it("should show count by status (PENDING_VERIFICATION)", async () => {
      const children = await provider.getChildren();

      const hasPendingVerificationCount = children?.some(
        (item) =>
          item.label?.toString().includes("PENDING_VERIFICATION") ||
          item.label?.toString().includes("Pending Verification"),
      );
      expect(hasPendingVerificationCount).toBe(true);
    });

    it("should show count by status (PENDING)", async () => {
      const children = await provider.getChildren();

      const hasPendingCount = children?.some(
        (item) =>
          item.label?.toString().includes("PENDING") ||
          item.label?.toString().includes("Pending"),
      );
      expect(hasPendingCount).toBe(true);
    });

    it("should show open issues count", async () => {
      const children = await provider.getChildren();

      const hasIssuesCount = children?.some((item) =>
        item.label?.toString().match(/\d+\s+open\s+issues?/i),
      );
      expect(hasIssuesCount).toBe(true);
    });

    it("should show blocking severity threshold", async () => {
      const children = await provider.getChildren();

      const hasSeverity = children?.some(
        (item) =>
          item.label?.toString().includes("BLOCKING") ||
          item.label?.toString().includes("MAJOR") ||
          item.label?.toString().includes("MINOR"),
      );
      expect(hasSeverity).toBe(true);
    });
  });

  describe("gate mode display", () => {
    it("should show ad_hoc mode", async () => {
      const children = await provider.getChildren();

      const gateModeItem = children?.find((item) =>
        item.label?.toString().includes("Gate Mode"),
      );
      expect(gateModeItem?.description?.toString()).toContain("ad_hoc");
    });

    it("should show task_gate mode when configured", async () => {
      // Mock getCodeReviewSummary to return task_gate
      const { getCodeReviewSummary } =
        await import("../../../src/database/queries.js");
      vi.mocked(getCodeReviewSummary).mockReturnValue({
        totalReviews: 5,
        byStatus: {
          PENDING: 1,
          APPROVED: 3,
          NEEDS_REVISION: 1,
          REJECTED: 0,
          CHANGES_REQUESTED: 0,
          FIXING_ISSUES: 0,
          PENDING_VERIFICATION: 0,
          COMPLETE: 0,
        },
        openIssuesCount: 2,
        policy: "task_gate",
        blockingSeverity: "BLOCKING",
      });

      provider.refresh();
      const children = await provider.getChildren();

      const gateModeItem = children?.find((item) =>
        item.label?.toString().includes("Gate Mode"),
      );
      expect(gateModeItem?.description?.toString()).toContain("task_gate");
    });

    it("should show phase_gate mode when configured", async () => {
      // Mock getCodeReviewSummary to return phase_gate
      const { getCodeReviewSummary } =
        await import("../../../src/database/queries.js");
      vi.mocked(getCodeReviewSummary).mockReturnValue({
        totalReviews: 5,
        byStatus: {
          PENDING: 1,
          APPROVED: 3,
          NEEDS_REVISION: 1,
          REJECTED: 0,
          CHANGES_REQUESTED: 0,
          FIXING_ISSUES: 0,
          PENDING_VERIFICATION: 0,
          COMPLETE: 0,
        },
        openIssuesCount: 2,
        policy: "phase_gate",
        blockingSeverity: "BLOCKING",
      });

      provider.refresh();
      const children = await provider.getChildren();

      const gateModeItem = children?.find((item) =>
        item.label?.toString().includes("Gate Mode"),
      );
      expect(gateModeItem?.description?.toString()).toContain("phase_gate");
    });
  });

  describe("action buttons", () => {
    it("should have 'Run ad-hoc review now' action", async () => {
      const children = await provider.getChildren();
      const actionsItem = children?.find((item) =>
        item.label?.toString().includes("Actions"),
      );

      const actionChildren = await provider.getChildren(actionsItem);

      const adHocAction = actionChildren?.find((item) =>
        item.label?.toString().includes("Run ad-hoc review now"),
      );
      expect(adHocAction).toBeDefined();
    });

    it("should show 'Fix Issues' action when changes requested", async () => {
      const { getCodeReviewSummary } =
        await import("../../../src/database/queries.js");
      vi.mocked(getCodeReviewSummary).mockReturnValue({
        totalReviews: 5,
        byStatus: {
          PENDING: 0,
          APPROVED: 3,
          NEEDS_REVISION: 0,
          REJECTED: 0,
          CHANGES_REQUESTED: 2,
          FIXING_ISSUES: 0,
          PENDING_VERIFICATION: 0,
          COMPLETE: 0,
        },
        openIssuesCount: 2,
        policy: "ad_hoc",
        blockingSeverity: "BLOCKING",
      });

      provider.refresh();
      const children = await provider.getChildren();
      const actionsItem = children?.find((item) =>
        item.label?.toString().includes("Actions"),
      );

      const actionChildren = await provider.getChildren(actionsItem);

      const fixIssuesAction = actionChildren?.find((item) =>
        item.label?.toString().includes("Fix Issues"),
      );
      expect(fixIssuesAction).toBeDefined();
    });

    it("should show 'Continue Fixing' action when fixing issues", async () => {
      const { getCodeReviewSummary } =
        await import("../../../src/database/queries.js");
      vi.mocked(getCodeReviewSummary).mockReturnValue({
        totalReviews: 5,
        byStatus: {
          PENDING: 0,
          APPROVED: 3,
          NEEDS_REVISION: 0,
          REJECTED: 0,
          CHANGES_REQUESTED: 0,
          FIXING_ISSUES: 1,
          PENDING_VERIFICATION: 0,
          COMPLETE: 0,
        },
        openIssuesCount: 1,
        policy: "ad_hoc",
        blockingSeverity: "BLOCKING",
      });

      provider.refresh();
      const children = await provider.getChildren();
      const actionsItem = children?.find((item) =>
        item.label?.toString().includes("Actions"),
      );

      const actionChildren = await provider.getChildren(actionsItem);

      const continueFixingAction = actionChildren?.find((item) =>
        item.label?.toString().includes("Continue Fixing"),
      );
      expect(continueFixingAction).toBeDefined();
    });

    it("should show 'Verify Fixes' action when pending verification", async () => {
      const { getCodeReviewSummary } =
        await import("../../../src/database/queries.js");
      vi.mocked(getCodeReviewSummary).mockReturnValue({
        totalReviews: 5,
        byStatus: {
          PENDING: 0,
          APPROVED: 3,
          NEEDS_REVISION: 0,
          REJECTED: 0,
          CHANGES_REQUESTED: 0,
          FIXING_ISSUES: 0,
          PENDING_VERIFICATION: 2,
          COMPLETE: 0,
        },
        openIssuesCount: 0,
        policy: "ad_hoc",
        blockingSeverity: "BLOCKING",
      });

      provider.refresh();
      const children = await provider.getChildren();
      const actionsItem = children?.find((item) =>
        item.label?.toString().includes("Actions"),
      );

      const actionChildren = await provider.getChildren(actionsItem);

      const verifyFixesAction = actionChildren?.find((item) =>
        item.label?.toString().includes("Verify Fixes"),
      );
      expect(verifyFixesAction).toBeDefined();
    });

    it("should show 'Escalate' action when rejected", async () => {
      const { getCodeReviewSummary } =
        await import("../../../src/database/queries.js");
      vi.mocked(getCodeReviewSummary).mockReturnValue({
        totalReviews: 5,
        byStatus: {
          PENDING: 0,
          APPROVED: 3,
          NEEDS_REVISION: 0,
          REJECTED: 1,
          CHANGES_REQUESTED: 0,
          FIXING_ISSUES: 0,
          PENDING_VERIFICATION: 0,
          COMPLETE: 0,
        },
        openIssuesCount: 0,
        policy: "ad_hoc",
        blockingSeverity: "BLOCKING",
      });

      provider.refresh();
      const children = await provider.getChildren();
      const actionsItem = children?.find((item) =>
        item.label?.toString().includes("Actions"),
      );

      const actionChildren = await provider.getChildren(actionsItem);

      const escalateAction = actionChildren?.find((item) =>
        item.label?.toString().includes("Escalate"),
      );
      expect(escalateAction).toBeDefined();
    });

    it("should disable 'Run ad-hoc review now' when no unreviewed tasks", async () => {
      // Mock no unreviewed tasks
      const { getCompletedUnreviewedTasks } =
        await import("../../../src/database/queries.js");
      vi.mocked(getCompletedUnreviewedTasks).mockReturnValue([]);

      provider.refresh();
      const children = await provider.getChildren();
      const actionsItem = children?.find((item) =>
        item.label?.toString().includes("Actions"),
      );

      const actionChildren = await provider.getChildren(actionsItem);
      const adHocAction = actionChildren?.find((item) =>
        item.label?.toString().includes("Run ad-hoc review now"),
      );

      expect(adHocAction?.command).toBeUndefined();
    });

    it("should enable 'Run ad-hoc review now' when unreviewed tasks exist", async () => {
      // Mock unreviewed tasks
      const { getCompletedUnreviewedTasks } =
        await import("../../../src/database/queries.js");
      vi.mocked(getCompletedUnreviewedTasks).mockReturnValue([
        { task_id: 5, title: "Test Task" },
      ] as any);

      provider.refresh();
      const children = await provider.getChildren();
      const actionsItem = children?.find((item) =>
        item.label?.toString().includes("Actions"),
      );

      const actionChildren = await provider.getChildren(actionsItem);
      const adHocAction = actionChildren?.find((item) =>
        item.label?.toString().includes("Run ad-hoc review now"),
      );

      expect(adHocAction?.command).toBeDefined();
    });

    it("should use correct command for 'Run ad-hoc review now'", async () => {
      const { getCompletedUnreviewedTasks } =
        await import("../../../src/database/queries.js");
      vi.mocked(getCompletedUnreviewedTasks).mockReturnValue([
        { task_id: 5, title: "Test Task" },
      ] as any);

      provider.refresh();
      const children = await provider.getChildren();
      const actionsItem = children?.find((item) =>
        item.label?.toString().includes("Actions"),
      );

      const actionChildren = await provider.getChildren(actionsItem);
      const adHocAction = actionChildren?.find((item) =>
        item.label?.toString().includes("Run ad-hoc review now"),
      );

      expect(adHocAction?.command?.command).toBe("orchestra.runAdHocReview");
    });

    it("should use correct command for 'Fix Issues'", async () => {
      const { getCodeReviewSummary } =
        await import("../../../src/database/queries.js");
      vi.mocked(getCodeReviewSummary).mockReturnValue({
        totalReviews: 5,
        byStatus: {
          PENDING: 0,
          APPROVED: 3,
          NEEDS_REVISION: 0,
          REJECTED: 0,
          CHANGES_REQUESTED: 2,
          FIXING_ISSUES: 0,
          PENDING_VERIFICATION: 0,
          COMPLETE: 0,
        },
        openIssuesCount: 5,
        policy: "ad_hoc",
        blockingSeverity: "BLOCKING",
      });

      provider.refresh();
      const children = await provider.getChildren();
      const actionsItem = children?.find((item) =>
        item.label?.toString().includes("Actions"),
      );

      const actionChildren = await provider.getChildren(actionsItem);
      const fixIssuesAction = actionChildren?.find((item) =>
        item.label?.toString().includes("Fix Issues"),
      );

      expect(fixIssuesAction?.command?.command).toBe(
        "orchestra.fixCodeReviewIssues",
      );
    });

    it("should use correct command for 'Verify Fixes'", async () => {
      const { getCodeReviewSummary } =
        await import("../../../src/database/queries.js");
      vi.mocked(getCodeReviewSummary).mockReturnValue({
        totalReviews: 5,
        byStatus: {
          PENDING: 0,
          APPROVED: 3,
          NEEDS_REVISION: 0,
          REJECTED: 0,
          CHANGES_REQUESTED: 0,
          FIXING_ISSUES: 0,
          PENDING_VERIFICATION: 2,
          COMPLETE: 0,
        },
        openIssuesCount: 0,
        policy: "ad_hoc",
        blockingSeverity: "BLOCKING",
      });

      provider.refresh();
      const children = await provider.getChildren();
      const actionsItem = children?.find((item) =>
        item.label?.toString().includes("Actions"),
      );

      const actionChildren = await provider.getChildren(actionsItem);
      const verifyFixesAction = actionChildren?.find((item) =>
        item.label?.toString().includes("Verify Fixes"),
      );

      expect(verifyFixesAction?.command?.command).toBe(
        "orchestra.verifyCodeReviewFixes",
      );
    });

    it("should use correct command for 'Escalate'", async () => {
      const { getCodeReviewSummary } =
        await import("../../../src/database/queries.js");
      vi.mocked(getCodeReviewSummary).mockReturnValue({
        totalReviews: 5,
        byStatus: {
          PENDING: 0,
          APPROVED: 3,
          NEEDS_REVISION: 0,
          REJECTED: 1,
          CHANGES_REQUESTED: 0,
          FIXING_ISSUES: 0,
          PENDING_VERIFICATION: 0,
          COMPLETE: 0,
        },
        openIssuesCount: 0,
        policy: "ad_hoc",
        blockingSeverity: "BLOCKING",
      });

      provider.refresh();
      const children = await provider.getChildren();
      const actionsItem = children?.find((item) =>
        item.label?.toString().includes("Actions"),
      );

      const actionChildren = await provider.getChildren(actionsItem);
      const escalateAction = actionChildren?.find((item) =>
        item.label?.toString().includes("Escalate"),
      );

      expect(escalateAction?.command?.command).toBe(
        "orchestra.escalateRejectedReview",
      );
    });
  });

  describe("icons and styling", () => {
    it("should use appropriate icon for status items", async () => {
      const children = await provider.getChildren();

      const statusItem = children?.find((item) =>
        item.label?.toString().includes("Status"),
      );
      expect(statusItem?.iconPath).toBeDefined();
    });

    it("should use appropriate icon for gate mode", async () => {
      const children = await provider.getChildren();

      const gateModeItem = children?.find((item) =>
        item.label?.toString().includes("Gate Mode"),
      );
      expect(gateModeItem?.iconPath).toBeDefined();
    });

    it("should use appropriate icon for actions", async () => {
      const children = await provider.getChildren();
      const actionsItem = children?.find((item) =>
        item.label?.toString().includes("Actions"),
      );

      const actionChildren = await provider.getChildren(actionsItem);

      actionChildren?.forEach((action) => {
        expect(action.iconPath).toBeDefined();
      });
    });
  });

  describe("database reactivity", () => {
    it("should register database change listener", () => {
      const listenerCount = vi.mocked(mockDbWatcher.onDidChange).mock.calls
        .length;
      expect(listenerCount).toBeGreaterThan(0);
    });

    it("should refresh on database change", () => {
      const refreshSpy = vi.spyOn(provider, "refresh");

      // Get the registered listener
      const changeListener = vi.mocked(mockDbWatcher.onDidChange).mock
        .calls[0]?.[0];
      expect(changeListener).toBeDefined();

      if (changeListener) {
        // Trigger change
        changeListener();

        // Should have called refresh
        expect(refreshSpy).toHaveBeenCalled();
      }
    });

    it("should fire onDidChangeTreeData when refreshed", () => {
      const fireSpy = vi.spyOn((provider as any)._onDidChangeTreeData, "fire");

      provider.refresh();

      expect(fireSpy).toHaveBeenCalled();
    });
  });

  describe("lifecycle", () => {
    it("should dispose of resources", () => {
      provider.dispose();

      // Should not throw when calling dispose multiple times
      expect(() => provider.dispose()).not.toThrow();
    });

    it("should clean up disposables on dispose", () => {
      const disposeSpy = vi.spyOn(
        (provider as any)._onDidChangeTreeData,
        "dispose",
      );

      provider.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });
  });

  describe("context-sensitive labels", () => {
    it("should show 'Post-phase review' label when appropriate", async () => {
      // Test that context-sensitive labeling works
      // This is a placeholder - actual implementation will depend on sprint state
      const children = await provider.getChildren();
      const actionsItem = children?.find((item) =>
        item.label?.toString().includes("Actions"),
      );
      const actionChildren = actionsItem
        ? await provider.getChildren(actionsItem)
        : [];

      // Expect either ad-hoc or context-sensitive label
      const hasReviewAction = actionChildren?.some((item) =>
        item.label
          ?.toString()
          .match(/(Run ad-hoc review now|Post-phase review|Post-task review)/i),
      );
      expect(hasReviewAction).toBe(true);
    });

    it("should show 'Post-task review' label when appropriate", async () => {
      // Test that context-sensitive labeling works
      // This is a placeholder - actual implementation will depend on sprint state
      const children = await provider.getChildren();
      const actionsItem = children?.find((item) =>
        item.label?.toString().includes("Actions"),
      );
      const actionChildren = actionsItem
        ? await provider.getChildren(actionsItem)
        : [];

      // Expect either ad-hoc or context-sensitive label
      const hasReviewAction = actionChildren?.some((item) =>
        item.label
          ?.toString()
          .match(/(Run ad-hoc review now|Post-phase review|Post-task review)/i),
      );
      expect(hasReviewAction).toBe(true);
    });
  });
});
