/**
 * Tests for SprintTreeProvider
 */

import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { Sprint, Task } from "../../../src/database/queries.js";
import type { DatabaseWatcher } from "../../../src/database/watcher.js";
import { SprintTreeProvider } from "../../../src/views/treeview/SprintTreeProvider.js";

// Mock vscode module
vi.mock("vscode", () => ({
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
    })),
  },
  TreeItem: vi.fn(function (
    this: any,
    label: string,
    collapsibleState: number,
  ) {
    this.label = label;
    this.collapsibleState = collapsibleState;
    this.iconPath = undefined;
    this.tooltip = undefined;
    this.resourceUri = undefined;
    return this;
  }),
  ThemeIcon: class {
    constructor(
      public id: string,
      public color?: any,
    ) {}
  },
  ThemeColor: class {
    constructor(public id: string) {}
  },
  MarkdownString: vi.fn(function (this: any, value?: string) {
    this.value = value || "";
    this.isTrusted = false;
    this.supportThemeIcons = false;
    this.appendMarkdown = vi.fn((md: string) => {
      this.value += md;
      return this;
    });
    return this;
  }),
  EventEmitter: class {
    event = vi.fn((callback: () => void) => ({ dispose: vi.fn() }));
    fire = vi.fn();
    dispose = vi.fn();
  },
  Uri: {
    parse: vi.fn((uri: string) => ({ toString: () => uri })),
  },
}));

// Mock workspace detector
vi.mock("../../../src/workspace/detector.js", () => ({
  findOrchestraRoot: vi.fn(() => "/test/workspace"),
}));

// Mock queries module
vi.mock("../../../src/database/queries.js", () => ({
  getAllSprints: vi.fn(() => []),
  getPhases: vi.fn(() => []),
  getTasksForSprint: vi.fn(() => []),
  getLatestCodeReviewStatusForSprint: vi.fn(() => new Map<number, string>()),
}));

// Mock ViewDecorationProvider
vi.mock("../../../src/views/providers/ViewDecorationProvider.js", () => ({
  createTaskDecorationUri: vi.fn((taskId: number) => ({
    toString: () => `orchestra-task://${taskId}`,
  })),
}));

// Mock statusTranslation with proper label mapping
const STATUS_LABELS: Record<string, string> = {
  PENDING: "Ready",
  IMPLEMENT: "In Progress",
  VERIFY: "Verifying",
  VERIFY_FAILED: "Needs Attention",
  GATE_CHECK: "Pending Review",
  ESCALATED: "Escalated",
  COMPLETE: "Complete",
};

vi.mock("../../../src/views/statusTranslation.js", () => ({
  getStatusDisplay: vi.fn((status: string) => ({
    icon: "circle",
    label: STATUS_LABELS[status] || status,
    color: { id: "charts.blue" },
  })),
}));

// Import mocked modules
import {
  getAllSprints,
  getPhases,
  getTasksForSprint,
} from "../../../src/database/queries.js";
import { findOrchestraRoot } from "../../../src/workspace/detector.js";

describe("SprintTreeProvider", () => {
  let provider: SprintTreeProvider;
  let mockDb: Database.Database;
  let mockDbWatcher: DatabaseWatcher;

  beforeEach(() => {
    // Mock Database
    mockDb = {} as Database.Database;

    // Mock DatabaseWatcher
    const mockEmitter = new vscode.EventEmitter<void>();
    mockDbWatcher = {
      onDidChange: mockEmitter.event,
      dispose: vi.fn(),
    } as unknown as DatabaseWatcher;

    const mockContext = {
      workspaceState: {
        get: vi.fn(() => "active"),
        update: vi.fn(() => Promise.resolve()),
      },
    } as unknown as vscode.ExtensionContext;

    provider = new SprintTreeProvider(mockDb, mockDbWatcher, mockContext);

    // Reset mocks
    vi.mocked(findOrchestraRoot).mockReturnValue("/test/workspace");
    vi.mocked(getAllSprints).mockReturnValue([]);
    vi.mocked(getPhases).mockReturnValue([]);
    vi.mocked(getTasksForSprint).mockReturnValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Helper to create mock Task objects for testing
  const createMockTask = (overrides: Partial<Task>): Task => ({
    id: 1,
    sprint_id: "sprint-001",
    phase_id: 1,
    task_id: 1,
    title: "Mock Task",
    description: "Mock description",
    category: "FEATURE",
    dependencies: "",
    speckit_task_ref: null,
    status: "PENDING",
    retry_count: 0,
    max_retries: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    ...overrides,
  });

  describe("getTreeItem - Task Tooltips", () => {
    it("should create MarkdownString tooltip for task items", () => {
      const mockTask = createMockTask({
        task_id: 1,
        title: "Test Task",
        description: "This is a test task description",
        status: "IMPLEMENT",
      });

      const taskElement = { type: "task" as const, task: mockTask };
      const treeItem = provider.getTreeItem(taskElement);

      expect(treeItem.tooltip).toBeDefined();
      expect(treeItem.tooltip).toBeInstanceOf(vscode.MarkdownString);
    });

    it("should include task title in tooltip with markdown formatting", () => {
      const mockTask = createMockTask({
        task_id: 2,
        title: "My Important Task",
        description: "Description here",
        status: "PENDING",
      });

      const taskElement = { type: "task" as const, task: mockTask };
      const treeItem = provider.getTreeItem(taskElement);

      const tooltip = treeItem.tooltip as vscode.MarkdownString;
      expect(tooltip.value).toContain("**My Important Task**");
    });

    it("should include current status in tooltip", () => {
      const mockTask = createMockTask({
        task_id: 3,
        title: "Status Test Task",
        description: "Testing status display",
        status: "VERIFY",
      });

      const taskElement = { type: "task" as const, task: mockTask };
      const treeItem = provider.getTreeItem(taskElement);

      const tooltip = treeItem.tooltip as vscode.MarkdownString;
      expect(tooltip.value).toContain("Status:");
      // Status is now translated to user-friendly label
      expect(tooltip.value).toContain("Verifying");
    });

    it("should include task description in tooltip", () => {
      const mockTask = createMockTask({
        task_id: 4,
        title: "Description Test",
        description: "This is my detailed task description with important info",
        status: "COMPLETE",
      });

      const taskElement = { type: "task" as const, task: mockTask };
      const treeItem = provider.getTreeItem(taskElement);

      const tooltip = treeItem.tooltip as vscode.MarkdownString;
      expect(tooltip.value).toContain(
        "This is my detailed task description with important info",
      );
    });

    it("should show remediation hint for ESCALATED status", () => {
      const mockTask = createMockTask({
        task_id: 5,
        title: "Escalated Task",
        description: "Task that needs attention",
        status: "ESCALATED",
        retry_count: 3,
      });

      const taskElement = { type: "task" as const, task: mockTask };
      const treeItem = provider.getTreeItem(taskElement);

      const tooltip = treeItem.tooltip as vscode.MarkdownString;
      expect(tooltip.value).toContain("Right-click for remediation");
    });

    it("should show remediation hint for VERIFY_FAILED status", () => {
      const mockTask = createMockTask({
        task_id: 6,
        title: "Failed Verification",
        description: "Task that failed verification",
        status: "VERIFY_FAILED",
        retry_count: 1,
      });

      const taskElement = { type: "task" as const, task: mockTask };
      const treeItem = provider.getTreeItem(taskElement);

      const tooltip = treeItem.tooltip as vscode.MarkdownString;
      expect(tooltip.value).toContain("Right-click for remediation");
    });

    it("should NOT show remediation hint for normal statuses", () => {
      const statuses: Task["status"][] = [
        "PENDING",
        "IMPLEMENT",
        "VERIFY",
        "COMPLETE",
      ];

      statuses.forEach((status) => {
        const mockTask = createMockTask({
          task_id: 7,
          title: "Normal Task",
          description: "Regular task",
          status,
        });

        const taskElement = { type: "task" as const, task: mockTask };
        const treeItem = provider.getTreeItem(taskElement);

        const tooltip = treeItem.tooltip as vscode.MarkdownString;
        expect(tooltip.value).not.toContain("Right-click for remediation");
      });
    });

    it("should format tooltip with proper markdown structure", () => {
      const mockTask = createMockTask({
        task_id: 8,
        title: "Well Formatted Task",
        description: "Clean formatting test",
        status: "IMPLEMENT",
      });

      const taskElement = { type: "task" as const, task: mockTask };
      const treeItem = provider.getTreeItem(taskElement);

      const tooltip = treeItem.tooltip as vscode.MarkdownString;

      // Should have title in bold
      expect(tooltip.value).toMatch(/\*\*Well Formatted Task\*\*/);

      // Should have user-friendly status label (translated from IMPLEMENT)
      expect(tooltip.value).toMatch(/Status: In Progress/);

      // Should have proper line breaks
      expect(tooltip.value).toContain("\n\n");
    });
  });

  describe("getChildren", () => {
    it("should return info message when no Orchestra workspace found", () => {
      vi.mocked(findOrchestraRoot).mockReturnValue(null);

      const children = provider.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0]).toMatchObject({
        type: "message",
        message: "No Orchestra workspace",
        messageType: "info",
      });
    });

    it("should return sprints at root level", () => {
      const mockSprints: Sprint[] = [
        {
          id: "sprint-001",
          name: "Test Sprint",
          workflow_step: "ACTIVE",
          is_active: true,
          is_archived: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          completed_at: null,
        },
      ];

      vi.mocked(getAllSprints).mockReturnValue(mockSprints);

      const children = provider.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0]).toMatchObject({
        type: "sprint",
        sprint: mockSprints[0],
      });
    });
  });

  describe("refresh", () => {
    it("should fire tree data change event", () => {
      const firespy = vi.spyOn(provider["_onDidChangeTreeData"], "fire");

      provider.refresh();

      expect(firespy).toHaveBeenCalled();
    });
  });

  describe("contextValue for status-based menus", () => {
    it("should set contextValue with task- prefix for all task items", () => {
      const mockTask = createMockTask({
        task_id: 1,
        title: "Test Task",
        status: "PENDING",
      });

      const taskElement = { type: "task" as const, task: mockTask };
      const treeItem = provider.getTreeItem(taskElement);

      expect(treeItem.contextValue).toBeDefined();
      expect(treeItem.contextValue).toMatch(/^task-/);
    });

    it("should set contextValue to task-pending for PENDING status", () => {
      const mockTask = createMockTask({
        task_id: 1,
        title: "Pending Task",
        status: "PENDING",
      });

      const taskElement = { type: "task" as const, task: mockTask };
      const treeItem = provider.getTreeItem(taskElement);

      expect(treeItem.contextValue).toBe("task-pending");
    });

    it("should set contextValue to task-implement for IMPLEMENT status", () => {
      const mockTask = createMockTask({
        task_id: 2,
        title: "Implementation Task",
        status: "IMPLEMENT",
      });

      const taskElement = { type: "task" as const, task: mockTask };
      const treeItem = provider.getTreeItem(taskElement);

      expect(treeItem.contextValue).toBe("task-implement");
    });

    it("should set contextValue to task-escalated for ESCALATED status", () => {
      const mockTask = createMockTask({
        task_id: 3,
        title: "Escalated Task",
        status: "ESCALATED",
      });

      const taskElement = { type: "task" as const, task: mockTask };
      const treeItem = provider.getTreeItem(taskElement);

      expect(treeItem.contextValue).toBe("task-escalated");
    });

    it("should set contextValue to task-verify_failed for VERIFY_FAILED status", () => {
      const mockTask = createMockTask({
        task_id: 4,
        title: "Failed Task",
        status: "VERIFY_FAILED",
      });

      const taskElement = { type: "task" as const, task: mockTask };
      const treeItem = provider.getTreeItem(taskElement);

      expect(treeItem.contextValue).toBe("task-verify_failed");
    });

    it("should set contextValue to task-verify for VERIFY status", () => {
      const mockTask = createMockTask({
        task_id: 5,
        title: "Verifying Task",
        status: "VERIFY",
      });

      const taskElement = { type: "task" as const, task: mockTask };
      const treeItem = provider.getTreeItem(taskElement);

      expect(treeItem.contextValue).toBe("task-verify");
    });

    it("should set contextValue to task-verify_passed for VERIFY_PASSED status", () => {
      const mockTask = createMockTask({
        task_id: 6,
        title: "Completed Task",
        status: "VERIFY_PASSED",
      });

      const taskElement = { type: "task" as const, task: mockTask };
      const treeItem = provider.getTreeItem(taskElement);

      expect(treeItem.contextValue).toBe("task-verify_passed");
    });

    it("should set contextValue to task-gate_check for GATE_CHECK status", () => {
      const mockTask = createMockTask({
        task_id: 7,
        title: "Gated Task",
        status: "GATE_CHECK",
      });

      const taskElement = { type: "task" as const, task: mockTask };
      const treeItem = provider.getTreeItem(taskElement);

      expect(treeItem.contextValue).toBe("task-gate_check");
    });

    it("should set contextValue to task-complete for COMPLETE status", () => {
      const mockTask = createMockTask({
        task_id: 8,
        title: "Complete Task",
        status: "COMPLETE",
      });

      const taskElement = { type: "task" as const, task: mockTask };
      const treeItem = provider.getTreeItem(taskElement);

      expect(treeItem.contextValue).toBe("task-complete");
    });

    it("should lowercase status in contextValue", () => {
      const statuses: Task["status"][] = [
        "PENDING",
        "IMPLEMENT",
        "VERIFY",
        "VERIFY_FAILED",
        "GATE_CHECK",
        "ESCALATED",
        "VERIFY_PASSED",
        "COMPLETE",
      ];

      statuses.forEach((status) => {
        const mockTask = createMockTask({
          task_id: 7,
          title: "Status Test",
          status,
        });

        const taskElement = { type: "task" as const, task: mockTask };
        const treeItem = provider.getTreeItem(taskElement);

        // ContextValue should be lowercase
        expect(treeItem.contextValue).toBe(`task-${status.toLowerCase()}`);
      });
    });

    it("should not set contextValue for non-task items", () => {
      const mockSprint: Sprint = {
        id: "sprint-001",
        name: "Test Sprint",
        workflow_step: "ACTIVE",
        is_active: true,
        is_archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      };

      const sprintElement = { type: "sprint" as const, sprint: mockSprint };
      const treeItem = provider.getTreeItem(sprintElement);

      // Sprint should have contextValue but not with task- prefix
      expect(treeItem.contextValue).toBeDefined();
      expect(treeItem.contextValue).not.toMatch(/^task-/);
    });
  });
});
