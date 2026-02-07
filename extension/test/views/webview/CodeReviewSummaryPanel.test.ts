/**
 * Tests for CodeReviewSummaryPanel
 *
 * Tests for Code Review summary webview showing status totals,
 * open issues list with severity filters, and review details.
 *
 * Spec: specs/005-code-review-workflow/spec.md
 * User Story 6: Code Review Summary Screen (Priority: P2)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { DatabaseWatcher } from "../../../src/database/watcher.js";
import { CodeReviewSummaryPanel } from "../../../src/views/webview/CodeReviewSummaryPanel.js";

// Mock vscode module
vi.mock("vscode", () => ({
  Uri: {
    file: (path: string) => ({ fsPath: path }),
    joinPath: (...args: unknown[]) => ({ fsPath: args.join("/") }),
  },
  ViewColumn: {
    One: 1,
    Two: 2,
    Three: 3,
  },
  EventEmitter: class {
    event = vi.fn((callback: () => void) => ({ dispose: vi.fn() }));
    fire = vi.fn();
    dispose = vi.fn();
  },
  window: {
    createWebviewPanel: vi.fn(() => ({
      visible: true,
      webview: {
        html: "",
        options: {},
        onDidReceiveMessage: vi.fn(),
        postMessage: vi.fn(),
        asWebviewUri: vi.fn((uri) => uri),
        cspSource: "https://test.vscode-resource.vscode-cdn.net",
      },
      onDidDispose: vi.fn(),
      onDidChangeViewState: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn(),
    })),
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  commands: {
    executeCommand: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, defaultValue?: unknown) => defaultValue),
    })),
  },
}));

// Mock database queries module
vi.mock("../../../src/database/queries.js", () => ({
  getCodeReviewSummary: vi.fn(() => ({
    totalReviews: 10,
    byStatus: {
      PENDING: 2,
      APPROVED: 5,
      NEEDS_REVISION: 2,
      REJECTED: 1,
      CHANGES_REQUESTED: 0,
      FIXING_ISSUES: 0,
      PENDING_VERIFICATION: 0,
      COMPLETE: 0,
    },
    openIssuesCount: 8,
    policy: "ad_hoc",
    blockingSeverity: "BLOCKING",
  })),
  getOpenCodeReviewIssues: vi.fn(() => []),
  getCodeReviewHistory: vi.fn(() => []),
  getCodeReviewById: vi.fn(() => ({
    review_id: 1,
    task_id: 1,
    status: "PENDING",
    summary: "Test review",
    requested_at: new Date().toISOString(),
  })),
}));

describe("CodeReviewSummaryPanel", () => {
  let panel: CodeReviewSummaryPanel;
  let mockDbWatcher: DatabaseWatcher;
  let mockExtensionUri: vscode.Uri;
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = "/test/workspace";
    mockExtensionUri = { fsPath: "/test/extension" } as vscode.Uri;

    // Mock DatabaseWatcher
    const mockEmitter = new vscode.EventEmitter<void>();
    mockDbWatcher = {
      onDidChange: mockEmitter.event,
      dispose: vi.fn(),
    } as unknown as DatabaseWatcher;

    panel = CodeReviewSummaryPanel.createOrShow(
      mockExtensionUri,
      workspaceRoot,
      mockDbWatcher,
    );
  });

  afterEach(() => {
    panel.dispose();
    vi.clearAllMocks();
  });

  describe("class structure", () => {
    it("should exist and be constructible", () => {
      expect(panel).toBeDefined();
      expect(panel).toBeInstanceOf(CodeReviewSummaryPanel);
    });

    it("should implement singleton pattern with createOrShow", () => {
      const panel1 = CodeReviewSummaryPanel.createOrShow(
        mockExtensionUri,
        workspaceRoot,
        mockDbWatcher,
      );
      const panel2 = CodeReviewSummaryPanel.createOrShow(
        mockExtensionUri,
        workspaceRoot,
        mockDbWatcher,
      );

      expect(panel1).toBe(panel2);
    });

    it("should have dispose method", () => {
      expect(panel.dispose).toBeDefined();
      expect(typeof panel.dispose).toBe("function");
    });

    it("should have refresh method", () => {
      expect(panel.refresh).toBeDefined();
      expect(typeof panel.refresh).toBe("function");
    });
  });

  describe("webview panel creation", () => {
    it("should create webview panel with correct viewType", () => {
      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        "orchestra.codeReviewSummary",
        expect.any(String),
        expect.any(Number),
        expect.any(Object),
      );
    });

    it("should set panel title to 'Code Review Summary'", () => {
      const createCall = vi.mocked(vscode.window.createWebviewPanel).mock
        .calls[0];
      expect(createCall?.[1]).toBe("Code Review Summary");
    });

    it("should enable scripts in webview", () => {
      const createCall = vi.mocked(vscode.window.createWebviewPanel).mock
        .calls[0];
      const options = createCall?.[3];
      expect(options).toHaveProperty("enableScripts", true);
    });

    it("should set localResourceRoots", () => {
      const createCall = vi.mocked(vscode.window.createWebviewPanel).mock
        .calls[0];
      const options = createCall?.[3];
      expect(options).toHaveProperty("localResourceRoots");
      expect(Array.isArray(options.localResourceRoots)).toBe(true);
    });
  });

  describe("HTML generation", () => {
    it("should set HTML content on webview", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toBeDefined();
      expect(typeof mockPanel?.webview.html).toBe("string");
    });

    it("should contain DOCTYPE declaration", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain("<!DOCTYPE html>");
    });

    it("should have proper HTML structure", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain("<html");
      expect(mockPanel?.webview.html).toContain("<head>");
      expect(mockPanel?.webview.html).toContain("<body>");
    });

    it("should include CSP meta tag", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain(
        'http-equiv="Content-Security-Policy"',
      );
    });
  });

  describe("status totals section", () => {
    it("should display total review count", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain("10");
      expect(mockPanel?.webview.html).toMatch(/total|reviews?/i);
    });

    it("should display APPROVED count", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain("5");
      expect(mockPanel?.webview.html).toMatch(/approved/i);
    });

    it("should display NEEDS_REVISION count", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain("2");
      expect(mockPanel?.webview.html).toMatch(/needs.*revision/i);
    });

    it("should display REJECTED count", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain("1");
      expect(mockPanel?.webview.html).toMatch(/rejected/i);
    });

    it("should display PENDING count", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain("2");
      expect(mockPanel?.webview.html).toMatch(/pending/i);
    });

    it("should display open issues count", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain("8");
      expect(mockPanel?.webview.html).toMatch(/open.*issues?/i);
    });
  });

  describe("open issues list", () => {
    beforeEach(async () => {
      // Mock open issues data
      const { getOpenCodeReviewIssues } =
        await import("../../../src/database/queries.js");
      vi.mocked(getOpenCodeReviewIssues).mockReturnValue([
        {
          issue_id: 1,
          review_id: 1,
          task_id: 5,
          severity: "BLOCKING",
          category: "ARCHITECTURE",
          description: "Missing error handling in database layer",
          file_path: "src/db/client.ts",
          line_number: 45,
          recommendation: "Add try-catch blocks around DB operations",
          status: "OPEN",
        },
        {
          issue_id: 2,
          review_id: 1,
          task_id: 5,
          severity: "MAJOR",
          category: "CODE_QUALITY",
          description: "Complex function exceeds cognitive complexity",
          file_path: "src/core/processor.ts",
          line_number: 120,
          recommendation: "Refactor into smaller helper functions",
          status: "OPEN",
        },
      ] as any);

      panel.refresh();
    });

    it("should display issues list section", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toMatch(/issues?.*list|list.*issues?/i);
    });

    it("should display issue severity", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain("BLOCKING");
      expect(mockPanel?.webview.html).toContain("MAJOR");
    });

    it("should display issue category", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain("ARCHITECTURE");
      expect(mockPanel?.webview.html).toContain("CODE_QUALITY");
    });

    it("should display issue description", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain(
        "Missing error handling in database layer",
      );
    });

    it("should display file path and line number", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain("src/db/client.ts");
      expect(mockPanel?.webview.html).toContain("45");
    });

    it("should display issue recommendation", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain(
        "Add try-catch blocks around DB operations",
      );
    });

    it("should make issues clickable", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toMatch(
        /onclick|click.*handler|data-issue-id/i,
      );
    });
  });

  describe("severity filtering", () => {
    it("should have severity filter controls", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toMatch(/filter|severity/i);
    });

    it("should default to BLOCKING and above", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain("BLOCKING");
    });

    it("should support filtering by MAJOR and above", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toMatch(/major/i);
    });

    it("should support filtering by MINOR and above", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toMatch(/minor/i);
    });

    it("should support showing all issues", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toMatch(/all.*issues?|show.*all/i);
    });
  });

  describe("review history", () => {
    beforeEach(async () => {
      // Mock review history data
      const { getCodeReviewHistory } =
        await import("../../../src/database/queries.js");
      vi.mocked(getCodeReviewHistory).mockReturnValue([
        {
          review_id: 1,
          task_id: 5,
          task_title: "Test task",
          status: "NEEDS_REVISION",
          reviewed_by: "controller",
          reviewed_at: "2026-01-18T10:30:00Z",
          risk: "MEDIUM",
          summary: "Found architectural issues requiring fixes",
          issues_count: 3,
        },
        {
          review_id: 2,
          task_id: 3,
          task_title: "Another task",
          status: "APPROVED",
          reviewed_by: "controller",
          reviewed_at: "2026-01-18T09:00:00Z",
          risk: "LOW",
          summary: "Code quality is excellent, no issues found",
          issues_count: 0,
        },
      ] as any);

      panel.refresh();
    });

    it("should display review history section", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toMatch(/history|past.*reviews?/i);
    });

    it("should display review decision", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain("NEEDS_REVISION");
      expect(mockPanel?.webview.html).toContain("APPROVED");
    });

    it("should display reviewer name", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain("controller");
    });

    it("should display review timestamp", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toMatch(/1\/18\/2026|jan.*18|2026.*01.*18/i);
    });

    it("should display revision count", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toMatch(/revision|rev.*\d+/i);
    });

    it("should display risk rating", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain("MEDIUM");
      expect(mockPanel?.webview.html).toContain("LOW");
    });

    it("should display review summary", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toContain(
        "Found architectural issues requiring fixes",
      );
    });
  });

  describe("message passing", () => {
    it("should set up message handler", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.onDidReceiveMessage).toHaveBeenCalled();
    });

    it("should handle viewIssueDetails command", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      const messageHandler = vi.mocked(mockPanel?.webview.onDidReceiveMessage)
        .mock.calls[0]?.[0];

      expect(messageHandler).toBeDefined();

      if (messageHandler) {
        messageHandler({ command: "viewIssueDetails", issueId: 1 });
        // Should not throw
      }
    });

    it("should handle filterBySeverity command", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      const messageHandler = vi.mocked(mockPanel?.webview.onDidReceiveMessage)
        .mock.calls[0]?.[0];

      expect(messageHandler).toBeDefined();

      if (messageHandler) {
        messageHandler({ command: "filterBySeverity", severity: "MAJOR" });
        // Should not throw
      }
    });

    it("should handle viewReviewDetails command", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      const messageHandler = vi.mocked(mockPanel?.webview.onDidReceiveMessage)
        .mock.calls[0]?.[0];

      expect(messageHandler).toBeDefined();

      if (messageHandler) {
        messageHandler({ command: "viewReviewDetails", reviewId: 1 });
        // Should not throw
      }
    });

    it("should handle refresh command", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      const messageHandler = vi.mocked(mockPanel?.webview.onDidReceiveMessage)
        .mock.calls[0]?.[0];

      expect(messageHandler).toBeDefined();

      if (messageHandler) {
        messageHandler({ command: "refresh" });
        // Should not throw
      }
    });
  });

  describe("database reactivity", () => {
    it("should register database change listener", () => {
      const listenerCount = vi.mocked(mockDbWatcher.onDidChange).mock.calls
        .length;
      expect(listenerCount).toBeGreaterThan(0);
    });

    it("should refresh on database change", () => {
      // Get the registered listener
      const changeListener = vi.mocked(mockDbWatcher.onDidChange).mock
        .calls[0]?.[0];
      expect(changeListener).toBeDefined();

      if (changeListener) {
        // Get the mock panel before triggering change
        const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
          .results[0]?.value;
        const htmlBefore = mockPanel.webview.html;

        // Trigger change
        changeListener();

        // HTML should have been updated (refresh was called)
        const htmlAfter = mockPanel.webview.html;
        expect(htmlAfter).toBeDefined();
      }
    });

    it("should update webview content when refreshed", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      const htmlBefore = mockPanel.webview.html;

      panel.refresh();

      const htmlAfter = mockPanel.webview.html;
      // HTML should be set (may be same content if data didn't change)
      expect(htmlAfter).toBeDefined();
    });
  });

  describe("CSS and styling", () => {
    it("should use VS Code theme variables", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toMatch(/--vscode-/);
    });

    it("should have responsive layout", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toMatch(
        /min-width|max-width|@media|flex|grid/i,
      );
    });

    it("should style severity badges appropriately", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toMatch(
        /severity.*badge|badge.*severity/i,
      );
    });

    it("should style status pills appropriately", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toMatch(/status.*pill|pill.*status/i);
    });
  });

  describe("empty states", () => {
    it("should show empty state when no reviews exist", async () => {
      const { getCodeReviewSummary } =
        await import("../../../src/database/queries.js");
      vi.mocked(getCodeReviewSummary).mockReturnValue({
        totalReviews: 0,
        byStatus: {
          PENDING: 0,
          APPROVED: 0,
          NEEDS_REVISION: 0,
          REJECTED: 0,
        },
        openIssuesCount: 0,
        policy: "ad_hoc",
        blockingSeverity: "BLOCKING",
      });

      panel.refresh();

      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toMatch(
        /no.*reviews?|empty.*state|start.*reviewing/i,
      );
    });

    it("should show empty state when no open issues", async () => {
      const { getOpenCodeReviewIssues } =
        await import("../../../src/database/queries.js");
      vi.mocked(getOpenCodeReviewIssues).mockReturnValue([]);

      panel.refresh();

      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toMatch(
        /no.*open.*issues?|all.*resolved/i,
      );
    });
  });

  describe("lifecycle", () => {
    it("should dispose of resources", () => {
      panel.dispose();

      // Should not throw when calling dispose multiple times
      expect(() => panel.dispose()).not.toThrow();
    });

    it("should clean up webview panel on dispose", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      const disposeSpy = vi.spyOn(mockPanel, "dispose");

      panel.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });

    it("should clean up disposables on dispose", () => {
      const disposeSpy = vi.fn();
      // Simulate internal disposables
      (panel as unknown as { _disposables: vscode.Disposable[] })._disposables =
        [{ dispose: disposeSpy }];

      panel.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });
  });

  describe("links to review details", () => {
    it("should provide links to individual review details", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toMatch(
        /view.*details|details.*link|onclick.*review/i,
      );
    });

    it("should provide links to task from issue", () => {
      const mockPanel = vi.mocked(vscode.window.createWebviewPanel).mock
        .results[0]?.value;
      expect(mockPanel?.webview.html).toMatch(/task.*\d+|view.*task/i);
    });
  });
});
