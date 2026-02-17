# Research: Intelligent Test Runner Tools

**Phase 0 Output** | **Date**: 2026-02-09

## 1. Vitest CLI Capabilities

### 1.1 JSON Reporter & Structured Output

- **Decision**: Use `--reporter=json --outputFile=<tmpfile>` for all test execution
- **Rationale**: Dual reporters are supported (`--reporter=json --reporter=default`), but writing JSON to a file via `--outputFile` is more reliable than parsing stdout. JSON output includes test names, file paths, duration, error messages, and stack traces in a structured format.
- **Alternatives considered**: Parsing stdout (fragile, encoding issues), TAP reporter (less structured), custom reporter (unnecessary complexity)

### 1.2 Related File Detection (`--related`)

- **Decision**: Use Vitest's `--related <files>` flag for transitive dependency resolution
- **Rationale**: `--related` walks the full transitive import graph via Vitest's module resolution. Given `A → B → C`, `--related A` will include tests for B and C. This eliminates the need for a custom import graph implementation.
- **Alternatives considered**: Custom AST-based import parser (reinventing the wheel), `madge` dependency graph tool (external dependency), manual file pattern matching (misses transitive deps)

### 1.3 Project Filtering (`--project`)

- **Decision**: Use `--project <name>` for workspace-level filtering when multiple Vitest configs exist
- **Rationale**: Supports multiple values and wildcard patterns. Useful for the monorepo structure (root + extension configs). Can target specific workspace projects without running all.
- **Alternatives considered**: Separate Vitest invocations per config (slower, more complex orchestration)

### 1.4 Failed Test Re-runs

- **Decision**: Build own failure tracking from JSON reporter output stored in TestResultStore
- **Rationale**: **CRITICAL FINDING: Vitest `--failed` flag does NOT exist as a CLI option.** It is only available in watch mode's interactive menu. For CLI `vitest run`, there is no built-in way to re-run only previously failed tests. The implementation must store failed test names/files from JSON output and construct `--testNamePattern` or file list arguments for re-runs.
- **Alternatives considered**: Vitest `--failed` (doesn't exist for CLI), vitest watch mode (not suitable for agent workflow — interactive), `--changed` flag (only git-based, not failure-based)

### 1.5 Test Name Pattern Filtering (`-t`)

- **Decision**: Use `-t <pattern>` for name-based test filtering
- **Rationale**: Uses JavaScript RegExp syntax. Can filter by describe block names, test names, or combinations. Special characters need escaping. Supports `vitest run -t "pattern"` syntax.
- **Alternatives considered**: `--grep` (not a Vitest option), filename-based filtering only (less granular)

### 1.6 Timeout Control

- **Decision**: Use `--testTimeout <ms>` for per-run timeout configuration
- **Rationale**: Vitest supports `--testTimeout` for individual test timeouts. For overall run timeout, use Node.js child process timeout via `spawn` options. Default test timeout is 5000ms.
- **Alternatives considered**: Only process-level timeout (loses per-test control), only test-level timeout (can't cap total wall time)

## 2. Extension Codebase Architecture

### 2.1 AgentTool Interface & Registration

- **Decision**: Follow existing `AgentTool<TInput>` interface pattern with `ToolRegistry.register()`
- **Rationale**: All existing tools use this pattern. Interface includes `name`, `description`, `inputSchema` (JSON Schema), `tags`, `invoke(input, context)`. Registration via `registerAll(registry, tools[])` in category index files.
- **Alternatives considered**: VS Code Language Model Tool API directly (would bypass the custom agent system), standalone functions (breaks registry pattern)

### 2.2 Existing Test Runner Analysis

- **Decision**: Replace `system/runTests.ts` entirely; keep `system/getTestFailures.ts`
- **Rationale**: The existing `runTests.ts` (262 lines) is VS Code task-based only — it searches for tasks with `group.kind === 'test'` and executes them. It cannot do scoped execution, JSON parsing, or caching. `getTestFailures.ts` reads VS Code diagnostics (a different data source) and remains useful as a complementary tool.
- **Alternatives considered**: Extending the existing tool (too limited, wrong architecture), removing getTestFailures too (serves different purpose — live diagnostics vs run results)

### 2.3 Command Interception Pattern

- **Decision**: Add an interception hook in `runCommand.ts` that checks commands against a test command pattern list
- **Rationale**: `runCommand.ts` already has `parseTestRunnerDiagnostics()` and the `expect_failure` flag for TDD support. Adding a pre-execution check for test commands (`npm test`, `npx vitest`, `vitest run`, etc.) fits naturally. The interception returns an `errorResult` with a redirect message.
- **Alternatives considered**: Middleware in ToolRegistry (doesn't exist, over-engineering), separate interceptor tool (would need to wrap every terminal tool)

### 2.4 Process Management

- **Decision**: Use direct `child_process.spawn()` for test execution (not ProcessManager)
- **Rationale**: `runCommand.ts` uses direct `spawn()` for synchronous command execution with stdout/stderr capture. ProcessManager is designed for long-lived background processes (servers, watchers). Test runs are short-lived synchronous operations that need JSON output capture, making `spawn()` more appropriate.
- **Alternatives considered**: ProcessManager (designed for background processes, adds unnecessary lifecycle management), VS Code tasks (no programmatic output capture)

### 2.5 Error Handling

- **Decision**: Use `ToolErrorCode` enum + `errorResult()` builder for all error paths
- **Rationale**: Matches existing patterns. Error codes include `COMMAND_FAILED`, `TIMEOUT`, `CANCELLED`, `INVALID_INPUT`, `WORKSPACE_REQUIRED`. The `errorResult(toolName, code, message, suggestion?, details?)` function provides consistent structure.
- **Alternatives considered**: Throwing exceptions (breaks tool contract), custom error format (inconsistent)

## 3. Fingerprint & Caching Strategy

### 3.1 Hash Performance

- **Decision**: Use `crypto.createHash('sha256')` for file content hashing
- **Rationale**: Performance testing confirms <50ms for hashing 200 files. SHA-256 provides sufficient collision resistance. Node.js `crypto` module is built-in with no additional dependencies.
- **Alternatives considered**: MD5 (faster but weaker guarantees), xxhash (native dependency, overkill), file mtime (unreliable across git operations)

### 3.2 Cache Key Strategy

- **Decision**: Compute composite fingerprint from: test files in scope + transitive source dependencies + configuration files (.agent-test-config.json, vitest.config.ts)
- **Rationale**: Any change to test code, source code, or configuration should invalidate cached results. The composite approach ensures correctness while the in-memory Map provides O(1) lookup.
- **Alternatives considered**: Test files only (misses source changes), all workspace files (too expensive, too many invalidations), git commit hash (doesn't catch unstaged changes)

### 3.3 Cache Scope

- **Decision**: Cache keyed by `scope + target + working directory` → fingerprint → result
- **Rationale**: Different scopes over the same files may produce different results (e.g., a pattern filter reduces the test set). The scope+target combination is the natural cache key, with the fingerprint serving as the validity check.
- **Alternatives considered**: Global cache per file set (loses scope distinction), per-file cache (too granular, complex invalidation)

## 4. Test Directory Structure & Configuration

### 4.1 Configuration File Format

- **Decision**: JSON format (`.agent-test-config.json`) with Zod schema validation
- **Rationale**: JSON is native to the VS Code/TypeScript ecosystem. Zod validation follows the project convention. The config declares active tiers, directory paths, and tier-specific overrides (timeouts, etc.).
- **Alternatives considered**: YAML (project uses YAML for Orchestra configs, but this is VS Code extension-specific), TypeScript config (requires compilation), package.json field (clutters package.json)

### 4.2 Tier Validation

- **Decision**: Config-driven validation — only declared tiers are available
- **Rationale**: Per user clarification: users declare which tiers they have. Tools validate against this declaration. Undeclared tiers return clear errors. This enables gradual migration from flat structures.
- **Alternatives considered**: Strict all-5-tiers (too rigid for adoption), fully permissive (no validation benefit), auto-detect from directories (unreliable, naming varies)

## 5. TDD Red-Phase Implementation

### 5.1 Inverted Assertion Logic

- **Decision**: Implement at the result interpretation layer, not the test execution layer
- **Rationale**: Tests execute normally through Vitest. The result formatter inverts pass/fail interpretation: failures become "correctly failing" (good), passes become "unexpectedly passing" (problem). This avoids modifying test execution and keeps the Vitest output reliable.
- **Alternatives considered**: Custom Vitest reporter that inverts (couples to Vitest internals), wrapper that modifies test assertions (breaks test logic), separate test runner for red (unnecessary duplication)

### 5.2 Promotion via Git

- **Decision**: Use `git mv` for test file promotion to preserve history
- **Rationale**: `git mv` preserves file history in the version control system. The destination directory is inferred from the subdirectory structure within the red directory (e.g., `test/red/unit/foo.test.ts` → `test/unit/foo.test.ts`).
- **Alternatives considered**: `fs.rename` (loses git history), `cp` + `rm` (creates new file history), manual instruction to the agent (defeats automation purpose)
