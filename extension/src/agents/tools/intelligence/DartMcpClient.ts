/**
 * DartMcpClient - Manages a connection to the `dart mcp-server` child process.
 *
 * Uses @modelcontextprotocol/sdk v1.x to communicate with the Dart analysis
 * server over stdio. The Dart MCP server ships as part of the Dart SDK since
 * version 3.9 and exposes semantic analysis capabilities (go-to-definition,
 * static analysis) over the MCP protocol.
 *
 * Lifecycle:
 *   1. probe()   - check if `dart mcp-server` is available (exits 0)
 *   2. connect() - idempotent connect; safe to call from activate()
 *   3. callTool() - invoke a dart mcp-server tool; lazily connects on first use
 *   4. dispose() - cleanly closes connection and kills child process
 *
 * Crash recovery: if the server process exits unexpectedly, the client
 * schedules a reconnect up to MAX_RESTARTS=3 times with RESTART_DELAY_MS=2000.
 * After exhaustion, status becomes "failed" and all callTool() calls return
 * graceful error results (no throws).
 *
 * Graceful degradation: if `dart` is not in PATH or the SDK version does not
 * support `dart mcp-server`, probe() returns false, status becomes "unavailable",
 * and all callTool() calls return a clear unavailability result.
 */

import { spawn } from "node:child_process";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// ============================================================================
// Types
// ============================================================================

export type DartMcpStatus =
  | "not_checked"
  | "unavailable" // dart not in PATH or dart mcp-server not supported
  | "connecting"
  | "connected"
  | "failed"; // exceeded MAX_RESTARTS

export interface DartMcpCallResult {
  success: boolean;
  content: Array<{ type: string; text?: string }>;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_RESTARTS = 3;
const RESTART_DELAY_MS = 2000;
const PROBE_TIMEOUT_MS = 5000;

// ============================================================================
// Module-level singleton (matches ProcessManager.getInstance() pattern)
// ============================================================================

let _globalClient: DartMcpClient | undefined;

/** Set the global DartMcpClient singleton. Called by extension.ts on activate. */
export function setGlobalDartMcpClient(client: DartMcpClient | undefined): void {
  _globalClient = client;
}

/** Get the global DartMcpClient singleton. Called by tool invoke() methods. */
export function getGlobalDartMcpClient(): DartMcpClient | undefined {
  return _globalClient;
}

// ============================================================================
// DartMcpClient class
// ============================================================================

/** Minimal logger interface to avoid importing VS Code logger type here */
export interface DartClientLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, ...args: unknown[]): void;
}

export class DartMcpClient {
  private client: Client | undefined;
  private transport: StdioClientTransport | undefined;
  private status: DartMcpStatus = "not_checked";
  private restartCount = 0;
  private disposed = false;
  /** Guard: if a connect is in flight, await it rather than starting another */
  private connectPromise: Promise<void> | undefined;

  constructor(
    private readonly dartExecutable: string,
    private readonly workspaceRoot: string,
    private readonly logger: DartClientLogger,
  ) {}

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Probe whether `dart mcp-server` is available.
   * Spawns `dart mcp-server --help` with a 5s timeout and checks exit code.
   * Sets status to "unavailable" on failure.
   */
  async probe(): Promise<boolean> {
    try {
      const exitCode = await this.spawnProbe();
      if (exitCode === 0) {
        this.logger.info("DartMcpClient: dart mcp-server probe succeeded");
        return true;
      }
      this.logger.warn(
        `DartMcpClient: dart mcp-server probe failed (exit ${exitCode}) — Dart SDK 3.9+ required`,
      );
      this.status = "unavailable";
      return false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`DartMcpClient: probe error — ${msg}`);
      this.status = "unavailable";
      return false;
    }
  }

  /**
   * Connect to dart mcp-server. Idempotent — safe to call multiple times.
   * If status is already "connected", returns immediately.
   * If a connect is already in flight, awaits it.
   * Probes first if status is "not_checked".
   */
  async connect(): Promise<void> {
    if (this.disposed) return;
    if (this.status === "connected") return;
    if (this.status === "unavailable" || this.status === "failed") return;

    // If there is already a connect in flight, share it
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = this.doConnect();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = undefined;
    }
  }

  /**
   * Call a tool on the dart mcp-server.
   * Returns a graceful DartMcpCallResult (never throws) when unavailable.
   * Lazily connects if status is "not_checked".
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<DartMcpCallResult> {
    if (this.disposed) {
      return {
        success: false,
        content: [],
        error: "DartMcpClient has been disposed.",
      };
    }

    // Lazy connect on first use
    if (this.status === "not_checked") {
      await this.connect();
    }

    if (this.status === "unavailable") {
      return {
        success: false,
        content: [],
        error:
          "dart mcp-server is not available. Ensure Dart SDK 3.9+ is installed and 'dart' is in PATH.",
      };
    }

    if (this.status === "failed") {
      return {
        success: false,
        content: [],
        error: `dart mcp-server is unavailable after ${MAX_RESTARTS} restart attempts. Reload the window to retry.`,
      };
    }

    if (this.status !== "connected" || !this.client) {
      return {
        success: false,
        content: [],
        error: "dart mcp-server is not connected. Retrying in background.",
      };
    }

    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: args,
      });

      // MCP SDK v1.x returns { content: Array<{ type, text?, ... }> }
      const content = Array.isArray(result.content)
        ? (result.content as Array<{ type: string; text?: string }>)
        : [];

      return { success: true, content };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`DartMcpClient: callTool "${toolName}" failed — ${msg}`);

      // If this looks like a connection error, trigger reconnect
      if (this.looksLikeConnectionError(err)) {
        this.scheduleRestart();
      }

      return {
        success: false,
        content: [],
        error: `dart mcp-server tool "${toolName}" failed: ${msg}`,
      };
    }
  }

  /** Returns true if the client is currently connected and usable. */
  isAvailable(): boolean {
    return this.status === "connected" && !this.disposed && !!this.client;
  }

  /** Get the current status. */
  getStatus(): DartMcpStatus {
    return this.status;
  }

  /**
   * Dispose the client. Closes the MCP connection and kills the child process.
   * After dispose(), all callTool() calls return graceful error results.
   */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.status = "unavailable";

    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // Ignore close errors during dispose
      }
      this.client = undefined;
      this.transport = undefined;
    }

    this.logger.info("DartMcpClient: disposed");
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private async doConnect(): Promise<void> {
    if (this.status !== "not_checked" && this.status !== "connecting") {
      // Already connecting, connected, unavailable or failed
      if (this.status !== "connected") {
        // Start fresh after a crash restart
        this.status = "connecting";
      }
    } else {
      this.status = "connecting";
    }

    // Probe if we haven't yet
    if (this.status === "connecting" && this.restartCount === 0) {
      const available = await this.probe();
      if (!available) return; // probe() set status = "unavailable"
    }

    if (this.disposed) return;

    try {
      this.transport = new StdioClientTransport({
        command: this.dartExecutable,
        args: ["mcp-server"],
        cwd: this.workspaceRoot,
        env: { ...process.env } as Record<string, string>,
      });

      this.client = new Client({
        name: "orchestra-dart-intelligence",
        version: "1.0.0",
      });

      await this.client.connect(this.transport);
      this.status = "connected";
      this.restartCount = 0; // reset on successful connect
      this.logger.info("DartMcpClient: connected to dart mcp-server");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`DartMcpClient: connect failed — ${msg}`);
      this.client = undefined;
      this.transport = undefined;
      this.scheduleRestart();
    }
  }

  private scheduleRestart(): void {
    if (this.disposed) return;

    if (this.restartCount >= MAX_RESTARTS) {
      this.status = "failed";
      this.logger.error(
        `DartMcpClient: exceeded MAX_RESTARTS (${MAX_RESTARTS}), giving up. Reload window to retry.`,
      );
      return;
    }

    this.restartCount++;
    this.status = "connecting";
    this.client = undefined;
    this.transport = undefined;

    this.logger.warn(
      `DartMcpClient: dart mcp-server disconnected, scheduling restart ${this.restartCount}/${MAX_RESTARTS} in ${RESTART_DELAY_MS}ms`,
    );

    setTimeout(() => {
      if (!this.disposed) {
        this.doConnect().catch((err) => {
          this.logger.error(
            `DartMcpClient: restart ${this.restartCount} failed — ${err instanceof Error ? err.message : String(err)}`,
          );
          this.scheduleRestart();
        });
      }
    }, RESTART_DELAY_MS);
  }

  /**
   * Probe whether `dart mcp-server --help` exits with code 0.
   * Uses a raw child_process.spawn to avoid MCP SDK overhead during probe.
   */
  private spawnProbe(): Promise<number> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const child = spawn(this.dartExecutable, ["mcp-server", "--help"], {
        cwd: this.workspaceRoot,
        stdio: "ignore",
        shell: process.platform === "win32",
      });

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill();
          resolve(1); // treat timeout as failure
        }
      }, PROBE_TIMEOUT_MS);

      child.on("error", (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });

      child.on("exit", (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(code ?? 1);
        }
      });
    });
  }

  /**
   * Heuristic: detect if an error from callTool looks like a broken connection.
   */
  private looksLikeConnectionError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return (
      msg.includes("connection") ||
      msg.includes("transport") ||
      msg.includes("closed") ||
      msg.includes("econnreset") ||
      msg.includes("epipe") ||
      msg.includes("socket")
    );
  }
}

