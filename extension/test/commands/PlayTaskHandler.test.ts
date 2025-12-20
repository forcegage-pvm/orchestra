/**
 * PlayTaskHandler Unit Tests
 *
 * Tests the PlayTaskHandler status routing logic with mocked database queries
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { handlePlayTask } from "../../src/commands/PlayTaskHandler.js";
import * as queries from "../../src/database/queries.js";

// Mock VS Code API
vi.mock("vscode", () => ({
  window: {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
  },
}));

// Mock database queries
vi.mock("../../src/database/queries.js", () => ({
  getTaskById: vi.fn(),
}));

describe("PlayTaskHandler", () => {
  const mockWorkspaceRoot = "/workspace";
  const mockTaskId = 123;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  describe("handlePlayTask", () => {
    it("should show error message when task not found", async () => {
      vi.mocked(queries.getTaskById).mockReturnValue(null);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId
      );
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        `Task ${mockTaskId} not found`
      );
    });

    it("should invoke prepare stub for PENDING task", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "feature",
        dependencies: "[]",
        speckit_task_ref: null,
        status: "PENDING",
        retry_count: 0,
        max_retries: 3,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId
      );
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        `[STUB] Would invoke orchestrator to prepare task ${mockTaskId}`
      );
    });

    it("should invoke implement stub for IMPLEMENT task", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "feature",
        dependencies: "[]",
        speckit_task_ref: null,
        status: "IMPLEMENT",
        retry_count: 0,
        max_retries: 3,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId
      );
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        `[STUB] Would invoke implementor to work on task ${mockTaskId}`
      );
    });

    it("should invoke retry stub for VERIFY_FAILED task", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "feature",
        dependencies: "[]",
        speckit_task_ref: null,
        status: "VERIFY_FAILED",
        retry_count: 1,
        max_retries: 3,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId
      );
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        `[STUB] Would invoke implementor to retry task ${mockTaskId} with feedback`
      );
    });

    it("should show escalation stub for ESCALATED task", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "feature",
        dependencies: "[]",
        speckit_task_ref: null,
        status: "ESCALATED",
        retry_count: 3,
        max_retries: 3,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId
      );
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        `[STUB] Task ${mockTaskId} is escalated - would show escalation details`
      );
    });

    it("should show info message for VERIFY task", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "feature",
        dependencies: "[]",
        speckit_task_ref: null,
        status: "VERIFY",
        retry_count: 0,
        max_retries: 3,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId
      );
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        `Task ${mockTaskId}: Test Task is already verify`
      );
    });

    it("should show info message for COMPLETE task", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "feature",
        dependencies: "[]",
        speckit_task_ref: null,
        status: "COMPLETE",
        retry_count: 0,
        max_retries: 3,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: "2025-01-02T00:00:00Z",
      };

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId
      );
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        `Task ${mockTaskId}: Test Task is already complete`
      );
    });

    it("should show warning for unexpected task status", async () => {
      const mockTask = {
        id: mockTaskId,
        sprint_id: "sprint-1",
        phase_id: 1,
        task_id: 1,
        title: "Test Task",
        description: "Test description",
        category: "feature",
        dependencies: "[]",
        speckit_task_ref: null,
        status: "UNKNOWN_STATUS",
        retry_count: 0,
        max_retries: 3,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        completed_at: null,
      };

      vi.mocked(queries.getTaskById).mockReturnValue(mockTask);

      await handlePlayTask(mockWorkspaceRoot, mockTaskId);

      expect(queries.getTaskById).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId
      );
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        `Task ${mockTaskId} has unexpected status: UNKNOWN_STATUS`
      );
    });
  });
});
