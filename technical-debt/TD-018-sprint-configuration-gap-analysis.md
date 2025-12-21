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

## Acceptance Criteria

1. [ ] Sprint configuration requires spec file references
2. [ ] Gap analysis runs automatically after configuration
3. [ ] Coverage report is generated and stored
4. [ ] Human supervisor can view full sprint summary
5. [ ] Sprints with gaps require explicit approval
6. [ ] Gap analysis results are auditable

## Related

- Sprint 003C: Context-Aware Play Button (failed due to spec deviation)
- Sprint 003D: SessionManager Implementation (fix for 003C gaps)
- [sprint-003-autonomous-orchestration.md](../spec/sprints/003-autonomous-orchestration/sprint-003-autonomous-orchestration.md): Original specification

## Notes

This is a systemic process failure, not a one-time bug. The orchestration system's core value proposition is **preventing implementation theater** - but if sprint configuration itself can deviate from spec undetected, we've just moved the theater upstream.
