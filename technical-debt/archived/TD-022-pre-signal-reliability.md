# TD-022: Pre-Signal Check Reliability

## Status: OPEN

## Priority: P0 (Critical)

## Created: 2026-01-18

## Problem Statement

Pre-signal checks are unreliable and cause false failures that waste significant time. The implementor completes work correctly, but infrastructure issues cause failures that require manual intervention.

### Observed Failure Pattern (Sprint 006, Task 4)

1. Implementor completes implementation correctly
2. All 39 TDD tests pass when run manually
3. Pre-signal check times out (60s timeout, test suite takes 72s)
4. Task escalated with "abnormal failure"
5. Orchestrator spends 30+ minutes diagnosing
6. Root cause: inadequate timeout configuration

### Time Wasted

- Implementor time: ~10 minutes (did correct work, had to deal with false failure)
- Orchestrator time: ~30+ minutes (diagnosing, de-escalating, re-verifying)
- Total waste: ~40+ minutes per incident
- Frequency: Multiple times per sprint

## Root Causes

### 1. Insufficient Default Timeout

- **Global default**: 60s (in config table)
- **Code default**: 300s (5 minutes)
- **Actual test duration**: 72s
- **Problem**: Config table overrides code default with inadequate value

### 2. BUILD CHECKS DISABLED (CRITICAL)

- **Config**: `pre_signal_skip_build|true`
- **Impact**: TypeScript errors in handlers NOT caught before signal
- **Root Cause**: Someone disabled build to speed up pre-signal checks
- **Result**: Broken code (type errors) passes pre-signal, wastes verification time

### 3. No Timeout vs Failure Differentiation

- Pre-signal check reports `test_status: FAIL` for both:
  - Actual test failures
  - Timeouts
- The `timedOut: true` flag exists but doesn't prevent FAIL status
- Workflow treats timeout same as test failure

### 3. No Automatic Retry on Timeout

- Transient timeouts (system load, etc.) cause permanent failure
- No retry mechanism for infrastructure issues
- Human must manually de-escalate and retry

### 4. Stale Signal Blocks Retry

- Once a signal has `test_status: FAIL`, it persists
- Implementor must signal again (which re-runs all checks)
- No way to "re-run checks only" without full signal

### 5. No Sprint-Level Timeout Inheritance

- Each new sprint uses global defaults
- Previous sprint learnings (Sprint 003: 120s, Sprint 004: 180s) not applied
- Must manually configure each sprint

### 6. Test Suite Performance

- 72s for 424 tests (parallel execution)
- 28.8s in "collect" phase (TypeScript compilation)
- Growing test count increases timeout risk

## Proposed Solutions

### Immediate Fix (Applied)

- [x] Set global `pre_signal_timeout` to 180000ms (180s)

### Short-Term Fixes

#### A. Differentiate Timeout from Failure

```typescript
// In signal-completion.ts
if (preSignalChecks.test.timedOut) {
  // Timeout is INFRASTRUCTURE issue, not implementation issue
  throw new Error(
    `Pre-signal check TIMED OUT after ${timeout}ms. ` +
      `This is likely a configuration issue, not an implementation failure. ` +
      `Current timeout: ${timeout}ms. Consider increasing pre_signal_timeout.`,
  );
}
```

#### B. Add Retry on Timeout

```typescript
// In pre-signal-executor.ts
const MAX_RETRIES = 2;
for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  const result = await executeCommand(command, options);
  if (!result.timedOut) return result;
  console.warn(`Attempt ${attempt} timed out, retrying...`);
}
```

#### C. Smart Timeout Calculation

```typescript
// Base timeout + time per test estimate
const estimatedDuration = baseTimeout + testCount * 150; // 150ms per test
const timeout = Math.max(config.timeout, estimatedDuration * 1.5);
```

### Medium-Term Fixes

#### D. Pre-Signal Check Health Dashboard

- Track timeout frequency per sprint
- Alert when timeout rate > threshold
- Suggest timeout adjustments based on actual test duration

#### E. Incremental Test Execution

- Only run tests for changed files
- Use Vitest's `--changed` flag
- Reduces test time significantly

#### F. Test Performance Budgets

- Track test suite duration over time
- Alert when duration grows significantly
- Identify slow tests for optimization

### Long-Term Fixes

#### G. Test Parallelization Improvements

- Use `--pool=threads` instead of forks
- Reduces per-test overhead
- Consider test sharding for CI

#### H. Watch Mode for Implementor

- Provide Vitest watch mode during implementation
- Pre-signal checks can skip if recent watch run passed
- Trust recent local results

## Success Metrics

- Pre-signal timeout incidents: < 1 per sprint
- False failure rate: < 5%
- Average pre-signal check duration: < 2 minutes
- Time wasted on infrastructure issues: < 5% of implementation time

## Related Issues

- TD-021: Pre-signal lint/format config
- Config table pollution (250+ test_update_key entries)

## Action Items

1. [x] Increase global timeout to 180s
2. [x] Re-enable build checks (`pre_signal_skip_build=false`)
3. [x] Add timeout vs failure differentiation in error messages (code updated)
4. [ ] Add retry logic for timeouts (with backoff)
5. [ ] Clean up config table test pollution
6. [ ] Document sprint setup checklist including timeout config
7. [ ] Consider test performance tracking

## References

- Sprint 003: First identified timeout issue (120s fix)
- Sprint 004: Increased to 180s for scan-on-signal workload
- Sprint 006 Task 4: False escalation due to 60s timeout
