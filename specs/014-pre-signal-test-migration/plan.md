# Implementation Plan: Pre-Signal Test Verification Migration

**Branch**: `014-pre-signal-test-migration` | **Date**: 2026-02-13 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/014-pre-signal-test-migration/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Migrate Orchestra's pre-signal test verification from direct shell command execution (`npm test -- --testNamePattern`) to using the extension test runner tools (`run_tests`). This unifies test execution across agent workflows and pre-signal verification, introduces declarative `test_verification` criteria format, and enforces directory-based TDD (`test/red/`) instead of `[tdd-red]` tags.

## Technical Context

**Language/Version**: TypeScript 5.x (ES2022 target, ESM modules)  
**Primary Dependencies**: VS Code Extension APIs, MCP Protocol, Vitest, better-sqlite3  
**Storage**: SQLite (via better-sqlite3) - `tdd_red_registry`, `tdd_task_relationships` tables  
**Testing**: Vitest with tiered organization (smoke, unit, integration, red)  
**Target Platform**: VS Code Extension (Electron) + MCP Server (Node.js)
**Project Type**: Monorepo (MCP server in `src/`, extension in `extension/`)
**Performance Goals**: Pre-signal verification under 30s for typical test suites  
**Constraints**: Must not break existing workflows; graceful fallback if config missing  
**Scale/Scope**: Internal Orchestra feature, used by orchestrator/implementor agents

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                                    | Status  | Notes                                                                                                   |
| -------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| **I. Core-First Architecture**               | ✅ PASS | Pre-signal executor logic stays in `src/core/`; MCP handlers remain thin wrappers                       |
| **II. Hidden Verification (NON-NEGOTIABLE)** | ✅ PASS | Verification criteria remain in orchestrator-only paths; implementors only see handovers                |
| **III. Zod-Validated Configuration**         | ✅ PASS | New `test_verification` schema will use Zod validation; `.agent-test-config.json` already Zod-validated |
| **IV. Structured Error Hierarchy**           | ✅ PASS | Will use existing `ValidationError` for schema rejections, `TaskError` for verification failures        |
| **V. ESM with Strict TypeScript**            | ✅ PASS | All imports use `.js` extensions; `exactOptionalPropertyTypes` compliance maintained                    |
| **VI. Extension Build & Packaging**          | ✅ PASS | No changes to native modules or build process; shared code import pattern follows existing practices    |

**Gate Result**: ✅ PASSED - No violations requiring justification

## Project Structure

### Documentation (this feature)

```text
specs/014-pre-signal-test-migration/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── core/
│   ├── pre-signal-executor.ts    # MODIFY: Use run_tests instead of shell commands
│   ├── tdd-marker-scanner.ts     # MODIFY: Path-based detection, remove tag scanning
│   ├── tdd-scan-on-signal.ts     # MODIFY: Directory listing for registry population
│   ├── tdd-cleanup.ts            # MODIFY: File move instead of content edit
│   ├── tdd-validation.ts         # MODIFY: Path-based validation
│   ├── tdd-exclusion-resolver.ts # MODIFY: Directory exclusion
│   └── pattern-validator.ts      # MODIFY: Add test command rejection patterns
├── schemas/
│   └── verification.ts           # CREATE: test_verification Zod schema
├── mcp-server/handlers/
│   ├── prepare-task.ts           # MODIFY: Reject test commands in behavioral_checks
│   ├── verify-task.ts            # MODIFY: Call run_tests for test_verification blocks
│   ├── get-current-task.ts       # MODIFY: Directory-based TDD instructions
│   └── signal-completion.ts      # MODIFY: Use new pre-signal executor

extension/
├── agents/
│   ├── orchestra.orchestrator.agent.md  # MODIFY: Remove [tdd-red] tag references
│   └── orchestra.implementor.agent.md   # MODIFY: Remove [tdd-red] tag references
└── src/agents/tools/testing/
    └── [existing run_tests, promote_tests] # No changes - already directory-based

test/
├── unit/
│   ├── core/pre-signal-executor.test.ts    # MODIFY: Test tool-based verification
│   ├── core/tdd-marker-scanner.test.ts     # MODIFY: Test path-based detection
│   └── mcp-server/handlers/*.test.ts       # MODIFY: Test new validation
└── integration/
    └── pre-signal-verification.test.ts     # CREATE: End-to-end verification flow
```

**Structure Decision**: Monorepo with MCP server (`src/`) and VS Code extension (`extension/`). This feature modifies existing files across both areas with minimal new file creation (only `verification.ts` schema and integration test).

## Complexity Tracking

> No constitution violations requiring justification. All changes align with existing patterns.

## Phase 0: Research (COMPLETED)

**Output**: [research.md](research.md)

### Key Decisions

| Decision                  | Choice                                                | Rationale                                            |
| ------------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| Shell command replacement | `run_tests` tool with `scope` parameter               | Single interface, tier-aware, already handles Vitest |
| TDD detection             | Directory-based (`test/red/`)                         | O(1) vs O(n×m), framework-agnostic                   |
| Test runner integration   | Extract core pipeline for shared use                  | Single source of truth for extension tools and MCP   |
| Tier configuration        | Extend `.agent-test-config.json` with `inverted` flag | Explicit, already implemented                        |
| Verification format       | Declarative `test_verification` schema                | Type-safe, auditable, no shell execution             |
| Task ID handling          | Keep `// @orchestra-task: N`, strip on promotion      | Clean production code, preserved history             |

### Files Requiring Modification

- **Core**: `pre-signal-executor.ts`, `tdd-marker-scanner.ts`, `tdd-scan-on-signal.ts`, `tdd-cleanup.ts`
- **Schema**: `src/schemas/verification.ts` (NEW)
- **Handlers**: `prepare-task.ts`, `verify-task.ts`
- **Agent docs**: `orchestra.implementor.agent.md`, `orchestra.orchestrator.agent.md`

## Phase 1: Design & Contracts (COMPLETED)

**Outputs**:

- [data-model.md](data-model.md) - Entity definitions, relationships, validation rules
- [contracts/verification-schemas.ts](contracts/verification-schemas.ts) - Zod schemas
- [contracts/verification-contract.yaml](contracts/verification-contract.yaml) - OpenAPI spec
- [quickstart.md](quickstart.md) - Developer implementation guide

### Data Model Summary

| Entity                     | Purpose                       | Key Fields                                                  |
| -------------------------- | ----------------------------- | ----------------------------------------------------------- |
| `TestVerificationCriteria` | Declarative verification spec | `tier`, `expect`, `min_pass_count`                          |
| `TestTier`                 | Tier configuration            | `name`, `path`, `timeout`, `inverted`                       |
| `TddRedFile`               | Red-phase tracking            | `path`, `targetTier`, `promotionTarget`, `taskId`, `status` |
| `TestRunResult`            | Execution outcome             | `passed`, `failed`, `total`, `redPhase`                     |
| `VerificationJudgment`     | Evaluation result             | `expectation`, `actual`, `passed`, `message`                |

### API Contracts

- **Input**: `TestVerificationCriteriaSchema` - validates handover criteria
- **Output**: `TestRunResultSchema` - test execution results
- **Rejection**: `SHELL_COMMAND_PATTERNS` - patterns that cause validation failure

---

## Next Steps

Phase 2 (Task Breakdown) is **not** executed by `/speckit.plan`. To continue:

1. Run `/speckit.tasks` to generate task breakdown in `tasks.md`
2. Use orchestrator agent to execute sprint workflow
