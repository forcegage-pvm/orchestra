/**
 * Tests for StatusBarManager
 */

import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { Sprint, Task } from "../../../../src/database/queries.js";
import type { DatabaseWatcher } from "../../../../src/database/watcher.js";
import { StatusBarManager } from "../../../../src/views/statusbar/StatusBarItem.js";

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
vi.mock("../../../../src/workspace/detector.js", () => ({
  findOrchestraRoot: vi.fn(() => "/test/workspace"),
}));

// Mock queries module
vi.mock("../../../../src/database/queries.js", () => ({
  getCurrentSprint: vi.fn(() => null),
  getCurrentTask: vi.fn(() => null),
}));

// Mock statusTranslation
vi.mock("../../../../src/views/statusTranslation.js", () => ({
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
} from "../../../../src/database/queries.js";
import { getStatusDisplay } from "../../../../src/views/statusTranslation.js";
import { findOrchestraRoot } from "../../../../src/workspace/detector.js";

describe("StatusBarManager", () => {
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

  describe("initialization", () => {
    it("should create status bar item with correct configuration", () => {
      manager = new StatusBarManager(mockDb, mockDbWatcher);

      expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
        vscode.StatusBarAlignment.Left,
        100
      );
      expect(mockStatusBarItem.command).toBe("orchestra.openDashboard");
    });

    it("should subscribe to database changes", () => {
      manager = new StatusBarManager(mockDb, mockDbWatcher);

      expect(mockDbWatcher.onDidChange).toHaveBeenCalled();
    });
  });

  describe("dynamic icon display", () => {
    it("should display circle-outline icon for PENDING status", () => {
      const mockSprint: Sprint = {
        sprint_id: 1,
        title: "Test Sprint",
        started_at: "2025-01-01T00:00:00Z",
        status: "ACTIVE",
      };

      const mockTask: Task = {
        task_id: 1,
        title: "Test Task",
        status: "PENDING",
        phase_id: 1,
        dependencies: null,
        sprint_id: 1,
        priority: "P1",
        started_at: null,
        completed_at: null,
      };

      vi.mocked(getCurrentSprint).mockReturnValue(mockSprint);
      vi.mocked(getCurrentTask).mockReturnValue(mockTask);

      manager = new StatusBarManager(mockDb, mockDbWatcher);

      expect(mockStatusBarItem.text).toBe("$(circle-outline) Task 1: Ready");
      expect(getStatusDisplay).toHaveBeenCalledWith("PENDING");
    });

    it("should display play-circle icon for IMPLEMENT status", () => {
      const mockSprint: Sprint = {
        sprint_id: 1,
        title: "Test Sprint",
        started_at: "2025-01-01T00:00:00Z",
        status: "ACTIVE",
      };

      const mockTask: Task = {
        task_id: 2,
        title: "Implementation Task",
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

      expect(mockStatusBarItem.text).toBe("$(play-circle) Task 2: In Progress");
      expect(getStatusDisplay).toHaveBeenCalledWith("IMPLEMENT");
    });

    it("should display sync~spin icon for VERIFY status", () => {
      const mockSprint: Sprint = {
        sprint_id: 1,
        title: "Test Sprint",
        started_at: "2025-01-01T00:00:00Z",
        status: "ACTIVE",
      };

      const mockTask: Task = {
        task_id: 3,
        title: "Verification Task",
        status: "VERIFY",
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

      expect(mockStatusBarItem.text).toBe("$(sync~spin) Task 3: Verifying");
      expect(getStatusDisplay).toHaveBeenCalledWith("VERIFY");
    });

    it("should display warning icon for VERIFY_FAILED status", () => {
      const mockSprint: Sprint = {
        sprint_id: 1,
        title: "Test Sprint",
        started_at: "2025-01-01T00:00:00Z",
        status: "ACTIVE",
      };

      const mockTask: Task = {
        task_id: 4,
        title: "Failed Task",
        status: "VERIFY_FAILED",
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

      expect(mockStatusBarItem.text).toBe("$(warning) Task 4: Needs Attention");
      expect(getStatusDisplay).toHaveBeenCalledWith("VERIFY_FAILED");
    });

    it("should display shield icon for GATE_CHECK status", () => {
      const mockSprint: Sprint = {
        sprint_id: 1,
        title: "Test Sprint",
        started_at: "2025-01-01T00:00:00Z",
        status: "ACTIVE",
      };

      const mockTask: Task = {
        task_id: 5,
        title: "Gate Check Task",
        status: "GATE_CHECK",
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

      expect(mockStatusBarItem.text).toBe("$(shield) Task 5: Pending Review");
      expect(getStatusDisplay).toHaveBeenCalledWith("GATE_CHECK");
    });

    it("should display alert icon for ESCALATED status", () => {
      const mockSprint: Sprint = {
        sprint_id: 1,
        title: "Test Sprint",
        started_at: "2025-01-01T00:00:00Z",
        status: "ACTIVE",
      };

      const mockTask: Task = {
        task_id: 6,
        title: "Escalated Task",
        status: "ESCALATED",
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

      expect(mockStatusBarItem.text).toBe("$(alert) Task 6: Escalated");
      expect(getStatusDisplay).toHaveBeenCalledWith("ESCALATED");
    });

    it("should display check-all icon for COMPLETE status", () => {
      const mockSprint: Sprint = {
        sprint_id: 1,
        title: "Test Sprint",
        started_at: "2025-01-01T00:00:00Z",
        status: "ACTIVE",
      };

      const mockTask: Task = {
        task_id: 7,
        title: "Complete Task",
        status: "COMPLETE",
        phase_id: 1,
        dependencies: null,
        sprint_id: 1,
        priority: "P1",
        started_at: "2025-01-01T00:00:00Z",
        completed_at: "2025-01-01T12:00:00Z",
      };

      vi.mocked(getCurrentSprint).mockReturnValue(mockSprint);
      vi.mocked(getCurrentTask).mockReturnValue(mockTask);

      manager = new StatusBarManager(mockDb, mockDbWatcher);

      expect(mockStatusBarItem.text).toBe("$(check-all) Task 7: Complete");
      expect(getStatusDisplay).toHaveBeenCalledWith("COMPLETE");
    });
  });

  describe("icon format validation", () => {
    it("should format icon using VS Code codicon syntax $(icon-name)", () => {
      const mockSprint: Sprint = {
        sprint_id: 1,
        title: "Test Sprint",
        started_at: "2025-01-01T00:00:00Z",
        status: "ACTIVE",
      };

      const mockTask: Task = {
        task_id: 1,
        title: "Test Task",
        status: "PENDING",
        phase_id: 1,
        dependencies: null,
        sprint_id: 1,
        priority: "P1",
        started_at: null,
        completed_at: null,
      };

      vi.mocked(getCurrentSprint).mockReturnValue(mockSprint);
      vi.mocked(getCurrentTask).mockReturnValue(mockTask);

      manager = new StatusBarManager(mockDb, mockDbWatcher);

      // Verify icon is wrapped in $() syntax
      expect(mockStatusBarItem.text).toMatch(/^\$\([^)]+\)/);
    });

    it("should use statusDisplay.icon from getStatusDisplay", () => {
      const mockSprint: Sprint = {
        sprint_id: 1,
        title: "Test Sprint",
        started_at: "2025-01-01T00:00:00Z",
        status: "ACTIVE",
      };

      const mockTask: Task = {
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

      // Verify getStatusDisplay was called and its icon property is used
      expect(getStatusDisplay).toHaveBeenCalledWith("IMPLEMENT");
      const statusDisplay = getStatusDisplay("IMPLEMENT");
      expect(mockStatusBarItem.text).toContain(`$(${statusDisplay.icon})`);
    });
  });

  describe("color theming", () => {
    it("should maintain ThemeColor for status bar backgroundColor", () => {
      const mockSprint: Sprint = {
        sprint_id: 1,
        title: "Test Sprint",
        started_at: "2025-01-01T00:00:00Z",
        status: "ACTIVE",
      };

      const mockTask: Task = {
        task_id: 1,
        title: "Test Task",
        status: "VERIFY_FAILED",
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

      // Verify backgroundColor is set from statusDisplay.color
      expect(mockStatusBarItem.backgroundColor).toBeDefined();
      expect(mockStatusBarItem.backgroundColor).toHaveProperty("id");
    });
  });

  describe("edge cases", () => {
    it("should hide status bar when no workspace root found", () => {
      vi.mocked(findOrchestraRoot).mockReturnValue(null);

      manager = new StatusBarManager(mockDb, mockDbWatcher);

      expect(mockStatusBarItem.hide).toHaveBeenCalled();
    });

    it("should hide status bar when no active sprint", () => {
      vi.mocked(getCurrentSprint).mockReturnValue(null);

      manager = new StatusBarManager(mockDb, mockDbWatcher);

      expect(mockStatusBarItem.hide).toHaveBeenCalled();
    });

    it("should show default Orchestra status when sprint exists but no current task", () => {
      const mockSprint: Sprint = {
        sprint_id: 1,
        title: "Test Sprint",
        started_at: "2025-01-01T00:00:00Z",
        status: "ACTIVE",
      };

      vi.mocked(getCurrentSprint).mockReturnValue(mockSprint);
      vi.mocked(getCurrentTask).mockReturnValue(null);

      manager = new StatusBarManager(mockDb, mockDbWatcher);

      expect(mockStatusBarItem.text).toBe("$(rocket) Orchestra");
      expect(mockStatusBarItem.show).toHaveBeenCalled();
    });
  });

  describe("refresh functionality", () => {
    it("should update icon when task status changes", () => {
      const mockSprint: Sprint = {
        sprint_id: 1,
        title: "Test Sprint",
        started_at: "2025-01-01T00:00:00Z",
        status: "ACTIVE",
      };

      const mockTaskPending: Task = {
        task_id: 1,
        title: "Test Task",
        status: "PENDING",
        phase_id: 1,
        dependencies: null,
        sprint_id: 1,
        priority: "P1",
        started_at: null,
        completed_at: null,
      };

      vi.mocked(getCurrentSprint).mockReturnValue(mockSprint);
      vi.mocked(getCurrentTask).mockReturnValue(mockTaskPending);

      manager = new StatusBarManager(mockDb, mockDbWatcher);

      expect(mockStatusBarItem.text).toBe("$(circle-outline) Task 1: Ready");

      // Change to IMPLEMENT status
      const mockTaskImplement: Task = {
        ...mockTaskPending,
        status: "IMPLEMENT",
        started_at: "2025-01-01T00:00:00Z",
      };
      vi.mocked(getCurrentTask).mockReturnValue(mockTaskImplement);

      manager.refresh();

      expect(mockStatusBarItem.text).toBe("$(play-circle) Task 1: In Progress");
    });
  });

  describe("disposal", () => {
    it("should dispose status bar item when disposed", () => {
      manager = new StatusBarManager(mockDb, mockDbWatcher);

      manager.dispose();

      expect(mockStatusBarItem.dispose).toHaveBeenCalled();
    });
  });

  describe("command configuration for Play action", () => {
    it("should set command to playTask when current task exists", () => {
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

      expect(mockStatusBarItem.command).toEqual({
        command: "orchestra.playTask",
        title: "Play Task",
        arguments: [{ type: "task", task: { id: 42 } }],
      });
    });

    it("should pass current task ID as argument to playTask command", () => {
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
      expect(command.arguments).toBeDefined();
      expect(command.arguments[0]).toEqual({ type: "task", task: { id: 99 } });
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

      expect(mockStatusBarItem.command).toBe("orchestra.openDashboard");
    });

    it("should include Play action in tooltip when current task exists", () => {
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

      expect(mockStatusBarItem.tooltip).toContain("Click to Play task");
    });

    it("should update command when task changes during refresh", () => {
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
