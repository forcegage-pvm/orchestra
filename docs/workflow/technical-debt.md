# Technical Debt

> Tracking document for workflow-related technical debt items.  
> These items represent features or improvements identified during documentation that require implementation.

---

## Index

- [ ] [TD-001: Git Actions CLI Automation](#td-001-git-actions-cli-automation)
- [ ] [TD-002: orchestra next Command](#td-002-orchestra-next-command)
- [ ] [TD-003: Template-Based Config Generation](#td-003-template-based-config-generation)
- [ ] [TD-004: Review and Update Sprint Initialization Process Guide](#td-004-review-and-update-sprint-initialization-process-guide)
- [x] [TD-005: Workflow Document Actions Section](#td-005-workflow-document-actions-section)
- [ ] [TD-006: Clarify SpecKit tasks.md Location and Purpose](#td-006-clarify-speckit-tasksmd-location-and-purpose)
- [ ] [TD-007: Pre-Flight Checklist Workflow](#td-007-pre-flight-checklist-workflow)
- [ ] [TD-008: Handover Validation Command](#td-008-handover-validation-command)

---

## TD-001: Git Actions CLI Automation

**Status**: 🔴 Not Started  
**Priority**: Medium  
**Identified**: 2025-12-05  
**Source**: [init.md - Git Actions](init.md#git-actions)

### Description

The workflow documentation recommends git actions (commit, stage) after various CLI commands, but the CLI does not currently automate these actions.

### Current State

- Git actions are documented as manual steps
- Users must remember to commit after `orchestra init`, `orchestra prepare`, etc.
- No CLI flags for automatic git staging/committing

### Proposed Solution

Add optional git automation to CLI commands:

```bash
# Option 1: Per-command flags
orchestra init --git-commit
orchestra prepare --task 1 --git-stage

# Option 2: Global configuration in orchestra.yaml
git:
  auto_stage: true
  auto_commit: false
  commit_prefix: "chore(orchestra):"
```

### Acceptance Criteria

- [ ] CLI can optionally stage files after creation
- [ ] CLI can optionally commit with conventional commit message
- [ ] Behavior is configurable in `orchestra.yaml`
- [ ] Git operations fail gracefully if not in a git repo

### Related Files

- `src/core/git.ts` - Existing git utilities
- `src/commands/init.ts` - Init command
- `src/commands/prepare.ts` - Prepare command

---

## TD-002: orchestra next Command

**Status**: 🔴 Not Started  
**Priority**: High  
**Identified**: 2025-12-05  
**Source**: [init.md - Next Step](init.md#next-step)

### Description

Users and agents need guidance on what to do next at any point in the workflow. A dedicated `orchestra next` command would provide context-aware guidance.

### Current State

- Each CLI command outputs a "Next steps" message on success
- No unified way to query what to do next
- Error states don't provide recovery guidance
- No mechanism for tracking "current position" in workflow

### Proposed Solution

Create `orchestra next` command that:

1. **Analyzes current state** via:
   - `.orchestra/` existence (initialized?)
   - `manifest.yaml` validity (configured?)
   - `progress.yaml` state (active task?)
   - Presence of errors/blockers

2. **Emits context-aware guidance**:
   ```bash
   $ orchestra next
   
   Current State: Sprint initialized, no tasks prepared
   
   Recommended Action: Prepare your first task
     Command: orchestra prepare --task 1
     Reason: Task 1 has no dependencies and is ready to start
   
   Alternative Actions:
     - orchestra status    # View full sprint status
     - Edit manifest.yaml  # Add or modify tasks
   ```

3. **Shows errors with resolution**:
   ```bash
   $ orchestra next
   
   ⚠ Error Detected: Invalid manifest.yaml
   
   Error: Task 3 depends on non-existent task 99
   Location: .orchestra/manifest.yaml, line 45
   
   Resolution:
     1. Edit manifest.yaml
     2. Fix task 3 dependencies to reference valid task IDs
     3. Run 'orchestra status' to verify
   ```

### Acceptance Criteria

- [ ] Command exists: `orchestra next`
- [ ] Detects current workflow position
- [ ] Provides actionable next step with command
- [ ] Shows errors with file location and resolution steps
- [ ] JSON output support for agent consumption
- [ ] Handles all workflow phases (INIT → COMPLETE)

### State Tracking Requirements

Need to track:
- Current phase (INIT, PREPARE, IMPLEMENT, VERIFY, COMPLETE)
- Active task (if any)
- Pending errors/blockers
- Last completed action

Possible implementation:
- Add `state` section to `progress.yaml`
- Or create new `.orchestra/state.yaml`

### Related Files

- New: `src/commands/next.ts`
- New: `src/core/next.ts`
- `src/core/progress.ts` - May need state tracking additions

---

## TD-003: Template-Based Config Generation

**Status**: 🔴 Not Started  
**Priority**: Medium  
**Identified**: 2025-12-05  
**Source**: [init.md - Generated Files](init.md#generated-files-detail)

### Description

The `manifest.yaml`, `orchestra.yaml`, and `progress.yaml` files are currently generated from inline code strings in `src/commands/init.ts`. This violates the template architecture principle that **nothing should be inline in source**.

### Current State

- `manifest.yaml` is generated by `generateManifestTemplate()` function with inline string
- `orchestra.yaml` is generated from `DEFAULT_CONFIG` object serialized to YAML
- `progress.yaml` is generated by `generateProgressTemplate()` function with inline string
- No Handlebars templates exist for these files
- Dynamic values (dates, spec paths) are interpolated in code

### Proposed Solution

Create Handlebars templates for configuration files:

```
templates/
  common/
    templates/
      manifest.yaml.hbs      # NEW: Sprint manifest template
      orchestra.yaml.hbs     # NEW: Configuration template
      progress.yaml.hbs      # NEW: Progress tracking template
```

Template example (`manifest.yaml.hbs`):
```handlebars
# Orchestra Sprint Manifest - Generated {{today}}
{{#if specPath}}
# SpecKit Root: {{specPath}}
{{/if}}

version: "{{version}}"

sprint:
  id: "{{sprint.id}}"
  name: "{{sprint.name}}"
  status: ACTIVE
  created_at: "{{today}}"

phases: []
```

CLI renders template with context:
```typescript
const context = {
  today: new Date().toISOString().split('T')[0],
  version: '1.0.0',
  specPath: options.spec,
  sprint: { id: 'sprint-001', name: 'New Sprint' }
};
const content = renderTemplate('manifest.yaml.hbs', context);
```

### Impact on Workflow Documentation

Once implemented, `init.md` Template Details section will change from "N/A" to:

| Template | Converts To | When Used |
|----------|-------------|----------|
| `manifest.yaml.hbs` | `.orchestra/manifest.yaml` | Sprint manifest generation |
| `orchestra.yaml.hbs` | `.orchestra/orchestra.yaml` | Configuration generation |
| `progress.yaml.hbs` | `.orchestra/progress.yaml` | Progress tracking initialization |

### Acceptance Criteria

- [ ] `manifest.yaml.hbs` template created in `templates/common/templates/`
- [ ] `orchestra.yaml.hbs` template created in `templates/common/templates/`
- [ ] `progress.yaml.hbs` template created in `templates/common/templates/`
- [ ] `generateManifestTemplate()` replaced with template rendering
- [ ] `generateProgressTemplate()` replaced with template rendering
- [ ] `saveConfig()` updated to use template rendering
- [ ] Templates support all current dynamic values (date, spec path, etc.)
- [ ] Templates are copied to `.orchestra/common/templates/` during init
- [ ] Update `init.md` Template Details section after implementation

### Related Files

- `src/commands/init.ts` - Contains inline generation functions
- `src/core/config.ts` - Config save logic
- `src/core/templates.ts` - Template rendering utilities
- New: `templates/common/templates/manifest.yaml.hbs`
- New: `templates/common/templates/orchestra.yaml.hbs`
- New: `templates/common/templates/progress.yaml.hbs`

---

## TD-004: Review and Update Sprint Initialization Process Guide

**Status**: 🔴 Not Started  
**Priority**: High  
**Identified**: 2025-12-05  
**Source**: [configure-manifest.md](configure-manifest.md)

### Description

The orchestrator process guide `00-sprint-initialization.md` needs review and potential updates to align with current CLI implementation and workflow documentation.

### Current State

- Process guide exists at `templates/orchestrator/processes/00-sprint-initialization.md`
- Referenced heavily by `configure-manifest.md` as the primary orchestrator agent guide
- May have inconsistencies with current CLI commands and file structures
- Uses some legacy patterns that may need updating

### Proposed Solution

1. Review `00-sprint-initialization.md` for accuracy
2. Update to match current CLI commands and options
3. Align file paths and structures with actual implementation
4. Update examples to use current manifest/progress formats
5. After review complete, update `configure-manifest.md` if needed

### Acceptance Criteria

- [ ] Review all 7 steps in process guide for accuracy
- [ ] Verify file paths match actual `.orchestra/` structure
- [ ] Update verification YAML examples to match current schema
- [ ] Ensure CLI commands are current
- [ ] Update SpecKit mapping examples if needed
- [ ] Update `configure-manifest.md` after review if changes affect it

### Related Files

- `templates/orchestrator/processes/00-sprint-initialization.md` - Primary file to review
- `templates/orchestrator/processes/01-handover-creation.md` - May also need review
- `templates/orchestrator/processes/02-task-verification.md` - May also need review
- `docs/workflow/configure-manifest.md` - References this process guide

---

## TD-005: Workflow Document Actions Section

**Status**: 🟢 Complete  
**Priority**: Medium  
**Identified**: 2025-12-05  
**Completed**: 2025-12-05  
**Source**: [closeout.md](closeout.md)

### Description

The workflow step documents (init.md, configure-manifest.md, closeout.md, etc.) have actions distributed throughout multiple sections, making it difficult to quickly identify what actions are required and in what order.

### Current State

- Actions appear in multiple sections: CLI Command, Git Actions, Outcome, Troubleshooting
- No consolidated "Actions" section
- Manual vs automated vs agent actions are not clearly distinguished
- Hard to create a quick checklist from the document
- No clear execution sequence

### Solution Implemented

Added three new structural elements to each workflow document:

1. **Actions Section** (after Philosophy)
   - Consolidated quick reference for all actions
   - Action IDs use format `A-{STEP}-XX` (e.g., `A-INIT-01`, `A-CFG-01`, `A-CLO-01`)
   - Grouped by type: CLI, Agent, Manual, Git

2. **Execution Sequence Section** (after Actions)
   - Complete ordered flow of ALL action types
   - Shows action ID, type, and description for each step
   - Single view of the execution order

3. **Agent Process Section** (replaces "Orchestrator Process")
   - Detailed steps for agent actions
   - Each step heading uses the Action ID (e.g., `### A-CFG-02: Analyze Source Requirements`)
   - Links detail back to Actions quick reference

### Final Format

Index order: Overview → Purpose → Philosophy → Actions → Execution Sequence → Agent Process → ...

```markdown
## Actions

> Quick reference for all actions in this workflow step.  
> Use Action IDs to reference specific actions in other sections.

### CLI Actions

| ID | Action | Command |
|----|--------|--------|
| A-CLO-01 | Run closeout | `orchestra closeout` |

### Agent Actions

| ID | Role | Action |
|----|------|--------|
| A-CLO-06 | Orchestrator | Run closeout before prepare |

### Manual Actions

| ID | Role | Action | Notes |
|----|------|--------|-------|
| A-CLO-09 | Human | Update progress.yaml status | When C2 fails |

### Git Actions

| ID | Action | Level | Command |
|----|--------|-------|--------|
| A-CLO-14 | Commit changes | Enforced | `git commit` |

---

## Execution Sequence

| Order | Action ID | Type | Action |
|-------|-----------|------|--------|
| 1 | A-CLO-06 | Agent | Initiate closeout before prepare |
| 2 | A-CLO-01 | CLI | `orchestra closeout` |
| ... | ... | ... | ... |

---

## Agent Process

### A-CLO-06: Initiate Closeout

- Run `orchestra closeout` before any `orchestra prepare`
- ...
```

### Acceptance Criteria

- [x] Define standardized Actions section format with Action IDs (`A-{STEP}-XX`)
- [x] Add Actions section to init.md (after Philosophy)
- [x] Add Actions section to configure-manifest.md (after Philosophy)
- [x] Add Actions section to closeout.md (after Philosophy)
- [x] Add Execution Sequence section to all three documents
- [x] Rename "Orchestrator Process" to "Agent Process" with action ID headings
- [x] Update workflow.md Document Format section
- [x] Update Index in all documents to reflect new structure

### Related Files

- `docs/workflow/*.md` - All workflow step documents
- `docs/workflow/workflow.md` - Document format definition

---

## TD-006: Clarify SpecKit tasks.md Location and Purpose

**Status**: 🔴 Not Started  
**Priority**: High  
**Identified**: 2025-12-05  
**Source**: [closeout.md - C4 Check](closeout.md#c4-speckit-tasks-checked)

### Description

There is confusion about the SpecKit `tasks.md` file location and whether Orchestra maintains a copy.

### Current State

- Closeout check C4 looks for `.orchestra/orchestrator/.orchestrator-only/tasks.md`
- Process guides reference `specs/<sprint>/tasks.md` (external SpecKit location)
- It's unclear if Orchestra should:
  - Read from the external SpecKit `tasks.md` directly, OR
  - Maintain a copy in `.orchestrator-only/`, OR
  - This file doesn't exist and C4 is looking in the wrong place

### Questions to Resolve

1. Where does SpecKit `tasks.md` live? (External spec folder or copied to Orchestra?)
2. Who updates the checkboxes? (Agent updates external spec directly?)
3. Should C4 look at external spec path from `orchestra.yaml` → `spec_path`?
4. Is `.orchestra/orchestrator/.orchestrator-only/tasks.md` a real file or dead code?

### Proposed Solution

After investigation:

1. If SpecKit tasks.md is external:
   - Update C4 to read from `spec_path` configuration
   - Remove reference to `.orchestrator-only/tasks.md`
   - Document that agent updates external spec directly

2. If Orchestra should maintain a copy:
   - Document when/how the copy is created
   - Document sync process between external and copy

### Acceptance Criteria

- [ ] Clarify canonical location of SpecKit tasks.md
- [ ] Update C4 check to look in correct location
- [ ] Update closeout.md File Impact section
- [ ] Document who updates checkboxes and when
- [ ] Remove dead code/references if applicable

### Related Files

- `src/core/closeout.ts` - C4 check implementation
- `docs/workflow/closeout.md` - C4 documentation
- `templates/orchestrator/processes/02-task-verification.md` - References tasks.md update

---

## TD-007: Pre-Flight Checklist Workflow

**Status**: 🟡 Documented (CLI Not Implemented)  
**Priority**: High  
**Identified**: 2025-12-05  
**Source**: [prepare.md](prepare.md), [01-handover-creation.md](../../.orchestra/orchestrator/processes/01-handover-creation.md)

### Description

The pre-flight checklist workflow needs to be implemented properly. The documentation (`prepare.md`) is now updated as if the CLI feature exists - implementation needs to match.

### Current State

| Component | Current State |
|-----------|---------------|
| `docs/workflow/prepare.md` | ✅ Updated with A-PREP-06 (`orchestra prepare --finalize`) |
| `orchestrator-preflight.md.hbs` | Exists, copied during init, never rendered |
| CLI `--finalize` flag | ❌ Does not exist |
| Process guide `01-handover-creation.md` | ❌ Out of sync with prepare.md |

### Solution (Documented in prepare.md)

**Single Command**: `orchestra prepare --finalize`

This command performs two operations:

1. **Copy handover to audit trail**:
   ```
   .orchestra/handover/current-task.md → .orchestra/orchestrator/.orchestrator-only/preflight/task-N.md
   ```

2. **Archive pre-flight checklist**:
   ```
   .orchestra/handover/preflight-checklist.yaml → .orchestra/orchestrator/.orchestrator-only/preflight/preflight-task-N.yaml
   ```

### Implementation Tasks

1. **CLI implementation** (`src/commands/prepare.ts`):
   - [ ] Add `--finalize` option to prepare command
   - [ ] Get current task ID from manifest
   - [ ] Copy `current-task.md` → `preflight/task-{id}.md`
   - [ ] Move `preflight-checklist.yaml` → `preflight/preflight-task-{id}.yaml`
   - [ ] Validate files exist before copying/moving

2. **Template rendering** (`src/core/prepare.ts`):
   - [ ] Render `orchestrator-preflight.md.hbs` during prepare
   - [ ] Convert output to YAML format
   - [ ] Save to `.orchestra/handover/preflight-checklist.yaml`

3. **Documentation sync**:
   - [ ] Update `01-handover-creation.md` to match `prepare.md`
   - [ ] Update `handover-lifecycle.md` references (already done)

### Acceptance Criteria

- [ ] `orchestra prepare --finalize` command exists
- [ ] Command copies handover to `preflight/task-N.md`
- [ ] Command moves checklist to `preflight/preflight-task-N.yaml`
- [ ] Command validates source files exist
- [ ] Command outputs success/error messages
- [ ] `01-handover-creation.md` aligned with `prepare.md`

### Related Files

| File | Status | Action |
|------|--------|--------|
| `docs/workflow/prepare.md` | ✅ Done | Source of truth |
| `src/commands/prepare.ts` | ❌ Todo | Add --finalize flag |
| `src/core/prepare.ts` | ❌ Todo | Add finalize logic |
| `.orchestra/orchestrator/processes/01-handover-creation.md` | ❌ Todo | Sync with prepare.md |
| `spec/04-processes/handover-lifecycle.md` | ✅ Done | Already updated |

---

## TD-008: Handover Validation Command

**Status**: 🔴 Not Started  
**Priority**: Critical  
**Identified**: 2025-12-05  
**Source**: [prepare.md](prepare.md), [Original Scripts](../../docs/case-study/.orchestra-original/implementor/.implementor-only/scripts/)

### Description

The handover validation step was lost during CLI evolution. Originally there were PowerShell scripts that validated handover completeness:
- `validate-handover.ps1` - Implementor ran BEFORE starting work
- `pre-signal-check.ps1` - Implementor ran BEFORE signaling completion

This validation must be formalized as a CLI command that can be run by:
1. **Orchestrator** - Before handoff (quality gate)
2. **Implementor** - Before starting work (validation)

### Current State

| Aspect | Current State |
|--------|---------------|
| Handover review | Optional human review (A-PREP-10) |
| Validation enforcement | None - completely optional |
| Original scripts | Exist in case-study folder, not integrated |
| CLI command | Does not exist |

### Original Validation Checks (from validate-handover.ps1)

**Task Structure:**
- Has task title (Task N: ...)
- Has objective/overview section
- Has deliverables section
- Has TDD/testing section

**File Paths:**
- CREATE file paths specified and don't already exist
- UPDATE file paths specified and DO exist

**Completeness:**
- No TODO/TBD/PLACEHOLDER markers
- Has code scaffold (for CREATE files)
- Has test sample data

**Integration Tasks:**
- Has MUST USE section
- Has demo file requirement

### Proposed Solution

**New CLI Command:** `orchestra validate-handover`

```bash
# Orchestrator runs before handoff
orchestra validate-handover --task N

# Or as flag on prepare
orchestra prepare --task N --validate

# Implementor runs before starting
orchestra validate-handover
```

**Validation Checks:**

| Check | Category | Severity |
|-------|----------|----------|
| Has task title | Structure | BLOCKING |
| Has objective | Structure | BLOCKING |
| Has deliverables | Structure | BLOCKING |
| Has TDD section | Structure | BLOCKING |
| No TODO markers | Completeness | BLOCKING |
| CREATE paths valid | Paths | BLOCKING |
| UPDATE paths exist | Paths | BLOCKING |
| Has code scaffold | Completeness | WARNING |
| Has test data | Completeness | WARNING |
| MUST USE section (integration) | Integration | WARNING |

**Exit Codes:**
- 0: All checks pass
- 1: Blocking checks failed
- 2: Warnings only (can proceed with caution)

### Workflow Integration

**In prepare.md:**
- Add A-PREP-XX: Validate handover (CLI, MANDATORY)
- Change A-PREP-10 from optional to reference the CLI validation
- Add to Execution Sequence before handoff

**In implement.md (future):**
- Implementor runs `orchestra validate-handover` before starting
- Blocks work if validation fails

### Implementation Tasks

1. **Create CLI command:**
   - `src/commands/validate-handover.ts`
   - `src/core/validate-handover.ts`

2. **Port validation logic from scripts:**
   - Parse `current-task.md` or `task-N.yaml`
   - Check structure, paths, completeness
   - Report findings with severity

3. **Integration with prepare:**
   - Add `--validate` flag to `orchestra prepare`
   - Or run validation automatically after prepare

4. **Documentation:**
   - Update `prepare.md` with new action
   - Create `implement.md` with validation step
   - Update process guides

### Acceptance Criteria

- [ ] `orchestra validate-handover` command exists
- [ ] Validates task structure (title, objective, deliverables, TDD)
- [ ] Validates file paths (CREATE don't exist, UPDATE do exist)
- [ ] Validates completeness (no TODOs, has scaffolds)
- [ ] Returns appropriate exit codes
- [ ] JSON output for scripting
- [ ] Integrated into prepare.md workflow
- [ ] Documented in implement.md for implementor

### Related Files

- `docs/case-study/.orchestra-original/implementor/.implementor-only/scripts/validate-handover.ps1` - Original script
- `docs/case-study/.orchestra-original/implementor/.implementor-only/scripts/pre-signal-check.ps1` - Pre-signal script
- New: `src/commands/validate-handover.ts`
- New: `src/core/validate-handover.ts`
- `docs/workflow/prepare.md` - Add validation action
- `docs/workflow/implement.md` - Document implementor validation

---

## Template

Use this template when adding new technical debt items:

```markdown
## TD-XXX: Title

**Status**: 🔴 Not Started | 🟡 In Progress | 🟢 Complete  
**Priority**: Low | Medium | High | Critical  
**Identified**: YYYY-MM-DD  
**Source**: [document.md - Section](document.md#section)

### Description

What is the issue or missing feature?

### Current State

How does it work now?

### Proposed Solution

How should it work?

### Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

### Related Files

- `path/to/file.ts` - Description
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------||
| 1.0.0 | 2025-12-05 | Initial creation with TD-001, TD-002 |
| 1.1.0 | 2025-12-05 | Added TD-003: Template-Based Config Generation |
| 1.2.0 | 2025-12-05 | Updated TD-003 to include progress.yaml; Added TD-004: Process Guide Review |
| 1.3.0 | 2025-12-05 | Added TD-005: Workflow Document Actions Section; Added TD-006: SpecKit tasks.md Clarification |
| 1.4.0 | 2025-12-05 | Completed TD-005: Added Actions sections to init.md, configure-manifest.md, closeout.md |
| 1.5.0 | 2025-12-05 | TD-005 complete: Added Execution Sequence, Agent Process sections; Action IDs now use `A-{STEP}-XX` format |
| 1.6.0 | 2025-12-05 | Added TD-007: Pre-Flight Checklist Workflow |
| 1.7.0 | 2025-12-05 | Added TD-008: Handover Validation Command (critical - lost during evolution) |
| 1.8.0 | 2025-12-05 | TD-007 updated: Solution is `orchestra prepare --finalize`; prepare.md is source of truth |
