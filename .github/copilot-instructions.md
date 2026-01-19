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
- **Controller (Sprint 004)**: Specification auditor role that reviews orchestrator work for spec alignment.
- **Spec Reviews**: Controller approval/rejection records stored in `spec_reviews` table.
- **Amendments**: Tracking of specification changes after initial configuration in `amendments` table.

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

## Trust Boundary: Orchestrator vs Implementor vs Controller

**CRITICAL**: The hidden verification pattern is Orchestra's core security model.

When acting as **Implementor**:

- ❌ NEVER access verification criteria or sprint-wide task lists
- ✅ Treat `get_current_task` as the complete specification
- ✅ Use only implementor-role tools (`orchestra-imp/*`)

When acting as **Orchestrator**:

- ✅ Full access to all `.orchestra/` files
- ✅ Create verification criteria BEFORE generating handover
- ✅ Verify against hidden criteria after implementor signals
- ⚠️ Subject to Controller review gates (Sprint 004)

When acting as **Controller** (Sprint 004):

- ✅ Reviews sprint configurations for spec coverage
- ✅ Reviews task handovers for spec faithfulness
- ✅ Can approve or reject with detailed feedback
- ✅ Uses `orchestra-ctrl/*` tools for review workflow
- ❌ Cannot prepare tasks or run verifications (not an orchestrator)

Role separation is enforced by the MCP server (`--role=orchestrator|implementor|controller`) and tool filtering in `src/mcp-server/tools.ts`.

## Sprint 004: Controller Agent Feature

The Controller Agent adds mandatory review gates to prevent specification drift:

### Review Gates

1. **Sprint Gate**: After `configure_sprint` → Sprint enters `PENDING_SPEC_REVIEW`
   - Orchestrator blocked from preparing tasks
   - Controller reviews task breakdown vs specification
   - Approves or rejects with issues/recommendations
2. **Handover Gate**: After `prepare_task` → Task enters `PENDING_HANDOVER_REVIEW`
   - Task blocked from entering IMPLEMENT phase
   - Controller reviews handover vs specification
   - Approves or rejects with alignment issues

### Key Database Tables

- `spec_reviews`: All review decisions (SPRINT/HANDOVER type) with issues, recommendations, revision counts
- `amendments`: Audit trail of specification changes after initial configuration
- `sprint_settings`: Sprint-specific configuration (test_command, test_file_pattern, source_base_dir)
- Sprint/Task status fields: `PENDING_SPEC_REVIEW`, `SPEC_REVIEW_FAILED`, `PENDING_HANDOVER_REVIEW`, `HANDOVER_REVIEW_FAILED`

### Required Environment Configuration

Every sprint MUST specify its testing environment via the `environment` field in `configure_sprint`:

```json
{
  "sprint": { "id": "sprint-001", "name": "Feature Sprint" },
  "environment": {
    "test_command": "npm test",
    "test_file_pattern": "test/**/*.test.ts",
    "source_base_dir": "src"
  },
  "phases": [...],
  "tasks": [...]
}
```

This eliminates guessing about test frameworks and ensures TDD verification checks use explicit, correct values.

### UI Integration

Extension UI (`extension/src/views/`) shows:

- Sprint status indicators in tree view (clock icon for pending, warning for failed)
- Review banners in Current Task view with issues/recommendations
- Amendments history display
- "Launch Controller Agent" button for pending reviews

### Key MCP Tools

**Orchestrator additions:**

- `resubmit_sprint` - Resubmit after addressing Controller feedback
- `resubmit_handover` - Resubmit handover after revisions
- `get_amendments` - View specification amendment history

**Controller-only tools:**

- `review_sprint_config`, `approve_sprint`, `reject_sprint`
- `review_handover`, `approve_handover`, `reject_handover`

See `docs/mcp-server-config.md` for complete role/tool matrix and `extension/agents/orchestra.orchestrator.agent.md` for workflow details.

## Extension Build (Deployment)

If a task involves packaging/deploying the VS Code extension (VSIX) or native module issues, use `extension/build.md` as the authoritative guide. The `better-sqlite3` native module must be built for both Electron (extension) and Node.js (MCP server bundle).
