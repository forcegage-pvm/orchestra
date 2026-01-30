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

export class ProcessManager extends EventEmitter {
  private static instance: ProcessManager | null = null;

  private config: ProcessManagerConfig;
  private readonly processes = new Map<string, ManagedProcess>();

  private constructor(config: ProcessManagerConfig) {
    super();
    this.config = config;
  }

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

  public updateConfig(overrides: Partial<ProcessManagerConfig>): void {
    this.config = { ...this.config, ...overrides };
  }

  public getConfig(): ProcessManagerConfig {
    return { ...this.config };
  }

  public on(event: "output", listener: ProcessEvents["output"]): this;
  public on(event: "ready", listener: ProcessEvents["ready"]): this;
  public on(event: "exit", listener: ProcessEvents["exit"]): this;
  public on(event: "error", listener: ProcessEvents["error"]): this;
  public on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  public off(event: "output", listener: ProcessEvents["output"]): this;
  public off(event: "ready", listener: ProcessEvents["ready"]): this;
  public off(event: "exit", listener: ProcessEvents["exit"]): this;
  public off(event: "error", listener: ProcessEvents["error"]): this;
  public off(event: string, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener);
  }

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
      readyPattern: options.readyPattern,
    };

    this.processes.set(processId, managed);

    const cancelDisposable = options.token?.onCancellationRequested(() => {
      void this.stopProcess(processId, { token: options.token });
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

  public getProcessInfo(processId: string): ProcessInfo | undefined {
    return this.processes.get(processId)?.info;
  }

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

  public listProcesses(status?: ProcessStatus): ProcessInfo[] {
    const infos = Array.from(this.processes.values()).map(({ info }) => ({
      ...info,
    }));

    if (!status) {
      return infos;
    }

    return infos.filter((info) => info.status === status);
  }

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
