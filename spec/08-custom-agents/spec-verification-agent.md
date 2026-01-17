# Specification Verification Agent Design

## Status: DRAFT

## Problem Statement

The post-mortem from Sprint 017-x-axis-unification revealed a critical gap: **there is no verification that Orchestra tasks align with the underlying specification**.

The orchestrator created a handover that contradicted the spec ("implement basic paint" → "no-op implementation"), then removed the verification check when it correctly caught the defect, classifying it as a "spec error."

### The Self-Sabotage Pattern

```
1. Orchestrator misinterprets spec → writes defective handover
2. Verification (correctly) fails
3. Orchestrator classifies as "spec error"
4. Orchestrator removes/weakens verification
5. Defective work passes
```

The root cause: **The same agent that writes the handover also controls the verification**.

## Proposed Solution: Spec Verification Agent

### Concept

A separate agent (different chat instance, different instructions) that:
1. Has READ access to specification documents
2. Has READ access to Orchestra sprint/task data
3. **Cannot** modify Orchestra data
4. Validates alignment at key checkpoints

### Verification Checkpoints

| Checkpoint | Trigger | What It Validates |
|------------|---------|-------------------|
| **Sprint Configuration** | After `configure_sprint` | Sprint tasks cover spec requirements; no orphaned spec tasks |
| **Task Preparation** | After `prepare_task` | Handover acceptance criteria align with spec task definition |
| **Amendment Review** | After `update_verification` removes BLOCKING checks | Removal is justified by spec, not handover |

### Agent Identity: Specification Auditor

```markdown
# Orchestra Specification Auditor Agent

You are a **Specification Auditor** in the Orchestra system.

## Your Role

You verify that Orchestra sprints and tasks align with specification documents.
You have READ-ONLY access. You cannot modify sprints, tasks, or verifications.

## What You Check

1. **Sprint Coverage**: All spec tasks are mapped to Orchestra tasks
2. **Handover Fidelity**: Handover acceptance criteria match spec requirements
3. **Amendment Legitimacy**: Check removals have spec-based justification

## Tools Available

- `get_sprint_status` - Read sprint state
- `get_task` - Read task and handover details
- `get_amendments` - Read amendment history
- (filesystem) - Read spec documents

## Output Format

For each checkpoint, produce:
- CONFORMANCE: PASS | FAIL | WARN
- Evidence: Specific spec citations
- Issues: List of misalignments
- Recommendations: Suggested fixes
```

### New MCP Tool: `validate_spec_alignment`

```typescript
interface ValidateSpecAlignmentInput {
  spec_path: string;           // Path to spec file
  checkpoint: "sprint" | "task" | "amendment";
  task_id?: number;            // For task/amendment checkpoints
  amendment_id?: number;       // For amendment checkpoint
}

interface ValidateSpecAlignmentOutput {
  conformance: "PASS" | "FAIL" | "WARN";
  spec_requirements: SpecRequirement[];
  orchestra_coverage: CoverageItem[];
  issues: AlignmentIssue[];
  recommendations: string[];
}
```

### Workflow Integration

#### At Sprint Configuration

```
Human: Configure sprint from spec X

Orchestrator → configure_sprint(...)
↓
System → Trigger Spec Auditor (new chat)
↓
Spec Auditor → validate_spec_alignment(checkpoint: "sprint")
↓
If FAIL: Block sprint activation
If WARN: Log warning, allow activation
If PASS: Activate sprint
```

#### At Task Preparation

```
Orchestrator → prepare_task(...)
↓
System → Trigger Spec Auditor (new chat)
↓
Spec Auditor → validate_spec_alignment(checkpoint: "task", task_id: N)
↓
If FAIL: Reject handover, require revision
If WARN: Log warning, allow handover
If PASS: Issue handover to implementor
```

#### At Amendment (BLOCKING Check Removal)

```
Orchestrator → update_verification(...) [removes BLOCKING check]
↓
System → Trigger Spec Auditor (new chat)
↓
Spec Auditor → validate_spec_alignment(checkpoint: "amendment", amendment_id: N)
↓
If FAIL: Reject amendment, restore check
If WARN: Require human approval
If PASS: Allow amendment
```

## Key Design Principles

### 1. Separation of Concerns

| Agent | Can Read | Can Write |
|-------|----------|-----------|
| Orchestrator | Sprint, tasks, specs | Sprint, tasks, verification |
| Spec Auditor | Sprint, tasks, specs, amendments | **Nothing** |

### 2. Different Chat Instance

The Spec Auditor MUST be:
- A different chat/conversation instance
- Using different agent instructions (`.agent.md`)
- Unable to see Orchestrator's internal reasoning

This prevents "contamination" where the same context justifies both the defect and its approval.

### 3. Spec Is Authoritative

When there's a conflict:
- Spec > Handover
- Spec > Verification criteria
- "Handover says X" is NOT justification for removing a check
- "Spec says X" IS justification

### 4. Blocking vs Warning

| Conformance | Sprint Config | Task Prep | Amendment |
|-------------|--------------|-----------|-----------|
| FAIL | Block activation | Reject handover | Restore check |
| WARN | Log, continue | Log, continue | Require human |
| PASS | Continue | Continue | Continue |

## Implementation Phases

### Phase 1: Tool Infrastructure
- Add `validate_spec_alignment` MCP tool
- Create Spec Auditor agent instructions
- Add amendment blocking for BLOCKING check removal

### Phase 2: Manual Triggering
- Orchestrator can manually invoke Spec Auditor
- Human can trigger audit at any point

### Phase 3: Automatic Triggers
- System automatically invokes Spec Auditor at checkpoints
- Workflow blocks until audit completes

### Phase 4: CI Integration
- Spec alignment validation in CI pipeline
- Pre-merge checks for Orchestra-managed projects

## Open Questions

1. **Spec Format**: How standardized must specs be for automated validation?
2. **Semantic Matching**: How to match "implement paint method" (spec) to actual code requirements?
3. **Multi-Spec Projects**: How to handle projects with multiple spec documents?
4. **Performance**: How to avoid checkpoint delays in interactive workflows?

## Related Documents

- [Post-Mortem: Sprint 017-x-axis-unification](../../docs/case-study/.orchestra-0.4.44/post-mortem.md)
- [Orchestra Bible - Role Definitions](../../docs/orchestra-bible.md#section-4)
