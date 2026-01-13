# TD-018: Sprint Configuration Gap Analysis

**Priority**: CRITICAL  
**Status**: OPEN  
**Created**: 2025-12-21  
**Sprint**: To be implemented after Sprint 003D  

## Problem Statement

Sprint 003C "Context-Aware Play Button" passed all 11/14 task verifications but the core functionality is **completely broken**. The implementation deviated massively from the original specification:

| Spec Requirement | Sprint 003C Implementation |
|-----------------|---------------------------|
| SessionManager class with dual sessions | Not implemented |
| `mode: 'agent'` parameter | Not used |
| `modelSelector` parameter | Not used |
| Chat Panel for orchestrator (persistent) | Not implemented |
| Chat Editor Tab for implementor (cleared) | Not implemented |
| File attachments via `attachFiles` | Not implemented |

The `@orchestra` participant was built as a static keyword-matching handler instead of an LLM-powered agent, making the entire Play button feature non-functional.

## Root Cause

1. **No spec-to-sprint validation step**: Sprint configuration was accepted without cross-referencing against the source specification
2. **Verification criteria were too shallow**: Structural checks passed (file exists, function exists) but didn't verify functional requirements
3. **Spike findings were misinterpreted**: Task 1 conclusions didn't match actual VS Code Chat API behavior

## Required Process Changes

### 1. Sprint Summary Generation

Before sprint execution begins, generate a complete sprint summary screen showing:

- **High-level overview**: Sprint goals, phases, task count, estimated complexity
- **Detailed breakdown**: Each task with:
  - Title and description
  - Source spec references (file, section, line numbers)
  - Acceptance criteria mapped to spec requirements
  - Verification criteria mapped to spec requirements
- **Dependency graph**: Visual representation of task dependencies
- **Risk assessment**: Complexity, unknowns, external dependencies

This summary must be presented to the human supervisor for review before execution starts.

### 2. Spec-to-Sprint Gap Analysis

Add a mandatory validation step during sprint configuration:

```
PHASE: GAP_ANALYSIS (after CONFIGURE, before PREPARE)

For each task:
1. Identify source spec reference (file, section)
2. Extract all requirements from spec section
3. Compare against task description, acceptance criteria, verification criteria
4. Flag any spec requirement not covered by task
5. Flag any task requirement not traceable to spec
6. Generate coverage matrix

Output: Gap Analysis Report
- Coverage percentage
- Missing requirements (spec items not in sprint)
- Orphan requirements (sprint items not in spec)
- Recommendation: PROCEED / REVIEW_REQUIRED / BLOCK

If coverage < 100% or orphans exist: Require human supervisor approval
```

### 3. Implementation Requirements

#### Database Schema Changes

```sql
-- New table for spec references
CREATE TABLE spec_references (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL,
  spec_file TEXT NOT NULL,
  spec_section TEXT,
  spec_line_start INTEGER,
  spec_line_end INTEGER,
  requirement_text TEXT NOT NULL,
  coverage_status TEXT DEFAULT 'PENDING', -- PENDING, COVERED, GAP
  FOREIGN KEY (task_id) REFERENCES tasks(task_id)
);

-- New table for gap analysis results
CREATE TABLE gap_analysis (
  id INTEGER PRIMARY KEY,
  sprint_id TEXT NOT NULL,
  analysis_timestamp TEXT NOT NULL,
  coverage_percentage REAL,
  missing_count INTEGER,
  orphan_count INTEGER,
  recommendation TEXT,
  approved_by TEXT,
  approved_at TEXT
);
```

#### MCP Tools Required

- `analyze_spec_coverage`: Compare sprint tasks against source spec
- `generate_sprint_summary`: Create comprehensive sprint overview
- `get_gap_analysis`: Retrieve gap analysis for current sprint

#### UI Requirements

- Sprint Summary view in VS Code sidebar
- Gap Analysis report view with drill-down
- Approval workflow for gap-containing sprints

## Impact

Without this fix:
- Sprints can be configured that don't match specifications
- Verification can pass while core functionality is broken
- Human supervisors have no visibility into spec coverage
- Trust in the orchestration system is undermined

## 4. Handover Information Isolation Enforcement

**CRITICAL**: The information isolation principle is being violated during handover preparation.

### Problem

When calling `prepare_task`, orchestrators are including:
- Spec file references in context: "from spec lines 133-140, 572-578"
- Spec file paths in context_files: "sprint-003-autonomous-orchestration.md"
- References to other tasks: "Task 6 (not started)"
- Sprint structure information: "after Sprint 003D"

This violates the trust boundary - implementors must NEVER see:
- Where requirements came from (spec file paths/lines)
- What other tasks exist in the sprint
- Sprint configuration or manifest structure

### Required Solution

Add validation to `prepare_task` MCP tool:

```typescript
// Validate context field for forbidden patterns
const FORBIDDEN_PATTERNS = [
  /spec[\/\\].*\.md/i,           // spec file paths
  /lines?\s+\d+/i,                // line number references
  /from spec/i,                   // "from spec" phrases
  /task\s+\d+.*\(not\s+started\)/i,  // references to other tasks
  /sprint\s+\d{3}/i,              // sprint IDs
  /see\s+.*\.md/i,                // "see [file]" references
  /per\s+requirements\.md/i,      // "per requirements.md"
];

function validateHandoverContext(context: string): ValidationResult {
  const violations: string[] = [];
  
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(context)) {
      violations.push(`Forbidden pattern detected: ${pattern}`);
    }
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}
```

Add to `prepare_task` handler:
```typescript
const validation = validateHandoverContext(acceptance_criteria.context);
if (!validation.valid) {
  throw new Error(
    `Information isolation violation in handover context:\n${validation.violations.join('\n')}`
  );
}
```

### Context Files Validation

Add similar validation for `context_files` parameter:

```typescript
const FORBIDDEN_FILE_PATTERNS = [
  /spec[\/\\]/i,              // spec directory
  /tasks?\.md$/i,             // task lists
  /manifest\.ya?ml$/i,        // sprint manifests
  /\.orchestrator-only/i,     // orchestrator secrets
];

function validateContextFiles(files: string[]): ValidationResult {
  const violations: string[] = [];
  
  for (const file of files) {
    for (const pattern of FORBIDDEN_FILE_PATTERNS) {
      if (pattern.test(file)) {
        violations.push(`Forbidden file in context_files: ${file}`);
      }
    }
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}
```

### Orchestrator Mode Instructions

Update `.github/copilot-instructions.md` or agent mode files to include PRE-FLIGHT checklist before calling `prepare_task`:

```markdown
## Handover Preparation Checklist

Before calling prepare_task, verify:

- [ ] Context contains NO spec file references (no "spec/", no "lines 123-456")
- [ ] Context contains NO references to other tasks by ID
- [ ] Context contains NO sprint structure information
- [ ] Context_files contains ONLY source code files (no spec/, no tasks.md, no manifest.yaml)
- [ ] All requirements are EXTRACTED into acceptance_criteria (not referenced externally)
- [ ] All code examples are COMPLETE (no "see file X for details")
```

### Update Handover Workflow Violation

**Problem**: `update_handover` can currently be called at ANY time, including after the task has transitioned to IMPLEMENT status. This creates a workflow loophole where:
- Orchestrator can modify handover after implementor has already read it
- Post-hoc changes can hide mistakes or violations
- Breaks the immutability of the handover once implementation begins
- Undermines audit trail integrity

**Example violation**: Task 2 was in IMPLEMENT status, but `update_handover` was successfully called to fix information isolation violations.

**Required Solution**:

Add status gate to `update_handover` MCP tool:

```typescript
// In update_handover handler
const task = await getTask(task_id);

const ALLOWED_STATUSES = ['PENDING', 'PREPARE'];
if (!ALLOWED_STATUSES.includes(task.status)) {
  throw new Error(
    `Cannot update handover: Task ${task_id} is in ${task.status} status. ` +
    `Handover updates are only allowed in PENDING or PREPARE status. ` +
    `Once a task reaches IMPLEMENT, the handover is immutable.`
  );
}

// Proceed with update...
```

**Rationale**:
- PENDING: Task not yet prepared, no handover exists yet (edge case)
- PREPARE: Task being prepared, handover is work-in-progress
- IMPLEMENT: Handover is locked - implementor may have already read it
- VERIFY/COMPLETE: Handover is historical record

**Exception**: The only way to fix a bad handover after IMPLEMENT is to:
1. Fail verification with specific feedback
2. Task returns to PREPARE status (retry)
3. Orchestrator can then update_handover with corrections
4. Task returns to IMPLEMENT with updated handover

## Acceptance Criteria

1. [ ] Sprint configuration requires spec file references
2. [ ] Gap analysis runs automatically after configuration
3. [ ] Coverage report is generated and stored
4. [ ] Human supervisor can view full sprint summary
5. [ ] Sprints with gaps require explicit approval
6. [ ] Gap analysis results are auditable
7. [ ] `prepare_task` validates context for information isolation violations
8. [ ] `prepare_task` validates context_files for forbidden file patterns
9. [ ] Violations throw errors with clear messages before handover is created
10. [ ] Orchestrator mode instructions include pre-flight checklist
11. [ ] `update_handover` validates task status (only PENDING/PREPARE allowed)
12. [ ] `update_handover` throws error if task is in IMPLEMENT or later status

## Related

- Sprint 003C: Context-Aware Play Button (failed due to spec deviation)
- Sprint 003D: SessionManager Implementation (fix for 003C gaps)
- [sprint-003-autonomous-orchestration.md](../spec/sprints/003-autonomous-orchestration/sprint-003-autonomous-orchestration.md): Original specification

## Section 5: Verification Pattern Specificity Failure (Sprint 003D)

**Discovered**: 2025-12-21 during Sprint 003D execution

### Failure Chain

Sprint 003D Task 2 "Implement invokeOrchestrator method" was verified as COMPLETE, but the implementation had a critical bug: `mode: "agent"` instead of `mode: getAgentForRole("orchestrator")`.

| Layer | What Existed | What Was Missing |
|-------|--------------|------------------|
| **Spec** | `getAgentForRole()` → `"orchestra.orchestrator.agent"` | ✅ Correct |
| **ConfigService** | `getAgentForRole()` implemented correctly | ✅ Correct |
| **Task Description** | "mode: 'agent'" | ❌ **Wrong literal value** |
| **Verification Pattern** | `mode.*agent\|agent.*mode` | ❌ **Matches "agent" anywhere** |
| **Implementation** | `mode: "agent"` hardcoded | ❌ **Per task description** |
| **Tests** | `expect(mode).toBe("agent")` | ❌ **Verified wrong behavior** |
| **Verification Pass** | Regex matched | ❌ **Pattern too loose** |

### Root Causes

1. **Task description diverged from spec**: Orchestrator wrote "mode: 'agent'" instead of "mode from getAgentForRole()"
2. **Loose regex verification**: Pattern `mode.*agent` matches both wrong (`mode: "agent"`) and right (`mode: agentMode`)
3. **Tests verify implementation, not spec**: Implementor tests matched their code, not the requirement
4. **No service integration verification**: No check that SessionManager actually CALLS ConfigService.getAgentForRole()

### Required Fixes

1. **Verification patterns must be specific**:
   ```javascript
   // BAD - matches wrong implementation
   pattern: "mode.*agent"
   
   // GOOD - verifies correct integration
   pattern: "getAgentForRole.*orchestrator"
   pattern: "mode.*agentMode|agentMode.*mode"
   ```

2. **Task descriptions must reference service methods, not literal values**:
   ```
   // BAD
   "Uses mode: 'agent' parameter"
   
   // GOOD
   "Uses mode from ConfigService.getAgentForRole('orchestrator')"
   ```

3. **Behavioral checks should assert actual values**:
   ```javascript
   // Add grep check for integration
   {
     description: "SessionManager calls ConfigService.getAgentForRole",
     command: "grep -n 'getAgentForRole' extension/src/chat/SessionManager.ts",
     expect_output_contains: "getAgentForRole"
   }
   ```

4. **Cross-service integration tests required**:
   ```typescript
   it("should get agent mode from ConfigService", async () => {
     expect(mockConfigService.getAgentForRole).toHaveBeenCalledWith("orchestrator");
     expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
       "workbench.action.chat.open",
       expect.objectContaining({
         mode: "orchestra.orchestrator.agent" // Exact expected value
       })
     );
   });
   ```

### Updated Acceptance Criteria

13. [ ] Verification patterns must not use loose regexes that match partial/wrong values
14. [ ] Task descriptions must reference service methods, not hardcoded values
15. [ ] Behavioral checks must assert exact expected values where possible
16. [ ] Integration tests must verify cross-service calls

## Notes

This is a systemic process failure, not a one-time bug. The orchestration system's core value proposition is **preventing implementation theater** - but if sprint configuration itself can deviate from spec undetected, we've just moved the theater upstream.

**Sprint 003D Addendum**: Even when the spec is correct and ConfigService is correctly implemented, if the task description contains a wrong literal value and verification patterns are loose, the bug passes through undetected. The orchestra process has multiple failure modes that compound.
