# VS Code Custom Agent Tools - Complete Implementation Guide

## Executive Summary

This document provides a comprehensive guide for implementing custom AI coding agent tools in a VS Code extension. It consolidates all research on VS Code APIs, tool registration patterns, result handling, observability, MCP integration, and real-time UI feedback.

> **Target Platform**: Windows 32/64-bit systems
> **Use Case**: Building custom autonomous coding agents for VS Code extensions

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tool Registration & Invocation](#2-tool-registration--invocation)
3. [Tool Result Handling & Observability](#3-tool-result-handling--observability)
4. [MCP Tools Integration](#4-mcp-tools-integration)
5. [Real-Time UI Feedback Architecture](#5-real-time-ui-feedback-architecture)
6. [Complete Agent Loop Implementation](#6-complete-agent-loop-implementation)
7. [Windows-Specific Considerations](#7-windows-specific-considerations)
8. [References](#8-references)

---

## Related Documents

For detailed API research on specific tool categories, see:

- **[vscode-agent-tools-research.md](./vscode-agent-tools-research.md)** - Core Edit tools (WorkspaceEdit, FileSystem, TextDocument, Notebook editing)
- **[vscode-agent-tools-extracted-research.md](./vscode-agent-tools-extracted-research.md)** - All agent tools (vscode/_, execute/_, read/_, search, web/_, todo, MCP integration)

---

## 1. Architecture Overview

### 1.1 Tool Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CUSTOM AGENT ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────┐    ┌─────────────────┐    ┌─────────────────────────────┐ │
│   │     LLM     │───▶│  Agent Loop     │───▶│     Tool Registry           │ │
│   │  (GPT-4o,   │    │  (Your Code)    │    │  (vscode.lm.registerTool)   │ │
│   │   Claude)   │◀───│                 │◀───│                             │ │
│   └─────────────┘    └─────────────────┘    └─────────────────────────────┘ │
│                              │                            │                  │
│                              ▼                            ▼                  │
│                      ┌───────────────┐           ┌────────────────┐         │
│                      │  Event Hub    │           │  VS Code APIs  │         │
│                      │  (Observable) │           │  - workspace   │         │
│                      └───────────────┘           │  - terminal    │         │
│                              │                   │  - tasks       │         │
│                              ▼                   │  - languages   │         │
│   ┌──────────────────────────────────────────┐   └────────────────┘         │
│   │              UI Layer                     │                              │
│   │  ┌──────────┐ ┌──────────┐ ┌──────────┐  │                              │
│   │  │StatusBar │ │ Output   │ │ Webview  │  │                              │
│   │  │          │ │ Channel  │ │ Panel    │  │                              │
│   │  └──────────┘ └──────────┘ └──────────┘  │                              │
│   └──────────────────────────────────────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Insight: You Are The Middleman

The critical architectural principle is that **your extension code sits between the LLM and VS Code**. This gives you:

- **Full observability** of every tool call request and result
- **Complete control** over what the LLM sees
- **Real-time access** to execution progress, output, and errors
- **Ability to transform, log, and display** all tool interactions

---

## 2. Tool Registration & Invocation

### 2.1 Registering Tools with VS Code

Tools are registered in `package.json` and implemented via `vscode.lm.registerTool()`:

**package.json contribution:**

```json
{
  "contributes": {
    "languageModelTools": [
      {
        "name": "myext_createFile",
        "tags": ["filesystem", "edit"],
        "displayName": "Create File",
        "modelDescription": "Create a new file with specified content",
        "icon": "$(new-file)",
        "inputSchema": {
          "type": "object",
          "properties": {
            "path": {
              "type": "string",
              "description": "Absolute path for the new file"
            },
            "content": {
              "type": "string",
              "description": "Content to write to the file"
            }
          },
          "required": ["path", "content"]
        }
      }
    ]
  }
}
```

**Tool implementation:**

```typescript
import * as vscode from "vscode";

interface CreateFileInput {
  path: string;
  content: string;
}

class CreateFileTool implements vscode.LanguageModelTool<CreateFileInput> {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<CreateFileInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const { path, content } = options.input;
    const uri = vscode.Uri.file(path);

    try {
      const edit = new vscode.WorkspaceEdit();
      const encoder = new TextEncoder();

      edit.createFile(uri, {
        overwrite: false,
        contents: encoder.encode(content),
      });

      const success = await vscode.workspace.applyEdit(edit);

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          JSON.stringify({
            success,
            path,
            message: success
              ? `Created file: ${path}`
              : "Failed to create file",
          }),
        ),
      ]);
    } catch (error) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
      ]);
    }
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<CreateFileInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: `Creating file: ${options.input.path}`,
    };
  }
}

// Registration in activate()
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.lm.registerTool("myext_createFile", new CreateFileTool()),
  );
}
```

### 2.2 Invoking Tools Programmatically

```typescript
// Invoke a registered tool from your code
const result = await vscode.lm.invokeTool(
  "myext_createFile",
  {
    input: { path: "/path/to/file.ts", content: "// Hello" },
    toolInvocationToken: undefined,
  },
  cancellationToken,
);

// Process result
for (const part of result.content) {
  if (part instanceof vscode.LanguageModelTextPart) {
    const data = JSON.parse(part.value);
    console.log("Tool result:", data);
  }
}
```

---

## 3. Tool Result Handling & Observability

### 3.1 Result Type Hierarchy

```typescript
// What tools return
class LanguageModelToolResult {
  content: Array<
    | LanguageModelTextPart      // Text/JSON content
    | LanguageModelDataPart      // Binary data (images, etc.)
    | LanguageModelPromptTsxPart // Rich prompt-tsx rendering
  >;
}

// Wrapper linking result to its call
class LanguageModelToolResultPart {
  callId: string;  // MUST match LanguageModelToolCallPart.callId
  content: Array<LanguageModelTextPart | ...>;
}
```

### 3.2 Tool Observation Interface

```typescript
interface ToolObservation {
  timestamp: Date;
  toolName: string;
  callId: string;
  input: object;
  result?: {
    success: boolean;
    content: any;
    duration: number;
  };
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
}
```

### 3.3 Event-Driven Observation System

```typescript
import * as vscode from "vscode";
import { EventEmitter } from "events";

type ToolEvent =
  | { type: "call_requested"; toolName: string; callId: string; input: object }
  | { type: "call_started"; toolName: string; callId: string }
  | {
      type: "call_progress";
      toolName: string;
      callId: string;
      message: string;
      percent?: number;
    }
  | { type: "call_output"; toolName: string; callId: string; chunk: string }
  | {
      type: "call_succeeded";
      toolName: string;
      callId: string;
      result: any;
      duration: number;
    }
  | {
      type: "call_failed";
      toolName: string;
      callId: string;
      error: string;
      duration: number;
    };

class AgentEventHub extends EventEmitter {
  private activeTools = new Map<
    string,
    { startTime: number; toolName: string }
  >();

  emitToolRequested(toolName: string, callId: string, input: object): void {
    this.emit("tool", { type: "call_requested", toolName, callId, input });
  }

  emitToolStarted(toolName: string, callId: string): void {
    this.activeTools.set(callId, { startTime: Date.now(), toolName });
    this.emit("tool", { type: "call_started", toolName, callId });
  }

  emitToolProgress(callId: string, message: string, percent?: number): void {
    const active = this.activeTools.get(callId);
    if (active) {
      this.emit("tool", {
        type: "call_progress",
        toolName: active.toolName,
        callId,
        message,
        percent,
      });
    }
  }

  emitToolOutput(callId: string, chunk: string): void {
    const active = this.activeTools.get(callId);
    if (active) {
      this.emit("tool", {
        type: "call_output",
        toolName: active.toolName,
        callId,
        chunk,
      });
    }
  }

  emitToolSucceeded(callId: string, result: any): void {
    const active = this.activeTools.get(callId);
    if (active) {
      const duration = Date.now() - active.startTime;
      this.activeTools.delete(callId);
      this.emit("tool", {
        type: "call_succeeded",
        toolName: active.toolName,
        callId,
        result,
        duration,
      });
    }
  }

  emitToolFailed(callId: string, error: string): void {
    const active = this.activeTools.get(callId);
    if (active) {
      const duration = Date.now() - active.startTime;
      this.activeTools.delete(callId);
      this.emit("tool", {
        type: "call_failed",
        toolName: active.toolName,
        callId,
        error,
        duration,
      });
    }
  }
}

// Singleton instance
export const eventHub = new AgentEventHub();
```

### 3.4 Terminal Output Streaming

For terminal-based tools, capture output in real-time:

```typescript
async function executeTerminalWithCapture(
  command: string,
  options?: {
    cwd?: string;
    terminalName?: string;
    onOutput?: (chunk: string) => void;
  },
): Promise<{ output: string; exitCode: number | undefined; duration: number }> {
  const startTime = Date.now();
  let fullOutput = "";

  // Create or find terminal
  let terminal = options?.terminalName
    ? vscode.window.terminals.find((t) => t.name === options.terminalName)
    : undefined;

  if (!terminal) {
    terminal = vscode.window.createTerminal({
      name: options?.terminalName || "Agent Execution",
      cwd: options?.cwd,
    });
  }

  terminal.show();

  // Wait for shell integration
  const shellIntegration = await waitForShellIntegration(terminal, 5000);

  if (!shellIntegration) {
    terminal.sendText(command);
    return {
      output: "[Shell integration not available]",
      exitCode: undefined,
      duration: Date.now() - startTime,
    };
  }

  // Execute with shell integration
  const execution = shellIntegration.executeCommand(command);

  // Stream output
  for await (const data of execution.read()) {
    fullOutput += data;
    options?.onOutput?.(data);
  }

  // Get exit code
  const exitCode = await new Promise<number | undefined>((resolve) => {
    const disposable = vscode.window.onDidEndTerminalShellExecution((event) => {
      if (event.execution === execution) {
        disposable.dispose();
        resolve(event.exitCode);
      }
    });
    setTimeout(() => {
      disposable.dispose();
      resolve(undefined);
    }, 30000);
  });

  return {
    output: fullOutput,
    exitCode,
    duration: Date.now() - startTime,
  };
}

async function waitForShellIntegration(
  terminal: vscode.Terminal,
  timeoutMs: number,
): Promise<vscode.TerminalShellIntegration | undefined> {
  if (terminal.shellIntegration) return terminal.shellIntegration;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      disposable.dispose();
      resolve(undefined);
    }, timeoutMs);

    const disposable = vscode.window.onDidChangeTerminalShellIntegration(
      (event) => {
        if (event.terminal === terminal) {
          clearTimeout(timeout);
          disposable.dispose();
          resolve(event.shellIntegration);
        }
      },
    );
  });
}
```

---

## 4. MCP Tools Integration

Orchestra exposes MCP (Model Context Protocol) tools that can be integrated with VS Code's Language Model tools.

### 4.1 Integration Options

| Option                  | Description                               | Pros                                   | Cons                       |
| ----------------------- | ----------------------------------------- | -------------------------------------- | -------------------------- |
| **Direct MCP Calls**    | Agent loop calls MCP server directly      | Simple, no duplication                 | Two tool systems to manage |
| **Wrap as LM Tools** ⭐ | Register MCP tools as `lm.registerTool()` | Unified interface, VS Code integration | Thin wrapper layer needed  |
| **Shared Core**         | Both MCP and LM tools call shared core    | DRY, consistent behavior               | Requires refactoring       |

### 4.2 Recommended: Wrap MCP Tools as LM Tools

```typescript
import * as vscode from "vscode";
import { MCPClient } from "./mcp-client";

class MCPToolWrapper<T extends object> implements vscode.LanguageModelTool<T> {
  constructor(
    private mcpClient: MCPClient,
    private mcpToolName: string,
    private toolDescription: string,
  ) {}

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<T>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    try {
      // Call the MCP server
      const mcpResult = await this.mcpClient.callTool(
        this.mcpToolName,
        options.input,
      );

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify(mcpResult)),
      ]);
    } catch (error) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
      ]);
    }
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<T>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    return {
      invocationMessage: `Calling ${this.mcpToolName}...`,
    };
  }
}

// Register all MCP tools as LM tools
async function registerMCPTools(
  context: vscode.ExtensionContext,
  mcpClient: MCPClient,
): Promise<void> {
  const mcpTools = await mcpClient.listTools();

  for (const tool of mcpTools) {
    const wrapper = new MCPToolWrapper(mcpClient, tool.name, tool.description);

    context.subscriptions.push(
      vscode.lm.registerTool(`orchestra_${tool.name}`, wrapper),
    );
  }
}
```

---

## 5. Real-Time UI Feedback Architecture

### 5.1 Multi-Layer UI Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                      UI FEEDBACK LAYERS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Layer 1: StatusBar (Quick Glance)                               │
│  ├─ Current tool name + spinner                                  │
│  ├─ Success/failure indicator                                    │
│  └─ Click to open Output Channel                                 │
│                                                                  │
│  Layer 2: OutputChannel (Debug Log)                              │
│  ├─ Full timestamped log                                         │
│  ├─ All tool inputs/outputs                                      │
│  └─ Stack traces on errors                                       │
│                                                                  │
│  Layer 3: Webview Panel (Rich Interactive UI)                    │
│  ├─ Live streaming tool output                                   │
│  ├─ Collapsible tool call history                                │
│  ├─ Syntax-highlighted code                                      │
│  └─ Action buttons (cancel, retry)                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 StatusBar Component

```typescript
import * as vscode from "vscode";
import { eventHub, ToolEvent } from "./event-hub";

class AgentStatusBar {
  private statusBarItem: vscode.StatusBarItem;
  private outputChannel: vscode.OutputChannel;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.statusBarItem.command = "orchestra.showAgentOutput";
    this.statusBarItem.show();

    this.outputChannel = vscode.window.createOutputChannel("Orchestra Agent");

    // Subscribe to all tool events
    eventHub.on("tool", (event: ToolEvent) => this.handleEvent(event));
  }

  private handleEvent(event: ToolEvent): void {
    const timestamp = new Date().toISOString();

    switch (event.type) {
      case "call_started":
        this.statusBarItem.text = `$(sync~spin) ${event.toolName}...`;
        this.statusBarItem.backgroundColor = undefined;
        this.outputChannel.appendLine(
          `[${timestamp}] STARTED: ${event.toolName} (${event.callId})`,
        );
        break;

      case "call_progress":
        const pct = event.percent ? ` ${event.percent}%` : "";
        this.statusBarItem.text = `$(sync~spin) ${event.toolName}${pct}`;
        this.outputChannel.appendLine(
          `[${timestamp}] PROGRESS: ${event.message}`,
        );
        break;

      case "call_output":
        this.outputChannel.append(event.chunk);
        break;

      case "call_succeeded":
        this.statusBarItem.text = `$(check) ${event.toolName} (${event.duration}ms)`;
        this.statusBarItem.backgroundColor = undefined;
        this.outputChannel.appendLine(
          `[${timestamp}] SUCCESS: ${event.toolName} in ${event.duration}ms`,
        );
        this.outputChannel.appendLine(
          `  Result: ${JSON.stringify(event.result, null, 2)}`,
        );

        // Reset after 3 seconds
        setTimeout(() => {
          this.statusBarItem.text = "$(robot) Agent Ready";
        }, 3000);
        break;

      case "call_failed":
        this.statusBarItem.text = `$(error) ${event.toolName} failed`;
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
          "statusBarItem.errorBackground",
        );
        this.outputChannel.appendLine(
          `[${timestamp}] FAILED: ${event.toolName} - ${event.error}`,
        );
        break;
    }
  }

  dispose(): void {
    this.statusBarItem.dispose();
    this.outputChannel.dispose();
  }
}
```

### 5.3 Webview Panel with Live Streaming

```typescript
import * as vscode from "vscode";
import { eventHub, ToolEvent } from "./event-hub";

class AgentWebviewPanel {
  private panel: vscode.WebviewPanel | undefined;
  private toolHistory: ToolEvent[] = [];

  show(context: vscode.ExtensionContext): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "orchestraAgent",
      "Orchestra Agent",
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this.panel.webview.html = this.getHtml();

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    // Forward events to webview
    eventHub.on("tool", (event: ToolEvent) => {
      this.toolHistory.push(event);
      this.panel?.webview.postMessage({ type: "toolEvent", event });
    });

    // Handle messages from webview
    this.panel.webview.onDidReceiveMessage((message) => {
      if (message.type === "cancel") {
        // Handle cancellation
      }
    });
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: var(--vscode-font-family);
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      padding: 16px;
    }
    .tool-call {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      margin: 8px 0;
      padding: 12px;
    }
    .tool-call.running {
      border-color: var(--vscode-progressBar-background);
    }
    .tool-call.success {
      border-color: var(--vscode-testing-iconPassed);
    }
    .tool-call.failed {
      border-color: var(--vscode-testing-iconFailed);
    }
    .tool-name {
      font-weight: bold;
      font-size: 14px;
    }
    .tool-output {
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      background: var(--vscode-textCodeBlock-background);
      padding: 8px;
      margin-top: 8px;
      white-space: pre-wrap;
      max-height: 300px;
      overflow-y: auto;
    }
    .spinner {
      display: inline-block;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .duration {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <h2>🤖 Agent Activity</h2>
  <div id="tools"></div>

  <script>
    const vscode = acquireVsCodeApi();
    const toolsContainer = document.getElementById('tools');
    const activeTools = new Map();

    window.addEventListener('message', (event) => {
      const { type, event: toolEvent } = event.data;
      if (type !== 'toolEvent') return;

      switch (toolEvent.type) {
        case 'call_started':
          const div = document.createElement('div');
          div.className = 'tool-call running';
          div.id = 'tool-' + toolEvent.callId;
          div.innerHTML = \`
            <div class="tool-name">
              <span class="spinner">⟳</span> \${toolEvent.toolName}
            </div>
            <div class="tool-output" id="output-\${toolEvent.callId}"></div>
          \`;
          toolsContainer.prepend(div);
          activeTools.set(toolEvent.callId, { output: '' });
          break;

        case 'call_output':
          const active = activeTools.get(toolEvent.callId);
          if (active) {
            active.output += toolEvent.chunk;
            const outputEl = document.getElementById('output-' + toolEvent.callId);
            if (outputEl) {
              outputEl.textContent = active.output;
              outputEl.scrollTop = outputEl.scrollHeight;
            }
          }
          break;

        case 'call_succeeded':
          const successEl = document.getElementById('tool-' + toolEvent.callId);
          if (successEl) {
            successEl.className = 'tool-call success';
            successEl.querySelector('.tool-name').innerHTML = \`
              ✓ \${toolEvent.toolName}
              <span class="duration">(\${toolEvent.duration}ms)</span>
            \`;
          }
          activeTools.delete(toolEvent.callId);
          break;

        case 'call_failed':
          const failEl = document.getElementById('tool-' + toolEvent.callId);
          if (failEl) {
            failEl.className = 'tool-call failed';
            failEl.querySelector('.tool-name').innerHTML = \`
              ✗ \${toolEvent.toolName}
              <span class="duration">(\${toolEvent.duration}ms)</span>
            \`;
            const outputEl = document.getElementById('output-' + toolEvent.callId);
            if (outputEl) {
              outputEl.textContent += '\\n\\nError: ' + toolEvent.error;
            }
          }
          activeTools.delete(toolEvent.callId);
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}
```

---

## 6. Complete Agent Loop Implementation

### 6.1 Full Agent Loop with Observability

```typescript
import * as vscode from "vscode";
import { eventHub } from "./event-hub";

interface AgentOptions {
  model?: string;
  tools: vscode.LanguageModelChatTool[];
  maxIterations?: number;
}

class ObservableAgentLoop {
  private observations: any[] = [];

  async run(prompt: string, options: AgentOptions): Promise<string> {
    const [model] = await vscode.lm.selectChatModels({
      family: options.model || "gpt-4o",
    });

    if (!model) {
      throw new Error("No model available");
    }

    const messages: vscode.LanguageModelChatMessage[] = [
      vscode.LanguageModelChatMessage.User(prompt),
    ];

    const tokenSource = new vscode.CancellationTokenSource();
    const maxIterations = options.maxIterations || 20;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      // Send request to LLM
      const response = await model.sendRequest(
        messages,
        { tools: options.tools },
        tokenSource.token,
      );

      // Collect response
      const toolCalls: vscode.LanguageModelToolCallPart[] = [];
      let textContent = "";

      for await (const part of response.stream) {
        if (part instanceof vscode.LanguageModelTextPart) {
          textContent += part.value;
        } else if (part instanceof vscode.LanguageModelToolCallPart) {
          toolCalls.push(part);
          eventHub.emitToolRequested(part.name, part.callId, part.input);
        }
      }

      // If no tool calls, agent is done
      if (toolCalls.length === 0) {
        return textContent;
      }

      // Execute tools with full observability
      const toolResults = await this.executeTools(toolCalls, tokenSource.token);

      // Add messages for next iteration
      messages.push(vscode.LanguageModelChatMessage.Assistant([...toolCalls]));
      messages.push(vscode.LanguageModelChatMessage.User([...toolResults]));
    }

    throw new Error(`Agent exceeded maximum iterations (${maxIterations})`);
  }

  private async executeTools(
    toolCalls: vscode.LanguageModelToolCallPart[],
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResultPart[]> {
    const results: vscode.LanguageModelToolResultPart[] = [];

    for (const toolCall of toolCalls) {
      eventHub.emitToolStarted(toolCall.name, toolCall.callId);

      try {
        const result = await vscode.lm.invokeTool(
          toolCall.name,
          { input: toolCall.input, toolInvocationToken: undefined },
          token,
        );

        eventHub.emitToolSucceeded(toolCall.callId, result.content);

        results.push(
          new vscode.LanguageModelToolResultPart(
            toolCall.callId,
            result.content,
          ),
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        eventHub.emitToolFailed(toolCall.callId, errorMessage);

        // Send error to LLM so it can recover
        results.push(
          new vscode.LanguageModelToolResultPart(toolCall.callId, [
            new vscode.LanguageModelTextPart(
              JSON.stringify({
                success: false,
                error: errorMessage,
                suggestion: this.getSuggestion(toolCall.name, error),
              }),
            ),
          ]),
        );
      }

      this.observations.push({
        timestamp: new Date(),
        toolName: toolCall.name,
        callId: toolCall.callId,
      });
    }

    return results;
  }

  private getSuggestion(toolName: string, error: any): string {
    const suggestions: Record<string, Record<string, string>> = {
      create_file: {
        FileExists: "Use edit_file to modify existing files.",
        FileNotFound: "Create parent directory first.",
      },
      read_file: {
        FileNotFound: "Check the file path exists.",
      },
    };

    return (
      suggestions[toolName]?.[error?.code] || "Try an alternative approach."
    );
  }

  getObservations() {
    return [...this.observations];
  }
}
```

### 6.2 What Each Side Sees

| Event               | Your Extension                                            | The LLM                               |
| ------------------- | --------------------------------------------------------- | ------------------------------------- |
| **Tool requested**  | Full `LanguageModelToolCallPart` with name, input, callId | (it made the request)                 |
| **Tool executing**  | Full control - log, show progress, emit events            | Waiting for result                    |
| **Tool succeeds**   | Full `LanguageModelToolResult`, can inspect/log           | `LanguageModelToolResultPart.content` |
| **Tool fails**      | Catch error, see message/code/stack                       | Error formatted in result             |
| **Terminal output** | Real-time stream via `execution.read()`                   | You include it in result              |
| **Exit codes**      | `event.exitCode` from shell integration                   | You include it in result              |
| **Progress**        | `withProgress` shows in VS Code UI                        | You can include in final result       |
| **Cancellation**    | `CancellationToken.isCancellationRequested`               | Tool result indicates cancellation    |

---

## 7. Windows-Specific Considerations

### 7.1 Path Handling

```typescript
// Always use Uri.file() for Windows path normalization
const uri = vscode.Uri.file("C:\\Users\\name\\project\\file.ts");
// uri.fsPath = 'c:\\Users\\name\\project\\file.ts' (lowercase drive)
// uri.path = '/c:/Users/name/project/file.ts' (forward slashes)

// Join paths safely
const childUri = vscode.Uri.joinPath(parentUri, "src", "file.ts");
```

### 7.2 Line Endings

```typescript
// Windows files often use CRLF
const eol = document.eol; // EndOfLine.CRLF = 2 on Windows

// Normalize for processing
function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

// Preserve original when writing
function preserveLineEndings(content: string, original: string): string {
  const hasCRLF = original.includes("\r\n");
  return hasCRLF ? content.replace(/\n/g, "\r\n") : content;
}
```

### 7.3 Terminal Shell

```typescript
// Default shell on Windows
const terminalOptions: vscode.TerminalOptions = {
  name: "Agent Terminal",
  shellPath: "pwsh.exe", // PowerShell 7+
  // Or: 'powershell.exe' for Windows PowerShell
  shellArgs: ["-NoProfile", "-ExecutionPolicy", "Bypass"],
};
```

### 7.4 Environment Variables

```typescript
// Windows env vars are case-insensitive
function getEnvVar(name: string): string | undefined {
  const upperName = name.toUpperCase();
  for (const [key, value] of Object.entries(process.env)) {
    if (key.toUpperCase() === upperName) {
      return value;
    }
  }
  return undefined;
}
```

---

## 8. References

### Related Research Documents

| Document                                                                               | Description                                                                  |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [vscode-agent-tools-research.md](./vscode-agent-tools-research.md)                     | Core Edit tools: WorkspaceEdit, FileSystem, TextDocument, Notebook editing   |
| [vscode-agent-tools-extracted-research.md](./vscode-agent-tools-extracted-research.md) | All agent tools: vscode/_, execute/_, read/_, search, web/_, todo, MCP tools |

### VS Code API Resources

- [VS Code API Reference](https://code.visualstudio.com/api/references/vscode-api)
- [Language Model API](https://code.visualstudio.com/api/extension-guides/language-model)
- [Extension Samples](https://github.com/microsoft/vscode-extension-samples)
- [Chat Extension Sample](https://github.com/microsoft/vscode-extension-samples/tree/main/chat-sample)

### Tool Categories Summary

| Category          | Tools                                                           | Primary APIs                           |
| ----------------- | --------------------------------------------------------------- | -------------------------------------- |
| **vscode/**       | getProjectSetupInfo, runCommand, installExtension, newWorkspace | workspace, commands, extensions        |
| **execute/**      | runInTerminal, getTerminalOutput, runTask, runTests             | Terminal, tasks, tests                 |
| **read/**         | problems, readFile, terminalSelection, terminalLastCommand      | languages.getDiagnostics, workspace.fs |
| **edit**          | createFile, editFile, deleteFile, editNotebook                  | WorkspaceEdit, workspace.applyEdit     |
| **search**        | files, text, symbols                                            | workspace.findFiles, executeCommand    |
| **web/**          | fetch                                                           | Node.js fetch/http                     |
| **todo**          | manage todo list                                                | ExtensionContext.workspaceState        |
| **orchestra-\*/** | MCP integration                                                 | lm.registerTool, MCP client            |

---

## Summary

This guide provides everything needed to implement custom AI coding agent tools in a VS Code extension:

1. **Tool Registration** - Use `lm.registerTool()` with `package.json` contributions
2. **Result Handling** - Full observability via event-driven architecture
3. **MCP Integration** - Wrap existing MCP tools as LM tools
4. **UI Feedback** - Multi-layer approach (StatusBar, OutputChannel, Webview)
5. **Agent Loop** - Complete implementation with tool execution and error recovery
6. **Windows Support** - Path handling, line endings, shell configuration

The key architectural insight is that your extension code is the **middleman** between the LLM and VS Code, giving you complete visibility and control over all tool interactions.
