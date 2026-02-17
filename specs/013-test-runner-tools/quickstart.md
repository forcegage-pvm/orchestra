# Quickstart: Intelligent Test Runner Tools

**Audience**: Developers implementing this feature | **Date**: 2026-02-09

## Prerequisites

- Node.js 18+ with npm
- VS Code with the Orchestra extension source
- Git
- Familiarity with Vitest, Zod, and the AgentTool pattern

## 1. Setup Development Environment

```bash
# Clone and install
cd extension
npm install

# Run existing tests to verify baseline
npm test

# Watch mode for development
npm run test:watch
```

## 2. Configuration File

Create `.agent-test-config.json` at the workspace root. Start minimal and expand:

```json
{
  "framework": "vitest",
  "tiers": [{ "name": "unit", "path": "test/unit/**/*.test.ts" }],
  "defaultTimeout": 30000
}
```

Add tiers incrementally:

```json
{
  "framework": "vitest",
  "tiers": [
    { "name": "red", "path": "test/red/**/*.test.ts", "inverted": true },
    { "name": "unit", "path": "test/unit/**/*.test.ts" },
    {
      "name": "integration",
      "path": "test/integration/**/*.test.ts",
      "timeout": 60000
    }
  ],
  "defaultTimeout": 30000,
  "maxFailureLines": 20
}
```

## 3. Directory Structure

New files go under `extension/src/agents/tools/testing/`:

```
testing/
├── index.ts                  # Start here — registration barrel
├── types.ts                  # All Zod schemas + TypeScript types
├── TestConfigLoader.ts       # Config validation (implement first)
├── TestResultStore.ts        # In-memory cache (implement second)
├── FingerprintComputer.ts    # SHA-256 hashing
├── VitestRunner.ts           # Command builder + JSON parser
├── ChangeResolver.ts         # Git change detection
├── ScopeResolver.ts          # Scope → file list resolution
├── ResultFormatter.ts        # Compressed output generation
├── TestCommandInterceptor.ts # Blocked command patterns
├── runTests.ts               # Main tool (depends on all above)
├── getTestResults.ts         # Results retrieval tool
├── listTestSuites.ts         # Discovery tool
└── promoteTests.ts           # TDD promotion tool
```

## 4. Implementation Order

Follow this dependency order for clean incremental development:

### Phase A: Foundation (no tool registration yet)

1. **`types.ts`** — Define all Zod schemas and TypeScript types from [data-model.md](data-model.md)
2. **`TestConfigLoader.ts`** — Read + validate `.agent-test-config.json` (Zod parse)
3. **`TestResultStore.ts`** — In-memory Map with fingerprint-based get/set
4. **`FingerprintComputer.ts`** — SHA-256 hashing of file sets
5. **`TestCommandInterceptor.ts`** — RegExp pattern matching (stateless)

### Phase B: Execution Pipeline

6. **`ChangeResolver.ts`** — Git diff, commit range, file list parsing
7. **`ScopeResolver.ts`** — Maps scope+target to concrete file list using config
8. **`VitestRunner.ts`** — Builds `vitest run` command strings, parses JSON output
9. **`ResultFormatter.ts`** — Compresses raw Vitest JSON into `RunTestsResult`

### Phase C: Tool Registration

10. **`runTests.ts`** — Wire scope resolution → fingerprint → cache check → execute → format
11. **`getTestResults.ts`** — Read-only access to `TestResultStore`
12. **`listTestSuites.ts`** — Glob + AST parse for discovery
13. **`promoteTests.ts`** — Validation + `git mv` execution

### Phase D: Integration

14. **`index.ts`** — `registerTestingTools(registry)` barrel
15. **Modify `toolLoaders.ts`** — Add `registerTestingTools()` calls
16. **Modify `system/runCommand.ts`** — Add interception hook
17. **Modify `system/index.ts`** — Remove old `runTestsTool` export

## 5. Key Patterns to Follow

### Tool Registration Pattern

```typescript
// testing/index.ts
import { type ToolRegistry } from "../ToolRegistry.js";
import { runTestsTool } from "./runTests.js";
import { getTestResultsTool } from "./getTestResults.js";
import { listTestSuitesTool } from "./listTestSuites.js";
import { promoteTestsTool } from "./promoteTests.js";

export function registerTestingTools(registry: ToolRegistry): void {
  registry.registerAll([
    runTestsTool,
    getTestResultsTool,
    listTestSuitesTool,
    promoteTestsTool,
  ]);
}
```

### Tool Implementation Pattern

```typescript
// testing/runTests.ts
import type { AgentTool } from "../types.js";
import { type RunTestsInput, RunTestsInputSchema } from "./types.js";
import { successResult, errorResult } from "../utils/resultBuilder.js";
import { ToolErrorCode } from "../errors.js";

export const runTestsTool: AgentTool<RunTestsInput> = {
  name: "run_tests",
  description: "Execute tests with intelligent scoping...",
  tags: ["testing", "tdd", "execution"],
  inputSchema: {
    type: "object",
    properties: {
      scope: {
        type: "string",
        enum: ["file", "pattern", "suite", "related", "red", "failed", "all"],
        description: "...",
      },
      target: { type: "string", description: "..." },
      // ... remaining properties
    },
    required: ["scope"],
  },
  async invoke(input, context) {
    // 1. Load config
    // 2. Validate input against config
    // 3. Acquire execution lock
    // 4. Resolve scope to file list
    // 5. Compute fingerprint
    // 6. Check cache (unless force)
    // 7. Build and execute vitest command
    // 8. Parse JSON output
    // 9. Format compressed results
    // 10. Store in cache + record failures
    // 11. Release lock
    // 12. Return successResult or errorResult
  },
};
```

### Error Pattern

```typescript
import { ToolErrorCode } from "../errors.js";
import { errorResult } from "../utils/resultBuilder.js";

// Concurrent rejection
return errorResult(
  "run_tests",
  ToolErrorCode.TEST_RUN_IN_PROGRESS,
  "A test run is already executing",
  "Wait for the current run to complete",
);
```

## 6. Testing Your Implementation

### Unit Tests Location

```
extension/test/agents/tools/testing/
├── TestConfigLoader.test.ts
├── TestResultStore.test.ts
├── FingerprintComputer.test.ts
├── VitestRunner.test.ts
├── ChangeResolver.test.ts
├── ScopeResolver.test.ts
├── ResultFormatter.test.ts
├── TestCommandInterceptor.test.ts
├── runTests.test.ts
├── getTestResults.test.ts
├── listTestSuites.test.ts
└── promoteTests.test.ts
```

### Running Tests

```bash
# Run only your new tests
npx vitest run test/agents/tools/testing/

# Watch mode for a specific file
npx vitest --watch test/agents/tools/testing/TestConfigLoader.test.ts

# Full suite to verify no regressions
npm test
```

## 7. Key Reference Files

| File                                                | Purpose                                          |
| --------------------------------------------------- | ------------------------------------------------ |
| `extension/src/agents/tools/types.ts`               | AgentTool interface, ToolResult, ToolInputSchema |
| `extension/src/agents/tools/errors.ts`              | ToolErrorCode enum                               |
| `extension/src/agents/tools/utils/resultBuilder.ts` | `successResult()`, `errorResult()`               |
| `extension/src/agents/tools/system/runCommand.ts`   | Existing command execution (interception target) |
| `extension/src/agents/tools/system/index.ts`        | System tools registration pattern                |
| `extension/src/agents/toolLoaders.ts`               | Role-based tool loading                          |
| `specs/013-test-runner-tools/spec.md`               | Full feature specification                       |
| `specs/013-test-runner-tools/data-model.md`         | Complete type definitions                        |
| `specs/013-test-runner-tools/contracts/`            | Tool interface contracts                         |

## 8. Common Pitfalls

1. **`exactOptionalPropertyTypes`**: Don't assign `undefined` to optional properties — use conditional adds
2. **ESM imports**: Always use `.js` extensions (`import { x } from "./types.js"`)
3. **Vitest `--failed`**: Does NOT exist as CLI flag — must build own failure tracking
4. **`z.output` not `z.infer`**: Use `z.output<typeof Schema>` for types with defaults
5. **Git in tests**: Mock `child_process.spawn` — don't run actual git commands in unit tests
6. **Cache key normalization**: Normalize paths (no trailing slashes, consistent separators)
