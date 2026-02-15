# Quickstart: Pre-Signal Test Migration

## Overview

This guide explains how to implement the migration from shell-based test execution to declarative test verification using extension test runner tools.

---

## Prerequisites

- Node.js 18+
- TypeScript 5.x
- Understanding of Orchestra's task verification workflow

---

## Key Changes Summary

| Before                                           | After                                   |
| ------------------------------------------------ | --------------------------------------- |
| Shell commands (`npm test -- --testNamePattern`) | `run_tests` tool with `scope` parameter |
| Content-based tags (`[tdd-red]`)                 | Directory-based detection (`test/red/`) |
| `behavioral_checks` in handover                  | `test_verification` array               |
| Tag stripping on promotion                       | File move with comment removal          |

---

## Step 1: Create Verification Schema

### File: `src/schemas/verification.ts`

```typescript
import { z } from "zod";

export const TestExpectationSchema = z.enum([
  "all_pass",
  "any_fail",
  "min_pass_count",
]);

export const TestVerificationCriteriaSchema = z
  .object({
    tier: z.string().min(1, "Tier name is required"),
    expect: TestExpectationSchema,
    min_pass_count: z.number().int().nonnegative().optional(),
  })
  .refine(
    (data) =>
      data.expect !== "min_pass_count" || data.min_pass_count !== undefined,
    { message: "min_pass_count required when expect='min_pass_count'" },
  );

export type TestVerificationCriteria = z.output<
  typeof TestVerificationCriteriaSchema
>;
```

---

## Step 2: Extract Shared Test Runner Core

### File: `src/core/test-runner.ts`

Create a shared module that both extension tools and MCP handlers can use:

```typescript
import { TestConfigLoader } from "./testing/TestConfigLoader.js";
import { ScopeResolver } from "./testing/ScopeResolver.js";
import { VitestRunner } from "./testing/VitestRunner.js";
import { ResultFormatter } from "./testing/ResultFormatter.js";

export interface RunTestsOptions {
  workspaceRoot: string;
  scope: "file" | "pattern" | "suite" | "red" | "all";
  target?: string;
  timeout?: number;
  force?: boolean;
}

export interface TestResult {
  passed: number;
  failed: number;
  total: number;
  duration: number;
  summary: string;
  redPhase?: RedPhaseResult;
}

export async function runTestsCore(
  options: RunTestsOptions,
): Promise<TestResult> {
  const loader = new TestConfigLoader(options.workspaceRoot);
  const config = await loader.load();

  const resolver = new ScopeResolver(options.workspaceRoot);
  const { files, tier } = await resolver.resolve(
    options.scope,
    options.target,
    config,
  );

  const runner = new VitestRunner();
  const vitestResult = await runner.execute({
    files,
    config: config.configPath,
    timeout: options.timeout ?? tier?.timeout ?? config.defaultTimeout,
  });

  const formatter = new ResultFormatter();
  return formatter.format(vitestResult.vitestJson, {
    isRedPhase: tier?.inverted === true,
    maxFailureLines: config.maxFailureLines,
  });
}
```

---

## Step 3: Update Pre-Signal Executor

### File: `src/core/pre-signal-executor.ts`

Replace shell command execution with `runTestsCore`:

```typescript
// BEFORE (shell command)
async function runTddRedPhaseTests(
  workspaceRoot: string,
): Promise<CheckResult> {
  const cmd = await getTddCommands(workspaceRoot);
  const result = await execCommand(cmd, { cwd: workspaceRoot });
  return parseTestOutput(result.stdout);
}

// AFTER (declarative)
import { runTestsCore } from "./test-runner.js";

async function runTddRedPhaseTests(
  workspaceRoot: string,
): Promise<CheckResult> {
  const result = await runTestsCore({
    workspaceRoot,
    scope: "red",
  });

  return {
    passed: result.redPhase?.filesInRedPhase! > 0, // Has expected failures
    output: result.summary,
    duration_ms: result.duration,
  };
}
```

---

## Step 4: Update TDD Detection

### File: `src/core/tdd-marker-scanner.ts`

Replace content scanning with path-based detection:

```typescript
// BEFORE (content scanning)
export async function scanForTddRedMarkers(
  file: string,
): Promise<TddMarker | null> {
  const content = await fs.readFile(file, "utf-8");
  for (const [framework, pattern] of Object.entries(TAG_PATTERNS)) {
    if (pattern.test(content)) {
      return { file, framework, taskId: extractTaskId(content) };
    }
  }
  return null;
}

// AFTER (path-based detection)
export async function detectTddRedFile(
  file: string,
): Promise<TddRedFile | null> {
  // Must be in test/red/ directory
  const relativePath = path.relative(workspaceRoot, file);
  if (!relativePath.startsWith("test/red/")) {
    return null;
  }

  // Extract tier from path: test/red/{tier}/{...}
  const parts = relativePath.split(path.sep);
  const tier = parts[2]; // ['test', 'red', 'unit', 'foo.test.ts']

  // Extract task ID from content (still needed for association)
  const content = await fs.readFile(file, "utf-8");
  const taskId = extractOrchestraTaskId(content);

  return {
    path: relativePath,
    targetTier: tier,
    promotionTarget: relativePath.replace("test/red/", "test/"),
    taskId,
    status: "failing",
  };
}
```

---

## Step 5: Update Promotion Logic

### File: `src/core/tdd-cleanup.ts`

Replace tag stripping with file move:

```typescript
// BEFORE (content modification)
export async function stripTddTags(file: string): Promise<void> {
  let content = await fs.readFile(file, "utf-8");
  for (const pattern of TAG_PATTERNS) {
    content = content.replace(pattern, "");
  }
  content = content.replace(/\/\/ @orchestra-task:\s*\d+\n?/g, "");
  await fs.writeFile(file, content);
}

// AFTER (file move with comment removal)
export async function promoteTest(file: TddRedFile): Promise<PromotionResult> {
  // Read and clean content
  let content = await fs.readFile(file.path, "utf-8");
  content = content.replace(/\/\/ @orchestra-task:\s*\d+\n?/g, "");

  // Ensure destination directory exists
  const destDir = path.dirname(file.promotionTarget);
  await fs.mkdir(destDir, { recursive: true });

  // Write to destination
  await fs.writeFile(file.promotionTarget, content);

  // Remove source
  await fs.unlink(file.path);

  return {
    source: file.path,
    destination: file.promotionTarget,
    tier: file.targetTier,
  };
}
```

---

## Step 6: Add Validation to prepare_task

### File: `src/mcp-server/handlers/prepare-task.ts`

Add validation that rejects shell commands in verification:

```typescript
import {
  TestVerificationCriteriaSchema,
  containsShellTestCommand,
} from "../../schemas/verification.js";

async function validateHandover(
  handover: HandoverNote,
): Promise<ValidationResult> {
  const errors: string[] = [];

  // Validate test_verification if present
  if (handover.test_verification) {
    for (const criterion of handover.test_verification) {
      const result = TestVerificationCriteriaSchema.safeParse(criterion);
      if (!result.success) {
        errors.push(`Invalid test_verification: ${result.error.message}`);
      }
    }
  }

  // Reject shell commands in behavioral_checks
  if (handover.behavioral_checks) {
    for (const check of handover.behavioral_checks) {
      if (containsShellTestCommand(check.command)) {
        errors.push(
          `Shell test commands are not allowed. Use test_verification instead.`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
```

---

## Step 7: Update verify_task Handler

### File: `src/mcp-server/handlers/verify-task.ts`

Use `runTestsCore` for test verification:

```typescript
import { runTestsCore } from "../../core/test-runner.js";
import type { TestVerificationCriteria } from "../../schemas/verification.js";

async function evaluateTestVerification(
  criteria: TestVerificationCriteria[],
  workspaceRoot: string,
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  for (const criterion of criteria) {
    const testResult = await runTestsCore({
      workspaceRoot,
      scope: "suite",
      target: criterion.tier,
    });

    let passed: boolean;
    switch (criterion.expect) {
      case "all_pass":
        passed = testResult.failed === 0;
        break;
      case "any_fail":
        passed = testResult.failed > 0;
        break;
      case "min_pass_count":
        passed = testResult.passed >= criterion.min_pass_count!;
        break;
    }

    results.push({
      tier: criterion.tier,
      expectation: criterion.expect,
      actual: { passed: testResult.passed, failed: testResult.failed },
      passed,
      message: passed
        ? `✓ ${criterion.tier}: ${criterion.expect} satisfied`
        : `✗ ${criterion.tier}: expected ${criterion.expect} but got ${testResult.passed} passed, ${testResult.failed} failed`,
    });
  }

  return results;
}
```

---

## Directory Structure

After migration, your test directory should look like:

```
test/
├── smoke/           # Fast sanity checks
│   └── ...
├── unit/            # Standard unit tests
│   └── ...
├── integration/     # Cross-module tests
│   └── ...
└── red/             # TDD red-phase (tests awaiting implementation)
    ├── unit/        # Will promote to test/unit/
    │   └── foo.test.ts
    └── integration/ # Will promote to test/integration/
        └── bar.test.ts
```

---

## Configuration

### `.agent-test-config.json`

```json
{
  "framework": "vitest",
  "defaultTimeout": 30000,
  "maxFailureLines": 20,
  "tiers": [
    {
      "name": "red",
      "path": "test/red/**/*.test.ts",
      "timeout": 30000,
      "inverted": true
    },
    { "name": "smoke", "path": "test/smoke/**/*.test.ts", "timeout": 10000 },
    { "name": "unit", "path": "test/unit/**/*.test.ts", "timeout": 120000 },
    {
      "name": "integration",
      "path": "test/integration/**/*.test.ts",
      "timeout": 300000
    }
  ],
  "promotion": { "dryRun": true }
}
```

---

## Handover Example

### Before (deprecated)

```yaml
behavioral_checks:
  - command: "npm test -- --testNamePattern='user-service'"
    expected_output: "passed"
```

### After (declarative)

```yaml
test_verification:
  - tier: unit
    expect: all_pass
  - tier: red
    expect: any_fail
```

---

## Testing the Migration

1. **Verify schema validation**:

   ```bash
   npm run test -- --grep "verification schema"
   ```

2. **Verify shell command rejection**:

   ```bash
   npm run test -- --grep "reject shell commands"
   ```

3. **Verify promotion flow**:

   ```bash
   npm run test -- --grep "promote tests"
   ```

4. **End-to-end task verification**:
   ```bash
   npm run test -- --grep "verify task with test_verification"
   ```

---

## Troubleshooting

### Schema validation fails

**Error**: `Invalid test_verification: Tier name is required`

**Fix**: Ensure every criterion has a non-empty `tier` property.

### Unknown tier referenced

**Error**: `Tier 'foo' not found in .agent-test-config.json`

**Fix**: Add the tier to your test configuration or use an existing tier name.

### Tests not discovered

**Error**: `No tests found for scope 'red'`

**Fix**: Ensure files are in `test/red/{tier}/` and match the glob pattern.

### Promotion blocked

**Error**: `Promotion blocked: still-failing`

**Fix**: All tests in the file must pass before promotion. Check test output.
