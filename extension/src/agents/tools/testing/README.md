# Testing Tool Pipeline

This directory contains the core modules for the intelligent test runner system. These modules implement a layered pipeline architecture for scoped test execution with caching and result formatting.

## Architecture Overview

```
┌─────────────────┐     ┌────────────────┐     ┌──────────────┐     ┌─────────────────┐
│ TestConfigLoader│ ──▶ │  ScopeResolver │ ──▶ │ VitestRunner │ ──▶ │ ResultFormatter │
│   (T001)        │     │    (T007)      │     │   (T008)     │     │    (T009)       │
└─────────────────┘     └────────────────┘     └──────────────┘     └─────────────────┘
       │                       │                      │                     │
       ▼                       ▼                      ▼                     ▼
  TestConfig             ScopeResult            VitestRunResult       RunTestsResult
```

**Runtime Pipeline Flow:**
1. **TestConfigLoader** → Loads `.agent-test-config.json` configuration
2. **ScopeResolver** → Resolves scope+target into file lists or patterns  
3. **VitestRunner** → Executes vitest with JSON reporter and parses output
4. **ResultFormatter** → Transforms Vitest JSON into token-efficient summaries

## Module Reference

### TestConfigLoader

**Location:** `TestConfigLoader.ts`  
**Responsibility:** Load and validate test configuration from `.agent-test-config.json`

```typescript
import { TestConfigLoader, type TestConfig } from './TestConfigLoader.js';

const loader = new TestConfigLoader(workspaceRoot);
const configResult = await loader.loadConfig();

if ('error' in configResult) {
  // Handle ToolError
  console.error(configResult.message);
} else {
  const config: TestConfig = configResult;
  // Use config.tiers, config.maxFailureLines, etc.
}
```

### ScopeResolver

**Location:** `ScopeResolver.ts`  
**Responsibility:** Resolve scope+target into file lists or patterns for vitest

**Supported Scopes:**
- `file` — Run a specific test file (target = file path)
- `pattern` — Filter tests by name pattern (target = regex/string for `-t` flag)
- `suite` — Run tests from a configured tier (target = tier name)
- `all` — Run all non-inverted (green-phase) tiers

**Not Yet Supported:** `related`, `red`, `failed` (implemented in future tasks)

```typescript
import { ScopeResolver, type ScopeResult } from './ScopeResolver.js';

const resolver = new ScopeResolver(workspaceRoot);
const scopeResult = await resolver.resolve('suite', 'unit', config);

if ('error' in scopeResult) {
  // Handle ToolError (e.g., TIER_NOT_CONFIGURED)
  console.error(scopeResult.message);
} else {
  const { files, pattern, message } = scopeResult;
  // files: string[] - file paths/globs for vitest
  // pattern?: string - test name pattern for -t flag
  // message?: string - explanatory message
}
```

**Important:** The `pattern` scope returns an empty `files` array and sets the `pattern` field. Vitest handles name-pattern filtering via the `-t` flag, not file matching.

### VitestRunner

**Location:** `VitestRunner.ts`  
**Responsibility:** Build and execute vitest CLI commands, parse JSON output

```typescript
import { VitestRunner, type VitestRunOptions, type VitestRunResult } from './VitestRunner.js';

const runner = new VitestRunner();

// Build command (useful for debugging)
const options: VitestRunOptions = {
  files: ['test/**/*.test.ts'],
  pattern: 'should handle auth',  // Optional: -t flag
  workingDir: workspaceRoot,
  timeout: 30000,               // Optional: --testTimeout
  project: 'main',              // Optional: --project
};

const args = runner.buildCommand(options);
// ['vitest', 'run', '--reporter=json', '--outputFile=...', '-t', 'should handle auth', ...]

// Execute
const runResult = await runner.execute(options);

if ('error' in runResult) {
  // Handle ToolError (TIMEOUT, COMMAND_FAILED, FILE_NOT_FOUND, etc.)
  console.error(runResult.message);
} else {
  const { exitCode, vitestJson, duration } = runResult;
  // vitestJson: unknown - raw Vitest JSON reporter output
  // exitCode: number - process exit code (0 = all pass)
  // duration: number - execution time in ms
}
```

**Implementation Notes:**
- Uses `child_process.spawn` with `npx vitest` (NOT ProcessManager)
- JSON output written to temp file via `--outputFile` (more reliable than stdout)
- Temp file automatically cleaned up after reading
- Supports AbortController for timeout handling

### ResultFormatter

**Location:** `ResultFormatter.ts`  
**Responsibility:** Transform raw Vitest JSON into token-efficient RunTestsResult

```typescript
import { ResultFormatter, type FormatOptions } from './ResultFormatter.js';
import type { RunTestsResult, TestOutcome } from './types.js';

const formatter = new ResultFormatter();

// Main transformation
const options: FormatOptions = { maxFailureLines: 20 };
const result: RunTestsResult = formatter.format(vitestJson, options);

// result.total, result.passed, result.failed, result.skipped
// result.tests: TestOutcome[] - individual test details
// result.summary: string - one-line summary

// Generate summary separately
const summary = formatter.formatSummary(result);
// "PASS | 45 passed, 0 failed, 2 skipped | 3.2s"
// "FAIL | 40 passed, 5 failed, 0 skipped | 4.1s"

// Get failure details
const failureReport = formatter.formatFailures(result.tests, 20);
// ✗ describe > test name
//   path/to/test.ts:42
//   Expected: { valid: true }
//   Actual:   { valid: false }
```

**Output Format:** The `format()` method returns a `RunTestsResult` (from `types.ts`) with:
- Test counts (total, passed, failed, skipped)
- Duration in milliseconds
- Tests array with individual `TestOutcome` entries
- Failure details including expected/actual values and stack traces (truncated)
- Single-line summary string

## Integration Point (T010)

The **runTests tool** (Task T010) wires these modules together:

```typescript
// Pseudocode for T010 runTests tool implementation
async function runTests(scope: TestScope, target?: string): Promise<RunTestsResult> {
  // 1. Load config
  const configLoader = new TestConfigLoader(workspaceRoot);
  const config = await configLoader.loadConfig();
  if ('error' in config) return handleError(config);

  // 2. Resolve scope
  const resolver = new ScopeResolver(workspaceRoot);
  const scopeResult = await resolver.resolve(scope, target, config);
  if ('error' in scopeResult) return handleError(scopeResult);

  // 3. Execute vitest
  const runner = new VitestRunner();
  const vitestResult = await runner.execute({
    files: scopeResult.files,
    pattern: scopeResult.pattern,
    workingDir: workspaceRoot,
    timeout: config.timeout,
  });
  if ('error' in vitestResult) return handleError(vitestResult);

  // 4. Format results
  const formatter = new ResultFormatter();
  const result = formatter.format(vitestResult.vitestJson, {
    maxFailureLines: config.maxFailureLines,
  });

  // Override scope/workingDir (not known by ResultFormatter)
  result.scope = scope;
  result.workingDir = workspaceRoot;

  return result;
}
```

## Supporting Modules

### TestResultStore (`TestResultStore.ts`)
- Caches test results with fingerprint-based invalidation
- Used by future caching layer (US3)

### FingerprintComputer (`FingerprintComputer.ts`)
- Computes xxHash-based fingerprints for cache invalidation
- Tracks test file and dependency changes

### TestCommandInterceptor (`TestCommandInterceptor.ts`)
- Intercepts test commands from command palette/keybindings
- Routes to intelligent test runner when appropriate

### types.ts
- Shared TypeScript interfaces: `TestScope`, `TestConfig`, `RunTestsResult`, `TestOutcome`, `TestFailureDetail`
- All modules output types defined here for interface conformance

## Error Handling

All modules return `ToolError` for expected failure cases:
- `TIER_NOT_CONFIGURED` — Requested tier not in config
- `FILE_NOT_FOUND` — Test file or vitest output missing
- `INVALID_INPUT` — Invalid scope or missing required parameters
- `TIMEOUT` — Vitest execution exceeded timeout
- `COMMAND_FAILED` — Vitest spawn/execution error

Use the `'error' in result` pattern to check for errors:

```typescript
if ('error' in result) {
  // It's a ToolError
  console.error(result.message, result.suggestedAction);
} else {
  // It's the success type
}
```

## Configuration Reference

`.agent-test-config.json` structure:

```json
{
  "tiers": [
    {
      "name": "unit",
      "path": "test/unit/**/*.test.ts",
      "inverted": false
    },
    {
      "name": "integration", 
      "path": "test/integration/**/*.test.ts",
      "inverted": false
    },
    {
      "name": "red",
      "path": "test/tdd-red/**/*.test.ts",
      "inverted": true
    }
  ],
  "maxFailureLines": 20,
  "timeout": 30000
}
```

- `inverted: true` marks red-phase TDD tiers (excluded from 'all' scope)
- `maxFailureLines` controls truncation in failure output
- `timeout` sets default execution timeout in milliseconds
