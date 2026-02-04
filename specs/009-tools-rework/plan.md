# Implementation Plan: Agent Tools Rework

**Branch**: `009-tools-rework` | **Date**: 2026-01-29 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/009-tools-rework/spec.md`

## Summary

Replace all current agent tool implementations in `extension/src/agents/tools/` with VS Code API-native implementations. Key changes:

- **Standardized ToolResult** type with `success`, `content[]`, `error?`, and `metadata`
- **WorkspaceEdit** for all file mutations (atomic, undo-able)
- **Shell integration** for terminal output capture with fallback
- **Structured ToolError** with code, message, suggestion for every failure
- **CancellationToken** support and configurable timeouts (30s file ops, 240s terminal)
- **Path traversal protection** for all file tools
- **Full replacement** - no backward compatibility layer; AgentRunner updated directly

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode, exactOptionalPropertyTypes)  
**Primary Dependencies**: VS Code API (workspace.fs, WorkspaceEdit, Terminal.shellIntegration, tasks, languages.getDiagnostics), Zod  
**Storage**: N/A (tools operate on workspace files)  
**Testing**: Vitest (extension/vitest.config.ts)  
**Target Platform**: VS Code 1.93+ (Windows primary, cross-platform)  
**Project Type**: VS Code Extension  
**Performance Goals**: File ops <30s timeout, terminal ops <240s timeout  
**Constraints**: Must use WorkspaceEdit for undo support; must validate paths within workspace  
**Scale/Scope**: 14 tools total (9 coding + 5 system)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                           | Status  | Notes                                                                     |
| ----------------------------------- | ------- | ------------------------------------------------------------------------- |
| **I. Core-First Architecture**      | ✅ PASS | Tools are extension-only; no shared core needed for VS Code-specific APIs |
| **II. Hidden Verification**         | ✅ N/A  | Tools don't access verification criteria                                  |
| **III. Zod-Validated YAML**         | ✅ PASS | Tool inputs use Zod schemas (existing pattern in ToolResultSchema)        |
| **IV. Structured Error Hierarchy**  | ✅ PASS | ToolError with code/message/suggestion extends this principle             |
| **V. ESM with Strict TypeScript**   | ✅ PASS | All imports use .js extensions; follows existing patterns                 |
| **VI. Extension Build & Packaging** | ✅ N/A  | No native modules; pure TypeScript tools                                  |

**No violations requiring justification.**

## Project Structure

### Documentation (this feature)

```text
specs/009-tools-rework/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (extension-specific)

```text
extension/src/agents/
├── types.ts                    # UPDATE: New ToolResult, ToolError, ToolErrorCode types
├── ToolRegistry.ts             # UPDATE: New execute() returning updated ToolExecutionResult
├── AgentRunner.ts              # UPDATE: Consume new ToolResult interface directly
└── tools/
    ├── types.ts                # NEW: AgentTool interface, ToolInvocationContext
    ├── errors.ts               # NEW: ToolErrorCode enum, error factory functions
    ├── utils/
    │   ├── pathValidation.ts   # NEW: validateWorkspacePath(), isWithinWorkspace()
    │   └── resultBuilder.ts    # NEW: successResult(), errorResult() helpers
    ├── coding/
    │   ├── index.ts            # UPDATE: Export all coding tools
    │   ├── readFile.ts         # REPLACE: New implementation
    │   ├── editFile.ts         # REPLACE: New implementation (was edit.ts)
    │   ├── createFile.ts       # REPLACE: New implementation (was newFile.ts)
    │   ├── deleteFile.ts       # REPLACE: New implementation
    │   ├── listDirectory.ts    # REPLACE: New implementation
    │   ├── searchFiles.ts      # REPLACE: New implementation (was search.ts)
    │   ├── grepSearch.ts       # REPLACE: New implementation
    │   ├── findUsages.ts       # REPLACE: New implementation (was usages.ts)
    │   └── createDirectory.ts  # NEW: Create directory tool
    ├── system/
    │   ├── index.ts            # UPDATE: Export all system tools
    │   ├── runTerminal.ts      # REPLACE: New implementation (was runCommands.ts)
    │   ├── runTask.ts          # REPLACE: New implementation (was runTasks.ts)
    │   ├── getProblems.ts      # REPLACE: New implementation (was problems.ts)
    │   ├── runTests.ts         # REPLACE: New implementation
    │   └── getTerminalOutput.ts # NEW: Get terminal output tool
    └── orchestra/
        ├── index.ts            # UPDATE: MCP adapter with new error handling
        └── mcpAdapter.ts       # UPDATE: Wrap MCP errors as ToolError

extension/test/agents/tools/
├── coding/
│   ├── readFile.test.ts
│   ├── editFile.test.ts
│   ├── createFile.test.ts
│   └── ... (one per tool)
└── system/
    ├── runTerminal.test.ts
    └── ... (one per tool)
```

**Structure Decision**: Extension-only VS Code API tools. Follow existing `extension/src/agents/tools/` structure with category folders. Add `utils/` for shared helpers.

## Complexity Tracking

> No Constitution violations requiring justification.

## Post-Design Constitution Re-Check

| Principle                           | Status  | Notes                                                    |
| ----------------------------------- | ------- | -------------------------------------------------------- |
| **I. Core-First Architecture**      | ✅ PASS | Confirmed: Tools use VS Code APIs not suitable for core/ |
| **II. Hidden Verification**         | ✅ N/A  | Confirmed: Tools have no access to verification data     |
| **III. Zod-Validated YAML**         | ✅ PASS | Confirmed: ToolErrorCode, ToolResult schemas defined     |
| **IV. Structured Error Hierarchy**  | ✅ PASS | Confirmed: ToolError with code/message/suggestion        |
| **V. ESM with Strict TypeScript**   | ✅ PASS | Confirmed: All .js imports, z.output types               |
| **VI. Extension Build & Packaging** | ✅ N/A  | Confirmed: No native modules                             |

**All gates PASS. Ready for Phase 2 task breakdown.**

## Phase Outputs Summary

| Phase   | Artifact                       | Status      |
| ------- | ------------------------------ | ----------- |
| Phase 0 | [research.md](research.md)     | ✅ Complete |
| Phase 1 | [data-model.md](data-model.md) | ✅ Complete |
| Phase 1 | [contracts/](contracts/)       | ✅ Complete |
| Phase 1 | [quickstart.md](quickstart.md) | ✅ Complete |
| Phase 2 | [tasks.md](tasks.md)           | ✅ Complete |
