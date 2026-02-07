# TD-034: Agent Tool UX Contracts (Docs, Schema, Validation)

**Status**: Open  
**Date**: 2026-02-05  
**Priority**: High

## Problem

Agents are repeatedly failing to call tools correctly because tool contracts are
inconsistent or unclear across:

- Tool descriptions (prompt guidance and wrapper definitions)
- Input schemas (validation requirements)
- Validation error messages (actionable guidance)
- Example snippets (minimal valid payloads)

This results in multiple failed attempts before success (e.g., missing required
fields such as `issues[].rationale`), wastes iterations, and produces unreliable
agent behavior.

## Impact

- Higher iteration counts and wasted tokens
- Reduced trust in tool reliability
- Slower workflows for controllers/implementors
- More manual intervention to correct tool usage

## Scope

All tools, across all roles (orchestrator/implementor/controller), including:

- MCP-backed tools
- Extension wrapper tools
- Any tool surfaced to agents in prompts or tool registries

## Proposed Fix

Create a single, consistent tool UX contract standard and apply it to all tools:

1. **Schema alignment**
   - Ensure wrapper schemas match MCP schemas exactly
   - Required fields are identical and enforced

2. **Descriptions**
   - Include critical constraints in tool description text
   - Note required fields and decision-dependent requirements

3. **Validation messages**
   - Provide concise, actionable error messages
   - Include a minimal valid example payload
   - Explain why missing fields are required

4. **Examples**
   - Add short minimal examples for each tool
   - Provide decision-based examples when inputs vary

5. **Consistency checks**
   - Add lint/test coverage to detect schema drift
   - Add tests that validate tool usage error messages

## Success Criteria

- Agents submit valid tool calls on first attempt for common paths
- Schema mismatches between wrapper and MCP tools are eliminated
- Tool validation errors clearly explain the correction required
- Automated checks catch tool contract drift

## Work Items

- Define tool UX contract template (description + schema + error example)
- Apply template to all tool definitions (MCP + wrappers)
- Update prompt guidance for key workflows
- Add tests for schema alignment and error messages

## Notes

This is technical debt because it is cross-cutting, repeat failure observed in
production usage, and requires system-wide consistency to resolve.
