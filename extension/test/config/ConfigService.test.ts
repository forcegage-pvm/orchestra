/**
 * Tests for ConfigService
 *
 * Verifies that ConfigService correctly wraps VS Code workspace configuration
 * and provides typed access to orchestra.models.* and orchestra.agents.* settings.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ConfigService } from "../../src/config/ConfigService.js";

// Mock VS Code workspace configuration
vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: vi.fn(),
    onDidChangeConfiguration: vi.fn(),
  },
  Disposable: class {
    dispose() {}
  },
}));

describe("ConfigService", () => {
  let service: ConfigService;
  let mockConfig: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup mock configuration
    mockConfig = {
      get: vi.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          "models.orchestrator": "claude-opus-4.5",
          "models.implementor": "claude-sonnet-4.5",
          "agents.orchestrator": "orchestra.orchestrator",
          "agents.implementor": "orchestra.implementor",
        };
        return config[key] ?? defaultValue;
      }),
    };

    (vscode.workspace.getConfiguration as any).mockReturnValue(mockConfig);

    service = new ConfigService();
  });

  describe("getModelForRole", () => {
    it("returns orchestrator model when role is orchestrator", () => {
      const model = service.getModelForRole("orchestrator");
      expect(model).toBe("claude-opus-4.5");
      expect(mockConfig.get).toHaveBeenCalledWith(
        "models.orchestrator",
        "claude-opus-4.5"
      );
    });

    it("returns implementor model when role is implementor", () => {
      const model = service.getModelForRole("implementor");
      expect(model).toBe("claude-sonnet-4.5");
      expect(mockConfig.get).toHaveBeenCalledWith(
        "models.implementor",
        "claude-sonnet-4.5"
      );
    });

    it("returns custom configured model", () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "models.orchestrator") return "gpt-4o";
        return "claude-sonnet-4";
      });

      const model = service.getModelForRole("orchestrator");
      expect(model).toBe("gpt-4o");
    });
  });

  describe("getAgentForRole", () => {
    it("returns orchestrator agent when role is orchestrator", () => {
      const agent = service.getAgentForRole("orchestrator");
      expect(agent).toBe("orchestra.orchestrator");
      expect(mockConfig.get).toHaveBeenCalledWith(
        "agents.orchestrator",
        "orchestra.orchestrator"
      );
    });

    it("returns implementor agent when role is implementor", () => {
      const agent = service.getAgentForRole("implementor");
      expect(agent).toBe("orchestra.implementor");
      expect(mockConfig.get).toHaveBeenCalledWith(
        "agents.implementor",
        "orchestra.implementor"
      );
    });

    it("returns custom configured agent", () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "agents.implementor") return "custom.implementor.agent";
        return "orchestra.orchestrator.agent";
      });

      const agent = service.getAgentForRole("implementor");
      expect(agent).toBe("custom.implementor.agent");
    });
  });

  describe("getConfig", () => {
    it("returns OrchestraConfig object with models and agents properties", () => {
      const config = service.getConfig();

      expect(config).toEqual({
        models: {
          orchestrator: "claude-opus-4.5",
          implementor: "claude-sonnet-4.5",
          controller: "claude-opus-4.5",
        },
        agents: {
          orchestrator: "orchestra.orchestrator",
          implementor: "orchestra.implementor",
          controller: "orchestra.controller",
        },
      });
    });

    it("returns custom configured values", () => {
      mockConfig.get.mockImplementation((key: string) => {
        const customConfig: Record<string, any> = {
          "models.orchestrator": "gpt-4o",
          "models.implementor": "claude-3-opus",
          "agents.orchestrator": "custom.orchestrator",
          "agents.implementor": "custom.implementor",
        };
        return customConfig[key];
      });

      const config = service.getConfig();

      expect(config).toEqual({
        models: {
          orchestrator: "gpt-4o",
          implementor: "claude-3-opus",
        },
        agents: {
          orchestrator: "custom.orchestrator",
          implementor: "custom.implementor",
        },
      });
    });
  });

  describe("onConfigChange", () => {
    it("returns a Disposable", () => {
      (vscode.workspace.onDidChangeConfiguration as any).mockReturnValue(
        new vscode.Disposable(() => {})
      );

      const callback = vi.fn();
      const disposable = service.onConfigChange(callback);

      expect(disposable).toBeDefined();
      expect(disposable.dispose).toBeInstanceOf(Function);
    });

    it("registers listener for configuration changes", () => {
      (vscode.workspace.onDidChangeConfiguration as any).mockReturnValue(
        new vscode.Disposable(() => {})
      );

      const callback = vi.fn();
      service.onConfigChange(callback);

      expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalled();
    });

    it("fires callback when orchestra configuration changes", () => {
      const callback = vi.fn();
      let changeListener:
        | ((e: vscode.ConfigurationChangeEvent) => void)
        | null = null;

      (vscode.workspace.onDidChangeConfiguration as any).mockImplementation(
        (listener: (e: vscode.ConfigurationChangeEvent) => void) => {
          changeListener = listener;
          return new vscode.Disposable(() => {});
        }
      );

      service.onConfigChange(callback);

      // Simulate configuration change for orchestra settings
      const mockEvent = {
        affectsConfiguration: (section: string) =>
          section.startsWith("orchestra"),
      } as vscode.ConfigurationChangeEvent;

      changeListener?.(mockEvent);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          models: expect.any(Object),
          agents: expect.any(Object),
        })
      );
    });

    it("does not fire callback when non-orchestra configuration changes", () => {
      const callback = vi.fn();
      let changeListener:
        | ((e: vscode.ConfigurationChangeEvent) => void)
        | null = null;

      (vscode.workspace.onDidChangeConfiguration as any).mockImplementation(
        (listener: (e: vscode.ConfigurationChangeEvent) => void) => {
          changeListener = listener;
          return new vscode.Disposable(() => {});
        }
      );

      service.onConfigChange(callback);

      // Simulate configuration change for non-orchestra settings
      const mockEvent = {
        affectsConfiguration: (section: string) =>
          section === "editor.fontSize",
      } as vscode.ConfigurationChangeEvent;

      changeListener?.(mockEvent);

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
