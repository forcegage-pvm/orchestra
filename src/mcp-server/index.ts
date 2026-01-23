/**
 * MCP Server Entry Point
 *
 * stdio-based Model Context Protocol server for Orchestra V2.
 * Supports role-based tool filtering via --role flag.
 *
 * USAGE:
 *   node dist/mcp-server/index.js --workspace /path/to/workspace
 *   node dist/mcp-server/index.js --role=orchestrator
 *   node dist/mcp-server/index.js --role=implementor
 *   ORCHESTRA_WORKSPACE=/path/to/workspace node dist/mcp-server/index.js
 *
 * ROLES:
 *   orchestrator - Tools for task preparation, verification, judgment
 *   implementor  - Tools for task execution, signaling completion
 *   full         - All tools (default, for development/testing)
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
  runMigrationsV2,
} from "../db/index.js";
import { registerTools, type ServerRole } from "./tools.js";

/**
 * Parse --role flag from command line arguments
 */
function parseRole(): ServerRole {
  const roleArg = process.argv.find((arg) => arg.startsWith("--role="));
  if (!roleArg) {
    return "full";
  }
  const role = roleArg.split("=")[1];
  if (
    role === "orchestrator" ||
    role === "implementor" ||
    role === "controller" ||
    role === "full"
  ) {
    return role;
  }
  console.error(
    `[orchestra-mcp] Invalid role "${role}", using "full". Valid: orchestrator, implementor, controller, full`,
  );
  return "full";
}

/**
 * Start the MCP server
 */
async function main() {
  // Parse role from CLI
  const role = parseRole();

  // Log workspace path for debugging (to stderr so it doesn't interfere with MCP protocol)
  const workspacePath = resolveWorkspacePath();
  console.error(`[orchestra-mcp] Workspace: ${workspacePath}`);
  console.error(`[orchestra-mcp] Role: ${role}`);

  // Initialize database in the workspace
  await initializeDb();

  // Run any pending migrations
  const migrations = await runMigrationsV2();
  if (migrations.applied > 0) {
    console.error(`[orchestra-mcp] Applied ${migrations.applied} migration(s)`);
  }

  // Log resolved database path
  console.error(`[orchestra-mcp] Database: ${getDbPath()}`);

  // Create MCP server with role-specific name
  const serverName =
    role === "full" ? "orchestra-mcp-server" : `orchestra-${role}`;
  const server = new Server(
    {
      name: serverName,
      version: "2.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Register tools filtered by role
  registerTools(server, role);

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
