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
| OrchestraError Type | MCP Code | MCP Name | Description |
|---------------------|----------|----------|-------------|
| ConfigurationError | -32001 | ConfigurationError | Config/setup issues |
| FileError | -32000 | ApplicationError | File not found, read/write failures |
| ValidationError | -32600 | InvalidRequest | Invalid request/input |
| ManifestError | -32000 | ApplicationError | Manifest parsing/state issues |
| TaskError | -32002 | StateError | Task state issues (no current task, etc.) |
| RoleError (new) | -32003 | RoleError | Role validation failures |
| Generic Error | -32000 | ApplicationError | Unhandled errors |

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
| `orchestra feedback` | `runFeedback()` | ✅ | Returns FeedbackResult (Phase 1.2 complete) |
| `orchestra escalate` | `runEscalate()` | ✅ | Returns EscalateResult (Phase 1.2 complete) |

**Status**: ✅ Phase 1.2 complete - all commands ready for MCP wrapping.

## Resolved Unknowns

All NEEDS CLARIFICATION items from Technical Context resolved:

1. ✅ MCP SDK version and API patterns documented
2. ✅ Role enforcement mechanism designed
3. ✅ Error mapping strategy defined
4. ✅ Concurrency handling approach established
5. ✅ VS Code integration configuration documented
6. ✅ Core library readiness audited (Phase 1.2 dependency confirmed)

## Open Items for Phase 1

1. ✅ Define exact input/output schemas for all 10 tools (→ contracts/)
2. ✅ Design attempt tracking for retry/escalation logic (→ data-model.md)
3. 🔄 Status command extraction - **Required before MCP implementation**

## Status Command Extraction

**Current State**: `statusCommand()` lives in `src/commands/status.ts` with CLI-specific dependencies.

**Required**: Extract to `src/core/status.ts` as `runStatus()` that returns structured `StatusResult`.

**Approach**:
```typescript
// src/core/status.ts
export interface StatusResult {
  sprint: {
    id: string;
    title: string;
    status: "pending" | "in_progress" | "completed";
    totalTasks: number;
    completedTasks: number;
    progress: number;
  };
  currentTask: {
    id: number;
    title: string;
    status: string;
    category: string;
  } | null;
  nextTask: { id: number; title: string } | null;
}

export async function runStatus(workspaceRoot: string): Promise<StatusResult> {
  // Extract from commands/status.ts
}
```

**Timing**: This should happen as first task in Phase 2 or late in Phase 1.2.

## Phase 1.2 Dependency Management

**Status**: ✅ Phase 1.2 Complete (as of 2025-12-04)

All blocking commands now exist with full test coverage:
- `orchestra signal` - 17 core + 8 command tests
- `orchestra feedback` - 14 core + 10 command tests  
- `orchestra escalate` - 11 core + 10 command tests

**Verification Criteria for Phase 1.2 Readiness**:
- [x] `orchestra signal --summary "test" --files src/test.ts` works
- [x] `orchestra feedback` generates feedback.md with guidance
- [x] `orchestra escalate` creates escalation report for human review
- [x] All three commands have corresponding `run*` functions in `src/core/`

## Core Library API Stability

**Pattern for Handling Core API Changes**:
1. MCP tool handlers depend only on `src/core/index.ts` exports
2. Core functions return Result objects (not throw for expected failures)
3. Breaking changes require version bump of MCP server
4. Integration tests verify core→MCP contract

**Import Pattern** (per Constitution I):
```typescript
// ✅ Correct - import from core/index.js barrel
import { runPrepare, runVerification, runComplete } from "../core/index.js";

// ❌ Wrong - import from individual files
import { runPrepare } from "../core/prepare.js";
```

