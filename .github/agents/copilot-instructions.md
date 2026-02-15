# orchestra Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-12-04

## Active Technologies
- TypeScript 5.x (ESM with `.js` extensions) + drizzle-orm (SQLite), Zod (validation), VS Code Extension API (for MCP tool exposure) (003-tdd-red-green)
- SQLite via better-sqlite3 + drizzle ORM (existing infrastructure) (003-tdd-red-green)
- TypeScript 5.x (strict mode, `exactOptionalPropertyTypes: true`) + Drizzle ORM, Zod, MCP SDK, VS Code Extension API (004-controller-agent)
- SQLite (via better-sqlite3) with Drizzle ORM (004-controller-agent)
- TypeScript 5.x (ESM) + Zod (schema validation), AJV (JSON Schema validation), Vitest (testing) (007-interface-contract-validation)
- Project config file (`.orchestra/interface-validations.yaml` or similar) (007-interface-contract-validation)
- TypeScript 5.x (ESM with `exactOptionalPropertyTypes: true`) + Drizzle ORM, better-sqlite3, VS Code Extension API (TreeDataProvider, WebviewViewProvider, FileSystemWatcher) (008-sprint-management)
- SQLite database at `.orchestra/orchestra.db` (008-sprint-management)
- TypeScript 5.x (strict mode, exactOptionalPropertyTypes) + VS Code API (workspace.fs, WorkspaceEdit, Terminal.shellIntegration, tasks, languages.getDiagnostics), Zod (009-tools-rework)
- N/A (tools operate on workspace files) (009-tools-rework)
- TypeScript 5.x (ES2022 target, ESM modules) + VS Code Extension API (^1.95.0), child_process (Node.js), vitest (010-tool-enhance)
- N/A (stateless tools, in-memory process tracking only) (010-tool-enhance)
- TypeScript 5.x (ESM, strict mode with `exactOptionalPropertyTypes`) + Vitest (test runner), `vscode` API (extension host), `better-sqlite3` (DB), `crypto` (fingerprinting) (013-test-runner-tools)
- In-memory `Map<string, TestResultCache>` for result caching; existing `sprint_settings` DB table for per-sprint test config (013-test-runner-tools)
- TypeScript 5.x (ES2022 target, ESM modules) + VS Code Extension APIs, MCP Protocol, Vitest, better-sqlite3 (014-pre-signal-test-migration)
- SQLite (via better-sqlite3) - `tdd_red_registry`, `tdd_task_relationships` tables (014-pre-signal-test-migration)

- TypeScript 5.x, Node.js 20+, Electron 39.x (VS Code engine) + vscode.lm API, VS Code Webview API, VS Code Workspace Edit API, better-sqlite3 (existing) (002-custom-agents)
- SQLite via better-sqlite3 (existing Orchestra DB) + JSON files for session state (002-custom-agents)

- TypeScript 5.4+ (ESM modules, strict mode with `exactOptionalPropertyTypes`) + @modelcontextprotocol/sdk ^0.6.0, existing Orchestra core (zod, yaml, handlebars, chalk, simple-git) (001-mcp-server)

## Project Structure

```text
src/
tests/
```

## Commands

npm test; npm run lint

## Code Style

TypeScript 5.4+ (ESM modules, strict mode with `exactOptionalPropertyTypes`): Follow standard conventions

## Recent Changes
- 014-pre-signal-test-migration: Added TypeScript 5.x (ES2022 target, ESM modules) + VS Code Extension APIs, MCP Protocol, Vitest, better-sqlite3
- 013-test-runner-tools: Added TypeScript 5.x (ESM, strict mode with `exactOptionalPropertyTypes`) + Vitest (test runner), `vscode` API (extension host), `better-sqlite3` (DB), `crypto` (fingerprinting)
- 010-tool-enhance: Added TypeScript 5.x (ES2022 target, ESM modules) + VS Code Extension API (^1.95.0), child_process (Node.js), vitest



<!-- MANUAL ADDITIONS START -->

## New Agent Orientation (Manual)

This repo is primarily a **VS Code extension** (in `extension/`) that embeds/controls an **MCP server** and is evolving toward **custom autonomous coding agents**.

Canonical files:

- `extension/src/extension.ts` (activation, MCP install/start, agent file sync)
- `src/mcp-server/index.ts` (MCP entrypoint; role filtering; DB init/migrations)
- `src/mcp-server/tools.ts` (tool contracts; role assignments)
- `extension/agents/*.agent.md` (role prompts shipped with extension)

CRITICAL build reference (VSIX/native modules): `extension/build.md`

<!-- MANUAL ADDITIONS END -->
