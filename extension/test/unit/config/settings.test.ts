/**
 * Tests for settings helpers
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { getVerbosity } from "../../../src/config/settings.js";

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(),
  },
}));

describe("settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns default verbosity when not configured", () => {
    const config = {
      get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
    };

    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
      config as unknown as vscode.WorkspaceConfiguration,
    );

    const verbosity = getVerbosity();

    expect(config.get).toHaveBeenCalledWith("agents.verbosity", "normal");
    expect(verbosity).toBe("normal");
  });

  it("returns configured verbosity when set", () => {
    const config = {
      get: vi.fn((key: string, defaultValue?: unknown) => {
        if (key === "agents.verbosity") {
          return "debug";
        }
        return defaultValue;
      }),
    };

    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(
      config as unknown as vscode.WorkspaceConfiguration,
    );

    const verbosity = getVerbosity();

    expect(verbosity).toBe("debug");
  });
});
