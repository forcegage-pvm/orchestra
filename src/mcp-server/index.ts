/**
 * MCP Server Entry Point
 *
 * stdio-based Model Context Protocol server for Orchestra V2.
 * Exposes 21 tools for sprint configuration, handover, signals, verification, etc.
 *
 * USAGE:
 *   node dist/mcp-server/index.js --workspace /path/to/workspace
 *   ORCHESTRA_WORKSPACE=/path/to/workspace node dist/mcp-server/index.js
 *
 * The workspace path determines where .orchestra/db/orchestra.db is located.
 * Each workspace MUST have its own isolated database.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  closeDb,
  getDbPath,
  initializeDb,
  resolveWorkspacePath,
} from "../db/index.js";
import { registerTools } from "./tools.js";

/**
 * Start the MCP server
 */
async function main() {
  // Log workspace path for debugging (to stderr so it doesn't interfere with MCP protocol)
  const workspacePath = resolveWorkspacePath();
  console.error(`[orchestra-mcp] Workspace: ${workspacePath}`);

  // Initialize database in the workspace
  await initializeDb();

  // Log resolved database path
  console.error(`[orchestra-mcp] Database: ${getDbPath()}`);

  // Create MCP server
  const server = new Server(
    {
      name: "orchestra-mcp-server",
      version: "2.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register all tools
  registerTools(server);

  // Start stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
  process.on("SIGINT", async () => {
    closeDb();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    closeDb();
    process.exit(0);
  });
}

// Start server
main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
