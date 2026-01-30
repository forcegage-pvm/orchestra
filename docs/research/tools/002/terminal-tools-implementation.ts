/**
 * Terminal Tools for AI Coding Agents
 * 
 * A comprehensive set of tools for executing commands, managing long-running
 * processes, capturing output, and handling interactive terminal sessions.
 */

import { spawn, ChildProcess, SpawnOptions, execSync } from 'child_process';
import { EventEmitter } from 'events';

// ============================================================
// TYPES
// ============================================================

type ProcessStatus = 
  | 'starting'    // Process spawned, waiting for ready signal
  | 'running'     // Process running normally
  | 'ready'       // Process signaled ready (for servers)
  | 'completed'   // Process exited with code 0
  | 'failed'      // Process exited with non-zero code
  | 'killed'      // Process was terminated by agent
  | 'timeout';    // Process was killed due to timeout

interface ProcessInfo {
  id: string;
  name: string;
  command: string;
  args: string[];
  workingDir: string;
  status: ProcessStatus;
  pid: number;
  startedAt: Date;
  endedAt?: Date;
  exitCode?: number;
  port?: number;
  outputBuffer: string[];
  errorBuffer: string[];
  lastReadIndex: number;
}

interface RunCommandInput {
  command: string;
  working_dir?: string;
  timeout_ms?: number;
  background?: boolean;
  capture_output?: boolean;
  stdin?: string;
  env?: Record<string, string>;
}

interface RunCommandResult {
  success: boolean;
  exit_code?: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  timed_out: boolean;
  process_id?: string;
  status?: ProcessStatus;
}

interface StartProcessInput {
  command: string;
  working_dir?: string;
  name?: string;
  ready_pattern?: string;
  ready_timeout_ms?: number;
  env?: Record<string, string>;
}

interface StartProcessResult {
  process_id: string;
  name: string;
  status: ProcessStatus;
  pid: number;
  port?: number;
  initial_output: string;
}

interface GetOutputInput {
  process_id: string;
  since_last_read?: boolean;
  max_lines?: number;
  filter_pattern?: string;
  include_stderr?: boolean;
}

interface GetOutputResult {
  process_id: string;
  status: ProcessStatus;
  exit_code?: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  lines_omitted?: number;
}

interface StopProcessInput {
  process_id: string;
  signal?: 'SIGTERM' | 'SIGKILL' | 'SIGINT';
  timeout_ms?: number;
  force_after_timeout?: boolean;
}

interface StopProcessResult {
  process_id: string;
  status: 'stopped' | 'force_killed' | 'already_stopped' | 'not_found';
  exit_code?: number;
  final_output: string;
}

interface SendInputInput {
  process_id: string;
  input: string;
  press_enter?: boolean;
  special_key?: 'ctrl+c' | 'ctrl+d' | 'ctrl+z';
}

interface SendInputResult {
  success: boolean;
  output_after: string;
  status: ProcessStatus;
}

interface WaitForPatternInput {
  process_id: string;
  pattern: string;
  timeout_ms?: number;
  in_stderr?: boolean;
}

interface WaitForPatternResult {
  found: boolean;
  matched_line?: string;
  wait_time_ms: number;
  timed_out: boolean;
}

interface FindPortProcessInput {
  port: number;
}

interface FindPortProcessResult {
  in_use: boolean;
  process_id?: string;
  pid?: number;
  command?: string;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function generateId(): string {
  return `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function parseCommand(command: string): { cmd: string; args: string[] } {
  // Simple command parsing - split on spaces, handle quotes
  const parts: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';
  
  for (const char of command) {
    if ((char === '"' || char === "'") && !inQuote) {
      inQuote = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuote) {
      inQuote = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuote) {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  
  return { cmd: parts[0], args: parts.slice(1) };
}

function cleanOutput(raw: string): string {
  let output = raw;
  
  // Remove ANSI escape codes
  output = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  
  // Collapse carriage returns (progress bars)
  output = output.replace(/[^\n]*\r(?!\n)/g, '');
  
  // Remove null bytes
  output = output.replace(/\0/g, '');
  
  return output;
}

function truncateOutput(
  lines: string[], 
  maxLines: number
): { output: string; truncated: boolean; omitted: number } {
  if (lines.length <= maxLines) {
    return { output: lines.join('\n'), truncated: false, omitted: 0 };
  }
  
  const headLines = Math.floor(maxLines * 0.2);
  const tailLines = maxLines - headLines - 1;
  
  const head = lines.slice(0, headLines);
  const tail = lines.slice(-tailLines);
  const omitted = lines.length - headLines - tailLines;
  
  return {
    output: [
      ...head,
      `\n[... ${omitted} lines omitted ...]\n`,
      ...tail
    ].join('\n'),
    truncated: true,
    omitted
  };
}

function detectPort(output: string): number | undefined {
  // Common patterns for port detection
  const patterns = [
    /(?:listening|running|started|server)\s+(?:on|at)\s+(?:port\s+)?(\d+)/i,
    /localhost:(\d+)/i,
    /127\.0\.0\.1:(\d+)/i,
    /0\.0\.0\.0:(\d+)/i,
    /port\s*[=:]\s*(\d+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return undefined;
}

// ============================================================
// PROCESS MANAGER
// ============================================================

class ProcessManager extends EventEmitter {
  private processes: Map<string, ProcessInfo> = new Map();
  private childProcesses: Map<string, ChildProcess> = new Map();
  private maxOutputLines: number = 10000;
  
  constructor() {
    super();
    this.setupCleanup();
  }
  
  private setupCleanup(): void {
    const cleanup = () => {
      this.killAll();
      process.exit(0);
    };
    
    process.on('exit', () => this.killAll());
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', (err) => {
      console.error('Uncaught exception:', err);
      this.killAll();
      process.exit(1);
    });
  }
  
  killAll(): void {
    for (const [id, proc] of this.childProcesses) {
      try {
        proc.kill('SIGKILL');
      } catch (e) {
        // Process may already be dead
      }
    }
    this.childProcesses.clear();
  }
  
  getProcess(id: string): ProcessInfo | undefined {
    return this.processes.get(id);
  }
  
  getAllProcesses(): ProcessInfo[] {
    return Array.from(this.processes.values());
  }
  
  // --------------------------------------------------------
  // Tool 1: run_command - Synchronous command execution
  // --------------------------------------------------------
  async runCommand(input: RunCommandInput): Promise<RunCommandResult> {
    const startTime = Date.now();
    const timeout = input.timeout_ms ?? 30000;
    const { cmd, args } = parseCommand(input.command);
    
    const spawnOptions: SpawnOptions = {
      cwd: input.working_dir || process.cwd(),
      env: { ...process.env, ...input.env },
      shell: true,
    };
    
    // For background execution, use start_process instead
    if (input.background) {
      const result = await this.startProcess({
        command: input.command,
        working_dir: input.working_dir,
        env: input.env,
      });
      return {
        success: true,
        stdout: result.initial_output,
        stderr: '',
        duration_ms: Date.now() - startTime,
        timed_out: false,
        process_id: result.process_id,
        status: result.status,
      };
    }
    
    return new Promise((resolve) => {
      const child = spawn(cmd, args, spawnOptions);
      
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 1000);
      }, timeout);
      
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      if (input.stdin) {
        child.stdin?.write(input.stdin);
        child.stdin?.end();
      }
      
      child.on('close', (code) => {
        clearTimeout(timer);
        const duration = Date.now() - startTime;
        
        resolve({
          success: code === 0 && !timedOut,
          exit_code: code ?? undefined,
          stdout: cleanOutput(stdout),
          stderr: cleanOutput(stderr),
          duration_ms: duration,
          timed_out: timedOut,
        });
      });
      
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          success: false,
          stdout: cleanOutput(stdout),
          stderr: `Error: ${err.message}\n${cleanOutput(stderr)}`,
          duration_ms: Date.now() - startTime,
          timed_out: false,
        });
      });
    });
  }
  
  // --------------------------------------------------------
  // Tool 2: start_process - Background process management
  // --------------------------------------------------------
  async startProcess(input: StartProcessInput): Promise<StartProcessResult> {
    const id = generateId();
    const { cmd, args } = parseCommand(input.command);
    const name = input.name || cmd;
    
    const spawnOptions: SpawnOptions = {
      cwd: input.working_dir || process.cwd(),
      env: { ...process.env, ...input.env },
      shell: true,
      detached: false,
    };
    
    const child = spawn(cmd, args, spawnOptions);
    
    const info: ProcessInfo = {
      id,
      name,
      command: cmd,
      args,
      workingDir: input.working_dir || process.cwd(),
      status: 'starting',
      pid: child.pid || 0,
      startedAt: new Date(),
      outputBuffer: [],
      errorBuffer: [],
      lastReadIndex: 0,
    };
    
    this.processes.set(id, info);
    this.childProcesses.set(id, child);
    
    // Capture output
    child.stdout?.on('data', (data) => {
      const text = cleanOutput(data.toString());
      const lines = text.split('\n').filter(l => l.length > 0);
      info.outputBuffer.push(...lines);
      
      // Limit buffer size
      if (info.outputBuffer.length > this.maxOutputLines) {
        info.outputBuffer = info.outputBuffer.slice(-this.maxOutputLines);
      }
      
      // Detect port
      if (!info.port) {
        info.port = detectPort(text);
      }
      
      this.emit('output', id, text);
    });
    
    child.stderr?.on('data', (data) => {
      const text = cleanOutput(data.toString());
      const lines = text.split('\n').filter(l => l.length > 0);
      info.errorBuffer.push(...lines);
      
      if (info.errorBuffer.length > this.maxOutputLines) {
        info.errorBuffer = info.errorBuffer.slice(-this.maxOutputLines);
      }
      
      this.emit('error', id, text);
    });
    
    child.on('close', (code) => {
      info.endedAt = new Date();
      info.exitCode = code ?? undefined;
      info.status = code === 0 ? 'completed' : 'failed';
      this.childProcesses.delete(id);
      this.emit('exit', id, code);
    });
    
    child.on('error', (err) => {
      info.status = 'failed';
      info.errorBuffer.push(`Process error: ${err.message}`);
      this.emit('process-error', id, err);
    });
    
    // Wait for ready pattern if specified
    if (input.ready_pattern) {
      const readyTimeout = input.ready_timeout_ms ?? 30000;
      const pattern = new RegExp(input.ready_pattern);
      
      try {
        await this.waitForPatternInternal(id, pattern, readyTimeout);
        info.status = 'ready';
      } catch (e) {
        // Timeout waiting for ready - process may still be starting
        info.status = 'running';
      }
    } else {
      // Give process a moment to start
      await new Promise(resolve => setTimeout(resolve, 100));
      if (info.status === 'starting') {
        info.status = 'running';
      }
    }
    
    // Get initial output
    const initialLines = info.outputBuffer.slice(0, 20);
    
    return {
      process_id: id,
      name,
      status: info.status,
      pid: info.pid,
      port: info.port,
      initial_output: initialLines.join('\n'),
    };
  }
  
  // --------------------------------------------------------
  // Tool 3: get_process_output - Fetch output from process
  // --------------------------------------------------------
  getProcessOutput(input: GetOutputInput): GetOutputResult {
    const info = this.processes.get(input.process_id);
    
    if (!info) {
      return {
        process_id: input.process_id,
        status: 'failed',
        stdout: '',
        stderr: 'Process not found',
        truncated: false,
      };
    }
    
    const sinceLastRead = input.since_last_read ?? true;
    const maxLines = input.max_lines ?? 500;
    const includeStderr = input.include_stderr ?? true;
    
    // Get stdout
    let stdoutLines: string[];
    if (sinceLastRead) {
      stdoutLines = info.outputBuffer.slice(info.lastReadIndex);
      info.lastReadIndex = info.outputBuffer.length;
    } else {
      stdoutLines = [...info.outputBuffer];
    }
    
    // Apply filter if specified
    if (input.filter_pattern) {
      const pattern = new RegExp(input.filter_pattern);
      stdoutLines = stdoutLines.filter(line => pattern.test(line));
    }
    
    // Truncate if needed
    const { output: stdout, truncated, omitted } = truncateOutput(stdoutLines, maxLines);
    
    // Get stderr
    let stderr = '';
    if (includeStderr && info.errorBuffer.length > 0) {
      const stderrLines = sinceLastRead 
        ? info.errorBuffer.slice(-20)  // Last 20 error lines
        : info.errorBuffer;
      stderr = stderrLines.join('\n');
    }
    
    return {
      process_id: input.process_id,
      status: info.status,
      exit_code: info.exitCode,
      stdout,
      stderr,
      truncated,
      lines_omitted: omitted,
    };
  }
  
  // --------------------------------------------------------
  // Tool 4: list_processes - Get all managed processes
  // --------------------------------------------------------
  listProcesses(includeCompleted: boolean = false): ProcessInfo[] {
    const processes = this.getAllProcesses();
    
    if (includeCompleted) {
      return processes;
    }
    
    return processes.filter(p => 
      p.status === 'running' || 
      p.status === 'ready' || 
      p.status === 'starting'
    );
  }
  
  // --------------------------------------------------------
  // Tool 5: stop_process - Terminate a process
  // --------------------------------------------------------
  async stopProcess(input: StopProcessInput): Promise<StopProcessResult> {
    const info = this.processes.get(input.process_id);
    const child = this.childProcesses.get(input.process_id);
    
    if (!info) {
      return {
        process_id: input.process_id,
        status: 'not_found',
        final_output: '',
      };
    }
    
    if (!child || info.status === 'completed' || info.status === 'failed' || info.status === 'killed') {
      return {
        process_id: input.process_id,
        status: 'already_stopped',
        exit_code: info.exitCode,
        final_output: info.outputBuffer.slice(-10).join('\n'),
      };
    }
    
    const signal = input.signal ?? 'SIGTERM';
    const timeout = input.timeout_ms ?? 5000;
    const forceAfterTimeout = input.force_after_timeout ?? true;
    
    // Send initial signal
    child.kill(signal);
    info.status = 'killed';
    
    // Wait for process to exit
    const exitPromise = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), timeout);
      
      child.on('close', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    
    const exitedGracefully = await exitPromise;
    
    if (!exitedGracefully && forceAfterTimeout) {
      child.kill('SIGKILL');
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return {
        process_id: input.process_id,
        status: 'force_killed',
        exit_code: info.exitCode,
        final_output: info.outputBuffer.slice(-10).join('\n'),
      };
    }
    
    return {
      process_id: input.process_id,
      status: 'stopped',
      exit_code: info.exitCode,
      final_output: info.outputBuffer.slice(-10).join('\n'),
    };
  }
  
  // --------------------------------------------------------
  // Tool 6: send_input - Send input to running process
  // --------------------------------------------------------
  async sendInput(input: SendInputInput): Promise<SendInputResult> {
    const info = this.processes.get(input.process_id);
    const child = this.childProcesses.get(input.process_id);
    
    if (!info || !child) {
      return {
        success: false,
        output_after: 'Process not found',
        status: 'failed',
      };
    }
    
    if (!child.stdin) {
      return {
        success: false,
        output_after: 'Process stdin not available',
        status: info.status,
      };
    }
    
    // Handle special keys
    if (input.special_key) {
      const signals: Record<string, NodeJS.Signals> = {
        'ctrl+c': 'SIGINT',
        'ctrl+d': 'SIGTERM',  // EOF
        'ctrl+z': 'SIGTSTP',
      };
      
      if (input.special_key === 'ctrl+c' || input.special_key === 'ctrl+z') {
        child.kill(signals[input.special_key]);
      } else if (input.special_key === 'ctrl+d') {
        child.stdin.end();
      }
    } else {
      // Send regular input
      let text = input.input;
      if (input.press_enter !== false) {
        text += '\n';
      }
      child.stdin.write(text);
    }
    
    // Wait briefly for response
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Get any new output
    const recentOutput = info.outputBuffer.slice(-10).join('\n');
    
    return {
      success: true,
      output_after: recentOutput,
      status: info.status,
    };
  }
  
  // --------------------------------------------------------
  // Tool 7: wait_for_pattern - Wait for output matching pattern
  // --------------------------------------------------------
  async waitForPattern(input: WaitForPatternInput): Promise<WaitForPatternResult> {
    const startTime = Date.now();
    const timeout = input.timeout_ms ?? 30000;
    const pattern = new RegExp(input.pattern);
    
    const info = this.processes.get(input.process_id);
    
    if (!info) {
      return {
        found: false,
        wait_time_ms: 0,
        timed_out: false,
      };
    }
    
    try {
      const matchedLine = await this.waitForPatternInternal(
        input.process_id, 
        pattern, 
        timeout,
        input.in_stderr
      );
      
      return {
        found: true,
        matched_line: matchedLine,
        wait_time_ms: Date.now() - startTime,
        timed_out: false,
      };
    } catch (e) {
      return {
        found: false,
        wait_time_ms: Date.now() - startTime,
        timed_out: true,
      };
    }
  }
  
  private waitForPatternInternal(
    processId: string, 
    pattern: RegExp, 
    timeout: number,
    inStderr: boolean = false
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const info = this.processes.get(processId);
      if (!info) {
        reject(new Error('Process not found'));
        return;
      }
      
      // Check existing output first
      const buffer = inStderr ? info.errorBuffer : info.outputBuffer;
      for (const line of buffer) {
        if (pattern.test(line)) {
          resolve(line);
          return;
        }
      }
      
      // Set up listener for new output
      const eventName = inStderr ? 'error' : 'output';
      
      const timer = setTimeout(() => {
        this.removeListener(eventName, handler);
        reject(new Error('Timeout'));
      }, timeout);
      
      const handler = (id: string, text: string) => {
        if (id !== processId) return;
        
        for (const line of text.split('\n')) {
          if (pattern.test(line)) {
            clearTimeout(timer);
            this.removeListener(eventName, handler);
            resolve(line);
            return;
          }
        }
      };
      
      this.on(eventName, handler);
      
      // Also check for process exit
      this.on('exit', (id: string) => {
        if (id === processId) {
          clearTimeout(timer);
          this.removeListener(eventName, handler);
          reject(new Error('Process exited'));
        }
      });
    });
  }
  
  // --------------------------------------------------------
  // Tool 8: find_port_process - Find process using a port
  // --------------------------------------------------------
  findPortProcess(input: FindPortProcessInput): FindPortProcessResult {
    const { port } = input;
    
    // Check our managed processes first
    for (const [id, info] of this.processes) {
      if (info.port === port && info.status === 'running') {
        return {
          in_use: true,
          process_id: id,
          pid: info.pid,
          command: info.command,
        };
      }
    }
    
    // Check system processes
    try {
      let output: string;
      if (process.platform === 'win32') {
        output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' });
        const match = output.match(/:${port}\s+.*LISTENING\s+(\d+)/);
        if (match) {
          return {
            in_use: true,
            pid: parseInt(match[1], 10),
          };
        }
      } else {
        output = execSync(`lsof -i:${port} -t 2>/dev/null || true`, { encoding: 'utf-8' });
        const pid = parseInt(output.trim(), 10);
        if (!isNaN(pid)) {
          // Get command name
          try {
            const cmdOutput = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf-8' });
            return {
              in_use: true,
              pid,
              command: cmdOutput.trim(),
            };
          } catch {
            return { in_use: true, pid };
          }
        }
      }
    } catch {
      // Port likely not in use
    }
    
    return { in_use: false };
  }
}

// ============================================================
// TOOL DEFINITIONS (for MCP/VS Code extension registration)
// ============================================================

const processManager = new ProcessManager();

export const terminalTools = {
  run_command: {
    name: 'run_command',
    description: `Execute a shell command and return the result.
    
For quick commands that complete within the timeout. For long-running processes 
(dev servers, watchers), use start_process instead.

Features:
- Configurable timeout (default: 30s)
- Captures stdout and stderr
- Supports stdin input
- Environment variable injection
- Clear exit status reporting`,
    
    inputSchema: {
      type: 'object',
      properties: {
        command: { 
          type: 'string', 
          description: 'The shell command to execute' 
        },
        working_dir: { 
          type: 'string', 
          description: 'Working directory for the command' 
        },
        timeout_ms: { 
          type: 'number', 
          description: 'Timeout in milliseconds (default: 30000)' 
        },
        stdin: { 
          type: 'string', 
          description: 'Input to send to stdin' 
        },
        env: { 
          type: 'object', 
          description: 'Additional environment variables' 
        },
      },
      required: ['command'],
    },
    
    execute: (input: RunCommandInput) => processManager.runCommand(input),
  },
  
  start_process: {
    name: 'start_process',
    description: `Start a long-running background process.
    
Use for dev servers, file watchers, and other persistent processes.
Returns immediately with a process ID for later management.

Features:
- Non-blocking execution
- Optional ready pattern detection (e.g., "Server running on port")
- Automatic port detection
- Named processes for easy reference`,
    
    inputSchema: {
      type: 'object',
      properties: {
        command: { 
          type: 'string', 
          description: 'The command to start' 
        },
        working_dir: { 
          type: 'string', 
          description: 'Working directory' 
        },
        name: { 
          type: 'string', 
          description: 'Human-readable name for the process' 
        },
        ready_pattern: { 
          type: 'string', 
          description: 'Regex pattern that indicates the process is ready' 
        },
        ready_timeout_ms: { 
          type: 'number', 
          description: 'How long to wait for ready signal (default: 30000)' 
        },
        env: { 
          type: 'object', 
          description: 'Additional environment variables' 
        },
      },
      required: ['command'],
    },
    
    execute: (input: StartProcessInput) => processManager.startProcess(input),
  },
  
  get_process_output: {
    name: 'get_process_output',
    description: `Get output from a running or completed background process.
    
By default, returns only new output since the last read (incremental).
Use for monitoring long-running processes.

Features:
- Incremental output (only new lines)
- Pattern filtering
- Output truncation with head/tail preservation
- Includes stderr if requested`,
    
    inputSchema: {
      type: 'object',
      properties: {
        process_id: { 
          type: 'string', 
          description: 'ID of the process to get output from' 
        },
        since_last_read: { 
          type: 'boolean', 
          description: 'Only return new output (default: true)' 
        },
        max_lines: { 
          type: 'number', 
          description: 'Maximum lines to return (default: 500)' 
        },
        filter_pattern: { 
          type: 'string', 
          description: 'Regex pattern to filter output lines' 
        },
        include_stderr: { 
          type: 'boolean', 
          description: 'Include stderr in output (default: true)' 
        },
      },
      required: ['process_id'],
    },
    
    execute: (input: GetOutputInput) => processManager.getProcessOutput(input),
  },
  
  list_processes: {
    name: 'list_processes',
    description: `List all managed processes.
    
Shows running and recently completed processes with their status,
PID, detected port, and other metadata.`,
    
    inputSchema: {
      type: 'object',
      properties: {
        include_completed: { 
          type: 'boolean', 
          description: 'Include completed processes (default: false)' 
        },
      },
    },
    
    execute: (input: { include_completed?: boolean }) => {
      const processes = processManager.listProcesses(input.include_completed);
      return {
        count: processes.length,
        processes: processes.map(p => ({
          process_id: p.id,
          name: p.name,
          command: p.command,
          status: p.status,
          pid: p.pid,
          port: p.port,
          started_at: p.startedAt.toISOString(),
          duration_ms: Date.now() - p.startedAt.getTime(),
          exit_code: p.exitCode,
        })),
      };
    },
  },
  
  stop_process: {
    name: 'stop_process',
    description: `Stop a running background process.
    
Sends SIGTERM by default, with optional escalation to SIGKILL.
Returns final output from the process.

Features:
- Graceful shutdown with timeout
- Force kill option
- Final output capture`,
    
    inputSchema: {
      type: 'object',
      properties: {
        process_id: { 
          type: 'string', 
          description: 'ID of the process to stop' 
        },
        signal: { 
          type: 'string', 
          enum: ['SIGTERM', 'SIGKILL', 'SIGINT'],
          description: 'Signal to send (default: SIGTERM)' 
        },
        timeout_ms: { 
          type: 'number', 
          description: 'Wait time for graceful shutdown (default: 5000)' 
        },
        force_after_timeout: { 
          type: 'boolean', 
          description: 'Send SIGKILL if timeout (default: true)' 
        },
      },
      required: ['process_id'],
    },
    
    execute: (input: StopProcessInput) => processManager.stopProcess(input),
  },
  
  send_input: {
    name: 'send_input',
    description: `Send input to a running process.
    
Use for interactive processes that require user input.
Supports regular text input and special keys (Ctrl+C, etc.).

Features:
- Text input with optional Enter key
- Special key support (Ctrl+C, Ctrl+D, Ctrl+Z)
- Returns output after input`,
    
    inputSchema: {
      type: 'object',
      properties: {
        process_id: { 
          type: 'string', 
          description: 'ID of the process' 
        },
        input: { 
          type: 'string', 
          description: 'Text to send to stdin' 
        },
        press_enter: { 
          type: 'boolean', 
          description: 'Append newline after input (default: true)' 
        },
        special_key: { 
          type: 'string', 
          enum: ['ctrl+c', 'ctrl+d', 'ctrl+z'],
          description: 'Send a special key instead of text' 
        },
      },
      required: ['process_id'],
    },
    
    execute: (input: SendInputInput) => processManager.sendInput(input),
  },
  
  wait_for_pattern: {
    name: 'wait_for_pattern',
    description: `Wait for a specific pattern to appear in process output.
    
Useful for detecting when a server is ready, or waiting for 
specific log entries.

Features:
- Regex pattern matching
- Configurable timeout
- Can check stderr`,
    
    inputSchema: {
      type: 'object',
      properties: {
        process_id: { 
          type: 'string', 
          description: 'ID of the process to monitor' 
        },
        pattern: { 
          type: 'string', 
          description: 'Regex pattern to match' 
        },
        timeout_ms: { 
          type: 'number', 
          description: 'Maximum wait time (default: 30000)' 
        },
        in_stderr: { 
          type: 'boolean', 
          description: 'Check stderr instead of stdout' 
        },
      },
      required: ['process_id', 'pattern'],
    },
    
    execute: (input: WaitForPatternInput) => processManager.waitForPattern(input),
  },
  
  find_port_process: {
    name: 'find_port_process',
    description: `Find what process is using a specific port.
    
Checks both managed processes and system processes.
Useful for debugging port conflicts.`,
    
    inputSchema: {
      type: 'object',
      properties: {
        port: { 
          type: 'number', 
          description: 'Port number to check' 
        },
      },
      required: ['port'],
    },
    
    execute: (input: FindPortProcessInput) => processManager.findPortProcess(input),
  },
};

// ============================================================
// EXPORTS
// ============================================================

export { 
  ProcessManager, 
  processManager,
  ProcessInfo,
  ProcessStatus,
  RunCommandInput,
  RunCommandResult,
  StartProcessInput,
  StartProcessResult,
  GetOutputInput,
  GetOutputResult,
  StopProcessInput,
  StopProcessResult,
  SendInputInput,
  SendInputResult,
  WaitForPatternInput,
  WaitForPatternResult,
  FindPortProcessInput,
  FindPortProcessResult,
};
