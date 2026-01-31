# Orchestra VS Code Extension

> **Status**: Phase 1 - Foundation Scaffold

Visual task orchestration extension for Orchestra AI agent workflows.

## Features (Phase 1)

- **Sprint Explorer**: TreeView navigation of sprint → phase → task hierarchy
- **Dashboard**: Real-time sprint overview with task status and timeline
- **Database Reactivity**: UI updates within 500ms of database changes
- **MCP Integration**: Auto-starts orchestrator and implementor MCP servers
- **Status Bar**: Current task indicator with quick dashboard access
- **Custom AI Agents**: Autonomous agent execution with real-time output, file tracking, and session resume

## Requirements

- VS Code 1.95.0 or higher
- Node.js 20.x or higher
- Orchestra workspace (`.orchestra/` folder with `orchestra.db`)

## Installation

### From Source

```bash
cd extension
npm install
npm run build
```

If you are packaging/deploying the extension (VSIX) or troubleshooting native module issues, follow the authoritative guide: [build.md](build.md).

### Development

```bash
npm run watch  # Watch mode for development
```

Press F5 in VS Code to launch Extension Development Host.

## Configuration

| Setting                                | Type    | Default               | Description                                            |
| -------------------------------------- | ------- | --------------------- | ------------------------------------------------------ |
| `orchestra.autoStartMCP`               | boolean | `true`                | Auto-start MCP servers on activation                   |
| `orchestra.updateInterval`             | number  | `500`                 | Database update debounce (ms)                          |
| `orchestra.logLevel`                   | string  | `"info"`              | Log level (debug/info/warn/error)                      |
| `orchestra.agents.models.orchestrator` | string  | `"claude-opus-4.5"`   | Model for Orchestrator agent                           |
| `orchestra.agents.models.implementor`  | string  | `"claude-sonnet-4.5"` | Model for Implementor agent                            |
| `orchestra.agents.models.controller`   | string  | `"claude-opus-4.5"`   | Model for Controller agent                             |
| `orchestra.agents.verbosity`           | string  | `"normal"`            | Agent output verbosity (minimal/normal/detailed/debug) |

## Commands

| Command                       | Keybinding | Description                             |
| ----------------------------- | ---------- | --------------------------------------- |
| `Orchestra: Open Dashboard`   | -          | Open main dashboard panel               |
| `Orchestra: Refresh Status`   | -          | Manually refresh all views              |
| `Orchestra: Open Task Detail` | -          | Open detailed task view                 |
| `Orchestra: Start Agent`      | -          | Start agent execution for a task        |
| `Orchestra: Pause Agent`      | -          | Pause the running agent                 |
| `Orchestra: Resume Agent`     | -          | Resume a paused agent                   |
| `Orchestra: Stop Agent`       | -          | Stop agent execution and preserve state |

## Custom AI Agents

Agents can execute prepared tasks autonomously with full transparency and control. While running, the Agent Output Panel streams reasoning, tool calls, and results. You can pause, resume, stop, or redirect an agent at any time.

### Using Agents

1. Select an IMPLEMENT-phase task with a prepared handover.
2. Start the agent from the task view (Play control) or the `Orchestra: Start Agent` command.
3. Monitor live output in the Agent Output Panel.
4. Use pause/resume/stop controls to manage execution.
5. Review file changes in the Changed Files panel; use Diff or Undo as needed.

For architecture and component details, see docs/agents.md.

## Agent Tools

Orchestra agents have access to 18 specialized tools for process management, file editing, and filesystem operations. These tools enable autonomous task execution with proper error handling and cancellation support.

### Terminal Tools (9 tools)

#### run_command

Execute shell commands synchronously with output capture and timeout support.

```typescript
{
  command: "npm test",
  cwd: "/workspace",
  timeout_ms: 30000
}
```

**Use Cases**: Running builds, tests, linting, or any shell command that should complete before proceeding.

#### start_process

Launch background processes and get a process ID for later interaction.

```typescript
{
  command: "npm run dev",
  ready_pattern: "Server listening",
  ready_timeout_ms: 10000
}
```

**Use Cases**: Starting dev servers, watch processes, or long-running services that agents need to interact with.

#### get_process_output

Retrieve buffered stdout/stderr from a running or stopped background process.

```typescript
{
  process_id: "uuid-from-start",
  since_last_read: true,
  max_lines: 100
}
```

**Use Cases**: Monitoring server logs, checking for error messages, validating process health.

#### stop_process

Gracefully stop a background process with optional force kill after timeout.

```typescript
{
  process_id: "uuid-from-start",
  graceful_timeout_ms: 5000
}
```

**Use Cases**: Cleaning up dev servers, stopping watch processes, terminating hung processes.

#### send_input

Send text or special keys (ctrl+c, ctrl+d, ctrl+z) to a process's stdin.

```typescript
{
  process_id: "uuid-from-start",
  text: "y\n",
  press_enter: true
}
```

**Use Cases**: Interactive CLI prompts, REPL interactions, sending commands to background processes.

#### wait_for_pattern

Wait for a regex pattern to appear in process output, with timeout.

```typescript
{
  process_id: "uuid-from-start",
  pattern: "Compilation complete|Build failed",
  timeout_ms: 60000
}
```

**Use Cases**: Waiting for build completion, detecting server readiness, monitoring for specific log entries.

#### list_processes

List all managed background processes, optionally filtered by status.

```typescript
{
  status: "RUNNING"; // Optional: STARTING, RUNNING, READY, STOPPED, FAILED
}
```

**Use Cases**: Process inventory, finding hung processes, debugging agent execution.

#### find_port_process

Find which process is using a specific port (cross-platform: Windows/macOS/Linux).

```typescript
{
  port: 3000;
}
```

**Use Cases**: Detecting port conflicts, finding rogue servers, debugging network issues.

#### execute_with_retry

Execute commands with automatic retry logic and configurable success criteria.

```typescript
{
  command: "npm install",
  max_retries: 3,
  retry_delay_ms: 2000,
  success_exit_codes: [0]
}
```

**Use Cases**: Flaky network operations, dependency installation, CI/CD reliability.

---

### File Editing Tools (6 tools)

#### smart_replace

Advanced text replacement using fuzzy matching with Levenshtein distance.

```typescript
{
  file_path: "src/app.ts",
  old_text: "function oldName() {",
  new_text: "function newName() {",
  fuzzy_threshold: 0.85
}
```

**Use Cases**: Refactoring with whitespace tolerance, finding code despite formatting changes, bulk renaming.

**Features**:

- Exact match (fastest)
- Normalized whitespace match (ignores spacing differences)
- Fuzzy match (tolerates typos and small changes)
- Confidence scoring (0.0-1.0)

#### edit_lines

Replace a range of lines with new content, optionally preserving indentation.

```typescript
{
  file_path: "src/config.ts",
  start_line: 10,
  end_line: 15,
  new_content: "export const NEW_CONFIG = {...};",
  preserve_indentation: true
}
```

**Use Cases**: Targeted line replacements, config updates, precise code changes.

#### insert_at_line

Insert content at a specific line number with optional auto-indentation.

```typescript
{
  file_path: "src/index.ts",
  line: 5,
  content: "import { newModule } from './new';",
  auto_indent: true
}
```

**Use Cases**: Adding imports, inserting new functions, injecting code sections.

#### delete_section

Remove a range of lines from a file and capture deleted content.

```typescript
{
  file_path: "src/legacy.ts",
  start_line: 20,
  end_line: 45
}
```

**Use Cases**: Removing deprecated code, cleaning up comments, deleting test sections.

#### validate_edit

Validate proposed file content using VS Code language services before applying.

```typescript
{
  file_path: "src/app.ts",
  new_content: "export function validate() { ... }",
  timeout_ms: 5000
}
```

**Use Cases**: Syntax checking before edits, preventing broken code, pre-commit validation.

**Returns**: Syntax errors and warnings with line/column positions.

#### bulk_replace

Replace text patterns across multiple files using literal or regex patterns.

```typescript
{
  pattern: "oldClassName",
  replacement: "newClassName",
  include_glob: "src/**/*.ts",
  exclude_glob: "**/*.test.ts",
  is_regex: false
}
```

**Use Cases**: Project-wide refactoring, mass renaming, batch updates.

**Safety Features**:

- File and replacement count limits
- Preview mode (`preview_only: true`)
- Error reporting per file

---

### Filesystem Tools (3 tools)

#### move_file

Move or rename a file, creating parent directories as needed.

```typescript
{
  source_path: "src/old.ts",
  destination_path: "src/components/new.ts",
  overwrite: false
}
```

**Use Cases**: File reorganization, renaming, project restructuring.

#### copy_file

Duplicate a file to a new location while preserving the original.

```typescript
{
  source_path: "template.ts",
  destination_path: "src/new-component.ts"
}
```

**Use Cases**: Creating from templates, duplicating configurations, backup before edits.

#### move_directory

Recursively move an entire directory tree to a new location.

```typescript
{
  source_path: "old-module",
  destination_path: "src/modules/new-module",
  overwrite: false
}
```

**Use Cases**: Module reorganization, large-scale refactoring, project structure changes.

**Reports**: Counts of files and directories moved.

---

### Tool Features

#### Cancellation Support

All tools respect `CancellationToken` for interruptibility. Agents can be paused or stopped mid-execution, and tools will gracefully terminate. See [cancellation-token-audit.md](docs/cancellation-token-audit.md) for full compliance details.

#### Error Handling

Tools return structured errors with:

- **Error codes**: `INVALID_INPUT`, `FILE_NOT_FOUND`, `PERMISSION_DENIED`, `CANCELLED`, etc.
- **Suggestions**: Actionable guidance for resolving errors
- **Context**: Additional details for debugging

#### Dry Run Mode

File editing tools support `dry_run: true` to preview changes without applying them:

- `smart_replace`: Returns diff preview and match confidence
- `edit_lines`: Shows before/after preview
- `insert_at_line`: Displays insertion point and content
- `delete_section`: Returns content to be deleted

#### Cross-Platform Compatibility

Terminal tools work on Windows (PowerShell), macOS (zsh), and Linux (bash):

- `find_port_process`: Uses `netstat` on Windows, `lsof` on Unix
- `run_command`: Detects platform shell automatically
- Process management: Handles platform-specific signal handling

---

### Tool Architecture

```
AgentRunner
    ↓
ToolRegistry (18 registered tools)
    ↓
Individual Tool (AgentTool<TInput>)
    ├── Input validation (Zod schema)
    ├── Cancellation check
    ├── Tool execution logic
    ├── Infrastructure delegation (ProcessManager, FuzzyMatcher, etc.)
    └── Structured ToolResult
```

**Key Components**:

- **ProcessManager**: Singleton managing background processes with output buffering
- **FuzzyMatcher**: Levenshtein-based text matching for smart replacements
- **OutputBuffer**: Ring buffer with head/tail truncation for large outputs
- **ToolRegistry**: Central registration and invocation of all tools

For implementation details, see `extension/src/agents/tools/`.

## Project Structure

```
extension/
├── src/
│   ├── extension.ts              # Entry point
│   ├── agents/                    # Agent runtime, tools, and memory
│   │   ├── AgentRunner.ts          # Core execution loop
│   │   ├── AgentSession.ts         # Session state & persistence
│   │   ├── ToolRegistry.ts         # Tool registration & execution
│   │   ├── ContextManager.ts       # Context window management
│   │   ├── FileChangeTracker.ts    # Track & undo file changes
│   │   └── memory/                 # Sprint memory storage
│   ├── workspace/
│   │   └── detector.ts           # .orchestra/ detection
│   ├── database/
│   │   ├── client.ts             # SQLite client (singleton)
│   │   └── watcher.ts            # DB file watcher
│   ├── views/
│   │   ├── treeview/             # Sprint Explorer
│   │   ├── dashboard/            # Dashboard webview
│   │   └── statusbar/            # Status bar item
│   ├── mcp/
│   │   └── ServerManager.ts      # MCP server lifecycle
│   └── utils/
│       ├── logger.ts             # Structured logging
│       └── errors.ts             # Error classes
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript config
└── esbuild.config.js             # Build configuration
```

## Development

### Building

```bash
npm run build       # Production build
npm run watch       # Development watch mode
npm run typecheck   # Type checking only
```

### Testing

```bash
npm test            # Run tests
npm run test:watch  # Watch mode
```

### Debugging

1. Open extension folder in VS Code
2. Press F5 to launch Extension Development Host
3. View logs in Output → Orchestra

## Architecture

### Database Reactivity

```
orchestra.db changes → FileSystemWatcher → DatabaseWatcher
                                          ↓ (debounced 500ms)
                                    onDidChange event
                                          ↓
                          ┌───────────────┼───────────────┐
                          ↓               ↓               ↓
                    TreeProvider    DashboardPanel   StatusBar
                          ↓               ↓               ↓
                    UI updates      Webview update   Status update
```

### MCP Server Lifecycle

```
Extension activates → MCPServerManager.startServer('orchestrator')
                   → MCPServerManager.startServer('implementor')
                        ↓
                   Spawn node process with --role flag
                        ↓
                   Monitor stdout/stderr → Logger
                        ↓
                   Handle crashes → Auto-restart (max 3)
                        ↓
Extension deactivates → Stop all servers
```

## License

MIT

## Author

forcegage
