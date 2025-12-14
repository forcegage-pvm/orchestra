/**
 * Tests for SprintTreeProvider
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type Database from "better-sqlite3";
import type { DatabaseWatcher } from "../../../src/database/watcher.js";
import { SprintTreeProvider } from "../../../src/views/treeview/SprintTreeProvider.js";
import type { Sprint, Phase, Task } from "../../../src/database/queries.js";

// Mock vscode module
vi.mock("vscode", () => ({
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  TreeItem: vi.fn(function (this: any, label: string, collapsibleState: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
    this.iconPath = undefined;
    this.tooltip = undefined;
    this.resourceUri = undefined;
    return this;
  }),
  ThemeIcon: vi.fn((id: string) => ({ id })),
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
  EventEmitter: vi.fn(() => ({
    event: vi.fn(),
    fire: vi.fn(),
    dispose: vi.fn(),
  })),
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
}));

// Mock ViewDecorationProvider
vi.mock("../../../src/views/providers/ViewDecorationProvider.js", () => ({
  createTaskDecorationUri: vi.fn((taskId: number) => ({
    toString: () => `orchestra-task://${taskId}`,
  })),
}));

// Mock statusTranslation
vi.mock("../../../src/views/statusTranslation.js", () => ({
  getStatusDisplay: vi.fn((status: string) => ({
    icon: "circle",
    label: status,
  })),
}));

// Import mocked modules
import { findOrchestraRoot } from "../../../src/workspace/detector.js";
import {
  getAllSprints,
  getPhases,
  getTasksForSprint,
} from "../../../src/database/queries.js";

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

    provider = new SprintTreeProvider(mockDb, mockDbWatcher);

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
      expect(tooltip.value).toContain("VERIFY");
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
        "This is my detailed task description with important info"
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

      // Should have status in code formatting
      expect(tooltip.value).toMatch(/`IMPLEMENT`/);

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
});
