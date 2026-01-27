import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const showQuickPick = vi.fn();
  const showErrorMessage = vi.fn();
  const showInformationMessage = vi.fn();
  const selectChatModels = vi.fn();
  const update = vi.fn();
  const getConfiguration = vi.fn(() => ({
    update,
    inspect: vi.fn(),
  }));

  return {
    showQuickPick,
    showErrorMessage,
    showInformationMessage,
    selectChatModels,
    update,
    getConfiguration,
  };
});

vi.mock("vscode", () => ({
  window: {
    showQuickPick: mocks.showQuickPick,
    showErrorMessage: mocks.showErrorMessage,
    showInformationMessage: mocks.showInformationMessage,
  },
  lm: {
    selectChatModels: mocks.selectChatModels,
  },
  workspace: {
    getConfiguration: mocks.getConfiguration,
  },
  ConfigurationTarget: {
    Workspace: 2,
  },
}));

import { handleSelectModel, isModelSelectionRequired } from "../../src/commands/selectModel.js";

beforeEach(() => {
  mocks.showQuickPick.mockReset();
  mocks.showErrorMessage.mockReset();
  mocks.showInformationMessage.mockReset();
  mocks.selectChatModels.mockReset();
  mocks.update.mockReset();
  mocks.getConfiguration.mockClear();
});

describe("handleSelectModel", () => {
  it("selects role and model and saves config", async () => {
    mocks.selectChatModels.mockResolvedValue([
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "claude-opus-4.5", name: "Claude Opus 4.5" },
    ]);

    mocks.showQuickPick
      .mockImplementationOnce((items: Array<{ value: string }>) =>
        items.find((item) => item.value === "orchestrator"),
      )
      .mockImplementationOnce((items: Array<{ value: string }>) =>
        items.find((item) => item.value === "gpt-4o"),
      );

    await handleSelectModel();

    expect(mocks.update).toHaveBeenCalledWith(
      "models.orchestrator",
      "gpt-4o",
      2,
    );
    expect(mocks.showInformationMessage).toHaveBeenCalled();
  });

  it("returns when role selection is cancelled", async () => {
    mocks.showQuickPick.mockResolvedValue(undefined);

    await handleSelectModel();

    expect(mocks.selectChatModels).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns when model selection is cancelled", async () => {
    mocks.selectChatModels.mockResolvedValue([
      { id: "gpt-4o", name: "GPT-4o" },
    ]);

    mocks.showQuickPick
      .mockImplementationOnce((items: Array<{ value: string }>) =>
        items.find((item) => item.value === "implementor"),
      )
      .mockResolvedValueOnce(undefined);

    await handleSelectModel();

    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("shows error when no models are available", async () => {
    mocks.selectChatModels.mockResolvedValue([]);

    mocks.showQuickPick.mockImplementationOnce(
      (items: Array<{ value: string }>) =>
        items.find((item) => item.value === "controller"),
    );

    await handleSelectModel();

    expect(mocks.showErrorMessage).toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("isModelSelectionRequired", () => {
  it("returns true when no explicit config is set", () => {
    const config = {
      inspect: vi.fn().mockReturnValue({
        workspaceValue: undefined,
        globalValue: undefined,
        defaultValue: "claude-opus-4.5",
      }),
    };

    expect(isModelSelectionRequired("orchestrator", config)).toBe(true);
  });

  it("returns false when explicit config is set", () => {
    const config = {
      inspect: vi.fn().mockReturnValue({
        workspaceValue: "gpt-4o",
        globalValue: undefined,
        defaultValue: "claude-opus-4.5",
      }),
    };

    expect(isModelSelectionRequired("implementor", config)).toBe(false);
  });

  it("returns true when explicit config is empty", () => {
    const config = {
      inspect: vi.fn().mockReturnValue({
        workspaceValue: "",
        globalValue: undefined,
        defaultValue: "claude-opus-4.5",
      }),
    };

    expect(isModelSelectionRequired("controller", config)).toBe(true);
  });
});
