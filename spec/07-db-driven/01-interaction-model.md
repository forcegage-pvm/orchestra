# Orchestra v2: Interaction Model

> **Document**: Interaction Model  
> **Version**: 0.1.0  
> **Status**: Draft  
> **Date**: 2025-12-08  
> **Depends On**: [00-problem-statement.md](00-problem-statement.md)

---

## 1. Overview

This document defines **how agents and the system communicate** in Orchestra v2.

The core principle from the problem statement:
> Agent provides **judgment/content**. System provides **structure/format**.

This document answers:
- What does "agent says something" mean technically?
- What does "system creates something" mean technically?
- How do they communicate back and forth?
- What are the boundaries?

---

## 2. The Fundamental Pattern

Every Orchestra workflow step follows this pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. SYSTEM: Present Context                                      │
│    "Here's the current state, here's what needs deciding"       │
│                                                                 │
│    • Current task from manifest                                 │
│    • Dependencies and their status                              │
│    • Relevant files/context                                     │
│    • What judgment is needed                                    │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. AGENT: Provide Judgment                                      │
│    "Here's my analysis, decision, content"                      │
│                                                                 │
│    • Semantic content (what, not how to format)                 │
│    • Reasoning (why this decision)                              │
│    • Confidence signals (uncertain areas)                       │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. SYSTEM: Create Artifacts                                     │
│    "I'll record that properly"                                  │
│                                                                 │
│    • Generate structured files (YAML, MD)                       │
│    • Update manifest/progress                                   │
│    • Validate format/completeness                               │
│    • Signal readiness for next step                             │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. SYSTEM: Advance Workflow                                     │
│    "Moving to next step"                                        │
│                                                                 │
│    • Transition state machine                                   │
│    • Trigger next agent interaction (if needed)                 │
│    • Or wait for external event (implementor completion)        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Communication Mechanisms

### 3.1 System → Agent: Structured Prompts

The system provides context to the agent via **structured prompts**:

```
┌─────────────────────────────────────────────────────────────────┐
│ SYSTEM PROMPT: Prepare Task                                     │
├─────────────────────────────────────────────────────────────────┤
│ CURRENT STATE:                                                  │
│   Sprint: sprint-015                                            │
│   Task: 3 - "Implement user authentication"                     │
│   Status: PENDING → preparing                                   │
│   Dependencies: [1: COMPLETE, 2: COMPLETE]                      │
│                                                                 │
│ TASK DEFINITION (from manifest):                                │
│   title: "Implement user authentication"                        │
│   description: "Add login/logout with JWT tokens"               │
│   files_likely: [src/auth/*, test/auth/*]                       │
│                                                                 │
│ SPECIFICATION CONTEXT:                                          │
│   [Relevant excerpts from spec files]                           │
│                                                                 │
│ JUDGMENT NEEDED:                                                │
│   1. What are the verification criteria (hidden)?               │
│   2. What are the acceptance criteria (visible)?                │
│   3. What context does the implementor need?                    │
│   4. What files will likely be created/modified?                │
│   5. What tests should exist?                                   │
└─────────────────────────────────────────────────────────────────┘
```

The system **never asks the agent to create files**. It asks for **judgment**.

### 3.2 Agent → System: Semantic Responses

The agent provides semantic content, not formatted artifacts:

```
┌─────────────────────────────────────────────────────────────────┐
│ AGENT RESPONSE: Prepare Task Judgment                           │
├─────────────────────────────────────────────────────────────────┤
│ VERIFICATION CRITERIA (hidden from implementor):                │
│                                                                 │
│   File Checks:                                                  │
│     - src/auth/jwt.ts must exist                                │
│     - src/auth/jwt.ts must export 'createToken' function        │
│     - src/auth/jwt.ts must export 'verifyToken' function        │
│     - test/auth/jwt.test.ts must exist                          │
│     - test/auth/jwt.test.ts must have 10+ test cases            │
│                                                                 │
│   Code Checks:                                                  │
│     - createToken must accept userId and expiry                 │
│     - verifyToken must throw on invalid token                   │
│     - No secrets hardcoded (check for 'password', 'secret')     │
│                                                                 │
│   Test Checks:                                                  │
│     - All tests must pass                                       │
│     - Coverage on src/auth/ must be > 80%                       │
│                                                                 │
│ ACCEPTANCE CRITERIA (visible to implementor):                   │
│                                                                 │
│   - Create JWT token generation and verification                │
│   - Handle token expiry                                         │
│   - Write comprehensive tests                                   │
│   - Follow existing auth patterns in codebase                   │
│                                                                 │
│ CONTEXT FOR IMPLEMENTOR:                                        │
│                                                                 │
│   The app uses Express.js. See src/middleware/auth.ts for       │
│   how tokens will be used. The User model is in                 │
│   src/models/user.ts. Use the existing bcrypt setup for         │
│   any password hashing needed.                                  │
│                                                                 │
│ EXPECTED FILES:                                                 │
│   Create: src/auth/jwt.ts, test/auth/jwt.test.ts                │
│   Modify: src/auth/index.ts (add export)                        │
│                                                                 │
│ CONFIDENCE NOTES:                                               │
│   - Unsure about exact token expiry requirements                │
│   - May need to check if refresh tokens are needed              │
└─────────────────────────────────────────────────────────────────┘
```

Note: **No YAML. No markdown formatting. No file paths for artifacts.** Just semantic content.

### 3.3 System Response: Artifact Creation

The system takes the agent's semantic response and creates proper artifacts:

```yaml
# SYSTEM CREATES: .orchestra/orchestrator/.orchestrator-only/verification/task-003.yaml

version: "1.0"
task_id: 3
created_at: "2025-12-08T10:30:00Z"
created_by: "system"

file_checks:
  - path: "src/auth/jwt.ts"
    exists: true
  - path: "src/auth/jwt.ts"
    exports: ["createToken", "verifyToken"]
  - path: "test/auth/jwt.test.ts"
    exists: true
  - path: "test/auth/jwt.test.ts"
    test_count_min: 10

code_checks:
  - file: "src/auth/jwt.ts"
    function: "createToken"
    parameters: ["userId", "expiry"]
  - file: "src/auth/jwt.ts"
    function: "verifyToken"
    throws_on: "invalid token"
  - pattern: "(password|secret)\\s*[:=]\\s*['\"]"
    must_not_match: true
    scope: "src/auth/"

test_checks:
  - command: "npm test"
    expect: "pass"
  - coverage:
      path: "src/auth/"
      min: 80
```

```markdown
# SYSTEM CREATES: .orchestra/handover/current-task.md

# Task 3: Implement user authentication

## Objective

Add login/logout with JWT tokens

## Acceptance Criteria

- [ ] Create JWT token generation and verification
- [ ] Handle token expiry
- [ ] Write comprehensive tests
- [ ] Follow existing auth patterns in codebase

## Context

The app uses Express.js. See src/middleware/auth.ts for how tokens will be used. 
The User model is in src/models/user.ts. Use the existing bcrypt setup for any 
password hashing needed.

## Expected Deliverables

| Action | File |
|--------|------|
| Create | src/auth/jwt.ts |
| Create | test/auth/jwt.test.ts |
| Modify | src/auth/index.ts |

## When Complete

Signal completion using `orchestra signal` command.
```

The agent's semantic content becomes properly formatted artifacts, every time, consistently.

---

## 4. Interaction Types

### 4.1 Judgment Interactions

These require agent reasoning and produce semantic content:

| Workflow Step | Agent Judgment Needed |
|---------------|----------------------|
| **prepare** | Verification criteria, acceptance criteria, implementor context |
| **verify** | Pass/fail evaluation, failure reasons, remediation hints |
| **complete** | Lessons learned, technical debt notes |
| **escalate** | Problem summary, attempted solutions, recommended action |

### 4.2 Acknowledgment Interactions

These confirm agent understanding (simple yes/no/choice):

| Workflow Step | Agent Acknowledgment Needed |
|---------------|----------------------------|
| **accept-signal** | "Proceed with verification?" |
| **retry** | "Understood feedback, will retry" |
| **closeout** | "Confirmed previous task complete" |

### 4.3 No-Agent Interactions

These are purely system operations with no agent involvement:

| Workflow Step | System Operation |
|---------------|------------------|
| **init** | Create folder structure, default manifest |
| **status** | Read and display current state |
| **signal** (by implementor) | Record completion signal, run pre-checks |

---

## 5. The Handover Problem (Case Study)

The `prepare` step is the most complex interaction. Let's trace through the current vs proposed model.

### 5.1 Current Model (v1)

```
┌────────────────────────────────────────────────────────────────┐
│ ORCHESTRATOR AGENT                                             │
│                                                                │
│ 1. Run `orchestra prepare --task 3`                            │
│    → System creates template files                             │
│                                                                │
│ 2. Open .orchestra/handover/current-task.md                    │
│    → Agent sees template with [REQUIRED] placeholders          │
│                                                                │
│ 3. Fill in template sections:                                  │  ← FAILURE POINT
│    - Objective                                                 │
│    - Acceptance criteria                                       │
│    - Context                                                   │
│    - Files                                                     │
│                                                                │
│ 4. Create .orchestra/orchestrator/.orchestrator-only/          │  ← FAILURE POINT
│    verification/task-003.yaml                                  │
│    → Agent writes YAML directly                                │
│                                                                │
│ 5. Complete pre-flight checklist (template)                    │  ← FAILURE POINT
│                                                                │
│ 6. Run `orchestra prepare --finalize`                          │
│    → System validates (often fails due to format issues)       │
└────────────────────────────────────────────────────────────────┘
```

Failure points are structural tasks that agents handle unreliably.

### 5.2 Proposed Model (v2)

```
┌────────────────────────────────────────────────────────────────┐
│ SYSTEM                                                         │
│                                                                │
│ 1. Determine next task (from manifest)                         │
│ 2. Gather context (task definition, dependencies, specs)       │
│ 3. Present to orchestrator agent:                              │
│    "Task 3 is ready. What are your criteria and context?"      │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ ORCHESTRATOR AGENT                                             │
│                                                                │
│ Provides judgment:                                             │
│ - "Verify these file checks: ..."                              │
│ - "The implementor should know: ..."                           │
│ - "Hidden criteria include: ..."                               │
│ (Unstructured semantic content, not YAML/MD)                   │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ SYSTEM                                                         │
│                                                                │
│ 4. Parse agent's semantic response                             │
│ 5. Create verification/task-003.yaml (valid YAML, guaranteed)  │
│ 6. Create current-task.md (from template, guaranteed)          │
│ 7. Update manifest (task → IMPLEMENT)                          │
│ 8. Update progress (PREPARE entry)                             │
│ 9. Signal: "Handover ready for implementor"                    │
└────────────────────────────────────────────────────────────────┘
```

Zero structural tasks for agent. All formatting is system responsibility.

---

## 6. Agent Response Formats

### 6.1 Option A: Natural Language (System Parses)

Agent responds in natural language. System uses parsing/NLP to extract structured data.

```
Agent: "For verification, check that jwt.ts exists and exports createToken
        and verifyToken. Also make sure there are at least 10 tests. The
        implementor should create the JWT module and follow existing patterns."

System: [Parses into structured criteria]
```

**Pros**: Most natural for agent, no format constraints  
**Cons**: Parsing is fragile, may miss nuance, expensive

### 6.2 Option B: Structured Tool Calls (MCP)

Agent calls MCP tools with typed parameters. System validates and processes.

```typescript
// Agent calls tool:
prepare_task({
  task_id: 3,
  verification: {
    file_checks: [
      { path: "src/auth/jwt.ts", must_exist: true },
      { path: "src/auth/jwt.ts", exports: ["createToken", "verifyToken"] }
    ],
    test_checks: [
      { path: "test/auth/jwt.test.ts", min_count: 10 }
    ]
  },
  acceptance_criteria: [
    "Create JWT token generation",
    "Handle token expiry",
    "Write comprehensive tests"
  ],
  context: "The app uses Express.js. See src/middleware/auth.ts..."
})
```

**Pros**: Strongly typed, validated input, clear contract  
**Cons**: Agent must conform to schema (a structural task)

### 6.3 Option C: Hybrid (Semi-Structured)

Agent provides key-value pairs or simple structure. System normalizes and expands.

```
Agent Response:
  
VERIFICATION:
- file: src/auth/jwt.ts, check: exists
- file: src/auth/jwt.ts, check: exports createToken, verifyToken
- file: test/auth/jwt.test.ts, check: at least 10 tests

ACCEPTANCE:
- Create JWT token generation
- Handle token expiry
- Write comprehensive tests

CONTEXT:
The app uses Express.js...
```

**Pros**: Some structure without full schema compliance  
**Cons**: Still requires consistent formatting

### 6.4 Option D: Conversational Extraction

System asks targeted questions, agent answers, system builds artifact incrementally.

```
System: "What files should exist after this task?"
Agent: "src/auth/jwt.ts and test/auth/jwt.test.ts"

System: "What functions should jwt.ts export?"
Agent: "createToken and verifyToken"

System: "How many tests should exist?"
Agent: "At least 10"

System: "What context does the implementor need?"
Agent: "They should know about the Express.js setup and..."
```

**Pros**: Agent just answers questions (pure judgment)  
**Cons**: Many round-trips, slow, may feel tedious

### 6.5 Recommendation

**Primary: Option B (MCP tool calls) with Option D (conversational) as fallback.**

Rationale:
- MCP tools provide clear contracts and validation
- If agent fails to call tool correctly, system falls back to asking questions
- Questions are pure judgment (no structural burden)
- System always controls artifact creation

---

## 7. System-Side Processing

### 7.1 Input Validation

System validates agent input before creating artifacts:

| Check | Example |
|-------|---------|
| Required fields present | "verification criteria" must exist |
| References valid | File paths are syntactically valid |
| No contradictions | Can't require file exists AND doesn't exist |
| Scope appropriate | Criteria reference files in expected directories |
| Complexity bounds | Not 500 verification checks for one task |

### 7.2 Normalization

System normalizes agent input to canonical form:

| Agent Says | System Normalizes To |
|------------|---------------------|
| "jwt.ts should exist" | `{ path: "src/auth/jwt.ts", exists: true }` |
| "at least 10 tests" | `{ test_count: { min: 10 } }` |
| "exports createToken" | `{ exports: ["createToken"] }` |
| "no hardcoded secrets" | `{ pattern_match: { regex: "...", must_not_match: true } }` |

### 7.3 Artifact Generation

System generates artifacts using templates + validated data:

```
Agent Input (validated)
        │
        ▼
┌─────────────────┐
│ Template Engine │ ← Templates stored in system (not editable by agent)
└─────────────────┘
        │
        ▼
Formatted Artifact (guaranteed valid)
```

---

## 8. Error Handling

### 8.1 Agent Provides Incomplete Judgment

```
System: "I need verification criteria for this task."
Agent: "Just make sure it works."

System: "That's not specific enough. What files should exist?"
Agent: "The JWT files."

System: "Which specific files? I need paths."
Agent: "src/auth/jwt.ts"

System: "What should that file contain or export?"
Agent: [continues until sufficient]
```

System prompts iteratively until it has enough to create valid artifacts.

### 8.2 Agent Provides Contradictory Judgment

```
System: "You said jwt.ts should export 'createToken' but also said
        'no functions should be exported'. Which is correct?"
Agent: "createToken should be exported. Ignore the second statement."

System: [Creates artifact with corrected criteria]
```

### 8.3 Agent Provides Invalid References

```
System: "You referenced 'src/auth/middleware.ts' but I don't see that
        file in the codebase. Did you mean 'src/middleware/auth.ts'?"
Agent: "Yes, I meant src/middleware/auth.ts"

System: [Creates artifact with corrected path]
```

---

## 9. State Management

### 9.1 Interaction State Machine

```
                     ┌─────────────────────────────────────┐
                     │                                     │
                     ▼                                     │
            ┌─────────────────┐                            │
            │   AWAITING      │                            │
     ┌─────▶│   JUDGMENT      │                            │
     │      └────────┬────────┘                            │
     │               │ agent responds                      │
     │               ▼                                     │
     │      ┌─────────────────┐                            │
     │      │   VALIDATING    │────── invalid ─────────────┘
     │      └────────┬────────┘       (prompt for correction)
     │               │ valid
     │               ▼
     │      ┌─────────────────┐
     │      │   CREATING      │
     │      │   ARTIFACTS     │
     │      └────────┬────────┘
     │               │ success
     │               ▼
     │      ┌─────────────────┐
     │      │   COMPLETE      │─────▶ (next workflow step)
     │      └─────────────────┘
     │
     └─────── needs more info ─────────────────────────────┐
                                                           │
                                                           │
             System asks clarifying questions ◀────────────┘
```

### 9.2 Persistence

All interaction state is persisted:
- Current workflow step
- Pending judgment request
- Partial agent responses
- Validation errors
- Created artifacts

This allows:
- Resume after interruption
- Audit trail
- Debugging failures

---

## 10. Security Considerations

### 10.1 Trust Boundary Enforcement

The interaction model must enforce the orchestrator/implementor boundary:

| Data | Orchestrator Can See | Implementor Can See |
|------|---------------------|---------------------|
| Verification criteria | ✅ Yes | ❌ No |
| Acceptance criteria | ✅ Yes | ✅ Yes |
| Task context | ✅ Yes | ✅ Yes |
| Other tasks | ✅ Yes | ❌ No |
| Manifest | ✅ Yes | ❌ No |

System enforces: implementor interactions never include hidden criteria.

### 10.2 Judgment Provenance

Track who provided each judgment:

```yaml
# Artifact includes provenance
verification:
  source: "orchestrator-agent"
  session_id: "abc123"
  timestamp: "2025-12-08T10:30:00Z"
  criteria:
    - ...
```

---

## 11. Resolved Design Decisions

### 11.1 MCP Tool Granularity

**Decision**: Hybrid approach — Primary tools for initial input, granular tools for updates.

**Rationale**: Agents should be able to provide everything in one comprehensive call initially (happy path), but need granular tools to make targeted changes to specific tasks, criteria, or details without re-submitting everything.

**Implementation Pattern**:
```
Primary Tools (initial submission):
  - prepare_task(task_id, verification, acceptance, context, files)
  - submit_verification_result(task_id, passed, failures, reasoning)
  - signal_completion(task_id, summary, files_changed)

Granular Tools (updates/corrections):
  - update_verification_criteria(task_id, criteria_id, changes)
  - add_verification_check(task_id, check)
  - remove_verification_check(task_id, criteria_id)
  - update_acceptance_criteria(task_id, criteria)
  - update_implementor_context(task_id, context)
```

This allows the agent to work efficiently (one call for new work) while still being able to make surgical corrections without full re-submission.

### 11.2 Fallback Strategy (Validation Enforcement)

**Decision**: Strict rejection — no progression until valid input.

**Rationale**: This is the core enforcement mechanism of Orchestra v2. The system MUST reject invalid tool calls and block workflow progression until the agent provides schema-compliant, fully validated input. No partial acceptance, no conversational fallback.

**Enforcement Model**:
```
Agent calls tool with invalid input
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ SYSTEM VALIDATION                                               │
│                                                                 │
│  1. Schema validation (required fields, types, formats)         │
│  2. Semantic validation (valid references, no contradictions)   │
│  3. Workflow validation (correct step, preconditions met)       │
│                                                                 │
│  ANY failure → REJECT with detailed error                       │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ ERROR RESPONSE                                                  │
│                                                                 │
│  {                                                              │
│    "success": false,                                            │
│    "errors": [                                                  │
│      { "field": "verification.file_checks",                     │
│        "error": "required field missing" },                     │
│      { "field": "acceptance_criteria[2]",                       │
│        "error": "empty string not allowed" }                    │
│    ],                                                           │
│    "hint": "Provide file_checks array with at least one check"  │
│  }                                                              │
│                                                                 │
│  Workflow state: UNCHANGED (still awaiting valid input)         │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
Agent must call again with corrected input
```

**Key Principle**: The agent cannot proceed to any next step until the current step/call is fixed. This is the structural enforcement that replaces "hoping agents fill templates correctly."

**Benefits**:
- Guaranteed artifact validity (if tool succeeds, artifact is correct)
- Clear contract (agent knows exactly what's required)
- No ambiguous partial states
- Audit trail of attempts and corrections

### 11.3 Agent Confidence / Uncertainty

**Decision**: No mechanism — out of scope.

**Rationale**: Orchestra is an **execution and implementation engine**, not a specification refinement engine. By the time Orchestra acts, the specifications should already be reviewed, comprehensive, and unambiguous.

**Scope Boundary**:
- **In scope**: Executing clear specifications, enforcing workflow, validating structure
- **Out of scope**: Resolving ambiguous requirements, refining unclear specs, capturing uncertainty

If specifications are unclear, that's a problem to solve *before* Orchestra runs, not during. The orchestrator agent receives clear instructions and translates them into verification criteria and handovers. The implementor agent receives clear handovers and executes them.

**Implication**: Tool schemas have no confidence fields, no uncertainty flags, no "maybe" states. Inputs are either valid (proceed) or invalid (reject).

### 11.4 Multi-Turn Validation Limits

**Decision**: Configurable per-tool retry limits.

**Rationale**: While agents should ideally have no limit to retry until correct, having configurable limits per tool is useful for detecting stuck agents and providing an escalation path. Different tools may have different complexity — a simple acknowledgment tool might have a lower limit than a complex `prepare_task` tool.

**Implementation**:
```yaml
# Orchestra config
tool_limits:
  prepare_task:
    max_retries: 10        # Complex tool, more attempts allowed
  signal_completion:
    max_retries: 5         # Simpler tool
  update_verification_criteria:
    max_retries: 5
  default:
    max_retries: 5         # Fallback for tools not explicitly configured
```

**Behavior on Limit Exceeded**:
```
Agent exceeds max_retries for tool
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ SYSTEM                                                          │
│                                                                 │
│  1. Log all attempts with validation errors                     │
│  2. Transition workflow to ESCALATED state                      │
│  3. Notify human: "Agent failed to provide valid input for      │
│     prepare_task after 10 attempts. Last errors: [...]"         │
│  4. Block further agent interaction until human resolves        │
└─────────────────────────────────────────────────────────────────┘
```

**Key Points**:
- Limits are per-tool, not global (different tools have different complexity)
- Limits are configurable per project
- Sensible defaults provided
- Exceeding limit escalates to human, doesn't silently fail

### 11.5 Artifact Versioning

**Decision**: Hybrid — versioning behavior defined per tool/artifact type.

**Rationale**: Different artifacts have different criticality. Verification criteria changes should be tracked (they're the core of Orchestra's integrity). Progress updates can simply replace (they're transient state). This allows optimizing storage and complexity where it matters.

**Versioning by Artifact Type**:

| Artifact | Versioning | Rationale |
|----------|------------|-----------|
| Verification criteria | **Full history** | Critical for audit, rollback, understanding changes |
| Acceptance criteria | **Full history** | Visible to implementor, changes matter |
| Handover content | **Full history** | Documents what implementor was told |
| Verification results | **Full history** | Evidence trail of pass/fail decisions |
| Progress/status | **Replace only** | Transient state, current value is what matters |
| Manifest updates | **Replace with log** | Single source of truth, but log changes |

**Implementation Pattern**:
```typescript
// Tool definition includes versioning behavior
{
  name: "update_verification_criteria",
  versioning: "full",  // "full" | "replace" | "replace_with_log"
  // ...
}
```

**Full History Example**:
```yaml
# verification/task-003.yaml
current_version: 3
versions:
  - version: 1
    timestamp: "2025-12-08T10:30:00Z"
    criteria: [...]
  - version: 2
    timestamp: "2025-12-08T10:35:00Z"
    criteria: [...]  # added file check
  - version: 3
    timestamp: "2025-12-08T10:40:00Z"
    criteria: [...]  # modified test count
```

**Replace with Log Example**:
```yaml
# manifest.yaml (current state only)
tasks:
  - id: 3
    status: IMPLEMENT

# Separate changelog
manifest_log:
  - timestamp: "2025-12-08T10:30:00Z"
    change: "task 3: PENDING → IMPLEMENT"
```

---

## 13. Next Steps

1. **Map existing workflow** — For each step in `docs/workflow/`, classify every action as judgment (agent) or structure (system)
2. **Design MCP tool schemas** — Define the tool signatures for each interaction type
3. **Prototype prepare interaction** — Build end-to-end for the most complex step
4. **Test with real agent** — Validate that agents can call tools reliably

---

## Appendix A: Comparison with v1

| Aspect | v1 (Current) | v2 (Proposed) |
|--------|--------------|---------------|
| Handover creation | Agent fills template | System creates from agent input |
| Verification YAML | Agent writes directly | System generates from agent judgment |
| Signal creation | Agent creates file | System creates from agent confirmation |
| Progress updates | Agent/CLI updates | System updates automatically |
| Format validation | Post-hoc (often fails) | Built-in (guaranteed) |
| Agent burden | Judgment + Structure | Judgment only |
| Failure mode | Corrupted artifacts | Invalid input (recoverable) |
