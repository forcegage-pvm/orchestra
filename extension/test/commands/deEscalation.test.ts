/**
 * Tests for de-escalation command handlers
 *
 * Verifies that the de-escalation commands work correctly and follow
 * the Orchestra security model (human supervisor only).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import {
  handleDeEscalateTask,
  handleForceComplete,
  handleMoveToGateCheck,
  handleMoveToImplement,
} from "../../src/commands/deEscalation.js";
import type { DatabaseWatcher } from "../../src/database/watcher.js";
import type { SprintTreeProvider } from "../../src/views/treeview/SprintTreeProvider.js";

// Mock vscode
vi.mock("vscode", () => ({
  window: {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showQuickPick: vi.fn(),
    showInputBox: vi.fn(),
  },
}));

// Mock database mutations
const mockResolveEscalation = vi.fn();
const mockGetEscalationDetails = vi.fn();
const mockUpdateTaskStatus = vi.fn();
const mockCreateResolutionSignal = vi.fn();

vi.mock("../../src/database/mutations.js", () => ({
  resolveEscalation: mockResolveEscalation,
  getEscalationDetails: mockGetEscalationDetails,
  updateTaskStatus: mockUpdateTaskStatus,
  createResolutionSignal: mockCreateResolutionSignal,
}));

// Mock logger
vi.mock("../../src/utils/logger.js", () => ({
  OrchestraLogger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe("deEscalation handlers", () => {
  const mockWorkspaceRoot = "/test/workspace";
  const mockTaskId = 42;
  let mockTreeProvider: SprintTreeProvider;
  let mockDbWatcher: DatabaseWatcher;

  beforeEach(() => {
    // Reset all mocks first
    vi.clearAllMocks();

    // Reset database mutation mocks
    mockResolveEscalation.mockReset();
    mockGetEscalationDetails.mockReset();
    mockUpdateTaskStatus.mockReset();
    mockCreateResolutionSignal.mockReset();

    // Create mock tree provider
    mockTreeProvider = {
      refresh: vi.fn(),
    } as unknown as SprintTreeProvider;

    // Create mock db watcher
    mockDbWatcher = {
      trigger: vi.fn(),
    } as unknown as DatabaseWatcher;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("handleDeEscalateTask", () => {
    it("should show error if no escalation record found", async () => {
      mockGetEscalationDetails.mockReturnValue(undefined);

      await handleDeEscalateTask(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        `Orchestra: No escalation record found for Task ${mockTaskId}`
      );
      expect(mockResolveEscalation).not.toHaveBeenCalled();
    });

    it("should handle user cancelling quick pick", async () => {
      mockGetEscalationDetails.mockReturnValue({
        reason: "Test escalation",
        attempts_summary: "Tried 3 times",
        recommended_action: "Fix verification",
        recommended_target_status: "VERIFY_FAILED",
        escalated_at: "2025-01-01T00:00:00Z",
      });

      // User cancels quick pick
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

      await handleDeEscalateTask(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(mockResolveEscalation).not.toHaveBeenCalled();
      expect(mockTreeProvider.refresh).not.toHaveBeenCalled();
    });

    it("should handle user cancelling input box", async () => {
      mockGetEscalationDetails.mockReturnValue({
        reason: "Test escalation",
        attempts_summary: "Tried 3 times",
        recommended_action: "Fix verification",
        recommended_target_status: "VERIFY_FAILED",
        escalated_at: "2025-01-01T00:00:00Z",
      });

      // User selects a status
      vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
        label: "$(debug-restart) VERIFY_FAILED",
        description: "Retry implementation with feedback",
        detail: "Task goes back to implementor for another attempt",
      });

      // User cancels input box
      vi.mocked(vscode.window.showInputBox).mockResolvedValue(undefined);

      await handleDeEscalateTask(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(mockResolveEscalation).not.toHaveBeenCalled();
      expect(mockTreeProvider.refresh).not.toHaveBeenCalled();
    });

    it("should successfully de-escalate task to VERIFY_FAILED", async () => {
      mockGetEscalationDetails.mockReturnValue({
        reason: "Test escalation",
        attempts_summary: "Tried 3 times",
        recommended_action: "Fix verification",
        recommended_target_status: "VERIFY_FAILED",
        escalated_at: "2025-01-01T00:00:00Z",
      });

      vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
        label: "$(debug-restart) VERIFY_FAILED",
        description: "Retry implementation with feedback",
        detail: "Task goes back to implementor for another attempt",
      });

      vi.mocked(vscode.window.showInputBox).mockResolvedValue(
        "Fixed verification criteria"
      );

      await handleDeEscalateTask(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(mockResolveEscalation).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId,
        "VERIFY_FAILED",
        "Fixed verification criteria",
        mockDbWatcher
      );
      expect(mockTreeProvider.refresh).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        `Orchestra: Task ${mockTaskId} de-escalated to VERIFY_FAILED`
      );
    });

    it("should successfully de-escalate task to PENDING", async () => {
      mockGetEscalationDetails.mockReturnValue({
        reason: "Test escalation",
        attempts_summary: "Tried 3 times",
        recommended_action: null,
        recommended_target_status: "PENDING",
        escalated_at: "2025-01-01T00:00:00Z",
      });

      vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
        label: "$(refresh) PENDING",
        description: "Full restart from preparation",
        detail: "Task restarts from scratch with new handover",
      });

      vi.mocked(vscode.window.showInputBox).mockResolvedValue(
        "Requirements changed significantly"
      );

      await handleDeEscalateTask(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(mockResolveEscalation).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId,
        "PENDING",
        "Requirements changed significantly",
        mockDbWatcher
      );
      expect(mockTreeProvider.refresh).toHaveBeenCalled();
    });

    it("should successfully de-escalate task to GATE_CHECK", async () => {
      mockGetEscalationDetails.mockReturnValue({
        reason: "Test escalation",
        attempts_summary: "Tried 3 times",
        recommended_action: null,
        recommended_target_status: "PENDING",
        escalated_at: "2025-01-01T00:00:00Z",
      });

      vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
        label: "$(eye) GATE_CHECK",
        description: "Re-run verification checks",
        detail: "Skip to verification (e.g., if spec was fixed)",
      });

      vi.mocked(vscode.window.showInputBox).mockResolvedValue(
        "Verification spec fixed"
      );

      await handleDeEscalateTask(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(mockResolveEscalation).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId,
        "GATE_CHECK",
        "Verification spec fixed",
        mockDbWatcher
      );
      expect(mockTreeProvider.refresh).toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      mockGetEscalationDetails.mockImplementation(() => {
        throw new Error("Database error");
      });

      await handleDeEscalateTask(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Orchestra: Failed to de-escalate task - Database error"
      );
    });
  });

  describe("handleMoveToGateCheck", () => {
    it("should handle user cancelling confirmation", async () => {
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined);

      await handleMoveToGateCheck(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(mockCreateResolutionSignal).not.toHaveBeenCalled();
      expect(mockUpdateTaskStatus).not.toHaveBeenCalled();
    });

    it("should successfully move task to GATE_CHECK", async () => {
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
        "Move to Gate Check" as never
      );

      await handleMoveToGateCheck(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(mockCreateResolutionSignal).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId,
        "Escalation resolved - moving to Gate Check for re-verification",
        mockDbWatcher
      );
      expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId,
        "GATE_CHECK",
        "Escalation resolved by human supervisor - re-verification requested",
        mockDbWatcher
      );
      expect(mockTreeProvider.refresh).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        `Orchestra: Task ${mockTaskId} moved to Gate Check. Run verification via MCP.`
      );
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
        "Move to Gate Check" as never
      );
      mockCreateResolutionSignal.mockImplementation(() => {
        throw new Error("Database error");
      });

      await handleMoveToGateCheck(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Orchestra: Failed to move task - Database error"
      );
    });
  });

  describe("handleMoveToImplement", () => {
    it("should handle user cancelling confirmation", async () => {
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined);

      await handleMoveToImplement(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(mockUpdateTaskStatus).not.toHaveBeenCalled();
    });

    it("should successfully move task to IMPLEMENT", async () => {
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
        "Move to Implement" as never
      );

      await handleMoveToImplement(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId,
        "IMPLEMENT",
        "Escalation resolved by human supervisor - re-implementation requested",
        mockDbWatcher
      );
      expect(mockTreeProvider.refresh).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        `Orchestra: Task ${mockTaskId} moved to Implement. Ready for implementor.`
      );
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
        "Move to Implement" as never
      );
      mockUpdateTaskStatus.mockImplementation(() => {
        throw new Error("Database error");
      });

      await handleMoveToImplement(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Orchestra: Failed to move task - Database error"
      );
    });
  });

  describe("handleForceComplete", () => {
    it("should handle user cancelling justification input", async () => {
      vi.mocked(vscode.window.showInputBox).mockResolvedValue(undefined);

      await handleForceComplete(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(mockUpdateTaskStatus).not.toHaveBeenCalled();
    });

    it("should handle user cancelling confirmation", async () => {
      vi.mocked(vscode.window.showInputBox).mockResolvedValue(
        "Verification criteria were incorrect and implementation is actually valid"
      );
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(undefined);

      await handleForceComplete(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(mockUpdateTaskStatus).not.toHaveBeenCalled();
    });

    it("should successfully force-complete task", async () => {
      const justification =
        "Verification criteria were incorrect and implementation is actually valid";
      vi.mocked(vscode.window.showInputBox).mockResolvedValue(justification);
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
        "Force Complete" as never
      );

      await handleForceComplete(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId,
        "COMPLETE",
        `Force completed by human supervisor: ${justification}`,
        mockDbWatcher
      );
      expect(mockTreeProvider.refresh).toHaveBeenCalled();
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        `Orchestra: Task ${mockTaskId} force-completed.`
      );
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(vscode.window.showInputBox).mockResolvedValue(
        "Verification criteria were incorrect and implementation is actually valid"
      );
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
        "Force Complete" as never
      );
      mockUpdateTaskStatus.mockImplementation(() => {
        throw new Error("Database error");
      });

      await handleForceComplete(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Orchestra: Failed to complete task - Database error"
      );
    });

    it("should validate justification length (input validation)", async () => {
      const mockValidateInput = vi.fn();
      vi.mocked(vscode.window.showInputBox).mockImplementation(
        async (options) => {
          if (options?.validateInput) {
            mockValidateInput.mockImplementation(options.validateInput);
            // Test validation
            expect(mockValidateInput("short")).toBeTruthy(); // Should return error
            expect(mockValidateInput("")).toBeTruthy(); // Should return error
            expect(
              mockValidateInput(
                "This is a sufficiently long justification text"
              )
            ).toBeNull(); // Should pass
          }
          return undefined; // User cancelled
        }
      );

      await handleForceComplete(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(mockUpdateTaskStatus).not.toHaveBeenCalled();
    });
  });

  describe("integration - dbWatcher parameter", () => {
    it("should work without dbWatcher (optional parameter)", async () => {
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
        "Move to Implement" as never
      );

      // Call without dbWatcher
      await handleMoveToImplement(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider
      );

      expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId,
        "IMPLEMENT",
        "Escalation resolved by human supervisor - re-implementation requested",
        undefined
      );
      expect(mockTreeProvider.refresh).toHaveBeenCalled();
    });

    it("should pass dbWatcher when provided", async () => {
      vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
        "Move to Implement" as never
      );

      await handleMoveToImplement(
        mockWorkspaceRoot,
        mockTaskId,
        mockTreeProvider,
        mockDbWatcher
      );

      expect(mockUpdateTaskStatus).toHaveBeenCalledWith(
        mockWorkspaceRoot,
        mockTaskId,
        "IMPLEMENT",
        "Escalation resolved by human supervisor - re-implementation requested",
        mockDbWatcher
      );
    });
  });
});
