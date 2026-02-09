<!--
Sync Impact Report
==================
Version change: 1.1.0 → 1.2.0
Modified principles:
- III. Zod-Validated Configuration (scoped YAML mandate to Orchestra internals; JSON permitted for workspace-facing configs)
Added sections: None
Removed sections: None
Templates requiring updates:
- ⚠ Pending: .github/prompts/speckit.constitution.prompt.md (if it references "Zod-Validated YAML" wording)
Follow-up TODOs: None
-->

# Orchestra Constitution

## Core Principles

### I. Core-First Architecture

Reusable business logic MUST reside in `src/core/` as stateless, testable functions.

- MCP server handlers (`src/mcp-server/handlers/`) MUST be thin and delegate to `src/core/` or `src/db/`.
- The VS Code extension (`extension/src/`) MUST keep entrypoints thin and avoid duplicating core logic when it can be shared.

**Rationale**: Orchestra is designed for three consumption layers. Centralizing logic ensures consistency and testability regardless of entry point.

### II. Hidden Verification (NON-NEGOTIABLE)

The orchestrator/implementor trust boundary MUST be structurally enforced via folder separation. Verification criteria in `.orchestra/orchestrator/.orchestrator-only/` are NEVER accessible to implementor agents. Implementors ONLY read from `.orchestra/implementor/handovers/` and write to `.orchestra/implementor/signals/`.

**Rationale**: This is Orchestra's core security model. If implementors can read verification criteria, they can game acceptance tests—defeating the entire purpose.

### III. Zod-Validated Configuration

Orchestra internal configuration and data files (manifests, sprint configs, YAML data) MUST use YAML format with Zod schema validation via `readYaml(path, Schema)`. Workspace-facing configuration files consumed by VS Code tooling (e.g., `.agent-test-config.json`) MAY use JSON format when it aligns with ecosystem conventions, but MUST still be validated with Zod schemas. Types MUST be inferred using `z.output<typeof Schema>` (not `z.infer`) to properly handle defaults. Schemas live in `src/core/types.ts` or co-located with their consuming module.

**Rationale**: Runtime validation catches malformed configuration early. YAML is preferred for Orchestra internals; JSON is acceptable for workspace-facing tooling configs where VS Code ecosystem conventions (e.g., `tsconfig.json`, `.vscode/settings.json`) make JSON the natural format. `z.output` is required because `exactOptionalPropertyTypes` is enabled and defaults must be reflected in types.

### IV. Structured Error Hierarchy

All errors MUST extend `OrchestraError` with a `code` string and optional `context` object. Use specific subclasses: `FileError`, `ValidationError`, `ConfigurationError`, `ManifestError`, `TaskError`, `GitError`. All errors implement `toJSON()` for consistent CLI output.

**Rationale**: Error codes enable programmatic handling by consumers. Context objects provide debugging information without cluttering messages.

### V. ESM with Strict TypeScript

All imports MUST use `.js` extensions even for `.ts` files. The `exactOptionalPropertyTypes: true` setting is enabled—NEVER assign `undefined` to optional properties; use conditional property addition instead. Unused variables MUST be prefixed with `_`.

**Rationale**: ESM requires explicit extensions. Strict optional properties prevent subtle bugs where `undefined` differs from "property not present".

### VI. Extension Build & Packaging Discipline (NON-NEGOTIABLE)

The VS Code extension build and packaging process MUST follow `extension/build.md`.

- The extension uses `better-sqlite3` (native module) and MUST be compiled for **Electron** (VS Code) when building the extension.
- The bundled MCP server runs on **Node.js** and MUST include a Node.js-compiled native module in the bundle output.
- Any task that produces a VSIX MUST validate that packaged native binaries match the target runtime to prevent `NODE_MODULE_VERSION` mismatches.

**Rationale**: A “successful build” that crashes at runtime is equivalent to a failed build. Native module targets must be correct.

## Trust Architecture

The folder structure enforces information asymmetry:

| Path                                          | Orchestrator  | Implementor  |
| --------------------------------------------- | ------------- | ------------ |
| `.orchestra/orchestrator/.orchestrator-only/` | ✅ Read/Write | ❌ FORBIDDEN |
| `.orchestra/orchestrator/verification/`       | ✅ Read/Write | ❌ FORBIDDEN |
| `manifest.yaml` (verification fields)         | ✅ Read/Write | ❌ FORBIDDEN |
| `.orchestra/implementor/handovers/`           | ✅ Write      | ✅ Read      |
| `.orchestra/implementor/signals/`             | ✅ Read       | ✅ Write     |

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

**Version**: 1.2.0 | **Ratified**: 2025-12-04 | **Last Amended**: 2026-02-09
