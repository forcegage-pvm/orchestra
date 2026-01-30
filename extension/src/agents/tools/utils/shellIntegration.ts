/**
 * Shell integration helper for terminal execution and output capture
 */

import * as vscode from "vscode";

export interface ExecuteInTerminalOptions {
  token: vscode.CancellationToken;
  timeoutMs: number;
  onOutput?: (chunk: string) => void;
}

export interface ExecuteInTerminalResult {
  output: string;
  exitCode: number | undefined;
  terminalId: string;
  usedShellIntegration: boolean;
}

export type ShellExecutionErrorCode = "CANCELLED" | "TIMEOUT";

export class ShellExecutionError extends Error {
  readonly code: ShellExecutionErrorCode;

  constructor(code: ShellExecutionErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ShellExecutionError";
  }
}

const terminalOutputBuffer = new Map<string, string>();

function appendTerminalOutput(terminalId: string, chunk: string): void {
  const existing = terminalOutputBuffer.get(terminalId) ?? "";
  terminalOutputBuffer.set(terminalId, `${existing}${chunk}`);
}

export function getBufferedOutput(terminalId: string): string | undefined {
  return terminalOutputBuffer.get(terminalId);
}

export function clearBufferedOutput(terminalId: string): void {
  terminalOutputBuffer.delete(terminalId);
}

export function setBufferedOutput(terminalId: string, output: string): void {
  terminalOutputBuffer.set(terminalId, output);
}

function createTimeoutPromise(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    const handle = setTimeout(() => {
      clearTimeout(handle);
      reject(new ShellExecutionError("TIMEOUT", "Command timed out"));
    }, timeoutMs);
  });
}

function isThenable(value: unknown): value is Thenable<unknown> {
  return typeof value === "object" && value !== null && "then" in value;
}

async function getExecutionExitCode(
  execution: vscode.TerminalShellExecution,
): Promise<number | undefined> {
  const exitCodeValue = (execution as { exitCode?: number | Thenable<number> })
    .exitCode;

  if (typeof exitCodeValue === "number") {
    return exitCodeValue;
  }

  if (isThenable(exitCodeValue)) {
    const resolved = await exitCodeValue;
    return typeof resolved === "number" ? resolved : undefined;
  }

  return new Promise((resolve) => {
    const disposable = vscode.window.onDidEndTerminalShellExecution((event) => {
      if (event.execution === execution) {
        disposable.dispose();
        resolve(event.exitCode ?? undefined);
      }
    });
  });
}

async function readExecutionOutput(
  execution: vscode.TerminalShellExecution,
  terminalId: string,
  options: ExecuteInTerminalOptions,
): Promise<string> {
  const outputChunks: string[] = [];

  for await (const chunk of execution.read()) {
    if (options.token.isCancellationRequested) {
      throw new ShellExecutionError("CANCELLED", "Command cancelled");
    }

    const text =
      typeof chunk === "string"
        ? chunk
        : typeof chunk?.data === "string"
          ? chunk.data
          : "";

    if (text) {
      outputChunks.push(text);
      appendTerminalOutput(terminalId, text);
      options.onOutput?.(text);
    }
  }

  return outputChunks.join("");
}

export async function executeInTerminal(
  terminal: vscode.Terminal,
  command: string,
  options: ExecuteInTerminalOptions,
): Promise<ExecuteInTerminalResult> {
  if (options.token.isCancellationRequested) {
    throw new ShellExecutionError("CANCELLED", "Command cancelled");
  }

  const terminalId = terminal.name;
  const shellIntegration = terminal.shellIntegration;

  if (!shellIntegration?.executeCommand) {
    terminal.sendText(command, true);
    return {
      output: "",
      exitCode: undefined,
      terminalId,
      usedShellIntegration: false,
    };
  }

  const execution = shellIntegration.executeCommand(command);
  const outputPromise = readExecutionOutput(execution, terminalId, options);
  const exitCodePromise = getExecutionExitCode(execution);

  const output = await Promise.race([
    outputPromise,
    createTimeoutPromise(options.timeoutMs),
  ]);
  const exitCode = await Promise.race([
    exitCodePromise,
    createTimeoutPromise(options.timeoutMs),
  ]);

  return {
    output,
    exitCode,
    terminalId,
    usedShellIntegration: true,
  };
}
