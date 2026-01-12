# Orchestra Custom Agent Architecture

> **Date**: January 9, 2026  
> **Status**: Analysis & Design  
> **Purpose**: Define architecture for building custom AI coding agents in the Orchestra VS Code extension

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Feature Analysis: VS Code Copilot Agent Capabilities](#feature-analysis-vs-code-copilot-agent-capabilities)
3. [Verbosity: Real-Time Agent Transparency](#verbosity-real-time-agent-transparency)
4. [Interruptability: User Control](#interruptability-user-control)
5. [Context & Memory: Persistent State](#context--memory-persistent-state)
6. [File Change Tracking](#file-change-tracking)
7. [Cross-Session Context for Orchestrator](#cross-session-context-for-orchestrator)
8. [Why Custom Agents (Not Chat Participants)](#why-custom-agents-not-chat-participants)
9. [Architecture Overview](#architecture-overview)
10. [Core Components](#core-components)
11. [Tool Implementations](#tool-implementations)
12. [Integration with Orchestra](#integration-with-orchestra)
13. [File Structure](#file-structure)
14. [Implementation Phases](#implementation-phases)
15. [Risks & Mitigations](#risks--mitigations)
16. [Open Questions](#open-questions)
17. [Next Steps](#next-steps)

---

## Executive Summary

This document defines the architecture for building **custom AI coding agents** within the Orchestra VS Code extension. These are NOT chat participants - they are autonomous coding agents that:

1. Use VS Code's `vscode.lm` API to call Copilot's language models directly
2. Implement custom tools ourselves within the extension
3. Run an autonomous agent loop with full coding capabilities
4. Are invoked programmatically by the extension (not via `@mention` in chat)

### Critical Requirements

| Requirement | Description |
|-------------|-------------|
| **Verbose** | User can see what agent is thinking/doing in real-time |
| **Interruptable** | User can pause, stop, or redirect the agent at any time |
| **Context/Memory** | Agent maintains context across interruptions and can resume |
| **File Tracking** | User can see all files modified by the agent |
| **Cross-Session** | Orchestrator maintains context across multiple task sessions |

---

## Feature Analysis: VS Code Copilot Agent Capabilities

This section analyzes standard features available in VS Code Copilot chat and agent mode that Orchestra agents should replicate or improve upon.

### Chat Response Output Types (ChatResponseStream API)

VS Code's `ChatResponseStream` provides these output capabilities:

| Feature | API Method | Orchestra Equivalent | Priority |
|---------|------------|---------------------|----------|
| **Markdown** | `stream.markdown()` | Webview HTML rendering | P0 - Core |
| **Code Blocks** | `stream.markdown()` with backticks | Syntax-highlighted code cards | P0 - Core |
| **Progress** | `stream.progress()` | Status updates in panel | P0 - Core |
| **File References** | `stream.reference()` | Clickable file links | P0 - Core |
| **Inline Anchors** | `stream.anchor()` | Links to symbols/locations | P1 - Important |
| **Buttons** | `stream.button()` | Action buttons in panel | P1 - Important |
| **File Trees** | `stream.filetree()` | Tree view of changes | P0 - Core |

### Message History (ChatContext API)

VS Code provides `context.history` with `ChatRequestTurn` and `ChatResponseTurn`:

```typescript
interface ChatContext {
  readonly history: ReadonlyArray<ChatRequestTurn | ChatResponseTurn>;
}
```

**Orchestra Requirements:**
- Full conversation history within a session ✅ (already planned)
- History persisted across VS Code restarts ✅ (AgentStateManager)
- History accessible across different task sessions ⚠️ (NEW - critical for Orchestrator)

### Tool Calling Capabilities

VS Code agent mode provides these tool-related features:

| Feature | Description | Orchestra Status |
|---------|-------------|-----------------|
| Tool invocation display | Shows which tool is being called | ✅ Planned in output panel |
| Tool result display | Shows tool output (collapsible) | ✅ Planned |
| Tool consent | User can approve/deny tool use | ⚠️ Need to add |
| Tool error display | Clear error messages | ✅ Planned |
| Tool cancellation | Cancel mid-tool-execution | ✅ Planned (AbortController) |

### File Change Visualization

**Current Copilot behavior:**
- Shows files being edited in real-time
- Provides diff view for changes
- "Keep/Discard" buttons for edits
- File tree showing all modified files

**Orchestra MUST have:**
1. **Changed Files Panel** - List of all files modified during session
2. **Diff View** - Show before/after for each file
3. **Undo Capability** - Revert individual file changes
4. **Grouped Changes** - Changes grouped by tool call / iteration

### User Feedback Mechanisms

| Feature | VS Code Chat | Orchestra Need |
|---------|--------------|----------------|
| 👍/👎 feedback | Yes | Optional (not critical) |
| Copy response | Yes | ✅ Yes - copy code blocks |
| Insert at cursor | Yes | ✅ Yes - for code results |
| Apply to file | Yes | Automatic (we use WorkspaceEdit) |
| Retry request | Yes | ✅ Via "Redirect" feature |

### Features We Need But Chat Doesn't Have

Orchestra agents require capabilities beyond standard chat:

| Feature | Why Needed | Priority |
|---------|-----------|----------|
| **Session Persistence** | Resume after VS Code restart | P0 - Critical |
| **Cross-Task Context** | Orchestrator remembers previous tasks | P0 - Critical |
| **Automated Execution** | No user prompting during run | P0 - Core |
| **Task-Specific Tools** | Orchestra MCP tools | P0 - Core |
| **Verification Integration** | Auto-verify against hidden criteria | P0 - Core |
| **Multi-Sprint Awareness** | Context about overall sprint | P1 - Important |

---

## File Change Tracking

### Problem Statement

Users need to see what files the agent modified, with the ability to review and undo changes.

### Changed Files Panel

```
┌─────────────────────────────────────────────────────────────────┐
│ 📁 Changed Files (5)                               [↩ Undo All] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ✏️ extension/src/chat/SessionManager.ts      [Diff] [↩ Undo]    │
│    └─ Added isSessionReady(), getSessionInfo() methods           │
│                                                                  │
│ ✏️ extension/test/chat/SessionManager.test.ts [Diff] [↩ Undo]   │
│    └─ Added 12 new test cases                                    │
│                                                                  │
│ ➕ extension/src/utils/newHelper.ts           [View] [↩ Undo]   │
│    └─ Created new utility module                                 │
│                                                                  │
│ ✏️ extension/package.json                    [Diff] [↩ Undo]    │
│    └─ Added new dependency                                       │
│                                                                  │
│ 🗑️ extension/src/deprecated.ts               [View] [↩ Undo]   │
│    └─ Deleted deprecated file                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation: FileChangeTracker

```typescript
interface FileChange {
  uri: vscode.Uri;
  operation: 'create' | 'modify' | 'delete';
  originalContent?: string;  // For undo
  newContent?: string;       // For display
  timestamp: number;
  toolCallId: string;        // Which tool made the change
  iteration: number;         // Which agent iteration
}

class FileChangeTracker {
  private changes: Map<string, FileChange[]> = new Map();
  
  // Track a file change
  trackChange(change: FileChange): void {
    const path = change.uri.fsPath;
    if (!this.changes.has(path)) {
      this.changes.set(path, []);
    }
    this.changes.get(path)!.push(change);
  }
  
  // Get all changed files
  getChangedFiles(): FileChange[] {
    const latest: FileChange[] = [];
    for (const [_path, changes] of this.changes) {
      latest.push(changes[changes.length - 1]);
    }
    return latest;
  }
  
  // Undo a specific file's changes
  async undoFile(uri: vscode.Uri): Promise<void> {
    const changes = this.changes.get(uri.fsPath);
    if (!changes || changes.length === 0) return;
    
    const firstChange = changes[0];
    const edit = new vscode.WorkspaceEdit();
    
    if (firstChange.operation === 'create') {
      // File was created - delete it
      edit.deleteFile(uri);
    } else if (firstChange.operation === 'delete') {
      // File was deleted - restore it
      edit.createFile(uri, { 
        contents: Buffer.from(firstChange.originalContent || '') 
      });
    } else {
      // File was modified - restore original content
      const doc = await vscode.workspace.openTextDocument(uri);
      const fullRange = new vscode.Range(
        doc.positionAt(0),
        doc.positionAt(doc.getText().length)
      );
      edit.replace(uri, fullRange, firstChange.originalContent || '');
    }
    
    await vscode.workspace.applyEdit(edit);
    this.changes.delete(uri.fsPath);
  }
  
  // Undo all changes
  async undoAll(): Promise<void> {
    const files = Array.from(this.changes.keys());
    for (const file of files.reverse()) {  // Reverse order for safety
      await this.undoFile(vscode.Uri.file(file));
    }
  }
  
  // Get diff for display
  getDiff(uri: vscode.Uri): string {
    const changes = this.changes.get(uri.fsPath);
    if (!changes) return '';
    
    const first = changes[0];
    const last = changes[changes.length - 1];
    
    // Generate unified diff
    return generateUnifiedDiff(
      first.originalContent || '',
      last.newContent || '',
      uri.fsPath
    );
  }
}
```

### Integration with Edit Tool

```typescript
// In edit.ts tool implementation
async function executeEdit(params: EditParams): Promise<ToolResult> {
  const uri = vscode.Uri.file(params.filePath);
  
  // Capture original content BEFORE edit
  let originalContent: string | undefined;
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    originalContent = doc.getText();
  } catch {
    // File doesn't exist (will be created)
  }
  
  // Apply the edit
  const edit = new vscode.WorkspaceEdit();
  // ... apply changes ...
  await vscode.workspace.applyEdit(edit);
  
  // Track the change
  const doc = await vscode.workspace.openTextDocument(uri);
  fileChangeTracker.trackChange({
    uri,
    operation: originalContent ? 'modify' : 'create',
    originalContent,
    newContent: doc.getText(),
    timestamp: Date.now(),
    toolCallId: currentToolCallId,
    iteration: currentIteration
  });
  
  return { success: true };
}
```

---

## Cross-Session Context for Orchestrator

### Problem Statement

The Orchestrator agent operates across multiple tasks in a sprint:
1. Prepares Task 1 → Implementor works → Orchestrator verifies
2. Prepares Task 2 → Implementor works → Orchestrator verifies
3. ... and so on

**Critical Need**: Orchestrator must remember:
- What happened in previous tasks
- What feedback was given
- What patterns worked/failed
- The overall sprint context

### Session vs. Task vs. Sprint Context

```
┌─────────────────────────────────────────────────────────────────┐
│                        SPRINT CONTEXT                            │
│   (Persists for entire sprint lifecycle)                        │
│   • Sprint ID, name, goals                                       │
│   • All phases and their status                                  │
│   • Overall progress metrics                                     │
│   • Key decisions and rationale                                  │
│                                                                  │
│   ┌───────────────────────────────────────────────────────────┐ │
│   │                    TASK CONTEXT                           │ │
│   │   (Persists for one task's lifecycle)                    │ │
│   │   • Task ID, requirements                                │ │
│   │   • Preparation decisions                                 │ │
│   │   • Verification results per attempt                      │ │
│   │   • Feedback given to implementor                        │ │
│   │                                                          │ │
│   │   ┌─────────────────────────────────────────────────────┐│ │
│   │   │              SESSION CONTEXT                        ││ │
│   │   │   (One agent invocation)                           ││ │
│   │   │   • Conversation history                            ││ │
│   │   │   • Tool call results                              ││ │
│   │   │   • Current iteration state                        ││ │
│   │   └─────────────────────────────────────────────────────┘│ │
│   └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Sprint Memory Store

```typescript
interface SprintMemory {
  sprintId: string;
  createdAt: number;
  updatedAt: number;
  
  // High-level sprint understanding
  goals: string;
  architectureDecisions: string[];
  keyPatterns: string[];  // "We're using X pattern for Y"
  
  // Per-task summaries (not full conversation)
  taskSummaries: TaskSummary[];
  
  // Cross-task learnings
  implementorPatterns: {
    successfulApproaches: string[];
    commonMistakes: string[];
    feedbackThatWorked: string[];
  };
}

interface TaskSummary {
  taskId: number;
  title: string;
  completedAt?: number;
  
  // Preparation summary
  preparationNotes: string;
  keyAcceptanceCriteria: string[];
  
  // Verification summary
  attemptCount: number;
  verificationNotes: string;
  finalOutcome: 'PASS' | 'FAIL' | 'ESCALATED';
  
  // What the orchestrator learned
  lessonsLearned: string[];
}
```

### Context Injection for Orchestrator

When the Orchestrator agent starts, inject relevant context:

```typescript
async function buildOrchestratorContext(taskId: number): Promise<string> {
  const sprintMemory = await loadSprintMemory(currentSprintId);
  const previousTasks = sprintMemory.taskSummaries
    .filter(t => t.completedAt)
    .slice(-3);  // Last 3 completed tasks
  
  return `
## Sprint Context
Sprint: ${sprintMemory.sprintId}
Goals: ${sprintMemory.goals}

## Architecture Decisions
${sprintMemory.architectureDecisions.map(d => `- ${d}`).join('\n')}

## Recent Task History
${previousTasks.map(t => `
### Task ${t.taskId}: ${t.title}
- Attempts: ${t.attemptCount}
- Outcome: ${t.finalOutcome}
- Key Lessons: ${t.lessonsLearned.join(', ')}
`).join('\n')}

## Implementor Patterns Observed
- Successful approaches: ${sprintMemory.implementorPatterns.successfulApproaches.join(', ')}
- Common mistakes: ${sprintMemory.implementorPatterns.commonMistakes.join(', ')}
- Effective feedback: ${sprintMemory.implementorPatterns.feedbackThatWorked.join(', ')}
`;
}
```

### Memory Update After Task Completion

```typescript
async function updateSprintMemory(
  taskId: number, 
  outcome: 'PASS' | 'FAIL' | 'ESCALATED',
  summary: string,
  lessons: string[]
): Promise<void> {
  const memory = await loadSprintMemory(currentSprintId);
  
  // Add task summary
  memory.taskSummaries.push({
    taskId,
    title: (await getTaskDetails(taskId)).title,
    completedAt: Date.now(),
    preparationNotes: summary,
    keyAcceptanceCriteria: [], // Extract from handover
    attemptCount: await getAttemptCount(taskId),
    verificationNotes: '',
    finalOutcome: outcome,
    lessonsLearned: lessons
  });
  
  // Update patterns based on outcome
  if (outcome === 'PASS') {
    // What worked this time?
    // Potentially ask LLM to extract patterns
  }
  
  memory.updatedAt = Date.now();
  await saveSprintMemory(memory);
}
```

### Persistent Storage Location

```
.orchestra/
├── agent-sessions/           # Individual session state (existing)
│   └── session-{uuid}.json
└── sprint-memory/            # Cross-session memory (NEW)
    └── sprint-{id}.json      # Sprint-level context
```

### Memory Compaction

Sprint memory can grow large. Implement compaction:

```typescript
async function compactSprintMemory(memory: SprintMemory): Promise<void> {
  if (memory.taskSummaries.length <= 10) return;
  
  // Keep last 5 tasks in full detail
  const recentTasks = memory.taskSummaries.slice(-5);
  const olderTasks = memory.taskSummaries.slice(0, -5);
  
  // Summarize older tasks using LLM
  const summary = await summarizeTaskHistory(olderTasks);
  
  memory.architectureDecisions.push(
    `[Historical Summary] ${summary}`
  );
  memory.taskSummaries = recentTasks;
}
```

---

## Verbosity: Real-Time Agent Transparency

The agent must be **fully transparent** - the user should see everything the agent is thinking and doing as it happens.

### Verbosity Levels

```typescript
enum VerbosityLevel {
  MINIMAL = 1,    // Only tool calls and results
  NORMAL = 2,     // + Agent reasoning summaries  
  DETAILED = 3,   // + Full LLM responses
  DEBUG = 4       // + Token counts, timing, raw messages
}
```

### What Gets Displayed

| Event | MINIMAL | NORMAL | DETAILED | DEBUG |
|-------|---------|--------|----------|-------|
| Tool call start | ✅ | ✅ | ✅ | ✅ |
| Tool call result | ✅ | ✅ | ✅ | ✅ |
| Agent thinking | ❌ | ✅ | ✅ | ✅ |
| Full LLM response | ❌ | ❌ | ✅ | ✅ |
| Token usage | ❌ | ❌ | ❌ | ✅ |
| Raw message array | ❌ | ❌ | ❌ | ✅ |

### Agent Output Panel UI

```
┌─────────────────────────────────────────────────────────────────┐
│ 🤖 Orchestra Agent (Implementor) - Task 9        [⏸ Pause] [⏹ Stop] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ 🔄 Iteration 3/50                                               │
│                                                                  │
│ 💭 THINKING:                                                    │
│ I need to read the SessionManager.ts file to understand the     │
│ current implementation before making changes...                  │
│                                                                  │
│ 🔧 TOOL: read_file                                              │
│ ├─ filePath: extension/src/chat/SessionManager.ts               │
│ ├─ startLine: 1                                                 │
│ └─ endLine: 100                                                 │
│                                                                  │
│ ✅ RESULT: (2.3KB, 100 lines)                                   │
│ ┌──────────────────────────────────────────────────────────┐    │
│ │ /**                                                       │    │
│ │  * SessionManager - Dual session management...            │    │
│ │  */                                                       │    │
│ │ ... (collapsed, click to expand)                          │    │
│ └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│ 💭 THINKING:                                                    │
│ I see the current structure. I need to add the isSessionReady   │
│ method. Let me edit the file...                                 │
│                                                                  │
│ 🔧 TOOL: edit                                                   │
│ ├─ filePath: extension/src/chat/SessionManager.ts               │
│ ├─ oldString: "isImplementorActive(): boolean {"                │
│ └─ newString: "isSessionReady(role: ...                         │
│                                                                  │
│ ✅ RESULT: Successfully edited SessionManager.ts                │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│ 📊 Tokens: 12,450 / 128,000 | Elapsed: 45s | Tools: 5 calls     │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation: AgentOutputPanel

```typescript
// extension/src/agents/ui/AgentOutputPanel.ts

interface AgentEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'error' | 'complete';
  timestamp: Date;
  content: string;
  metadata?: Record<string, unknown>;
}

class AgentOutputPanel {
  private panel: vscode.WebviewPanel;
  private events: AgentEvent[] = [];
  private verbosity: VerbosityLevel = VerbosityLevel.NORMAL;
  
  constructor(title: string, role: 'orchestrator' | 'implementor') {
    this.panel = vscode.window.createWebviewPanel(
      'orchestraAgent',
      `🤖 Orchestra Agent (${role})`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
  }
  
  // Called by AgentRunner during execution
  emitThinking(text: string): void {
    if (this.verbosity >= VerbosityLevel.NORMAL) {
      this.addEvent({ type: 'thinking', timestamp: new Date(), content: text });
    }
  }
  
  emitToolCall(toolName: string, input: object): void {
    this.addEvent({
      type: 'tool_call',
      timestamp: new Date(),
      content: toolName,
      metadata: { input }
    });
  }
  
  emitToolResult(toolName: string, result: ToolResult): void {
    this.addEvent({
      type: 'tool_result',
      timestamp: new Date(),
      content: result.success ? result.output ?? 'Success' : result.error ?? 'Failed',
      metadata: { success: result.success }
    });
  }
  
  private addEvent(event: AgentEvent): void {
    this.events.push(event);
    this.updateWebview();
  }
  
  private updateWebview(): void {
    this.panel.webview.html = this.renderHtml();
  }
}
```

### Streaming LLM Output

The agent must stream LLM responses in real-time, not wait for completion:

```typescript
// Stream the response as it arrives
for await (const chunk of response.stream) {
  if (chunk instanceof vscode.LanguageModelTextPart) {
    // Immediately show thinking to user
    this.outputPanel.streamThinking(chunk.value);
  } else if (chunk instanceof vscode.LanguageModelToolCallPart) {
    // Show tool call as it's decided
    this.outputPanel.emitToolCall(chunk.name, chunk.input);
  }
}
```

---

## Interruptability: User Control

The agent must be **fully controllable** by the user at all times.

### User Actions

| Action | Description | Implementation |
|--------|-------------|----------------|
| **Pause** | Temporarily halt after current step | Set `paused` flag, wait in loop |
| **Resume** | Continue from paused state | Clear `paused` flag |
| **Stop** | Abort agent, preserve state | Cancel token, save state |
| **Redirect** | Give new/amended instructions | Inject user message, continue |
| **Retry** | Re-run last tool call | Pop last messages, retry |

### Agent State Machine

```
                    ┌──────────────┐
                    │   STOPPED    │ ◄─── Stop button
                    └──────┬───────┘
                           │ Start
                           ▼
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│   PAUSED    │◄────►│   RUNNING    │◄────►│   WAITING    │
│             │      │              │      │  (for user)  │
└─────────────┘      └──────────────┘      └──────────────┘
  Pause/Resume         ▲      │              User input
                       │      │
                       │      ▼
                    ┌──────────────┐
                    │  EXECUTING   │ ◄─── Running a tool
                    │    TOOL      │
                    └──────────────┘
```

### Implementation: Cancellation & Pause

```typescript
// extension/src/agents/AgentRunner.ts

class AgentRunner {
  private state: 'stopped' | 'running' | 'paused' | 'waiting' | 'executing_tool' = 'stopped';
  private cancellationTokenSource: vscode.CancellationTokenSource;
  private pausePromise: Promise<void> | null = null;
  private pauseResolve: (() => void) | null = null;
  
  // User clicks Pause button
  pause(): void {
    if (this.state === 'running') {
      this.state = 'paused';
      this.pausePromise = new Promise(resolve => {
        this.pauseResolve = resolve;
      });
      this.outputPanel.showPaused();
    }
  }
  
  // User clicks Resume button
  resume(): void {
    if (this.state === 'paused' && this.pauseResolve) {
      this.state = 'running';
      this.pauseResolve();
      this.pausePromise = null;
      this.pauseResolve = null;
      this.outputPanel.showRunning();
    }
  }
  
  // User clicks Stop button
  stop(): void {
    this.state = 'stopped';
    this.cancellationTokenSource.cancel();
    this.saveState(); // Preserve for potential resume later
    this.outputPanel.showStopped();
  }
  
  // User types a new instruction
  async redirect(userMessage: string): Promise<void> {
    // Pause if running
    if (this.state === 'running') {
      this.pause();
    }
    
    // Add user message to conversation
    this.messages.push(
      vscode.LanguageModelChatMessage.User(userMessage)
    );
    
    // Resume execution with new context
    this.resume();
  }
  
  private async agentLoop(): Promise<AgentResult> {
    while (this.iterations < this.maxIterations) {
      // Check for pause
      if (this.pausePromise) {
        await this.pausePromise;
      }
      
      // Check for cancellation
      if (this.cancellationTokenSource.token.isCancellationRequested) {
        return { success: false, interrupted: true, state: this.getState() };
      }
      
      this.state = 'running';
      
      // ... rest of loop
    }
  }
}
```

### User Input During Execution

The agent panel includes an input box for user to provide instructions:

```typescript
// In AgentOutputPanel webview
<div class="user-input-area">
  <input type="text" id="userInput" placeholder="Type instruction or question..." />
  <button onclick="sendInput()">Send</button>
</div>

<script>
function sendInput() {
  const input = document.getElementById('userInput').value;
  vscode.postMessage({ type: 'userInput', content: input });
}
</script>
```

```typescript
// Handle in extension
panel.webview.onDidReceiveMessage(async (message) => {
  if (message.type === 'userInput') {
    await agentRunner.redirect(message.content);
  }
});
```

---

## Context & Memory: Persistent State

The agent must maintain context across interruptions and be able to resume.

### Memory Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                    AGENT MEMORY MODEL                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Layer 1: CONVERSATION HISTORY (In-Memory)                      │
│  ─────────────────────────────────────────                      │
│  • Full message array sent to LLM                               │
│  • System prompt + all user/assistant messages                  │
│  • Tool calls and results                                       │
│  • Grows during session, cleared on new task                    │
│                                                                  │
│  Layer 2: SESSION STATE (Persisted to Disk)                     │
│  ────────────────────────────────────────                       │
│  • Current task ID and status                                   │
│  • Iteration count                                              │
│  • Last checkpoint (can resume from here)                       │
│  • Files modified in this session                               │
│  • Saved on pause/stop, loaded on resume                        │
│                                                                  │
│  Layer 3: TASK CONTEXT (Database)                               │
│  ───────────────────────────────                                │
│  • Handover details (acceptance criteria, deliverables)         │
│  • Feedback from previous attempts                              │
│  • Verification results                                         │
│  • Loaded fresh for each task                                   │
│                                                                  │
│  Layer 4: WORKSPACE CONTEXT (On-Demand)                         │
│  ─────────────────────────────────────                          │
│  • File contents (read via tools)                               │
│  • Search results                                               │
│  • Diagnostics/problems                                         │
│  • Not stored, fetched when needed                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Session State Schema

```typescript
// extension/src/agents/AgentState.ts

interface AgentSessionState {
  // Identity
  sessionId: string;
  role: 'orchestrator' | 'implementor';
  taskId: number;
  sprintId: string;
  
  // Execution state
  status: 'running' | 'paused' | 'stopped' | 'completed' | 'failed';
  iteration: number;
  maxIterations: number;
  startedAt: string;       // ISO timestamp
  lastActivityAt: string;  // ISO timestamp
  
  // Conversation (serialized for resume)
  messages: SerializedMessage[];
  
  // Progress tracking
  toolCallCount: number;
  filesModified: string[];
  filesCreated: string[];
  testsRun: boolean;
  buildPassed: boolean | null;
  
  // Checkpoints for resume
  lastCheckpoint: {
    iteration: number;
    timestamp: string;
    messageCount: number;
  };
}

interface SerializedMessage {
  role: 'user' | 'assistant';
  content: string | SerializedPart[];
}

interface SerializedPart {
  type: 'text' | 'tool_call' | 'tool_result';
  value: unknown;
}
```

### State Persistence

```typescript
// extension/src/agents/AgentStateManager.ts

class AgentStateManager {
  private stateDir: string;
  
  constructor(workspaceRoot: string) {
    this.stateDir = path.join(workspaceRoot, '.orchestra', 'agent-sessions');
  }
  
  async saveState(state: AgentSessionState): Promise<void> {
    const filePath = path.join(this.stateDir, `${state.sessionId}.json`);
    await fs.promises.mkdir(this.stateDir, { recursive: true });
    await fs.promises.writeFile(filePath, JSON.stringify(state, null, 2));
  }
  
  async loadState(sessionId: string): Promise<AgentSessionState | null> {
    const filePath = path.join(this.stateDir, `${sessionId}.json`);
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  
  async getActiveSession(role: 'orchestrator' | 'implementor'): Promise<AgentSessionState | null> {
    // Find most recent non-completed session for this role
    const files = await fs.promises.readdir(this.stateDir);
    for (const file of files.sort().reverse()) {
      const state = await this.loadState(file.replace('.json', ''));
      if (state && state.role === role && state.status !== 'completed') {
        return state;
      }
    }
    return null;
  }
  
  async clearSession(sessionId: string): Promise<void> {
    const filePath = path.join(this.stateDir, `${sessionId}.json`);
    await fs.promises.unlink(filePath).catch(() => {});
  }
}
```

### Resuming After Interruption

```typescript
// extension/src/agents/AgentRunner.ts

class AgentRunner {
  async resumeFromState(state: AgentSessionState): Promise<AgentResult> {
    // 1. Restore session identity
    this.sessionId = state.sessionId;
    this.role = state.role;
    this.taskId = state.taskId;
    
    // 2. Restore conversation history
    this.messages = this.deserializeMessages(state.messages);
    this.iterations = state.iteration;
    
    // 3. Show resume message in panel
    this.outputPanel.emitThinking(
      `Resuming from checkpoint at iteration ${state.lastCheckpoint.iteration}...`
    );
    
    // 4. Add context about the interruption
    this.messages.push(
      vscode.LanguageModelChatMessage.User(
        `[SYSTEM: Session was interrupted and is now resuming. ` +
        `You were at iteration ${state.iteration}. Continue from where you left off.]`
      )
    );
    
    // 5. Continue the agent loop
    return this.agentLoop();
  }
  
  private deserializeMessages(serialized: SerializedMessage[]): vscode.LanguageModelChatMessage[] {
    return serialized.map(msg => {
      if (msg.role === 'user') {
        return vscode.LanguageModelChatMessage.User(
          this.deserializeContent(msg.content)
        );
      } else {
        return vscode.LanguageModelChatMessage.Assistant(
          this.deserializeContent(msg.content)
        );
      }
    });
  }
}
```

### Context Window Management

As conversations grow, we need to manage the context window:

```typescript
// extension/src/agents/ContextManager.ts

class ContextManager {
  private maxTokens: number = 100000;  // Leave buffer for response
  private estimatedTokensPerChar: number = 0.25;
  
  async compactMessages(
    messages: vscode.LanguageModelChatMessage[]
  ): Promise<vscode.LanguageModelChatMessage[]> {
    const estimatedTokens = this.estimateTokens(messages);
    
    if (estimatedTokens < this.maxTokens * 0.8) {
      return messages; // Still have room
    }
    
    // Strategy 1: Summarize old tool results
    const compacted = this.summarizeOldToolResults(messages);
    
    // Strategy 2: If still too large, drop old iterations
    if (this.estimateTokens(compacted) > this.maxTokens * 0.8) {
      return this.dropOldIterations(compacted);
    }
    
    return compacted;
  }
  
  private summarizeOldToolResults(
    messages: vscode.LanguageModelChatMessage[]
  ): vscode.LanguageModelChatMessage[] {
    // Keep last N tool results in full, summarize older ones
    const KEEP_FULL = 5;
    let toolResultCount = 0;
    
    return messages.map((msg, index) => {
      // Check if this is a tool result
      if (this.isToolResult(msg)) {
        toolResultCount++;
        const fromEnd = messages.length - index;
        
        if (fromEnd > KEEP_FULL * 2) {  // Old tool result
          return this.summarizeMessage(msg);
        }
      }
      return msg;
    });
  }
  
  private summarizeMessage(msg: vscode.LanguageModelChatMessage): vscode.LanguageModelChatMessage {
    // Replace long content with summary
    const content = this.getMessageText(msg);
    if (content.length > 1000) {
      return vscode.LanguageModelChatMessage.User(
        `[Previous tool result summarized: ${content.substring(0, 200)}...]`
      );
    }
    return msg;
  }
}
```

---

## Why Custom Agents (Not Chat Participants)

| Aspect | Chat Participant | Custom Agent |
|--------|------------------|--------------|
| **Invocation** | User types `@participant` in chat | Extension calls programmatically |
| **Session Control** | VS Code manages chat session | We control the entire session |
| **Tool Execution** | MCP server or `vscode.lm.tools` | We implement tools directly |
| **Context Management** | Chat history managed by VS Code | We manage all context |
| **UI Integration** | Appears in chat panel | Can be headless or custom UI |
| **Isolation** | Hard to isolate sessions | Full control over isolation |

**Why Custom Agents for Orchestra:**
- We need to invoke agents programmatically (on Play button click)
- We need complete session isolation between Orchestrator and Implementor
- We need custom tools that integrate with our database
- We don't want to depend on VS Code's chat session management (which is broken for our use case)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           ORCHESTRA EXTENSION                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                        AgentOutputPanel (UI)                             │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │ │
│  │  │ 💭 Thinking... │ 🔧 Tool Call │ ✅ Result │ [⏸ Pause] [⏹ Stop]  │   │ │
│  │  └──────────────────────────────────────────────────────────────────┘   │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │ │
│  │  │ User Input: [________________________________] [Send]             │   │ │
│  │  └──────────────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                        │
│                                      ▼                                        │
│  ┌─────────────────┐          ┌─────────────────┐                            │
│  │   AgentRunner   │          │   AgentRunner   │                            │
│  │  (Orchestrator) │          │  (Implementor)  │                            │
│  └────────┬────────┘          └────────┬────────┘                            │
│           │                            │                                      │
│           ▼                            ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │                         AgentLoop                                     │    │
│  │  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐           │    │
│  │  │ System  │ → │  LLM    │ → │  Tool   │ → │ Result  │ → (repeat) │    │
│  │  │ Prompt  │    │ Request │    │ Execute │    │ Append  │           │    │
│  │  └─────────┘    └─────────┘    └─────────┘    └─────────┘           │    │
│  │        │              │              │              │                │    │
│  │        └──────────────┴──────────────┴──────────────┘                │    │
│  │                              │                                        │    │
│  │                    Check pause/cancel                                 │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                 │                                             │
│           ┌─────────────────────┼─────────────────────┐                      │
│           ▼                     ▼                     ▼                      │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐            │
│  │  ToolRegistry   │   │ AgentStateManager│   │ ContextManager  │            │
│  │                 │   │                 │   │                 │            │
│  │  edit, search,  │   │ Save/Load state │   │ Token tracking  │            │
│  │  new, problems  │   │ Resume sessions │   │ Context compact │            │
│  │  runTests, etc  │   │ Checkpoints     │   │ Memory tiers    │            │
│  └─────────────────┘   └─────────────────┘   └─────────────────┘            │
│           │                     │                     │                      │
│           ▼                     ▼                     ▼                      │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │              vscode.lm.selectChatModels() - Copilot LLM              │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Summary

| Component | Purpose |
|-----------|---------|
| **AgentOutputPanel** | Webview showing real-time agent activity, user controls |
| **AgentRunner** | Main agent loop, handles pause/resume/stop |
| **AgentStateManager** | Persists session state for resume capability |
| **ContextManager** | Manages token budget, compacts old messages |
| **ToolRegistry** | Registers and executes agent tools |

---

## Core Components

### 1. AgentRunner

The entry point for running an agent. Manages the lifecycle of an agent session.

```typescript
// extension/src/agents/AgentRunner.ts

interface AgentRunnerOptions {
  role: 'orchestrator' | 'implementor';
  systemPrompt: string;
  initialMessage: string;
  tools: AgentTool[];
  maxIterations?: number;  // Safety limit
  onProgress?: (update: AgentProgress) => void;
}

class AgentRunner {
  private model: vscode.LanguageModelChat;
  private messages: vscode.LanguageModelChatMessage[] = [];
  private toolRegistry: ToolRegistry;
  
  async run(options: AgentRunnerOptions): Promise<AgentResult> {
    // 1. Select the model
    const [model] = await vscode.lm.selectChatModels({ 
      vendor: 'copilot', 
      family: 'claude-3.5-sonnet' // or configured model
    });
    
    // 2. Initialize messages with system prompt
    this.messages = [
      vscode.LanguageModelChatMessage.User(options.systemPrompt),
      vscode.LanguageModelChatMessage.User(options.initialMessage)
    ];
    
    // 3. Run the agent loop
    return this.agentLoop(options);
  }
  
  private async agentLoop(options: AgentRunnerOptions): Promise<AgentResult> {
    let iterations = 0;
    const maxIterations = options.maxIterations ?? 50;
    
    while (iterations < maxIterations) {
      iterations++;
      
      // Send request to LLM with tools
      const response = await this.model.sendRequest(
        this.messages,
        { tools: this.getToolDefinitions() },
        this.cancellationToken
      );
      
      // Process response stream
      const { textParts, toolCalls } = await this.processResponse(response);
      
      // If no tool calls, agent is done
      if (toolCalls.length === 0) {
        return { 
          success: true, 
          finalResponse: textParts.join(''),
          iterations 
        };
      }
      
      // Execute tool calls and add results to messages
      for (const toolCall of toolCalls) {
        const result = await this.toolRegistry.execute(toolCall);
        
        // Add assistant message with tool call
        this.messages.push(
          vscode.LanguageModelChatMessage.Assistant([toolCall])
        );
        
        // Add user message with tool result
        this.messages.push(
          vscode.LanguageModelChatMessage.User([
            new vscode.LanguageModelToolResultPart(
              toolCall.callId,
              [new vscode.LanguageModelTextPart(JSON.stringify(result))]
            )
          ])
        );
      }
    }
    
    return { success: false, error: 'Max iterations reached', iterations };
  }
}
```

### 2. ToolRegistry

Manages available tools and their execution.

```typescript
// extension/src/agents/ToolRegistry.ts

interface AgentTool {
  name: string;
  description: string;
  inputSchema: object;  // JSON Schema
  execute: (input: unknown) => Promise<ToolResult>;
}

interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

class ToolRegistry {
  private tools: Map<string, AgentTool> = new Map();
  
  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool);
  }
  
  getDefinitions(): vscode.LanguageModelChatTool[] {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
  }
  
  async execute(toolCall: vscode.LanguageModelToolCallPart): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${toolCall.name}` };
    }
    
    try {
      return await tool.execute(toolCall.input);
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
}
```

### 3. Tool Implementations

Each tool from the agent.md file needs an implementation:

#### Required Tools (from agent.md)

| Tool Name | Purpose | VS Code API |
|-----------|---------|-------------|
| `edit` | Replace text in files | `vscode.workspace.applyEdit()` with `WorkspaceEdit` |
| `search` | Search codebase | `vscode.workspace.findFiles()` + text search |
| `new` | Create new files | `WorkspaceEdit.createFile()` |
| `runCommands` | Run VS Code commands | `vscode.commands.executeCommand()` |
| `runTasks` | Run VS Code tasks | `vscode.tasks.executeTask()` |
| `usages` | Find references | `vscode.commands.executeCommand('vscode.executeReferenceProvider')` |
| `problems` | Get diagnostics | `vscode.languages.getDiagnostics()` |
| `changes` | Get git changes | `vscode.extensions.getExtension('vscode.git')` |
| `testFailure` | Get test failures | `vscode.tests` API |
| `fetch` | HTTP requests | Node.js `fetch` or similar |
| `todos` | Manage todo list | Extension state management |
| `runTests` | Run tests | `vscode.tests.runTests()` or terminal |
| `read_file` | Read file contents | `vscode.workspace.openTextDocument()` |
| `list_directory` | List directory | `vscode.workspace.fs.readDirectory()` |
| `grep_search` | Regex search in files | Custom implementation |

#### Orchestra-Specific Tools

| Tool Name | Purpose | Implementation |
|-----------|---------|----------------|
| `orchestra-imp/get_current_task` | Get task handover | Query local SQLite database |
| `orchestra-imp/signal_completion` | Signal task done | Write to database, trigger verification |
| `orchestra-imp/get_feedback` | Get failure feedback | Query database |
| `orchestra-imp/get_progress` | Get sprint progress | Query database |
| `orchestra-imp/escalate_task` | Escalate task | Write to database |
| `orchestra-orc/get_sprint_status` | Get sprint status | Query database |
| `orchestra-orc/prepare_task` | Prepare handover | Write to database |
| `orchestra-orc/run_verification_checks` | Run checks | Execute verification logic |
| `orchestra-orc/submit_verification_judgment` | Submit judgment | Write to database |

---

## Tool Implementation Details

### edit Tool

```typescript
// extension/src/agents/tools/edit.ts

export const editTool: AgentTool = {
  name: 'edit',
  description: 'Replace text in a file. Use oldString to match exact text and newString to replace it.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { 
        type: 'string', 
        description: 'Absolute path to the file to edit' 
      },
      oldString: { 
        type: 'string', 
        description: 'Exact text to find and replace (include context lines)' 
      },
      newString: { 
        type: 'string', 
        description: 'Text to replace oldString with' 
      }
    },
    required: ['filePath', 'oldString', 'newString']
  },
  
  async execute(input: { filePath: string; oldString: string; newString: string }): Promise<ToolResult> {
    try {
      const uri = vscode.Uri.file(input.filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      const text = document.getText();
      
      // Find the oldString in the document
      const index = text.indexOf(input.oldString);
      if (index === -1) {
        return { 
          success: false, 
          error: `Could not find the specified text in ${input.filePath}` 
        };
      }
      
      // Check for multiple matches
      const secondIndex = text.indexOf(input.oldString, index + 1);
      if (secondIndex !== -1) {
        return {
          success: false,
          error: `Found multiple matches for oldString. Add more context to make it unique.`
        };
      }
      
      // Create and apply the edit
      const startPos = document.positionAt(index);
      const endPos = document.positionAt(index + input.oldString.length);
      const range = new vscode.Range(startPos, endPos);
      
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, range, input.newString);
      
      const success = await vscode.workspace.applyEdit(edit);
      
      if (success) {
        await document.save();
        return { success: true, output: `Successfully edited ${input.filePath}` };
      } else {
        return { success: false, error: 'Failed to apply edit' };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
};
```

### read_file Tool

```typescript
// extension/src/agents/tools/read_file.ts

export const readFileTool: AgentTool = {
  name: 'read_file',
  description: 'Read the contents of a file. Specify line range if you only need part of the file.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Absolute path to the file' },
      startLine: { type: 'number', description: 'Start line (1-indexed)' },
      endLine: { type: 'number', description: 'End line (1-indexed, inclusive)' }
    },
    required: ['filePath']
  },
  
  async execute(input: { filePath: string; startLine?: number; endLine?: number }): Promise<ToolResult> {
    try {
      const uri = vscode.Uri.file(input.filePath);
      const document = await vscode.workspace.openTextDocument(uri);
      
      let content: string;
      if (input.startLine !== undefined && input.endLine !== undefined) {
        const lines = document.getText().split('\n');
        const start = Math.max(0, input.startLine - 1);
        const end = Math.min(lines.length, input.endLine);
        content = lines.slice(start, end).join('\n');
      } else {
        content = document.getText();
      }
      
      return { 
        success: true, 
        output: content 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
};
```

### new (create_file) Tool

```typescript
// extension/src/agents/tools/new_file.ts

export const newFileTool: AgentTool = {
  name: 'new',
  description: 'Create a new file with the specified content. Creates parent directories if needed.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Absolute path for the new file' },
      content: { type: 'string', description: 'Content to write to the file' }
    },
    required: ['filePath', 'content']
  },
  
  async execute(input: { filePath: string; content: string }): Promise<ToolResult> {
    try {
      const uri = vscode.Uri.file(input.filePath);
      
      // Check if file already exists
      try {
        await vscode.workspace.fs.stat(uri);
        return { 
          success: false, 
          error: `File already exists: ${input.filePath}. Use edit to modify existing files.` 
        };
      } catch {
        // File doesn't exist, good to create
      }
      
      // Create parent directories and file
      const edit = new vscode.WorkspaceEdit();
      edit.createFile(uri, { 
        overwrite: false, 
        contents: Buffer.from(input.content) 
      });
      
      const success = await vscode.workspace.applyEdit(edit);
      
      if (success) {
        return { success: true, output: `Created ${input.filePath}` };
      } else {
        return { success: false, error: 'Failed to create file' };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
};
```

### problems Tool

```typescript
// extension/src/agents/tools/problems.ts

export const problemsTool: AgentTool = {
  name: 'problems',
  description: 'Get compile errors, lint errors, and other diagnostics for files.',
  inputSchema: {
    type: 'object',
    properties: {
      filePaths: { 
        type: 'array', 
        items: { type: 'string' },
        description: 'File paths to check. Omit to get all problems.' 
      }
    }
  },
  
  async execute(input: { filePaths?: string[] }): Promise<ToolResult> {
    try {
      let diagnostics: [vscode.Uri, readonly vscode.Diagnostic[]][];
      
      if (input.filePaths && input.filePaths.length > 0) {
        diagnostics = input.filePaths.map(p => {
          const uri = vscode.Uri.file(p);
          return [uri, vscode.languages.getDiagnostics(uri)] as const;
        });
      } else {
        diagnostics = vscode.languages.getDiagnostics();
      }
      
      const problems = diagnostics
        .filter(([_, diags]) => diags.length > 0)
        .map(([uri, diags]) => ({
          file: uri.fsPath,
          problems: diags.map(d => ({
            line: d.range.start.line + 1,
            severity: vscode.DiagnosticSeverity[d.severity],
            message: d.message,
            source: d.source
          }))
        }));
      
      if (problems.length === 0) {
        return { success: true, output: 'No problems found.' };
      }
      
      return { 
        success: true, 
        output: JSON.stringify(problems, null, 2) 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
};
```

### runTests Tool

```typescript
// extension/src/agents/tools/runTests.ts

export const runTestsTool: AgentTool = {
  name: 'runTests',
  description: 'Run tests in the workspace. Returns test results.',
  inputSchema: {
    type: 'object',
    properties: {
      testPath: { 
        type: 'string', 
        description: 'Specific test file or pattern. Omit to run all tests.' 
      },
      command: {
        type: 'string',
        description: 'Custom test command (e.g., "npm test")'
      }
    }
  },
  
  async execute(input: { testPath?: string; command?: string }): Promise<ToolResult> {
    try {
      // For now, use terminal-based test execution
      const command = input.command ?? 'npm test';
      
      const terminal = vscode.window.createTerminal({
        name: 'Orchestra Tests',
        hideFromUser: false
      });
      
      terminal.sendText(command);
      
      // Wait for completion and capture output
      // This is simplified - real implementation would capture output
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      return { 
        success: true, 
        output: `Executed: ${command}\nCheck terminal for results.` 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
};
```

### search Tool

```typescript
// extension/src/agents/tools/search.ts

export const searchTool: AgentTool = {
  name: 'search',
  description: 'Search for files or text in the workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Text or pattern to search for' },
      isRegex: { type: 'boolean', description: 'Whether query is a regex' },
      includePattern: { type: 'string', description: 'Glob pattern for files to include' },
      maxResults: { type: 'number', description: 'Maximum results to return' }
    },
    required: ['query']
  },
  
  async execute(input: { 
    query: string; 
    isRegex?: boolean; 
    includePattern?: string;
    maxResults?: number;
  }): Promise<ToolResult> {
    try {
      const results: Array<{file: string; line: number; text: string}> = [];
      const maxResults = input.maxResults ?? 50;
      
      // Find files matching pattern
      const files = await vscode.workspace.findFiles(
        input.includePattern ?? '**/*',
        '**/node_modules/**'
      );
      
      const pattern = input.isRegex 
        ? new RegExp(input.query, 'gi')
        : new RegExp(input.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      
      for (const file of files) {
        if (results.length >= maxResults) break;
        
        try {
          const document = await vscode.workspace.openTextDocument(file);
          const text = document.getText();
          const lines = text.split('\n');
          
          for (let i = 0; i < lines.length; i++) {
            if (results.length >= maxResults) break;
            if (pattern.test(lines[i])) {
              results.push({
                file: file.fsPath,
                line: i + 1,
                text: lines[i].trim().substring(0, 200)
              });
            }
            pattern.lastIndex = 0; // Reset regex
          }
        } catch {
          // Skip files that can't be read
        }
      }
      
      return { 
        success: true, 
        output: JSON.stringify(results, null, 2) 
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
};
```

---

## System Prompts

### Orchestrator System Prompt

Loaded from `extension/agents/orchestra.orchestrator.agent.md`:
- Full access to verification criteria
- Can prepare tasks, run verification, submit judgments
- Tools: `orchestra-orc/*` + coding tools

### Implementor System Prompt

Loaded from `extension/agents/orchestra.implementor.agent.md`:
- NO access to verification criteria
- Gets handover, implements, signals completion
- Tools: `orchestra-imp/*` + coding tools

---

## Invocation Flow

### When User Clicks Play on IMPLEMENT Task

```typescript
// extension/src/commands/PlayTaskHandler.ts

async function invokeImplement(workspaceRoot: string, taskId: number): Promise<void> {
  // 1. Load the implementor agent prompt
  const systemPrompt = await loadAgentPrompt('implementor');
  
  // 2. Build the initial message with task context
  const task = getTaskById(workspaceRoot, taskId);
  const initialMessage = `
    You are assigned Task ${task.task_id}: "${task.title}".
    
    Use your MCP tools to implement this task:
    1. get_current_task - Get your handover with acceptance criteria
    2. Implement the task following all criteria
    3. signal_completion - Signal when done
  `;
  
  // 3. Create the agent runner
  const runner = new AgentRunner({
    role: 'implementor',
    systemPrompt,
    initialMessage,
    tools: getImplementorTools(workspaceRoot),
    maxIterations: 100,
    onProgress: (update) => {
      // Update UI with agent progress
      updateAgentProgress(update);
    }
  });
  
  // 4. Show agent panel and run
  await showAgentPanel();
  const result = await runner.run();
  
  // 5. Handle result
  if (result.success) {
    // Agent completed - may have signaled completion
    vscode.window.showInformationMessage('Agent completed task execution');
  } else {
    vscode.window.showErrorMessage(`Agent failed: ${result.error}`);
  }
}
```

---

## UI Considerations

### Agent Output Panel

We need a way to show agent progress:

```typescript
// Option 1: Output Channel
const outputChannel = vscode.window.createOutputChannel('Orchestra Agent', { log: true });
outputChannel.appendLine('Agent thinking...');
outputChannel.appendLine('Tool call: read_file { path: "..." }');
outputChannel.appendLine('Tool result: [file contents]');

// Option 2: Webview Panel (richer UI)
const panel = vscode.window.createWebviewPanel(
  'orchestraAgent',
  'Orchestra Agent',
  vscode.ViewColumn.Beside,
  { enableScripts: true }
);
panel.webview.html = renderAgentUI(agentState);

// Option 3: Terminal (simple)
const terminal = vscode.window.createTerminal('Orchestra Agent');
terminal.sendText('# Agent output here');
```

**Recommendation**: Start with Output Channel for simplicity, upgrade to Webview later.

---

## File Structure

```
extension/src/
├── agents/
│   ├── AgentRunner.ts           # Main agent loop with interrupt handling
│   ├── ToolRegistry.ts          # Tool management and registration
│   ├── AgentProgress.ts         # Progress reporting and status
│   ├── AgentStateManager.ts     # Session state persistence
│   ├── ContextManager.ts        # Token budget and context compaction
│   ├── FileChangeTracker.ts     # Track all file modifications (NEW)
│   ├── SprintMemoryManager.ts   # Cross-session orchestrator memory (NEW)
│   ├── types.ts                 # Agent types and interfaces
│   └── tools/                   # Tool implementations
│       ├── index.ts             # Tool registry setup
│       ├── edit.ts              # File editing (with change tracking)
│       ├── read_file.ts         # Read file
│       ├── new_file.ts          # Create file (with change tracking)
│       ├── delete_file.ts       # Delete file (with change tracking) (NEW)
│       ├── search.ts            # Search codebase
│       ├── grep_search.ts       # Regex search
│       ├── problems.ts          # Get diagnostics
│       ├── run_tests.ts         # Run tests
│       ├── run_commands.ts      # VS Code commands
│       ├── run_tasks.ts         # VS Code tasks
│       ├── usages.ts            # Find references
│       ├── changes.ts           # Git changes
│       ├── test_failure.ts      # Test failure info
│       ├── fetch.ts             # HTTP fetch
│       ├── todos.ts             # Todo management
│       ├── list_directory.ts    # List files
│       └── orchestra/           # Orchestra-specific tools
│           ├── get_current_task.ts
│           ├── signal_completion.ts
│           ├── get_feedback.ts
│           ├── get_progress.ts
│           ├── escalate_task.ts
│           ├── get_sprint_status.ts
│           ├── prepare_task.ts
│           ├── run_verification.ts
│           └── submit_judgment.ts
├── ui/
│   ├── AgentOutputPanel.ts      # Webview panel for real-time output
│   ├── AgentOutputChannel.ts    # OutputChannel integration
│   ├── ChangedFilesPanel.ts     # Panel showing modified files (NEW)
│   ├── DiffViewer.ts            # Show file diffs (NEW)
│   ├── webview/                 # Webview resources
│   │   ├── agentPanel.html      # Panel HTML template
│   │   ├── agentPanel.css       # Panel styles (dark/light)
│   │   ├── agentPanel.js        # Panel scripts (auto-scroll, copy)
│   │   ├── changedFiles.html    # Changed files panel (NEW)
│   │   └── changedFiles.js      # Changed files scripts (NEW)
│   └── components/              # UI component utilities
│       ├── ThinkingIndicator.ts # Animated thinking display
│       ├── ToolResultCard.ts    # Collapsible tool output cards
│       └── FileChangeCard.ts    # File change display card (NEW)
├── session/
│   ├── SessionPersistence.ts    # Disk read/write for sessions
│   └── SessionRecovery.ts       # Crash recovery and resume
├── memory/                      # Cross-session memory (NEW)
│   ├── SprintMemory.ts          # Sprint-level context store
│   └── TaskSummary.ts           # Task completion summaries
└── commands/
    └── PlayTaskHandler.ts       # Updated to use AgentRunner

extension/resources/
├── agent-panel/                 # Panel webview assets
│   ├── panel.html
│   ├── panel.css
│   └── panel.js
└── icons/
    ├── agent-thinking.svg
    ├── agent-paused.svg
    ├── agent-complete.svg
    ├── file-added.svg           # (NEW)
    ├── file-modified.svg        # (NEW)
    └── file-deleted.svg         # (NEW)

.orchestra/
├── agent-sessions/              # Persisted session state (gitignored)
│   ├── session-{uuid}.json      # Full session state
│   └── session-{uuid}.log       # Detailed execution log
└── sprint-memory/               # Cross-session orchestrator memory (NEW)
    └── sprint-{id}.json         # Sprint-level context and task summaries
```

---

## Implementation Phases

### Phase 1: Core Agent Infrastructure (Week 1)
1. Implement `AgentRunner` with basic loop and interrupt handling
2. Implement `ToolRegistry` with tool registration
3. Implement `AgentStateManager` for state persistence
4. Implement `FileChangeTracker` for modification tracking
5. Basic `AgentOutputPanel` webview (text output only)
6. Test with simple tools (read_file, problems)

### Phase 2: Output Panel & Verbosity (Week 1-2)
1. Full webview implementation with sections (thinking, tool calls, responses)
2. Changed Files panel with diff view and undo capability
3. Auto-scroll behavior and copy functionality
4. Collapsible tool result cards
5. Output channel integration for logs
6. Dark/light theme support

### Phase 3: Interruptability & Controls (Week 2)
1. Pause/Resume functionality with AbortController
2. Stop with confirmation dialog
3. Redirect capability (user injects new instructions)
4. State serialization at pause points
5. Status bar integration with controls

### Phase 4: Context & Memory (Week 2-3)
1. Implement `ContextManager` with token tracking
2. Session persistence to disk
3. Session recovery on extension restart
4. Context compaction (long output summarization)
5. File change tracking for context invalidation

### Phase 5: Sprint Memory (Week 3) - NEW
1. Implement `SprintMemoryManager` for cross-session orchestrator context
2. Task summary generation after completion
3. Sprint context injection on orchestrator startup
4. Memory compaction for long sprints
5. Pattern learning (what worked, what didn't)

### Phase 6: Coding Tools (Week 3-4)
1. Implement all coding tools (edit, new, search, etc.)
2. All edit tools integrated with FileChangeTracker
3. Thorough testing of each tool
4. Error handling and edge cases
5. Tool consent preferences

### Phase 7: Orchestra Integration (Week 4)
1. Implement Orchestra-specific tools
2. Integrate with MCP database
3. Connect to Play button handlers
4. Implementor and Orchestrator agent modes
5. Orchestrator uses SprintMemory for context

### Phase 8: Polish & Testing (Week 4-5)
1. End-to-end testing with real tasks
2. Performance optimization
3. Error recovery scenarios
4. Sprint memory effectiveness testing
5. Documentation and examples

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM rate limits | Agent stops mid-task | Implement backoff, track token usage, pause gracefully |
| Tool execution errors | Agent gets stuck | Robust error handling, retry logic, user notification |
| Infinite loops | Resource exhaustion | Max iterations limit, watchdog, user-visible counter |
| Context window overflow | Lost context | Summarization, sliding window, ContextManager |
| User consent dialogs | Blocks automation | Request consent at activation, remember preferences |
| Extension crash during run | Lost progress | Session persistence, auto-recovery on restart |
| Pause/resume state mismatch | Corrupted continuation | Validate state before resume, offer fresh start |
| Webview memory leak | UI slowdown | Limit retained history, virtualize long lists |
| Session file corruption | Cannot resume | Validate JSON, backup before write, fallback to new |
| Sprint memory bloat | Slow startup | Aggressive compaction, summarize old tasks |
| Stale sprint context | Bad decisions | Track file changes, invalidate affected context |
| Undo complexity | Partial undo fails | Full atomic undo, or warn user |
| Redirect mid-tool | Inconsistent state | Complete current tool before processing redirect |

---

## Open Questions

### Resolved in This Document
1. ~~**Token counting**: How do we track token usage to avoid context overflow?~~
   - **Answer**: `ContextManager` tracks via `tokenEstimate()` and compacts when > 80% budget
2. ~~**Streaming**: Should we stream agent output in real-time or batch?~~
   - **Answer**: Real-time streaming to `AgentOutputPanel` webview
3. ~~**Cancellation**: How does user cancel a running agent?~~
   - **Answer**: Stop button with AbortController, completes current tool first
4. ~~**State persistence**: Should agent state survive VS Code restart?~~
   - **Answer**: Yes, via `AgentStateManager` persisting to `.orchestra/agent-sessions/`
5. ~~**File change visibility**: How does user see what agent modified?~~
   - **Answer**: Changed Files panel with diff view and undo capability
6. ~~**Cross-session orchestrator context**: How does orchestrator remember previous tasks?~~
   - **Answer**: Sprint memory store with task summaries and pattern learning
7. ~~**Multiple agents**: Can orchestrator and implementor run simultaneously?~~
   - **Answer**: No concurrent execution, but different session lifetimes:
     - **Orchestrator**: Long-lived session spanning entire sprint (persists across tasks)
     - **Implementor**: Ephemeral session for single task (fresh start each task)
     - User can "switch" between them, pausing one to run the other
     - Orchestrator context preserved while implementor works
     - Only one agent active/executing at any time
8. ~~**Model selection**: Should user be able to choose which Copilot model?~~
   - **Answer**: Yes, fully configurable per-agent:
     - User selects model for Orchestrator agent (persisted)
     - User selects model for Implementor agent (persisted)
     - Can be changed at any time via settings/command
     - Settings stored in VS Code workspace settings or `.orchestra/config.json`
     - UI: Quick pick from available models on first run, settings panel thereafter
9. ~~**Tool consent granularity**: Per-tool or per-category consent?~~
   - **Answer**: All or nothing - no granular consent needed
     - Agents use a specific, curated set of tools
     - User implicitly consents by invoking the agent
     - No per-tool or per-category approval prompts
     - Simplest UX, no interruptions during execution
10. ~~**Session cleanup**: When to delete old session files?~~
    - **Answer**: Role-appropriate cleanup aligned with session lifetimes:
      - **Orchestrator**: Keep as long as practically possible (survives sprint closeout)
        - Only delete manually or when storage becomes an issue
        - Valuable for debugging, auditing, and learning
      - **Implementor**: Delete only when task reaches COMPLETED status
        - Keep during retries (task can fail and return to implementor)
        - Implementor needs context for retry attempts
        - Clean up after final completion (pass or escalation)
11. ~~**Error escalation**: When agent fails repeatedly, auto-escalate task?~~
    - **Answer**: Hybrid approach - warn then auto-escalate:
      - At retry N-1: Inject message "This is your last attempt before auto-escalation"
      - At retry N: Auto-escalate if still failing (agent didn't fix or self-escalate)
      - Gives agent a fair chance while ensuring bounded execution
      - Integrates with Orchestra's existing escalation workflow
12. ~~**Sprint memory sharing**: Should sprint memory be committed to git?~~
    - **Answer**: Yes, committed to git (NOT gitignored):
      - `.orchestra/sprint-memory/` is tracked in git
      - Ensures memory is synced across instances/machines
      - Team benefits from shared context and learnings
      - All file paths in sprint memory use **relative paths** (workspace-relative)
      - Portable: works when repo is cloned to different folder/machine
13. ~~**Undo granularity**: Undo per-file, per-tool-call, or per-iteration?~~
    - **Answer**: Per-file granularity:
      - Each file in Changed Files panel has its own Undo button
      - Simple, intuitive mental model: "undo changes to this file"
      - Also provide "Undo All" for convenience
      - User sees file list, clicks undo on specific files they want to revert
14. ~~**File change tracking scope**: Track only agent changes or all changes?~~
    - **Answer**: Agent changes only:
      - Only track changes made by agent's edit/create/delete tools
      - User's manual edits during pause are their responsibility
      - Clear boundary: Changed Files panel = agent's work
      - User has normal VS Code undo for their own edits
      - Simpler implementation, no filesystem watchers needed

### All Questions Resolved ✅

All open questions have been answered. The architecture is ready for implementation.

---

## Next Steps

### Immediate (Week 1)
1. [ ] Review and approve this architecture
2. [ ] Create `extension/src/agents/` directory structure
3. [ ] Implement `AgentRunner` prototype with interrupt handling
4. [ ] Implement `AgentStateManager` for persistence
5. [ ] Implement `FileChangeTracker` for modification tracking
6. [ ] Basic `AgentOutputPanel` webview (text only)
7. [ ] Implement core tools (read_file, edit, problems)

### Short-term (Week 2)
8. [ ] Full webview implementation with sections
9. [ ] Changed Files panel with diff and undo
10. [ ] Pause/Resume/Stop controls
11. [ ] Status bar integration
12. [ ] Session persistence and recovery

### Medium-term (Week 3-4)
13. [ ] Complete all coding tools
14. [ ] SprintMemoryManager for orchestrator context
15. [ ] Orchestra-specific tools
16. [ ] Integration with Play button handlers
17. [ ] End-to-end testing with real tasks

### Validation Criteria
- [ ] Agent can pause, persist state, and resume after VS Code restart
- [ ] User can see thinking, tool calls, and results in real-time
- [ ] User can stop agent and inject new instructions
- [ ] Context is maintained across long multi-step tasks
- [ ] User can see all files modified by agent and undo changes
- [ ] Orchestrator has context from previous tasks in same sprint
- [ ] Agent successfully completes an Orchestra implementor task end-to-end
- [ ] Orchestrator successfully verifies task using sprint context

---

## References

- [VS Code Language Model API](https://code.visualstudio.com/api/extension-guides/language-model)
- [VS Code Chat Participant API](https://code.visualstudio.com/api/extension-guides/chat) - Feature reference
- [ChatResponseStream API](https://code.visualstudio.com/api/references/vscode-api#ChatResponseStream) - Output types
- [Implementation Plan](implementation-plan.md) - Phase 3 section
- [Orchestrator Agent](../extension/agents/orchestra.orchestrator.agent.md)
- [Implementor Agent](../extension/agents/orchestra.implementor.agent.md)
