# orchestra Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-12-04

## Active Technologies

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

- 002-custom-agents: Added TypeScript 5.x, Node.js 20+, Electron 39.x (VS Code engine) + vscode.lm API, VS Code Webview API, VS Code Workspace Edit API, better-sqlite3 (existing)

- 001-mcp-server: Added TypeScript 5.4+ (ESM modules, strict mode with `exactOptionalPropertyTypes`) + @modelcontextprotocol/sdk ^0.6.0, existing Orchestra core (zod, yaml, handlebars, chalk, simple-git)

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
