/**
 * MCP Server Manager
 *
 * Manages lifecycle of orchestrator and implementor MCP servers.
 * Handles start, stop, restart, and crash recovery.
 */

import * as cp from "child_process";
import * as path from "path";
import { MCPServerError } from "../utils/errors.js";
import type { OrchestraLogger } from "../utils/logger.js";

export type MCPServerRole = "orchestrator" | "implementor";

interface ServerProcess {
  role: MCPServerRole;
  process: cp.ChildProcess;
  restartCount: number;
}

export class MCPServerManager {
  private servers = new Map<MCPServerRole, ServerProcess>();
  private readonly maxRestarts = 3;
  private readonly restartDelay = 5000; // 5 seconds

  constructor(
    private readonly workspaceRoot: string,
    private readonly _extensionPath: string,
    private readonly logger: OrchestraLogger
  ) {}

  /**
   * Start MCP server for given role
   */
  startServer(role: MCPServerRole): void {
    // Stop existing server if running
    if (this.servers.has(role)) {
      this.stopServer(role);
    }

    try {
      // Path to MCP server entry point (bundled with extension)
      const serverScript = path.join(
        this._extensionPath,
        "dist",
        "mcp-server",
        "index.js"
      );

      // Spawn server process with workspace as env var
      const proc = cp.spawn("node", [serverScript, "--role", role], {
        cwd: this.workspaceRoot,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          ORCHESTRA_WORKSPACE: this.workspaceRoot,
        },
      });

      this.logger.info(`MCP server started: ${role}`, { pid: proc.pid });

      // Log stdout
      proc.stdout?.on("data", (data) => {
        this.logger.debug(`[MCP ${role}] ${data.toString().trim()}`);
      });

      // Log stderr
      proc.stderr?.on("data", (data) => {
        this.logger.warn(`[MCP ${role}] ${data.toString().trim()}`);
      });

      // Handle unexpected exit
      proc.on("exit", (code, signal) => {
        this.handleExit(role, code, signal);
      });

      // Store process
      this.servers.set(role, {
        role,
        process: proc,
        restartCount: 0,
      });
    } catch (error) {
      throw new MCPServerError(`Failed to start MCP server: ${role}`, {
        role,
        error,
      });
    }
  }

  /**
   * Stop MCP server for given role
   */
  stopServer(role: MCPServerRole): void {
    const server = this.servers.get(role);
    if (!server) {
      return;
    }

    this.logger.info(`Stopping MCP server: ${role}`);

    try {
      server.process.kill("SIGTERM");
      this.servers.delete(role);
    } catch (error) {
      this.logger.error(`Failed to stop MCP server: ${role}`, error);
    }
  }

  /**
   * Restart MCP server
   */
  restartServer(role: MCPServerRole): void {
    this.logger.info(`Restarting MCP server: ${role}`);
    this.stopServer(role);

    setTimeout(() => {
      this.startServer(role);
    }, 1000);
  }

  /**
   * Stop all MCP servers
   */
  stopAllServers(): void {
    this.logger.info("Stopping all MCP servers");
    for (const role of this.servers.keys()) {
      this.stopServer(role);
    }
  }

  /**
   * Handle server exit (crash recovery)
   */
  private handleExit(
    role: MCPServerRole,
    code: number | null,
    signal: string | null
  ): void {
    const server = this.servers.get(role);
    if (!server) {
      return;
    }

    // Clean exit (code 0) - don't restart
    if (code === 0) {
      this.logger.info(`MCP server exited cleanly: ${role}`);
      this.servers.delete(role);
      return;
    }

    // Unexpected exit - attempt restart
    this.logger.warn(`MCP server crashed: ${role}`, { code, signal });

    // Check restart limit
    if (server.restartCount >= this.maxRestarts) {
      this.logger.error(`MCP server exceeded max restarts: ${role}`, {
        restartCount: server.restartCount,
      });
      this.servers.delete(role);
      return;
    }

    // Schedule restart
    this.logger.info(
      `Restarting MCP server in ${this.restartDelay}ms: ${role}`
    );
    setTimeout(() => {
      this.startServer(role);
      const updatedServer = this.servers.get(role);
      if (updatedServer) {
        updatedServer.restartCount = server.restartCount + 1;
      }
    }, this.restartDelay);
  }

  /**
   * Check if server is running
   */
  isRunning(role: MCPServerRole): boolean {
    const server = this.servers.get(role);
    return server !== undefined && !server.process.killed;
  }

  /**
   * Get server status
   */
  getStatus(): Record<
    MCPServerRole,
    { running: boolean; restartCount: number }
  > {
    return {
      orchestrator: {
        running: this.isRunning("orchestrator"),
        restartCount: this.servers.get("orchestrator")?.restartCount ?? 0,
      },
      implementor: {
        running: this.isRunning("implementor"),
        restartCount: this.servers.get("implementor")?.restartCount ?? 0,
      },
    };
  }
}
