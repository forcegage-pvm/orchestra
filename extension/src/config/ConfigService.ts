/**
 * ConfigService - Orchestra Configuration Service
 *
 * Provides typed access to VS Code workspace configuration for Orchestra.
 * Manages model and agent configuration per role (orchestrator/implementor).
 */

import * as vscode from "vscode";

/**
 * Orchestra configuration structure
 */
export interface OrchestraConfig {
  models: {
    orchestrator: string;
    implementor: string;
  };
  agents: {
    orchestrator: string;
    implementor: string;
  };
}

/**
 * Role type for configuration lookup
 */
export type Role = "orchestrator" | "implementor";

/**
 * ConfigService provides typed access to Orchestra workspace configuration
 */
export class ConfigService {
  /**
   * Get the VS Code workspace configuration for orchestra
   */
  private getWorkspaceConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("orchestra");
  }

  /**
   * Get the configured AI model for a specific role
   * @param role - The role to get the model for (orchestrator or implementor)
   * @returns The model identifier (e.g., "claude-sonnet-4.5", "gpt-4o")
   */
  getModelForRole(role: Role): string {
    const config = this.getWorkspaceConfig();
    const defaultModel =
      role === "orchestrator" ? "claude-opus-4.5" : "claude-sonnet-4.5";
    return config.get<string>(`models.${role}`, defaultModel);
  }

  /**
   * Get the configured agent mode identifier for a specific role
   * @param role - The role to get the agent for (orchestrator or implementor)
   * @returns The agent mode identifier (e.g., "orchestra.orchestrator")
   */
  getAgentForRole(role: Role): string {
    const config = this.getWorkspaceConfig();
    const defaultAgent = `orchestra.${role}`;
    return config.get<string>(`agents.${role}`, defaultAgent);
  }

  /**
   * Get the complete Orchestra configuration
   * @returns OrchestraConfig object with models and agents for both roles
   */
  getConfig(): OrchestraConfig {
    return {
      models: {
        orchestrator: this.getModelForRole("orchestrator"),
        implementor: this.getModelForRole("implementor"),
      },
      agents: {
        orchestrator: this.getAgentForRole("orchestrator"),
        implementor: this.getAgentForRole("implementor"),
      },
    };
  }

  /**
   * Register a callback to be invoked when Orchestra configuration changes
   * @param callback - Function to call with the new configuration
   * @returns Disposable that can be used to unregister the callback
   */
  onConfigChange(
    callback: (config: OrchestraConfig) => void
  ): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((event) => {
      // Only fire callback if orchestra configuration changed
      if (event.affectsConfiguration("orchestra")) {
        callback(this.getConfig());
      }
    });
  }
}
