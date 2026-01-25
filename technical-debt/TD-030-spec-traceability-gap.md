# TD-030: Specification Traceability Gap in Code Reviews

## Summary

The Controller agent, when performing code reviews, has **no structured way to determine the actual specification** that a sprint is based on or the specific spec task list that a task is implementing. This means code reviews are being done without reference to the authoritative requirements - a fundamental gap in Orchestra's quality assurance model.

## Severity: **CRITICAL**

This undermines the entire Controller review system. Reviews are supposed to verify work against the specification, but reviewers cannot reliably locate or reference the spec.

## Discovery Context

- **Discovered**: 2026-01-25
- **Sprint**: sprint-011 (Custom Agents Phase 5: User Controls)
- **Discovered by**: Orchestrator during post-sprint analysis

---

## Table of Contents

1. [The Problem](#the-problem)
2. [Technical Analysis](#technical-analysis)
3. [Evidence of the Gap](#evidence-of-the-gap)
4. [Impact Analysis](#impact)
5. [Risk Assessment](#risk-assessment)
6. [Proposed Solution](#proposed-solution)
7. [Implementation Plan](#implementation-plan)
8. [Migration Strategy](#migration-strategy)
9. [Success Criteria](#success-criteria)

---

## The Problem

### What the Controller SHOULD be doing:

```
┌──────────────────────────────────────────────────────────────────────┐
│                   IDEAL CODE REVIEW WORKFLOW                          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   1. get_code_review(task=3) → Receive task for review                │
│                                                                       │
│   2. AUTOMATIC: System resolves spec_path from sprint                 │
│      → "specs/002-custom-agents/us3-user-controls.md"                 │
│                                                                       │
│   3. AUTOMATIC: System resolves speckit_task_ref to definitions       │
│      → T052: "Test pause functionality"                               │
│      → T053: "Test resume functionality"                              │
│      → T054: "Test stop functionality"                                │
│                                                                       │
│   4. Controller reads actual implementation                           │
│      → src/views/AgentOutputPanel.ts                                  │
│      → test/views/agentControls.test.ts                               │
│                                                                       │
│   5. Controller COMPARES implementation to spec definitions           │
│      → "Does pause() match T052 requirements?"                        │
│      → "Does test cover T053 behavior?"                               │
│                                                                       │
│   6. submit_code_review with SPEC EVIDENCE                            │
│      → issues: [{spec_ref: "T052", violation: "..."}]                 │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### What the Controller CAN actually do:

```
┌──────────────────────────────────────────────────────────────────────┐
│                   ACTUAL CODE REVIEW WORKFLOW                         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   1. get_code_review(task=3) → Receive task for review                │
│                                                                       │
│   2. See: speckit_task_ref: "T052,T053,T054,T055,T057"                │
│      → What file defines these?  ❓                                   │
│      → What do they mean?        ❓                                   │
│      → Are they even valid IDs?  ❓                                   │
│                                                                       │
│   3. GUESS based on sprint name:                                      │
│      → "Custom Agents Phase 5: User Controls (US3)"                   │
│      → Maybe try: specs/002-custom-agents/us3-*.md                    │
│      → Hope the file exists and has task definitions                  │
│                                                                       │
│   4. read_spec_file with GUESSED path                                 │
│      → May succeed, may fail, may find wrong file                     │
│                                                                       │
│   5. Try to correlate "T052" with file content                        │
│      → Linear search for "T052" pattern                               │
│      → No structured format guarantee                                 │
│                                                                       │
│   6. submit_code_review with INCOMPLETE EVIDENCE                      │
│      → Cannot cite spec violations with confidence                    │
│      → Review quality degraded                                        │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### The Gap Visualized

```
CURRENT STATE:
                                                         ❌ NO LINK
    ┌─────────────┐                                     ╱
    │   Sprint    │                                    ╱
    │  "011"      │──────────────────────────────────╳
    │             │                                    ╲
    └─────────────┘                                     ╲
          │                                              ╲
          │ has                                           ▼
          ▼                                     ┌─────────────────────┐
    ┌─────────────┐                             │  specs/002-custom-  │
    │   Task 3    │                             │  agents/us3-user-   │
    │             │  speckit_task_ref           │  controls.md        │
    │  T052,T053  │◄ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤                     │
    │             │    (opaque string,          │  - T052: Pause test │
    └─────────────┘     no file reference)      │  - T053: Resume test│
                                                │  - T054: Stop test  │
                                                └─────────────────────┘

REQUIRED STATE:
                                                          ✓ LINKED
    ┌─────────────┐                                      ╱
    │   Sprint    │  spec_path                          ╱
    │  "011"      │────────────────────────────────────►
    │             │  "specs/002-custom-agents/          ╲
    └─────────────┘   us3-user-controls.md"              ╲
          │                                               ▼
          │ has                                  ┌─────────────────────┐
          ▼                                      │  specs/002-custom-  │
    ┌─────────────┐                              │  agents/us3-user-   │
    │   Task 3    │  speckit_task_ref            │  controls.md        │
    │             │  (validated against spec)    │                     │
    │  T052,T053  │─────────────────────────────►│  - T052: Pause test │
    │             │                              │  - T053: Resume test│
    └─────────────┘                              │  - T054: Stop test  │
                                                 └─────────────────────┘
```

---

## Technical Analysis

### Database Schema Gaps

#### `sprints` table ([schema.ts#L27-L51](../src/db/schema.ts#L27-L51))

```typescript
export const sprints = sqliteTable("sprints", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  workflow_step: text("workflow_step").notNull(),
  config: text("config"), // JSON: CodeReviewConfig
  is_active: integer("is_active", { mode: "boolean" }).notNull().default(false),
  is_archived: integer("is_archived", { mode: "boolean" })
    .notNull()
    .default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  completed_at: text("completed_at"),
  // ❌ NO spec_path field
  // ❌ NO spec_version field
  // ❌ NO spec_hash field for integrity
});
```

**Missing fields:**

| Field          | Purpose                     | Why Critical                                  |
| -------------- | --------------------------- | --------------------------------------------- |
| `spec_path`    | Path to specification file  | Without this, Controller cannot find the spec |
| `spec_version` | Version/commit/hash of spec | Without this, can't detect spec changes       |
| `spec_hash`    | Content hash                | Without this, can't verify spec integrity     |

#### `tasks` table

```typescript
speckit_task_ref: text("speckit_task_ref"),  // Just a string, no structure
```

**Problems:**

- Not validated against actual spec task IDs
- No foreign key or reference to spec file
- Format is arbitrary (comma-separated, JSON, etc.)
- No way to resolve IDs to their definitions

#### `phases` table

```typescript
speckit_tasks: text("speckit_tasks"),  // JSON array
```

**Same problems as tasks** - just an opaque JSON array with no validation or linkage.

#### `sprint_settings` table

```typescript
// Stores environment config (test_command, test_file_pattern, source_base_dir)
// Does NOT store spec_path - that's a different concern
```

### Tool Limitations

| Tool                  | Current Capability         | Gap                            |
| --------------------- | -------------------------- | ------------------------------ |
| `get_sprint_status`   | Returns sprint info        | NO spec_path                   |
| `get_task_for_review` | Returns `speckit_task_ref` | No context on where spec lives |
| `read_spec_file`      | Can read files             | Controller must GUESS the path |
| `configure_sprint`    | Creates sprint             | Doesn't require spec_path      |

### What `speckit_task_ref` looks like in practice:

```json
{
  "task_id": 3,
  "speckit_task_ref": "T052,T053,T054,T055,T057"
}
```

**Controller's internal monologue:**

> "T052... what does that mean? Which file? Is it `specs/002-custom-agents/tasks.md`?
> Or `specs/002-custom-agents/us3-user-controls.md`? Let me grep... hope I find it..."

---

## Evidence of the Gap

### Example: Sprint 011

**Sprint configuration:**

```json
{
  "sprint": {
    "id": "sprint-011",
    "name": "Custom Agents Phase 5: User Controls (US3)"
  },
  "environment": {
    "test_command": "npm test",
    "test_file_pattern": "test/**/*.test.ts"
  }
  // NO spec_path field exists in schema
}
```

**What Controller sees for Task 3:**

```json
{
  "task_id": 3,
  "title": "Validate Agent Control Lifecycle",
  "speckit_task_ref": "T052,T053,T054,T055,T057"
}
```

**What Controller needs to do:**

1. Parse sprint name "Custom Agents Phase 5: User Controls (US3)"
2. Infer it's part of `specs/002-custom-agents/`
3. Search that directory for user story files
4. Find something like `us3-user-controls.md` or `tasks.md`
5. Hope T052 etc. are defined in that file
6. Parse the file to extract task definitions

**This is unreliable, unauditable, and error-prone.**

### spec_reviews Table - False Hope

The `spec_reviews` table ([schema.ts#L514-L554](../src/db/schema.ts#L514-L554)) DOES have:

```typescript
spec_path: text("spec_path"),  // Path to the specification document
```

But this is:

- **Optional** (`text()` not `text().notNull()`)
- **Only populated AFTER a review is submitted** (post-hoc, not pre-configured)
- **Not linked to the sprint at configuration time**
- **Controller must still guess the path to populate it**

This field records what the Controller CLAIMED to review, not what they SHOULD have reviewed.

---

## Impact

### On Code Reviews

| Impact Area  | Severity | Description                                                                |
| ------------ | -------- | -------------------------------------------------------------------------- |
| Accuracy     | CRITICAL | Reviews done without spec reference cannot reliably detect spec violations |
| Auditability | HIGH     | No proof that correct spec was consulted                                   |
| Consistency  | HIGH     | Different Controllers may find different specs                             |
| Speed        | MEDIUM   | Time wasted searching for spec files                                       |

### On Sprint Reviews

| Impact Area         | Severity | Description                              |
| ------------------- | -------- | ---------------------------------------- |
| Coverage Validation | CRITICAL | Cannot verify all spec tasks are covered |
| Orphan Detection    | HIGH     | Cannot detect tasks that aren't in spec  |
| Requirement Gaps    | HIGH     | Cannot detect missing requirements       |

### On Quality Assurance

| Impact Area     | Severity | Description                                                    |
| --------------- | -------- | -------------------------------------------------------------- |
| Trust Model     | CRITICAL | Orchestra's core promise is "hidden verification against spec" |
| Security        | CRITICAL | Without traceability, verification is unenforceable            |
| Controller Role | HIGH     | Becomes security theater without spec access                   |

### Failure Scenarios

**Scenario 1: Spec Drift Undetected**

```
1. Spec updated to add new requirement R5
2. Sprint already configured (no spec_path, no version tracking)
3. Implementor doesn't know about R5
4. Controller cannot detect R5 is missing (doesn't have spec_path)
5. Task marked APPROVED without R5
6. Defect ships to production
```

**Scenario 2: Wrong Spec Consulted**

```
1. Controller reviews Task 3 of sprint-011
2. Sees speckit_task_ref: "T052,T053"
3. Guesses spec path: specs/002-custom-agents/tasks.md  (WRONG)
4. Actual spec: specs/002-custom-agents/us3-user-controls.md
5. Reviews against wrong requirements
6. Approves code that doesn't meet actual spec
```

**Scenario 3: Spec Task ID Mismatch**

```
1. Orchestrator types speckit_task_ref: "T0052" (typo: extra 0)
2. Actual spec has "T052"
3. No validation catches this mismatch
4. Controller searches for T0052 in spec file
5. Finds nothing, assumes task has no spec mapping
6. Reviews without spec reference
```

---

## Risk Assessment

### Security Risk: Specification Bypass

**Threat**: Orchestrator can configure sprints that claim spec compliance without actual spec linkage.

```
ATTACK VECTOR:
1. Orchestrator creates sprint with fake speckit_task_ref values
2. References like "T999,T998" that don't exist in any spec
3. Controller cannot validate these references
4. Sprint appears spec-aligned but is completely arbitrary
5. Verification becomes meaningless
```

**Mitigation Required**: Spec file path must be required and validated at sprint configuration time.

### Operational Risk: Review Quality Degradation

**Threat**: As Orchestra scales, Controllers increasingly skip spec consultation due to friction.

```
DEGRADATION PATH:
1. Sprint 1-10: Controllers diligently search for specs
2. Sprint 11-20: Controllers learn spec paths are unpredictable
3. Sprint 21+: Controllers review based on handover only, not spec
4. Review quality silently degrades to "handover-only" checks
5. Spec violations pass review because spec wasn't consulted
```

**Mitigation Required**: Spec must be automatically provided to Controller, not searched for.

### Compliance Risk: Audit Trail Gaps

**Threat**: Cannot prove after-the-fact which spec version was used for review.

```
AUDIT SCENARIO:
Regulator: "Show me that Task 3 was reviewed against requirement R3"
Orchestra: "Here's the code review record"
Regulator: "Which spec version was R3 in? How do you know that was consulted?"
Orchestra: "... we don't have that data"
Regulator: "Non-compliant. Cannot demonstrate traceability."
```

**Mitigation Required**: Spec path and version/hash must be recorded with every review.

---

## Proposed Solution

### Phase 1: Schema Changes

#### Add to `sprints` table

```typescript
spec_path: text("spec_path").notNull(),    // Required: path to spec file
spec_version: text("spec_version"),         // Optional: version/hash for integrity
spec_hash: text("spec_hash"),               // Optional: SHA-256 of spec content
```

#### Update `configure_sprint` input schema

```typescript
// In src/schemas/sprint-config.ts
export const ConfigureSprintInputSchema = z.object({
  // ... existing fields ...

  spec_path: z
    .string()
    .min(1, "Spec path cannot be empty")
    .refine(
      (path) => path.startsWith("specs/") || path.startsWith("spec/"),
      "Spec path must be in specs/ or spec/ directory",
    )
    .describe("Path to the specification document this sprint implements"),
});
```

### Phase 2: Tool Enhancements

#### `get_sprint_status` should return:

```json
{
  "sprint_id": "sprint-011",
  "name": "Custom Agents Phase 5: User Controls (US3)",
  "spec_path": "specs/002-custom-agents/us3-user-controls.md",
  "spec_version": "v1.2.0",
  "status": "ACTIVE",
  "phases": [...]
}
```

#### `get_task_for_review` should return:

```json
{
  "task_id": 3,
  "title": "Validate Agent Control Lifecycle",
  "speckit_task_ref": "T052,T053,T054,T055,T057",
  "spec_path": "specs/002-custom-agents/us3-user-controls.md",
  "spec_task_definitions": [
    {
      "id": "T052",
      "title": "Write failing test for pause functionality",
      "type": "test",
      "acceptance_criteria": [...]
    },
    {
      "id": "T053",
      "title": "Write failing test for resume functionality",
      "type": "test",
      "acceptance_criteria": [...]
    }
    // ... extracted from spec file
  ]
}
```

#### `submit_code_review` should require:

```typescript
// Issues must reference spec task IDs
issues: [
  {
    severity: "BLOCKING",
    spec_ref: "T052", // NEW: Required spec task reference
    issue: "Pause test doesn't validate state change",
    rationale: "T052 requires 'verify isPaused state becomes true'",
    guidance: "Add assertion for state.isPaused === true",
  },
];
```

### Phase 3: Validation & Enforcement

#### At `configure_sprint` time:

1. **Validate spec_path exists** - File must exist in workspace
2. **Validate speckit_task_ref values** - Each ID must exist in spec file
3. **Compute spec_hash** - Store SHA-256 of spec content for integrity
4. **Warn on spec changes** - Alert if spec file changes after sprint configured

#### At `submit_code_review` time:

1. **Require spec_path in context** - System provides spec_path automatically
2. **Validate issue spec_refs** - Each issue's spec_ref must exist in spec
3. **Record spec_hash at review time** - Capture which spec version was reviewed

---

## Implementation Plan

### Sprint Scope: sprint-012 (Spec Traceability)

#### Phase 1: Database & Schema (Tasks 1-3)

| Task | Title                           | Description                                                |
| ---- | ------------------------------- | ---------------------------------------------------------- |
| 1    | Add spec_path to sprints table  | Migration: `ALTER TABLE sprints ADD COLUMN spec_path TEXT` |
| 2    | Update configure_sprint schema  | Add spec_path to input schema, make required               |
| 3    | Update configure_sprint handler | Validate spec_path exists, store in DB                     |

#### Phase 2: Tool Enhancements (Tasks 4-7)

| Task | Title                      | Description                                       |
| ---- | -------------------------- | ------------------------------------------------- |
| 4    | Update get_sprint_status   | Return spec_path in response                      |
| 5    | Update get_task_for_review | Return spec_path and resolve task definitions     |
| 6    | Add spec task parser       | Parse spec file to extract task definitions       |
| 7    | Update submit_code_review  | Add spec_ref to issue schema, validate references |

#### Phase 3: Agent Updates (Tasks 8-9)

| Task | Title                     | Description                                        |
| ---- | ------------------------- | -------------------------------------------------- |
| 8    | Update orchestrator agent | Document spec_path requirement in configure_sprint |
| 9    | Update controller agent   | Document spec-based review workflow                |

#### Phase 4: Testing (Tasks 10-12)

| Task | Title                          | Description                                       |
| ---- | ------------------------------ | ------------------------------------------------- |
| 10   | Unit tests for spec validation | Test spec_path validation logic                   |
| 11   | Integration tests for workflow | End-to-end spec traceability test                 |
| 12   | Migration tests                | Test backward compatibility with existing sprints |

---

## Migration Strategy

### Handling Existing Sprints

Existing sprints have no `spec_path`. Options:

1. **Nullable with warning** (Recommended for v1)
   - Make `spec_path` nullable initially
   - Warn when creating reviews without spec_path
   - Log "LEGACY_SPRINT_NO_SPEC" for audit
   - Plan to make required in v2

2. **Backfill script**
   - Script to infer spec_path from sprint name
   - Manual review of inferences
   - Update existing sprints with correct paths

3. **Require for new only**
   - Old sprints: spec_path = NULL
   - New sprints: spec_path required
   - Deprecation warning on NULL access

### Migration SQL

```sql
-- Migration: 20260125_xxx_add_sprint_spec_path.sql

-- Add spec_path column (nullable for backward compatibility)
ALTER TABLE sprints ADD COLUMN spec_path TEXT;

-- Add spec_version column
ALTER TABLE sprints ADD COLUMN spec_version TEXT;

-- Add spec_hash column
ALTER TABLE sprints ADD COLUMN spec_hash TEXT;

-- Index for spec lookups
CREATE INDEX idx_sprints_spec_path ON sprints(spec_path);
```

---

## Workarounds (Current State)

Until this TD is resolved, Controllers can use these workarounds:

1. **Look at sprint name for hints** - Parse "Custom Agents Phase 5: User Controls (US3)" to infer spec location
2. **Search `specs/` directory manually** - Use `read_spec_file` to explore directories
3. **Use `read_spec_file` with guessed paths** - Trial and error to find correct file
4. **Reference `speckit_task_ref` without context** - Accept incomplete traceability

**None of these are reliable or auditable.**

---

## Success Criteria

### Functional Requirements

| ID   | Requirement                               | Verification                                |
| ---- | ----------------------------------------- | ------------------------------------------- |
| FR-1 | `configure_sprint` requires `spec_path`   | Schema validation rejects without spec_path |
| FR-2 | `spec_path` is validated to exist         | Handler returns error if file doesn't exist |
| FR-3 | `get_sprint_status` returns `spec_path`   | Response includes spec_path field           |
| FR-4 | `get_task_for_review` resolves spec tasks | Response includes spec_task_definitions     |
| FR-5 | Controller can cite spec in issues        | submit_code_review accepts spec_ref field   |

### Non-Functional Requirements

| ID    | Requirement         | Verification                               |
| ----- | ------------------- | ------------------------------------------ |
| NFR-1 | Backward compatible | Existing sprints continue to work          |
| NFR-2 | Performance         | Spec parsing < 100ms for typical spec file |
| NFR-3 | Auditability        | All reviews record spec_path used          |

### Definition of Done

- [ ] Database migration applied
- [ ] Schema updated with spec_path required
- [ ] configure_sprint validates spec_path
- [ ] get_sprint_status returns spec_path
- [ ] get_task_for_review resolves spec task definitions
- [ ] submit_code_review supports spec_ref in issues
- [ ] Agent prompts updated to document spec_path
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Migration tested with existing sprints

---

## Related Files

- [schema.ts](../src/db/schema.ts) - Database schema
- [get-sprint-status.ts](../src/mcp-server/handlers/get-sprint-status.ts) - Sprint status handler
- [get-task-for-review.ts](../src/mcp-server/handlers/get-task-for-review.ts) - Task review handler
- [configure-sprint.ts](../src/mcp-server/handlers/configure-sprint.ts) - Sprint configuration
- [read-spec-file.ts](../src/mcp-server/handlers/read-spec-file.ts) - Spec file reader
- [submit-code-review.ts](../src/mcp-server/handlers/submit-code-review.ts) - Code review submission
- [orchestra.controller.agent.md](../extension/agents/orchestra.controller.agent.md) - Controller agent prompt
- [orchestra.orchestrator.agent.md](../extension/agents/orchestra.orchestrator.agent.md) - Orchestrator agent prompt

---

## Priority Justification

This is **CRITICAL** because:

1. **Controller code reviews are the last line of defense** against spec drift
2. **Without spec traceability, reviews are ungrounded** - based on handover claims, not spec requirements
3. **Orchestra's security model depends on spec-based verification** - if Controller can't access spec, verification is incomplete
4. **Every review done today lacks this foundation** - we are accumulating technical debt with each review

### Urgency

| Sprint  | Reviews Without Spec Traceability | Risk Level        |
| ------- | --------------------------------- | ----------------- |
| 001-010 | ~40 reviews                       | Moderate (legacy) |
| 011+    | Ongoing                           | **Increasing**    |

**Recommendation**: Prioritize for next sprint (sprint-012).
