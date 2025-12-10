/**
 * MCP Config Generator
 *
 * Generates workspace-local MCP server configuration (.orchestra/mcp-config.json)
 * pointing to the bundled MCP server. Auto-generates on extension activation
 * if the config doesn't exist or if the extension version has changed.
 */

import * as fs from "fs";
import * as path from "path";
import { WorkspaceError } from "../utils/errors.js";
import type { OrchestraLogger } from "../utils/logger.js";

interface MCPServerConfig {
  type: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
  generatedBy: string;
  version: string;
  timestamp: string;
}

export class ConfigGenerator {
  constructor(
    private readonly workspaceRoot: string,
    private readonly extensionPath: string,
    private readonly extensionVersion: string,
    private readonly logger: OrchestraLogger
  ) {}

  /**
   * Get the path to the MCP config file
   */
  getMcpConfigPath(): string {
    return path.join(this.workspaceRoot, ".orchestra", "mcp-config.json");
  }

  /**
   * Get the path to the bundled MCP server
   */
  private getMcpServerPath(): string {
    return path.join(this.extensionPath, "dist", "mcp-server", "index.js");
  }

  /**
   * Check if config needs to be generated or updated
   */
  private shouldGenerateConfig(): boolean {
    const configPath = this.getMcpConfigPath();

    // Generate if config doesn't exist
    if (!fs.existsSync(configPath)) {
      this.logger.info("MCP config not found, will generate");
      return true;
    }

    // Generate if version has changed
    try {
      const existing = JSON.parse(
        fs.readFileSync(configPath, "utf-8")
      ) as MCPConfig;
      if (existing.version !== this.extensionVersion) {
        this.logger.info(
          `MCP config version mismatch (${existing.version} -> ${this.extensionVersion}), will regenerate`
        );
        return true;
      }
    } catch (error) {
      this.logger.warn("Failed to read existing MCP config, will regenerate", {
        error,
      });
      return true;
    }

    return false;
  }

  /**
   * Generate MCP config file
   */
  async generateConfig(): Promise<void> {
    if (!this.shouldGenerateConfig()) {
      this.logger.info("MCP config is up to date, skipping generation");
      return;
    }

    const configPath = this.getMcpConfigPath();
    const serverPath = this.getMcpServerPath();

    // Verify bundled MCP server exists
    if (!fs.existsSync(serverPath)) {
      throw new WorkspaceError(
        "Bundled MCP server not found. Extension may be corrupted.",
        { expectedPath: serverPath }
      );
    }

    // Ensure .orchestra directory exists
    const orchestraDir = path.dirname(configPath);
    if (!fs.existsSync(orchestraDir)) {
      fs.mkdirSync(orchestraDir, { recursive: true });
    }

    // Build config
    const config: MCPConfig = {
      mcpServers: {
        "orchestra-orchestrator": {
          type: "stdio",
          command: "node",
          args: [serverPath, "--role=orchestrator"],
          env: {
            ORCHESTRA_WORKSPACE: this.workspaceRoot,
          },
        },
        "orchestra-implementor": {
          type: "stdio",
          command: "node",
          args: [serverPath, "--role=implementor"],
          env: {
            ORCHESTRA_WORKSPACE: this.workspaceRoot,
          },
        },
      },
      generatedBy: "Orchestra VS Code Extension",
      version: this.extensionVersion,
      timestamp: new Date().toISOString(),
    };

    // Write config
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

    this.logger.info(`MCP config generated successfully at ${configPath}`);
  }
}

/**
 * Generate MCP config (convenience function)
 */
export async function generateMcpConfig(
  workspaceRoot: string,
  extensionPath: string,
  extensionVersion: string,
  logger: OrchestraLogger
): Promise<void> {
  const generator = new ConfigGenerator(
    workspaceRoot,
    extensionPath,
    extensionVersion,
    logger
  );
  await generator.generateConfig();
}
