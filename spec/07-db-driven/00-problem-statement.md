# Orchestra v2: Problem Statement

> **Document**: Problem Statement  
> **Version**: 0.1.0  
> **Status**: Draft  
> **Date**: 2025-12-08

---

## 1. The Core Problem

**AI agents are excellent at judgment and reasoning, but unreliable at producing structured, repeatable outputs.**

When we ask an agent to:
- "Determine what verification criteria should apply to this task"
- "Decide if this implementation meets the requirements"
- "Figure out what files need to change"

They perform well. These are **judgment tasks**.

When we ask an agent to:
- "Fill out this template correctly"
- "Create a YAML file in this exact format"
- "Follow this 10-step administrative protocol"
- "Produce output that another system can reliably parse"

They fail unpredictably. These are **structural tasks**.

---

## 2. The Orchestra Paradox

Orchestra (v1) validated a powerful concept:

> **Hidden verification prevents implementation theater.**

By separating what the implementor sees (acceptance criteria) from what the orchestrator verifies against (hidden criteria), we prevent agents from gaming the tests.

**But the implementation of this concept gave agents autonomy over both:**
- The **judgment work** (deriving criteria, evaluating implementations) — where they excel
- The **structural work** (filling templates, creating files, following protocols) — where they fail

The result: agents produce brilliant verification criteria... in the wrong format, in the wrong file, with the wrong structure, breaking the entire workflow.

---

## 3. Observed Failure Modes

### 3.1 Template Corruption

**What happened**: Agent asked to fill `current-task.md.hbs` template.

**Result**: Template rendered with collapsed line breaks, malformed markdown tables, broken Handlebars syntax.

**Root cause**: Agent treated "fill template" as a creative writing task, not a structural data task.

### 3.2 Protocol Drift

**What happened**: Agent instructed to follow 10-step orchestrator workflow.

**Result**: Agent skipped steps 3, 7, 8. Combined steps 4-5. Added its own step 11.

**Root cause**: Agent optimized for "getting the job done" not "following the exact protocol."

### 3.3 Format Inconsistency

**What happened**: Agent asked to create verification criteria in YAML format.

**Result**: First task: valid YAML. Third task: markdown with YAML code blocks. Fifth task: JSON. Seventh task: prose description.

**Root cause**: Without enforcement, agents drift toward whatever seems convenient in the moment.

### 3.4 Signal/Artifact Mismatch

**What happened**: Agent signaled "task complete" via completion-signal.md.

**Result**: Signal file existed but was missing required fields. Pre-signal checks couldn't parse it.

**Root cause**: Agent produced "a signal" but not "the signal format the system expects."

---

## 4. The Insight

**Current model (broken):**
```
Human/System: "Here's what to do and how to format the output"
Agent: *does the work AND produces the artifact*
System: *tries to parse agent's output* → fails unpredictably
```

**Proposed model:**
```
Agent: "Here's my judgment/decision/content" (unstructured)
System: *creates the artifact in correct format*
Agent: *continues with next judgment task*
```

The agent never touches templates, never creates YAML, never fills forms. The agent provides **semantic content**. The system provides **syntactic structure**.

---

## 5. What This Means for Orchestra

### 5.1 Current Workflow (Agent Does Everything)

```
┌─────────────────────────────────────────────────────────────┐
│ ORCHESTRATOR AGENT                                          │
│                                                             │
│  1. Read spec                           ← judgment          │
│  2. Determine verification criteria     ← judgment          │
│  3. Create verification/task-X.yaml     ← STRUCTURE (fails) │
│  4. Fill handover template              ← STRUCTURE (fails) │
│  5. Write current-task.md               ← STRUCTURE (fails) │
│  6. Signal "handover ready"             ← STRUCTURE (fails) │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Proposed Workflow (Separation of Concerns)

```
┌─────────────────────────────────────────────────────────────┐
│ ORCHESTRATOR AGENT                                          │
│                                                             │
│  "For task 3, verify:                                       │
│   - File exists at lib/src/models/foo.dart                  │
│   - Has copyWith method                                     │
│   - Exports from barrel file                                │
│   - 15+ tests exist                                         │
│   Acceptance criteria for implementor:                      │
│   - Create Foo model with properties x, y, z                │
│   - Follow existing patterns in codebase"                   │
│                                                             │
│  ↓ (structured content, not file)                           │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ SYSTEM                                                      │
│                                                             │
│  → Creates verification/task-003.yaml (correct format)      │
│  → Creates handover/current-task.md (from template)         │
│  → Updates manifest.yaml (task status)                      │
│  → Updates progress.yaml (tracking)                         │
│  → Signals "ready for implementor"                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. The Key Questions

This model raises fundamental technical questions:

### 6.1 How Does the Agent "Say" Things?

The agent must communicate its judgment to the system. Options:

| Mechanism | Pros | Cons |
|-----------|------|------|
| **MCP tool call** | Structured input schema, validated | Agent must call correctly |
| **Natural language → parser** | Agent just talks | Parsing is fragile |
| **Structured form/UI** | Human can verify | Not agent-native |
| **Hybrid: tool with loose schema** | Flexible input, system normalizes | Complexity |

### 6.2 How Does the System "Create" Things?

The system must transform agent judgment into artifacts. Options:

| Mechanism | Pros | Cons |
|-----------|------|------|
| **Templates + substitution** | Simple, predictable | Limited flexibility |
| **Code generation** | Full control | More to maintain |
| **Database + renderers** | Single source of truth | Architectural shift |

### 6.3 How Do We Validate Agent Judgment?

Even if the system handles structure, agent judgment can be wrong:

| Problem | Mitigation |
|---------|------------|
| Agent provides incomplete criteria | System prompts for required fields |
| Agent provides contradictory criteria | System detects conflicts |
| Agent provides impossible criteria | System validates feasibility |
| Agent provides criteria in wrong scope | System checks task boundaries |

### 6.4 How Does This Map to the Existing Workflow?

The conceptual workflow (`docs/workflow/`) is sound. The question is: which steps are **judgment** (agent) vs **structure** (system)?

| Workflow Step | Current Owner | Proposed Owner |
|---------------|---------------|----------------|
| Determine next task | Agent | **System** (from manifest) |
| Define verification criteria | Agent | **Agent** (content only) |
| Create verification YAML | Agent | **System** |
| Fill handover template | Agent | **System** |
| Write current-task.md | Agent | **System** |
| Implement task | Agent | **Agent** |
| Determine what was done | Agent | **Agent** |
| Create signal file | Agent | **System** |
| Run pre-signal checks | System | **System** |
| Evaluate verification | Agent | **Agent** (judgment only) |
| Record verification results | Agent | **System** |
| Update progress | Agent | **System** |

---

## 7. Success Criteria for v2

A successful v2 architecture will:

1. **Never ask agents to fill templates** — system handles all formatting
2. **Never ask agents to create structured files** — system creates from agent input
3. **Never ask agents to follow multi-step protocols** — system orchestrates steps
4. **Let agents focus purely on judgment** — what to do, not how to record it
5. **Produce consistent, parseable artifacts** — every time, not just sometimes
6. **Maintain the hidden verification principle** — structure doesn't compromise security

---

## 8. What We're NOT Changing

The core Orchestra concepts remain:

- ✅ Hidden verification criteria (orchestrator-only)
- ✅ Role separation (orchestrator vs implementor)
- ✅ Task lifecycle (prepare → implement → verify → complete)
- ✅ Retry with feedback on failure
- ✅ Escalation to human on max retries
- ✅ Single-task visibility for implementor

We're changing **how these concepts are implemented**, not the concepts themselves.

---

## 9. Next Steps

1. **Define the judgment/structure boundary** — for each workflow step, what is agent input vs system output?
2. **Design the communication protocol** — how does agent provide judgment to system?
3. **Design the artifact generation** — how does system create files from agent input?
4. **Map to existing workflow** — show the transformation preserves the conceptual model
5. **Prototype the critical path** — prepare → implement → verify cycle

---

## Appendix A: Terminology

| Term | Definition |
|------|------------|
| **Judgment task** | Requires reasoning, evaluation, decision-making |
| **Structural task** | Requires format compliance, protocol adherence, data entry |
| **Agent input** | Semantic content provided by agent (decisions, criteria, evaluations) |
| **System output** | Formatted artifacts created by system (YAML, markdown, signals) |
| **Artifact** | A file or data structure that persists state |
| **Protocol** | A multi-step process that must be followed exactly |
