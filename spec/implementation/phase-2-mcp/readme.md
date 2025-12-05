# Phase 2: MCP Server

> **Navigation**: [Implementation Index](../readme.md) | **Prev**: [Phase 1.2: CLI Tech Debt](../phase-1.2-cli/readme.md) | **Next**: Phase 3: VS Code Extension

---

## Status: 🔴 BLOCKED

**Prerequisites**: 
- Phase 1 CLI ✅ Complete
- Phase 1.2 CLI Tech Debt ❌ Not Started (BLOCKING)

**See**: [Alignment Analysis](alignment-analysis.md) for details on decisions made.

---

## Overview

The Orchestra MCP (Model Context Protocol) Server exposes Orchestra operations as tools that AI agents can call directly. This enables:
- Copilot agent mode to orchestrate tasks
- Claude/other agents to use Orchestra via MCP
- Programmatic access without shell commands

**Key Insight**: The MCP server wraps the existing `src/core/` library from Phase 1, requiring no new business logic.

## Goals

1. **Enable agent access** - AI agents can call Orchestra operations as tools
2. **Reuse core library** - Wrap Phase 1's `src/core/` with MCP tool definitions
3. **Support VS Code** - Works with Copilot's MCP integration
4. **Maintain consistency** - Same behavior as CLI commands

## Success Criteria

- [ ] MCP server starts and registers with VS Code
- [ ] All 11 core tools callable from Copilot agent mode
- [ ] Tools read/write `.orchestra/` state correctly
- [ ] Tool names match CLI commands exactly
- [ ] Status values use lowercase (`pending`, `in_progress`, `completed`)
- [ ] Role separation enforced (Orchestrator vs Implementor tools)
- [ ] Error responses follow MCP conventions
- [ ] Works with `copilot-instructions.md` MCP configuration

## Architecture

```
orchestra/                     # Project root
├── src/
│   ├── cli.ts                # Phase 1 CLI entry
│   ├── commands/             # Phase 1 CLI commands
│   ├── core/                 # SHARED - Phase 1 services
│   │   ├── index.ts          # Re-exports all core functions
│   │   ├── manifest.ts
│   │   ├── progress.ts
│   │   ├── verification.ts
│   │   └── ...
│   │
│   └── mcp/                  # NEW - Phase 2
│       ├── server.ts         # MCP server entry point
│       ├── index.ts          # Exports
│       └── tools/            # Tool definitions (match CLI names)
│           ├── init.ts           # orchestra init
│           ├── status.ts         # orchestra status
│           ├── closeout.ts       # orchestra closeout
│           ├── prepare.ts        # orchestra prepare
│           ├── accept_signal.ts  # orchestra accept-signal (Orchestrator)
│           ├── verify.ts         # orchestra verify (Orchestrator)
│           ├── complete.ts       # orchestra complete
│           ├── feedback.ts       # orchestra feedback (Orchestrator)
│           └── escalate.ts       # orchestra escalate (Orchestrator)
│
├── package.json              # Add @modelcontextprotocol/sdk
└── mcp.json                  # MCP server manifest
```

> **Note**: No `signal.ts` tool - signaling is done by filling out the signal.md template. MCP can add a signal tool for convenience if needed.

## Tools

### Core Tools (Mapped from CLI)

Tools are named to **match CLI commands exactly** per alignment decision Q3.

| Tool | CLI Command | Bible Script | Actor | Status |
|------|-------------|--------------|-------|--------|
| `init` | `orchestra init` | `sprint-init` | Orchestrator | Phase 1 |
| `status` | `orchestra status` | `sprint-status` | Both | Phase 1 |
| `closeout` | `orchestra closeout` | `task-closeout-check` | Orchestrator | Phase 1 |
| `prepare` | `orchestra prepare` | `prepare-handover` | Orchestrator | Phase 1 |
| `accept_signal` | `orchestra accept-signal` | `accept-signal-check` | Orchestrator | Phase 1 |
| `verify` | `orchestra verify` | `verification-audit` | Orchestrator | Phase 1 |
| `complete` | `orchestra complete` | (completes task) | Orchestrator | Phase 1 |
| `feedback` | `orchestra feedback` | `generate-feedback` | Orchestrator | Phase 1.2 |
| `escalate` | `orchestra escalate` | `escalate-failure` | Orchestrator | Phase 1.2 |

### Role Separation (Q1 Decision)

**Implementor Tools** (safe to expose):
- `signal` - Create signal file claiming completion
- `status` - View current task status (read-only)

**Orchestrator Tools** (hidden verification access):
- `init`, `closeout`, `prepare`, `accept_signal`, `verify`, `complete`, `feedback`, `escalate`

The MCP server should enforce role separation by context or configuration.

### Tool Definitions

#### init

```typescript
{
  name: "init",
  description: "Initialize a new sprint from specification (Orchestrator)",
  inputSchema: {
    type: "object",
    properties: {
      specPath: {
        type: "string",
        description: "Path to sprint specification file"
      }
    },
    required: ["specPath"]
  }
}
```

**Returns:**
```typescript
{
  success: boolean;
  sprintId: string;
  taskCount: number;
  orchestraRoot: string;
}
```

#### status

```typescript
{
  name: "status",
  description: "Get current task context and sprint status",
  inputSchema: {
    type: "object",
    properties: {}
  }
}
```

**Returns:**
```typescript
{
  sprint: {
    id: string;
    name: string;
    status: "pending" | "in_progress" | "completed";  // lowercase per Q4
  };
  currentTask: {
    id: number;
    title: string;
    status: "pending" | "in_progress" | "completed";  // lowercase per Q4
    category: string;
  } | null;
  progress: {
    completed: number;
    total: number;
    percentComplete: number;
  };
}
```

#### closeout

```typescript
{
  name: "closeout",
  description: "Verify previous task is properly closed before preparing next (Orchestrator)",
  inputSchema: {
    type: "object",
    properties: {
      taskId: {
        type: "number",
        description: "Task ID to verify closeout"
      }
    }
  }
}
```

**Returns:**
```typescript
{
  success: boolean;
  taskId: number;
  checks: { name: string; passed: boolean; message?: string }[];
  canProceed: boolean;
}
```

#### prepare

```typescript
{
  name: "prepare",
  description: "Prepare task handover for implementation (Orchestrator)",
  inputSchema: {
    type: "object",
    properties: {
      taskId: {
        type: "number",
        description: "Optional specific task ID. If omitted, prepares next pending task."
      }
    }
  }
}
```

**Returns:**
```typescript
{
  success: boolean;
  taskId: number;
  title: string;
  description: string;
  handoverPath: string;
  verificationPath: string;  // orchestrator-only
  dependencies: number[];
}
```

#### signal

```typescript
{
  name: "signal",
  description: "Signal that task is complete (Implementor - creates signal file)",
  inputSchema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "Brief description of what was implemented"
      },
      files: {
        type: "array",
        items: { type: "string" },
        description: "Files created or modified (auto-detected if omitted)"
      },
      tests: {
        type: "array",
        items: { type: "string" },
        description: "Test files added"
      },
      notes: {
        type: "string",
        description: "Additional notes for orchestrator"
      }
    },
    required: ["summary"]
  }
}
```

**Returns:**
```typescript
{
  success: boolean;
  taskId: number;
  signalPath: string;
  signaledAt: string;
  nextStep: "Orchestrator runs accept_signal";
}
```

**Note**: This is an **Implementor** tool. It creates the signal file but does NOT trigger verification (that's the Orchestrator's `accept_signal` tool).

#### accept_signal

```typescript
{
  name: "accept_signal",
  description: "Validate implementor's signal and run pre-verification checks (Orchestrator)",
  inputSchema: {
    type: "object",
    properties: {
      taskId: {
        type: "number",
        description: "Task ID to accept signal for"
      }
    }
  }
}
```

**Returns:**
```typescript
{
  accepted: boolean;
  taskId: number;
  signalPath: string;
  checks: { name: string; passed: boolean; message?: string }[];
  nextStep: "verify" | "signal again";
}
```

#### verify

```typescript
{
  name: "verify",
  description: "Run hidden verification criteria against task (Orchestrator only)",
  inputSchema: {
    type: "object",
    properties: {
      taskId: {
        type: "number",
        description: "Task ID to verify"
      }
    }
  }
}
```

**Returns:**
```typescript
{
  success: boolean;
  taskId: number;
  passed: boolean;
  results: {
    criterion: string;  // Hidden - DO NOT expose to implementor
    passed: boolean;
    details?: string;
  }[];
  nextStep: "complete" | "feedback";
}
```

**Warning**: Verification results contain hidden criteria. Never expose to Implementor.

#### complete

```typescript
{
  name: "complete",
  description: "Mark task as complete after successful verification (Orchestrator)",
  inputSchema: {
    type: "object",
    properties: {
      taskId: {
        type: "number",
        description: "Task ID to complete"
      }
    }
  }
}
```

**Returns:**
```typescript
{
  success: boolean;
  taskId: number;
  previousStatus: string;
  newStatus: "completed";
  completedAt: string;
  nextTask: number | null;
}
```

#### feedback

```typescript
{
  name: "feedback",
  description: "Generate feedback for implementor after verification failure (Orchestrator)",
  inputSchema: {
    type: "object",
    properties: {
      taskId: {
        type: "number",
        description: "Task ID to generate feedback for"
      },
      attempt: {
        type: "number",
        description: "Current attempt number"
      }
    }
  }
}
```

**Returns:**
```typescript
{
  success: boolean;
  taskId: number;
  attempt: number;
  feedbackPath: string;
  issues: {
    area: string;
    guidance: string;  // Actionable without revealing criteria
  }[];
  canRetry: boolean;  // false if max attempts reached
}
```

**Note**: Feedback must be actionable without revealing hidden verification criteria.

#### escalate

```typescript
{
  name: "escalate",
  description: "Escalate persistent failures to human supervisor (Orchestrator)",
  inputSchema: {
    type: "object",
    properties: {
      taskId: {
        type: "number",
        description: "Task ID to escalate"
      },
      reason: {
        type: "string",
        description: "Why escalation is needed"
      },
      attempts: {
        type: "number",
        description: "Number of attempts made"
      },
      context: {
        type: "string",
        description: "Additional context for human"
      }
    },
    required: ["reason"]
  }
}
```

**Returns:**
```typescript
{
  success: boolean;
  taskId: number;
  previousStatus: string;
  newStatus: "escalated";
  escalationPath: string;
  reportPath: string;
}
```

## Tasks

| ID | Task | Status | Description |
|----|------|--------|-------------|
| 2.1 | [Project Setup](tasks/2.1-project-setup.md) | Not Started | Add MCP SDK, create mcp/ folder structure |
| 2.2 | [Server Core](tasks/2.2-server-core.md) | Not Started | MCP server entry point, tool registry |
| 2.3 | [init Tool](tasks/2.3-init.md) | Not Started | Wrap `orchestra init` |
| 2.4 | [status Tool](tasks/2.4-status.md) | Not Started | Wrap `orchestra status` |
| 2.5 | [closeout Tool](tasks/2.5-closeout.md) | Not Started | Wrap `orchestra closeout` |
| 2.6 | [prepare Tool](tasks/2.6-prepare.md) | Not Started | Wrap `orchestra prepare` |
| 2.7 | ~~signal Tool~~ | Removed | No CLI command - signaling is manual file edit |
| 2.8 | [accept_signal Tool](tasks/2.8-accept-signal.md) | Not Started | Wrap `orchestra accept-signal` |
| 2.9 | [verify Tool](tasks/2.9-verify.md) | Not Started | Wrap `orchestra verify` |
| 2.10 | [complete Tool](tasks/2.10-complete.md) | Not Started | Wrap `orchestra complete` |
| 2.11 | [feedback Tool](tasks/2.11-feedback.md) | Not Started | Wrap `orchestra feedback` |
| 2.12 | [escalate Tool](tasks/2.12-escalate.md) | Not Started | Wrap `orchestra escalate` |
| 2.13 | [Integration Testing](tasks/2.13-integration-testing.md) | Not Started | E2E MCP testing |

### Dependencies

- Tasks 2.3-2.12 (except 2.7) depend on 2.2 (Server Core)
- Task 2.13 depends on all tool tasks
- Tasks 2.11, 2.12 depend on Phase 1.2 CLI completion

## Dependencies

### npm Packages (additions to Phase 1)

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.6.0"
  }
}
```

### External Requirements

- Everything from Phase 1
- VS Code with Copilot (for testing)
- MCP client (VS Code built-in or standalone)

## MCP Server Configuration

### mcp.json

```json
{
  "name": "orchestra",
  "version": "1.0.0",
  "description": "AI Agent Task Orchestration System",
  "transport": {
    "type": "stdio"
  },
  "tools": [
    "init",
    "status",
    "closeout",
    "prepare",
    "signal",
    "accept_signal",
    "verify",
    "complete",
    "feedback",
    "escalate"
  ]
}
```

### VS Code Integration

Add to `.vscode/settings.json`:

```json
{
  "github.copilot.chat.mcpServers": {
    "orchestra": {
      "command": "node",
      "args": ["./dist/mcp/server.js"]
    }
  }
}
```

## Usage Examples

### From Copilot Agent

```
User: "Prepare the next task"
Copilot: [calls prepare_task tool]
         Returns task details, handover path

User: "I've finished implementing"
Copilot: [calls signal_complete with summary]
         Returns acceptance status, next steps
```

### Standalone MCP Client

```bash
# Start server
node dist/mcp/server.js

# Client sends JSON-RPC
-> {"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "get_context"}, "id": 1}
<- {"jsonrpc": "2.0", "result": {...}, "id": 1}
```

## Error Handling

All tools return MCP-compliant errors:

```typescript
{
  code: -32000,  // Application error
  message: "Task not found",
  data: {
    taskId: 999,
    available: [1, 2, 3]
  }
}
```

Error codes:
- `-32000`: Application error (Orchestra-specific)
- `-32001`: Configuration error
- `-32002`: State error (no current task, etc.)
- `-32600`: Invalid request (MCP standard)
- `-32601`: Method not found (MCP standard)

## Testing

```bash
# Run MCP tests
npm run test:mcp

# Manual testing with MCP Inspector
npx @modelcontextprotocol/inspector dist/mcp/server.js
```

## Core Library API Usage

MCP tools wrap the core library (import from `src/core/index.js`):

```typescript
// src/mcp/tools/prepare.ts
import { runPrepare, loadManifest } from '../../core/index.js';

export async function handlePrepare(params: PrepareParams) {
  const result = await runPrepare({
    task: params.taskId?.toString(),
    // ... options from MCP params
  });
  
  return {
    success: result.success,
    taskId: result.taskId,
    title: result.task.title,
    handoverPath: result.handoverPath,
    verificationPath: result.verificationPath,
    // ... formatted for MCP response
  };
}
```

```typescript
// src/mcp/tools/signal.ts (Implementor tool)
import { runSignal } from '../../core/index.js';

export async function handleSignal(params: SignalParams) {
  const result = await runSignal({
    summary: params.summary,
    files: params.files,
    tests: params.tests,
    notes: params.notes,
  });
  
  return {
    success: result.success,
    taskId: result.taskId,
    signalPath: result.signalPath,
    signaledAt: result.signaledAt,
    nextStep: result.nextStep,
  };
}
```

## Relationship to Phase 3

Phase 2 (MCP Server) becomes embedded in Phase 3 (VS Code Extension):

```
Phase 3 Extension
├── Extension Host
│   ├── UI Components
│   └── Extension Logic
└── MCP Server (from Phase 2)
    ├── Server Entry
    └── Tools (all 6)
```

The Phase 2 MCP server will be imported and embedded, not run as a separate process.

