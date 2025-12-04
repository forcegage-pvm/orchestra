# Implementation Plan: MCP Server for Orchestra

**Branch**: `001-mcp-server` | **Date**: 2025-12-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-mcp-server/spec.md`

## Summary

Expose Orchestra's task orchestration operations as an MCP (Model Context Protocol) server, enabling AI agents like GitHub Copilot to prepare tasks, signal completion, verify work, and complete tasks programmatically. The server wraps existing `src/core/` library functions with MCP tool definitions, enforcing role-based access (Implementor vs Orchestrator) via required `role` parameter.

## Technical Context

**Language/Version**: TypeScript 5.4+ (ESM modules, strict mode with `exactOptionalPropertyTypes`)  
**Primary Dependencies**: @modelcontextprotocol/sdk ^0.6.0, existing Orchestra core (zod, yaml, handlebars, chalk, simple-git)  
**Storage**: File-based (.orchestra/ folder structure from Phase 1)  
**Testing**: Vitest (346+ existing tests to maintain)  
**Target Platform**: Node.js 18+ (VS Code Copilot MCP integration)
**Project Type**: Single project (extends existing CLI with MCP layer)  
**Performance Goals**: Server startup <2s, tool responses <500ms  
**Constraints**: STDIO transport only, fail-fast on concurrent access, 3 retry attempts before escalation  
**Scale/Scope**: 10 MCP tools wrapping existing CLI commands

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Check (2025-12-04)

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Core-First Architecture | ✅ PASS | MCP tools wrap `src/core/` functions; no business logic duplication |
| II. Hidden Verification | ✅ PASS | Role enforcement prevents Implementor access to verification results |
| III. Zod-Validated YAML | ✅ PASS | No new YAML schemas; uses existing core types |
| IV. Structured Error Hierarchy | ✅ PASS | MCP errors wrap OrchestraError with appropriate error codes |
| V. ESM with Strict TypeScript | ✅ PASS | All imports use .js extensions; exactOptionalPropertyTypes maintained |

**Gate Result**: ✅ PASS - Proceed to Phase 0 research

### Post-Design Check (2025-12-04)

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Core-First Architecture | ✅ PASS | MCP layer in `src/mcp/` wraps core; tool handlers delegate to `run*()` functions |
| II. Hidden Verification | ✅ PASS | Role enforcement via required `role` param; AttemptTracker stored in `.orchestrator-only/` |
| III. Zod-Validated YAML | ✅ PASS | New schemas (RoleSchema, AttemptTrackerSchema) follow pattern in `src/core/types.ts` |
| IV. Structured Error Hierarchy | ✅ PASS | New RoleError extends OrchestraError; error-mapper.ts maps to MCP codes |
| V. ESM with Strict TypeScript | ✅ PASS | All contracts and designs use strict patterns |

**Gate Result**: ✅ PASS - Design phase complete

## Project Structure

### Documentation (this feature)

```text
specs/001-mcp-server/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (MCP tool schemas)
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── cli.ts                    # Existing CLI entry point
├── commands/                 # Existing CLI commands
├── core/                     # Existing core library (SHARED)
│   ├── index.ts              # Re-exports all core functions
│   ├── manifest.ts
│   ├── progress.ts
│   ├── verification.ts
│   └── ...
│
└── mcp/                      # NEW - Phase 2 MCP Server
    ├── server.ts             # MCP server entry point (STDIO transport)
    ├── index.ts              # Exports for consumers
    ├── role-guard.ts         # Role enforcement middleware
    ├── error-mapper.ts       # OrchestraError → MCP error codes
    └── tools/                # Tool definitions
        ├── index.ts          # Tool registry
        ├── init.ts
        ├── status.ts
        ├── closeout.ts
        ├── prepare.ts
        ├── signal.ts         # Implementor tool
        ├── accept-signal.ts
        ├── verify.ts
        ├── complete.ts
        ├── feedback.ts
        └── escalate.ts

test/
├── mcp/                      # NEW - MCP tests
│   ├── server.test.ts        # Server lifecycle tests
│   ├── role-guard.test.ts    # Role enforcement tests
│   ├── error-mapper.test.ts  # Error mapping tests
│   └── tools/                # Tool-specific tests
│       ├── init.test.ts
│       ├── status.test.ts
│       └── ...
└── integration/              # NEW - E2E MCP workflow tests
    └── mcp-workflow.test.ts
```

**Structure Decision**: Single project extension - MCP layer added under `src/mcp/` following existing patterns. No separate package; shares `src/core/` with CLI.

## Complexity Tracking

> No constitution violations requiring justification.
