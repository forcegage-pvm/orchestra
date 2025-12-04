# MCP Tool Contracts

This directory contains the input/output schemas for all Orchestra MCP tools.

## Tools Overview

| Tool | Role Access | Wraps CLI | Description |
|------|-------------|-----------|-------------|
| [init](./init.json) | Orchestrator | `orchestra init` | Initialize sprint |
| [status](./status.json) | Both | `orchestra status` | View sprint status |
| [closeout](./closeout.json) | Orchestrator | `orchestra closeout` | Verify task closeout |
| [prepare](./prepare.json) | Orchestrator | `orchestra prepare` | Prepare task handover |
| [signal](./signal.json) | Implementor | `orchestra signal` | Signal completion |
| [accept_signal](./accept_signal.json) | Orchestrator | `orchestra accept-signal` | Accept signal |
| [verify](./verify.json) | Orchestrator | `orchestra verify` | Run verification |
| [complete](./complete.json) | Orchestrator | `orchestra complete` | Complete task |
| [feedback](./feedback.json) | Orchestrator | `orchestra feedback` | Generate feedback |
| [escalate](./escalate.json) | Orchestrator | `orchestra escalate` | Escalate to human |

## Common Patterns

### Role Parameter
All tools require a `role` parameter:
```json
{
  "role": {
    "type": "string",
    "enum": ["implementor", "orchestrator"],
    "description": "Actor role for access control (case-sensitive lowercase)"
  }
}
```

### Timestamp Format
All timestamps use ISO 8601 format:
```json
{
  "signaledAt": "2025-12-04T14:30:00Z",
  "completedAt": "2025-12-04T15:45:00Z"
}
```

### Status Values
All status fields use lowercase values:
- `"pending"` - Not started
- `"in_progress"` - Currently active
- `"completed"` - Successfully finished
- `"escalated"` - Escalated to human (tasks only)

### Nullable Fields
Nullable fields use JSON Schema union type:
```json
{
  "nextTask": { "type": ["number", "null"] }
}
```

### Error Responses
All tools return MCP-compliant errors:
```json
{
  "code": -32000,
  "message": "Human-readable error with actionable guidance",
  "data": { "context": "..." }
}
```

### Error Codes
| Code | Name | Description |
|------|------|-------------|
| -32000 | ApplicationError | General application error (file, manifest) |
| -32001 | ConfigurationError | Config/setup issues |
| -32002 | StateError | State issues (no current task, lock contention) |
| -32003 | RoleError | Role validation failures |
| -32600 | InvalidRequest | Invalid input/validation error |
| -32601 | MethodNotFound | Unknown tool name |

### Naming Convention
- MCP tool names use underscore: `accept_signal`
- CLI commands use hyphen: `orchestra accept-signal`
- This follows MCP SDK conventions while CLI follows POSIX conventions
```
