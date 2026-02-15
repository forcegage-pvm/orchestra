# Research: Pre-Signal Test Migration

## Overview

This document consolidates research findings for migrating Orchestra's pre-signal test verification from direct shell command execution to using extension test runner tools.

---

## 1. Current Shell Command Patterns

### Decision: Standardize on `run_tests` tool with `scope` parameter

### Rationale

The current implementation in [pre-signal-executor.ts](../../src/core/pre-signal-executor.ts) uses framework-specific shell commands:

| Framework      | Current Pattern                             | Issues                         |
| -------------- | ------------------------------------------- | ------------------------------ |
| Vitest (JS/TS) | `npx vitest run --testNamePattern="${tag}"` | Hardcoded, fragile escaping    |
| Flutter        | `flutter test --tags ${tag}`                | Framework detection needed     |
| Pytest         | `pytest -m ${tag}`                          | Marker syntax differs          |
| Cargo          | `cargo test --features ${tag}`              | Feature flags differ from tags |
| Go             | `go test -run ${pattern}`                   | Different pattern semantics    |

### Alternatives Considered

1. **Normalize shell commands per framework** — High maintenance, error-prone escaping
2. **Abstract command builder** — Still testing framework drift risk
3. **Use `run_tests` tool (CHOSEN)** — Single interface, tier-aware, already handles Vitest

---

## 2. TDD Detection Mechanism

### Decision: Directory-based detection (`test/red/`) replacing content tags

### Rationale

Current tag patterns require file content scanning:

```typescript
// Current patterns in tdd-marker-scanner.ts
const TAG_PATTERNS = {
  vitest: /describe\.skip\(.*\[tdd-red\]|it\.skip\(.*\[tdd-red\]/,
  flutter: /@Tags\(\['tdd-red'\]\)/,
  pytest: /@pytest\.mark\.tdd_red/,
  rust: /#\[tdd_red\]/,
};
```

Problems:

- Content scanning is O(n×m) for n files × m patterns
- Framework-specific syntax
- `// @orchestra-task: N` inline comments conflict with clean promotion

Directory-based detection:

- File existence check is O(1)
- Framework-agnostic
- Natural promotion via file move

### Alternatives Considered

1. **Keep tag-based with improved scanning** — Doesn't solve promotion collision
2. **Hybrid approach (tags + directory)** — Too complex, two sources of truth
3. **Directory-only (CHOSEN)** — Clean separation, simple promotion

---

## 3. Test Runner Tools Integration

### Decision: Extract core pipeline for shared use by extension tools and pre-signal-executor

### Rationale

The extension provides mature tooling already:

**`run_tests` Interface:**

```typescript
interface RunTestsInput {
  scope: "file" | "pattern" | "suite" | "related" | "red" | "failed" | "all";
  target?: string; // File/pattern/tier name
  timeout?: number; // Override default
  max_failure_lines?: number;
}

interface RunTestsResult {
  summary: string; // "PASS | 12 passed, 0 failed | 1.2s"
  total;
  passed;
  failed;
  skipped: number;
  tests: TestOutcome[];
  redPhase?: RedPhaseResult; // When scope="red" or tier.inverted=true
}
```

**`promote_tests` Interface:**

```typescript
interface PromoteTestsInput {
  files: string[]; // Paths within test/red/
  dry_run?: boolean;
}

interface PromoteTestsResult {
  promoted: PromotionRecord[]; // { source, destination, tier }
  blocked: PromotionBlockedRecord[]; // { source, reason, message }
}
```

### Integration Pattern

Create shared core module callable by both extension tools and MCP handlers:

```typescript
// src/core/test-runner.ts (new)
export async function runTestsCore(
  options: TestRunnerOptions,
): Promise<TestResult>;
export async function promoteTestsCore(
  options: PromoteOptions,
): Promise<PromotionResult>;
```

### Alternatives Considered

1. **MCP handler calls extension tool** — Cross-process complexity
2. **Duplicate logic in MCP** — Maintenance burden, drift risk
3. **Shared core module (CHOSEN)** — Single source of truth

---

## 4. Tier Configuration Schema

### Decision: Extend existing `.agent-test-config.json` with `inverted` flag for TDD tiers

### Rationale

Current schema supports TDD red-phase via `inverted: true`:

```json
{
  "framework": "vitest",
  "defaultTimeout": 30000,
  "tiers": [
    {
      "name": "red",
      "path": "test/red/**/*.test.ts",
      "timeout": 30000,
      "inverted": true
    },
    { "name": "smoke", "path": "test/smoke/**/*.test.ts", "timeout": 10000 },
    { "name": "unit", "path": "test/unit/**/*.test.ts", "timeout": 120000 }
  ],
  "promotion": { "dryRun": true }
}
```

Red-phase semantics with `inverted: true`:

- Failing tests = **correct** (awaiting implementation)
- All tests pass = **eligible for promotion**
- Promotion path: `test/red/{tier}/{path}` → `test/{tier}/{path}`

### Alternatives Considered

1. **Separate red-phase config** — Fragmented configuration
2. **Convention-only (no config)** — Implicit behavior is error-prone
3. **Tier-level inverted flag (CHOSEN)** — Explicit, already implemented

---

## 5. Verification Criteria Format

### Decision: Declarative `test_verification` schema replacing shell `behavioral_checks`

### Rationale

Current `behavioral_checks` allows arbitrary shell commands:

```yaml
# Current (problematic)
behavioral_checks:
  - command: "npm test -- --testNamePattern='feature'"
    pattern: "passed"
```

Issues:

- Arbitrary shell execution is security concern
- Shell escaping differs per platform
- No standard interpretation of results

Declarative format:

```yaml
# Target format
test_verification:
  - tier: "smoke"
    expect: "all_pass"
  - tier: "unit"
    expect: "all_pass"
  - tier: "red"
    expect: "any_fail"
```

### Zod Schema

```typescript
// src/schemas/verification.ts
export const TestExpectationSchema = z.enum([
  "all_pass", // Every test passes
  "any_fail", // At least one test fails (TDD red-phase)
  "min_pass_count", // Specific count passes (with additional param)
]);

export const TestVerificationSchema = z.object({
  tier: z.string(),
  expect: TestExpectationSchema,
  min_pass_count: z.number().optional(), // Required when expect="min_pass_count"
});
```

### Enforcement

1. **Schema validation** at `prepare_task` — Reject raw shell `test_command` in verification
2. **Controller review** — Validates handover doesn't leak shell commands
3. **Pattern blocklist** — Reject common test command patterns

### Alternatives Considered

1. **Sanitize shell commands** — Impossible to fully sanitize
2. **Allowlist specific commands** — Too restrictive, drift risk
3. **Declarative-only schema (CHOSEN)** — Type-safe, auditable

---

## 6. Task ID Association

### Decision: Keep `// @orchestra-task: N` for provenance, strip on promotion

### Rationale

The comment `// @orchestra-task: N` serves two purposes:

1. Link test file to creating task during development
2. Audit trail for verification

Post-promotion, the link is no longer needed—the test is now part of the standard suite.

### Implementation

```typescript
// In promote_tests
async function removeTaskComment(content: string): Promise<string> {
  return content.replace(/\/\/ @orchestra-task:\s*\d+\n?/g, "");
}
```

### Alternatives Considered

1. **Keep comment permanently** — Clutters production code
2. **External provenance tracking** — Adds complexity
3. **Strip on promotion (CHOSEN)** — Clean test files, metadata preserved in history

---

## 7. Files Requiring Modification

### Core Files

| File                                                            | Current Behavior        | Migration             |
| --------------------------------------------------------------- | ----------------------- | --------------------- |
| [pre-signal-executor.ts](../../src/core/pre-signal-executor.ts) | Shell commands          | Call `runTestsCore()` |
| [tdd-marker-scanner.ts](../../src/core/tdd-marker-scanner.ts)   | Tag content scanning    | Path-based detection  |
| [tdd-scan-on-signal.ts](../../src/core/tdd-scan-on-signal.ts)   | Globs + content scan    | Directory listing     |
| [tdd-cleanup.ts](../../src/core/tdd-cleanup.ts)                 | Strip tags from content | Move files            |

### Schema Files

| File                                                             | Change                   |
| ---------------------------------------------------------------- | ------------------------ |
| [src/schemas/verification.ts](../../src/schemas/) (NEW)          | `TestVerificationSchema` |
| [prepare-task.ts](../../src/mcp-server/handlers/prepare-task.ts) | Schema validation        |
| [verify-task.ts](../../src/mcp-server/handlers/verify-task.ts)   | Call `runTestsCore()`    |

### Agent Documentation

| File                                                                                      | Change                              |
| ----------------------------------------------------------------------------------------- | ----------------------------------- |
| [orchestra.implementor.agent.md](../../extension/agents/orchestra.implementor.agent.md)   | Remove `[tdd-red]` references       |
| [orchestra.orchestrator.agent.md](../../extension/agents/orchestra.orchestrator.agent.md) | Update verification criteria format |

---

## 8. Open Questions Resolved

| Question                       | Resolution                                                               |
| ------------------------------ | ------------------------------------------------------------------------ |
| Timeout handling               | Use tier-configured timeouts from `.agent-test-config.json`              |
| Comment handling on promotion  | Remove `// @orchestra-task: N`                                           |
| Pre-signal failure reporting   | Minimal output with guidance to run tests manually                       |
| Shell command blocking         | Schema enforcement at `prepare_task` + Controller review                 |
| Multi-file promotion atomicity | Fail-fast (stop on first failure)                                        |
| File system errors             | Return `blocked` with `reason: "file-missing"` or `"destination-exists"` |

---

## Summary

The migration replaces framework-specific shell commands with a unified `run_tests` tool interface, and content-based tag detection with directory-based organization. Core logic is extracted to a shared module usable by both extension tools and MCP handlers, ensuring consistent behavior across all integration points.

Key design principles:

1. **Single source of truth** — Test runner logic in `src/core/test-runner.ts`
2. **Declarative verification** — Schema-validated `test_verification` blocks
3. **Directory-based TDD** — `test/red/{tier}/` organization
4. **Clean promotion** — File moves strip task comments
