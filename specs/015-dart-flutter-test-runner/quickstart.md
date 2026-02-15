# Quickstart: Dart/Flutter Test Runner Backend

**Feature**: 015-dart-flutter-test-runner  
**Date**: 2025-02-15

## Verification Walkthrough

This guide walks through verifying the implementation at each phase checkpoint.

---

## Phase 1 Checkpoint: Runner Abstraction (Vitest Regression)

**Goal**: Verify that the TestRunner interface is in place and existing Vitest pipeline works identically.

### Step 1: Verify TestRunner interface exists

```bash
# Check the new file is created with correct exports
grep -c "export interface TestRunner" src/core/testing/TestRunner.ts
# Expected: 1

grep -c "export type TestFramework" src/core/testing/TestRunner.ts
# Expected: 1
```

### Step 2: Verify VitestRunner implements TestRunner

```bash
grep "implements TestRunner" src/core/testing/VitestRunner.ts
# Expected: "export class VitestRunner implements TestRunner {"
```

### Step 3: Verify config schema accepts new frameworks

```bash
grep 'z.enum' src/core/testing/TestConfigLoader.ts
# Expected: contains "vitest", "dart", "flutter"
```

### Step 4: Run existing test suite (CRITICAL — must be 0 regressions)

```bash
npm test
# Expected: All existing tests pass with no failures
```

### Step 5: Verify barrel exports

```bash
grep "TestRunner" src/core/testing/index.ts
grep "TestRunnerFactory" src/core/testing/index.ts
# Expected: Both exported
```

---

## Phase 2 Checkpoint: DartRunner Core

**Goal**: Verify Dart test execution works through the pipeline.

### Step 1: Verify DartRunner creates correct commands

```typescript
// In a test or REPL:
import { DartRunner } from "./src/core/testing/DartRunner.js";

const runner = new DartRunner("flutter");
const cmd = runner.buildCommand({
  files: ["test/unit/"],
  workingDir: "/project",
  excludeTags: ["red", "e2e"],
});
console.log(cmd);
// Expected: ["flutter", "test", "--reporter=json", "--exclude-tags", "red,e2e", "--no-pub", "test/unit/"]
```

### Step 2: Verify NDJSON parsing with fixture

```bash
cd testing/tdd-test-harness/dart
dart test --reporter=json 2>/dev/null | head -20
# Expected: NDJSON lines, each a JSON object with "type" field
```

### Step 3: Run DartRunner unit tests

```bash
npx vitest run test/unit/core/testing/DartRunner.test.ts
# Expected: All NDJSON parsing tests pass
```

### Step 4: Verify factory wiring

```typescript
import { TestRunnerFactory } from "./src/core/testing/TestRunnerFactory.js";

const runner = TestRunnerFactory.create("dart");
console.log(runner.framework); // "dart"

const runner2 = TestRunnerFactory.create("flutter");
console.log(runner2.framework); // "flutter"
```

---

## Phase 3 Checkpoint: Dart Related Scope

**Goal**: Verify `scope: "related"` discovers correct Dart test files.

### Step 1: Verify naming convention resolution

Given fixture structure:

```
lib/src/services/auth.dart
test/unit/services/auth_test.dart
```

```typescript
import { DartRelatedResolver } from "./src/core/testing/DartRelatedResolver.js";

const resolver = new DartRelatedResolver("/project");
const results = await resolver.resolve(["lib/src/services/auth.dart"]);
// Expected: [{ testFile: "test/unit/services/auth_test.dart", reason: "naming-convention", depth: 0 }]
```

### Step 2: Verify import graph caching

```typescript
import { DartImportGraph } from "./src/core/testing/DartImportGraph.js";

const graph = new DartImportGraph("/project");
const t1 = Date.now();
await graph.getGraph(); // First call: builds graph
const t2 = Date.now();
await graph.getGraph(); // Second call: returns cached
const t3 = Date.now();
// Expected: t3 - t2 << t2 - t1 (cache hit is near-instant)
```

### Step 3: Run related resolver tests

```bash
npx vitest run test/unit/core/testing/DartRelatedResolver.test.ts
npx vitest run test/unit/core/testing/DartImportGraph.test.ts
# Expected: All tests pass
```

---

## Phase 4 Checkpoint: Pre-Signal Integration

**Goal**: Pre-signal verification works for Dart/Flutter projects.

### Step 1: Verify pre-signal adapter uses factory

```bash
grep "TestRunnerFactory" src/core/pre-signal-test-adapter.ts
# Expected: Import and usage present

grep "new VitestRunner" src/core/pre-signal-test-adapter.ts
# Expected: No direct VitestRunner instantiation (0 matches)
```

### Step 2: Verify legacy fallback tag update

```bash
grep "exclude-tags" src/core/pre-signal-executor.ts
# Expected: "--exclude-tags red" (not "tdd-red")
```

### Step 3: Run integration test

```bash
npx vitest run test/integration/dart-pipeline.test.ts
# Expected: End-to-end Dart pipeline passes
```

---

## Phase 5 Checkpoint: Full Regression

### Step 1: All tests pass

```bash
npm test
# Expected: All tests pass (existing + new)
```

### Step 2: Extension tests pass

```bash
cd extension && npm test
# Expected: All extension tests pass
```

### Step 3: Type check passes

```bash
npm run typecheck
# Expected: No type errors
```

### Step 4: Lint passes

```bash
npm run lint
# Expected: No lint errors
```

---

## Example: Full Dart Project Configuration

To use the Dart runner in a project, create `.agent-test-config.json`:

```json
{
  "framework": "flutter",
  "tiers": [
    {
      "name": "red",
      "path": "test/red/**/*_test.dart",
      "timeout": 30000,
      "inverted": true
    },
    { "name": "smoke", "path": "test/smoke/**/*_test.dart", "timeout": 10000 },
    { "name": "unit", "path": "test/unit/**/*_test.dart", "timeout": 60000 },
    {
      "name": "integration",
      "path": "test/integration/**/*_test.dart",
      "timeout": 120000
    }
  ],
  "dartNoPub": true,
  "dartExcludeTags": ["e2e"]
}
```

Then use the Orchestra pipeline normally:

```
run_tests scope=suite target=unit       → Runs flutter test on test/unit/
run_tests scope=related                  → Maps changed files → discovers tests → runs
run_tests scope=red                      → Runs test/red/ with inverted expectations
```
