# Implementation Plan: Custom AI Coding Agents

**Branch**: `002-custom-agents` | **Date**: 2026-01-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-custom-agents/spec.md`

## Summary

Build custom AI coding agents in the Orchestra VS Code extension with real-time transparency, interruptability, persistent context and memory, file change tracking, and cross-session orchestrator context. Technical approach: Use VS Code's `vscode.lm` API for LLM access, implement an autonomous agent loop with tool registry, create webview panels for output and file change display, and persist session state to disk for resume capability.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+, Electron 39.x (VS Code engine)  
**Primary Dependencies**: vscode.lm API, VS Code Webview API, VS Code Workspace Edit API, better-sqlite3 (existing)  
**Storage**: SQLite via better-sqlite3 (existing Orchestra DB) + JSON files for session state  
**Testing**: Vitest (existing), VS Code Extension Test framework  
**Target Platform**: VS Code 1.95+ on Windows, macOS, Linux  
**Project Type**: VS Code Extension (single project within extension/ subdirectory)  
**Performance Goals**: <1s latency for agent thinking/tool display (SC-002), <10min task completion (SC-001)  
**Constraints**: Max 50 iterations per session (FR-018), context compaction at 20+ tool calls (SC-009)  
**Scale/Scope**: Single user, single active agent at a time, typical sprint has 10-30 tasks

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Core-First Architecture | ✅ PASS | Agent logic will live in `extension/src/agents/` with stateless core functions |
| II. Hidden Verification | ✅ PASS | Implementor agent tools use MCP `orchestra-imp/*` which enforces trust boundary |
| III. Zod-Validated YAML | ✅ PASS | Session state will use JSON (standard for transient data); sprint memory YAML |
| IV. Structured Error Hierarchy | ✅ PASS | Will extend existing OrchestraError for AgentError subclass |
| V. ESM with Strict TypeScript | ✅ PASS | Extension already uses ESM, will maintain `.js` imports |

**No violations requiring justification.**

## Project Structure

### Documentation (this feature)

```text
specs/002-custom-agents/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (internal interfaces)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (extension subdirectory)

```text
extension/src/
├── agents/              # NEW: Agent system core
│   ├── AgentRunner.ts          # Autonomous agent loop
│   ├── AgentSession.ts         # Session state management
│   ├── ContextManager.ts       # Token/context management
│   ├── ToolRegistry.ts         # Tool registration & execution
│   ├── tools/                  # Tool implementations
│   │   ├── coding/             # edit, read_file, new, delete, search, etc.
│   │   ├── orchestra/          # get_current_task, signal_completion, etc.
│   │   └── system/             # runCommands, runTasks, fetch, etc.
│   ├── memory/                 # Sprint memory system
│   │   ├── SprintMemory.ts     # Memory management
│   │   └── TaskSummary.ts      # Task summary generation
│   └── types.ts                # Agent type definitions
├── views/
│   └── agent/           # NEW: Agent UI components
│       ├── AgentOutputPanel.ts # Real-time output webview
│       ├── ChangedFilesPanel.ts # File change tracking
│       └── templates/          # Webview HTML templates
├── chat/                # EXISTING: Session management (minimal changes)
├── commands/            # EXISTING: Add agent invocation commands
└── utils/               # EXISTING: Extend errors

extension/test/
├── agents/              # NEW: Agent system tests
│   ├── AgentRunner.test.ts
│   ├── ToolRegistry.test.ts
│   └── tools/
└── integration/         # Existing + new agent integration tests
```

**Structure Decision**: Agents are a new subsystem under `extension/src/agents/`. This keeps agent logic separate from existing chat invocation (which uses VS Code Chat API for manual chat). The agents subsystem uses `vscode.lm` API directly for programmatic autonomous execution.

## Complexity Tracking

> No constitution violations requiring justification.

---

## Phase 0 Complete ✅

**Research artifacts generated:**
- [research.md](research.md) - API research for vscode.lm, webviews, session persistence

**Key decisions from research:**
1. Use `vscode.lm` API for autonomous agent execution (not Chat participant API)
2. Implement tools as vscode.lm tools (not MCP) for lower overhead
3. Use file-based JSON for session persistence with per-iteration checkpoints
4. Batch webview messages at 50ms intervals for 60fps streaming

---

## Phase 1 Complete ✅

**Design artifacts generated:**
- [data-model.md](data-model.md) - Full entity definitions with Zod schemas
- [quickstart.md](quickstart.md) - Developer setup guide
- [contracts/](contracts/) - Internal API interfaces
  - `IAgentRunner.ts` - Agent execution interface
  - `IToolRegistry.ts` - Tool management interface
  - `IFileChangeTracker.ts` - File change tracking interface
  - `types.ts` - Shared type definitions

**Constitution Re-Check (Post-Design):**

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Core-First Architecture | ✅ PASS | Agent logic in `extension/src/agents/` with stateless core |
| II. Hidden Verification | ✅ PASS | Implementor tools access DB via trust-boundary-safe queries |
| III. Zod-Validated YAML | ✅ PASS | Session state uses JSON with Zod; sprint memory uses YAML |
| IV. Structured Error Hierarchy | ✅ PASS | AgentError extends OrchestraError pattern |
| V. ESM with Strict TypeScript | ✅ PASS | All contracts use proper ESM patterns |

---

## Implementation Phases Summary

| Phase | Priority | Scope | Estimated Tasks |
|-------|----------|-------|-----------------|
| 1: Core Infrastructure | P0 | AgentRunner, ToolRegistry, basic streaming | 3 |
| 2: Coding Tools | P0 | edit, read_file, new, delete, search, etc. | 3 |
| 3: Orchestra Tools | P0 | get_current_task, signal_completion, etc. | 2 |
| 4: UI Components | P0 | Agent Output Panel, controls | 3 |
| 5: File Tracking | P1 | FileChangeTracker, Changed Files Panel, Undo | 3 |
| 6: Session Persistence | P1 | Save/restore sessions, checkpoints | 3 |
| 7: Sprint Memory | P1 | Orchestrator cross-task context | 3 |
| 8: Configuration | P2 | Verbosity, model selection, context compaction | 3 |

**Total: ~23 tasks across 8 phases**

---

## Next Steps

Run `/speckit.tasks` to generate the detailed task breakdown for implementation.

---

*Plan completed by /speckit.plan on 2026-01-12*

