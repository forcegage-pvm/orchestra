# TD-022: Verification Pattern Pre-Validation

## Problem

Orchestrator repeatedly defines verification patterns during PREPARE that fail during VERIFY - not due to implementation issues, but because:

1. Structural check regex behaves differently than expected
2. Patterns are not validated before being committed to the database
3. Complex regex patterns fail when simple literal strings would work

This causes a wasteful cycle:
```
PREPARE → IMPLEMENT → VERIFY (spec error) → ESCALATE → fix patterns → DE-ESCALATE → VERIFY again
```

## Root Cause

No validation occurs in `prepare_task` or `update_verification` handlers before patterns are saved. The orchestrator has no feedback that their patterns won't work until verification runs post-implementation.

## Solution

### 1. Add Pattern Pre-Validation in `prepare_task` Handler

Before saving verification criteria, validate that:

```typescript
// In prepare-task.ts, before inserting verification checks

async function validateVerificationPatterns(
  verification: VerificationCriteria,
  workspacePath: string
): Promise<{ valid: boolean; warnings: string[]; errors: string[] }> {
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const check of verification.structural_checks ?? []) {
    // 1. Check if path/glob resolves to any files
    const files = await glob(check.path, { cwd: workspacePath });
    
    if (files.length === 0) {
      // Path doesn't exist yet - this is OK for CREATE operations
      warnings.push(`struct: Path '${check.path}' matches no files (OK if CREATE expected)`);
      continue;
    }

    // 2. Test pattern against existing files
    if (check.pattern) {
      let totalMatches = 0;
      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        const regex = new RegExp(check.pattern, 'gi');
        const matches = content.match(regex);
        totalMatches += matches?.length ?? 0;
      }
      
      if (totalMatches === 0) {
        warnings.push(
          `struct: Pattern '${check.pattern}' found 0 matches in ${files.length} file(s). ` +
          `This will FAIL verification. Consider using literal strings.`
        );
      } else if (totalMatches < (check.min_matches ?? 1)) {
        warnings.push(
          `struct: Pattern '${check.pattern}' found ${totalMatches} match(es), ` +
          `but min_matches=${check.min_matches}. This will FAIL verification.`
        );
      }
    }
  }

  return { valid: errors.length === 0, warnings, errors };
}
```

### 2. Return Warnings in `prepare_task` Response

```typescript
// In prepare_task output
{
  success: true,
  task_id: 7,
  status: "PENDING_HANDOVER_REVIEW",
  pattern_validation: {
    warnings: [
      "struct-1: Pattern 'auto.?trigger' found 0 matches. Consider 'Auto-trigger mode' instead."
    ]
  }
}
```

### 3. Add `--strict` Mode to Block on Warnings

Optional: Add a config flag `verification_pattern_strict_mode` that converts warnings to errors, blocking handover finalization until patterns are fixed.

### 4. Update `update_verification` Handler Similarly

Same validation logic in `update_verification` to catch spec errors during amendments.

## Acceptance Criteria

- [ ] `prepare_task` validates structural check patterns before saving
- [ ] Warnings returned in response when patterns don't match
- [ ] Errors returned if path is invalid (not a glob, not a file pattern)
- [ ] `update_verification` has same validation
- [ ] Tests cover pattern validation scenarios

## Impact

- **High** - This wastes 5-10 minutes per occurrence with escalation/de-escalation cycles
- **Frequency** - Happened 3+ times in Sprint 006 alone

## References

- Sprint 006 Task 6 escalation (struct-0, struct-2 failures)
- Sprint 006 Task 7 escalation (struct-1, struct-2, struct-3 failures)
- [TD-017-verification-pattern-matching.md](TD-017-verification-pattern-matching.md)
