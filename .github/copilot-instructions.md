# Orchestra - Copilot Instructions

## Project Overview

Orchestra is primarily a **VS Code extension** (in `extension/`) that embeds/controls an **MCP server** and is evolving toward **custom autonomous coding agents** for orchestrating the SDLC.

The core concept remains: **Orchestrator** prepares tasks with hidden verification criteria; **Implementor** executes tasks without seeing verification; **Orchestrator** verifies and judges.

### Canonical Sources of Truth (read these first)

- Extension activation + MCP install/sync: `extension/src/extension.ts`
- MCP server entrypoint (role filtering, DB init/migrations): `src/mcp-server/index.ts`
- MCP tool contracts + role assignments: `src/mcp-server/tools.ts`
- Agent role prompts shipped with the extension: `extension/agents/*.agent.md`
- Extension build/VSIX packaging (CRITICAL): `extension/build.md`

## Architecture

```
src/
├── mcp-server/            # MCP server entrypoint + tool handlers (role-filtered)
├── db/                    # SQLite + migrations for MCP tools
├── core/                  # Shared business logic (stateless, testable)
└── cli.ts                 # CLI entry point (dev/ops)

extension/
└── src/                   # VS Code extension: UI, DB reactivity, MCP lifecycle, agent invocation
```

Key patterns:

- **Core-first** (when applicable): Keep reusable logic in `src/core/` and keep extension entrypoints thin.
- **Role separation is structural**: MCP tools are filtered by `--role=orchestrator|implementor`.
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

- **Sprint/Tasks**: Stored in SQLite and accessed via MCP tools.
- **Handover**: What implementor sees via `get_current_task`.
- **Verification criteria**: Stored server-side and only accessible to orchestrator-role tools.
- **Signal**: Implementor's completion claim via `signal_completion`.

## Adding/Changing Tooling

When adding a new capability, decide which surface it belongs to:

- **MCP tool**: add handler in `src/mcp-server/handlers/` and register it in `src/mcp-server/tools.ts` with the correct role.
- **Extension UI/command**: implement under `extension/src/` and keep it thin (call into MCP/tools/core).
- **Shared logic**: put stateless functions under `src/core/`.

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

- ❌ NEVER access verification criteria or sprint-wide task lists
- ✅ Treat `get_current_task` as the complete specification
- ✅ Use only implementor-role tools (`orchestra-imp/*`)

When acting as **Orchestrator**:

- ✅ Full access to all `.orchestra/` files
- ✅ Create verification criteria BEFORE generating handover
- ✅ Verify against hidden criteria after implementor signals

Role separation is enforced by the MCP server (`--role=orchestrator|implementor`) and tool filtering in `src/mcp-server/tools.ts`.

## Extension Build (Deployment)

If a task involves packaging/deploying the VS Code extension (VSIX) or native module issues, use `extension/build.md` as the authoritative guide. The `better-sqlite3` native module must be built for both Electron (extension) and Node.js (MCP server bundle).
