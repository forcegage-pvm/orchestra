/**
 * ProcessManager - singleton for managing background processes
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type * as vscode from "vscode";

import type {
  ProcessEvents,
  ProcessInfo,
  ProcessManagerConfig,
  ProcessStatus,
} from "../types.js";
import { OutputBuffer } from "./OutputBuffer.js";

interface StartProcessOptions {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  readyPattern?: RegExp;
  token?: vscode.CancellationToken;
}

interface StopProcessOptions {
  gracefulTimeoutMs?: number;
  token?: vscode.CancellationToken;
}

interface GetProcessOutputOptions {
  sinceLastRead?: boolean;
  maxLines?: number;
  includeAnsi?: boolean;
}

interface ManagedProcess {
  info: ProcessInfo;
  process: ReturnType<typeof spawn>;
  buffer: OutputBuffer;
  unreadBuffer: OutputBuffer;
  cleanupTimer?: NodeJS.Timeout;
  readyPattern?: RegExp;
}

const DEFAULT_CONFIG: ProcessManagerConfig = {
  max_buffer_lines: 500,
  default_timeout_ms: 30_000,
  process_retention_ms: 300_000,
};

const ANSI_PATTERN = /\x1B\[[0-9;]*[a-zA-Z]/g;
const TRUNCATION_MESSAGE = "... output truncated ...";
const HEAD_RATIO = 0.2;

/**
 * Singleton process manager for handling background processes
 * Manages process lifecycle, output buffering, and cleanup
 */
export class ProcessManager extends EventEmitter {
  private static instance: ProcessManager | null = null;

  private config: ProcessManagerConfig;
  private readonly processes = new Map<string, ManagedProcess>();

  private constructor(config: ProcessManagerConfig) {
    super();
    this.config = config;
  }

  /**
   * Get or create the singleton ProcessManager instance
   * @param configOverrides - Optional configuration overrides
   * @returns The ProcessManager singleton instance
   */
  public static getInstance(
    configOverrides: Partial<ProcessManagerConfig> = {},
  ): ProcessManager {
    if (!ProcessManager.instance) {
      ProcessManager.instance = new ProcessManager({
        ...DEFAULT_CONFIG,
        ...configOverrides,
      });
      return ProcessManager.instance;
    }

    if (Object.keys(configOverrides).length > 0) {
      ProcessManager.instance.updateConfig(configOverrides);
    }

    return ProcessManager.instance;
  }

  /**
   * Update configuration with partial overrides
   * @param overrides - Configuration properties to override
   */
  public updateConfig(overrides: Partial<ProcessManagerConfig>): void {
    this.config = { ...this.config, ...overrides };
  }

  /**
   * Get current configuration
   * @returns Copy of current configuration
   */
  public getConfig(): ProcessManagerConfig {
    return { ...this.config };
  }

  /**
   * Register event listener (typed overloads)
   * @param event - Event name
   * @param listener - Event handler callback
   * @returns This instance for chaining
   */
  public on(event: "output", listener: ProcessEvents["output"]): this;
  public on(event: "ready", listener: ProcessEvents["ready"]): this;
  public on(event: "exit", listener: ProcessEvents["exit"]): this;
  public on(event: "error", listener: ProcessEvents["error"]): this;
  public on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  /**
   * Unregister event listener (typed overloads)
   * @param event - Event name
   * @param listener - Event handler to remove
   * @returns This instance for chaining
   */
  public off(event: "output", listener: ProcessEvents["output"]): this;
  public off(event: "ready", listener: ProcessEvents["ready"]): this;
  public off(event: "exit", listener: ProcessEvents["exit"]): this;
  public off(event: "error", listener: ProcessEvents["error"]): this;
  public off(event: string, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener);
  }

  /**
   * Emit event (typed overloads)
   * @param event - Event name
   * @param args - Event arguments
   * @returns True if event had listeners
   */
  public emit(
    event: "output",
    ...args: Parameters<ProcessEvents["output"]>
  ): boolean;
  public emit(
    event: "ready",
    ...args: Parameters<ProcessEvents["ready"]>
  ): boolean;
  public emit(
    event: "exit",
    ...args: Parameters<ProcessEvents["exit"]>
  ): boolean;
  public emit(
    event: "error",
    ...args: Parameters<ProcessEvents["error"]>
  ): boolean;
  public emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  /**
   * Start a new background process
   * @param options - Process start options
   * @param options.command - Shell command to execute
   * @param options.cwd - Working directory (defaults to process.cwd())
   * @param options.env - Environment variables to set
   * @param options.readyPattern - Optional regex to detect when process is ready
   * @param options.token - Cancellation token
   * @returns Promise resolving to process ID, info, and initial output
   * @throws {Error} If cancellation was requested before starting
   */
  public async startProcess(
    options: StartProcessOptions,
  ): Promise<{ processId: string; info: ProcessInfo; initialOutput: string }> {
    if (options.token?.isCancellationRequested) {
      throw new Error("Operation cancelled.");
    }

    const processId = randomUUID();
    const outputBuffer = new OutputBuffer({
      maxLines: this.config.max_buffer_lines,
    });
    const unreadBuffer = new OutputBuffer({
      maxLines: this.config.max_buffer_lines,
    });

    const resolvedCwd = options.cwd ?? process.cwd();

    const child = spawn(options.command, {
      cwd: resolvedCwd,
      env: {
        ...process.env,
        ...options.env,
      },
      shell: true,
    });

    const info: ProcessInfo = {
      process_id: processId,
      command: options.command,
      status: "STARTING",
      cwd: resolvedCwd,
      started_at: Date.now(),
    };

    if (child.pid) {
      info.pid = child.pid;
    }

    if (options.readyPattern) {
      info.ready_pattern = options.readyPattern.source;
    }

    const managed: ManagedProcess = {
      info,
      process: child,
      buffer: outputBuffer,
      unreadBuffer,
    };
    if (options.readyPattern !== undefined) {
      managed.readyPattern = options.readyPattern;
    }

    this.processes.set(processId, managed);

    const cancelDisposable = options.token?.onCancellationRequested(() => {
      const stopOptions: StopProcessOptions = {};
      if (options.token !== undefined) {
        stopOptions.token = options.token;
      }
      void this.stopProcess(processId, stopOptions);
    });

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString("utf8");
      outputBuffer.append(text);
      unreadBuffer.append(text);
      this.emit("output", processId, text);

      if (managed.info.status === "STARTING") {
        this.updateStatus(managed, "RUNNING");
      }

      if (managed.readyPattern && managed.readyPattern.test(text)) {
        if (managed.info.status !== "READY") {
          this.updateStatus(managed, "READY");
          this.emit("ready", processId);
        }
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString("utf8");
      outputBuffer.append(text);
      unreadBuffer.append(text);
      this.emit("output", processId, text);

      if (managed.info.status === "STARTING") {
        this.updateStatus(managed, "RUNNING");
      }

      if (managed.readyPattern && managed.readyPattern.test(text)) {
        if (managed.info.status !== "READY") {
          this.updateStatus(managed, "READY");
          this.emit("ready", processId);
        }
      }
    });

    child.on("error", (error) => {
      managed.info.exit_code = 1;
      this.updateStatus(managed, "FAILED");
      this.emit("error", processId, error);
      this.scheduleCleanup(processId);
    });

    child.on("exit", (code) => {
      if (typeof code === "number") {
        managed.info.exit_code = code;
      }
      if (code === 0) {
        this.updateStatus(managed, "STOPPED");
      } else {
        this.updateStatus(managed, "FAILED");
      }
      this.emit("exit", processId, code ?? -1);
      this.scheduleCleanup(processId);
      cancelDisposable?.dispose();
    });

    return {
      processId,
      info: managed.info,
      initialOutput: outputBuffer.getText(),
    };
  }

  /**
   * Get information about a managed process
   * @param processId - Process identifier
   * @returns Process info or undefined if not found
   */
  public getProcessInfo(processId: string): ProcessInfo | undefined {
    return this.processes.get(processId)?.info;
  }

  /**
   * Retrieve output from a managed process
   * @param processId - Process identifier
   * @param options - Output retrieval options
   * @param options.sinceLastRead - If true, only return unread output
   * @param options.maxLines - Maximum lines to return (truncates with head/tail)
   * @param options.includeAnsi - If false, strip ANSI escape codes
   * @returns Output details or undefined if process not found
   */
  public getProcessOutput(
    processId: string,
    options: GetProcessOutputOptions = {},
  ):
    | {
        output: string;
        truncated: boolean;
        linesReturned: number;
        totalLines: number;
      }
    | undefined {
    const managed = this.processes.get(processId);
    if (!managed) {
      return undefined;
    }

    const buffer = options.sinceLastRead
      ? managed.unreadBuffer
      : managed.buffer;
    const stats = buffer.getStats();
    const lines = buffer.getLines();

    let outputLines = lines;
    let truncated = stats.truncated;

    if (
      options.maxLines &&
      options.maxLines > 0 &&
      lines.length > options.maxLines
    ) {
      const headCount = Math.max(1, Math.floor(options.maxLines * HEAD_RATIO));
      const tailCount = Math.max(1, options.maxLines - headCount);
      const head = lines.slice(0, headCount);
      const tail = lines.slice(-tailCount);
      outputLines = [...head, TRUNCATION_MESSAGE, ...tail];
      truncated = true;
    }

    let outputText = outputLines.join("\n");
    if (!options.includeAnsi) {
      outputText = outputText.replace(ANSI_PATTERN, "");
    }

    if (options.sinceLastRead) {
      buffer.clear();
    }

    return {
      output: outputText,
      truncated,
      linesReturned: outputLines.length,
      totalLines: stats.lines,
    };
  }

  /**
   * List all managed processes, optionally filtered by status
   * @param status - Optional status to filter by
   * @returns Array of process info objects
   */
  public listProcesses(status?: ProcessStatus): ProcessInfo[] {
    const infos = Array.from(this.processes.values()).map(({ info }) => ({
      ...info,
    }));

    if (!status) {
      return infos;
    }

    return infos.filter((info) => info.status === status);
  }

  /**
   * Stop a managed process gracefully or forcefully
   * @param processId - Process identifier to stop
   * @param options - Stop options
   * @param options.gracefulTimeoutMs - Time to wait before force kill
   * @param options.token - Cancellation token
   * @returns Promise resolving to exit code and force kill status, or undefined if not found
   * @throws {Error} If cancellation was requested
   */
  public async stopProcess(
    processId: string,
    options: StopProcessOptions = {},
  ): Promise<{ exitCode: number; forceKilled: boolean } | undefined> {
    if (options.token?.isCancellationRequested) {
      throw new Error("Operation cancelled.");
    }

    const managed = this.processes.get(processId);
    if (!managed) {
      return undefined;
    }

    const child = managed.process;
    const gracefulTimeoutMs = options.gracefulTimeoutMs ?? 5_000;

    return new Promise((resolve) => {
      let resolved = false;
      let forceKilled = false;

      const finish = (exitCode: number | null) => {
        if (resolved) {
          return;
        }
        resolved = true;
        resolve({ exitCode: exitCode ?? -1, forceKilled });
      };

      const timeout = setTimeout(() => {
        if (child.killed) {
          return;
        }
        forceKilled = true;
        child.kill("SIGKILL");
      }, gracefulTimeoutMs);

      child.once("exit", (code) => {
        clearTimeout(timeout);
        finish(code);
      });

      if (!child.killed) {
        child.kill();
      }
    });
  }

  /**
   * Send input to a process's stdin
   * @param processId - Target process identifier
   * @param options - Input options
   * @param options.text - Text to send
   * @param options.pressEnter - If true, append newline
   * @param options.specialKey - Optional special key sequence
   * @param options.token - Cancellation token
   * @returns Promise resolving to bytes sent, or undefined if not found
   */
  public async sendInput(
    processId: string,
    options: {
      text: string;
      pressEnter?: boolean;
      specialKey?: "ctrl+c" | "ctrl+d" | "ctrl+z";
      token?: vscode.CancellationToken;
    },
  ): Promise<{ bytesSent: number } | undefined> {
    if (options.token?.isCancellationRequested) {
      throw new Error("Operation cancelled.");
    }

    const managed = this.processes.get(processId);
    if (!managed) {
      return undefined;
    }

    const child = managed.process;
    if (!child.stdin || child.stdin.destroyed) {
      throw new Error("Process stdin is not available");
    }

    let textToSend = options.text;

    // Handle special keys
    if (options.specialKey) {
      switch (options.specialKey) {
        case "ctrl+c":
          textToSend = "\x03"; // ETX (End of Text)
          break;
        case "ctrl+d":
          textToSend = "\x04"; // EOT (End of Transmission)
          break;
        case "ctrl+z":
          textToSend = "\x1a"; // SUB (Substitute)
          break;
      }
    }

    // Add newline if requested (default: true)
    if (options.pressEnter !== false && !options.specialKey) {
      textToSend += "\n";
    }

    return new Promise((resolve, reject) => {
      const bytesSent = Buffer.byteLength(textToSend);

      child.stdin!.write(textToSend, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve({ bytesSent });
        }
      });
    });
  }

  /**
   * Wait for a regex pattern to appear in process output
   * @param processId - Process to monitor
   * @param options - Wait options
   * @param options.pattern - Regex pattern to match
   * @param options.timeoutMs - Maximum wait time
   * @param options.token - Cancellation token
   * @returns Promise resolving to match result and timing
   */
  public async waitForPattern(
    processId: string,
    options: {
      pattern: RegExp;
      timeoutMs?: number;
      token?: vscode.CancellationToken;
    },
  ): Promise<{
    matched: boolean;
    matchedLine?: string;
    waitTimeMs: number;
    timedOut: boolean;
  }> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? this.config.default_timeout_ms;

    const managed = this.processes.get(processId);
    if (!managed) {
      throw new Error("Process not found");
    }

    // Check if pattern already exists in buffer
    const currentOutput = managed.buffer.getText();
    const existingMatch = currentOutput.match(options.pattern);
    if (existingMatch) {
      const lines = currentOutput.split("\n");
      const matchedLine = lines.find((line) => options.pattern.test(line));
      return {
        matched: true,
        matchedLine,
        waitTimeMs: Date.now() - startTime,
        timedOut: false,
      };
    }

    // Wait for pattern to appear in new output
    return new Promise((resolve) => {
      let timeoutHandle: NodeJS.Timeout | undefined;
      let resolved = false;

      const finish = (result: {
        matched: boolean;
        matchedLine?: string;
        waitTimeMs: number;
        timedOut: boolean;
      }) => {
        if (resolved) {
          return;
        }
        resolved = true;

        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        this.off("output", outputHandler);
        this.off("exit", exitHandler);

        resolve(result);
      };

      const outputHandler = (pid: string, data: string) => {
        if (pid !== processId) {
          return;
        }

        if (options.token?.isCancellationRequested) {
          finish({
            matched: false,
            waitTimeMs: Date.now() - startTime,
            timedOut: false,
          });
          return;
        }

        const lines = data.split("\n");
        const matchedLine = lines.find((line) => options.pattern.test(line));

        if (matchedLine) {
          finish({
            matched: true,
            matchedLine,
            waitTimeMs: Date.now() - startTime,
            timedOut: false,
          });
        }
      };

      const exitHandler = (pid: string) => {
        if (pid === processId) {
          finish({
            matched: false,
            waitTimeMs: Date.now() - startTime,
            timedOut: false,
          });
        }
      };

      this.on("output", outputHandler);
      this.on("exit", exitHandler);

      timeoutHandle = setTimeout(() => {
        finish({
          matched: false,
          waitTimeMs: Date.now() - startTime,
          timedOut: true,
        });
      }, timeoutMs);
    });
  }

  /**
   * Dispose of all managed processes and cleanup resources
   * Stops all running processes forcefully
   */
  public async dispose(): Promise<void> {
    const stopPromises: Array<Promise<unknown>> = [];

    for (const processId of this.processes.keys()) {
      stopPromises.push(
        this.stopProcess(processId, { gracefulTimeoutMs: 2_000 }),
      );
    }

    await Promise.allSettled(stopPromises);
    this.processes.clear();
  }

  private updateStatus(process: ManagedProcess, status: ProcessStatus): void {
    process.info.status = status;
  }

  private scheduleCleanup(processId: string): void {
    const managed = this.processes.get(processId);
    if (!managed) {
      return;
    }

    if (managed.cleanupTimer) {
      clearTimeout(managed.cleanupTimer);
    }

    managed.cleanupTimer = setTimeout(() => {
      this.processes.delete(processId);
    }, this.config.process_retention_ms);
  }
}
