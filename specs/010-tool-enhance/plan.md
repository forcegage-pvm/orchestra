# Implementation Plan: Enhanced Agent Tools

**Branch**: `010-tool-enhance` | **Date**: 2026-01-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/010-tool-enhance/spec.md`

## Summary

This feature implements 18 enhanced tools for AI coding agents across three categories:

- **Terminal Tools (9)**: Background process management with ready-detection, output capture with fallback, process supervision
- **File Editing Tools (6)**: Fuzzy matching with Levenshtein distance, line-based editing, pre-flight validation, text-based bulk replace
- **File Operations (3)**: Basic move/copy operations without import updates

Technical approach from research: ProcessManager singleton for process lifecycle, OutputBuffer ring buffer with head/tail truncation, FuzzyMatcher with match cascade (exact → whitespace-normalized → fuzzy).

## Technical Context

**Language/Version**: TypeScript 5.x (ES2022 target, ESM modules)  
**Primary Dependencies**: VS Code Extension API (^1.95.0), child_process (Node.js), vitest  
**Storage**: N/A (stateless tools, in-memory process tracking only)  
**Testing**: vitest with VS Code API mocks (`extension/test/__mocks__/vscode.ts`)  
**Target Platform**: VS Code Extension (cross-platform: Windows, macOS, Linux)  
**Project Type**: VS Code Extension (extension/ directory)  
**Performance Goals**: `start_process` returns <100ms, fuzzy match <100ms for 10k lines, output buffer cap 10MB  
**Constraints**: ProcessManager cleanup on extension deactivation, path traversal protection required  
**Scale/Scope**: 18 tools, 76 implementation tasks (~9 days estimated)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status  | Notes                                                                                                                                                   |
| ------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Core-First Architecture      | ✅ PASS | Tools live in `extension/src/agents/tools/` - extension-specific, not reusable across MCP/CLI. ProcessManager is extension-only (VS Code Terminal API). |
| II. Hidden Verification         | ✅ N/A  | No orchestrator/implementor trust boundary involved.                                                                                                    |
| III. Zod-Validated YAML         | ✅ N/A  | No YAML files in this feature.                                                                                                                          |
| IV. Structured Error Hierarchy  | ✅ PASS | Will use existing `ToolError` from types.ts.                                                                                                            |
| V. ESM with Strict TypeScript   | ✅ PASS | All imports use `.js` extensions, `exactOptionalPropertyTypes` respected.                                                                               |
| VI. Extension Build & Packaging | ✅ N/A  | No native modules added. Tools use VS Code/Node.js APIs only.                                                                                           |

**Gate Result**: ✅ PASS - No violations. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/010-tool-enhance/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (extension/)

```text
extension/src/agents/tools/
├── infrastructure/              # NEW: Shared infrastructure
│   ├── index.ts                 # Barrel export
│   ├── ProcessManager.ts        # Process lifecycle management
│   ├── OutputBuffer.ts          # Ring buffer with truncation
│   └── FuzzyMatcher.ts          # Match cascade engine
├── system/                      # Terminal tools (existing + new)
│   ├── index.ts                 # Barrel export (update)
│   ├── runCommand.ts            # NEW: Enhanced run_command
│   ├── startProcess.ts          # NEW: Background process start
│   ├── stopProcess.ts           # NEW: Graceful termination
│   ├── getProcessOutput.ts      # NEW: Incremental output
│   ├── listProcesses.ts         # NEW: Process inventory
│   ├── sendInput.ts             # NEW: stdin to process
│   ├── waitForPattern.ts        # NEW: Pattern wait
│   ├── findPortProcess.ts       # NEW: Port usage check
│   └── executeWithRetry.ts      # NEW: Auto-retry wrapper
├── coding/                      # File editing tools (existing + new)
│   ├── index.ts                 # Barrel export (update)
│   ├── smartReplace.ts          # NEW: Fuzzy replace
│   ├── editLines.ts             # NEW: Line-range editing
│   ├── insertAtLine.ts          # NEW: Line insertion
│   ├── deleteSection.ts         # NEW: Section removal
│   ├── validateEdit.ts          # NEW: Pre-flight validation
│   └── bulkReplace.ts           # NEW: Multi-file text replace
└── filesystem/                  # NEW: File operations
    ├── index.ts                 # Barrel export
    ├── moveFile.ts              # Basic file move
    ├── copyFile.ts              # File copy
    └── moveDirectory.ts         # Directory move

extension/test/agents/tools/
├── infrastructure/              # NEW: Infrastructure tests
│   ├── ProcessManager.test.ts
│   ├── OutputBuffer.test.ts
│   └── FuzzyMatcher.test.ts
├── system/                      # Terminal tool tests
│   ├── runCommand.test.ts
│   ├── startProcess.test.ts
│   ├── getProcessOutput.test.ts
│   └── ...
├── coding/                      # File editing tool tests
│   ├── smartReplace.test.ts
│   ├── editLines.test.ts
│   └── ...
└── filesystem/                  # File operation tests
    ├── moveFile.test.ts
    ├── copyFile.test.ts
    └── moveDirectory.test.ts
```

**Structure Decision**: VS Code Extension structure. All new tools go in `extension/src/agents/tools/` subdirectories. Infrastructure components (ProcessManager, OutputBuffer, FuzzyMatcher) are shared within the extension but NOT exposed to `src/core/` as they depend on VS Code APIs.

## Complexity Tracking

> No Constitution violations requiring justification.

---

## Phase 0 Complete ✅

**research.md** created with:

- Terminal tools research (9 tools) from production tool analysis
- File manipulation research (6 tools) with fuzzy matching patterns
- File operations research (3 tools)
- Priority ranking (P1/P2/P3)
- Out-of-scope documentation (LSP/ast-grep dependencies)

## Phase 1 Complete ✅

**data-model.md** created with:

- ProcessStatus enum and ProcessInfo interface
- All terminal tool input/output interfaces
- FuzzyMatcher types and MatchResult
- File editing tool interfaces with DD-001 noted
- File operations interfaces

**contracts/** created with:

- `terminal-tools.ts` - 9 terminal tool contracts
- `file-editing-tools.ts` - 6 file editing tool contracts
- `file-operations.ts` - 3 file operation tool contracts

**quickstart.md** created with:

- Prerequisites and setup
- Implementation order by phase
- Testing strategy
- Key interfaces summary
- Success criteria checklist

**Agent context updated** via `update-agent-context.ps1 -AgentType copilot`

## Constitution Re-Check (Post-Design) ✅

| Principle                       | Status  | Notes                                                                                      |
| ------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| I. Core-First Architecture      | ✅ PASS | Tools are extension-only (VS Code API dependent). ProcessManager uses vscode.Terminal API. |
| II. Hidden Verification         | ✅ N/A  | Not applicable to this feature.                                                            |
| III. Zod-Validated YAML         | ✅ N/A  | No YAML files.                                                                             |
| IV. Structured Error Hierarchy  | ✅ PASS | ToolError used per contracts.                                                              |
| V. ESM with Strict TypeScript   | ✅ PASS | All .js imports, strict types.                                                             |
| VI. Extension Build & Packaging | ✅ N/A  | No native modules.                                                                         |

**Gate Result**: ✅ PASS - Ready for /speckit.tasks

---

## Next Steps

Run `/speckit.tasks` to generate the detailed task breakdown from this plan.

The base spec at `specs/_base/010-tools-enhance/tasks.md` contains a 21-task breakdown (~48 hours) that can be used as reference.
