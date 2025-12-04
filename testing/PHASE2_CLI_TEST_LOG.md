# Phase 2 CLI Testing Log

**Date**: 2025-12-04  
**Spec**: `spec/implementation/phase-2-mcp`  
**Reference**: `case-study/.orchestra.latest`

---

## Decision: SpecKit-First Approach

**Date**: 2025-12-04

### Context
During testing, we discovered the CLI had drifted from the original Orchestra design which was tightly integrated with SpecKit. We were trying to generalize too early.

### Decision
Orchestra will have a **hard dependency on SpecKit** for v1.0. Generalization to arbitrary specs is deferred to future release.

### Implications

1. **CLI Flag**: `--speckit <path>` instead of `--spec <path>`
   - Clear about what we expect
   - Enables validation of SpecKit structure

2. **Config Structure** (orchestra.yaml):
   ```yaml
   speckit:
     root: "spec/implementation/phase-2-mcp"  # SpecKit spec folder
   ```
   - Verbose and clear
   - Future: can add `speckit.tasks`, `speckit.spec` overrides if needed

3. **Auto-Detection** (future):
   - Validate SpecKit structure (spec.md, tasks.md exist)
   - For now: just store path, trust user

4. **Traceability**:
   - manifest.yaml tasks have `speckit_task_ref: ["T001", "T002"]`
   - After task completion: update both manifest AND tasks.md
   - This was in original design, needs to be restored

### Required Changes (Phase 1 Technical Debt)

| Change | File(s) | Priority |
|--------|---------|----------|
| Rename `--spec` to `--speckit` | `src/commands/init.ts` | HIGH |
| Change `spec_path` to `speckit.root` in config | `src/core/types.ts`, `src/commands/init.ts` | HIGH |
| Update orchestra.yaml template | `src/commands/init.ts` | HIGH |
| Update manifest.yaml template to match SpecKit format | `src/commands/init.ts` | HIGH |
| Update Orchestra Bible with SpecKit-first decision | `spec/00-orchestra-bible.md` | HIGH |
| Add `speckit_task_ref` to task schema | `src/core/types.ts` | MEDIUM |
| Update tasks.md on task completion | `src/core/complete.ts` | MEDIUM |
| Validate SpecKit structure exists | `src/commands/init.ts` | LOW (future) |

### manifest.yaml Template Changes

Current CLI generates a flat task list. Should match SpecKit-aligned format:

```yaml
# Target manifest.yaml format (aligned with case-study/.orchestra-original)
sprint: "phase-2-mcp"
spec: "spec/implementation/phase-2-mcp/readme.md"
speckit_tasks: "spec/implementation/phase-2-mcp/tasks.md"
created: "2025-12-04"
status: "not-started"

phases:
  - id: "setup"
    name: "Setup"
    description: "Project initialization"
    tasks:
      - id: 1
        title: "Project Setup"
        status: "not-started"
        speckit_tasks: ["T012"]           # Maps to SpecKit task IDs
        consolidation_rationale: "..."    # Why tasks were grouped
        category: "infrastructure"
        
current_task: null
current_phase: null

speckit_coverage:
  total_tasks: 8
  mapped_tasks: 8
  completed_tasks: 0
  coverage_percent: 100
```

Key additions:
- `speckit_tasks` path in header
- `phases` grouping (optional but useful)
- `speckit_tasks: ["T001"]` on each task for traceability
- `consolidation_rationale` for grouped tasks
- `speckit_coverage` summary section

---

## Issues Found

### Issue 1: Missing AGENT_README.md
**Severity**: HIGH  
**Status**: OPEN  
**Found In**: `orchestra init`

**Problem**: The `init` command doesn't create `handover/AGENT_README.md`. This is a critical file that guides the implementor agent.

**Expected**: Case study has `handover/AGENT_README.md` with:
- Role explanation
- Workflow steps (validate → implement → pre-signal → signal)
- References to orchestra commands (not scripts)
- Quality standards

**Fix**: Update `init` command to create AGENT_README.md with orchestra CLI commands instead of script references.

---

### Issue 2: completion-signal.md Created Too Early
**Severity**: HIGH  
**Status**: OPEN  
**Found In**: `orchestra prepare`

**Problem**: The `prepare` command creates `handover/completion-signal.md`. This file should NOT exist until the implementor signals completion.

**Expected**: 
- `completion-signal.md` should be a TEMPLATE in `common/templates/`
- Only created when implementor runs `orchestra signal` (or equivalent)

**Fix**: Remove completion-signal.md generation from `prepare` command. Keep as template only.

---

### Issue 3: SpecKit Integration (SUPERSEDED by Decision Above)
**Severity**: HIGH  
**Status**: REDESIGN REQUIRED  
**Found In**: `orchestra init --spec`

**Original Problem**: orchestra.yaml has `spec_path` but no reference to tasks.md

**New Design** (per SpecKit-First Decision):
```yaml
# orchestra.yaml
speckit:
  root: "spec/implementation/phase-2-mcp"
```

**Changes Required**:
1. Rename CLI flag: `--spec` → `--speckit`
2. Rename config: `spec_path` → `speckit.root`
3. Add `speckit_task_ref` to manifest task schema
4. Update tasks.md on task completion (restore original behavior)

---

### Issue 4: Template Architecture (HBS/YAML/MD) - DEFER
**Severity**: MEDIUM  
**Status**: DEFERRED  
**Found In**: `--format yaml` feature

**Problem**: We implemented `--format yaml` but the full workflow isn't clear.

**Decision**: Defer this complexity. For now:
- Remove `--format` flag (premature)
- Generate only `current-task.md` 
- Orchestrator agent enriches handover manually (as in case study)
- Revisit template architecture after core flow is solid

**Rationale**: We're going down a rabbit hole. Get basic flow working first.

---

### Issue 5: manifest.yaml Location (Information Hiding)
**Severity**: LOW (for now)  
**Status**: DEFERRED  
**Found In**: Directory structure comparison

**Problem**: Case study has manifest.yaml in `.orchestrator-only/` (hidden from implementor). CLI puts it at `.orchestra/` root.

**Case Study Pattern**:
```
.orchestra/
├── orchestrator/
│   └── .orchestrator-only/
│       ├── manifest.yaml      # HIDDEN
│       └── progress.yaml      # HIDDEN
```

**CLI Pattern**:
```
.orchestra/
├── manifest.yaml              # VISIBLE
├── progress.yaml              # VISIBLE
```

**Decision**: Defer this. For CLI tool, simplicity may trump information hiding. The script-based approach needed hiding because agents could wander. With explicit commands, less critical.

---

### Issue 6: current-task.md Content Too Sparse
**Severity**: MEDIUM  
**Status**: OPEN  
**Found In**: `orchestra prepare` output

**Problem**: Generated current-task.md is minimal compared to case study examples.

**Current Output**:
```markdown
# Task 1: Project Setup

## Overview
Add MCP SDK dependency, create src/mcp/ folder structure with stubs

## Spec Files
📄 **Task spec**: `spec/implementation/phase-2-mcp/tasks/2.1-project-setup.md`

## ⚠️ BEFORE YOU START - MANDATORY VALIDATION
...
```

**Case Study Example** includes:
- Task Overview table (ID, Title, Category, Status, Dependencies)
- Objective section
- Acceptance Criteria (numbered list)
- File Operations table
- Command Interface (if applicable)
- TDD Requirements with test structure
- Core Interfaces (TypeScript)
- Implementation Flow
- Code Scaffolds
- Verification Criteria
- Handover Checklist

**Fix Options**:
1. Read spec file content and include in handover
2. Use YAML template → orchestrator fills → render to MD
3. Hybrid: CLI reads spec, orchestrator enriches

---

## Test Commands Run

```powershell
# Init with spec
cd tools/orchestra
orchestra init --spec "spec/implementation/phase-2-mcp" --force

# Manually populated manifest.yaml with 8 tasks

# Check status
orchestra status
# Result: Shows 8 pending tasks ✓

# Prepare task 1 with both formats
orchestra prepare --task 1 --format both
# Result: Creates task-1.yaml, current-task.md, completion-signal.md (wrong!)
```

---

## Next Steps

### Phase 1 Technical Debt (Before Phase 2)
1. [ ] **Issue 3**: Rename `--spec` to `--speckit`, update config structure
2. [ ] **Issue 3**: Update manifest.yaml template to SpecKit-aligned format
3. [ ] **Issue 2**: Remove completion-signal.md from prepare command  
4. [ ] **Issue 1**: Add AGENT_README.md to init command
5. [ ] **Issue 4**: Remove `--format` flag (defer template architecture)
6. [ ] Add `speckit_task_ref` field to manifest task schema
7. [ ] Update tasks.md on task completion
8. [ ] Update Orchestra Bible (spec/00-orchestra-bible.md) with SpecKit-first decision

### Phase 2 Testing (After Tech Debt Fixed)
1. [ ] Create proper SpecKit spec for Phase 2 MCP
2. [ ] Test `orchestra init --speckit <path>`
3. [ ] Test full workflow with SpecKit integration

---

## Discussion: Template Architecture (HBS/YAML/MD)

**Status**: Needs discussion before implementation

### Current State
We implemented:
- `handover.hbs` - Handlebars master template
- `--format yaml` - Generates `task-N.yaml` with TODO placeholders
- `--format markdown` - Generates `current-task.md`
- `--format both` - Generates both files
- `template-converter.ts` - Parses HBS, generates YAML templates

### The Original Vision
Single source of truth (HBS) that can generate multiple output formats on-the-fly.

### Open Questions

1. **Who fills in the YAML?**
   - Orchestrator agent reads spec files and fills YAML?
   - CLI reads spec files and pre-fills some fields?
   - Human fills it manually?

2. **What's the flow?**
   ```
   Option A: HBS → YAML (with TODOs) → Orchestrator fills → render → MD
   Option B: HBS → MD directly (orchestrator edits MD)
   Option C: CLI reads spec files → pre-populates → generates rich MD
   ```

3. **Is YAML needed at all?**
   - Pro: Structured, easier to validate, agent-friendly
   - Con: Extra step, complexity, may not add value

4. **What about the case study approach?**
   - Case study: Orchestrator agent creates rich current-task.md manually
   - No YAML intermediate, no templates
   - Just a well-structured markdown handover

### Recommendation (for discussion)

**Defer the template architecture.** For v1.0:
- Remove `--format` flag
- Generate minimal current-task.md stub
- Let orchestrator agent enrich it (as in case study)
- Revisit templates when we have MCP server (agent can call render tool)

**Rationale**: The template architecture adds complexity without clear benefit until we have:
1. A clear consumer (MCP tool that can render)
2. A clear workflow (who fills what, when)
3. Proven value over manual enrichment

---

## 📋 Phase 1.2 Plan: Template Registry Implementation

**Created**: 2025-12-04  
**Document**: `docs/TEMPLATE_REGISTRY.md`

The template registry now defines:
- Every generated file → source template mapping
- Format decisions (YAML vs MD) based on use case
- Immutable vs mutable files
- Single active file convention (current-task.md not task-N.md)
- Anti-patterns to avoid

### High-Priority Fixes (Phase 1.2)

1. **Create `agent-readme.hbs`** - Missing entirely  
   - Agent onboarding document (immutable)
   - Lists file locations, workflow, what not to touch
   - Generated by `orchestra init`

2. **Fix `completion-signal.hbs` generation** - Currently generated by prepare (WRONG)  
   - Should be reference template only
   - Agent copies manually when task complete
   - Keeps as YAML (agent fills out structured fields)

3. **Update `manifest.hbs`** - Needs SpecKit format  
   - Add phases array with speckit_task_ref
   - Enable task traceability to SpecKit
   - Support consolidation tracking

4. **Remove `--format` flag** - Defer complexity  
   - Keep HBS as template source
   - Generate YAML or MD per registry use case
   - No multi-format support in v1.0

5. **Update Orchestra Bible** - Reference registry  
   - Add pointer to TEMPLATE_REGISTRY.md
   - Document template system principles
   - Cross-reference to case study

### Implementation Path

After Phase 1.2 fixes:
1. Implement remaining 8 technical debt items
2. Create proper SpecKit spec for Phase 2 MCP
3. Re-test full workflow with corrected architecture
4. Verify against case-study reference

---

*Log created: 2025-12-04*
*Updated: 2025-12-04 - SpecKit-First Decision, Template Registry*
