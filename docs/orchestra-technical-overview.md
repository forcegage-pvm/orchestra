# Orchestra Technical Overview

**Version**: 2.0.0  
**Last Updated**: 2026-01-23  
**Status**: ACTIVE  
**Authoritative Document**: This is the comprehensive technical reference for the Orchestra system.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Solution Architecture](#solution-architecture)
4. [Core Concepts](#core-concepts)
5. [System Architecture](#system-architecture)
6. [Agent Roles and Responsibilities](#agent-roles-and-responsibilities)
7. [Task Lifecycle](#task-lifecycle)
8. [MCP Server and Tools](#mcp-server-and-tools)
9. [VS Code Extension](#vs-code-extension)
10. [Database Schema](#database-schema)
11. [Verification System](#verification-system)
12. [Code Review Workflow](#code-review-workflow)
13. [TDD Red-Green Workflow](#tdd-red-green-workflow)
14. [Configuration](#configuration)
15. [Complete Workflow Examples](#complete-workflow-examples)
16. [Troubleshooting](#troubleshooting)

---

## Executive Summary

**Orchestra** is an AI task orchestration system that enforces rigorous software development lifecycle (SDLC) practices through a multi-agent architecture. It solves the fundamental problem of **AI agents gaming acceptance criteria** by implementing a hidden verification pattern where the entity that creates verification criteria is different from the entity that implements the code.

### Key Innovation

```
┌────────────────────────────────────────────────────────────────────────┐
│                    THE HIDDEN VERIFICATION PATTERN                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ORCHESTRATOR                           IMPLEMENTOR                    │
│   ─────────────                          ───────────                    │
│   • Creates tasks                        • Receives handover            │
│   • Defines HIDDEN verification          • Implements code              │
│   • Prepares handover                    • Signals completion           │
│   • Verifies against hidden criteria     • Gets feedback on failure     │
│                                          • NEVER sees verification      │
│                                                                         │
│                          CONTROLLER                                     │
│                          ──────────                                     │
│                          • Reviews orchestrator work                    │
│                          • Validates spec alignment                     │
│                          • Prevents self-sabotage                       │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Problem Statement

### The AI Agent Verification Problem

When AI agents are given both the implementation task AND the verification criteria:

1. **Criteria Gaming**: Agents optimize for passing criteria, not genuine implementation
2. **Implementation Theater**: Code that passes tests but doesn't work correctly
3. **No-Op Implementations**: Placeholder code that technically satisfies acceptance criteria
4. **Self-Verification Bias**: Agents marking their own work as complete without rigor

### Real-World Failure Example (Sprint 017 Post-Mortem)

```
1. Orchestrator wrote handover: "implement no-op paint method"
2. Specification required: "implement basic paint functionality"
3. Verification correctly FAILED
4. Orchestrator classified it as "spec error" and removed the check
5. No-op code was marked COMPLETE
6. Production code shipped without the feature
```

**Root Cause**: The same entity that created the verification criteria could modify them after failure.

---

## Solution Architecture

Orchestra solves this through **structural role separation** and **independent auditing**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ORCHESTRA ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌────────────────┐      ┌────────────────┐      ┌────────────────┐        │
│   │  ORCHESTRATOR  │      │   CONTROLLER   │      │  IMPLEMENTOR   │        │
│   │    (Agent 1)   │      │   (Agent 2)    │      │   (Agent 3)    │        │
│   └───────┬────────┘      └───────┬────────┘      └───────┬────────┘        │
│           │                       │                       │                  │
│           │ configure_sprint      │                       │                  │
│           │ prepare_task          │ approve/reject        │ get_current_task │
│           │ run_verification      │ review handovers      │ signal_completion│
│           │ complete_task         │ code review           │ fix_code_review  │
│           │                       │                       │                  │
│           └───────────────────────┼───────────────────────┘                  │
│                                   │                                          │
│                           ┌───────┴───────┐                                  │
│                           │   MCP SERVER  │                                  │
│                           │  (Role-Based) │                                  │
│                           └───────┬───────┘                                  │
│                                   │                                          │
│                           ┌───────┴───────┐                                  │
│                           │   SQLite DB   │                                  │
│                           │  (16 tables)  │                                  │
│                           └───────────────┘                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

| Decision                              | Rationale                                          |
| ------------------------------------- | -------------------------------------------------- |
| **Separate MCP servers per role**     | Tools are filtered by role at server startup       |
| **Hidden verification in database**   | Implementor tools never query verification tables  |
| **Controller as independent auditor** | Prevents orchestrator from bypassing specification |
| **SQLite with Drizzle ORM**           | Portable, embedded, full audit trail               |
| **VS Code Extension hosting**         | Native integration with GitHub Copilot agents      |

---

## Core Concepts

### 1. Trust Boundary

The system enforces a strict information boundary between roles:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           TRUST BOUNDARY                                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│   ORCHESTRATOR ACCESS                    IMPLEMENTOR ACCESS               │
│   ───────────────────                    ──────────────────               │
│   ✓ All specification documents          ✗ Specification documents        │
│   ✓ All tasks and phases                 ✗ Other tasks (only current)     │
│   ✓ Verification criteria                ✗ Verification criteria          │
│   ✓ Full database access                 ✓ Handover only                  │
│   ✓ Sprint configuration                 ✓ Signal completion              │
│   ✓ Judgment submission                  ✓ Feedback on failures           │
│                                                                           │
│                     CONTROLLER ACCESS                                     │
│                     ─────────────────                                     │
│                     ✓ Specification documents (read-only)                 │
│                     ✓ Sprint configuration (read-only)                    │
│                     ✓ Handovers (read-only)                               │
│                     ✗ Verification criteria                               │
│                     ✓ Review decisions (approve/reject)                   │
│                     ✓ Code review submission                              │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2. Hidden Verification Pattern

Verification criteria are defined BEFORE the handover is created and stored in the database. The Implementor:

- **Never sees** the exact checks that will be run
- **Only receives** acceptance criteria in natural language
- **Gets feedback** describing WHAT failed, not HOW it was detected

### 3. Specification Review Gates

Two mandatory review gates prevent orchestrator self-sabotage:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                      SPECIFICATION REVIEW GATES                             │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   GATE 1: Sprint Configuration                                              │
│   ────────────────────────────                                              │
│   configure_sprint() → PENDING_SPEC_REVIEW → Controller reviews            │
│                        ↓                                                    │
│   APPROVED → ACTIVE (proceed)    REJECTED → SPEC_REVIEW_FAILED (revise)    │
│                                                                             │
│   GATE 2: Task Handover                                                     │
│   ─────────────────────                                                     │
│   prepare_task() → PENDING_HANDOVER_REVIEW → Controller reviews            │
│                    ↓                                                        │
│   APPROVED → IMPLEMENT (proceed)  REJECTED → HANDOVER_REVIEW_FAILED        │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4. Retry and Escalation

Tasks have a maximum retry count (default: 3). If an implementor fails verification multiple times:

```
VERIFY → FAIL → RETRY (attempt 2) → FAIL → RETRY (attempt 3) → FAIL → ESCALATED
                                                                        ↓
                                                               Human Supervisor
```

---

## System Architecture

### Directory Structure

```
orchestra/
├── src/
│   ├── mcp-server/           # MCP server entrypoint + tool handlers
│   │   ├── index.ts          # Server startup, role filtering
│   │   ├── tools.ts          # Tool definitions with role assignments
│   │   └── handlers/         # Individual tool implementations
│   ├── db/                   # Database layer
│   │   ├── schema.ts         # Drizzle ORM schema (16 tables)
│   │   ├── queries.ts        # Query functions
│   │   └── migrations.ts     # Schema migrations
│   ├── core/                 # Shared business logic (stateless)
│   └── cli.ts                # CLI entry point (dev/ops)
│
├── extension/
│   ├── src/
│   │   ├── extension.ts      # VS Code activation, MCP lifecycle
│   │   ├── database/         # Extension DB client + watcher
│   │   ├── views/            # UI components (tree, webview, panels)
│   │   ├── mcp/              # MCP server provider
│   │   └── agents/           # Agent invocation helpers
│   └── agents/               # Agent instruction files
│       ├── orchestra.orchestrator.agent.md
│       ├── orchestra.implementor.agent.md
│       └── orchestra.controller.agent.md
│
├── docs/
│   └── workflow/             # Workflow step documentation
│
└── .orchestra/               # Per-project Orchestra data (deprecated)
    └── orchestra.db          # SQLite database
```

### Component Interactions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        COMPONENT INTERACTION DIAGRAM                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────┐                                                       │
│   │  GitHub Copilot  │                                                       │
│   │     Chat         │                                                       │
│   └────────┬─────────┘                                                       │
│            │ @orchestra.orchestrator / @orchestra.implementor                │
│            │                                                                 │
│   ┌────────▼─────────┐     ┌─────────────────┐     ┌─────────────────┐      │
│   │   VS Code        │────▶│  Agent Files    │     │  MCP Config     │      │
│   │   Extension      │     │  (.github/      │     │  (.vscode/      │      │
│   └────────┬─────────┘     │   agents/)      │     │   mcp.json)     │      │
│            │               └─────────────────┘     └────────┬────────┘      │
│            │ Spawns                                         │               │
│            │                                                │               │
│   ┌────────▼─────────────────────────────────────────────────▼──────┐       │
│   │                        MCP SERVERS                               │       │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │       │
│   │  │orchestra-orc │  │orchestra-imp │  │orchestra-ctrl│           │       │
│   │  │(orchestrator)│  │(implementor) │  │(controller)  │           │       │
│   │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │       │
│   │         │                 │                 │                    │       │
│   │         └─────────────────┼─────────────────┘                    │       │
│   │                           │                                      │       │
│   │                    ┌──────▼───────┐                              │       │
│   │                    │  Tool Router │                              │       │
│   │                    └──────┬───────┘                              │       │
│   └───────────────────────────┼──────────────────────────────────────┘       │
│                               │                                              │
│                        ┌──────▼───────┐                                      │
│                        │ SQLite DB    │                                      │
│                        │ (Drizzle)    │                                      │
│                        └──────────────┘                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Roles and Responsibilities

### Orchestrator Agent

**Identity**: Senior system analyst, software architect, development manager

**File**: `extension/agents/orchestra.orchestrator.agent.md`

**MCP Server**: `orchestra-orc` (20+ tools)

**Responsibilities**:
| Phase | Responsibility | Tools |
|-------|----------------|-------|
| Planning | Break spec into tasks, define phases | `configure_sprint`, `add_task`, `add_phase` |
| Preparation | Create handovers with hidden verification | `prepare_task`, `update_handover`, `update_verification` |
| Verification | Run checks, submit judgment | `run_verification_checks`, `submit_verification_judgment` |
| Completion | Mark complete, handle failures | `complete_task`, `enhance_feedback`, `escalate_task` |

**Key Constraints**:

- Subject to Controller review gates
- Cannot signal task completion (that's implementor's job)
- Must provide context and rationale for all actions

### Implementor Agent

**Identity**: Expert-level software engineer focused on implementation

**File**: `extension/agents/orchestra.implementor.agent.md`

**MCP Server**: `orchestra-imp` (9 tools)

**Responsibilities**:
| Action | Tool | Description |
|--------|------|-------------|
| Get assignment | `get_current_task` | Receive handover with acceptance criteria |
| Implement | _(standard coding)_ | Write code, tests, documentation |
| Signal completion | `signal_completion` | Claim task is done with artifacts list |
| Handle feedback | `get_feedback` | Read failure feedback after VERIFY fails |
| Fix code reviews | `fix_code_review` | Resolve Controller's code review issues |

**Key Constraints**:

- **NEVER** accesses specification documents
- **NEVER** sees verification criteria
- **NEVER** sees other tasks (only current task)
- Handover is the COMPLETE specification

**Information Isolation Rules**:

```
YOU MUST NEVER ACCESS:
─────────────────────
✗ Task lists (tasks.md)         → Reveals other tasks
✗ Sprint manifests              → Orchestrator only
✗ Other task details            → Not your current task
✗ Verification criteria         → Hidden from you
✗ Spec files with task lists    → Reveals sprint structure

YOUR COMPLETE WORLD:
────────────────────
✓ get_current_task response     → Your specification
✓ Project source code           → What you implement
✓ context_files in handover     → ONLY these external files
```

### Controller Agent

**Identity**: Independent specification auditor and quality gatekeeper

**File**: `extension/agents/orchestra.controller.agent.md`

**MCP Server**: `orchestra-ctrl` (10 tools)

**Responsibilities**:
| Review Type | Tools | Purpose |
|-------------|-------|---------|
| Sprint Review | `approve_sprint`, `reject_sprint` | Validate task breakdown covers spec |
| Handover Review | `approve_handover`, `reject_handover` | Validate handover is faithful to spec |
| Code Review | `submit_code_review`, `get_code_review` | Review implementation quality |

**Key Constraints**:

- **Read-only** access to specifications and handovers
- **Cannot modify** verification criteria
- **Cannot prepare** tasks or run verifications
- Focus is on **spec alignment**, not implementation details

---

## Task Lifecycle

### Status Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            TASK STATUS FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                              ┌─────────┐                                     │
│                              │ PENDING │                                     │
│                              └────┬────┘                                     │
│                                   │ prepare_task                             │
│                                   ▼                                          │
│                    ┌──────────────────────────────┐                          │
│                    │  PENDING_HANDOVER_REVIEW     │◀────────┐                │
│                    └──────────────┬───────────────┘         │                │
│                                   │                         │ resubmit_      │
│            ┌──────────────────────┼──────────────────────┐  │ handover       │
│            │                      │                      │  │                │
│            ▼                      ▼                      ▼  │                │
│   ┌────────────────┐    ┌────────────────┐    ┌──────────────────┐          │
│   │HANDOVER_REVIEW │    │   IMPLEMENT    │    │HANDOVER_REVIEW   │──────────┘│
│   │   _FAILED      │    │                │    │   _APPROVED      │           │
│   └────────────────┘    └───────┬────────┘    └──────────────────┘           │
│                                 │ signal_completion                          │
│                                 ▼                                            │
│                          ┌──────────────┐                                    │
│                          │  GATE_CHECK  │                                    │
│                          └──────┬───────┘                                    │
│                                 │ run_verification_checks                    │
│                                 ▼                                            │
│                          ┌──────────────┐                                    │
│                          │    VERIFY    │                                    │
│                          └──────┬───────┘                                    │
│                    ┌────────────┼────────────┐                               │
│                    │            │            │                               │
│                    ▼            ▼            ▼                               │
│            ┌──────────┐  ┌──────────┐  ┌──────────┐                         │
│            │ COMPLETE │  │  RETRY   │  │ESCALATED │                         │
│            └────┬─────┘  └────┬─────┘  └──────────┘                         │
│                 │             │                                              │
│                 │             └────────────▶ (back to IMPLEMENT)             │
│                 ▼                                                            │
│          ┌─────────────────┐                                                 │
│          │ PENDING_CODE_   │◀──────────────────┐                             │
│          │ REVIEW          │                   │                             │
│          └────────┬────────┘                   │                             │
│                   │                            │                             │
│      ┌────────────┼────────────┐               │                             │
│      ▼            ▼            ▼               │                             │
│  ┌────────┐ ┌───────────┐ ┌─────────┐          │                             │
│  │APPROVED│ │CHANGES_   │ │REJECTED │          │                             │
│  │        │ │REQUESTED  │ │         │          │                             │
│  └────────┘ └─────┬─────┘ └─────────┘          │                             │
│                   │                            │                             │
│                   └────────────────────────────┘                             │
│                     (reopen_task + fix_code_review)                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Status Definitions

| Status                    | Phase     | Description                                    |
| ------------------------- | --------- | ---------------------------------------------- |
| `PENDING`                 | INIT      | Task created, awaiting preparation             |
| `PENDING_HANDOVER_REVIEW` | PREPARE   | Handover created, awaiting Controller approval |
| `HANDOVER_REVIEW_FAILED`  | PREPARE   | Controller rejected handover                   |
| `IMPLEMENT`               | IMPLEMENT | Approved for implementation                    |
| `GATE_CHECK`              | SIGNAL    | Implementor signaled, pre-checks running       |
| `VERIFY`                  | VERIFY    | Verification checks running                    |
| `VERIFY_FAILED`           | RETRY     | Verification failed, retry available           |
| `COMPLETE`                | COMPLETE  | Task verified and complete                     |
| `ESCALATED`               | ESCALATED | Max retries exceeded, human needed             |

---

## MCP Server and Tools

### Server Configuration

Orchestra runs **three MCP server instances** with role-based tool filtering:

```json
// .vscode/mcp.json
{
  "servers": {
    "orchestra-orc": {
      "type": "stdio",
      "command": "node",
      "args": ["path/to/mcp-server/index.js", "--role=orchestrator"],
      "env": { "ORCHESTRA_WORKSPACE": "${workspaceFolder}" }
    },
    "orchestra-imp": {
      "type": "stdio",
      "command": "node",
      "args": ["path/to/mcp-server/index.js", "--role=implementor"],
      "env": { "ORCHESTRA_WORKSPACE": "${workspaceFolder}" }
    },
    "orchestra-ctrl": {
      "type": "stdio",
      "command": "node",
      "args": ["path/to/mcp-server/index.js", "--role=controller"],
      "env": { "ORCHESTRA_WORKSPACE": "${workspaceFolder}" }
    }
  }
}
```

### Tool Reference by Role

#### Orchestrator Tools (20+)

**Sprint Management:**
| Tool | Description |
|------|-------------|
| `configure_sprint` | Create new sprint with tasks, phases, dependencies |
| `add_phase` | Add phase to active sprint |
| `add_task` | Add task to existing phase (also allowed after Controller rejection in SPEC_REVIEW_FAILED) |
| `update_task` | Update task metadata |
| `remove_task` | Remove pending task |
| `set_active_sprint` | Switch active sprint |
| `resubmit_sprint` | Resubmit after Controller rejection |

**Task Preparation:**
| Tool | Description |
|------|-------------|
| `get_task` | Get task with verification criteria |
| `get_tasks` | List tasks with filters |
| `prepare_task` | Create handover for implementor |
| `update_handover` | Modify handover details |
| `update_verification` | Update verification criteria (also allowed after Controller rejection in SPEC_REVIEW_FAILED) |
| `resubmit_handover` | Resubmit after Controller rejection |

**Verification:**
| Tool | Description |
|------|-------------|
| `run_verification_checks` | Execute verification checks |
| `get_verification_results` | Get check results |
| `submit_verification_judgment` | Submit PASS or FAIL judgment |

**Completion:**
| Tool | Description |
|------|-------------|
| `complete_task` | Mark task complete |
| `reopen_task` | Reopen after code review failure |
| `enhance_feedback` | Add guidance to feedback |

**Audit:**
| Tool | Description |
|------|-------------|
| `get_amendments` | View specification change history |
| `get_sprint_review` | Get Controller rejection details |

#### Implementor Tools (9)

| Tool                | Description                                                          |
| ------------------- | -------------------------------------------------------------------- |
| `get_current_task`  | Get current task handover                                            |
| `signal_completion` | Signal task completion with artifacts                                |
| `get_feedback`      | Get failure feedback                                                 |
| `fix_code_review`   | Resolve code review issues (GET_ISSUES, RESOLVE_ISSUE, SUBMIT_FIXES) |
| `escalate_task`     | Escalate blocked task                                                |
| `get_progress`      | Get sprint progress                                                  |
| `get_sprint_status` | Get sprint status                                                    |
| `get_signal`        | Get signal details                                                   |
| `get_task_history`  | Get task audit trail                                                 |

#### Controller Tools (10)

**Sprint Review:**
| Tool | Description |
|------|-------------|
| `approve_sprint` | Approve sprint configuration |
| `reject_sprint` | Reject sprint (requires issues) |

**Handover Review:**
| Tool | Description |
|------|-------------|
| `approve_handover` | Approve task handover |
| `reject_handover` | Reject handover (requires issues) |
| `get_handover` | Get handover details |
| `get_task_for_review` | Get task without verification |

**Code Review:**
| Tool | Description |
|------|-------------|
| `submit_code_review` | Submit review decision |
| `get_code_review` | Get review details |
| `get_code_review_summary` | Get sprint-level summary |

**Utilities:**
| Tool | Description |
|------|-------------|
| `read_spec_file` | Read specification documents |
| `get_sprint_status` | Get sprint status |

#### Shared Tools (All Roles)

| Tool                       | Description                     |
| -------------------------- | ------------------------------- |
| `get_progress`             | Sprint progress summary         |
| `get_sprint_status`        | Sprint status with phases       |
| `get_task_history`         | Task audit trail                |
| `get_signal`               | Signal details                  |
| `escalate_task`            | Escalate to human               |
| `add_interface_validation` | Add interface validation config |
| `debug_environment`        | Debug MCP environment           |

---

## VS Code Extension

### Overview

The Orchestra VS Code extension provides:

1. **MCP Server Lifecycle Management** - Automatic install/sync of bundled servers
2. **Database Reactivity** - Watch for changes and update UI
3. **Agent Integration** - Launch agents from UI
4. **Status Visualization** - Tree views, panels, status bar

### Extension Activation

When the extension activates:

```typescript
// 1. Detect Orchestra workspace
const orchestraRoot = findOrchestraRoot(workspaceRoot);

// 2. Install MCP servers to .vscode/mcp.json
await installMcpServers(orchestraRoot, extensionPath);

// 3. Sync agent files to .github/agents/
ensureAgentFiles(context, workspaceRoot);

// 4. Initialize database connection
await OrchestraDB.initialize(orchestraRoot);

// 5. Start database watcher for UI reactivity
dbWatcher = new DatabaseWatcher(db, handlers);
```

### UI Components

#### Sprint Tree View

Displays the current sprint structure:

```
📦 Sprint: sprint-016
├── 📁 Phase 1: Infrastructure
│   ├── ✅ Task 1: Database client (COMPLETE)
│   ├── 🔄 Task 2: API handlers (IMPLEMENT)
│   └── ⏳ Task 3: Tests (PENDING)
└── 📁 Phase 2: Integration
    ├── ⏳ Task 4: Auth flow (PENDING)
    └── ⏳ Task 5: E2E tests (PENDING)
```

#### Current Task View

Shows the implementor's current task handover:

```
┌────────────────────────────────────────────┐
│  Task 2: API Handlers                      │
├────────────────────────────────────────────┤
│  Priority: P1 (High)                       │
│  Status: IMPLEMENT                         │
│                                            │
│  Acceptance Criteria:                      │
│  ☐ All endpoint handlers exist             │
│  ☐ Error handling implemented              │
│  ☐ Unit tests pass                         │
│                                            │
│  File Operations:                          │
│  CREATE: src/api/handlers.ts               │
│  CREATE: test/api/handlers.test.ts         │
│                                            │
│  [Signal Completion]  [View Handover]      │
└────────────────────────────────────────────┘
```

#### Code Review Panel

Displays code review status and issues:

```
┌────────────────────────────────────────────┐
│  Code Review: Task 2                       │
├────────────────────────────────────────────┤
│  Status: CHANGES_REQUESTED                 │
│  Risk: MEDIUM                              │
│                                            │
│  Issues:                                   │
│  ⛔ BLOCKING: Missing error handling       │
│     File: src/api/handlers.ts:45           │
│     Recommendation: Add try-catch block    │
│                                            │
│  ⚠️ MAJOR: Inconsistent naming             │
│     File: src/api/handlers.ts:12           │
│                                            │
│  [Fix Issues]  [View Full Review]          │
└────────────────────────────────────────────┘
```

### Commands

| Command                        | Description                               |
| ------------------------------ | ----------------------------------------- |
| `orchestra.launchOrchestrator` | Open chat with Orchestrator agent         |
| `orchestra.launchImplementor`  | Open chat with Implementor agent          |
| `orchestra.launchController`   | Open chat with Controller agent           |
| `orchestra.reviewSprint`       | Launch Controller for sprint review       |
| `orchestra.playTask`           | Start task implementation                 |
| `orchestra.deEscalateTask`     | De-escalate task (human supervisor)       |
| `orchestra.forceComplete`      | Force-complete task (supervisor override) |

---

## Database Schema

Orchestra uses SQLite with Drizzle ORM. The schema includes 16+ tables:

### Core Tables

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATABASE SCHEMA (SIMPLIFIED)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   sprints                    phases                     tasks                │
│   ────────                   ──────                     ─────                │
│   id (PK)                    id (PK)                    id (PK)              │
│   name                       sprint_id (FK)             sprint_id (FK)       │
│   status*                    phase_id                   phase_id (FK)        │
│   workflow_step              phase_name                 task_id              │
│   is_active                  order                      title                │
│   created_at                                            description          │
│   updated_at                                            status*              │
│                                                         retry_count          │
│                                                         tdd_red_phase        │
│                                                                              │
│   * Sprint status: PENDING_SPEC_REVIEW, ACTIVE, SPEC_REVIEW_FAILED, etc.    │
│   * Task status: PENDING, IMPLEMENT, VERIFY, COMPLETE, ESCALATED, etc.      │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   handovers                  verification_checks        signals              │
│   ─────────                  ───────────────────        ───────              │
│   id (PK)                    id (PK)                    id (PK)              │
│   task_id (FK, unique)       task_id (FK)               task_id (FK)         │
│   priority                   check_id                   signal_id (unique)   │
│   context                    check_type*                attempt              │
│   acceptance_criteria        description                summary              │
│   file_operations            severity**                 artifacts_created    │
│   deliverables               check_config (JSON)        build_status         │
│   context_files                                         test_status          │
│                                                         pre_signal_checks    │
│   * check_type: structural, behavioral, quality                              │
│   ** severity: BLOCKING, MAJOR, MINOR, INFO                                  │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   verification_results       feedback                   progress             │
│   ────────────────────       ────────                   ────────             │
│   id (PK)                    id (PK)                    id (PK)              │
│   task_id (FK)               task_id (FK)               sprint_id (FK)       │
│   check_id (FK)              attempt                    task_id (FK)         │
│   signal_id (FK)             issues (JSON)              from_status          │
│   passed                     passed_checks (JSON)       to_status            │
│   output                     next_steps (JSON)          workflow_step        │
│   duration_ms                                           triggered_by         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Review and Audit Tables

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        REVIEW AND AUDIT TABLES                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   spec_reviews               code_reviews               code_review_issues   │
│   ────────────               ────────────               ──────────────────   │
│   id (PK)                    id (PK)                    id (PK)              │
│   sprint_id (FK)             sprint_id (FK)             review_id (FK)       │
│   task_id (FK, nullable)     task_id (FK)               task_id (FK)         │
│   review_type*               status**                   severity             │
│   decision***                summary                    issue                │
│   conformance****            risk                       file                 │
│   issues (JSON)              files_reviewed             line                 │
│   recommendations            tests_run                  status (OPEN/RESOLVED)│
│   revision_count             issues (JSON)              resolution           │
│                                                                              │
│   * review_type: SPRINT, HANDOVER, AMENDMENT                                 │
│   ** status: PENDING, IN_REVIEW, APPROVED, CHANGES_REQUESTED, REJECTED       │
│   *** decision: APPROVED, NEEDS_REVISION, REJECTED                           │
│   **** conformance: PASS, WARN, FAIL                                         │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   amendments                 escalations                tool_executions      │
│   ──────────                 ───────────                ───────────────      │
│   id (PK)                    id (PK)                    id (PK)              │
│   sprint_id (FK)             task_id (FK)               tool_name            │
│   task_id (FK)               sprint_id (FK)             role                 │
│   tool_name                  reason                     input (JSON)         │
│   amendment_type             attempts_summary           output (JSON)        │
│   rationale                  from_status                success              │
│   before_state (JSON)        retry_count                duration_ms          │
│   after_state (JSON)         resolved_at                                     │
│   changed_fields (JSON)      resolution_notes                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Verification System

### Verification Check Types

Orchestra supports three types of verification checks:

#### 1. Structural Checks

Verify file/code structure exists:

```json
{
  "check_type": "structural",
  "description": "DatabaseClient class exists",
  "severity": "BLOCKING",
  "check_config": {
    "path": "src/db/client.ts",
    "pattern": "export class DatabaseClient",
    "min_matches": 1
  }
}
```

#### 2. Behavioral Checks

Verify code behavior through commands:

```json
{
  "check_type": "behavioral",
  "description": "All unit tests pass",
  "severity": "BLOCKING",
  "check_config": {
    "command": "npm test -- -t 'DatabaseClient'",
    "expect_exit_code": 0
  }
}
```

#### 3. Quality Checks

Verify code quality standards:

```json
{
  "check_type": "quality",
  "description": "No TODO comments in production code",
  "severity": "MAJOR",
  "check_config": {
    "path": "src/**/*.ts",
    "pattern": "// TODO:",
    "min_matches": 0
  }
}
```

### Severity Levels

| Severity   | Judgment Impact | Description                     |
| ---------- | --------------- | ------------------------------- |
| `BLOCKING` | FAIL            | Task cannot pass without fixing |
| `MAJOR`    | FAIL            | Significant issue, likely fails |
| `MINOR`    | WARN            | Issue noted but doesn't block   |
| `INFO`     | PASS            | Informational only              |

### Verification Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          VERIFICATION FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   1. Implementor signals completion                                          │
│      └─► signal_completion({ artifacts, summary, build_passed, test_passed })│
│                                                                              │
│   2. Pre-signal checks run automatically                                     │
│      └─► Build status, test status, lint (configurable)                      │
│                                                                              │
│   3. Task transitions to VERIFY status                                       │
│                                                                              │
│   4. Orchestrator runs verification                                          │
│      └─► run_verification_checks({ task_id })                                │
│          ├── Structural checks (file/pattern matching)                       │
│          ├── Behavioral checks (command execution)                           │
│          └── Quality checks (code quality)                                   │
│                                                                              │
│   5. Orchestrator reviews results and submits judgment                       │
│      └─► submit_verification_judgment({                                      │
│            task_id,                                                          │
│            judgment: "PASS" | "FAIL",                                        │
│            rationale,                                                        │
│            manual_review: { files_reviewed, observations, quality }          │
│          })                                                                  │
│                                                                              │
│   6. Outcome:                                                                │
│      ├── PASS → Task status = COMPLETE                                       │
│      └── FAIL → Task status = VERIFY_FAILED                                  │
│                 └─► If retry_count < max_retries → IMPLEMENT (retry)         │
│                     If retry_count >= max_retries → ESCALATED                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Code Review Workflow

After verification passes and a task is marked COMPLETE, it enters code review.

### Review Process

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CODE REVIEW WORKFLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   COMPLETE (verified)                                                        │
│       │                                                                      │
│       ▼                                                                      │
│   PENDING_CODE_REVIEW ──────────────────────────────────────┐                │
│       │                                                     │                │
│       │ Controller reviews implementation                   │                │
│       ▼                                                     │                │
│   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│   │    APPROVED     │    │CHANGES_REQUESTED│    │    REJECTED     │         │
│   └────────┬────────┘    └────────┬────────┘    └────────┬────────┘         │
│            │                      │                      │                   │
│            ▼                      ▼                      ▼                   │
│       Done! ✅           Implementor fixes       Escalate/Replan            │
│                                   │                                          │
│                                   │ fix_code_review                          │
│                                   │ (GET_ISSUES → RESOLVE_ISSUE              │
│                                   │  → SUBMIT_FIXES)                         │
│                                   │                                          │
│                                   ▼                                          │
│                          PENDING_VERIFICATION                                │
│                                   │                                          │
│                                   │ Controller re-reviews                    │
│                                   │                                          │
│                                   └─────────────────────────────┘            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Review Focus Areas

| Area                       | Description                                |
| -------------------------- | ------------------------------------------ |
| **Requirements Alignment** | Does code match task, handover, and spec?  |
| **Functional Behavior**    | Does code work correctly for all cases?    |
| **Architecture**           | Does code follow project patterns?         |
| **Code Quality**           | Is code readable and maintainable?         |
| **Test Meaningfulness**    | Do tests validate behavior, not just pass? |
| **Test Sufficiency**       | Does coverage protect against regressions? |

### Issue Severity

| Severity     | Action                                |
| ------------ | ------------------------------------- |
| **BLOCKING** | Must fix, review is REJECTED          |
| **MAJOR**    | Must fix, review is CHANGES_REQUESTED |
| **MINOR**    | Recommended fix, can be APPROVED      |
| **INFO**     | Informational note                    |

### Implementor Fix Workflow

The Implementor uses `fix_code_review` with three actions:

```typescript
// 1. Get assigned issues
fix_code_review({ action: "GET_ISSUES" });

// 2. Mark each issue as resolved
fix_code_review({
  action: "RESOLVE_ISSUE",
  issue_id: 1,
  fix_summary: "Added try-catch block around API call",
});

// 3. Submit all fixes for verification
fix_code_review({
  action: "SUBMIT_FIXES",
  summary: "Fixed error handling and added tests",
  files_changed: ["src/api/handlers.ts", "test/api/handlers.test.ts"],
  tests_run: ["npm test -- -t 'API handlers'"],
});
```

---

## TDD Red-Green Workflow

Orchestra supports Test-Driven Development with explicit red-phase and green-phase task separation.

### Concept

| Phase           | Task Type             | Purpose                                           |
| --------------- | --------------------- | ------------------------------------------------- |
| **Red Phase**   | `tdd_red_phase: true` | Write failing tests that define expected behavior |
| **Green Phase** | Normal task           | Implement feature to make tests pass              |

### Configuration

When configuring a sprint with TDD tasks:

```json
{
  "sprint": {
    "id": "sprint-016",
    "name": "Widget Implementation"
  },
  "environment": {
    "test_command": "npm test",
    "test_file_pattern": "test/**/*.test.ts",
    "source_base_dir": "src"
  },
  "tasks": [
    {
      "task_id": 1,
      "title": "Write widget tests (RED)",
      "tdd_red_phase": true,
      "...": "other fields"
    },
    {
      "task_id": 2,
      "title": "Implement widget (GREEN)",
      "...": "other fields"
    }
  ],
  "tdd_relationships": [{ "red_task_id": 1, "green_task_id": 2 }]
}
```

### Test Markers

Implementors mark TDD tests with a two-part system:

**TypeScript/Vitest:**

```typescript
// @orchestra-task: 3  ← Task linking

describe("[tdd-red] Feature", () => {
  // ← Test filtering
  it("should validate user input", () => {
    expect(validateInput("")).toBe(false);
  });
});
```

**Dart/Flutter:**

```dart
// @orchestra-task: 3

@Tags(['tdd-red'])
library;

void main() {
  test('should validate user input', () {
    expect(validateInput(''), false);
  });
}
```

### Verification Flow

```
RED PHASE TASK:
  ✓ Marked tests FAIL when run alone
  ✓ All other tests PASS (no regressions)
  ✓ Tests fail for the CORRECT reason

GREEN PHASE TASK:
  ✓ Previously-failing tests now PASS
  ✓ All other tests still PASS
  ✓ Implementation is complete
```

---

## Configuration

### Global Configuration

Set via `set_config`:

| Key                        | Description                        | Default         |
| -------------------------- | ---------------------------------- | --------------- |
| `pre_signal_build_command` | Command to run before signal       | `npm run build` |
| `pre_signal_test_command`  | Test command before signal         | `npm test`      |
| `pre_signal_timeout`       | Timeout for pre-signal checks (ms) | `60000`         |
| `max_retries`              | Maximum retry attempts             | `3`             |

### Sprint Configuration

Set via `set_sprint_config`:

| Key                 | Description            | Example             |
| ------------------- | ---------------------- | ------------------- |
| `test_command`      | Base test command      | `npm test`          |
| `test_file_pattern` | Test file glob pattern | `test/**/*.test.ts` |
| `source_base_dir`   | Source directory       | `src`               |

### Environment Configuration (Required for TDD)

```json
{
  "environment": {
    "test_command": "npm test",
    "test_file_pattern": "test/**/*.test.ts",
    "source_base_dir": "src"
  }
}
```

---

## Complete Workflow Examples

### Example 1: Simple Task Implementation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXAMPLE: SIMPLE TASK IMPLEMENTATION                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   STEP 1: Orchestrator configures sprint                                     │
│   ──────────────────────────────────────                                     │
│   > mcp_orchestra-orc_configure_sprint({                                     │
│       sprint: { id: "sprint-001", name: "API Feature" },                     │
│       environment: { test_command: "npm test", ... },                        │
│       phases: [{ phase_id: "phase-1", phase_name: "Core" }],                 │
│       tasks: [{                                                              │
│         task_id: 1,                                                          │
│         title: "Add user endpoint",                                          │
│         description: "Create GET /users endpoint",                           │
│         ...                                                                  │
│       }]                                                                     │
│     })                                                                       │
│   → Sprint status: PENDING_SPEC_REVIEW                                       │
│                                                                              │
│   STEP 2: Controller reviews and approves sprint                             │
│   ──────────────────────────────────────────────                             │
│   > mcp_orchestra-ctrl_approve_sprint({ conformance: "PASS" })               │
│   → Sprint status: ACTIVE                                                    │
│                                                                              │
│   STEP 3: Orchestrator prepares task                                         │
│   ─────────────────────────────────                                          │
│   > mcp_orchestra-orc_prepare_task({                                         │
│       task_id: 1,                                                            │
│       acceptance_criteria: [...],                                            │
│       file_operations: [{ operation: "CREATE", path: "src/routes/users.ts" }]│
│       deliverables: ["User endpoint with tests"],                            │
│       priority: "P1",                                                        │
│       context: "This endpoint returns all users..."                          │
│     })                                                                       │
│   → Task status: PENDING_HANDOVER_REVIEW                                     │
│                                                                              │
│   STEP 4: Controller reviews and approves handover                           │
│   ────────────────────────────────────────────────                           │
│   > mcp_orchestra-ctrl_approve_handover({ task_id: 1, conformance: "PASS" }) │
│   → Task status: IMPLEMENT                                                   │
│                                                                              │
│   STEP 5: Implementor gets task and implements                               │
│   ────────────────────────────────────────────                               │
│   > mcp_orchestra-imp_get_current_task()                                     │
│   → Returns handover with acceptance criteria                                │
│   > (Implementor writes code, tests)                                         │
│   > mcp_orchestra-imp_signal_completion({                                    │
│       task_id: 1,                                                            │
│       summary: "Created GET /users endpoint with tests",                     │
│       artifacts_created: [...],                                              │
│       build_status: "PASS",                                                  │
│       test_status: "PASS"                                                    │
│     })                                                                       │
│   → Task status: VERIFY                                                      │
│                                                                              │
│   STEP 6: Orchestrator verifies                                              │
│   ─────────────────────────────                                              │
│   > mcp_orchestra-orc_run_verification_checks({ task_id: 1 })                │
│   > mcp_orchestra-orc_submit_verification_judgment({                         │
│       task_id: 1,                                                            │
│       judgment: "PASS",                                                      │
│       rationale: "All checks passed, code quality excellent...",             │
│       manual_review: { files_reviewed: [...], observations: "..." }          │
│     })                                                                       │
│   → Task status: COMPLETE                                                    │
│                                                                              │
│   STEP 7: Controller performs code review                                    │
│   ─────────────────────────────────────                                      │
│   > mcp_orchestra-ctrl_submit_code_review({                                  │
│       task: 1,                                                               │
│       decision: "APPROVED",                                                  │
│       summary: "Clean implementation with good test coverage",               │
│       risk: "LOW",                                                           │
│       files_reviewed: ["src/routes/users.ts", "test/routes/users.test.ts"]   │
│     })                                                                       │
│   → Task fully complete! ✅                                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Example 2: Handling Verification Failure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXAMPLE: VERIFICATION FAILURE + RETRY                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   (After implementor signals completion...)                                  │
│                                                                              │
│   STEP 1: Orchestrator runs verification - FAILS                             │
│   ─────────────────────────────────────────────                              │
│   > mcp_orchestra-orc_run_verification_checks({ task_id: 1 })                │
│   → Results: 2/3 checks passed, 1 BLOCKING failure                           │
│                                                                              │
│   > mcp_orchestra-orc_submit_verification_judgment({                         │
│       task_id: 1,                                                            │
│       judgment: "FAIL",                                                      │
│       rationale: "Missing error handling for invalid user ID...",            │
│       failures: [{                                                           │
│         check_id: "behavioral-001",                                          │
│         reason: "Endpoint returns 500 instead of 404 for invalid ID",        │
│         priority: "high",                                                    │
│         guidance: "Add validation in getUserById() function"                 │
│       }]                                                                     │
│     })                                                                       │
│   → Task status: VERIFY_FAILED, retry_count: 1                               │
│                                                                              │
│   STEP 2: Implementor gets feedback (sanitized - no criteria leak)           │
│   ─────────────────────────────────────────────────────────────────          │
│   > mcp_orchestra-imp_get_feedback({ task_id: 1 })                           │
│   → Returns: {                                                               │
│       attempt: 1,                                                            │
│       max_attempts: 3,                                                       │
│       can_retry: true,                                                       │
│       issues: [{                                                             │
│         description: "Error handling incomplete",                            │
│         guidance: "Add validation in getUserById() function"                 │
│       }],                                                                    │
│       next_steps: ["Review error handling", "Add 404 response"]              │
│     }                                                                        │
│   → Task status: IMPLEMENT (retry)                                           │
│                                                                              │
│   STEP 3: Implementor fixes and signals again                                │
│   ──────────────────────────────────────────                                 │
│   > (Implementor adds error handling)                                        │
│   > mcp_orchestra-imp_signal_completion({ task_id: 1, ... })                 │
│   → Task status: VERIFY                                                      │
│                                                                              │
│   STEP 4: Orchestrator verifies again - PASSES                               │
│   ───────────────────────────────────────────                                │
│   > mcp_orchestra-orc_run_verification_checks({ task_id: 1 })                │
│   → All checks pass                                                          │
│   > mcp_orchestra-orc_submit_verification_judgment({                         │
│       task_id: 1,                                                            │
│       judgment: "PASS",                                                      │
│       ...                                                                    │
│     })                                                                       │
│   → Task status: COMPLETE ✅                                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Example 3: Code Review with Changes Requested

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXAMPLE: CODE REVIEW FIX WORKFLOW                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   (After task is COMPLETE...)                                                │
│                                                                              │
│   STEP 1: Controller requests changes                                        │
│   ─────────────────────────────────                                          │
│   > mcp_orchestra-ctrl_submit_code_review({                                  │
│       task: 1,                                                               │
│       decision: "CHANGES_REQUESTED",                                         │
│       summary: "Good implementation but security concerns",                  │
│       risk: "HIGH",                                                          │
│       files_reviewed: ["src/routes/users.ts"],                               │
│       issues: [{                                                             │
│         severity: "BLOCKING",                                                │
│         issue: "SQL injection vulnerability in user search",                 │
│         file: "src/routes/users.ts",                                         │
│         line: 45,                                                            │
│         recommendation: "Use parameterized queries"                          │
│       }]                                                                     │
│     })                                                                       │
│   → Code review status: CHANGES_REQUESTED                                    │
│                                                                              │
│   STEP 2: Orchestrator reopens task                                          │
│   ─────────────────────────────────                                          │
│   > mcp_orchestra-orc_reopen_task({                                          │
│       task_id: 1,                                                            │
│       reason: "Code review identified SQL injection vulnerability"           │
│     })                                                                       │
│   → Task status: IMPLEMENT                                                   │
│                                                                              │
│   STEP 3: Implementor fixes issues                                           │
│   ────────────────────────────────                                           │
│   > mcp_orchestra-imp_fix_code_review({ action: "GET_ISSUES" })              │
│   → Returns list of issues with IDs                                          │
│                                                                              │
│   > (Implementor fixes the SQL injection)                                    │
│                                                                              │
│   > mcp_orchestra-imp_fix_code_review({                                      │
│       action: "RESOLVE_ISSUE",                                               │
│       issue_id: 1,                                                           │
│       fix_summary: "Converted to parameterized query using $1, $2"           │
│     })                                                                       │
│                                                                              │
│   > mcp_orchestra-imp_fix_code_review({                                      │
│       action: "SUBMIT_FIXES",                                                │
│       summary: "Fixed SQL injection by using parameterized queries",         │
│       files_changed: ["src/routes/users.ts"],                                │
│       tests_run: ["npm test -- -t 'user search'"]                            │
│     })                                                                       │
│   → Review status: PENDING_VERIFICATION                                      │
│                                                                              │
│   STEP 4: Controller verifies fixes                                          │
│   ─────────────────────────────────                                          │
│   > mcp_orchestra-ctrl_submit_code_review({                                  │
│       task: 1,                                                               │
│       decision: "APPROVED",                                                  │
│       verifying_fixes: true,                                                 │
│       summary: "SQL injection fixed, parameterized queries in place",        │
│       risk: "LOW",                                                           │
│       files_reviewed: ["src/routes/users.ts"]                                │
│     })                                                                       │
│   → Task fully complete! ✅                                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Common Issues

#### 1. "No current task found"

**Cause**: No task is in IMPLEMENT status for the current sprint.

**Solution**:

- Orchestrator: Prepare a task with `prepare_task`
- Controller: Approve pending handover with `approve_handover`

#### 2. Sprint stuck in PENDING_SPEC_REVIEW

**Cause**: Controller has not reviewed the sprint configuration.

**Solution**:

- Launch Controller agent: `@orchestra.controller`
- Call `approve_sprint` or `reject_sprint`

#### 3. Verification checks fail with command errors

**Cause**: Test command or path in verification check is incorrect.

**Solution**:

- Use `debug_environment` to check MCP server environment
- Update verification with correct commands using `update_verification`
- Check `get_amendments` for patterns of past failures

#### 4. TDD red-phase task fails pre-signal checks

**Cause**: Pre-signal test check runs ALL tests including intentionally-failing ones.

**Solution**:

- Ensure `environment` is configured in sprint with proper `test_file_pattern`
- Use correct TDD markers: `[tdd-red]` in test names
- Verify test framework supports filtering by name/tag

#### 5. "HANDOVER_REVIEW_FAILED" after resubmit

**Cause**: Controller rejected handover, orchestrator resubmitted without addressing issues.

**Solution**:

- Read rejection issues via `get_sprint_review` or UI
- Address each issue in the handover
- Use `update_handover` to make corrections
- Call `resubmit_handover` with detailed `changes_made`

### Debug Commands

```typescript
// Check environment and test command execution
mcp_orchestra - orc_debug_environment({ command: "npm test" });

// View all amendments (verification changes)
mcp_orchestra - orc_get_amendments({ amendment_type: "VERIFICATION" });

// Get task history for audit trail
mcp_orchestra - orc_get_task_history({ task_id: 1 });

// Get sprint status overview
mcp_orchestra - orc_get_sprint_status();
```

---

## Appendix: Quick Reference Cards

### Orchestrator Quick Reference

```
┌────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR QUICK REFERENCE                 │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  START:     get_sprint_status                                   │
│                                                                 │
│  CONFIGURE: configure_sprint → (wait for Controller approval)   │
│             add_phase, add_task, update_task                    │
│                                                                 │
│  PREPARE:   prepare_task → (wait for Controller approval)       │
│             update_handover, update_verification                │
│                                                                 │
│  VERIFY:    run_verification_checks                             │
│             get_verification_results                            │
│             submit_verification_judgment (PASS/FAIL)            │
│                                                                 │
│  COMPLETE:  complete_task                                       │
│             reopen_task (for code review fixes)                 │
│                                                                 │
│  REVISE:    resubmit_sprint (after rejection)                   │
│             resubmit_handover (after rejection)                 │
│                                                                 │
│  AUDIT:     get_amendments, get_task_history                    │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Implementor Quick Reference

```
┌────────────────────────────────────────────────────────────────┐
│                    IMPLEMENTOR QUICK REFERENCE                  │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  START:     get_current_task                                    │
│                                                                 │
│  IMPLEMENT: (write code based on handover)                      │
│             (run tests locally)                                 │
│                                                                 │
│  SIGNAL:    signal_completion({                                 │
│               summary: "...",                                   │
│               artifacts_created: [...],                         │
│               build_status: "PASS",                             │
│               test_status: "PASS"                               │
│             })                                                  │
│                                                                 │
│  ON FAIL:   get_feedback                                        │
│             (fix issues)                                        │
│             signal_completion (retry)                           │
│                                                                 │
│  CODE REV:  fix_code_review({ action: "GET_ISSUES" })           │
│             fix_code_review({ action: "RESOLVE_ISSUE", ... })   │
│             fix_code_review({ action: "SUBMIT_FIXES", ... })    │
│                                                                 │
│  BLOCKED:   escalate_task                                       │
│                                                                 │
│  ⚠️ NEVER ACCESS: specs, verification, other tasks             │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

### Controller Quick Reference

```
┌────────────────────────────────────────────────────────────────┐
│                    CONTROLLER QUICK REFERENCE                   │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  START:     get_sprint_status                                   │
│             (look for PENDING_SPEC_REVIEW or                    │
│              PENDING_HANDOVER_REVIEW statuses)                  │
│                                                                 │
│  READ:      read_spec_file                                      │
│             get_handover, get_task_for_review                   │
│                                                                 │
│  SPRINT:    approve_sprint (conformance: PASS/WARN)             │
│             reject_sprint (conformance: FAIL, issues: [...])    │
│                                                                 │
│  HANDOVER:  approve_handover (conformance: PASS/WARN)           │
│             reject_handover (conformance: FAIL, issues: [...])  │
│                                                                 │
│  CODE REV:  get_code_review({ task: N })                        │
│             submit_code_review({                                │
│               decision: "APPROVED" | "CHANGES_REQUESTED",       │
│               summary: "...",                                   │
│               risk: "LOW" | "MEDIUM" | "HIGH",                  │
│               files_reviewed: [...],                            │
│               issues: [...] (if CHANGES_REQUESTED)              │
│             })                                                  │
│                                                                 │
│  ⚠️ READ-ONLY: Cannot modify verification or handovers         │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## Version History

| Version | Date       | Changes                                          |
| ------- | ---------- | ------------------------------------------------ |
| 2.0.0   | 2026-01-23 | Complete rewrite based on current implementation |
| 1.0.0   | 2025-12-01 | Initial orchestra-bible based documentation      |

---

_This document is the authoritative technical reference for Orchestra. For workflow-specific details, see the individual documents in `docs/workflow/`._
