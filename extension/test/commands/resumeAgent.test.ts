/**
 * Resume Agent Command Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import * as sessionRepository from "../../src/agents/sessions/sessionRepository.js";
import {
  buildSessionQuickPickItems,
  handleResumeAgent,
} from "../../src/commands/resumeAgent.js";
import { getAgentRunner } from "../../src/extension.js";

vi.mock("vscode", () => ({
  window: {
    showQuickPick: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
  },
}));

vi.mock("../../src/agents/SessionStorage.js", () => ({
  SessionStorage: {
    getInstance: vi.fn(),
  },
}));

vi.mock("../../src/agents/sessions/sessionRepository.js", () => ({
  getRecentSessions: vi.fn(),
}));

vi.mock("../../src/extension.js", () => ({
  getAgentRunner: vi.fn(),
}));

describe("resumeAgent command", () => {
  const workspaceRoot = "/workspace";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should show info message when no recoverable sessions exist", async () => {
    vi.mocked(sessionRepository.getRecentSessions).mockReturnValue([]);

    await handleResumeAgent(workspaceRoot);

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining("No recoverable sessions found"),
    );
  });

  it("should present recoverable sessions with role, task, and last activity", async () => {
    const sessions = [
      {
        sessionId: "session-1",
        role: "implementor" as const,
        status: "paused" as const,
        taskId: 5,
        taskNumber: 5,
        taskTitle: "Test Task",
        sprintId: "sprint-1",
        startedAt: "2026-01-01T00:00:00Z",
        lastActivityAt: "2026-01-02T00:00:00Z",
        endedAt: undefined,
        statusMessage: undefined,
        iteration: 3,
        maxIterations: 10,
        toolCallCount: 0,
        successfulToolCalls: 0,
        failedToolCalls: 0,
        warningCount: 0,
        filesModified: [],
        durationMs: undefined,
      },
    ];

    const items = buildSessionQuickPickItems(sessions);

    vi.mocked(sessionRepository.getRecentSessions).mockReturnValue(sessions);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(items[0]);

    vi.mocked(getAgentRunner).mockReturnValue({
      getSession: vi.fn(() => undefined),
      resumeFromStorage: vi.fn().mockResolvedValue({}),
    } as never);

    await handleResumeAgent(workspaceRoot);

    expect(vscode.window.showQuickPick).toHaveBeenCalled();
    const [quickPickItems] = vi.mocked(vscode.window.showQuickPick).mock
      .calls[0] ?? [[[]]];

    expect(quickPickItems[0]?.label).toContain("Implementor");
    expect(quickPickItems[0]?.label).toContain("Task 5");
  });

  it("should resume selected session", async () => {
    const sessions = [
      {
        sessionId: "session-2",
        role: "orchestrator" as const,
        status: "stopped" as const,
        taskId: 10,
        taskNumber: undefined,
        taskTitle: undefined,
        sprintId: "sprint-2",
        startedAt: "2026-01-03T00:00:00Z",
        lastActivityAt: "2026-01-03T01:00:00Z",
        endedAt: undefined,
        statusMessage: undefined,
        iteration: 1,
        maxIterations: 10,
        toolCallCount: 0,
        successfulToolCalls: 0,
        failedToolCalls: 0,
        warningCount: 0,
        filesModified: [],
        durationMs: undefined,
      },
    ];

    const items = buildSessionQuickPickItems(sessions);

    vi.mocked(sessionRepository.getRecentSessions).mockReturnValue(sessions);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(items[0]);

    const mockResumeFromDatabase = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getAgentRunner).mockReturnValue({
      getSession: vi.fn(() => undefined),
      resumeFromDatabase: mockResumeFromDatabase,
    } as never);

    await handleResumeAgent(workspaceRoot);

    // Resume from database is called with the selected session ID
    expect(mockResumeFromDatabase).toHaveBeenCalledWith("session-2");
  });
});
