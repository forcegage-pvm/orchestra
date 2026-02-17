/**
 * ConfigService - Orchestra Configuration Service
 *
 * Provides typed access to VS Code workspace configuration for Orchestra.
 * Manages model and agent configuration per role (orchestrator/implementor/controller).
 */

import { eq } from "drizzle-orm";
import * as vscode from "vscode";
import { OrchestraDB } from "../database/client.js";
import * as schema from "../database/local-schema.js";

/**
 * Orchestra configuration structure
 */
export interface OrchestraConfig {
  models: {
    orchestrator: string;
    implementor: string;
    controller: string;
  };
  agents: {
    orchestrator: string;
    implementor: string;
    controller: string;
  };
}

/**
 * Role type for configuration lookup
 * Extended for Controller Agent: 'controller' for independent review role
 */
export type Role = "orchestrator" | "implementor" | "controller";

/**
 * ConfigService provides typed access to Orchestra workspace configuration
 */
export class ConfigService {
  private _workspaceRoot?: string;

  constructor(workspaceRoot?: string) {
    if (workspaceRoot !== undefined) {
      this._workspaceRoot = workspaceRoot;
    }
  }

  /**
   * Get the VS Code workspace configuration for orchestra
   */
  private getWorkspaceConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("orchestra");
  }

  private getDbConfigValue(key: string): string | undefined {
    if (!this._workspaceRoot) {
      return undefined;
    }

    try {
      const db = OrchestraDB.getDrizzleInstance(this._workspaceRoot);
      const rows = db
        .select()
        .from(schema.config as unknown as typeof schema.config)
        .where(eq(schema.config.key, key))
        .limit(1)
        .all() as Array<{ value: string }>;

      return rows[0]?.value;
    } catch {
      return undefined;
    }
  }

  /**
   * Get the configured AI model for a specific role
   * @param role - The role to get the model for (orchestrator, implementor, or controller)
   * @returns The model identifier (e.g., "gpt-5.2-codex")
   */
  getModelForRole(role: Role): string {
    const config = this.getWorkspaceConfig();
    // Default models per role
    const defaultModels: Record<Role, string> = {
      orchestrator: "claude-opus-4.5",
      implementor: "claude-sonnet-4.5",
      controller: "claude-opus-4.5",
    };
    const dbValue = this.getDbConfigValue(`models.${role}`);
    if (dbValue) {
      return dbValue;
    }
    return config.get<string>(`models.${role}`, defaultModels[role]);
  }

  /**
   * Get the configured agent mode identifier for a specific role
   * @param role - The role to get the agent for (orchestrator, implementor, or controller)
   * @returns The agent mode identifier (e.g., "orchestra.orchestrator")
   */
  getAgentForRole(role: Role): string {
    const config = this.getWorkspaceConfig();
    const defaultAgent = `orchestra.${role}`;
    return config.get<string>(`agents.${role}`, defaultAgent);
  }

  /**
   * Get the complete Orchestra configuration
   * @returns OrchestraConfig object with models and agents for all roles
   */
  getConfig(): OrchestraConfig {
    return {
      models: {
        orchestrator: this.getModelForRole("orchestrator"),
        implementor: this.getModelForRole("implementor"),
        controller: this.getModelForRole("controller"),
      },
      agents: {
        orchestrator: this.getAgentForRole("orchestrator"),
        implementor: this.getAgentForRole("implementor"),
        controller: this.getAgentForRole("controller"),
      },
    };
  }

  /**
   * Get the configured maximum iterations for agent runs
   * Reads from DB config table (key: agent.max_iterations), falls back to 80
   */
  getMaxIterations(): number {
    const dbValue = this.getDbConfigValue("agent.max_iterations");
    if (dbValue) {
      const parsed = parseInt(dbValue, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return 80;
  }

  /**
   * Register a callback to be invoked when Orchestra configuration changes
   * @param callback - Function to call with the new configuration
   * @returns Disposable that can be used to unregister the callback
   */
  onConfigChange(
    callback: (config: OrchestraConfig) => void,
  ): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((event) => {
      // Only fire callback if orchestra configuration changed
      if (event.affectsConfiguration("orchestra")) {
        callback(this.getConfig());
      }
    });
  }
}
