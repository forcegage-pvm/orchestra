# Research: Custom AI Coding Agents

**Feature**: 002-custom-agents | **Date**: 2026-01-12  
**Status**: Complete

---

## R1: VS Code vscode.lm API Capabilities

### Decision: Use vscode.lm API for autonomous agent execution

### Rationale
The `vscode.lm` API provides native tool calling support via `LanguageModelToolCallPart`, streaming responses, and integration with VS Code's consent and quota management. This is superior to external API calls because it leverages the user's existing Copilot subscription and consent.

### Key Findings

#### Model Selection
```typescript
// Select by vendor + family
const [model] = await vscode.lm.selectChatModels({ 
  vendor: 'copilot', 
  family: 'gpt-4o' 
});

// Model provides token counting and context limits
const tokens = await model.countTokens(message);
const maxTokens = model.maxInputTokens;
```

#### Streaming Responses
```typescript
const response = await model.sendRequest(messages, { tools }, token);

for await (const part of response.stream) {
  if (part instanceof vscode.LanguageModelTextPart) {
    // Stream text to output panel
    onThinking(part.value);
  } else if (part instanceof vscode.LanguageModelToolCallPart) {
    // Execute tool and continue loop
    const result = await executeToolCall(part);
    // Add result as LanguageModelToolResultPart
  }
}
```

#### Tool Calling Protocol
1. Define tools with JSON Schema in `LanguageModelChatTool`
2. Pass tools in request options
3. Model returns `LanguageModelToolCallPart` with `callId`, `name`, `input`
4. Execute tool and create `LanguageModelToolResultPart` with matching `callId`
5. Add result as user message, continue loop

#### Error Handling
- `LanguageModelError.NoPermissions()` - User consent not granted
- `LanguageModelError.Blocked()` - Quota/content policy
- `LanguageModelError.NotFound()` - Model unavailable

#### Cancellation
```typescript
const cts = new vscode.CancellationTokenSource();
// Pass cts.token to sendRequest
// Call cts.cancel() to stop; break from stream loop
```

### Alternatives Considered
- **External API calls**: Rejected - requires API keys, no VS Code integration
- **Chat participant API**: Rejected - designed for user interaction, not autonomous execution

---

## R2: Tool Calling Protocol (vscode.lm vs MCP)

### Decision: Implement dual-layer tools - vscode.lm for agent loop, MCP for Orchestra-specific operations

### Rationale
The vscode.lm API uses a different tool protocol than MCP. For coding tools (edit, read_file, etc.), we implement them as vscode.lm tools. For Orchestra operations (get_current_task, signal_completion), we can either wrap MCP calls or implement directly against the database.

### Key Findings

#### vscode.lm Tool Schema
```typescript
const tool: vscode.LanguageModelChatTool = {
  name: 'read_file',
  description: 'Read contents of a file at the given path',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to read' }
    },
    required: ['path']
  }
};
```

#### Tool Result Reporting
```typescript
// After tool execution
const resultPart = new vscode.LanguageModelToolResultPart(
  toolCall.callId,  // Must match the request
  [new vscode.LanguageModelTextPart(resultString)]
);

messages.push(vscode.LanguageModelChatMessage.User([resultPart]));
```

#### Multi-turn with Tools
```
User → "Read config.json and summarize"
Assistant → [ToolCallPart: read_file, {path: 'config.json'}]
User → [ToolResultPart: callId, content]
Assistant → "The config contains..."
```

### Implementation Strategy
1. **Coding tools**: Implement directly using VS Code APIs (workspace.fs, workspace.applyEdit)
2. **Orchestra tools**: Call database directly (avoids MCP server overhead in autonomous mode)
3. **System tools**: Use VS Code task/terminal APIs

---

## R3: Webview Panel for Real-Time Output

### Decision: Use WebviewViewProvider with message batching and virtual scrolling

### Rationale
The webview provides rich formatting (collapsible cards for tool results, syntax highlighting for code) while message batching at 50ms intervals ensures 60fps performance without overwhelming the message channel.

### Key Findings

#### Message Batching Pattern
```typescript
class MessageBatcher {
  private buffer: StreamItem[] = [];
  private flushTimer: NodeJS.Timeout | undefined;
  private readonly flushInterval = 50; // 50ms for 60fps

  queue(item: StreamItem): void {
    this.buffer.push(item);
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  private flush(): void {
    const batch = this.buffer;
    this.buffer = [];
    this.flushTimer = undefined;
    this.webview.postMessage({ type: 'streamBatch', items: batch });
  }
}
```

#### Virtual Scrolling
- Use manual virtual scrolling for simplicity
- Only render visible items + 5 overscan
- Trigger at 200+ items

#### Memory Management
- Prune history at 500 items
- Remove items older than 30 minutes
- Prune on visibility change (document.hidden)

#### State Persistence
- Use `webview.getState()/setState()` for scroll position and summary
- Enable `retainContextWhenHidden` only during active streaming
- Restore from summary when webview recreated

### Existing Patterns to Follow
- `DashboardPanel.ts` - Message protocol, CSP setup
- `CurrentTaskViewProvider.ts` - Sidebar webview pattern
- `currentTaskTemplate.ts` - HTML template generation

---

## R4: Session Persistence

### Decision: File-based JSON storage in `.orchestra/sessions/` with per-iteration checkpoints

### Rationale
File-based storage provides unlimited size, human-readable backup, and git integration. Per-iteration checkpoints balance recovery granularity with storage efficiency. SQLite is already used for structured data; files are better for large conversation blobs.

### Key Findings

#### Session File Schema
```typescript
interface AgentSessionState {
  version: "1.0";
  sessionId: string;
  role: "orchestrator" | "implementor";
  taskId: number | null;
  sprintId: string;
  status: "active" | "paused" | "completed" | "failed";
  currentIteration: number;
  maxIterations: number;
  messages: AgentMessage[];
  toolCalls: ToolCallRecord[];
  fileChanges: FileChangeRecord[];
  checkpoints: CheckpointReference[];
  createdAt: string;  // ISO 8601
  updatedAt: string;
}
```

#### Storage Layout
```
.orchestra/sessions/
├── session-{uuid}.json           # Full session state
└── checkpoints/
    └── {sessionId}-iter-{n}.json # Per-iteration checkpoints
```

#### Checkpoint Strategy
- Create checkpoint after each complete iteration
- Store message count, tool call count, file change count
- Enable resume from any iteration boundary

#### Concurrency (Lock Files)
```typescript
// Acquire exclusive lock
const lockPath = `.orchestra/sessions/${sessionId}.lock`;
const handle = await open(lockPath, O_CREAT | O_EXCL | O_WRONLY);
// Write process info, detect stale locks (>5min)
```

#### Atomic Writes
```typescript
// Write to temp, then atomic rename
const tempPath = `${sessionPath}.tmp.${Date.now()}`;
await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
await fs.rename(tempPath, sessionPath);
```

#### Corrupted State Recovery
1. Detect incomplete write (no closing brace)
2. Validate with Zod schema
3. Fall back to last checkpoint
4. Migrate schema versions

### Alternatives Considered
- **workspaceState (Memento)**: Rejected for full history (5MB limit), kept for quick metadata
- **SQLite for sessions**: Rejected - files are better for large blobs, human debugging
- **Per-tool-call checkpoints**: Rejected - too many files, minimal benefit

---

## R5: Existing Orchestra Integration Points

### Decision: Reuse existing database, logger, and command patterns

### Rationale
The extension already has well-established patterns for database access, structured logging, error handling, and command registration. The agent system should integrate with these rather than creating parallel infrastructure.

### Key Findings

#### Database Integration
- Reuse `OrchestraDB` singleton from `extension/src/database/client.ts`
- Use existing query functions from `queries.ts` for task/sprint data
- Add new queries for agent-specific needs (session labels, etc.)

#### Logger Integration
- Use existing `OrchestraLogger` from `extension/src/utils/logger.ts`
- Maintain structured logging format
- Log agent iterations, tool calls, errors with context

#### Command Patterns
- Follow existing command registration in `extension.ts`
- Add `orchestra.startAgent`, `orchestra.pauseAgent`, `orchestra.stopAgent`
- Use TreeView context menus for task-specific agent invocation

#### MCP Server Coordination
- Agents run independently of MCP servers
- MCP servers are for external tool access (Copilot Chat)
- Agent tools call database directly (no MCP overhead)

#### Session Manager Reuse
- Existing `SessionManager` is for VS Code Chat integration
- Agent system uses separate `AgentSessionManager` for autonomous execution
- Can coexist without conflict

### File Change Tracking
- Track via WorkspaceEdit before applying
- Store original content for undo
- Use existing `vscode.workspace.applyEdit()` for modifications

---

## Summary: Key Architectural Decisions

| Decision | Choice | Key Reason |
|----------|--------|------------|
| LLM API | vscode.lm | Native tool calling, consent management |
| Tool Protocol | vscode.lm tools (not MCP) | Optimized for autonomous loop |
| Output Display | Webview Panel | Rich formatting, collapsible cards |
| Message Transport | Batched postMessage (50ms) | 60fps performance |
| Session Storage | JSON files | Human-readable, unlimited size |
| Checkpoints | Per-iteration | Balance of granularity and efficiency |
| Database Access | Direct (not MCP) | Lower overhead in autonomous mode |
| Concurrency | Lock files + atomic writes | Cross-window safety |

---

*Research completed by /speckit.plan on 2026-01-12*
