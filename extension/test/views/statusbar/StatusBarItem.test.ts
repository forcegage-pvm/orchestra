/**
 * Tests for StatusBarItem (StatusBarManager)
 *
 * This file provides the correctly named test file for StatusBarItem.ts.
 * The StatusBarManager class is exported from StatusBarItem.ts.
 */

import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { Sprint, Task } from "../../../src/database/queries.js";
import type { DatabaseWatcher } from "../../../src/database/watcher.js";
import { StatusBarManager } from "../../../src/views/statusbar/StatusBarItem.js";

// Mock vscode module
vi.mock("vscode", () => ({
  window: {
    createStatusBarItem: vi.fn(() => ({
      text: "",
      tooltip: "",
      backgroundColor: undefined,
      command: undefined,
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  StatusBarAlignment: {
    Left: 1,
    Right: 2,
  },
  ThemeColor: vi.fn((id: string) => ({ id })),
  EventEmitter: class {
    event = vi.fn((callback: () => void) => ({ dispose: vi.fn() }));
    fire = vi.fn();
    dispose = vi.fn();
  },
}));

// Mock workspace detector
vi.mock("../../../src/workspace/detector.js", () => ({
  findOrchestraRoot: vi.fn(() => "/test/workspace"),
}));

// Mock queries module
vi.mock("../../../src/database/queries.js", () => ({
  getCurrentSprint: vi.fn(() => null),
  getCurrentTask: vi.fn(() => null),
}));

// Mock statusTranslation
vi.mock("../../../src/views/statusTranslation.js", () => ({
  getStatusDisplay: vi.fn((status: string) => {
    const statusMap: Record<
      string,
      { icon: string; label: string; color: any }
    > = {
      PENDING: {
        icon: "circle-outline",
        label: "Ready",
        color: { id: "charts.blue" },
      },
      IMPLEMENT: {
        icon: "play-circle",
        label: "In Progress",
        color: { id: "charts.purple" },
      },
      VERIFY: {
        icon: "sync~spin",
        label: "Verifying",
        color: { id: "charts.yellow" },
      },
      VERIFY_FAILED: {
        icon: "warning",
        label: "Needs Attention",
        color: { id: "charts.orange" },
      },
      GATE_CHECK: {
        icon: "shield",
        label: "Pending Review",
        color: { id: "charts.yellow" },
      },
      ESCALATED: {
        icon: "alert",
        label: "Escalated",
        color: { id: "charts.red" },
      },
      COMPLETE: {
        icon: "check-all",
        label: "Complete",
        color: { id: "charts.green" },
      },
    };
    return (
      statusMap[status] || {
        icon: "circle-outline",
        label: status,
        color: { id: "statusBarItem.warningBackground" },
      }
    );
  }),
}));

// Import mocked modules
import {
  getCurrentSprint,
  getCurrentTask,
} from "../../../src/database/queries.js";
import { findOrchestraRoot } from "../../../src/workspace/detector.js";

describe("StatusBarItem", () => {
  let manager: StatusBarManager;
  let mockDb: Database.Database;
  let mockDbWatcher: DatabaseWatcher;
  let mockStatusBarItem: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock Database
    mockDb = {} as Database.Database;

    // Mock DatabaseWatcher
    const mockEmitter = new vscode.EventEmitter<void>();
    mockDbWatcher = {
      onDidChange: mockEmitter.event,
      dispose: vi.fn(),
    } as unknown as DatabaseWatcher;

    // Create mock status bar item
    mockStatusBarItem = {
      text: "",
      tooltip: "",
      backgroundColor: undefined,
      command: undefined,
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    };

    // Mock createStatusBarItem to return our mock
    vi.mocked(vscode.window.createStatusBarItem).mockReturnValue(
      mockStatusBarItem
    );

    // Default mocks for workspace and queries
    vi.mocked(findOrchestraRoot).mockReturnValue("/test/workspace");
    vi.mocked(getCurrentSprint).mockReturnValue(null);
    vi.mocked(getCurrentTask).mockReturnValue(null);
  });

  afterEach(() => {
    if (manager) {
      manager.dispose();
    }
  });

  describe("command configuration for playTask", () => {
    it("should set statusBarItem.command to playTask with task argument when currentTask exists", () => {
      const mockSprint: Sprint = {
        sprint_id: 1,
        title: "Test Sprint",
        started_at: "2025-01-01T00:00:00Z",
        status: "ACTIVE",
      };

      const mockTask: Task = {
        id: 42,
        task_id: 1,
        title: "Test Task",
        status: "IMPLEMENT",
        phase_id: 1,
        dependencies: null,
        sprint_id: 1,
        priority: "P1",
        started_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      vi.mocked(getCurrentSprint).mockReturnValue(mockSprint);
      vi.mocked(getCurrentTask).mockReturnValue(mockTask);

      manager = new StatusBarManager(mockDb, mockDbWatcher);

      // Verify command is set to playTask with proper task argument
      expect(mockStatusBarItem.command).toEqual({
        command: "orchestra.playTask",
        title: "Play Task",
        arguments: [{ type: "task", task: { id: 42 } }],
      });
    });

    it("should set command to openDashboard when no current task", () => {
      const mockSprint: Sprint = {
        sprint_id: 1,
        title: "Test Sprint",
        started_at: "2025-01-01T00:00:00Z",
        status: "ACTIVE",
      };

      vi.mocked(getCurrentSprint).mockReturnValue(mockSprint);
      vi.mocked(getCurrentTask).mockReturnValue(null);

      manager = new StatusBarManager(mockDb, mockDbWatcher);

      // Fallback to openDashboard when no current task
      expect(mockStatusBarItem.command).toBe("orchestra.openDashboard");
    });

    it("should include 'Click to Play' in tooltip when task exists", () => {
      const mockSprint: Sprint = {
        sprint_id: 1,
        title: "Test Sprint",
        started_at: "2025-01-01T00:00:00Z",
        status: "ACTIVE",
      };

      const mockTask: Task = {
        id: 1,
        task_id: 1,
        title: "Test Task",
        status: "IMPLEMENT",
        phase_id: 1,
        dependencies: null,
        sprint_id: 1,
        priority: "P1",
        started_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      vi.mocked(getCurrentSprint).mockReturnValue(mockSprint);
      vi.mocked(getCurrentTask).mockReturnValue(mockTask);

      manager = new StatusBarManager(mockDb, mockDbWatcher);

      // Tooltip should mention Play action
      expect(mockStatusBarItem.tooltip).toContain("Click to Play");
    });

    it("should pass task ID in playTask command arguments", () => {
      const mockSprint: Sprint = {
        sprint_id: 1,
        title: "Test Sprint",
        started_at: "2025-01-01T00:00:00Z",
        status: "ACTIVE",
      };

      const mockTask: Task = {
        id: 99,
        task_id: 5,
        title: "Another Task",
        status: "PENDING",
        phase_id: 2,
        dependencies: null,
        sprint_id: 1,
        priority: "P2",
        started_at: null,
        completed_at: null,
      };

      vi.mocked(getCurrentSprint).mockReturnValue(mockSprint);
      vi.mocked(getCurrentTask).mockReturnValue(mockTask);

      manager = new StatusBarManager(mockDb, mockDbWatcher);

      const command = mockStatusBarItem.command;
      expect(command.command).toBe("orchestra.playTask");
      expect(command.arguments).toBeDefined();
      expect(command.arguments[0]).toEqual({ type: "task", task: { id: 99 } });
    });

    it("should update command from openDashboard to playTask when task becomes active", () => {
      const mockSprint: Sprint = {
        sprint_id: 1,
        title: "Test Sprint",
        started_at: "2025-01-01T00:00:00Z",
        status: "ACTIVE",
      };

      // Start with no current task
      vi.mocked(getCurrentSprint).mockReturnValue(mockSprint);
      vi.mocked(getCurrentTask).mockReturnValue(null);

      manager = new StatusBarManager(mockDb, mockDbWatcher);
      expect(mockStatusBarItem.command).toBe("orchestra.openDashboard");

      // Now a task becomes active
      const mockTask: Task = {
        id: 50,
        task_id: 3,
        title: "New Task",
        status: "IMPLEMENT",
        phase_id: 1,
        dependencies: null,
        sprint_id: 1,
        priority: "P1",
        started_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };
      vi.mocked(getCurrentTask).mockReturnValue(mockTask);

      manager.refresh();

      expect(mockStatusBarItem.command).toEqual({
        command: "orchestra.playTask",
        title: "Play Task",
        arguments: [{ type: "task", task: { id: 50 } }],
      });
    });
  });
});
