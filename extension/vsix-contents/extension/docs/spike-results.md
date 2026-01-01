# VS Code Chat API Spike - Results

**Date**: December 19, 2025  
**Task**: Task 1 - Spike: Test VS Code Chat API for agent invocation  
**Status**: Complete

## Executive Summary

This spike investigated VS Code's `workbench.action.chat.open` command to determine the best approach for programmatically invoking chat with specific agents and file attachments. The findings inform the ChatInvoker class implementation (Task 2).

## Key Findings

### 1. Agent Selection

**Question**: How do we select which agent (.agent.md file) handles the chat?

**Finding**: The `@participantName` prefix in the query is the standard approach.

```typescript
await vscode.commands.executeCommand("workbench.action.chat.open", {
  query: "@orchestra I'm ready to work as the orchestrator agent.",
});
```

**Details**:
- ✅ **@participant prefix works**: `@orchestra` successfully routes to our chat participant
- ❌ **agentId parameter does NOT exist**: Testing showed no `agentId` parameter is supported
- ✅ **Agent context is inferred**: The agent mode is determined by the message content, not a parameter
- The chat participant can inspect the query to determine which .agent.md file to load

**Agent ID Format**: Our participants are registered as:
- `orchestra` - The main chat participant (handles both orchestrator and implementor modes)

### 2. File Attachments

**Question**: How do we attach context files?

**Finding**: The `attachFiles` parameter exists but has limited documentation.

```typescript
// Theoretical usage (not yet tested in production):
const testFile = vscode.Uri.file('/path/to/file.ts');
await vscode.commands.executeCommand("workbench.action.chat.open", {
  query: "Analyze this file",
  attachFiles: [testFile],
  isPartialQuery: false,
});
```

**Details**:
- ⚠️ **Format appears to be vscode.Uri[]**: Based on VS Code API patterns
- ⚠️ **Not yet production tested**: Our current implementation uses MCP tools for file access instead
- ✅ **Alternative approach**: Using the chat participant's context resolver works reliably
- Our ContextFileResolver provides file access via handover-specified context files

**Recommendation**: Continue using ContextFileResolver approach rather than attachFiles parameter for now, as it provides better control and is working reliably.

### 3. Auto-Send Behavior

**Question**: Does `isPartialQuery: false` auto-send the message?

**Finding**: The parameter controls chat behavior but does NOT auto-send in all cases.

```typescript
await vscode.commands.executeCommand("workbench.action.chat.open", {
  query: "@orchestra Start working on Task 9",
  isPartialQuery: false, // Indicates this is a complete query
});
```

**Details**:
- ⚠️ **Behavior is unclear**: Documentation does not specify exact behavior
- ✅ **Chat opens with pre-filled query**: The query appears in the chat input
- ❓ **User confirmation may be required**: For safety, VS Code may require user to press Enter
- This is acceptable behavior for our use case - user can review before sending

**Recommendation**: Use `isPartialQuery: false` to indicate complete queries, but do not rely on auto-send. The user review step adds safety.

### 4. Mode Parameter

**Question**: Can we specify a mode like 'agent' or 'ask'?

**Finding**: No `mode` parameter is supported.

**Details**:
- ❌ **No mode parameter**: Testing showed this parameter is not recognized
- ✅ **Mode is inferred from query**: Using `@participant` prefix is sufficient
- The chat participant implementation determines the actual agent mode internally

### 5. Model Selection

**Question**: Can we select a specific model (e.g., GPT-4, Claude)?

**Finding**: No model selection in the command API.

**Details**:
- ❌ **No modelSelector parameter**: This is not supported via `workbench.action.chat.open`
- ✅ **Model is user-configured**: Users set their preferred model in VS Code settings
- ✅ **Agent instructions can suggest**: Our .agent.md files specify "use Claude Sonnet 4.5"
- This is acceptable - users control their model preferences

## Implementation Recommendations

### For ChatInvoker Class (Task 2)

Based on these findings, the ChatInvoker should:

1. **Agent Selection**:
   ```typescript
   async invokeOrchestrator(): Promise<void> {
     await vscode.commands.executeCommand("workbench.action.chat.open", {
       query: "@orchestra I'm ready to work as the orchestrator agent.",
     });
   }
   ```

2. **Task Context**:
   ```typescript
   async startTask(taskId: string, taskTitle: string): Promise<void> {
     await vscode.commands.executeCommand("workbench.action.chat.open", {
       query: `@orchestra Start working on Task ${taskId}: ${taskTitle}. The handover has been prepared and I'm ready to implement.`,
     });
   }
   ```

3. **File Access**: 
   - Use ContextFileResolver instead of attachFiles
   - Chat participant reads context files from handover specs
   - More reliable and provides better error handling

4. **Error Handling**:
   ```typescript
   try {
     await vscode.commands.executeCommand("workbench.action.chat.open", { ... });
   } catch (error) {
     vscode.window.showErrorMessage(`Failed to open chat: ${error.message}`);
     logger.error("Chat invocation failed", error);
   }
   ```

## What Works ✅

- ✅ Opening chat with `workbench.action.chat.open`
- ✅ Pre-filling query with `query` parameter
- ✅ Using `@orchestra` to route to our participant
- ✅ Agent mode inference from message content
- ✅ ContextFileResolver for accessing context files
- ✅ Error handling with try/catch

## What Doesn't Work ❌

- ❌ `agentId` parameter (does not exist)
- ❌ `mode` parameter (not supported)
- ❌ `modelSelector` parameter (not supported)
- ❌ Guaranteed auto-send behavior

## Production Implementation

The spike findings have been integrated into extension.ts with three commands:

1. **orchestra.invokeOrchestrator**
   - Opens chat with orchestrator context
   - Query: "@orchestra I'm ready to work as the orchestrator agent."

2. **orchestra.invokeImplementor**
   - Opens chat with implementor context
   - Query: "@orchestra I'm ready to work as the implementor agent."

3. **orchestra.startTask**
   - Opens chat with specific task context
   - Query: "@orchestra Start working on Task X: Title..."
   - Validates handover exists before invoking

## Next Steps

1. ✅ **Spike complete** - Findings documented
2. 🔄 **Task 2**: Implement ChatInvoker class based on these patterns
3. 🔄 **Integration**: Connect ChatInvoker to tree view and commands
4. 🔄 **Testing**: Add comprehensive tests for chat invocation

## Test Coverage

Tests should verify:
- ✅ Commands call `workbench.action.chat.open` with correct parameters
- ✅ Query strings include `@orchestra` prefix
- ✅ Task context includes task ID and title
- ✅ Error handling for failed chat invocations
- ✅ Logging of invocation events

## References

- VS Code Chat API: Part of the workbench commands (undocumented)
- Chat Participant API: `vscode.chat` namespace
- Agent files: `extension/agents/*.agent.md`
- Implementation: `extension/src/extension.ts` lines 226-318

## Lessons Learned

1. **Documentation is sparse**: VS Code chat API is not fully documented; testing was essential
2. **Simplicity wins**: The `@participant` prefix approach is simpler than imagined
3. **User control**: VS Code maintains user control over model selection and message sending
4. **File access alternatives**: MCP tools and ContextFileResolver provide better file access than attachFiles
5. **Error handling is critical**: Chat API can fail silently; explicit error handling required
