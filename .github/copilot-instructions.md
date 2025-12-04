# Orchestra CLI - Copilot Instructions

## Project Overview

Orchestra is a CLI tool for AI agent task orchestration that prevents "implementation theater" through **hidden verification criteria**. The core concept: orchestrator agents prepare tasks with secret verification specs that implementor agents never see, preventing gaming of acceptance criteria.

## Architecture

```
src/
├── cli.ts                 # Entry point - Commander.js CLI
├── commands/              # CLI commands (thin wrappers calling core services)
└── core/                  # Business logic - all stateless, testable functions
    ├── types.ts           # Zod schemas + inferred TypeScript types
    ├── errors.ts          # OrchestraError hierarchy (code + context pattern)
    ├── yaml.ts            # YAML I/O with Zod validation
    ├── config.ts          # Configuration loading/discovery
    ├── manifest.ts        # Task/sprint manifest operations
    ├── templates.ts       # Handlebars template rendering
    └── output.ts          # Chalk-based CLI output formatting
```

Key patterns:

- **Commands are thin**: Commands in `src/commands/` only parse options and call `run*` functions from `src/core/`
- **Core exports all**: `src/core/index.ts` re-exports everything for CLI, MCP, and Extension consumers
- **Types from Zod**: Define `z.object()` schemas, infer types via `z.output<typeof Schema>` (not `z.infer`)

## TypeScript Configuration

Strict mode with `exactOptionalPropertyTypes: true` - this means:

```typescript
// ❌ WRONG - can't assign undefined to optional properties
const opts: PrepareOptions = { task: undefined };

// ✅ CORRECT - conditionally add properties
const opts: PrepareOptions = {};
if (task !== undefined) opts.task = task;
```

All imports must use `.js` extensions (ESM):

```typescript
import { loadConfig } from "./config.js"; // ✅ Always .js even for .ts files
```

## Error Handling Pattern

Use the `OrchestraError` class hierarchy with error codes and context:

```typescript
throw new FileError("Template not found", { path: templatePath, templateName });
throw new ValidationError("Invalid manifest", errors, { path: manifestPath });
```

Errors have `toJSON()` for consistent JSON output in CLI.

## Testing Conventions

- Tests mirror source structure: `src/core/yaml.ts` → `test/core/yaml.test.ts`
- Use temp directories: `fs.mkdtempSync(path.join(os.tmpdir(), 'orchestra-'))`
- Mock console and process.exit for command tests
- Test utilities create mock manifests with factory functions

Run tests:

```bash
npm test              # Single run
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

## File Formats

- **Config/Data**: YAML with Zod schema validation (`readYaml(path, Schema)`)
- **Templates**: Handlebars (`.hbs`) in `.orchestra/common/templates/`
- **Output formats**: Both YAML and Markdown supported via `TemplateFormat` type

## Key Workflows

```bash
npm run dev -- status   # Run CLI in dev mode (tsx)
npm run build           # Compile TypeScript
npm run typecheck       # Type-check without emit
npm run lint            # ESLint
```

## Domain Concepts

- **Manifest** (`manifest.yaml`): Sprint definition with tasks, dependencies, status
- **Progress** (`progress.yaml`): Runtime state tracking
- **Handover**: Task instructions given to implementor (visible)
- **Verification criteria**: Hidden specs in `.orchestrator-only/` (never expose to implementor)
- **Signal**: Implementor's completion claim that triggers verification

## Adding a New Command

1. Create `src/commands/new-command.ts` with `createNewCommand()` factory
2. Add core logic in `src/core/new-command.ts` with `runNewCommand()` function
3. Export from `src/core/index.ts`
4. Register in `src/cli.ts` via `program.addCommand()`
5. Add tests in `test/commands/new-command.test.ts`

## Common Gotchas

- Use `z.output<T>` not `z.infer<T>` for types with defaults
- Unused variables must be prefixed with `_` (eslint rule)
- `findOrchestraRoot()` searches upward from cwd - always handle `null` return
- Template paths are relative to `.orchestra/common/templates/`

## Future Integration Points

Orchestra is designed for three consumption layers (see `spec/implementation/`):

- **Phase 1 (CLI)**: Current implementation - `src/cli.ts` + Commander.js
- **Phase 2 (MCP)**: Model Context Protocol server exposing core functions as tools
- **Phase 3 (VS Code Extension)**: UI integration with webviews and commands

All core logic lives in `src/core/` specifically to enable reuse across all three layers. When adding features, ensure they work via the core API, not just CLI.

## Orchestra Bible Reference

The authoritative spec is `docs/orchestra-bible.md` (v0.7.0). Key sections:

- **Section 4**: Role definitions (Orchestrator, Implementor, Human Supervisor)
- **Section 6**: Information architecture and folder structure
- **Section 7**: Task lifecycle (PENDING → PREPARE → IMPLEMENT → VERIFY → COMPLETE)
- **Section 8**: Script specifications
- **Section 9**: Verification model

## Template Authoring

Templates use Handlebars (`.hbs` files) in `.orchestra/common/templates/`:

```handlebars
# Task
{{task.id}}:
{{task.title}}

{{#if task.dependencies}}
  ## Dependencies
  {{#each task.dependencies}}
    - Task
    {{this}}
  {{/each}}
{{/if}}
```

Key helpers registered in `src/core/templates.ts`:

- Standard Handlebars: `#if`, `#each`, `#unless`
- Context variables: `task`, `sprint`, `config`, `dependencies`

To add a template:

1. Create `.hbs` file in `templates/common/templates/`
2. Use `renderTemplate(templateName, context)` from core

## Trust Boundary: Orchestrator vs Implementor

**CRITICAL**: The hidden verification pattern is Orchestra's core security model.

When acting as **Implementor**:

- ❌ NEVER read `.orchestra/orchestrator/.orchestrator-only/`
- ❌ NEVER read `verification/task-*.yaml` files
- ❌ NEVER read `manifest.yaml` verification criteria
- ✅ ONLY read files in `.orchestra/implementor/handovers/`
- ✅ Write signals to `.orchestra/implementor/signals/`

When acting as **Orchestrator**:

- ✅ Full access to all `.orchestra/` files
- ✅ Create verification criteria BEFORE generating handover
- ✅ Verify against hidden criteria after implementor signals

The folder structure enforces this: `orchestrator/.orchestrator-only/` contains secrets the implementor must never see.
