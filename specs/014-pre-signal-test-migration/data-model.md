# Data Model: Pre-Signal Test Migration

## Overview

This document defines the data entities, their relationships, validation rules, and state transitions for the pre-signal test migration feature.

---

## Entities

### 1. TestVerificationCriteria

**Purpose:** Declarative specification for test-based verification in task handover.

**Location:** Defined in `src/schemas/verification.ts`

```typescript
interface TestVerificationCriteria {
  tier: string; // Tier name from .agent-test-config.json
  expect: TestExpectation; // Expected outcome
  min_pass_count?: number; // Required when expect="min_pass_count"
}

type TestExpectation = "all_pass" | "any_fail" | "min_pass_count";
```

**Fields:**

| Field            | Type   | Required    | Validation                               | Description                   |
| ---------------- | ------ | ----------- | ---------------------------------------- | ----------------------------- |
| `tier`           | string | ✓           | Must match tier in config                | Test tier to execute          |
| `expect`         | enum   | ✓           | One of defined values                    | Expected verification outcome |
| `min_pass_count` | number | conditional | ≥ 0, required if expect="min_pass_count" | Minimum passing tests         |

**Constraints:**

- `tier` must exist in project's `.agent-test-config.json`
- `min_pass_count` only valid when `expect="min_pass_count"`
- Cannot contain shell commands or patterns

---

### 2. TestTier

**Purpose:** Configuration for a test suite tier (smoke, unit, integration, red).

**Location:** Defined in `.agent-test-config.json`, Zod schema in `src/core/testing/config.ts`

```typescript
interface TestTier {
  name: string; // Unique tier identifier
  path: string; // Glob pattern for test files
  timeout?: number; // Tier-specific timeout (ms)
  inverted?: boolean; // TDD red-phase semantics
}
```

**Fields:**

| Field      | Type    | Required | Validation           | Description                    |
| ---------- | ------- | -------- | -------------------- | ------------------------------ |
| `name`     | string  | ✓        | Unique within config | Tier identifier                |
| `path`     | string  | ✓        | Valid glob pattern   | Test file discovery pattern    |
| `timeout`  | number  |          | > 0                  | Override default timeout       |
| `inverted` | boolean |          |                      | If true, failures are expected |

**Constraints:**

- Tier names must be unique within configuration
- `path` patterns must not overlap excessively
- `inverted: true` implies TDD red-phase verification

---

### 3. TddRedFile

**Purpose:** Tracks test files in red-phase awaiting implementation.

**Location:** In-memory during test execution, derived from directory listing.

```typescript
interface TddRedFile {
  path: string; // Relative path: test/red/{tier}/{name}
  targetTier: string; // Extracted tier from path
  promotionTarget: string; // Where file goes on promotion
  taskId?: number; // From // @orchestra-task: N comment
  status: TddRedFileStatus; // Current state
}

type TddRedFileStatus = "failing" | "passing" | "promoted";
```

**Fields:**

| Field             | Type   | Required | Validation            | Description           |
| ----------------- | ------ | -------- | --------------------- | --------------------- |
| `path`            | string | ✓        | Must be in test/red/  | Source file location  |
| `targetTier`      | string | ✓        | Valid tier name       | Destination tier      |
| `promotionTarget` | string | ✓        | Outside test/red/     | Promotion destination |
| `taskId`          | number |          | > 0                   | Associated task ID    |
| `status`          | enum   | ✓        | One of defined values | Current file state    |

**Constraints:**

- Path must follow `test/red/{tier}/{...path}` structure
- Promotion target is derived: `test/{tier}/{...path}`
- `taskId` extracted from `// @orchestra-task: N` in file content

---

### 4. TestRunResult

**Purpose:** Outcome of a test execution for verification decision.

**Location:** Returned from `runTestsCore()`, stored in `sharedResultStore`

```typescript
interface TestRunResult {
  runId: string; // Unique run identifier
  scope: TestScope; // How tests were selected
  target?: string; // Scope-specific target
  timestamp: number; // Execution timestamp
  duration: number; // Execution duration (ms)

  // Aggregate counts
  total: number;
  passed: number;
  failed: number;
  skipped: number;

  // Individual test outcomes
  tests: TestOutcome[];

  // TDD red-phase metadata (when applicable)
  redPhase?: RedPhaseResult;
}

interface TestOutcome {
  name: string; // Full test name
  file: string; // Test file path
  line?: number; // Line number if available
  status: "passed" | "failed" | "skipped";
  failure?: TestFailure; // Present when status="failed"
}

interface RedPhaseResult {
  filesEligible: number; // Files where all tests pass
  filesInRedPhase: number; // Files with at least one failure
  promotionTargets: PromotionTarget[];
}
```

---

### 5. VerificationJudgment

**Purpose:** Result of evaluating test results against verification criteria.

**Location:** Used in `verify-task.ts` handler

```typescript
interface VerificationJudgment {
  criteriaIndex: number; // Index in test_verification array
  tier: string; // Tier that was verified
  expectation: TestExpectation; // What was expected
  actual: TestActual; // What was observed
  passed: boolean; // Whether expectation was met
  message: string; // Human-readable explanation
}

interface TestActual {
  total: number;
  passed: number;
  failed: number;
}
```

---

## Relationships

```
┌────────────────────────────┐
│   Task Handover            │
│   (tasks.handover_note)    │
└──────────────┬─────────────┘
               │ contains
               ▼
┌────────────────────────────┐
│   TestVerificationCriteria │──────────────────┐
│   (test_verification[])    │                  │
└──────────────┬─────────────┘                  │
               │ references                     │ validates against
               ▼                                ▼
┌────────────────────────────┐    ┌────────────────────────────┐
│   TestTier                 │    │   TestRunResult            │
│   (.agent-test-config.json)│◄───│   (from runTestsCore)      │
└──────────────┬─────────────┘    └────────────────────────────┘
               │ defines                        │
               ▼                                │ produces
┌────────────────────────────┐                  ▼
│   TddRedFile               │    ┌────────────────────────────┐
│   (test/red/{tier}/)       │    │   VerificationJudgment     │
└────────────────────────────┘    │   (passed/failed decision) │
                                  └────────────────────────────┘
```

---

## State Transitions

### TestVerificationCriteria Lifecycle

```
[Draft in prepare_task]
        │
        ▼ validate schema
[Validated in handover]
        │
        ▼ Controller reviews
[Approved for implement]
        │
        ▼ Implementor signals
[Evaluated in verify_task]
        │
        ├──► [Criteria Met] ──► task passes
        │
        └──► [Criteria Not Met] ──► task fails
```

### TddRedFile State Machine

```
[Created] ──► [Failing] ◄──────────────────────┐
    │             │                            │
    │             ▼ implementation fixes tests │
    │        [Passing] ──────────────────────┐ │
    │             │                          │ │
    │             ▼ promote_tests            │ │
    │        [Promoted] ✓                    │ │
    │                                        │ │
    └─────────────────────────────────────────┘
         (cycle if tests regress)
```

---

## Validation Rules

### TestVerificationCriteria

```typescript
// src/schemas/verification.ts
const TestVerificationCriteriaSchema = z
  .object({
    tier: z.string().min(1, "Tier name required"),
    expect: z.enum(["all_pass", "any_fail", "min_pass_count"]),
    min_pass_count: z.number().int().nonnegative().optional(),
  })
  .refine(
    (data) => {
      if (data.expect === "min_pass_count") {
        return data.min_pass_count !== undefined;
      }
      return true;
    },
    { message: "min_pass_count required when expect='min_pass_count'" },
  );
```

### Shell Command Rejection

```typescript
const REJECTED_PATTERNS = [
  /npm\s+test/i,
  /npx\s+vitest/i,
  /yarn\s+test/i,
  /pnpm\s+test/i,
  /jest\b/i,
  /mocha\b/i,
  /pytest\b/i,
  /cargo\s+test/i,
  /go\s+test/i,
  /flutter\s+test/i,
];

function containsShellCommand(text: string): boolean {
  return REJECTED_PATTERNS.some((pattern) => pattern.test(text));
}
```

### Tier Validation

```typescript
async function validateTierExists(
  tierName: string,
  workspaceRoot: string,
): Promise<boolean> {
  const configPath = path.join(workspaceRoot, ".agent-test-config.json");
  const config = await loadTestConfig(configPath);
  return config.tiers.some((t) => t.name === tierName);
}
```

---

## Migration Notes

### From `behavioral_checks` to `test_verification`

**Before (deprecated):**

```yaml
behavioral_checks:
  - command: "npm test -- --testNamePattern='feature'"
    expected_output: "passed"
```

**After:**

```yaml
test_verification:
  - tier: "unit"
    expect: "all_pass"
  - tier: "red"
    expect: "any_fail"
```

### From `tdd_red_registry` to Directory-Based

**Before:** Database table storing file paths and markers

```sql
SELECT * FROM tdd_red_registry WHERE task_id = ?;
```

**After:** File system enumeration

```typescript
const redFiles = await glob("test/red/**/*.test.ts");
```

---

## Index Requirements

None—entities are transient or configuration-based. The `tdd_red_registry` table will be deprecated and eventually dropped after migration validation.
