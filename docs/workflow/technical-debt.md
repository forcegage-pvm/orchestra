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
- [x] [TD-007: Pre-Flight Checklist Workflow](#td-007-pre-flight-checklist-workflow)
- [ ] [TD-008: Handover Validation Command](#td-008-handover-validation-command)
- [ ] [TD-009: Sync 01-handover-creation.md with prepare.md](#td-009-sync-01-handover-creationmd-with-preparemd)
- [ ] [TD-010: Pre-Signal Check Command](#td-010-pre-signal-check-command)

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

**Status**: ✅ Complete  
**Priority**: High  
**Identified**: 2025-12-05  
**Completed**: 2025-12-05  
**Source**: [prepare.md](prepare.md), [01-handover-creation.md](../../.orchestra/orchestrator/processes/01-handover-creation.md)

### Description

The pre-flight checklist workflow is now implemented. The `orchestra prepare --finalize` command archives the handover and checklist.

### Implementation

**Command**: `orchestra prepare --finalize`

This command performs two operations:

1. **Copy handover to audit trail**:
   ```
   .orchestra/handover/current-task.md → .orchestra/orchestrator/.orchestrator-only/preflight/task-N.md
   ```

2. **Archive pre-flight checklist**:
   ```
   .orchestra/handover/preflight-checklist.yaml → .orchestra/orchestrator/.orchestrator-only/preflight/preflight-task-N.yaml
   ```

### Files Changed

| File | Change |
|------|--------|
| `src/commands/prepare.ts` | Added `--finalize` option |
| `src/core/prepare.ts` | Added `runFinalize()` function, `FinalizeOptions`, `FinalizeResult` types |
| `test/commands/prepare.test.ts` | Added 7 finalize tests |
| `docs/workflow/prepare.md` | Already documented as source of truth |

---

## TD-008: Handover Validation Command

**Status**: 🔴 Not Started  
**Priority**: 🚨 Critical  
**Identified**: 2025-12-05  
**Source**: [prepare.md](prepare.md), [implement.md](implement.md), Original Scripts (see below)

### Description

The handover validation step was **severely degraded** during project evolution. Originally there were comprehensive PowerShell scripts (~220 lines with 15+ validation checks) that validated handover completeness. The latest version reduced this to ~50 lines with only 5 basic checks.

This validation must be formalized as a CLI command that can be run by:
1. **Orchestrator** - Before handoff (quality gate after prepare)
2. **Implementor** - Before starting work (first step of implement phase)

### ⚠️ VALIDATION DEGRADATION ANALYSIS

**Evidence of systematic reduction in validation rigor over time:**

| Check Category | Original Script | Latest Script | Status |
|----------------|-----------------|---------------|--------|
| **Task Structure** | | | |
| Task title format | ✅ Regex validated | ❌ Not checked | **LOST** |
| Objective section | ✅ Checked | ❌ Not checked | **LOST** |
| Deliverables section | ✅ Checked | ❌ Not checked | **LOST** |
| TDD/testing section | ✅ Checked | ❌ Not checked | **LOST** |
| **File Path Validation** | | | |
| CREATE paths extracted | ✅ Table + list format | ❌ Not checked | **LOST** |
| CREATE files don't exist | ✅ Checked | ❌ Not checked | **LOST** |
| UPDATE paths extracted | ✅ Table + list format | ❌ Not checked | **LOST** |
| UPDATE files exist | ✅ Checked | ❌ Not checked | **LOST** |
| **Completeness** | | | |
| No TODO/TBD markers | ✅ Regex search | ❌ Not checked | **LOST** |
| Code scaffold present | ✅ For CREATE files | ❌ Not checked | **LOST** |
| Test sample data | ✅ Checked | ❌ Not checked | **LOST** |
| **Integration Tasks** | | | |
| MUST USE section | ✅ For integration tasks | ❌ Not checked | **LOST** |
| Demo file requirement | ✅ For visual tasks | ❌ Not checked | **LOST** |
| Task category detection | ✅ INFRASTRUCTURE/INTEGRATION/VISUAL | ❌ Not checked | **LOST** |
| **Basic Checks** | | | |
| current-task.md exists | ✅ | ✅ | Retained |
| task-context.md exists | N/A | ✅ | Added |
| Task ID parseable | ✅ | ✅ | Retained |
| Acceptance criteria section | N/A | ✅ | Added |
| Spec file reference | N/A | ✅ (optional) | Added |

**Summary**: 13 validation checks were LOST, 5 basic checks retained/added.

### Original Script Sources (MUST RESTORE)

| File | Location | Lines | Purpose |
|------|----------|-------|---------|
| `validate-handover.ps1` (Original) | `docs/case-study/.orchestra-original/implementor/.implementor-only/scripts/` | ~220 | **Full validation** |
| `task-validator.md` (Original) | `docs/case-study/.orchestra-original/implementor/.implementor-only/` | ~120 | Validation rules reference |
| `validate-handover.ps1` (Latest) | `docs/case-study/.orchestra.latest/implementor/.implementor-only/scripts/` | ~50 | **Degraded version** |
| `task-validator.md` (Latest) | `docs/case-study/.orchestra.latest/implementor/.implementor-only/` | ~40 | Minimal reference |
| `check-utils.ps1` | `docs/case-study/.orchestra-original/common/scripts/` | N/A | Shared utilities |

### Current State

| Aspect | Current State |
|--------|---------------|
| Handover review | Optional human review (A-PREP-10) |
| Validation enforcement | None - completely optional |
| Original scripts | Exist in case-study folder, not integrated |
| CLI command | **Does not exist** |
| Validation rigor | Severely degraded from original |

### Original Validation Checks to Restore

From `validate-handover.ps1` (Original ~220 lines):

**1. Task Structure Checks:**
```powershell
# Has task title
$hasTitle = $content -match "^#\s*Task\s+\d+:|^##\s*Task\s+\d+:"

# Has objective/overview
$hasObjective = $content -match "(?i)(objective|overview|goal|purpose)\s*[:\n]"

# Has deliverables section
$hasDeliverables = $content -match "(?i)(deliverables|file operations|files to create|files to modify)\s*[:\n]|## File|### File"

# Has TDD section
$hasTDD = $content -match "(?i)(tdd|test.?first|test requirements|testing)\s*[:\n]|## Test|### Test"
```

**2. File Path Validation:**
```powershell
# Extract CREATE file paths (table format)
$tableCreateMatches = [regex]::Matches($content, '(?im)^\|\s*CREATE\s*\|\s*`?([^|`\n]+)`?\s*\|')

# Extract CREATE file paths (list format)
$listCreateMatches = [regex]::Matches($content, '(?im)^-\s*CREATE[:\s]+`?([^\n`]+)`?')

# Check CREATE file doesn't already exist
if (Test-Path $cleanPath) {
    # Error: File already exists - should this be UPDATE instead?
}

# Similar for UPDATE paths - must exist
```

**3. Completeness Checks:**
```powershell
# No TODO/TBD markers
$hasTodos = $content -match '\[TODO\]|\[TBD\]|\[PLACEHOLDER\]|XXX|FIXME'

# Has code scaffold (for non-trivial tasks)
$hasCodeScaffold = $content -match '```dart|```powershell|```' -or $content -match '(?i)##\s*Code\s*Scaffold'

# Has test sample data
$hasTestData = $content -match "(?i)test.*data|sample.*object|mock|stub|fixture"
```

**4. Integration Task Checks:**
```powershell
$isIntegration = $content -match "(?i)INTEGRATION|VISUAL|category:\s*integration"

if ($isIntegration) {
    # Should have MUST USE section
    $hasMustUse = $content -match "(?i)MUST USE|Must Use|must-use"
    
    # Should have demo file specified
    $hasDemo = $content -match "(?i)demo|example.*lib.*demo|visual.*verification"
}
```

### Proposed Solution

**New CLI Command:** `orchestra validate-handover`

```bash
# Implementor runs before starting work (MANDATORY first step)
orchestra validate-handover

# Orchestrator runs before handoff (quality gate)
orchestra validate-handover --task N

# Verbose output showing all checks
orchestra validate-handover --verbose

# JSON output for scripting
orchestra validate-handover --json
```

**Validation Check Matrix (Restore ALL Original Checks):**

| ID | Check | Category | Severity | Original Script Line |
|----|-------|----------|----------|---------------------|
| V1 | Has task title | Structure | BLOCKING | ~47 |
| V2 | Has objective section | Structure | BLOCKING | ~52 |
| V3 | Has deliverables section | Structure | BLOCKING | ~56 |
| V4 | Has TDD/testing section | Structure | BLOCKING | ~60 |
| V5 | CREATE paths specified | Paths | BLOCKING | ~70-85 |
| V6 | CREATE files don't exist | Paths | BLOCKING | ~88-93 |
| V7 | UPDATE paths specified | Paths | WARNING | ~100-115 |
| V8 | UPDATE files exist | Paths | BLOCKING | ~118-123 |
| V9 | No TODO/TBD markers | Completeness | BLOCKING | ~133 |
| V10 | Has code scaffold | Completeness | WARNING | ~140 |
| V11 | Has test sample data | Completeness | WARNING | ~147 |
| V12 | MUST USE section (integration) | Integration | WARNING | ~165 |
| V13 | Demo file requirement (visual) | Integration | WARNING | ~170 |

**Exit Codes:**
- 0: All checks pass
- 1: Blocking checks failed (cannot proceed)
- 2: Warnings only (can proceed with caution)

### Workflow Integration

**In prepare.md (Orchestrator side):**
- Add A-PREP-15: Validate handover before handoff (CLI, Recommended)
- After A-PREP-10 (verify handover complete)
- Before A-PREP-11 (finalize)

**In implement.md (Implementor side):**
- Add A-IMPL-00: Validate handover (CLI, MANDATORY)
- First action before reading handover
- Blocks implementation if validation fails

### Implementation Tasks

1. **Create CLI command:**
   - `src/commands/validate-handover.ts`
   - `src/core/validate-handover.ts`

2. **Port ALL original validation logic:**
   - Reference: `docs/case-study/.orchestra-original/implementor/.implementor-only/scripts/validate-handover.ps1`
   - Port regex patterns for structure detection
   - Port file path extraction (table + list formats)
   - Port file existence checks
   - Port completeness checks
   - Port integration task detection

3. **Shared utilities:**
   - Port relevant utilities from `check-utils.ps1`
   - Create `src/core/validation-utils.ts` if needed

4. **Documentation:**
   - Update `prepare.md` with A-PREP-15
   - Update `implement.md` with A-IMPL-00
   - Reference original scripts for implementation guidance

### Acceptance Criteria

- [ ] `orchestra validate-handover` command exists
- [ ] Restores ALL 13 original validation checks (V1-V13)
- [ ] Validates task structure (title, objective, deliverables, TDD)
- [ ] Extracts and validates file paths (table + list formats)
- [ ] Checks CREATE files don't exist, UPDATE files do exist
- [ ] Validates completeness (no TODOs, has scaffolds, test data)
- [ ] Detects integration/visual tasks and checks MUST USE + demo
- [ ] Returns appropriate exit codes (0, 1, 2)
- [ ] JSON output for scripting (`--json`)
- [ ] Verbose output showing all checks (`--verbose`)
- [ ] Integrated into prepare.md workflow (A-PREP-15)
- [ ] Integrated into implement.md workflow (A-IMPL-00)
- [ ] Tests cover all validation scenarios

### Related Files

**Original Scripts (Reference for Implementation):**
- `docs/case-study/.orchestra-original/implementor/.implementor-only/scripts/validate-handover.ps1` - **PRIMARY SOURCE**
- `docs/case-study/.orchestra-original/implementor/.implementor-only/task-validator.md` - Validation rules
- `docs/case-study/.orchestra-original/common/scripts/check-utils.ps1` - Shared utilities

**Degraded Scripts (Do NOT Use as Reference):**
- `docs/case-study/.orchestra.latest/implementor/.implementor-only/scripts/validate-handover.ps1` - Degraded
- `docs/case-study/.orchestra.latest/implementor/.implementor-only/task-validator.md` - Minimal

**New Files to Create:**
- `src/commands/validate-handover.ts`
- `src/core/validate-handover.ts`
- `test/commands/validate-handover.test.ts`
- `test/core/validate-handover.test.ts`

**Documentation to Update:**
- `docs/workflow/prepare.md` - Add A-PREP-15
- `docs/workflow/implement.md` - Add A-IMPL-00

---

## TD-009: Sync 01-handover-creation.md with prepare.md

**Status**: 🔴 Not Started  
**Priority**: Medium  
**Identified**: 2025-12-05  
**Source**: [TD-007](#td-007-pre-flight-checklist-workflow), [prepare.md](prepare.md)

### Description

The process guide `01-handover-creation.md` is out of sync with the authoritative workflow documentation in `prepare.md`. The process guide still references manual steps that are now CLI commands.

### Current State

| Aspect | `prepare.md` (Source of Truth) | `01-handover-creation.md` (Out of Sync) |
|--------|--------------------------------|----------------------------------------|
| Pre-flight archival | `orchestra prepare --finalize` | Manual `cp` command |
| Action IDs | A-PREP-01 to A-PREP-14 | No action IDs |
| Execution sequence | 9-step sequence | 12 manual steps |
| Template names | `current-task.md.hbs`, etc. | `current-task-template.md` |

### Proposed Solution

Update `01-handover-creation.md` to:

1. Reference `prepare.md` as the authoritative source
2. Use correct template names
3. Replace manual archive steps with `orchestra prepare --finalize`
4. Add action ID references where applicable
5. Remove redundant content that duplicates `prepare.md`

**Option A: Full sync** - Make `01-handover-creation.md` a process guide that references `prepare.md`  
**Option B: Deprecate** - Mark `01-handover-creation.md` as deprecated, point to `prepare.md`

### Files to Update

| File | Action |
|------|--------|
| `.orchestra/orchestrator/processes/01-handover-creation.md` | Sync or deprecate |
| `templates/orchestrator/processes/01-handover-creation.md` | Same (if exists) |

### Acceptance Criteria

- [ ] `01-handover-creation.md` references `orchestra prepare --finalize`
- [ ] Template names match actual templates
- [ ] No conflicting information with `prepare.md`
- [ ] Clear relationship between process guide and workflow doc

### Related Files

- `docs/workflow/prepare.md` - Source of truth
- `.orchestra/orchestrator/processes/01-handover-creation.md` - To update
- `templates/orchestrator/processes/01-handover-creation.md` - Template version

---

## TD-010: Pre-Signal Check Command

**Status**: 🔴 Not Started  
**Priority**: 🚨 Critical  
**Identified**: 2025-12-05  
**Source**: [implement.md](implement.md), Original Scripts (see below)

### Description

The pre-signal check step was **severely degraded** during project evolution, following the EXACT same pattern as TD-008 (validate-handover). Originally there were comprehensive PowerShell scripts (~411 lines with 8+ check categories) that validated deliverables before signaling completion. The latest version reduced this to ~274 lines with simplified checks.

This validation must be formalized as a CLI command that the implementor runs BEFORE signaling completion to the orchestrator.

### ⚠️ VALIDATION DEGRADATION ANALYSIS

**Evidence of systematic reduction in validation rigor over time:**

| Check Category | Original Script (~411 lines) | Latest Script (~274 lines) | Status |
|----------------|------------------------------|----------------------------|--------|
| **File Creation Checks** | | | |
| Extract CREATE paths (table+list) | ✅ Full regex extraction | ❌ Not checked | **LOST** |
| Verify CREATE files exist | ✅ Checked | ❌ Not checked | **LOST** |
| Verify CREATE files have content | ✅ Min 50 bytes | ❌ Not checked | **LOST** |
| **File Modification Checks** | | | |
| Extract UPDATE paths (table+list) | ✅ Full regex extraction | ❌ Not checked | **LOST** |
| Verify UPDATE files modified (git) | ✅ Git diff check | ❌ Not checked | **LOST** |
| **Test File Checks** | | | |
| Extract test paths from task | ✅ Regex for test patterns | ❌ Not checked | **LOST** |
| Infer test paths from impl files | ✅ Automatic inference | ❌ Not checked | **LOST** |
| Verify test files exist | ✅ Checked | ❌ Not checked | **LOST** |
| **Code Quality** | | | |
| Analyzer on touched files | ✅ Per-file analysis | ❌ Not checked | **LOST** |
| "You touch it, you own it" policy | ✅ Enforced | ❌ Not enforced | **LOST** |
| No TODO/FIXME in new files | ✅ Checked | ❌ Not checked | **LOST** |
| **Visual/Demo Checks** | | | |
| Detect visual/integration task | ✅ Keyword detection | ❌ Not checked | **LOST** |
| Demo file exists | ✅ Pattern matching | ❌ Not checked | **LOST** |
| Demo has widget content | ✅ Content check | ❌ Not checked | **LOST** |
| **Basic Checks** | | | |
| TypeScript/build check | N/A (Dart project) | ✅ Generic npm | Changed |
| Test execution | ✅ Sprint-specific tests | ✅ Generic npm test | Simplified |
| Lint check | ✅ Flutter analyze | ✅ Generic npm lint | Simplified |
| Git status | ✅ Detailed | ✅ Simplified | Retained |
| Artifact creation | ✅ YAML + audit trail | ✅ YAML + audit trail | Retained |

**Summary**: 12+ validation checks were LOST, remaining checks were simplified.

### Original Script Sources (MUST RESTORE)

| File | Location | Lines | Purpose |
|------|----------|-------|---------|
| `pre-signal-check.ps1` (Original) | `docs/case-study/.orchestra-original/implementor/.implementor-only/scripts/` | ~411 | **Full validation** |
| `pre-signal-check.ps1` (Latest) | `docs/case-study/.orchestra.latest/implementor/.implementor-only/scripts/` | ~274 | **Degraded version** |
| `check-utils.ps1` | `docs/case-study/.orchestra-original/common/scripts/` | N/A | Shared utilities |

### Current State

| Aspect | Current State |
|--------|---------------|
| Pre-signal check | Script reference in implement.md (A-IMPL-09) |
| Enforcement | None - completely optional |
| Original scripts | Exist in case-study folder, not integrated |
| CLI command | **Does not exist** |
| Validation rigor | Severely degraded from original |

### Original Validation Checks to Restore

From `pre-signal-check.ps1` (Original ~411 lines):

**1. File Creation Checks:**
```powershell
# Extract CREATE file paths (table + list formats)
$tableCreateMatches = [regex]::Matches($content, '(?im)^\|\s*CREATE\s*\|\s*`?([^|`\n]+)`?\s*\|')
$listCreateMatches = [regex]::Matches($content, '(?im)^-\s*CREATE[:\s]+`?([^\n`]+)`?')

# Verify file exists
$exists = Test-Path $path

# Check it has content (min 50 bytes)
$hasContent = Test-FileHasContent $path 50
```

**2. File Modification Checks:**
```powershell
# Extract UPDATE file paths
$tableUpdateMatches = [regex]::Matches($content, '(?im)^\|\s*UPDATE\s*\|\s*`?([^|`\n]+)`?\s*\|')

# Check file was actually modified
$isModified = Test-FileModified $path  # Uses git diff
```

**3. Test File Checks:**
```powershell
# Extract explicit test paths
$testMatches = [regex]::Matches($content, "(?<!\bpackage:)test/(unit|widget|integration)[/\\][^\s`\)]+_test\.dart")

# Infer test paths from implementation files
if ($implPath -match "lib/src/(.+)\.dart$") {
    $inferredTestPath = "test/unit/$relativePath`_test.dart"
}
```

**4. Code Quality ("You Touch It, You Own It"):**
```powershell
# ╔════════════════════════════════════════════════════════════════════════════╗
# ║  YOU TOUCH IT, YOU OWN IT - NO "PRE-EXISTING" EXCUSES                      ║
# ║  Any file you CREATE or MODIFY must have ZERO analyzer issues.             ║
# ╚════════════════════════════════════════════════════════════════════════════╝

# Run analyzer on ONLY touched files
$filesToAnalyze = ($createPaths + $updatePaths) | Where-Object { 
    $_ -and (Test-Path $_) -and $_ -match "\.dart$"
}

# Check for TODO/FIXME in new files
$hasTodos = $fileContent -match "//\s*TODO|//\s*FIXME|//\s*XXX"
```

**5. Demo/Visual Checks:**
```powershell
$isVisual = $content -match "(?i)VISUAL|INTEGRATION|demo"
if ($isVisual) {
    $demoFiles = Get-ChildItem -Path "example/lib/demos" -Filter "task_$($taskNumber.PadLeft(3,'0'))*.dart"
    
    # Check demo has meaningful content
    $hasWidgets = $demoContent -match "Widget|Scaffold|build\("
}
```

### Proposed Solution

**New CLI Command:** `orchestra pre-signal-check`

```bash
# Implementor runs before signaling completion (MANDATORY)
orchestra pre-signal-check

# Verbose output showing all checks
orchestra pre-signal-check --verbose

# JSON output for scripting
orchestra pre-signal-check --json

# Force mode (skip checks, create artifact anyway - for emergencies)
orchestra pre-signal-check --force
```

**Validation Check Matrix (Restore ALL Original Checks):**

| ID | Check | Category | Severity |
|----|-------|----------|----------|
| P1 | CREATE files exist | Deliverables | BLOCKING |
| P2 | CREATE files have content | Deliverables | BLOCKING |
| P3 | UPDATE files modified (git) | Deliverables | BLOCKING |
| P4 | Test files exist | Testing | BLOCKING |
| P5 | Tests pass | Testing | BLOCKING |
| P6 | TypeScript/Build succeeds | Quality | BLOCKING |
| P7 | Lint passes | Quality | BLOCKING |
| P8 | No analyzer issues in touched files | Quality | BLOCKING |
| P9 | No TODO/FIXME in new files | Quality | WARNING |
| P10 | Demo file exists (visual tasks) | Visual | WARNING |
| P11 | Demo has widget content | Visual | WARNING |
| P12 | Git has changes | Git | WARNING |

**Exit Codes:**
- 0: All checks pass → create PASSED artifact
- 1: Blocking checks failed → create FAILED artifact
- 2: Warnings only → create PASSED artifact with warnings

**Artifact Created:**
```yaml
# .orchestra/handover/verification/pre-signal.yaml
task_id: 3
timestamp: "2025-12-05T10:30:00Z"
status: "PASSED"  # or "FAILED"

checks:
  deliverables:
    status: "PASS"
  tests:
    status: "PASS"
    count: 15
  build:
    status: "PASS"
  lint:
    status: "PASS"
  analyzer:
    status: "PASS"
```

### Workflow Integration

**In implement.md:**
- Change A-IMPL-09 from Script to CLI
- Command: `orchestra pre-signal-check`
- Mandatory before A-IMPL-06 (complete completion signal)

### Implementation Tasks

1. **Create CLI command:**
   - `src/commands/pre-signal-check.ts`
   - `src/core/pre-signal-check.ts`

2. **Port ALL original validation logic:**
   - Reference: `docs/case-study/.orchestra-original/implementor/.implementor-only/scripts/pre-signal-check.ps1`
   - Port CREATE/UPDATE file extraction (table + list formats)
   - Port file existence and content checks
   - Port test file detection and execution
   - Port analyzer on touched files only
   - Port TODO/FIXME detection
   - Port demo/visual task detection

3. **Artifact creation:**
   - Write to `.orchestra/handover/verification/pre-signal.yaml`
   - Also archive to `.orchestra/implementor/artifacts/pre-signal/`

4. **Documentation:**
   - Update `implement.md` A-IMPL-09 to CLI

### Relationship to `orchestra accept-signal`

**⚠️ ANALYSIS REQUIRED**: The existing `orchestra accept-signal` command may already provide some of this functionality. Review `spec/implementation/phase-1-cli/commands/accept-signal.md` and `src/commands/accept-signal.ts`.

**Current Understanding:**

| Aspect | `pre-signal-check` (TD-010) | `accept-signal` (Existing) |
|--------|----------------------------|---------------------------|
| **Actor** | Implementor | Orchestrator |
| **Purpose** | CREATE pre-signal.yaml | VERIFY pre-signal.yaml exists |
| **Phase** | IMPLEMENT (before signal) | GATE_CHECK (after signal) |
| **Trust** | Implementor context | Orchestrator context |
| **Action** | Run checks → Write artifact | Read artifact → Validate status |

**Relationship Hypothesis:**
These commands are **complementary**, not overlapping:
1. Implementor runs `pre-signal-check` → creates `.orchestra/handover/verification/pre-signal.yaml`
2. Implementor writes completion-signal.md
3. Orchestrator runs `accept-signal` → checks pre-signal.yaml exists and status is PASSED

**Analysis Questions:**
1. Does `accept-signal` currently expect pre-signal.yaml to exist?
2. What creates pre-signal.yaml if `pre-signal-check` command doesn't exist?
3. Should `pre-signal-check` be a separate command or integrated into another?

**Resolution Options:**
- **Option A**: Keep as separate command (clear separation of concerns)
- **Option B**: Integrate into `orchestra complete` (runs checks before creating signal)
- **Option C**: Enhance `accept-signal` to handle both cases (but violates trust boundary)

**Recommended**: Option A - separate `pre-signal-check` command maintains trust boundary and clear workflow.

### Acceptance Criteria

- [ ] `orchestra pre-signal-check` command exists
- [ ] Restores ALL 12 original validation checks (P1-P12)
- [ ] Extracts CREATE/UPDATE paths from handover (table + list formats)
- [ ] Verifies CREATE files exist and have content
- [ ] Verifies UPDATE files were modified (git diff)
- [ ] Detects and verifies test files
- [ ] Runs build and tests
- [ ] Runs analyzer on touched files only ("you touch it, you own it")
- [ ] Detects TODO/FIXME in new files
- [ ] Handles visual/demo task detection
- [ ] Creates YAML artifact for `orchestra accept-signal`
- [ ] Creates audit trail artifact
- [ ] Returns appropriate exit codes (0, 1, 2)
- [ ] JSON output for scripting (`--json`)
- [ ] Verbose output showing all checks (`--verbose`)
- [ ] Tests cover all validation scenarios
- [ ] Integrates with `accept-signal` workflow (artifact handoff)

### Related Files

**Original Scripts (Reference for Implementation):**
- `docs/case-study/.orchestra-original/implementor/.implementor-only/scripts/pre-signal-check.ps1` - **PRIMARY SOURCE (~411 lines)**
- `docs/case-study/.orchestra-original/common/scripts/check-utils.ps1` - Shared utilities

**Degraded Scripts (Do NOT Use as Reference):**
- `docs/case-study/.orchestra.latest/implementor/.implementor-only/scripts/pre-signal-check.ps1` - Degraded (~274 lines)

**New Files to Create:**
- `src/commands/pre-signal-check.ts`
- `src/core/pre-signal-check.ts`
- `test/commands/pre-signal-check.test.ts`
- `test/core/pre-signal-check.test.ts`

**Documentation to Update:**
- `docs/workflow/implement.md` - Change A-IMPL-09 to CLI

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
|---------|------|---------|
| 1.0.0 | 2025-12-05 | Initial creation with TD-001, TD-002 |
| 1.1.0 | 2025-12-05 | Added TD-003: Template-Based Config Generation |
| 1.2.0 | 2025-12-05 | Updated TD-003 to include progress.yaml; Added TD-004: Process Guide Review |
| 1.3.0 | 2025-12-05 | Added TD-005: Workflow Document Actions Section; Added TD-006: SpecKit tasks.md Clarification |
| 1.4.0 | 2025-12-05 | Completed TD-005: Added Actions sections to init.md, configure-manifest.md, closeout.md |
| 1.5.0 | 2025-12-05 | TD-005 complete: Added Execution Sequence, Agent Process sections; Action IDs now use `A-{STEP}-XX` format |
| 1.6.0 | 2025-12-05 | Added TD-007: Pre-Flight Checklist Workflow |
| 1.7.0 | 2025-12-05 | Added TD-008: Handover Validation Command (critical - lost during evolution) |
| 1.8.0 | 2025-12-05 | TD-007 updated: Solution is `orchestra prepare --finalize`; prepare.md is source of truth |
| 1.9.0 | 2025-12-05 | TD-007 complete: Implemented `orchestra prepare --finalize` command |
| 1.10.0 | 2025-12-05 | Added TD-009: Sync 01-handover-creation.md with prepare.md |
| 1.11.0 | 2025-12-05 | TD-008 expanded: Added comprehensive validation degradation analysis, original script references, 13 lost checks documented |
| 1.12.0 | 2025-12-05 | Added TD-010: Pre-Signal Check Command (critical - same degradation pattern as TD-008, 12+ checks lost) |
| 1.13.0 | 2025-12-05 | TD-010 updated: Added "Relationship to accept-signal" section for analysis |
