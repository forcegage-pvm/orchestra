# VS Code Chat API Deep Dive

**Created**: 2025-12-12  
**Purpose**: Comprehensive research into VS Code's Chat API capabilities for Orchestra integration  
**Status**: Research Complete - Ready for Feature Planning

---

## Executive Summary

VS Code's Chat API provides extensive programmatic control over chat sessions, including:
- Creating and managing chat sessions
- Controlling mode (agent/edit) and model selection
- Attaching files and context
- Auto-sending prompts
- Session tracking via URIs (with proposed APIs)

This enables Orchestra to build a **task-aware chat orchestration system** that creates focused, context-rich agent sessions.

---

## Table of Contents

1. [Chat Commands](#1-chat-commands)
2. [IChatViewOpenOptions Interface](#2-ichatviewopenoptions-interface)
3. [Session Management](#3-session-management)
4. [Slash Commands](#4-slash-commands)
5. [Proposed APIs](#5-proposed-apis)
6. [Chat Participant API](#6-chat-participant-api)
7. [Language Model API](#7-language-model-api)
8. [Architecture Diagram](#8-architecture-diagram)
9. [Implementation Patterns](#9-implementation-patterns)
10. [Recommendations for Orchestra](#10-recommendations-for-orchestra)

---

## 1. Chat Commands

### Core Commands

| Command | Description | Creates New Session? |
|---------|-------------|---------------------|
| `workbench.action.chat.open` | Opens chat, uses last focused or creates new | Only if none exists |
| `workbench.action.chat.newChat` | **Forces new session** in the panel | ✅ Yes |
| `workbench.action.chat.newEditSession` | Creates new edit mode session | ✅ Yes |
| `workbench.action.chat.newChatEditor` | Opens chat as an editor tab | ✅ Yes |
| `workbench.action.chat.newChatWindow` | Opens chat in a **new window** | ✅ Yes |

### Session Behavior

From VS Code source (`chatActions.ts`):

```typescript
let chatWidget = widgetService.lastFocusedWidget;

// When invoked to switch mode via keybinding and some chat widget is focused, use that one.
// Otherwise, open the view.
if (!this.mode || !chatWidget || !isAncestorOfActiveElement(chatWidget.domNode)) {
  chatWidget = await widgetService.revealWidget();  // Opens/creates the chat panel
}
```

**Key Insight**: If no chat widget is focused, `chat.open` will reveal/create the chat view panel.

---

## 2. IChatViewOpenOptions Interface

The full interface for `workbench.action.chat.open`:

```typescript
interface IChatViewOpenOptions {
  // ═══════════════════════════════════════════
  // QUERY & PROMPT CONTROL
  // ═══════════════════════════════════════════
  
  /**
   * The query/prompt text to send to the chat
   */
  query: string;
  
  /**
   * If true: fills input box but does NOT send (waits for user)
   * If false: auto-sends immediately
   * Default: false (auto-send)
   */
  isPartialQuery?: boolean;

  // ═══════════════════════════════════════════
  // MODE CONTROL
  // ═══════════════════════════════════════════
  
  /**
   * The mode to open the chat in
   * Values: 'agent' | 'edit' | custom mode ID
   */
  mode?: ChatModeKind | string;

  // ═══════════════════════════════════════════
  // MODEL SELECTION
  // ═══════════════════════════════════════════
  
  /**
   * Selector for which language model to use
   * Error thrown if no match; first match used if multiple
   */
  modelSelector?: {
    id?: string;      // e.g., 'claude-sonnet-4'
    vendor?: string;  // e.g., 'copilot'
    family?: string;  // e.g., 'gpt-4o'
  };

  // ═══════════════════════════════════════════
  // CONTEXT ATTACHMENT
  // ═══════════════════════════════════════════
  
  /**
   * Files to attach as context
   * Can include optional range for specific code sections
   */
  attachFiles?: (URI | { uri: URI; range: IRange })[];
  
  /**
   * Capture and attach a screenshot of the focused window
   */
  attachScreenshot?: boolean;
  
  /**
   * Tool IDs to pre-attach (tools with canBeReferencedInPrompt)
   */
  toolIds?: string[];
  
  /**
   * SCM history item changes to attach
   */
  attachHistoryItemChanges?: { uri: URI; historyItemId: string }[];
  
  /**
   * SCM history item change ranges to attach
   */
  attachHistoryItemChangeRanges?: {
    start: { uri: URI; historyItemId: string };
    end: { uri: URI; historyItemId: string };
  }[];

  // ═══════════════════════════════════════════
  // HISTORY PRE-POPULATION
  // ═══════════════════════════════════════════
  
  /**
   * Previous chat exchanges to pre-populate
   * Useful for continuing conversations
   */
  previousRequests?: Array<{
    request: string;
    response: string;
  }>;

  // ═══════════════════════════════════════════
  // RESPONSE HANDLING
  // ═══════════════════════════════════════════
  
  /**
   * Wait for the command to resolve until the response reaches
   * a terminal state (complete, error, or pending user confirmation)
   */
  blockOnResponse?: boolean;
}
```

### Usage Examples

#### Basic: Open and Auto-Send

```typescript
await vscode.commands.executeCommand('workbench.action.chat.open', {
  query: 'Explain this code',
  isPartialQuery: false,  // Auto-send
});
```

#### Advanced: Full Control

```typescript
await vscode.commands.executeCommand('workbench.action.chat.open', {
  query: `Implement Task ${task.id}: ${task.title}`,
  mode: 'agent',
  isPartialQuery: false,
  attachFiles: [
    vscode.Uri.file('/path/to/handover.md'),
    { uri: vscode.Uri.file('/path/to/spec.ts'), range: { startLine: 10, endLine: 50 } }
  ],
  modelSelector: { id: 'claude-sonnet-4', vendor: 'copilot' },
  blockOnResponse: true,  // Wait for completion
});
```

#### Force Fresh Session

```typescript
// Step 1: Create fresh session
await vscode.commands.executeCommand('workbench.action.chat.newChat');

// Step 2: Open with context (now guaranteed fresh)
await vscode.commands.executeCommand('workbench.action.chat.open', {
  query: 'Start implementing feature X',
  mode: 'agent',
  attachFiles: [handoverUri],
});
```

---

## 3. Session Management

### Session Identifier

Every chat session is identified by a **URI** (`sessionResource`):

```typescript
interface IChatAgentRequest {
  sessionResource: URI;    // ← THE UNIQUE SESSION IDENTIFIER
  requestId: string;
  agentId: string;
  message: string;
  // ...
}
```

### Internal Session Services

| Service | Purpose | Extension Access |
|---------|---------|-----------------|
| `IChatService` | Session lifecycle management | ❌ Internal |
| `IChatWidgetService` | Widget/UI management | ❌ Internal |
| `IChatSessionsService` | Session persistence | ⚠️ Proposed API |

### Key Internal Methods

```typescript
// From IChatWidgetService
getWidgetBySessionResource(sessionResource: URI): IChatWidget | undefined;
openSession(sessionResource: URI, target?, options?): Promise<IChatWidget | undefined>;
revealWidget(preserveFocus?: boolean): Promise<IChatWidget | undefined>;

// From IChatService
startSession(location: ChatAgentLocation, options?): IChatModelReference;
getSession(sessionResource: URI): IChatModel | undefined;
sendRequest(sessionResource: URI, message: string, options?): Promise<IChatSendRequestData | undefined>;
```

### What Extensions CAN Access

Via the `ChatContext` passed to participant handlers:

```typescript
interface ChatContext {
  // All chat messages so far in the current session
  readonly history: ReadonlyArray<ChatRequestTurn | ChatResponseTurn>;
}
```

Via proposed `chatParticipantPrivate` API:

```typescript
interface ChatRequest {
  readonly id: string;           // Request ID
  readonly sessionId: string;    // Session ID! ← KEY FOR TRACKING
  readonly attempt: number;      // Retry attempt number
}
```

---

## 4. Slash Commands

### Built-in Slash Commands

| Command | Behavior | Programmatic Equivalent |
|---------|----------|------------------------|
| `/clear` | Clears session | `workbench.action.chat.newChat` |
| `/help` | Shows help | None (internal) |

### Invoking via Prompt

```typescript
await vscode.commands.executeCommand('workbench.action.chat.open', {
  query: '/help',
  isPartialQuery: false,
});
```

### Other Useful Commands

```typescript
// Clear input history
await vscode.commands.executeCommand('workbench.action.chat.clearInputHistory');

// Toggle chat mode
await vscode.commands.executeCommand('workbench.action.chat.toggleAgentMode');

// Open model picker
await vscode.commands.executeCommand('workbench.action.chat.openModelPicker');

// Open mode/agent picker
await vscode.commands.executeCommand('workbench.action.chat.openModePicker');
```

---

## 5. Proposed APIs

### Available Proposed APIs for Chat

| API | Version | Purpose |
|-----|---------|---------|
| `chatParticipantPrivate` | 11 | Session IDs, location data, error details |
| `chatParticipantAdditions` | 7+ | Extended response stream, tool invocation |
| `chatSessionsProvider` | 3 | Full session management & persistence |
| `defaultChatParticipant` | 4 | Welcome messages, titles, summaries |
| `chatProvider` | 4 | Custom language model providers |

### chatParticipantPrivate (v11)

Exposes session tracking and location data:

```typescript
interface ChatRequest {
  // Session tracking
  readonly id: string;                    // Request ID
  readonly sessionId: string;             // Session ID for tracking
  readonly attempt: number;               // Retry attempt number
  
  // Location context
  readonly location: ChatLocation;        // Panel, Terminal, Editor, Notebook
  readonly location2: ChatRequestEditorData | ChatRequestNotebookData | undefined;
  
  // Detection
  readonly enableCommandDetection: boolean;
  readonly isParticipantDetected: boolean;
  
  // Editing context
  readonly editedFileEvents?: ChatRequestEditedFileEvent[];
  readonly isSubagent?: boolean;
}

enum ChatLocation {
  Panel = 1,
  Terminal = 2,
  Notebook = 3,
  Editor = 4,
}
```

### chatSessionsProvider (v3)

Full session management capabilities:

```typescript
// Register providers
chat.registerChatSessionItemProvider(chatSessionType: string, provider: ChatSessionItemProvider): Disposable;
chat.registerChatSessionContentProvider(scheme: string, provider: ChatSessionContentProvider, participant: ChatParticipant): Disposable;

interface ChatSessionItem {
  resource: Uri;                          // Session URI - unique identifier
  label: string;                          // Display name
  status?: ChatSessionStatus;             // Failed, Completed, InProgress
  description?: string | MarkdownString;
  tooltip?: string | MarkdownString;
  iconPath?: IconPath;
  timing?: {
    startTime: number;
    endTime?: number;
  };
  changes?: {
    files: number;
    insertions: number;
    deletions: number;
  };
}

interface ChatSession {
  readonly history: ReadonlyArray<ChatRequestTurn | ChatResponseTurn2>;
  readonly options?: Record<string, string | ChatSessionProviderOptionItem>;
  readonly activeResponseCallback?: (stream: ChatResponseStream, token: CancellationToken) => Thenable<void>;
  readonly requestHandler: ChatRequestHandler | undefined;
}

interface ChatSessionContext {
  readonly chatSessionItem: ChatSessionItem;
  readonly isUntitled: boolean;
}
```

### chatParticipantAdditions (v7+)

Extended response capabilities:

```typescript
interface ChatResponseStream {
  // Enhanced references with status
  reference2(value: Uri | Location | string | { variableName: string; value?: Uri | Location },
             iconPath?: Uri | ThemeIcon,
             options?: { status?: { description: string; kind: ChatResponseReferencePartStatusKind } }): void;
  
  // Code citation
  codeCitation(value: Uri, license: string, snippet: string): void;
  
  // Tool invocation
  prepareToolInvocation(toolName: string): void;
  clearToPreviousToolInvocation(reason: ChatResponseClearToPreviousToolInvocationReason): void;
}

interface ChatResult {
  // Auto-follow-up question!
  nextQuestion?: {
    prompt: string;
    participant?: string;
    command?: string;
  };
  
  // Detail string for UI
  details?: string;
}

// Confirmation dialogs
class ChatResponseConfirmationPart {
  constructor(title: string, message: string, data: any, buttons?: string[]);
}
```

### Enabling Proposed APIs

In `package.json`:

```json
{
  "enabledApiProposals": [
    "chatParticipantPrivate",
    "chatSessionsProvider",
    "chatParticipantAdditions"
  ]
}
```

**Note**: Proposed APIs require VS Code Insiders and may change between versions.

---

## 6. Chat Participant API

### Registration

```typescript
// In package.json
{
  "contributes": {
    "chatParticipants": [
      {
        "id": "orchestra",
        "name": "orchestra",
        "fullName": "Orchestra Agent",
        "description": "AI agent task orchestration",
        "isSticky": false,
        "commands": [
          { "name": "status", "description": "Show sprint status" },
          { "name": "start", "description": "Start a task" }
        ]
      }
    ]
  }
}

// In extension code
const participant = vscode.chat.createChatParticipant('orchestra', handler);
participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icon.svg');
```

### Request Handler

```typescript
type ChatRequestHandler = (
  request: ChatRequest,
  context: ChatContext,
  stream: ChatResponseStream,
  token: CancellationToken
) => ProviderResult<ChatResult | void>;

// Available in request
interface ChatRequest {
  readonly prompt: string;                    // User's message
  readonly command: string | undefined;       // Slash command (e.g., 'status')
  readonly references: readonly ChatPromptReference[];
  readonly toolReferences: readonly ChatLanguageModelToolReference[];
  readonly toolInvocationToken: ChatParticipantToolToken;
  readonly model: LanguageModelChat;          // The model being used
}

// Available in context
interface ChatContext {
  readonly history: ReadonlyArray<ChatRequestTurn | ChatResponseTurn>;
}
```

### Response Stream

```typescript
interface ChatResponseStream {
  // Text output
  markdown(value: string | MarkdownString): void;
  
  // Code blocks
  code(value: string, language?: string): void;
  
  // Progress indicator
  progress(value: string): void;
  
  // Interactive elements
  button(command: Command): void;
  
  // File references
  reference(value: Uri | Location | { variableName: string }): void;
  
  // Anchors/links
  anchor(value: Uri | Location, title?: string): void;
  
  // File tree
  filetree(value: ChatResponseFileTree[], baseUri: Uri): void;
  
  // Raw push
  push(part: ChatResponsePart): void;
}
```

---

## 7. Language Model API

### Selecting Models

```typescript
// Select available models
const models = await vscode.lm.selectChatModels({
  vendor: 'copilot',
  family: 'gpt-4o'
});

if (models.length === 0) {
  // Handle no models available
  return;
}

const model = models[0];
```

### Model Interface

```typescript
interface LanguageModelChat {
  readonly name: string;
  readonly id: string;
  readonly vendor: string;
  readonly family: string;
  readonly version: string;
  readonly maxInputTokens: number;
  
  sendRequest(
    messages: LanguageModelChatMessage[],
    options?: LanguageModelChatRequestOptions,
    token?: CancellationToken
  ): Thenable<LanguageModelChatResponse>;
  
  countTokens(
    text: string | LanguageModelChatMessage,
    token?: CancellationToken
  ): Thenable<number>;
}
```

### Request Options

```typescript
interface LanguageModelChatRequestOptions {
  justification?: string;                     // Why access is needed
  modelOptions?: { [name: string]: any };     // Model-specific options
  tools?: LanguageModelChatTool[];            // Available tools
  toolMode?: LanguageModelChatToolMode;       // Tool usage mode
}
```

---

## 8. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         VS Code Chat System                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐                                                        │
│  │   User Input    │                                                        │
│  │   (@orchestra)  │                                                        │
│  └────────┬────────┘                                                        │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────┐   │
│  │   Chat Panel    │────▶│  ChatWidget     │────▶│   IChatService      │   │
│  │   (UI View)     │     │  Service        │     │   (Session Mgmt)    │   │
│  └─────────────────┘     └─────────────────┘     └─────────────────────┘   │
│           │                      │                        │                 │
│           │                      │                        │                 │
│           ▼                      ▼                        ▼                 │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────────┐   │
│  │   Commands:     │     │   Sessions:     │     │   IChatAgentService │   │
│  │                 │     │                 │     │                     │   │
│  │ • chat.open     │     │ • URI-based ID  │     │ • Agent registry    │   │
│  │ • chat.newChat  │     │ • History       │     │ • Request routing   │   │
│  │ • chat.newEdit  │     │ • State         │     │ • Tool dispatch     │   │
│  └─────────────────┘     └─────────────────┘     └─────────────────────┘   │
│                                                           │                 │
│                                                           ▼                 │
│                                                  ┌─────────────────────┐   │
│                                                  │  Chat Participants  │   │
│                                                  │  (Extensions)       │   │
│                                                  │                     │   │
│                                                  │  • @orchestra       │   │
│                                                  │  • @workspace       │   │
│                                                  │  • etc.             │   │
│                                                  └─────────────────────┘   │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Extension API Surface                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ STABLE API                                                           │   │
│  │                                                                      │   │
│  │ Commands:                                                            │   │
│  │ • executeCommand('workbench.action.chat.open', options)             │   │
│  │ • executeCommand('workbench.action.chat.newChat')                   │   │
│  │                                                                      │   │
│  │ Participant:                                                         │   │
│  │ • vscode.chat.createChatParticipant(id, handler)                    │   │
│  │ • ChatRequest { prompt, command, model, references }                │   │
│  │ • ChatContext { history }                                           │   │
│  │ • ChatResponseStream { markdown, button, reference, ... }           │   │
│  │                                                                      │   │
│  │ Language Models:                                                     │   │
│  │ • vscode.lm.selectChatModels(selector)                              │   │
│  │ • LanguageModelChat.sendRequest(messages, options)                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ PROPOSED API (requires enabledApiProposals)                         │   │
│  │                                                                      │   │
│  │ chatParticipantPrivate:                                             │   │
│  │ • ChatRequest { id, sessionId, attempt, location, location2 }       │   │
│  │                                                                      │   │
│  │ chatSessionsProvider:                                               │   │
│  │ • chat.registerChatSessionItemProvider()                            │   │
│  │ • chat.registerChatSessionContentProvider()                         │   │
│  │ • ChatSessionItem { resource, label, status, timing }               │   │
│  │ • ChatSession { history, options, requestHandler }                  │   │
│  │                                                                      │   │
│  │ chatParticipantAdditions:                                           │   │
│  │ • ChatResponseStream.reference2(), codeCitation()                   │   │
│  │ • ChatResult.nextQuestion                                           │   │
│  │ • ChatResponseConfirmationPart                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Implementation Patterns

### Pattern 1: Basic Task Start

```typescript
async function startTask(task: Task): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.chat.open', {
    query: `Start working on Task ${task.id}: ${task.title}`,
    mode: 'agent',
    isPartialQuery: false,
  });
}
```

### Pattern 2: Fresh Session with Context

```typescript
async function startTaskWithContext(task: Task, handoverPath: string): Promise<void> {
  // Force fresh session
  await vscode.commands.executeCommand('workbench.action.chat.newChat');
  
  // Open with full context
  await vscode.commands.executeCommand('workbench.action.chat.open', {
    query: `Implement Task ${task.id}: ${task.title}. Follow the handover instructions.`,
    mode: 'agent',
    isPartialQuery: false,
    attachFiles: [vscode.Uri.file(handoverPath)],
  });
}
```

### Pattern 3: Model-Specific Session

```typescript
async function startWithSpecificModel(task: Task, modelId: string): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.chat.newChat');
  
  await vscode.commands.executeCommand('workbench.action.chat.open', {
    query: `Task ${task.id}: ${task.title}`,
    mode: 'agent',
    modelSelector: { id: modelId },
    isPartialQuery: false,
  });
}
```

### Pattern 4: Session Tracking (Proposed API)

```typescript
// With chatParticipantPrivate enabled
const taskSessions = new Map<number, string>();

function handleChatRequest(
  request: ChatRequest,
  context: ChatContext,
  stream: ChatResponseStream,
  token: CancellationToken
): ProviderResult<ChatResult> {
  // Extract session ID (proposed API)
  const sessionId = (request as any).sessionId;
  
  // Track which task this session is for
  if (currentTaskId && sessionId) {
    taskSessions.set(currentTaskId, sessionId);
  }
  
  // ... handle request
}

async function resumeTaskSession(taskId: number): Promise<void> {
  const sessionId = taskSessions.get(taskId);
  
  if (sessionId) {
    // Resume existing session
    await vscode.commands.executeCommand('workbench.action.chat.open', {
      // Session resume would require additional proposed API access
    });
  } else {
    // Start fresh
    await startTaskWithContext(task, handoverPath);
  }
}
```

### Pattern 5: Blocking Response Wait

```typescript
async function executeTaskWithResponse(task: Task): Promise<void> {
  // This blocks until the agent response completes
  await vscode.commands.executeCommand('workbench.action.chat.open', {
    query: `Complete Task ${task.id}: ${task.title}`,
    mode: 'agent',
    isPartialQuery: false,
    blockOnResponse: true,  // Wait for completion!
  });
  
  // Response is complete, can now verify/check results
  await verifyTaskCompletion(task);
}
```

### Pattern 6: Pre-populated History

```typescript
async function continueConversation(task: Task, previousExchanges: Exchange[]): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.chat.open', {
    query: 'Continue from where we left off',
    mode: 'agent',
    previousRequests: previousExchanges.map(e => ({
      request: e.userMessage,
      response: e.agentResponse,
    })),
  });
}
```

---

## 10. Recommendations for Orchestra

### Immediate Implementation (Stable API)

These features can be implemented NOW with the stable API:

#### 1. Enhanced Task Start

```typescript
// Replace current simple implementation
async function handleStartTask(workspaceRoot: string, taskId: number): Promise<void> {
  const task = getTask(workspaceRoot, taskId);
  const handover = getHandover(workspaceRoot, task.id);
  
  // Force fresh session for clean slate
  await vscode.commands.executeCommand('workbench.action.chat.newChat');
  
  // Open with full context
  await vscode.commands.executeCommand('workbench.action.chat.open', {
    query: buildImplementorPrompt(task, handover),
    mode: 'agent',
    isPartialQuery: false,
    attachFiles: [
      vscode.Uri.file(handover.path),
      ...handover.contextFiles.map(f => vscode.Uri.file(f)),
    ],
  });
}
```

#### 2. Role-Based Mode Selection

```typescript
async function invokeAgent(role: 'orchestrator' | 'implementor', task?: Task): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.chat.newChat');
  
  const prompt = role === 'orchestrator' 
    ? buildOrchestratorPrompt(task)
    : buildImplementorPrompt(task);
  
  await vscode.commands.executeCommand('workbench.action.chat.open', {
    query: prompt,
    mode: 'agent',
    isPartialQuery: false,
  });
}
```

#### 3. Model Selection for Tasks

```typescript
// Allow users to configure preferred models per task category
const modelConfig = {
  'INFRASTRUCTURE': 'claude-sonnet-4',
  'VISUAL': 'gpt-4o',
  'REFACTOR': 'claude-sonnet-4',
};

async function startTaskWithPreferredModel(task: Task): Promise<void> {
  const modelId = modelConfig[task.category];
  
  await vscode.commands.executeCommand('workbench.action.chat.open', {
    query: buildPrompt(task),
    mode: 'agent',
    modelSelector: modelId ? { id: modelId } : undefined,
    isPartialQuery: false,
  });
}
```

### Future Sprint (Proposed APIs)

These require enabling proposed APIs:

#### 1. Session Tracking

Track which chat session corresponds to which task:

```typescript
// Enable in package.json: "enabledApiProposals": ["chatParticipantPrivate"]

interface TaskSession {
  taskId: number;
  sessionId: string;
  startedAt: Date;
  lastInteraction: Date;
}

const taskSessionStore = new Map<number, TaskSession>();
```

#### 2. Session Resume

Resume previous task sessions:

```typescript
async function resumeOrStartTask(task: Task): Promise<void> {
  const existingSession = taskSessionStore.get(task.id);
  
  if (existingSession && isSessionRecent(existingSession)) {
    // Resume existing session
    // (Would need additional API access)
  } else {
    // Start fresh session
    await startFreshTaskSession(task);
  }
}
```

#### 3. Custom Session Provider

Full control over Orchestra task sessions:

```typescript
// Enable: "enabledApiProposals": ["chatSessionsProvider"]

const sessionProvider: ChatSessionItemProvider = {
  async provideChatSessionItems(token): Promise<ChatSessionItem[]> {
    const tasks = getAllTasks();
    return tasks.map(task => ({
      resource: vscode.Uri.parse(`orchestra-task://${task.id}`),
      label: `Task ${task.taskId}: ${task.title}`,
      status: taskToSessionStatus(task.status),
      description: task.description,
    }));
  }
};

vscode.chat.registerChatSessionItemProvider('orchestra', sessionProvider);
```

### Priority Roadmap

| Priority | Feature | API Required | Effort |
|----------|---------|--------------|--------|
| P0 | Fresh session per task | Stable | Low |
| P0 | Mode selection (agent) | Stable | Low |
| P0 | File attachment | Stable | Low |
| P1 | Model selection | Stable | Medium |
| P1 | Blocking response wait | Stable | Medium |
| P2 | Session tracking | Proposed | High |
| P2 | Session resume | Proposed | High |
| P3 | Custom session provider | Proposed | Very High |

---

## Appendix A: VS Code Source References

Key files in the VS Code repository:

| File | Purpose |
|------|---------|
| `src/vs/workbench/contrib/chat/browser/actions/chatActions.ts` | Chat command handlers |
| `src/vs/workbench/contrib/chat/browser/actions/chatNewActions.ts` | New session commands |
| `src/vs/workbench/contrib/chat/browser/chatWidgetService.ts` | Widget management |
| `src/vs/workbench/contrib/chat/common/chatService.ts` | Core chat service |
| `src/vs/workbench/contrib/chat/common/chatSessionsService.ts` | Session management |
| `src/vs/workbench/contrib/chat/common/chatAgents.ts` | Agent/participant types |
| `src/vs/workbench/api/common/extHostChatAgents2.ts` | Extension host bridge |
| `src/vscode-dts/vscode.proposed.chatParticipantPrivate.d.ts` | Proposed private API |
| `src/vscode-dts/vscode.proposed.chatSessionsProvider.d.ts` | Proposed sessions API |
| `src/vscode-dts/vscode.proposed.chatParticipantAdditions.d.ts` | Proposed additions API |

---

## Appendix B: Type Definitions

### ChatModeKind

```typescript
enum ChatModeKind {
  Agent = 'agent',
  Edit = 'edit',
  // Custom modes possible via extension
}
```

### ChatAgentLocation

```typescript
enum ChatAgentLocation {
  Chat = 'chat',           // Chat panel
  EditorInline = 'editor', // Inline editor chat
  Terminal = 'terminal',   // Terminal chat
  Notebook = 'notebook',   // Notebook chat
}
```

### ChatSessionStatus

```typescript
enum ChatSessionStatus {
  Failed = 0,
  Completed = 1,
  InProgress = 2,
  NeedsInput = 3,
}
```

---

## Appendix C: Troubleshooting

### Chat window doesn't open

```typescript
// Ensure chat is enabled
const chatEnabled = vscode.workspace.getConfiguration('chat').get('enabled');
```

### Model selector fails

```typescript
// Check available models first
const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
console.log('Available models:', models.map(m => m.id));
```

### Session not tracking

```typescript
// Proposed API required
// Check package.json has: "enabledApiProposals": ["chatParticipantPrivate"]
```

---

*Document Version: 1.0*  
*Last Updated: 2025-12-12*  
*Based on VS Code 1.95+ API*
