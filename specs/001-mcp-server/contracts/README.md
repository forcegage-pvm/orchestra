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
    "description": "Actor role for access control"
  }
}
```

### Error Responses
All tools return MCP-compliant errors:
```json
{
  "code": -32000,
  "message": "Human-readable error",
  "data": { "context": "..." }
}
```
