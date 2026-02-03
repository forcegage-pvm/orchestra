/**
 * Resume Agent Command Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { SessionStorage } from "../../src/agents/SessionStorage.js";
import type { SessionMetadata } from "../../src/agents/types.js";
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
  },
}));

vi.mock("../../src/agents/SessionStorage.js", () => ({
  SessionStorage: {
    getInstance: vi.fn(),
  },
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
    vi.mocked(SessionStorage.getInstance).mockReturnValue({
      getRecoverableSessions: vi.fn().mockResolvedValue([]),
    } as never);

    await handleResumeAgent(workspaceRoot);

    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Orchestra: No recoverable sessions found.",
    );
  });

  it("should present recoverable sessions with role, task, and last activity", async () => {
    const sessions: SessionMetadata[] = [
      {
        id: "session-1",
        role: "implementor",
        status: "paused",
        taskId: 5,
        sprintId: "sprint-1",
        updatedAt: "2026-01-01T00:00:00Z",
        lastActivityAt: "2026-01-02T00:00:00Z",
        currentIteration: 3,
      },
    ];

    const items = buildSessionQuickPickItems(sessions);

    vi.mocked(SessionStorage.getInstance).mockReturnValue({
      getRecoverableSessions: vi.fn().mockResolvedValue(sessions),
    } as never);

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
    expect(quickPickItems[0]?.description).toContain("2026-01-02T00:00:00Z");
  });

  it("should resume selected session", async () => {
    const sessions: SessionMetadata[] = [
      {
        id: "session-2",
        role: "orchestrator",
        status: "stopped",
        taskId: null,
        sprintId: "sprint-2",
        updatedAt: "2026-01-03T00:00:00Z",
        lastActivityAt: "2026-01-03T01:00:00Z",
        currentIteration: 1,
      },
    ];

    const items = buildSessionQuickPickItems(sessions);
    const resumeFromStorage = vi.fn().mockResolvedValue({});

    vi.mocked(SessionStorage.getInstance).mockReturnValue({
      getRecoverableSessions: vi.fn().mockResolvedValue(sessions),
    } as never);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(items[0]);

    vi.mocked(getAgentRunner).mockReturnValue({
      getSession: vi.fn(() => undefined),
      resumeFromStorage,
    } as never);

    await handleResumeAgent(workspaceRoot);

    expect(resumeFromStorage).toHaveBeenCalledWith("session-2");
  });
});
