# Specification: MCP Server Verification Rules Alignment

**Spec ID**: `08-VER-RULES`  
**Version**: 0.2.0  
**Created**: December 9, 2025  
**Updated**: December 10, 2025  
**Status**: Draft (v2 Architecture Aligned)  
**Author**: Gap Analysis Audit  
**Related Specs**: [06-database-schema.md](./06-database-schema.md), [04-mcp-tool-schemas.md](./04-mcp-tool-schemas.md), [05-mcp-workflows.md](./05-mcp-workflows.md)  
**Related Docs**: [Orchestra Bible v0.7.0](../../docs/orchestra-bible.md), [02-task-verification.md](../../templates/orchestrator/processes/02-task-verification.md), [verify.md](../../docs/workflow/verify.md)

---

## Executive Summary

This specification defines the verification rules alignment for the Orchestra MCP v2 database-driven architecture. The v2 design intentionally separates **agent judgment** (semantic content) from **system execution** (syntactic structure), which reframes how verification should work compared to the CLI.

### v2 Architecture Alignment

**Core v2 Principle** (from [00-problem-statement.md](./00-problem-statement.md)):
> "The agent never touches templates, never creates YAML, never fills forms. The agent provides semantic content. The system provides syntactic structure."

**For Verification, This Means**:
1. **System executes verification checks** - The MCP server runs file_exists, command, pattern_match automatically
2. **Agent provides judgment context** - The orchestrator interprets results and provides semantic rationale
3. **System enforces rules** - Severity-based pass/fail is computed by system, not claimed by agent

### Current Implementation Status

The v2 SPEC (04-mcp-tool-schemas.md, 05-mcp-workflows.md) correctly defines this separation. However, the IMPLEMENTATION is incomplete:

| Component | v2 Spec Status | Implementation Status | Gap |
|-----------|---------------|----------------------|-----|
| Pre-signal checks | Automated in `signal_completion` | ❌ Trusts input claims | GAP-01 |
| Verification check execution | `run_verification_checks` tool | ❌ Not implemented | GAP-02 |
| Severity-based decisions | System computes from results | ❌ Trusts judgment input | GAP-03 |
| Evidence capture | Stored in `verification_results` | ⚠️ Schema exists, not populated | GAP-04 |
| Accept-signal validation | 7 checks before verification | ❌ Not implemented | GAP-05 |

**This spec documents what's missing from implementation, NOT what's wrong with v2 design.**

---

## Table of Contents

1. [v2 Architecture Context](#1-v2-architecture-context)
2. [Gap Analysis: Spec vs Implementation](#2-gap-analysis-spec-vs-implementation)
3. [Source Rules Inventory](#3-source-rules-inventory)
4. [Functional Requirements](#4-functional-requirements)
5. [Tool Specifications](#5-tool-specifications)
6. [Schema Alignment](#6-schema-alignment)
7. [Implementation Tasks](#7-implementation-tasks)
8. [Success Criteria](#8-success-criteria)
9. [Open Questions](#9-open-questions)

---

## 1. v2 Architecture Context

### 1.1 Separation of Concerns in v2

The v2 MCP architecture deliberately separates responsibilities:

| Responsibility | Owner | Example |
|---------------|-------|---------|
| **Semantic Content** | Agent | "This enum should have TOP, CENTER, BOTTOM values" |
| **Syntactic Structure** | System | Storing in DB, generating YAML, executing checks |
| **Judgment Rationale** | Agent | "The implementation meets requirements because..." |
| **Pass/Fail Computation** | System | "2 BLOCKING checks failed → FAIL" |

### 1.2 v2 Verification Workflow (From 05-mcp-workflows.md)

```
signal_completion         →  GATE_CHECK status
    ├─ System runs pre-signal checks (build, test, lint) AUTOMATICALLY
    └─ Returns: pre_signal_checks results

get_verification_results  →  Orchestrator reviews
    ├─ System executes verification checks AUTOMATICALLY  ← NOT IMPLEMENTED
    └─ Returns: per-check results with evidence

submit_verification_judgment  →  Agent provides semantic judgment
    ├─ Agent provides: rationale, which checks matter, guidance
    └─ System computes: pass/fail from severity rules
```

### 1.3 v2 Verification Check Structure (From 04-mcp-tool-schemas.md)

Verification criteria are embedded in tasks during `configure_sprint`:

```typescript
verification: {
  structural_checks?: Array<{
    description: string,
    severity: "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
    path: string,
    pattern?: string,
    min_matches?: number,
  }>,
  
  behavioral_checks?: Array<{
    description: string,
    severity: "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
    command: string,
    expect_exit_code?: number,
    expect_output_contains?: string,
  }>,
  
  quality_checks?: Array<{
    description: string,
    severity: "BLOCKING" | "MAJOR" | "MINOR" | "INFO",
    command?: string,
    path?: string,
    pattern?: string,
    min_matches?: number,
  }>,
}
```

### 1.4 Database Schema Support (From 06-database-schema.md)

The schema already supports automated verification:

- **`verification_checks`** table: Stores check definitions with `check_type`, `severity`, `check_config` (JSON)
- **`verification_results`** table: Stores execution results with `passed`, `output`, `duration_ms`
- **`signals`** table: Stores `pre_signal_checks` results

**The infrastructure exists. The execution logic is missing.**

---

## 2. Gap Analysis: Spec vs Implementation

### 2.1 Critical Gaps (🔴 Must Fix - Blocks v2 Compliance)

| Gap ID | Description | v2 Spec Says | Implementation Has | Impact |
|--------|-------------|--------------|-------------------|--------|
| **GAP-01** | Pre-signal checks trust input | `signal_completion` runs checks AUTOMATICALLY | Trusts `build_status`, `test_status` claims | Implementor can lie |
| **GAP-02** | No automated check execution | System executes checks, stores in `verification_results` | No execution logic exists | Verification is theater |
| **GAP-03** | No `run_verification_checks` tool | Tool #20 in workflow sequence | Not implemented | Workflow incomplete |
| **GAP-04** | Evidence not captured | `verification_results.output` stores evidence | Only schema, no population | No audit trail |
| **GAP-05** | No accept-signal validation | 7 checks before verification proceeds | Not implemented | Stale/invalid signals accepted |

### 2.2 Major Gaps (🟠 Should Fix - Degrades Quality)

| Gap ID | Description | v2 Spec Says | Implementation Has | Impact |
|--------|-------------|--------------|-------------------|--------|
| **GAP-06** | Severity not computed by system | Pass/fail from severity rules | Trusts judgment input | Gaming possible |
| **GAP-07** | No artifact path validation | Check files exist before signaling | No validation | False completion |
| **GAP-08** | Judgment not constrained | Cannot PASS if BLOCKING fails | No constraint | Inconsistent judgments |

### 2.3 Minor Gaps (🟡 Nice to Have)

| Gap ID | Description | v2 Spec Says | Implementation Has | Impact |
|--------|-------------|--------------|-------------------|--------|
| **GAP-09** | No dry-run mode | Validate paths before executing | Not implemented | Less safe |
| **GAP-10** | No signal staleness check | Configurable max age | Not implemented | Stale artifacts accepted |
| **GAP-11** | Check type terminology differs | structural/behavioral/quality | Same (correct) | None - aligned |

### 2.4 What's NOT a Gap

The following were initially flagged but are **intentional v2 design decisions**:

| Item | Why It's Not a Gap |
|------|-------------------|
| Orchestrator provides judgment rationale | v2 separates semantic content (agent) from execution (system) |
| Feedback has structured issues | System generates structure, agent provides content |
| Verification in DB not YAML | v2 is database-driven by design |
| Check IDs auto-generated | System handles structure, agent doesn't manage IDs |

---

## 3. Source Rules Inventory

### 3.1 From Orchestra Bible (Normative)

| Rule ID | Rule | Section | v2 Alignment |
|---------|------|---------|--------------|
| BIBLE-01 | Hidden verification criteria - implementor never sees them | 3.1 | ✅ DB-enforced via role-based queries |
| BIBLE-02 | Deterministic gates preferred over heuristic verification | 3.4 | ⚠️ Spec supports, implementation missing |
| BIBLE-03 | Gate check → Verification audit → Accept signal check sequence | 7.2 | ⚠️ Workflow defined, execution missing |
| BIBLE-04 | All verification results must be recorded | 3.6 | ⚠️ Schema exists, population missing |
| BIBLE-05 | Zero-trust model - verify independently, don't trust claims | 5.1 | ❌ Currently trusts claims |
| BIBLE-06 | Verification chain: artifacts exist → build passes → tests pass → hidden verification | 5.4 | ⚠️ Workflow correct, execution missing |

### 3.2 From 02-task-verification.md (Operational)

| Rule ID | Rule | v2 Alignment | Implementation |
|---------|------|--------------|----------------|
| PROC-01 | Accept-signal check MUST run FIRST before verification | ⚠️ Needs new tool | ❌ Not implemented |
| PROC-02 | Pre-signal artifact must exist and show PASSED status | ⚠️ Stored in `signals.pre_signal_checks` | ❌ Trusts input |
| PROC-03 | Pre-signal artifact must NOT be stale (>24 hours) | ⚠️ Needs implementation | ❌ Not implemented |
| PROC-04 | Do NOT read verification YAML until accept-signal passes | ✅ DB-driven, no file access | N/A in v2 |
| PROC-05 | Execute EACH verification command from YAML file | ⚠️ Execute from DB | ❌ Not implemented |
| PROC-06 | Standard quality gates: tests pass, analyze clean | ⚠️ Pre-signal checks | ❌ Trusts input |
| PROC-07 | Visual verification: check screenshot EXISTS and CONTENT | ⚠️ structural check type | ❌ Not implemented |
| PROC-08 | Severity is IMMUTABLE - cannot be downgraded | ✅ DB constraint | ✅ Schema enforces |
| PROC-09 | Decision rules: ANY BLOCKING/MAJOR fail → Task FAILED | ⚠️ System should compute | ❌ Trusts judgment |
| PROC-10 | Feedback must NOT reveal verification criteria | ✅ Sanitized by system | ✅ Implemented |

### 3.3 From verify.md (Technical)

| Rule ID | Rule | v2 Mapping | Implementation |
|---------|------|------------|----------------|
| TECH-01 | 8 check types: file_exists, dir_exists, pattern_match, command, screenshot_exists, json_valid, yaml_valid, export_exists | Maps to structural/behavioral/quality | ❌ Execution missing |
| TECH-02 | Checks must produce evidence (not just claims) | `verification_results.output` | ❌ Not populated |
| TECH-03 | Every check must have captured output | `verification_results.output` | ❌ Not populated |
| TECH-04 | Severity mapping: critical→BLOCKING, warning→MAJOR, info→MINOR/INFO | Uses BLOCKING/MAJOR/MINOR/INFO directly | ✅ Aligned |
| TECH-05 | Verification criteria are IMMUTABLE once created | DB enforces | ✅ Implemented |
| TECH-06 | Visual verification required for VISUAL/INTEGRATION categories | Check type support | ❌ Not implemented |
| TECH-07 | Verification report saved to results folder | `verification_results` table | ⚠️ Schema only |

---

## 4. Functional Requirements

### 4.1 Pre-Signal Checks in `signal_completion` (GAP-01, GAP-07)

> **Addresses**: BIBLE-05, PROC-06, TECH-02
> **v2 Spec Reference**: 04-mcp-tool-schemas.md Section 3.11

The v2 spec defines that `signal_completion` should run pre-signal checks **automatically**:

```typescript
// From 04-mcp-tool-schemas.md
System:
→ Validates task_id matches current task, status is IMPLEMENT
→ Runs pre-signal checks (build, test, lint) — AUTOMATIC
→ If pre-signal checks fail: Returns error with check output
→ If pre-signal checks pass: Creates signal, updates status to GATE_CHECK
```

#### FR-PSC-001: Actual Build Verification
The system MUST NOT trust `build_status` claim. Instead:
- Execute build command (configurable, default: `npm run build`)
- Capture exit code and output
- Store in `pre_signal_checks.build`

#### FR-PSC-002: Actual Test Verification
The system MUST NOT trust `test_status` claim. Instead:
- Execute test command (configurable, default: `npm test`)
- Capture exit code and output
- Store in `pre_signal_checks.test`

#### FR-PSC-003: Artifact Path Validation
The system MUST validate `artifacts_created` paths:
- For `CREATE`/`UPDATE` operations: verify file exists
- For `DELETE` operations: verify file does not exist
- Return specific errors for missing files

#### FR-PSC-004: Summary Quality
The system MUST validate summary quality:
- Minimum 10 characters (already implemented)
- At least one artifact (already implemented)

### 4.2 Accept-Signal Validation (GAP-05)

> **Addresses**: PROC-01, PROC-02, PROC-03, PROC-04
> **v2 Spec Reference**: 05-mcp-workflows.md Section 2.4

#### FR-ASV-001: Accept-Signal Gate
The system MUST validate the signal before `run_verification_checks` can proceed:

| Check ID | Check | Failure Behavior |
|----------|-------|-----------------|
| ASV-1 | Signal exists for task | REJECT - no signal found |
| ASV-2 | Signal status shows pre_signal_checks passed | REJECT - fix pre-signal issues |
| ASV-3 | Signal is not stale (configurable, default 60 min) | REJECT - re-signal |
| ASV-4 | Task is in GATE_CHECK status | REJECT - wrong state |
| ASV-5 | Verification checks exist for task | REJECT - orchestrator must configure |

#### FR-ASV-002: Accept-Signal as Prerequisite
The system MUST NOT allow `run_verification_checks` to execute until accept-signal validation passes.

### 4.3 Automated Check Execution (GAP-02, GAP-03, GAP-04)

> **Addresses**: PROC-05, TECH-01, TECH-02, TECH-03, BIBLE-02
> **v2 Spec Reference**: 04-mcp-tool-schemas.md Section 3.20 (proposed)

#### FR-ACE-001: Check Type Execution
The system MUST support executing verification checks based on `check_type`:

| v2 Check Type | check_config Fields | Execution |
|--------------|---------------------|-----------|
| `structural` | `path`, `pattern?`, `min_matches?` | File exists + pattern search |
| `behavioral` | `command`, `expect_exit_code?`, `expect_output_contains?` | Run command, check result |
| `quality` | `command?`, `path?`, `pattern?`, `min_matches?` | Mixed file/command checks |

**Mapping to CLI check types**:

| CLI Check Type | v2 Check Type | check_config |
|---------------|--------------|--------------|
| `file_exists` | `structural` | `{ path: "..." }` |
| `dir_exists` | `structural` | `{ path: "...", is_dir: true }` |
| `pattern_match` | `structural` | `{ path: "...", pattern: "...", min_matches: 1 }` |
| `command` | `behavioral` | `{ command: "...", expect_exit_code: 0 }` |
| `screenshot_exists` | `structural` | `{ path: "...", min_size_bytes: 1024 }` |
| `json_valid` | `quality` | `{ path: "...", validate_json: true }` |
| `yaml_valid` | `quality` | `{ path: "...", validate_yaml: true }` |
| `export_exists` | `quality` | `{ path: "...", exports: ["..."] }` |

#### FR-ACE-002: Evidence Capture
For each check execution, the system MUST capture:
- Check ID and type
- Actual command/operation executed
- Output (stdout/stderr, max 10KB truncated)
- Duration in milliseconds
- Pass/fail with reason
- Timestamp

#### FR-ACE-003: Result Storage
Results MUST be stored in `verification_results` table with:
- `task_id`, `check_id`, `signal_id` foreign keys
- `passed` (boolean)
- `output` (evidence text)
- `duration_ms`
- `run_at` timestamp

#### FR-ACE-004: Continue-on-Error Option
The system MUST support `continue_on_error` parameter:
- `false` (default): Stop on first failure
- `true`: Run all checks, report all results

### 4.4 Severity-Based Decision (GAP-06)

> **Addresses**: PROC-08, PROC-09, TECH-04
> **v2 Spec Reference**: 04-mcp-tool-schemas.md Section 3.1 (configure_sprint validation)

#### FR-SEV-001: System-Computed Pass/Fail
The system MUST compute `overall_passed` based on severity rules:

```typescript
const blockingFailed = results.filter(r => r.severity === "BLOCKING" && !r.passed);
const majorFailed = results.filter(r => r.severity === "MAJOR" && !r.passed);

const overall_passed = blockingFailed.length === 0 && majorFailed.length === 0;
```

#### FR-SEV-002: Severity Breakdown in Response
The system MUST return severity breakdown:
```typescript
severity_breakdown: {
  blocking: { passed: number, failed: number },
  major: { passed: number, failed: number },
  minor: { passed: number, failed: number },
  info: { passed: number, failed: number },
}
```

### 4.5 Judgment Constraint (GAP-08)

> **Addresses**: BIBLE-05
> **v2 Spec Reference**: 04-mcp-tool-schemas.md Section 3.13

#### FR-JC-001: Verification Prerequisite
The system MUST require `run_verification_checks` to have been called before `submit_verification_judgment`.

#### FR-JC-002: Judgment Consistency
The system MUST enforce judgment consistency:
- PASS judgment NOT allowed if any BLOCKING checks failed
- PASS judgment NOT allowed if any MAJOR checks failed
- Agent rationale can explain context but cannot override severity rules

```typescript
if (input.judgment === "PASS") {
  const results = await getLatestVerificationResults(taskId);
  const blockingFailed = results.filter(r => r.severity === "BLOCKING" && !r.passed);
  const majorFailed = results.filter(r => r.severity === "MAJOR" && !r.passed);
  
  if (blockingFailed.length > 0 || majorFailed.length > 0) {
    throw new Error(`Cannot PASS: ${blockingFailed.length} BLOCKING and ${majorFailed.length} MAJOR checks failed`);
  }
}
```

### 4.6 Information Isolation (Existing - Validate)

> **Addresses**: BIBLE-01, PROC-10
> **Status**: ✅ Already implemented in v2

#### FR-II-001: Hidden Criteria Enforcement
The system currently enforces:
- `get_current_task` (implementor) does NOT include verification details ✅
- `get_task` (orchestrator) DOES include verification details ✅
- Feedback does NOT reveal specific check definitions ✅

---

## 5. Tool Specifications

### 5.1 Modified Tool: `signal_completion` (GAP-01)

> **Current Location**: `src/mcp-server/handlers/signal-completion.ts`
> **v2 Spec**: 04-mcp-tool-schemas.md Section 3.11

**Current Behavior (Problematic)**:
```typescript
// Lines 185-209 in signal-completion.ts
function runPreSignalChecks(input) {
  const buildPassed = input.build_status === "PASS";  // ← TRUSTS INPUT
  const testPassed = input.test_status === "PASS";    // ← TRUSTS INPUT
  // ...
}
```

**Required Behavior (v2 Compliant)**:
```typescript
async function runPreSignalChecks(
  input: SignalCompletionInput,
  config: PreSignalConfig
): Promise<PreSignalChecks> {
  
  // 1. Actually run build
  const buildResult = await executeCommand(config.build_command || "npm run build", {
    timeout_ms: config.build_timeout_ms || 120000,
  });
  
  // 2. Actually run tests
  const testResult = await executeCommand(config.test_command || "npm test", {
    timeout_ms: config.test_timeout_ms || 300000,
  });
  
  // 3. Validate artifact paths exist
  const artifactResults = await validateArtifacts(input.artifacts_created);
  
  // 4. Summary quality check (keep existing)
  const summaryPassed = input.summary.length >= 10;
  const hasArtifacts = input.artifacts_created.length > 0;
  
  return {
    build: {
      passed: buildResult.exit_code === 0,
      output: truncate(buildResult.output, 10000),
      duration_ms: buildResult.duration_ms,
    },
    test: {
      passed: testResult.exit_code === 0,
      output: truncate(testResult.output, 10000),
      duration_ms: testResult.duration_ms,
    },
    lint: {
      passed: summaryPassed && hasArtifacts && artifactResults.all_valid,
      output: artifactResults.issues.join("\n"),
      duration_ms: 0,
    },
  };
}
```

**Schema Changes**: None required (same output format).

**Configuration Needed**:
```typescript
// Add to config table or orchestra.yaml
interface PreSignalConfig {
  build_command: string;      // default: "npm run build"
  test_command: string;       // default: "npm test"
  build_timeout_ms: number;   // default: 120000
  test_timeout_ms: number;    // default: 300000
}
```

---

### 5.2 New Tool: `run_verification_checks` (GAP-02, GAP-03)

> **Workflow Position**: Tool #20 in 05-mcp-workflows.md
> **Note**: This tool was identified as "missing from initial schema" in the v2 spec

**Purpose**: Execute verification checks from database and record results.

**Role**: Orchestrator only

**Input Schema**:
```typescript
interface RunVerificationChecksInput {
  task_id: number;                    // Required: Task to verify
  check_ids?: string[];               // Optional: Specific checks to run
  severity_filter?: Severity | "all"; // Optional: Filter by severity
  continue_on_error?: boolean;        // Default: false
  dry_run?: boolean;                  // Default: false
}
```

**Output Schema**:
```typescript
interface RunVerificationChecksOutput {
  success: boolean;
  task_id: number;
  task_title: string;
  timestamp: string;
  duration_ms: number;
  
  accept_signal_status: "ACCEPTED" | "REJECTED";
  accept_signal_checks?: AcceptSignalCheck[];
  
  summary: {
    total_checks: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  
  severity_breakdown: {
    blocking: { passed: number; failed: number };
    major: { passed: number; failed: number };
    minor: { passed: number; failed: number };
    info: { passed: number; failed: number };
  };
  
  results: Array<{
    check_id: string;
    type: "structural" | "behavioral" | "quality";
    description: string;
    severity: Severity;
    passed: boolean;
    message: string;
    output?: string;        // Evidence (max 10KB)
    duration_ms: number;
  }>;
  
  overall_passed: boolean;  // Computed from severity rules
  
  next_step: string;        // Guidance for orchestrator
}
```

**Execution Flow**:
```
1. Validate task is in GATE_CHECK status
2. Run accept-signal validation (FR-ASV-001)
   → If REJECTED, return early with accept_signal_status
3. Load checks from verification_checks table
4. Apply filters (check_ids, severity_filter)
5. For each check:
   a. Execute based on check_type + check_config
   b. Capture output and duration
   c. Record in verification_results table
6. Compute overall_passed from severity rules
7. Return complete report
```

---

### 5.3 Modified Tool: `submit_verification_judgment` (GAP-08)

> **Current Location**: `src/mcp-server/handlers/submit-verification-judgment.ts`
> **v2 Spec**: 04-mcp-tool-schemas.md Section 3.13

**Current Behavior (Problematic)**:
- Accepts PASS/FAIL directly from orchestrator
- No validation that checks were run
- No consistency check between judgment and results

**Required Changes**:

```typescript
async function submitVerificationJudgment(input) {
  // ... existing validation ...

  // NEW: Require verification checks to have been run
  const latestResults = await db
    .select()
    .from(verificationResults)
    .where(eq(verificationResults.task_id, task.id))
    .orderBy(desc(verificationResults.run_at))
    .limit(1);
  
  if (latestResults.length === 0) {
    throw new Error("Must run verification checks before submitting judgment. Use run_verification_checks first.");
  }
  
  // NEW: Validate judgment consistency
  if (input.judgment === "PASS") {
    const allResults = await db
      .select()
      .from(verificationResults)
      .innerJoin(verificationChecks, eq(verificationResults.check_id, verificationChecks.id))
      .where(eq(verificationResults.signal_id, latestResults[0].signal_id));
    
    const blockingFailed = allResults.filter(
      r => r.verification_checks.severity === "BLOCKING" && !r.verification_results.passed
    );
    const majorFailed = allResults.filter(
      r => r.verification_checks.severity === "MAJOR" && !r.verification_results.passed
    );
    
    if (blockingFailed.length > 0 || majorFailed.length > 0) {
      throw new Error(
        `Cannot submit PASS judgment: ${blockingFailed.length} BLOCKING and ` +
        `${majorFailed.length} MAJOR checks failed. Review failures and submit FAIL with feedback.`
      );
    }
  }
  
  // ... rest of existing logic ...
}
```

---

### 5.4 Modified Tool: `get_verification_results` (GAP-04)

> **Current Location**: `src/mcp-server/handlers/get-verification-results.ts`
> **v2 Spec**: 04-mcp-tool-schemas.md (inferred from workflow)

**Current Behavior**: Only retrieves stored judgment, not check results.

**Required Changes**:
- Return actual check results with evidence from `verification_results` table
- Include severity breakdown
- Include system-computed `overall_passed`

**Updated Output Schema**:
```typescript
interface GetVerificationResultsOutput {
  task_id: number;
  signal_id: string;
  run_at: string;
  
  summary: {
    total_checks: number;
    passed: number;
    failed: number;
  };
  
  severity_breakdown: {
    blocking: { passed: number; failed: number };
    major: { passed: number; failed: number };
    minor: { passed: number; failed: number };
    info: { passed: number; failed: number };
  };
  
  results: Array<{
    check_id: string;
    type: string;
    description: string;
    severity: Severity;
    passed: boolean;
    output?: string;
    duration_ms: number;
  }>;
  
  overall_passed: boolean;  // System-computed from severity rules
}
```

---

## 6. Schema Alignment

### 6.1 v2 Check Type Mapping

The v2 spec uses three check types (structural, behavioral, quality) with flexible `check_config` JSON. Here's how CLI check types map:

| CLI Check Type | v2 `check_type` | `check_config` Structure |
|---------------|-----------------|-------------------------|
| `file_exists` | `structural` | `{ "path": "src/file.ts" }` |
| `dir_exists` | `structural` | `{ "path": "src/folder/", "is_dir": true }` |
| `pattern_match` | `structural` | `{ "path": "src/file.ts", "pattern": "export.*Foo", "min_matches": 1 }` |
| `command` | `behavioral` | `{ "command": "npm test", "expect_exit_code": 0 }` |
| `screenshot_exists` | `structural` | `{ "path": "screenshots/x.png", "min_size_bytes": 1024 }` |
| `json_valid` | `quality` | `{ "path": "package.json", "validate_json": true }` |
| `yaml_valid` | `quality` | `{ "path": "config.yaml", "validate_yaml": true }` |
| `export_exists` | `quality` | `{ "path": "src/index.ts", "exports": ["Foo", "Bar"] }` |

### 6.2 Severity Alignment

v2 uses 4-level severity that aligns with CLI (with different names):

| v2 Severity | CLI Equivalent | Auto-Fail Behavior |
|-------------|---------------|-------------------|
| `BLOCKING` | `critical` | Task FAILS immediately |
| `MAJOR` | `warning` | Task FAILS |
| `MINOR` | `info` | Task PASSES, logged |
| `INFO` | `info` | Task PASSES, informational |

### 6.3 Database Schema Status

The v2 schema in [06-database-schema.md](./06-database-schema.md) already supports this:

| Table | Status | Notes |
|-------|--------|-------|
| `verification_checks` | ✅ Defined | `check_type`, `severity`, `check_config` |
| `verification_results` | ✅ Defined | `passed`, `output`, `duration_ms` |
| `signals` | ✅ Defined | `pre_signal_checks` JSON |

**No schema changes required** - implementation of execution logic is the gap.

### 6.4 New Configuration Keys

Add to `config` table:

```sql
INSERT INTO config (key, value, description) VALUES
  ('pre_signal_build_command', 'npm run build', 'Command to run for build verification'),
  ('pre_signal_test_command', 'npm test', 'Command to run for test verification'),
  ('pre_signal_build_timeout_ms', '120000', 'Build command timeout'),
  ('pre_signal_test_timeout_ms', '300000', 'Test command timeout'),
  ('signal_max_age_minutes', '60', 'Maximum age of signal before stale'),
  ('verification_output_max_bytes', '10000', 'Max bytes to capture from check output');
```

---

## 7. Implementation Tasks

### Phase 1: Fix Pre-Signal Checks (GAP-01) — Priority P0

| Task ID | Title | Description | Estimate | Files |
|---------|-------|-------------|----------|-------|
| VER-001 | Add command executor utility | Create utility to execute shell commands with timeout, capture output | 4h | `src/core/command-executor.ts` |
| VER-002 | Refactor `runPreSignalChecks` | Replace trust-based with actual execution | 4h | `src/mcp-server/handlers/signal-completion.ts` |
| VER-003 | Add artifact path validation | Validate files exist for CREATE/UPDATE artifacts | 2h | `src/mcp-server/handlers/signal-completion.ts` |
| VER-004 | Add pre-signal configuration | Load build/test commands from config table | 1h | `src/mcp-server/handlers/signal-completion.ts` |
| VER-005 | Unit tests for pre-signal | Test actual execution, timeout, artifact validation | 3h | `test/mcp-server/signal-completion.test.ts` |

### Phase 2: Implement `run_verification_checks` (GAP-02, GAP-03) — Priority P0

| Task ID | Title | Description | Estimate | Files |
|---------|-------|-------------|----------|-------|
| VER-010 | Create check executor module | Execute structural, behavioral, quality checks | 6h | `src/core/check-executor.ts` |
| VER-011 | Structural check execution | file_exists, dir_exists, pattern_match, screenshot_exists | 4h | `src/core/check-executor.ts` |
| VER-012 | Behavioral check execution | command execution with exit code/output matching | 3h | `src/core/check-executor.ts` |
| VER-013 | Quality check execution | json_valid, yaml_valid, export_exists | 3h | `src/core/check-executor.ts` |
| VER-014 | Create handler | New `run_verification_checks` handler | 4h | `src/mcp-server/handlers/run-verification-checks.ts` |
| VER-015 | Add Zod schemas | Input/output schemas for new tool | 1h | `src/schemas/verification.ts` |
| VER-016 | Register tool | Add to TOOLS array and routing | 0.5h | `src/mcp-server/tools.ts` |
| VER-017 | Evidence storage | Store results in `verification_results` table | 2h | `src/mcp-server/handlers/run-verification-checks.ts` |
| VER-018 | Unit tests | Test all check types | 4h | `test/core/check-executor.test.ts` |
| VER-019 | Integration tests | End-to-end verification flow | 3h | `test/mcp-server/run-verification-checks.test.ts` |

### Phase 3: Add Accept-Signal Validation (GAP-05) — Priority P0

| Task ID | Title | Description | Estimate | Files |
|---------|-------|-------------|----------|-------|
| VER-020 | Accept-signal checks | Implement 5 validation checks (ASV-1 to ASV-5) | 3h | `src/mcp-server/handlers/run-verification-checks.ts` |
| VER-021 | Staleness check | Compare signal timestamp to max age config | 1h | `src/mcp-server/handlers/run-verification-checks.ts` |
| VER-022 | Gate enforcement | Reject verification if accept-signal fails | 1h | `src/mcp-server/handlers/run-verification-checks.ts` |
| VER-023 | Unit tests | Test accept-signal scenarios | 2h | `test/mcp-server/run-verification-checks.test.ts` |

### Phase 4: Enforce Judgment Constraints (GAP-06, GAP-08) — Priority P1

| Task ID | Title | Description | Estimate | Files |
|---------|-------|-------------|----------|-------|
| VER-030 | Add verification prerequisite | Require checks run before judgment | 2h | `src/mcp-server/handlers/submit-verification-judgment.ts` |
| VER-031 | Add judgment consistency | Cannot PASS if BLOCKING/MAJOR failed | 2h | `src/mcp-server/handlers/submit-verification-judgment.ts` |
| VER-032 | Audit rationale storage | Store orchestrator reasoning | 1h | `src/mcp-server/handlers/submit-verification-judgment.ts` |
| VER-033 | Unit tests | Test constraint enforcement | 2h | `test/mcp-server/submit-verification-judgment.test.ts` |

### Phase 5: Update `get_verification_results` (GAP-04) — Priority P1

| Task ID | Title | Description | Estimate | Files |
|---------|-------|-------------|----------|-------|
| VER-040 | Enhanced output | Return actual check results with evidence | 2h | `src/mcp-server/handlers/get-verification-results.ts` |
| VER-041 | Severity breakdown | Add severity counts to response | 1h | `src/mcp-server/handlers/get-verification-results.ts` |
| VER-042 | System-computed overall | Add `overall_passed` based on severity rules | 1h | `src/mcp-server/handlers/get-verification-results.ts` |
| VER-043 | Unit tests | Test enhanced output | 1h | `test/mcp-server/get-verification-results.test.ts` |

### Phase 6: Documentation & Final Testing — Priority P2

| Task ID | Title | Description | Estimate | Files |
|---------|-------|-------------|----------|-------|
| VER-050 | Update tool documentation | Document new `run_verification_checks` tool | 1h | `spec/07-db-driven/04-mcp-tool-schemas.md` |
| VER-051 | Update workflow documentation | Add verification step to workflows | 1h | `spec/07-db-driven/05-mcp-workflows.md` |
| VER-052 | Full lifecycle integration test | Signal → Verify → Judgment → Complete | 4h | `test/integration/verification-lifecycle.test.ts` |
| VER-053 | Retry flow integration test | Signal → Verify (fail) → Feedback → Retry | 3h | `test/integration/verification-retry.test.ts` |

### Total Estimates

| Phase | Scope | Hours |
|-------|-------|-------|
| Phase 1 | Pre-signal fixes | 14h |
| Phase 2 | `run_verification_checks` | 30.5h |
| Phase 3 | Accept-signal validation | 7h |
| Phase 4 | Judgment constraints | 7h |
| Phase 5 | Enhanced results | 5h |
| Phase 6 | Documentation & testing | 9h |
| **Total** | | **72.5h** |

---

## 8. Success Criteria

### 8.1 Functional Success Criteria

| ID | Criterion | Test Method | Phase |
|----|-----------|-------------|-------|
| SC-001 | `signal_completion` actually runs build command | Unit test: mock exec, verify called | P1 |
| SC-002 | `signal_completion` actually runs test command | Unit test: mock exec, verify called | P1 |
| SC-003 | `signal_completion` validates artifact paths exist | Unit test: missing file → error | P1 |
| SC-004 | `run_verification_checks` executes structural checks | Unit test: file_exists, pattern_match | P2 |
| SC-005 | `run_verification_checks` executes behavioral checks | Unit test: command with exit code | P2 |
| SC-006 | `run_verification_checks` executes quality checks | Unit test: json_valid, yaml_valid | P2 |
| SC-007 | Evidence captured in `verification_results.output` | DB query after check execution | P2 |
| SC-008 | Accept-signal validation rejects stale signals | Unit test: signal age > max | P3 |
| SC-009 | Severity rules compute `overall_passed` correctly | Unit test: BLOCKING fail → false | P2 |
| SC-010 | `submit_verification_judgment` requires checks first | Unit test: no checks → error | P4 |
| SC-011 | Cannot PASS if BLOCKING checks failed | Unit test: PASS with BLOCKING fail → error | P4 |

### 8.2 Integration Success Criteria

| ID | Criterion | Test Method | Phase |
|----|-----------|-------------|-------|
| SC-020 | Happy path: signal → verify → pass → complete | Integration test | P6 |
| SC-021 | Retry path: signal → verify (fail) → feedback → signal → pass | Integration test | P6 |
| SC-022 | Escalation path: 3 failures → escalated status | Integration test | P6 |
| SC-023 | Pre-signal failure blocks verification | Integration test | P6 |

### 8.3 Non-Regression Criteria

| ID | Criterion | Test Method | Phase |
|----|-----------|-------------|-------|
| SC-030 | Existing CLI tests pass | `npm test` | All |
| SC-031 | Existing MCP handlers still work | MCP test suite | All |
| SC-032 | Implementor cannot see verification criteria | Security audit: get_current_task | All |
| SC-033 | Feedback does not leak check details | Audit: feedback content | All |

### 8.4 v2 Architecture Compliance

| ID | Criterion | Validation |
|----|-----------|------------|
| SC-040 | Agent provides semantic content only | Review: agents don't execute checks |
| SC-041 | System provides syntactic structure | Review: DB stores, system executes |
| SC-042 | Separation of judgment and execution | Review: judgment after execution |
| SC-043 | Eager validation on all tool calls | Review: validate before process |

---

## 9. Open Questions

### 9.1 Architecture Decisions (Resolved by v2 Spec)

| ID | Question | v2 Resolution |
|----|----------|---------------|
| ~~Q-001~~ | Should check execution happen in MCP or CLI? | **MCP has own executor** - v2 is DB-driven, not file-based |
| ~~Q-002~~ | How to handle timeouts? | **Per-check configurable** via `check_config` or global config |
| ~~Q-003~~ | Automatic or explicit accept-signal? | **Part of `run_verification_checks`** - combined for simplicity |
| ~~Q-004~~ | DB vs YAML for check definitions? | **DB only** - v2 is fully database-driven |

### 9.2 Remaining Open Questions

| ID | Question | Options | Recommendation | Status |
|----|----------|---------|----------------|--------|
| Q-005 | Default signal staleness timeout? | 30min / 60min / 24h | **60 minutes** - balances freshness with practicality | PENDING |
| Q-006 | Should visual verification analyze screenshot content? | A) File exists only B) Size check C) Content analysis | **B) Size check** (>1KB) - content analysis is complex | PENDING |
| Q-007 | Maximum evidence size to store? | 5KB / 10KB / 50KB | **10KB** - sufficient for most error messages | PENDING |
| Q-008 | Should pre-signal commands be configurable per-task? | A) Global only B) Per-task override | **A) Global** for MVP, per-task in future | PENDING |
| Q-009 | Error handling for command execution failure? | A) Treat as check fail B) Treat as system error | **A) Check fail** - non-zero exit is failure | PENDING |

### 9.3 Future Considerations (Out of Scope for v1)

| ID | Future Feature | Notes |
|----|---------------|-------|
| F-001 | Screenshot content analysis | Use vision models to verify UI appearance |
| F-002 | Parallel check execution | Run independent checks concurrently |
| F-003 | Check caching | Skip re-running unchanged checks |
| F-004 | Custom check types | Plugin system for project-specific checks |
| F-005 | CLI-MCP shared executor | Factor out to shared core module |

---

## Appendix A: Code References

### Current Implementation Files

| File | Purpose | Gap Status |
|------|---------|------------|
| `src/mcp-server/handlers/signal-completion.ts` | Implementor signals completion | GAP-01: Trusts input |
| `src/mcp-server/handlers/submit-verification-judgment.ts` | Orchestrator judgment | GAP-08: No constraints |
| `src/mcp-server/handlers/get-verification-results.ts` | Retrieve results | GAP-04: No evidence |
| `src/db/schema.ts` | Database schema | ✅ Has required tables |
| `src/core/verification.ts` | CLI verification logic | Reference for check execution |

### CLI Check Executor Reference

The CLI already has check execution logic in `src/core/verification.ts`. Key functions to reference:

```typescript
// From src/core/verification.ts (CLI)
export async function executeCheck(check: VerificationCheck): Promise<CheckResult> {
  switch (check.type) {
    case 'file_exists': return executeFileExists(check);
    case 'dir_exists': return executeDirExists(check);
    case 'pattern_match': return executePatternMatch(check);
    case 'command': return executeCommand(check);
    case 'screenshot_exists': return executeScreenshotExists(check);
    case 'json_valid': return executeJsonValid(check);
    case 'yaml_valid': return executeYamlValid(check);
    case 'export_exists': return executeExportExists(check);
  }
}
```

This can be adapted for MCP's v2 check type structure (structural/behavioral/quality with `check_config`).

---

## 10. Implementation Notes (v1.1.0)

### Sprint Completion Summary

Implementation completed December 2025 via sprint `sprint-verification-rules.md`.

### Phase 1: Pre-Signal Checks (COMPLETE ✅)

| Task | Status | Actual Implementation |
|------|--------|----------------------|
| VER-001 | ✅ | `src/core/command-executor.ts` - Shell command execution with timeout |
| VER-002 | ✅ | `src/core/pre-signal-executor.ts` - Refactored pre-signal checks |
| VER-003 | ✅ | `src/core/artifact-validator.ts` - Artifact path validation |
| VER-004 | ✅ | `src/mcp-server/handlers/set-config.ts` - Config storage for build/test commands |
| VER-005 | ✅ | 41 unit tests across command-executor, pre-signal, artifact modules |

### Phase 2: Verification Check Execution (COMPLETE ✅)

| Task | Status | Actual Implementation |
|------|--------|----------------------|
| VER-006 | ✅ | `src/core/check-executor.ts` - 17 tests for check execution |
| VER-010/011/012 | ✅ | `src/mcp-server/handlers/run-verification-checks.ts` - Handler with 13 tests |

### Phase 3: Accept-Signal Validation (COMPLETE ✅)

| Task | Status | Actual Implementation |
|------|--------|----------------------|
| VER-016 | ✅ | `src/core/accept-signal-validator.ts` - 5 ASV checks |
| VER-017 | ✅ | Configurable staleness (default 60 min) |
| VER-018 | ✅ | Integrated into `run_verification_checks` |
| VER-019 | ✅ | 12 unit tests for accept-signal validation |

### Phase 4: Judgment Constraints (COMPLETE ✅)

| Task | Status | Actual Implementation |
|------|--------|----------------------|
| VER-020 | ✅ | `src/core/judgment-validator.ts` - JVC-1: Results must exist |
| VER-021 | ✅ | JVC-2: PASS blocked with BLOCKING failures |
| VER-022 | ✅ | JVC-3: Rationale validation (min 10 chars) |
| VER-023 | ✅ | 12 unit tests for judgment validation |

### Phase 5: Enhanced Results (COMPLETE ✅)

| Task | Status | Actual Implementation |
|------|--------|----------------------|
| VER-024 | ✅ | Enhanced output with type, description, severity per result |
| VER-025 | ✅ | Severity breakdown in summary |
| VER-026 | ✅ | `overall_passed` computed from BLOCKING checks only |
| VER-027 | ✅ | 7 unit tests for enhanced results |

### Key Files Created

```
src/core/
├── command-executor.ts      # Shell command execution
├── pre-signal-executor.ts   # Pre-signal check runner
├── artifact-validator.ts    # Artifact path validation
├── check-executor.ts        # Verification check execution
├── accept-signal-validator.ts # ASV checks
└── judgment-validator.ts    # JVC checks

src/mcp-server/handlers/
├── run-verification-checks.ts # New tool handler
├── set-config.ts             # Config management
├── get-verification-results.ts # Enhanced output
└── submit-verification-judgment.ts # Judgment constraints

test/
├── core/
│   ├── command-executor.test.ts
│   ├── pre-signal-executor.test.ts
│   ├── artifact-validator.test.ts
│   ├── check-executor.test.ts
│   ├── accept-signal-validator.test.ts
│   └── judgment-validator.test.ts
└── mcp-server/
    ├── run-verification-checks.test.ts
    └── get-verification-results.test.ts
```

### Test Coverage

| Module | Tests | Status |
|--------|-------|--------|
| command-executor | 14 | ✅ |
| pre-signal-executor | 11 | ✅ |
| artifact-validator | 10 | ✅ |
| set-config | 6 | ✅ |
| check-executor | 17 | ✅ |
| run-verification-checks | 13 | ✅ |
| accept-signal-validator | 12 | ✅ |
| judgment-validator | 12 | ✅ |
| get-verification-results | 7 | ✅ |
| **Total** | **102** | ✅ |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2025-12-09 | Gap Analysis | Initial draft from audit findings |
| 0.2.0 | 2025-12-10 | Gap Analysis | Aligned with v2 db-driven architecture; reframed gaps as spec vs implementation |
| 1.1.0 | 2025-12-11 | Implementation | Added implementation notes; Phases 1-5 complete |

---

*This specification is authoritative for MCP v2 verification rules alignment.*
