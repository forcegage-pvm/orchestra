<!--
Sync Impact Report
==================
Version change: N/A → 1.0.0
Modified principles: N/A (initial creation)
Added sections: Core Principles (5), Trust Architecture, Development Standards, Governance
Removed sections: N/A
Templates requiring updates: ✅ N/A (initial constitution)
Follow-up TODOs: None
-->

# Orchestra CLI Constitution

## Core Principles

### I. Core-First Architecture
All business logic MUST reside in `src/core/` as stateless, testable functions. Commands in `src/commands/` are thin wrappers that parse options and delegate to `run*` functions. This enables reuse across CLI (Phase 1), MCP Server (Phase 2), and VS Code Extension (Phase 3). No feature logic in command files.

**Rationale**: Orchestra is designed for three consumption layers. Centralizing logic ensures consistency and testability regardless of entry point.

### II. Hidden Verification (NON-NEGOTIABLE)
The orchestrator/implementor trust boundary MUST be structurally enforced via folder separation. Verification criteria in `.orchestra/orchestrator/.orchestrator-only/` are NEVER accessible to implementor agents. Implementors ONLY read from `.orchestra/implementor/handovers/` and write to `.orchestra/implementor/signals/`.

**Rationale**: This is Orchestra's core security model. If implementors can read verification criteria, they can game acceptance tests—defeating the entire purpose.

### III. Zod-Validated YAML
All configuration and data files use YAML format with Zod schema validation via `readYaml(path, Schema)`. Types MUST be inferred using `z.output<typeof Schema>` (not `z.infer`) to properly handle defaults. Schemas live in `src/core/types.ts`.

**Rationale**: Runtime validation catches malformed manifests early. `z.output` is required because `exactOptionalPropertyTypes` is enabled and defaults must be reflected in types.

### IV. Structured Error Hierarchy
All errors MUST extend `OrchestraError` with a `code` string and optional `context` object. Use specific subclasses: `FileError`, `ValidationError`, `ConfigurationError`, `ManifestError`, `TaskError`, `GitError`. All errors implement `toJSON()` for consistent CLI output.

**Rationale**: Error codes enable programmatic handling by consumers. Context objects provide debugging information without cluttering messages.

### V. ESM with Strict TypeScript
All imports MUST use `.js` extensions even for `.ts` files. The `exactOptionalPropertyTypes: true` setting is enabled—NEVER assign `undefined` to optional properties; use conditional property addition instead. Unused variables MUST be prefixed with `_`.

**Rationale**: ESM requires explicit extensions. Strict optional properties prevent subtle bugs where `undefined` differs from "property not present".

## Trust Architecture

The folder structure enforces information asymmetry:

| Path | Orchestrator | Implementor |
|------|--------------|-------------|
| `.orchestra/orchestrator/.orchestrator-only/` | ✅ Read/Write | ❌ FORBIDDEN |
| `.orchestra/orchestrator/verification/` | ✅ Read/Write | ❌ FORBIDDEN |
| `manifest.yaml` (verification fields) | ✅ Read/Write | ❌ FORBIDDEN |
| `.orchestra/implementor/handovers/` | ✅ Write | ✅ Read |
| `.orchestra/implementor/signals/` | ✅ Read | ✅ Write |

Violation of this boundary constitutes a critical security breach.

## Development Standards

### Testing
- Tests mirror source structure: `src/core/*.ts` → `test/core/*.test.ts`
- Use temp directories: `fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-'))`
- Mock `console` and `process.exit` for command tests
- Factory functions create mock manifests for test fixtures

### Adding Commands
1. Create `src/commands/{name}.ts` with `create{Name}Command()` factory
2. Create `src/core/{name}.ts` with `run{Name}()` function
3. Export from `src/core/index.ts`
4. Register in `src/cli.ts` via `program.addCommand()`
5. Add tests in `test/commands/{name}.test.ts`

### Templates
- Handlebars templates (`.hbs`) in `.orchestra/common/templates/`
- Render via `renderTemplate(name, context)` from core
- Context includes: `task`, `sprint`, `config`, `dependencies`

## Governance

This constitution is the authoritative source for Orchestra development practices. The Orchestra Bible (`docs/orchestra-bible.md` v0.7.0) is the authoritative source for domain concepts and workflows.

- All changes MUST comply with these principles
- Amendments require: documented rationale, version bump, migration plan if breaking
- Version follows semver: MAJOR (breaking governance), MINOR (new principles), PATCH (clarifications)
- Runtime guidance in `.github/copilot-instructions.md` supplements but does not override this constitution

**Version**: 1.0.0 | **Ratified**: 2025-12-04 | **Last Amended**: 2025-12-04
