# Quickstart: Orchestra MCP Server

## Prerequisites

- Node.js 18+
- Orchestra CLI installed (`npm install -g orchestra` or local)
- VS Code with GitHub Copilot extension

## Installation

```bash
# From orchestra project root
npm install @modelcontextprotocol/sdk
npm run build
```

## VS Code Configuration

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

## Testing the Server

### Manual Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector dist/mcp/server.js
```

### Verify Tool Discovery

The inspector should show 10 registered tools:
- init, status, closeout, prepare, signal
- accept_signal, verify, complete, feedback, escalate

## Usage from Copilot Agent

### As Orchestrator

```
User: "Prepare the next task"
Copilot: [calls prepare tool with role: "orchestrator"]
→ Returns task details, handover path

User: "The implementor signaled completion, verify their work"
Copilot: [calls accept_signal then verify with role: "orchestrator"]
→ Returns verification results

User: "Verification passed, complete the task"
Copilot: [calls complete with role: "orchestrator"]
→ Task marked complete, returns next task info
```

### As Implementor

```
User: "I finished implementing, signal completion"
Copilot: [calls signal tool with role: "implementor"]
→ Signal file created, awaiting orchestrator review
```

## Role Enforcement

All tool calls require a `role` parameter:
- `"implementor"` - Can only use: signal, status
- `"orchestrator"` - Can use all tools

Calls without role or with wrong role for the tool will fail:
```json
{
  "code": -32003,
  "message": "role parameter required",
  "data": { "tool": "verify" }
}
```

## Error Handling

| Code | Meaning |
|------|---------|
| -32000 | Application error (file not found, etc.) |
| -32001 | Configuration error |
| -32002 | State error (no current task, etc.) |
| -32003 | Role/permission error |
| -32600 | Invalid request |

## Troubleshooting

### Server won't start
- Check Node.js version: `node --version` (need 18+)
- Check build: `npm run build`
- Check path in settings.json matches actual build output location

### Tools not appearing in Copilot
- Reload VS Code window (Ctrl/Cmd + Shift + P → "Developer: Reload Window")
- Check MCP server is running (no errors in Output panel → "GitHub Copilot Chat")
- Verify settings.json is in workspace `.vscode/` folder (not user settings)

### Permission denied errors
- Ensure correct `role` parameter: must be exactly `"implementor"` or `"orchestrator"` (case-sensitive, lowercase)
- Implementor can only use `signal` and `status`
- Orchestrator can use all 10 tools

### Concurrent access errors
- Only one write operation at a time
- Wait 2-3 seconds and retry after "operation in progress" error
- Lock is automatically released after operation completes
- Stale locks (>5 min) are auto-cleaned

### VS Code reload behavior
- MCP server restarts when VS Code window reloads
- In-progress operations are interrupted (lock is auto-cleaned on restart)
- No persistent server state - all state in `.orchestra/` files

### Lock file issues
- Lock file location: `.orchestra/.lock`
- If stuck, check if lock is stale (>5 min old) - will auto-clean
- Manual cleanup: delete `.orchestra/.lock` (only if server is not running)

### Debug logging
```bash
# Start server with debug output
DEBUG=orchestra:* node dist/mcp/server.js
```

### Testing with MCP Inspector
```bash
# Interactive testing (recommended for debugging)
npx @modelcontextprotocol/inspector dist/mcp/server.js

# Test specific tool
# In inspector: Call "status" with { "role": "orchestrator" }
```

### Phase 1.2 commands not working
If `feedback` or `escalate` return "not implemented":
- These require Phase 1.2 CLI completion
- Check `orchestra --help` to verify commands exist
- Upgrade Orchestra CLI if needed

## Verification Checklist

Before reporting issues, verify:

- [ ] `node --version` shows 18.x or higher
- [ ] `npm run build` completes without errors  
- [ ] `.vscode/settings.json` exists with mcpServers config
- [ ] VS Code reloaded after config change
- [ ] No errors in Output → "GitHub Copilot Chat"
- [ ] MCP Inspector shows 10 tools registered
- [ ] `status` tool works with role "orchestrator"