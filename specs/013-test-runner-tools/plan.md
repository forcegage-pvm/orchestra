# Implementation Plan: Intelligent Test Runner Tools

**Branch**: `013-test-runner-tools` | **Date**: 2026-02-09 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/013-test-runner-tools/spec.md`

## Summary

Replace the existing basic `run_tests` (VS Code task-based) and `get_test_failures` (diagnostics-only) agent tools with an intelligent test runner suite that provides scoped execution, TDD red-phase isolation with inverted assertions, fingerprint-based result caching, compressed token-efficient output, and test promotion workflows. The tools are Orchestra-specific, registered as `AgentTool` implementations in the extension's custom agent system, and require a config-driven tiered test directory structure.

## Technical Context

**Language/Version**: TypeScript 5.x (ESM, strict mode with `exactOptionalPropertyTypes`)  
**Primary Dependencies**: Vitest (test runner), `vscode` API (extension host), `better-sqlite3` (DB), `crypto` (fingerprinting)  
**Storage**: In-memory `Map<string, TestResultCache>` for result caching; existing `sprint_settings` DB table for per-sprint test config  
**Testing**: Vitest (root `vitest.config.ts` + extension `extension/vitest.config.ts`)  
**Target Platform**: VS Code extension (Electron host), spawning Node.js child processes for test execution  
**Project Type**: VS Code extension mono-repo with MCP server  
**Performance Goals**: <10s for scoped test runs; <100ms for cached results; ~50-100 tokens per result summary  
**Constraints**: In-memory cache only; single concurrent test run; tools exclusively available to Orchestra custom agents  
**Scale/Scope**: 235 existing test files (92 root + 136 extension + 7 testing); 3,000+ individual tests

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| #   | Principle                                    | Status | Notes                                                                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I   | Core-First Architecture                      | PASS   | New test runner logic will live in `extension/src/agents/tools/testing/` (tool layer, not `src/core/`). This is correct because these tools are VS Code extension-specific agent tools that use `vscode` APIs and child process spawning — they are not reusable across CLI/MCP layers. No core logic duplication. |
| II  | Hidden Verification (NON-NEGOTIABLE)         | PASS   | Test runner tools are available to all agent roles via `registerSystemTools()`. They do not access or expose verification criteria. No trust boundary violation.                                                                                                                                                   |
| III | Zod-Validated Configuration                  | PASS   | The test configuration file (`.agent-test-config.json`) uses JSON format, permitted for workspace-facing configs per amended constitution (v1.2.0). Validated with Zod schemas. Input schemas on tools follow the existing `ToolInputSchema` JSON Schema pattern.                                                  |
| IV  | Structured Error Hierarchy                   | PASS   | Tools use `ToolErrorCode` enum and `errorResult()` builder for consistent error output, matching existing patterns in `runCommand.ts`, `runTests.ts`.                                                                                                                                                              |
| V   | ESM with Strict TypeScript                   | PASS   | All imports use `.js` extensions. `exactOptionalPropertyTypes` applies — conditional property addition required for optional fields in result interfaces.                                                                                                                                                          |
| VI  | Extension Build & Packaging (NON-NEGOTIABLE) | PASS   | No native modules introduced. Tools spawn `vitest` as child processes. No build/packaging impact.                                                                                                                                                                                                                  |

## Project Structure

### Documentation (this feature)

```text
specs/013-test-runner-tools/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (tool interface contracts)
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
extension/src/agents/tools/
├── testing/                          # NEW: Test runner tool category
│   ├── index.ts                      # Registration: registerTestingTools(registry)
│   ├── runTests.ts                   # Core: scoped test execution (replaces system/runTests.ts)
│   ├── getTestResults.ts             # Retrieve previous results without re-running
│   ├── listTestSuites.ts             # Test suite discovery and inventory
│   ├── promoteTests.ts               # TDD red→green test promotion
│   ├── types.ts                      # Shared interfaces (RunTestsInput, RunTestsResult, etc.)
│   ├── TestResultStore.ts            # In-memory fingerprint cache (Map-based)
│   ├── VitestRunner.ts               # Vitest command builder + JSON output parser
│   ├── FingerprintComputer.ts        # SHA-256 content hashing for cache keys
│   ├── ChangeResolver.ts             # Change detection (git diff, commit range, file list)
│   ├── ScopeResolver.ts              # Maps scope+target to concrete test files
│   ├── ResultFormatter.ts            # Compressed summary generator + failure compressor
│   ├── TestConfigLoader.ts           # Reads/validates .agent-test-config.json
│   └── TestCommandInterceptor.ts     # Detection logic for blocked test commands
│
├── system/
│   ├── runTests.ts                   # EXISTING: to be deprecated (replaced by testing/runTests.ts)
│   ├── getTestFailures.ts            # EXISTING: kept as-is (diagnostics, orthogonal)
│   ├── runCommand.ts                 # MODIFIED: add test command interception hook
│   └── index.ts                      # MODIFIED: wire interception, remove old runTests export
│
└── infrastructure/
    └── ProcessManager.ts             # EXISTING: reused for background process lifecycle

extension/src/agents/
├── toolLoaders.ts                    # MODIFIED: add registerTestingTools() calls
└── ToolRegistry.ts                   # UNCHANGED

# Configuration file (workspace root)
.agent-test-config.json               # NEW: tier declarations + settings
```

**Structure Decision**: New tools live in a dedicated `testing/` category under the existing tools directory, following the same pattern as `coding/`, `filesystem/`, `system/`, and `orchestra/`. The existing basic `run_tests` in `system/` is replaced (deprecated), while `get_test_failures` (diagnostics-based) remains as it serves a different purpose. Test command interception is added as a hook in `runCommand.ts`.

## Complexity Tracking

No constitution violations to justify. All principles pass cleanly.

---

## Phase 0: Research (COMPLETE)

**Output**: [research.md](research.md)

Key findings:

- Vitest `--related` walks full transitive import graph — no custom implementation needed
- Vitest `--failed` CLI flag **does not exist** — must build own failure tracking from JSON output
- Vitest `--reporter=json --outputFile=<tmp>` provides reliable structured output
- SHA-256 fingerprinting <50ms for 200 files — trivially fast
- Existing `runCommand.ts` has `expect_failure` and test diagnostics parsing (reusable)
- Existing `runTests.ts` is VS Code task-only (262 lines) — full replacement needed

All NEEDS CLARIFICATION items resolved. See research.md for decision records.

---

## Phase 1: Design & Contracts (COMPLETE)

**Outputs**:

- [data-model.md](data-model.md) — 7 sections: config schema, tool input schemas (4 tools), output types, internal data structures, error codes, entity relationships, state transitions
- [contracts/run-tests.md](contracts/run-tests.md) — Scoped execution, caching, TDD red-phase
- [contracts/get-test-results.md](contracts/get-test-results.md) — Result retrieval, formatting, filtering
- [contracts/list-test-suites.md](contracts/list-test-suites.md) — Discovery at 3 detail levels
- [contracts/promote-tests.md](contracts/promote-tests.md) — TDD promotion with dry-run default
- [contracts/test-command-interception.md](contracts/test-command-interception.md) — Terminal blocking contract
- [quickstart.md](quickstart.md) — Implementation order, patterns, testing guide

## Constitution Re-Check (Post-Design)

| #   | Principle                                    | Status | Post-Design Notes                                                                                                                                                                                         |
| --- | -------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I   | Core-First Architecture                      | PASS   | Confirmed: all new code in `extension/src/agents/tools/testing/` — correct placement for VS Code extension-specific agent tools. No `src/core/` duplication.                                              |
| II  | Hidden Verification (NON-NEGOTIABLE)         | PASS   | Tools expose test results only (pass/fail/errors). Zero access to verification criteria, sprint configs, or hidden handover data. All 3 roles can use the tools.                                          |
| III | Zod-Validated Configuration                  | PASS   | `TestConfigSchema` uses Zod validation. Tool inputs use JSON Schema per existing `ToolInputSchema` pattern. Config file is JSON (permitted for workspace-facing tooling per amended constitution v1.2.0). |
| IV  | Structured Error Hierarchy                   | PASS   | 6 new `ToolErrorCode` values added. All errors use `errorResult()`. See data-model.md §5.                                                                                                                 |
| V   | ESM with Strict TypeScript                   | PASS   | All type definitions use `z.output<typeof Schema>`. Optional properties handled with conditional adds. `.js` extensions throughout.                                                                       |
| VI  | Extension Build & Packaging (NON-NEGOTIABLE) | PASS   | No native modules. Vitest spawned as child process. No esbuild/packaging changes needed.                                                                                                                  |

No constitution violations detected. Design is ready for Phase 2 task breakdown.
