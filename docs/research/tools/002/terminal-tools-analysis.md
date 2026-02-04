# AI Coding Agent Terminal/Console Tools: Problems & Solutions

## Executive Summary

After researching terminal tool implementations across Claude Code, OpenAI Codex, Cursor, Cline, RooCode, SWE-agent, and various MCP servers, I've identified the **core problems** coding agents face with terminal/console usage and **concrete solutions** that can be implemented as custom agent tools.

---

## Part 1: The Core Problems

### 1. 🔴 Long-Running Process Management (The #1 Problem)

**What happens:** Agent starts a process (like `npm run dev`) that runs indefinitely, blocking further agent actions.

**From OpenAI Codex Issue #3836:**
> "The bug manifests when the agent is asked to manage any long-running, non-terminating process, such as a web development server. The core issue is its single-threaded, synchronous execution model."

**Root causes:**
- Agent's main thread blocked waiting for command completion
- No asynchronous execution model
- Blind to process state once backgrounded
- Relies on brittle workarounds (`sleep`, `&`, PID files)

**Real-world example:**
```
Agent prompt: "Start the development server using pnpm dev. Once the server is fully 
running and ready, modify src/app/page.tsx to change the h1 tag"

Agent fails because:
1. Execution is blocked while server command runs
2. It resorts to fragile shell tricks (sleep, &, PID files)
3. Once backgrounded, agent is effectively blind to server state
4. Environment corruption from stray/zombie processes
```

### 2. 🔴 Shell Integration Failures

**What happens:** Agent can't read terminal output, doesn't know when commands finish.

**From GitHub Copilot Discussion:**
> "The agent sees the command run and give output, but keeps waiting on the output and spins forever"

**From Cursor Issues:**
> "The run_terminal_cmd tool frequently shows 'Command was interrupted' even when commands complete successfully"

**Root causes:**
- VS Code shell integration relies on escape sequences (OSC 633)
- Custom prompts (oh-my-posh, starship) can break detection
- WSL environments have communication issues
- Command Prompt (cmd) has no shell integration support
- Non-TTY environments can't use standard signals

### 3. 🔴 Output Capture Problems

**What happens:** Agent can't see command output, or sees truncated/incomplete output.

**Specific issues:**
- Output buffering delays
- Large outputs overwhelming context window
- Progress bars/spinners creating noise
- ANSI escape codes polluting output
- Streaming output not captured in real-time

**From Cline documentation:**
> "Controls the maximum number of lines captured from terminal output. When exceeded, it keeps 20% of the beginning and 80% of the end with a truncation message in between."

### 4. 🔴 Command Completion Detection

**What happens:** Agent doesn't know when a command has finished executing.

**Detection challenges:**
- No exit code received
- No "command finished" signal
- Prompt not detected (custom shell prompts)
- Command produces no output
- Process terminates unexpectedly

**From Antigravity Issues:**
> "When a command is non-interactive or produces no output, the agent does not detect completion. If the underlying terminal process terminates unexpectedly, the agent does not recover and remains stuck."

### 5. 🔴 Interactive Process Handling

**What happens:** Commands requiring user input (stdin) hang indefinitely.

**Examples:**
- `git commit` opening editor
- `npm init` asking questions
- `ssh` requiring password
- `sudo` requiring authentication
- Interactive installers

**From Claude Code Issue #9881:**
> "Currently, the Claude Code Bash tool is incredibly powerful for executing standard commands, but it cannot interact with applications that require a fully interactive terminal, such as vim, htop, or git rebase -i."

### 6. 🔴 Timeout Handling

**What happens:** Commands run too long without proper timeout management.

**From OpenAI Codex Issue #4775:**
> "When a command runs longer than this timeout, it should be terminated, and both the user and the model should be informed... Its absence in Codex CLI is a noticeable gap."

**Problems:**
- No default timeout configured
- Timeout without cleanup leaves zombie processes
- No partial output on timeout
- Agent can't recover from hung processes

### 7. 🔴 Context Pollution from Terminal Output

**What happens:** Large/noisy terminal output consumes context window.

**Issues:**
- Build logs spanning thousands of lines
- npm install output with dependency trees
- Test output with stack traces
- Progress indicators repeating lines
- ANSI color codes taking space

### 8. 🔴 Concurrent Command Coordination

**What happens:** Multiple terminal sessions conflict or lose track of state.

**Problems:**
- Can't track which process is which
- Background processes pile up
- Port conflicts from zombie processes
- No unified view of running processes
- State not shared between commands

---

## Part 2: Solutions Found in Production Tools

### Solution A: Background Task Management (Claude Code)

**How it works:**
1. Commands can be run with `run_in_background: true`
2. Returns immediately with a background task ID
3. Agent can continue with other work
4. Check output later with `BashOutput` tool
5. Kill processes with `KillShell` tool

**From Claude Code documentation:**
> "When Claude Code runs a command in the background, it runs the command asynchronously and immediately returns a background task ID. Claude Code can respond to new prompts while the command continues executing."

**Implementation:**
```typescript
// Start background task
Bash({ command: "npm run dev", run_in_background: true })
// Returns: { bash_id: "bash_3", status: "running" }

// Check output later
BashOutput({ bash_id: "bash_3" })
// Returns only NEW output since last check

// Kill when done
KillShell({ bash_id: "bash_3" })
```

### Solution B: Shell Integration with Escape Sequences (VS Code)

**How it works:**
- Uses OSC 633 escape sequences for command lifecycle
- Markers for: prompt start, prompt end, pre-execution, execution finished
- Enables rich integration with shell

**Escape sequence protocol:**
```
OSC 633 ; A ST - Mark prompt start
OSC 633 ; B ST - Mark prompt end
OSC 633 ; C ST - Mark pre-execution
OSC 633 ; D [; <exitcode>] ST - Mark execution finished
OSC 633 ; E ; <commandline> ST - Command line with exit code
OSC 633 ; P ; <property>=<value> ST - Set property (cwd, etc.)
```

### Solution C: Inline Terminal (RooCode/Cline)

**How it works:**
1. Bypass VS Code shell integration entirely
2. Use background "execa" provider
3. Stream output directly without OSC markers
4. More reliable for problematic shells

**From RooCode documentation:**
> "Use Inline Terminal: Runs commands with the Inline Terminal (in chat), bypassing shell profiles and VS Code shell integration for reliability and faster starts."

### Solution D: Output Truncation Strategies

**How it works:**
- Keep head and tail of output
- Preserve ~20% beginning, ~80% end
- Insert truncation marker in middle
- Collapse progress bars/spinners
- Run-length encoding for repeated lines

**Configuration example:**
```typescript
{
  maxOutputLines: 500,           // Hard line limit
  maxOutputCharacters: 100000,  // Hard character limit
  collapseProgressBars: true,   // Process \r and \b
  runLengthEncode: true         // Collapse repeated lines
}
```

### Solution E: Stateless vs Stateful Shell

**Mini-SWE-Agent approach (stateless):**
> "Executes actions with subprocess.run — every action is completely independent (as opposed to keeping a stateful shell session running). This is a big deal for the stability of the agent."

**Benefits:**
- Clean state for each command
- No zombie processes
- Trivial to sandbox (just swap subprocess.run for docker exec)
- Easier debugging
- More stable

**Claude's approach (stateful):**
> "The bash tool enables Claude to execute shell commands in a persistent bash session"

**Benefits:**
- Maintains environment variables
- Working directory persists
- Can run multi-step workflows
- More efficient for related commands

### Solution F: Process Supervision (Proposed)

**From OpenAI Codex Issue #3836:**
```
Process Recognition: Agent identifies pnpm dev as a persistent service
Asynchronous Delegation: Delegates to background "supervisor"
State Monitoring: Supervisor monitors stdout/stderr in real-time
Event-Driven Communication: Supervisor sends status updates
  e.g., {"status": "ready", "port": 3000}
Graceful Termination: Agent can send stop signal
```

### Solution G: MCP Shell Server Patterns

**From mcp-shell-server:**
```typescript
{
  "command": ["npm", "run", "dev"],
  "stdin": "optional input",    // Support for stdin
  "timeout": 30,                // Timeout in seconds
  "directory": "/path/to/dir"   // Working directory
}

// Response includes:
{
  "stdout": "...",
  "stderr": "...",
  "status": 0,                  // Exit code
  "execution_time": 1.234       // Duration
}
```

### Solution H: Run-Command MCP with Process Management

**From run-command-mcp:**
- Real-time output streaming
- Process listing and monitoring
- Kill and cleanup processes
- Timeout support
- Both sync and async execution

---

## Part 3: Recommended Tool Implementations

### 🥇 Tool 1: `run_command` - Enhanced Command Execution

**Solves:** Problems #1, #4, #6

```typescript
interface RunCommandInput {
  command: string;              // Command to execute
  working_dir?: string;         // Working directory
  timeout_ms?: number;          // Timeout (default: 30000)
  background?: boolean;         // Run in background
  capture_output?: boolean;     // Capture stdout/stderr (default: true)
  stdin?: string;               // Input to send to stdin
  env?: Record<string, string>; // Environment variables
}

interface RunCommandResult {
  // For synchronous execution:
  exit_code?: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
  timed_out: boolean;
  
  // For background execution:
  process_id?: string;          // ID to reference later
  status?: 'running' | 'completed' | 'failed';
}
```

**Key features:**
- Configurable timeout with partial output on timeout
- Background execution option
- Stdin support for simple interactive needs
- Environment variable injection
- Clear exit status

### 🥇 Tool 2: `start_process` - Long-Running Process Management

**Solves:** Problems #1, #8

```typescript
interface StartProcessInput {
  command: string;
  working_dir?: string;
  name?: string;                 // Human-readable name
  ready_pattern?: string;        // Regex to detect "ready" state
  ready_timeout_ms?: number;     // How long to wait for ready
  env?: Record<string, string>;
}

interface StartProcessResult {
  process_id: string;
  name: string;
  status: 'starting' | 'ready' | 'running' | 'failed';
  pid: number;                   // OS process ID
  port?: number;                 // Detected port (if applicable)
  initial_output: string;        // First N lines of output
}
```

**Key features:**
- Returns immediately with process ID
- Optional "ready" detection (e.g., "Server running on port 3000")
- Named processes for easier management
- Automatic port detection

### 🥇 Tool 3: `get_process_output` - Stream/Fetch Output

**Solves:** Problems #2, #3

```typescript
interface GetProcessOutputInput {
  process_id: string;
  since_last_read?: boolean;     // Only new output (default: true)
  max_lines?: number;            // Limit output lines
  filter_pattern?: string;       // Regex to filter output
  include_stderr?: boolean;      // Include stderr (default: true)
}

interface GetProcessOutputResult {
  process_id: string;
  status: 'running' | 'completed' | 'failed';
  exit_code?: number;            // If completed
  stdout: string;
  stderr: string;
  truncated: boolean;
  lines_omitted?: number;
}
```

**Key features:**
- Incremental output (only new lines since last read)
- Pattern filtering for relevant lines
- Truncation with head/tail preservation
- Status updates

### 🥈 Tool 4: `list_processes` - Process Inventory

**Solves:** Problem #8

```typescript
interface ListProcessesInput {
  include_completed?: boolean;   // Include finished processes
  name_filter?: string;          // Filter by name
}

interface ListProcessesResult {
  processes: ProcessInfo[];
}

interface ProcessInfo {
  process_id: string;
  name: string;
  command: string;
  status: 'running' | 'completed' | 'failed';
  pid: number;
  started_at: string;            // ISO timestamp
  duration_ms: number;
  exit_code?: number;
  port?: number;
}
```

### 🥈 Tool 5: `stop_process` - Graceful Process Termination

**Solves:** Problems #1, #6

```typescript
interface StopProcessInput {
  process_id: string;
  signal?: 'SIGTERM' | 'SIGKILL' | 'SIGINT';  // Default: SIGTERM
  timeout_ms?: number;           // Wait for graceful shutdown
  force_after_timeout?: boolean; // SIGKILL if timeout (default: true)
}

interface StopProcessResult {
  process_id: string;
  status: 'stopped' | 'force_killed' | 'already_stopped' | 'not_found';
  exit_code?: number;
  final_output: string;          // Last N lines before termination
}
```

**Key features:**
- Graceful shutdown with timeout
- Escalation to SIGKILL if needed
- Captures final output before termination
- Cleanup confirmation

### 🥈 Tool 6: `send_input` - Interactive Process Support

**Solves:** Problem #5

```typescript
interface SendInputInput {
  process_id: string;
  input: string;                 // Text to send to stdin
  press_enter?: boolean;         // Append newline (default: true)
  special_key?: 'ctrl+c' | 'ctrl+d' | 'ctrl+z';
}

interface SendInputResult {
  success: boolean;
  output_after: string;          // Output received after input
  status: 'running' | 'completed' | 'failed';
}
```

**Use cases:**
- Answering prompts (y/n questions)
- Providing configuration values
- Sending interrupt signals
- Basic interactive tool support

### 🥉 Tool 7: `wait_for_pattern` - Output Pattern Detection

**Solves:** Problems #1, #4

```typescript
interface WaitForPatternInput {
  process_id: string;
  pattern: string;               // Regex to match
  timeout_ms?: number;           // How long to wait
  in_stderr?: boolean;           // Also check stderr
}

interface WaitForPatternResult {
  found: boolean;
  matched_line?: string;
  wait_time_ms: number;
  timed_out: boolean;
}
```

**Use cases:**
- Wait for "Server ready" message
- Detect compilation errors
- Wait for test completion
- Detect specific log entries

### 🥉 Tool 8: `find_port_process` - Port Discovery

**Solves:** Problem #8 (port conflicts)

```typescript
interface FindPortProcessInput {
  port: number;
}

interface FindPortProcessResult {
  in_use: boolean;
  process_id?: string;           // Our managed process
  pid?: number;                  // OS process ID
  command?: string;              // Command that owns port
}
```

**Use cases:**
- Check if port is available before starting server
- Find and kill process blocking a port
- Discover what's running where

### 🥉 Tool 9: `execute_with_retry` - Robust Execution

**Solves:** Problems #4, #6

```typescript
interface ExecuteWithRetryInput {
  command: string;
  max_retries?: number;          // Default: 3
  retry_delay_ms?: number;       // Default: 1000
  success_exit_codes?: number[]; // Default: [0]
  success_pattern?: string;      // Regex that indicates success
  working_dir?: string;
  timeout_ms?: number;
}

interface ExecuteWithRetryResult {
  success: boolean;
  attempts: number;
  final_exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
}
```

---

## Part 4: Implementation Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Terminal Tool Layer                                │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────┐    ┌─────────────────────────────────────┐  │
│  │  Synchronous Tools  │    │     Asynchronous Tools              │  │
│  │                     │    │                                     │  │
│  │  • run_command      │    │  • start_process                   │  │
│  │  • execute_retry    │    │  • get_process_output              │  │
│  │  • find_port        │    │  • stop_process                    │  │
│  │                     │    │  • send_input                      │  │
│  │                     │    │  • wait_for_pattern                │  │
│  └─────────┬───────────┘    └──────────────┬──────────────────────┘  │
│            │                               │                          │
│            ▼                               ▼                          │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    Process Manager                               │ │
│  │                                                                  │ │
│  │  • Process registry (ID → process info)                         │ │
│  │  • Output buffer management                                      │ │
│  │  • Status tracking                                               │ │
│  │  • Cleanup on exit                                               │ │
│  └──────────────────────────────┬───────────────────────────────────┘ │
│                                 │                                     │
│                                 ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    Execution Backend                             │ │
│  │                                                                  │ │
│  │  Option A: subprocess (stateless, simple)                       │ │
│  │  Option B: PTY (interactive support)                            │ │
│  │  Option C: VS Code shell integration                            │ │
│  │  Option D: Docker exec (sandboxed)                              │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Part 5: Implementation Priority Matrix

| Tool | Impact | Complexity | Recommendation |
|------|--------|------------|----------------|
| `run_command` | 🔥 High | Low | **Implement first** - Foundation for all |
| `start_process` | 🔥 High | Medium | **Implement first** - Enables dev servers |
| `get_process_output` | 🔥 High | Medium | **Implement first** - Essential for async |
| `stop_process` | 🔥 High | Low | **Implement first** - Cleanup capability |
| `list_processes` | Medium | Low | Quick win |
| `send_input` | Medium | Medium | Enables interactive commands |
| `wait_for_pattern` | Medium | Low | Quality of life |
| `find_port_process` | Medium | Low | Debug tool |
| `execute_with_retry` | Low | Low | Nice to have |

---

## Part 6: Best Practices for Terminal Tool Design

### 1. Always Include Exit Codes

```typescript
// Bad - no exit information
interface BadResult {
  output: string;
}

// Good - complete status
interface GoodResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  success: boolean;
}
```

### 2. Implement Output Truncation

```typescript
function truncateOutput(output: string, maxLines: number): string {
  const lines = output.split('\n');
  if (lines.length <= maxLines) return output;
  
  const headLines = Math.floor(maxLines * 0.2);
  const tailLines = maxLines - headLines - 1;
  
  const head = lines.slice(0, headLines);
  const tail = lines.slice(-tailLines);
  const omitted = lines.length - headLines - tailLines;
  
  return [
    ...head,
    `\n[... ${omitted} lines omitted ...]\n`,
    ...tail
  ].join('\n');
}
```

### 3. Support Timeout with Partial Output

```typescript
async function runWithTimeout(
  command: string, 
  timeout: number
): Promise<Result> {
  const process = spawn(command);
  const outputBuffer: string[] = [];
  
  process.stdout.on('data', data => outputBuffer.push(data));
  
  const timer = setTimeout(() => {
    process.kill('SIGTERM');
  }, timeout);
  
  try {
    const exitCode = await waitForExit(process);
    clearTimeout(timer);
    return { 
      stdout: outputBuffer.join(''), 
      exit_code: exitCode,
      timed_out: false 
    };
  } catch (e) {
    return { 
      stdout: outputBuffer.join(''), 
      exit_code: -1,
      timed_out: true,
      partial_output: true
    };
  }
}
```

### 4. Clean Up on Agent Exit

```typescript
class ProcessManager {
  private processes: Map<string, ChildProcess> = new Map();
  
  constructor() {
    // Cleanup all processes when agent exits
    process.on('exit', () => this.killAll());
    process.on('SIGINT', () => this.killAll());
    process.on('SIGTERM', () => this.killAll());
  }
  
  killAll() {
    for (const [id, proc] of this.processes) {
      try {
        proc.kill('SIGTERM');
      } catch (e) {
        // Process may already be dead
      }
    }
    this.processes.clear();
  }
}
```

### 5. Handle Output Encoding

```typescript
function cleanOutput(raw: Buffer): string {
  let output = raw.toString('utf-8');
  
  // Remove ANSI escape codes
  output = output.replace(/\x1b\[[0-9;]*m/g, '');
  
  // Collapse carriage returns (progress bars)
  output = output.replace(/[^\n]*\r(?!\n)/g, '');
  
  // Remove null bytes
  output = output.replace(/\0/g, '');
  
  return output;
}
```

### 6. Track Process Lifecycle

```typescript
type ProcessStatus = 
  | 'starting'    // Process spawned, waiting for ready signal
  | 'running'     // Process running normally
  | 'ready'       // Process signaled ready (for servers)
  | 'completed'   // Process exited with code 0
  | 'failed'      // Process exited with non-zero code
  | 'killed'      // Process was terminated by agent
  | 'timeout';    // Process was killed due to timeout
```

---

## Part 7: Environment-Specific Considerations

### VS Code Extension

- Use VS Code's terminal shell integration API when available
- Fall back to subprocess for reliability
- Handle workspace trust restrictions
- Support both local and remote (SSH, WSL) contexts

### MCP Server

- Implement as MCP tool following protocol spec
- Support both stdio and HTTP transports
- Return structured JSON responses
- Consider security (whitelist commands)

### Standalone CLI

- Use subprocess.run for simplicity
- Consider PTY for interactive support
- Handle cross-platform differences (Windows vs Unix)
- Implement proper signal handling

---

## Appendix: Key Sources

1. **Claude Code Documentation** - Background commands, /bashes
2. **OpenAI Codex Issues** - #3836 (async process), #4775 (timeout)
3. **Cursor Issues** - #3327 (infinite loops), #3501 (interrupted)
4. **VS Code Documentation** - Shell integration escape sequences
5. **RooCode/Cline Documentation** - Inline terminal, shell integration
6. **SWE-agent/SWE-ReX** - Sandboxed execution, stateless approach
7. **MCP Shell Server** - Tool implementation patterns
8. **Mini-SWE-Agent** - Stateless subprocess approach
