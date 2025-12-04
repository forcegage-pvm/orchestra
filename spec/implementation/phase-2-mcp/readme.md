# Phase 2: MCP Server

> **Navigation**: [Implementation Index](../readme.md) | **Prev**: [Phase 1: CLI](../phase-1-cli/readme.md) | **Next**: Phase 3: VS Code Extension

---

## Status: 🔜 Next Phase

**Prerequisites**: Phase 1 CLI ✅ Complete

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
- [ ] All 6 core tools callable from Copilot agent mode
- [ ] Tools read/write `.orchestra/` state correctly
- [ ] `signal_complete` triggers verification flow
- [ ] Error responses follow MCP conventions
- [ ] Works with `copilot-instructions.md` MCP configuration

## Architecture

```
tools/orchestra/
├── src/
│   ├── cli.ts                # Phase 1 CLI entry
│   ├── commands/             # Phase 1 CLI commands
│   ├── core/                 # SHARED - Phase 1 services
│   │   ├── manifest.ts
│   │   ├── progress.ts
│   │   ├── verification.ts
│   │   └── ...
│   │
│   └── mcp/                  # NEW - Phase 2
│       ├── server.ts         # MCP server entry point
│       ├── index.ts          # Exports
│       └── tools/            # Tool definitions
│           ├── prepare_task.ts
│           ├── signal_complete.ts
│           ├── get_context.ts
│           ├── validate_handover.ts
│           ├── log_issue.ts
│           └── request_help.ts
│
├── package.json              # Add @modelcontextprotocol/sdk
└── mcp.json                  # MCP server manifest
```

## Tools

### Core Tools (Mapped from CLI)

| Tool | CLI Equivalent | Purpose | User |
|------|---------------|---------|------|
| `prepare_task` | `orchestra prepare` | Get task handover | Orchestrator |
| `signal_complete` | `orchestra accept-signal` | Signal task completion | Implementor |
| `get_context` | `orchestra status` | Get current task context | Both |
| `validate_handover` | (internal) | Check handover before working | Implementor |
| `log_issue` | (new) | Record issues/blockers | Both |
| `request_help` | (new) | Escalate to human | Both |

### Tool Definitions

#### prepare_task

```typescript
{
  name: "prepare_task",
  description: "Prepare the next task handover for implementation",
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
  taskId: number;
  title: string;
  description: string;
  handoverPath: string;
  dependencies: number[];
}
```

#### signal_complete

```typescript
{
  name: "signal_complete",
  description: "Signal that the current task is complete and ready for verification",
  inputSchema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "Brief description of what was implemented"
      },
      artifactsCreated: {
        type: "array",
        items: { type: "string" },
        description: "List of files created or modified"
      },
      testsAdded: {
        type: "array",
        items: { type: "string" },
        description: "List of test files added"
      }
    },
    required: ["summary", "artifactsCreated"]
  }
}
```

**Returns:**
```typescript
{
  accepted: boolean;
  taskId: number;
  checks: CheckResult[];
  nextStep: string;  // "verification" or "fix issues"
}
```

#### get_context

```typescript
{
  name: "get_context",
  description: "Get the current task context and sprint status",
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
    status: string;
  };
  currentTask: {
    id: number;
    title: string;
    status: string;
    category: string;
  };
  progress: {
    completed: number;
    total: number;
    percentComplete: number;
  };
}
```

#### validate_handover

```typescript
{
  name: "validate_handover",
  description: "Validate that the handover document is complete before starting work",
  inputSchema: {
    type: "object",
    properties: {}
  }
}
```

**Returns:**
```typescript
{
  valid: boolean;
  taskId: number;
  issues: string[];  // Empty if valid
}
```

#### log_issue

```typescript
{
  name: "log_issue",
  description: "Log an issue or blocker encountered during implementation",
  inputSchema: {
    type: "object",
    properties: {
      severity: {
        type: "string",
        enum: ["blocker", "major", "minor"],
        description: "Issue severity"
      },
      description: {
        type: "string",
        description: "Description of the issue"
      },
      suggestedFix: {
        type: "string",
        description: "Optional suggested resolution"
      }
    },
    required: ["severity", "description"]
  }
}
```

**Returns:**
```typescript
{
  logged: boolean;
  issueId: string;
  path: string;
}
```

#### request_help

```typescript
{
  name: "request_help",
  description: "Request human intervention for stuck task",
  inputSchema: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Why help is needed"
      },
      attemptsSoFar: {
        type: "number",
        description: "Number of attempts made"
      },
      lastError: {
        type: "string",
        description: "Last error encountered"
      }
    },
    required: ["reason"]
  }
}
```

**Returns:**
```typescript
{
  escalated: boolean;
  taskId: number;
  status: "ESCALATED";
}
```

## Tasks

| ID | Task | Status | Description |
|----|------|--------|-------------|
| 2.1 | [Project Setup](tasks/2.1-project-setup.md) | Not Started | Add MCP SDK, create mcp/ folder structure |
| 2.2 | [Server Core](tasks/2.2-server-core.md) | Not Started | MCP server entry point, tool registry |
| 2.3 | [prepare_task Tool](tasks/2.3-prepare-task.md) | Not Started | Wrap prepare handover |
| 2.4 | [signal_complete Tool](tasks/2.4-signal-complete.md) | Not Started | Wrap accept-signal flow |
| 2.5 | [get_context Tool](tasks/2.5-get-context.md) | Not Started | Wrap status command |
| 2.6 | [validate_handover Tool](tasks/2.6-validate-handover.md) | Not Started | Validate handover before work |
| 2.7 | [complete_task Tool](tasks/2.7-complete-task.md) | Not Started | Mark task complete, archive |
| 2.8 | [Integration Testing](tasks/2.8-integration-testing.md) | Not Started | E2E MCP testing |

### Future Tasks (Deferred)

These tools will be added in a later iteration:
- `log_issue` - Issue logging for blockers
- `request_help` - Human escalation
- Full documentation

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
    "prepare_task",
    "signal_complete",
    "get_context",
    "validate_handover",
    "log_issue",
    "request_help"
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
      "args": ["./tools/orchestra/dist/mcp/server.js"]
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

MCP tools wrap the core library:

```typescript
// src/mcp/tools/prepare_task.ts
import { prepareHandover, loadManifest } from '../../core';

export async function handlePrepareTask(params: PrepareTaskParams) {
  const manifest = loadManifest();
  const result = await prepareHandover({
    taskId: params.taskId,
    // ... options
  });
  
  return {
    taskId: result.taskId,
    title: result.task.title,
    handoverPath: result.handoverPath,
    // ... formatted for MCP response
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

