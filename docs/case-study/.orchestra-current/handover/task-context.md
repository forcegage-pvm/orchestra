# Sprint Context: Orchestra Phase 1 CLI

## Project Overview

**Orchestra** is an AI-first development workflow orchestration tool. It separates the orchestrator role (who holds verification criteria) from the implementor role (who does the work).

## This Sprint

We are building the **CLI tool** (Phase 1) that will:
- Initialize sprints from spec files
- Prepare task handovers for implementor agents
- Run verification checks
- Track progress
- Complete tasks and advance workflow

## Architecture

```
tools/orchestra/
├── src/
│   ├── core/        # Shared business logic (NO CLI dependencies!)
│   ├── cli/         # CLI commands using core
│   ├── mcp/         # MCP server (Phase 2)
│   └── extension/   # VS Code extension (Phase 3)
├── test/
├── .orchestra/      # Dogfooding - using Orchestra on itself!
└── spec/            # Full specification documents
```

## Key Design Principle

**`src/core/` has ZERO CLI dependencies.** It exports pure functions and classes that can be imported by CLI, MCP server, and VS Code extension.

## Tech Stack

- **Language**: TypeScript 5.x (strict mode)
- **Runtime**: Node.js 20+
- **CLI Framework**: Commander.js
- **Validation**: Zod
- **YAML**: js-yaml
- **Templates**: Handlebars
- **Testing**: Vitest
- **Build**: tsup

## Current Progress

- ✅ Task 1.1: Project Setup
- 🔄 Task 1.2: Core Libraries (IN PROGRESS)
- ⏳ Task 1.3-1.9: Remaining tasks

## Meta Note

Yes, we are using Orchestra to build Orchestra! This is intentional dogfooding to discover UX issues early.
