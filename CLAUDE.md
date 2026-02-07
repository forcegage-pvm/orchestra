# Orchestra - Claude Code Project Guide

## Project Overview

Orchestra is an AI agent task orchestration framework that prevents "implementation theater" in software development. It consists of:

- **MCP Server** (`src/`) - Role-filtered tool server implementing orchestrator/implementor/controller pattern
- **VS Code Extension** (`extension/`) - UI for sprint/task orchestration with Solid.js webviews
- **CLI** (`src/cli.ts`) - Commander.js CLI for task management

## Quick Reference

```bash
# Build
npm run build                # TypeScript compilation (root)
npm run build:mcp-bundle     # Bundle MCP server for extension
cd extension && npm run build # Build extension

# Test
npm test                     # Vitest (run once)
npm run test:watch           # Vitest (watch mode)
npm run test:fast            # Fast test run

# Lint & Type Check
npm run lint                 # ESLint (src/**/*.ts)
npm run typecheck            # tsc --noEmit
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.4+ (strict mode, ES2022 target) |
| Runtime | Node.js 18+ |
| CLI | Commander.js |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| Validation | Zod |
| Templating | Handlebars |
| Extension UI | Solid.js + Tailwind CSS |
| Build | tsup (root), esbuild (extension), Vite (webviews) |
| Testing | Vitest (threads pool, v8 coverage) |
| Linting | ESLint 9 + typescript-eslint |

## Architecture

### Core Patterns

- **Role-based access control**: MCP server filters tools by role (`--role=orchestrator|implementor|controller|full`). This is structural, not advisory.
- **Information asymmetry**: The implementor never sees hidden verification criteria.
- **Task lifecycle**: `PENDING -> PREPARE -> IMPLEMENT -> GATE_CHECK -> VERIFY -> CODE_REVIEW -> COMPLETE`
- **Workflow state machine**: 14 steps managed via `WorkflowChain` in `src/core/workflow-state.ts`

### Directory Structure

```
src/
  cli.ts              # CLI entry point
  commands/            # 14 CLI commands
  core/                # Business logic (~57 modules)
  db/                  # SQLite schema (16 tables), migrations, queries (Drizzle ORM)
  mcp-server/          # MCP server entry + 70+ tool handlers
  schemas/             # Zod validation schemas
extension/
  src/
    agents/            # Agent implementations & prompts
    chat/              # Chat session management
    commands/          # VS Code command handlers
    config/            # Configuration management
    database/          # SQLite client & queries
    mcp/               # MCP server management
    prompts/           # Prompt builder & templates
    views/             # UI panels & tree providers
    webviews/          # Solid.js webview components
  agents/              # Markdown agent role definitions
  templates/           # Handlebars templates
test/                  # Unit tests (mirrors src/ structure)
testing/               # Integration tests
templates/             # Handlebars templates
.orchestra/            # Runtime workspace config (DB, templates)
```

## Coding Conventions

### TypeScript

- **Strict mode** with all strict flags enabled (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, etc.)
- **No `any`** - `@typescript-eslint/no-explicit-any: error`. Use `unknown` instead.
- **Unused vars**: Prefix with `_` (e.g., `_unused`) - enforced by ESLint
- **Module system**: ESM (`"module": "ESNext"`)
- **Error handling**: Custom error classes (e.g., `ManifestError`, `TaskError`), some modules use `ScriptResult<T>` pattern

### Naming

- Types/interfaces: `PascalCase` (e.g., `Task`, `PrepareOptions`, `WorkflowStep`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `TOOLS_WITH_ROLES`)
- Functions/variables: `camelCase` (e.g., `loadManifest`, `registerTools`)
- Runtime enums: `z.enum()` via Zod (not TypeScript `enum`)

### File Organization

- One responsibility per file
- Service pattern: `src/core/<service>.ts` + `src/mcp-server/handlers/<handler>.ts`
- Test files: `test/core/<service>.test.ts` (mirror src structure)

### Commit Messages

Format: `type(scope): description`

Examples from history:
- `feat(orchestra): implement task 6 - Migrate sprint/handover review prompts`
- `fix: add missing SprintSettingsPanel import`
- `chore(orchestra): prepare task 7 - Migrate code review prompts`

## Extension Build Notes

The extension bundles `better-sqlite3`, a native Node.js module requiring separate compilation for Electron (VS Code) and Node.js (MCP server). See `extension/build.md` for the full build guide including Electron rebuild steps and troubleshooting.

## Testing

- **Framework**: Vitest with global test APIs (`describe`, `it`, `expect`)
- **Pool**: Threads (half available CPU cores)
- **Timeouts**: test: 30s, hooks: 10s
- **Global setup**: `test/setup/global-setup.ts` creates pre-migrated DB template
- **Coverage**: v8 provider, includes `src/**/*.ts`
- **Structure**: `test/` for unit tests, `testing/` for integration tests

## Database

- 16 tables defined in `src/db/schema.ts` via Drizzle ORM
- Migrations run on MCP server startup (`src/db/migrations.ts`)
- Connection via `getDb()` singleton
- Core tables: sprints, phases, tasks, verification_checks, handovers, signals, code_reviews
