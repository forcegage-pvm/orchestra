# Orchestra: New Agent Orientation (Source of Truth)

This repo is primarily a **VS Code extension** that embeds/controls an **Orchestra MCP server** and (in this branch) is evolving toward **custom autonomous coding agents** that orchestrate the SDLC.

## What you’re building

- **VS Code extension** (primary product surface): UI (dashboard/tree/task detail), database reactivity, MCP server management, and agent invocation.
- **MCP server** (stdio): exposes role-scoped tools to orchestrate the SDLC using an underlying SQLite database.
- **Custom agents** (in-progress): autonomous Orchestrator/Implementor loops using `vscode.lm`, with real-time transparency, pause/resume/stop, file-change tracking, and session persistence.

## Canonical entrypoints (read these first)

- Extension activation + MCP install/sync: [extension/src/extension.ts](../extension/src/extension.ts)
- MCP server entrypoint (role filtering, DB init/migrations): [src/mcp-server/index.ts](../src/mcp-server/index.ts)
- MCP tool contracts + role assignments: [src/mcp-server/tools.ts](../src/mcp-server/tools.ts)
- Agent role prompts (shipped with extension):
  - [extension/agents/orchestra.orchestrator.agent.md](../extension/agents/orchestra.orchestrator.agent.md)
  - [extension/agents/orchestra.implementor.agent.md](../extension/agents/orchestra.implementor.agent.md)
- Workflow-stage prompt scaffolding: [extension/src/prompts/PromptBuilder.ts](../extension/src/prompts/PromptBuilder.ts)

## Trust boundary (non-negotiable)

- The system relies on **information asymmetry**.
- Implementor must not see verification criteria / full sprint scope.
- Enforcement is **structural**:
  - MCP server runs with `--role=orchestrator` or `--role=implementor`.
  - Tool registration filters by role (not “advisory”).

## Build & deploy the extension (CRITICAL)

If you need to package/deploy the extension (VSIX), follow the build guide:

- [extension/build.md](../extension/build.md)

Key point: the extension uses `better-sqlite3` and requires **Electron-targeted native builds** for VS Code, plus Node-targeted native builds for the MCP server bundle.

## Dev commands (repo)

From repo root:

- `npm test`
- `npm run build`
- `npm run build:mcp-bundle`

From `extension/`:

- `npm test`
- `npm run build`
- `npm run watch` (dev)

## Writing Tests (CRITICAL)

**Use the shared database cache pattern** - migrations run ONCE per test session, not per test file.

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../src/db/index.js";
import { cleanupTestDb, setupTestDb } from "../setup/db-cache.js";

describe("My Test Suite", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await setupTestDb("my-test-");
  });

  afterEach(async () => {
    await cleanupTestDb(tempDir);
  });

  it("should work", async () => {
    const db = getDb();
    // ... your test
  });
});
```

**DO NOT** use the old pattern with `initializeDb()`, `resetDb()`, `runMigrationsV2()` directly - this causes 5x slower test runs.

See [test/setup/db-cache.ts](../test/setup/db-cache.ts) for implementation details.

## “If you’re lost” checklist

1. Identify which surface you’re changing: extension UI, MCP server tools/DB, or agent loop.
2. Confirm role/visibility: orchestrator vs implementor.
3. For packaging/build issues, immediately consult [extension/build.md](../extension/build.md).

## TDD Red-Green Workflow

Orchestra supports **Test-Driven Development** with explicit red-phase (write failing tests) and green-phase (implement features) task separation.

**Key concepts**:

- **Red-phase tasks** (`tdd_red_phase: true`): Write tests that MUST fail
- **Dual verification**: Separate commands for red tests (must fail) and regression tests (must pass)
- **Automatic cleanup**: Orchestrator removes markers before each task prepare
- **Test isolation**: Language-specific markers (Dart: `@Tags(['tdd-red'])`, TypeScript: `test/tdd-red/`)

**Implementation**:

- Task schema: [src/db/schema.ts](../src/db/schema.ts) - `tdd_red_phase` column
- Handover generation: [src/mcp-server/handlers/get-current-task.ts](../src/mcp-server/handlers/get-current-task.ts) - `generateTddInstructions()`
- Cleanup logic: [src/core/tdd-cleanup.ts](../src/core/tdd-cleanup.ts) - `cleanupTddRedMarkers()`
- Pre-signal: [src/core/pre-signal-executor.ts](../src/core/pre-signal-executor.ts) - dual command execution

**Documentation**: See [docs/workflow/tdd-red-green-workflow.md](workflow/tdd-red-green-workflow.md) for complete workflow guide.
