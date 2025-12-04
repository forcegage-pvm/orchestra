# Research: MCP Server for Orchestra

**Date**: 2025-12-04  
**Phase**: 0 - Outline & Research

## Research Tasks

### 1. MCP SDK API and Patterns

**Task**: Research @modelcontextprotocol/sdk for STDIO transport, tool registration, and error handling.

**Decision**: Use `@modelcontextprotocol/sdk` v0.6.0+ with Server class and STDIO transport.

**Rationale**: 
- Official SDK maintained by Anthropic
- STDIO transport is the standard for VS Code MCP integration
- TypeScript-first with full type definitions
- Server class provides tool registration via `server.setRequestHandler()`

**Alternatives Considered**:
- Raw JSON-RPC implementation: Rejected - reinvents wheel, error-prone
- HTTP transport: Rejected - VS Code Copilot uses STDIO

**Key API Patterns**:
```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server({ name: "orchestra", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{ name: "status", description: "...", inputSchema: {...} }]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  // Dispatch to tool handler
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### 2. Role Enforcement Pattern

**Task**: Design role parameter validation and tool access control.

**Decision**: Middleware-style role guard that validates `role` parameter before tool execution.

**Rationale**:
- Centralized enforcement ensures consistency
- Fail-fast on missing/invalid role
- Clear error messages guide correct usage

**Implementation Pattern**:
```typescript
type Role = "implementor" | "orchestrator";

const IMPLEMENTOR_TOOLS = new Set(["signal", "status"]);

function validateRole(toolName: string, role: string | undefined): void {
  if (!role) throw new RoleError("role parameter required", { tool: toolName });
  if (role !== "implementor" && role !== "orchestrator") {
    throw new RoleError("role must be 'implementor' or 'orchestrator'", { role });
  }
  if (role === "implementor" && !IMPLEMENTOR_TOOLS.has(toolName)) {
    throw new RoleError("permission denied: orchestrator tool", { tool: toolName, role });
  }
}
```

### 3. Error Mapping Strategy

**Task**: Map OrchestraError hierarchy to MCP error codes.

**Decision**: Create error mapper that preserves context while using MCP conventions.

**Rationale**:
- MCP requires specific error code format
- Orchestra errors have rich context that aids debugging
- Consistent mapping enables client-side error handling

**Mapping**:
| OrchestraError Type | MCP Code | Description |
|---------------------|----------|-------------|
| ConfigurationError | -32001 | Config/setup issues |
| FileError | -32000 | File not found, read/write failures |
| ValidationError | -32600 | Invalid request/input |
| ManifestError | -32000 | Manifest parsing/state issues |
| TaskError | -32002 | Task state issues (no current task, etc.) |
| RoleError (new) | -32003 | Role validation failures |
| Generic Error | -32000 | Application error |

### 4. Concurrency Handling

**Task**: Design fail-fast concurrency strategy for file-based state.

**Decision**: Use lockfile pattern with immediate failure on contention and stale lock cleanup.

**Rationale**:
- File-based state (YAML) doesn't support transactions
- Fail-fast is simpler than queuing and aligns with agent retry patterns
- Lock acquisition should be atomic (fs.open with exclusive flag)
- Stale lock cleanup prevents permanent blocking after crashes

**Implementation Pattern**:
```typescript
const LOCK_FILE = ".orchestra/.lock";
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

interface LockInfo {
  createdAt: number;
  pid: number;
}

async function acquireLock(): Promise<fs.FileHandle> {
  // Clean stale locks first
  await cleanStaleLock();
  
  try {
    const handle = await fs.open(LOCK_FILE, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY);
    // Write lock info for stale detection
    await fs.writeFile(LOCK_FILE, JSON.stringify({ createdAt: Date.now(), pid: process.pid }));
    return handle;
  } catch (e) {
    if (e.code === "EEXIST") {
      throw new ConcurrencyError("operation in progress, retry after brief delay");
    }
    throw e;
  }
}

async function cleanStaleLock(): Promise<void> {
  try {
    const content = await fs.readFile(LOCK_FILE, 'utf-8');
    const info: LockInfo = JSON.parse(content);
    if (Date.now() - info.createdAt > STALE_THRESHOLD_MS) {
      await fs.unlink(LOCK_FILE);
    }
  } catch {
    // Lock doesn't exist or unreadable - ok to proceed
  }
}

async function withLock<T>(operation: () => Promise<T>): Promise<T> {
  const lockHandle = await acquireLock();
  try {
    return await operation();
  } finally {
    await lockHandle.close();
    await fs.unlink(LOCK_FILE).catch(() => {});
  }
}
```

**Operations Classification**:
| Operation | Requires Lock | Reason |
|-----------|---------------|--------|
| init | Yes | Creates .orchestra/ structure |
| prepare | Yes | Modifies manifest, creates handover |
| signal | Yes | Creates signal file |
| accept_signal | Yes | Validates and updates state |
| verify | Yes | Updates verification results |
| complete | Yes | Updates task status |
| feedback | Yes | Creates feedback, updates attempts |
| escalate | Yes | Updates task status |
| status | No | Read-only |
| closeout | No | Read-only checks |

### 5. VS Code Integration Configuration

**Task**: Document VS Code Copilot MCP configuration.

**Decision**: Use `github.copilot.chat.mcpServers` in workspace settings.

**Configuration**:
```json
// .vscode/settings.json
{
  "github.copilot.chat.mcpServers": {
    "orchestra": {
      "command": "node",
      "args": ["./dist/mcp/server.js"]
    }
  }
}
```

**Alternative considered**: System-wide MCP config - Rejected for workspace isolation.

### 6. Existing Core Library API Audit

**Task**: Verify core library functions are ready for MCP wrapping.

**Findings**:

| CLI Command | Core Function | Ready | Notes |
|-------------|---------------|-------|-------|
| `orchestra init` | `runInit()` | ✅ | Returns InitResult |
| `orchestra status` | `statusCommand()` | ⚠️ | Currently in commands/, needs core extraction |
| `orchestra closeout` | `runCloseoutChecks()` | ✅ | Returns CloseoutResult |
| `orchestra prepare` | `runPrepare()` | ✅ | Returns PrepareResult |
| `orchestra signal` | `runSignal()` | ✅ | Returns SignalResult |
| `orchestra accept-signal` | `runAcceptSignal()` | ✅ | Returns AcceptSignalResult |
| `orchestra verify` | `runVerification()` | ✅ | Returns VerifyResult |
| `orchestra complete` | `runComplete()` | ✅ | Returns CompleteResult |
| `orchestra feedback` | ❌ | ❌ | Phase 1.2 - not yet implemented |
| `orchestra escalate` | ❌ | ❌ | Phase 1.2 - not yet implemented |

**Dependency**: Phase 1.2 must complete `feedback` and `escalate` commands before MCP tools can wrap them.

## Resolved Unknowns

All NEEDS CLARIFICATION items from Technical Context resolved:

1. ✅ MCP SDK version and API patterns documented
2. ✅ Role enforcement mechanism designed
3. ✅ Error mapping strategy defined
4. ✅ Concurrency handling approach established
5. ✅ VS Code integration configuration documented
6. ✅ Core library readiness audited (Phase 1.2 dependency confirmed)

## Open Items for Phase 1

1. Define exact input/output schemas for all 10 tools (→ contracts/)
2. Design attempt tracking for retry/escalation logic
3. Determine if status command needs extraction to core/
