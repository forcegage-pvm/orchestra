# TypeScript TDD Test Harness

This directory contains test fixtures for validating Orchestra's TDD red/green verification check templates.

## Test Categories

| File                                          | Description                         | Expected Behavior                      |
| --------------------------------------------- | ----------------------------------- | -------------------------------------- |
| `category1_tdd_red_failing.test.ts`           | TDD-red tests that FAIL             | ✅ Correct - red tests should fail     |
| `category2_tdd_red_passing_violation.test.ts` | TDD-red tests that PASS             | ❌ Violation - red tests must fail     |
| `category3_normal_failing_regression.test.ts` | Normal tests that FAIL              | ❌ Regression - normal tests must pass |
| `category4_normal_passing.test.ts`            | Normal tests that PASS              | ✅ Correct - normal tests should pass  |
| `mixed_file.test.ts`                          | Mix of red (fail) and normal (pass) | ✅ Demonstrates filtering works        |

## Running Tests

```bash
# Install dependencies
npm install

# Run all tests (will fail due to intentional failures)
npm test

# Run only TDD-red tagged tests (should exit 1 - failures expected)
npm run test:red

# Run only non-TDD-red tests (should exit 0 if no regressions)
npm run test:non-red
```

## Verification Check Validation

Use this harness to validate that the check-templates produce correct commands:

### TypeScript TDD Red-Phase Checks

1. **Tagged tests must FAIL**: `npm test -- --testNamePattern="\\[tdd-red\\]"` → exit code 1
2. **Non-tagged tests must PASS**: `npm test -- --testNamePattern="^(?!.*\\[tdd-red\\])"` → exit code 0
3. **Task-ID annotation present**: Pattern `//\\s*@orchestra-task:\\s*\\d+`
4. **Red-phase marker present**: Pattern `\\[tdd-red\\]`

## Expected Results

### Correct Configuration (category1 + category4 + mixed_file without category2/3)

```
┌─────────────────────────────────────────────────────────────┐
│ Check                          │ Result │ Explanation       │
├─────────────────────────────────────────────────────────────┤
│ Tagged tests fail (exit 1)     │ PASS   │ Red tests fail    │
│ Non-tagged tests pass (exit 0) │ PASS   │ Normal tests pass │
│ Task-ID annotation exists      │ PASS   │ // @orchestra-task: N │
│ [tdd-red] marker exists        │ PASS   │ In test names     │
└─────────────────────────────────────────────────────────────┘
```

### With Violations (category2 - red tests that pass)

```
┌─────────────────────────────────────────────────────────────┐
│ Check                          │ Result │ Explanation       │
├─────────────────────────────────────────────────────────────┤
│ Tagged tests fail (exit 1)     │ FAIL   │ Some pass!        │
│ Non-tagged tests pass (exit 0) │ PASS   │ Normal tests pass │
└─────────────────────────────────────────────────────────────┘
```

### With Regression (category3 - normal tests that fail)

```
┌─────────────────────────────────────────────────────────────┐
│ Check                          │ Result │ Explanation       │
├─────────────────────────────────────────────────────────────┤
│ Tagged tests fail (exit 1)     │ PASS   │ Red tests fail    │
│ Non-tagged tests pass (exit 0) │ FAIL   │ Regression!       │
└─────────────────────────────────────────────────────────────┘
```
