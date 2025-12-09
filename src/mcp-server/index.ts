/**
 * MCP Server Entry Point
 *
 * stdio-based Model Context Protocol server for Orchestra V2.
 * Exposes 21 tools for sprint configuration, handover, signals, verification, etc.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { closeDb, initializeDb } from "../db/index.js";
import { registerTools } from "./tools.js";

/**
 * Start the MCP server
 */
async function main() {
  // Initialize database
  await initializeDb();

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
