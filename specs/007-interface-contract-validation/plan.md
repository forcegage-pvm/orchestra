# Implementation Plan: Interface Contract Validation

**Branch**: `007-interface-contract-validation` | **Date**: 2026-01-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-interface-contract-validation/spec.md`

## Summary

Implement a defense-in-depth interface contract validation system that prevents syntactically valid but semantically invalid interface definitions from shipping to production. The solution provides:

1. A generic validation mechanism configured via project-level config file
2. MCP tool JSON Schema validation as the reference implementation
3. Agent instruction updates for Orchestrator and Controller roles
4. Build-time and test-time validation enforcement

## Technical Context

**Language/Version**: TypeScript 5.x (ESM)  
**Primary Dependencies**: Zod (schema validation), AJV (JSON Schema validation), Vitest (testing)  
**Storage**: Project config file (`.orchestra/interface-validations.yaml` or similar)  
**Testing**: Vitest (`npm test`)  
**Target Platform**: Node.js 18+, VS Code Extension  
**Project Type**: Single (MCP server + VS Code extension)  
**Performance Goals**: Validation runs in <10 seconds as part of normal test run  
**Constraints**: Additive enhancement only - no changes to existing Orchestra workflow  
**Scale/Scope**: Initial scope: MCP tool JSON Schema validation; extensible to any interface type

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                       | Status  | Notes                                                   |
| ------------------------------- | ------- | ------------------------------------------------------- |
| I. Core-First Architecture      | ✅ PASS | Validation logic goes in `src/core/`, handlers are thin |
| II. Hidden Verification         | ✅ N/A  | This feature doesn't affect trust boundary              |
| III. Zod-Validated YAML         | ✅ PASS | Config file will use Zod schema validation              |
| IV. Structured Error Hierarchy  | ✅ PASS | Will use/extend `ValidationError` from error hierarchy  |
| V. ESM with Strict TypeScript   | ✅ PASS | `.js` extensions, no undefined assignment               |
| VI. Extension Build & Packaging | ✅ PASS | No changes to native module handling                    |

**Gate Result**: PASS - Proceed to Phase 0

## Project Structure

### Documentation (this feature)

```text
specs/007-interface-contract-validation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── core/
│   └── interface-validation.ts      # Core validation logic (FR-001, FR-002)
├── schemas/
│   └── interface-validation.ts      # Config schema (Zod)
└── mcp-server/
    └── handlers/
        └── add-interface-validation.ts  # Mid-sprint validation registration (FR-012)

test/
├── core/
│   └── interface-validation.test.ts  # Unit tests for validation logic
└── mcp-server/
    └── tool-schema-validation.test.ts  # Reference implementation (FR-009)

.orchestra/
└── interface-validations.yaml        # Project config file (FR-010)

.github/agents/
├── orchestra.orchestrator.agent.md   # Updated with FR-004, FR-005 (CANONICAL SOURCE)
└── orchestra.controller.agent.md     # Updated with FR-006, FR-007 (CANONICAL SOURCE)

extension/agents/
├── orchestra.orchestrator.agent.md   # Mirror of .github/agents/ (synced at end of implementation)
└── orchestra.controller.agent.md     # Mirror of .github/agents/ (synced at end of implementation)
```

**Agent File Convention**: `.github/agents/` is the canonical source for agent instructions. `extension/agents/` contains mirrored copies that are synced as a final step. All edits are made to `.github/agents/` first.

**Structure Decision**: Single project structure following existing Orchestra patterns. New files added to existing directories.

## Complexity Tracking

No constitution violations. Standard extension of existing patterns.

## Post-Design Constitution Re-Check

_GATE: Verify design still complies after Phase 1 artifacts created._

| Principle                       | Status  | Notes                                                         |
| ------------------------------- | ------- | ------------------------------------------------------------- |
| I. Core-First Architecture      | ✅ PASS | `interface-validation.ts` in `src/core/`; MCP handler is thin |
| II. Hidden Verification         | ✅ N/A  | No changes to trust boundary                                  |
| III. Zod-Validated YAML         | ✅ PASS | Config uses `InterfaceValidationConfigSchema` (Zod)           |
| IV. Structured Error Hierarchy  | ✅ PASS | Uses `ConfigurationError`, `ValidationError`                  |
| V. ESM with Strict TypeScript   | ✅ PASS | All imports use `.js`, types use `z.output<>`                 |
| VI. Extension Build & Packaging | ✅ PASS | No native module changes                                      |

**Gate Result**: PASS - Ready for Phase 2 (/speckit.tasks)

## Phase 0 & 1 Artifacts

| Artifact           | Status      | Path                                                          |
| ------------------ | ----------- | ------------------------------------------------------------- |
| Research           | ✅ Complete | [research.md](./research.md)                                  |
| Data Model         | ✅ Complete | [data-model.md](./data-model.md)                              |
| API Contracts      | ✅ Complete | [contracts/api.md](./contracts/api.md)                        |
| Quickstart         | ✅ Complete | [quickstart.md](./quickstart.md)                              |
| Agent Instructions | ✅ Complete | `.github/agents/orchestra.{orchestrator,controller}.agent.md` |

## Next Steps

Run `/speckit.tasks` to generate implementation tasks from this plan.
