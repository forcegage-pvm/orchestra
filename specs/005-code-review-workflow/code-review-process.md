# Code Review Process Requirements

**Feature**: 005-code-review-workflow  
**Status**: Draft  
**Last Updated**: 2026-01-17

---

## Purpose

Define the Controller code review process in a standalone document so it can be reviewed and iterated independently of the main spec.

---

## Core Principles

1. **Spec alignment first**: Ensure implementation matches the spec, handover, and task requirements.
2. **Functional correctness**: Verify the code does what it claims, including edge/error paths.
3. **Quality without paralysis**: Block only on material risk; otherwise prefer recommendations.
4. **Evidence-driven**: Decisions must cite concrete evidence (files, tests, or behavior).
5. **No verification leakage**: Controller never accesses hidden verification criteria.

---

## Review Focus (Mandatory)

1. **Requirements alignment**: task requirements, handover, and spec consistency.
2. **Functional behavior**: correctness for expected and edge cases.
3. **Architecture & constitution**: alignment with core-first design and constraints.
4. **Code quality**: readability, cohesion, and maintainability.
5. **Test meaningfulness**: tests validate behavior, not just pass conditions.
6. **Test sufficiency**: coverage protects against regressions.

---

## Additional Review Checks (Recommended)

- Error handling and failure modes.
- Security and data safety (validation, injection risks, secrets).
- Backward compatibility and migrations.
- Performance on hot paths and resource usage.
- Observability: logs, diagnostics, error messages.
- Configuration defaults and upgrade safety.
- Documentation updates (handover/spec/readme).

---

## Decision Policy (Tiered)

### Blocking Issues (Must Fix)

- Spec/requirement mismatch.
- Functional correctness defects.
- Security or safety risks.
- Data loss, corruption, or migration breakage.
- Test fraud (tests that do not validate behavior).

### Strongly Recommended (Fix Soon)

- Maintainability risks (high complexity, unclear logic).
- Performance regressions on hot paths.
- Missing negative/edge test coverage.

### Advisory (Non‑Blocking)

- Naming/style polish.
- Minor refactors.
- Documentation improvements.

All issues must include **risk + impact** notes. Blocking requires material risk.

---

## Artifacts Required for Review Submission

- Summary (min 30 chars)
- Risk rating: `LOW | MEDIUM | HIGH`
- Files reviewed (paths)
- Tests run (list or `NOT_RUN`)
- Issues list for `NEEDS_REVISION` or `REJECTED`

---

## Fix & Verify Loop

1. **Implementor ownership**: Implementor applies the fixes for code review issues.
2. **Issue retrieval**: Implementor uses `get_open_code_review_issues` to fetch current issues.
3. **Issue resolution**: Implementor marks each issue resolved via `resolve_code_review_issue` using `issue_id` only (issue is already linked to its review).
4. **Fix submission** must include: summary, files changed, tests run.
5. **Controller verification** must confirm fixes address issues and update decision.
6. **Revision tracking** increments per review cycle and links prior reviews.

---

## References

- Prior review notes: [specs/004-controller-agent/code-review.md](../004-controller-agent/code-review.md)
