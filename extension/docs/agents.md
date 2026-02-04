# Custom AI Agents

This document describes the Custom AI Coding Agents subsystem used by the Orchestra VS Code extension. The subsystem enables autonomous task execution with real-time transparency, user controls, persistent sessions, file change tracking, and orchestrator memory.

## Overview

Agents execute tasks using the VS Code Language Model API (`vscode.lm`). The core loop runs a conversation, parses tool calls, executes tools, and iterates until completion or a stop condition is reached. Output events stream to the UI for transparency and user control.

### Core Loop (AgentRunner)

The `AgentRunner` implements the autonomous loop:

1. **Initialize**: create a session, select a model, and prepare tools
2. **Loop**:
   - check iteration limit and pause/stop flags
   - build message history (compaction if needed)
   - send request to the LLM with tool definitions
   - stream response and emit output events
   - execute tool calls via `ToolRegistry`
   - record tool results and update session
   - increment iteration
3. **Complete**: set session status to completed or failed

The loop supports the lifecycle states: `running`, `paused`, `stopped`, `completed`, `failed`.

## Key Components

### AgentRunner

Location: `src/agents/AgentRunner.ts`

Responsibilities:
- Selects a model per agent role
- Executes the loop and handles streaming responses
- Parses and executes tool calls
- Emits `onOutput` and `onStateChange` events for the UI
- Tracks consecutive tool failures and auto-escalation logic
- Supports pause/resume/stop and instruction redirect

### AgentSession

Location: `src/agents/AgentSession.ts`

Responsibilities:
- Owns session identity, role, task/sprint IDs
- Tracks conversation, tool calls, file changes, and checkpoints
- Manages lifecycle state transitions
- Saves and loads session JSON for persistence
- Provides recovery info for resume workflows

### ToolRegistry

Location: `src/agents/ToolRegistry.ts`

Responsibilities:
- Registers agent tools with schemas
- Provides `LanguageModelChatTool` definitions for `vscode.lm`
- Executes tools with retry and timeout support
- Returns structured execution metadata (duration, retry count, call ID)

### ContextManager

Location: `src/agents/ContextManager.ts`

Responsibilities:
- Estimates token usage (heuristic)
- Determines if context fits within model limits
- Compacts message history by summarizing older content
- Preserves system messages and recent messages during compaction

### FileChangeTracker

Location: `src/agents/FileChangeTracker.ts`

Responsibilities:
- Tracks all file operations from tools (create/modify/delete)
- Provides change summaries for UI display
- Generates diffs for review
- Supports undo for individual changes and undo-all

### SessionStorage

Location: `src/agents/SessionStorage.ts`

Responsibilities:
- Persists session JSON to `.orchestra/sessions/`
- Creates checkpoints for recovery
- Provides lock handling for safe concurrent access
- Lists recoverable sessions for resume UI

### SprintMemory

Location: `src/agents/memory/SprintMemory.ts`

Responsibilities:
- Persists cross-task orchestrator context
- Stores sprint goals, architecture decisions, task summaries, implementor patterns
- Compacts older task summaries when thresholds are reached
- Provides load/get-or-create helpers for orchestration workflows

## Tool System

Agents interact with tools using structured JSON schemas and standard success/error results. Tools are grouped into three categories.

### Coding Tools

Location: `src/agents/tools/coding/`

Purpose: file editing and workspace navigation for autonomous code changes.

Typical capabilities:
- Read file
- Edit file
- Create file
- Delete file
- Search and grep
- List directories

### Orchestra Tools

Location: `src/agents/tools/orchestra/`

Purpose: interact with Orchestra task lifecycle and verification flows.

Typical capabilities:
- get_current_task
- signal_completion
- get_feedback
- get_progress
- escalate_task

### System Tools

Location: `src/agents/tools/system/`

Purpose: run commands and surface diagnostics.

Typical capabilities:
- run_command
- run_task
- problems
- test_failure

## Lifecycle & User Controls

Agents can be controlled by users at any time:

- **Pause**: completes current step, transitions to `paused`
- **Resume**: continues loop from stored session state
- **Stop**: ends execution and preserves state for later resume
- **Redirect**: injects new user instructions into the conversation

Session state is persisted on activity updates and checkpoints to enable recovery after restarts.

## Transparency & Output Events

The agent emits output events in real time for UI rendering:

- Thinking/reasoning text
- Tool call name and parameters
- Tool execution results with success/failure status
- State transitions and errors

UI components subscribe to `onOutput` and `onStateChange` to keep the agent panel updated.

## Configuration

Agent behavior is configured through extension settings and internal defaults:

- **Model selection** per role (orchestrator, implementor, controller)
- **Verbosity** controls output detail (minimal, normal, detailed, debug)
- **Execution limits** (max iterations, retries)
- **Context management** (max tokens, compaction thresholds)

## Extension Points

The subsystem is designed to evolve:

- Add new tool categories and capabilities
- Extend memory schemas and compaction strategies
- Enhance UI integrations for richer output and file review workflows
- Introduce new agent roles with specialized behaviors
