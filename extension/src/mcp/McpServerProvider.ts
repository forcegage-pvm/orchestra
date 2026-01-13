/**
 * MCP Server Definition Provider
 *
 * Dynamically provides Orchestra MCP server definitions to VS Code.
 * This eliminates hardcoded paths in .vscode/mcp.json by letting the
 * extension provide correct paths at runtime.
 *
 * See: https://code.visualstudio.com/api/references/vscode-api#McpServerDefinitionProvider
 */

import * as path from "path";
import * as vscode from "vscode";

/**
 * Provider ID - must match contributes.mcpServerDefinitionProviders in package.json
 */
export const PROVIDER_ID = "orchestra.mcp-servers";

/**
 * Creates and registers the Orchestra MCP server definition provider.
 *
 * @param context Extension context (provides extension path)
 * @param workspaceRoot Workspace root path for ORCHESTRA_WORKSPACE env var
 * @returns Disposable to unregister the provider
 */
export function registerMcpServerProvider(
  context: vscode.ExtensionContext,
  workspaceRoot: string
): vscode.Disposable {
  const provider = new OrchestraMcpServerProvider(context, workspaceRoot);

  // Register with VS Code's MCP system
  return vscode.lm.registerMcpServerDefinitionProvider(PROVIDER_ID, provider);
}

/**
 * Provides Orchestra MCP server definitions (orchestrator + implementor)
 */
class OrchestraMcpServerProvider
  implements
    vscode.McpServerDefinitionProvider<vscode.McpStdioServerDefinition>
{
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly workspaceRoot: string
  ) {}

  /**
   * Provide the list of MCP servers
   */
  provideMcpServerDefinitions(
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.McpStdioServerDefinition[]> {
    // Path to the bundled MCP server in the extension
    const mcpServerPath = path.join(
      this.context.extensionPath,
      "dist",
      "mcp-server",
      "index.js"
    );

    return [
      new vscode.McpStdioServerDefinition(
        "orchestra-orc",
        "node",
        [mcpServerPath, "--role=orchestrator"],
        { ORCHESTRA_WORKSPACE: this.workspaceRoot }
      ),
      new vscode.McpStdioServerDefinition(
        "orchestra-imp",
        "node",
        [mcpServerPath, "--role=implementor"],
        { ORCHESTRA_WORKSPACE: this.workspaceRoot }
      ),
    ];
  }

  /**
   * Resolve server definition before starting (optional)
   * Can be used for authentication or validation
   */
  resolveMcpServerDefinition(
    server: vscode.McpStdioServerDefinition,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.McpStdioServerDefinition> {
    // No additional resolution needed
    return server;
  }
}
