/**
 * Set Verbosity Command Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { handleSetVerbosity } from "../../src/commands/setVerbosity.js";
import { getVerbosity } from "../../src/config/settings.js";

vi.mock("vscode", () => ({
  window: {
    showQuickPick: vi.fn(),
    showInformationMessage: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(),
  },
  ConfigurationTarget: {
    Workspace: 2,
  },
}));

vi.mock("../../src/config/settings.js", () => ({
  getVerbosity: vi.fn(() => "normal"),
}));

describe("setVerbosity command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when selection is cancelled", async () => {
    const update = vi.fn();
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      update,
    } as unknown as vscode.WorkspaceConfiguration);

    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

    await handleSetVerbosity();

    expect(update).not.toHaveBeenCalled();
  });

  it("updates configuration with selected verbosity", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      update,
    } as unknown as vscode.WorkspaceConfiguration);

    vi.mocked(getVerbosity).mockReturnValue("normal");

    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({
      label: "Debug",
      value: "debug",
    } as any);

    await handleSetVerbosity();

    expect(update).toHaveBeenCalledWith(
      "agents.verbosity",
      "debug",
      vscode.ConfigurationTarget.Workspace,
    );
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      "Orchestra: Verbosity set to Debug.",
    );
  });

  it("picks the current verbosity by default", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      update,
    } as unknown as vscode.WorkspaceConfiguration);

    vi.mocked(getVerbosity).mockReturnValue("detailed");

    vi.mocked(vscode.window.showQuickPick).mockResolvedValue(undefined);

    await handleSetVerbosity();

    const [items] = vi.mocked(vscode.window.showQuickPick).mock.calls[0] ?? [
      [],
    ];
    const picked = items.filter((item: { picked?: boolean }) => item.picked);

    expect(picked).toHaveLength(1);
    expect(picked[0]?.value).toBe("detailed");
  });
});
