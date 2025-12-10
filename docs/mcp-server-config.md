# Orchestra MCP Server Configuration

This document explains how to configure and use the Orchestra MCP servers with role-based access control.

## Overview

Orchestra uses **two MCP server instances** with role-based tool filtering:

| Server | Role | Tools | Purpose |
|--------|------|-------|---------|
| `orchestra-orchestrator` | orchestrator | 20 | Task preparation, verification, judgment |
| `orchestra-implementor` | implementor | 8 | Task execution, signaling, feedback |

This structural separation ensures:
- Implementor cannot see verification criteria
- Implementor cannot submit judgments
- Orchestrator cannot signal completion
- Each role has only the tools they need

## Installation

### 1. Install Orchestra

```bash
npm install orchestra
# or
npm install -g orchestra
```

### 2. Configure MCP Servers

Copy the template configuration to your project:

**For VS Code with Copilot (`.vscode/mcp.json`):**
```json
{
  "servers": {
    "orchestra-orchestrator": {
      "type": "stdio",
      "command": "node",
      "args": ["node_modules/orchestra/dist/mcp-server/index.js", "--role=orchestrator"],
      "env": {
        "ORCHESTRA_WORKSPACE": "${workspaceFolder}"
      }
    },
    "orchestra-implementor": {
      "type": "stdio",
      "command": "node",
      "args": ["node_modules/orchestra/dist/mcp-server/index.js", "--role=implementor"],
      "env": {
        "ORCHESTRA_WORKSPACE": "${workspaceFolder}"
      }
    }
  }
}
```

**For Claude Desktop (`claude_desktop_config.json`):**
```json
{
  "mcpServers": {
    "orchestra-orchestrator": {
      "command": "node",
      "args": ["/path/to/orchestra/dist/mcp-server/index.js", "--role=orchestrator"],
      "env": {
        "ORCHESTRA_WORKSPACE": "/path/to/your/project"
      }
    },
    "orchestra-implementor": {
      "command": "node",
      "args": ["/path/to/orchestra/dist/mcp-server/index.js", "--role=implementor"],
      "env": {
        "ORCHESTRA_WORKSPACE": "/path/to/your/project"
      }
    }
  }
}
```

### 3. Configure Agent Files (Optional but Recommended)

Copy the agent definition files to your project:

```
.github/agents/
├── orchestra.orchestrator.md    # Orchestrator agent instructions
└── orchestra.implementor.md     # Implementor agent instructions
```

These files provide role-specific instructions and tool restrictions.

## Usage

### With Custom Agents (Copilot)

```
@orchestra.orchestrator prepare the next task for implementation
@orchestra.implementor show me my current task
```

### Manual Role Switching

If not using custom agents, specify which MCP server to use:

```
Use the orchestra-orchestrator tools to verify task 5
Use the orchestra-implementor tools to signal completion
```

## Role Tool Reference

### Orchestrator (20 tools)

**Sprint Configuration:**
- `configure_sprint`, `add_task`, `update_task`, `update_verification`
- `get_task`, `get_tasks`, `remove_task`

**Handover:**
- `prepare_task`, `update_handover`

**Verification:**
- `run_verification_checks`, `get_verification_results`, `submit_verification_judgment`

**Feedback & Completion:**
- `enhance_feedback`, `complete_task`

**Shared:**
- `get_signal`, `escalate_task`, `get_progress`, `get_sprint_status`, `get_task_history`, `set_config`

### Implementor (8 tools)

**Task Execution:**
- `get_current_task`, `signal_completion`, `get_feedback`

**Shared:**
- `get_signal`, `escalate_task`, `get_progress`, `get_sprint_status`, `get_task_history`

## Security Model

The role separation is **structural, not advisory**:

1. **Tool Filtering**: Each server only exposes tools for its role
2. **Access Denied**: Attempting to call a restricted tool returns `ROLE_ACCESS_DENIED`
3. **No Discovery**: Restricted tools don't appear in `tools/list`

This prevents:
- Implementor seeing verification criteria via `get_task`
- Implementor bypassing verification via `submit_verification_judgment`
- Accidental cross-role tool usage

## Development Mode

For development/testing, use `--role=full` to access all 23 tools:

```bash
node dist/mcp-server/index.js --role=full
```

**Warning**: Full mode bypasses role separation. Use only for development.

## Troubleshooting

### "Tool not available for role"

You're calling a tool not available for your current role. Check which MCP server you're connected to.

### "No active sprint"

Initialize a sprint first using the orchestrator role:
```
configure_sprint with your sprint definition
```

### "ORCHESTRA_WORKSPACE not set"

Ensure the `ORCHESTRA_WORKSPACE` environment variable points to your project root.
