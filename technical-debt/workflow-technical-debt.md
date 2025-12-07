# Technical Debt

> Tracking document for workflow-related technical debt items.  
> These items represent features or improvements identified during documentation that require implementation.

---

## Index

- [x] [TD-001: Git Actions CLI Automation](#td-001-git-actions-cli-automation)
- [x] [TD-002: orchestra next Command](#td-002-orchestra-next-command)
- [x] [TD-003: Template-Based Config Generation](#td-003-template-based-config-generation)
- [x] [TD-004: Review and Update Sprint Initialization Process Guide](#td-004-review-and-update-sprint-initialization-process-guide)
- [x] [TD-005: Workflow Document Actions Section](#td-005-workflow-document-actions-section)
- [x] [TD-006: Clarify SpecKit tasks.md Location and Purpose](#td-006-clarify-speckit-tasksmd-location-and-purpose)
- [x] [TD-007: Pre-Flight Checklist Workflow](#td-007-pre-flight-checklist-workflow)
- [x] [TD-008: Handover Validation Command](#td-008-handover-validation-command)
- [x] [TD-009: Sync 01-handover-creation.md with prepare.md](#td-009-sync-01-handover-creationmd-with-preparemd)
- [x] [TD-010: Pre-Signal Check Command](#td-010-pre-signal-check-command)
- [ ] [TD-011: Feedback Workflow Integration](TD-011-feedback-workflow.md) ← **NEW**

---

## TD-001: Git Actions CLI Automation

**Status**: ✅ Complete  
**Priority**: Medium  
**Identified**: 2025-12-05  
**Completed**: 2025-12-09  
**Source**: [init.md - Git Actions](init.md#git-actions)

### Description

The workflow documentation recommends git actions (commit, stage) after various CLI commands, but the CLI does not currently automate these actions.

### Implementation Summary

Added git automation flags to `orchestra init` and `orchestra prepare` commands:

```bash
# Stage generated files
orchestra init --git-stage
orchestra prepare --task 1 --git-stage

# Commit generated files (implies --git-stage)
orchestra init --git-commit
orchestra prepare --task 1 --git-commit
```

### Changes Made

1. **`src/core/git.ts`**: Added `push()` function for consistency
2. **`src/commands/init.ts`**: Added `--git-stage` and `--git-commit` flags
   - Stages `.orchestra/` directory
   - Commits with configurable prefix from `orchestra.yaml`
3. **`src/commands/prepare.ts`**: Added `--git-stage` and `--git-commit` flags
   - Stages generated handover files
   - Commits with task ID and title in message
4. **Tests**: Added 4 new tests for git flag options

### Key Design Decisions

- Git operations fail gracefully (non-fatal errors)
- Git failures don't block successful command execution
- Error messages are descriptive for troubleshooting
- JSON output includes git operation results
- Commit prefix read from `orchestra.yaml` config (`git.commit_prefix`)

### Acceptance Criteria

- [x] CLI can optionally stage files after creation
- [x] CLI can optionally commit with conventional commit message
- [x] Behavior is configurable in `orchestra.yaml`
- [x] Git operations fail gracefully if not in a git repo

### Related Files

- `src/core/git.ts` - Git utilities (added `push()`)
- `src/commands/init.ts` - Init command with git flags
- `src/commands/prepare.ts` - Prepare command with git flags
- `test/commands/init.test.ts` - Tests for git options
- `test/commands/prepare.test.ts` - Tests for git options

---

## TD-002: orchestra next Command

**Status**: ✅ Complete  
**Priority**: High  
**Identified**: 2025-12-05  
**Completed**: 2025-12-09  
**Source**: [init.md - Next Step](init.md#next-step)

### Description

Users and agents need guidance on what to do next at any point in the workflow. The `orchestra next` command provides context-aware guidance based on the current workflow state.

### Implementation Summary

Created `orchestra next` command that analyzes artifacts and manifest state to infer the current workflow step and provide actionable guidance.

```bash
$ orchestra next

📋 Current Step: Select Task

Sprint: sprint-001 (ACTIVE)

▸ Select a task to work on

No task is currently in progress. Run prepare to select and prepare the next available task.

Run:
  orchestra prepare

Tips:
  • Use --task <id> to prepare a specific task
  • Tasks are prepared in dependency order by default
```

### Changes Made

1. **`src/core/types.ts`**: Added `WorkflowStep` type with 11 states
   - Sprint-level: INIT, CONFIGURE, SELECT_TASK, SPRINT_COMPLETE
   - Task-level: PREPARE, IMPLEMENT, SIGNAL, VERIFY, COMPLETE, RETRY, ESCALATED

2. **`src/core/workflow-state.ts`**: State detection module
   - `detectWorkflowState()` - Analyzes artifacts to infer current step
   - `WorkflowState` interface - Complete state including artifacts, errors
   - Artifact inference: handover, signal, verification, feedback existence

3. **`src/core/next.ts`**: Core logic for next command
   - `runNext()` - Gets guidance for current step
   - `StepGuidance` interface - Action, command, explanation, tips
   - Step guidance registry with per-step recommendations

4. **`src/commands/next.ts`**: CLI command
   - `--json` flag for JSON output
   - `--verbose` flag for detailed state info
   - Rich CLI output with icons and colors

5. **`src/cli.ts`**: Registered the next command

6. **Tests**: Added 6 tests in `test/core/workflow-state.test.ts`

### Key Design Decisions

- **Inference-first**: Determines step from artifacts, not explicit tracking
- **Read-only**: Does not modify any state, purely observational
- **Per-step guidance**: Each workflow step has tailored action and tips
- **JSON support**: Structured output for agent consumption

### Acceptance Criteria

- [x] Command exists: `orchestra next`
- [x] Detects current workflow position
- [x] Provides actionable next step with command
- [x] Shows errors with file location and resolution steps
- [x] JSON output support for agent consumption
- [x] Handles all workflow phases (INIT → COMPLETE)

### Related Files

- `src/core/types.ts` - WorkflowStep type
- `src/core/workflow-state.ts` - State detection logic
- `src/core/next.ts` - Core next command logic
- `src/commands/next.ts` - CLI command
- `test/core/workflow-state.test.ts` - State detection tests

---

## TD-003: Template-Based Config Generation

**Status**: ✅ Complete  
**Priority**: Medium  
**Identified**: 2025-12-05  
**Completed**: 2025-12-06  
**Source**: [init.md - Generated Files](init.md#generated-files-detail)

### Description

The `manifest.yaml`, `orchestra.yaml`, and `progress.yaml` files are currently generated from inline code strings in `src/commands/init.ts`. This violates the template architecture principle that **nothing should be inline in source**.

### Implementation Summary

Created Handlebars templates for all configuration files and a new `config-generator.ts` module to render them. The inline `generateManifestTemplate()` and `generateProgressTemplate()` functions have been removed from `init.ts`.

### Changes Made

1. **New Templates** (`templates/common/templates/`):
   - `manifest.yaml.hbs` - Sprint manifest with phases structure
   - `orchestra.yaml.hbs` - Configuration with paths and git settings
   - `progress.yaml.hbs` - Progress tracking initialization

2. **New Core Module** (`src/core/config-generator.ts`):
   - `ConfigTemplateContext` interface for template rendering
   - `createDefaultContext()` - Creates context with defaults
   - `generateManifestYaml()` - Renders manifest template
   - `generateOrchestraYaml()` - Renders config template
   - `generateProgressYaml()` - Renders progress template
   - `getPackageTemplatesDir()` - Locates package templates

3. **Updated Init Command** (`src/commands/init.ts`):
   - Removed inline `generateManifestTemplate()` function
   - Removed inline `generateProgressTemplate()` function
   - Now uses `createDefaultContext()` and template generators
   - Config templates added to `TEMPLATE_MAPPINGS` for copying

4. **Tests** (`test/core/config-generator.test.ts`):
   - 16 new tests covering all generator functions
   - Tests for context creation, YAML generation, specPath handling

### Acceptance Criteria

- [x] `manifest.yaml.hbs` template created in `templates/common/templates/`
- [x] `orchestra.yaml.hbs` template created in `templates/common/templates/`
- [x] `progress.yaml.hbs` template created in `templates/common/templates/`
- [x] `generateManifestTemplate()` replaced with template rendering
- [x] `generateProgressTemplate()` replaced with template rendering
- [x] Templates support all current dynamic values (date, spec path, etc.)
- [x] Templates are copied to `.orchestra/common/templates/` during init
- [x] All existing tests pass (435 tests)
- [x] New tests for config generation added (16 tests)

### Related Files

- `src/core/config-generator.ts` - New config generation module
- `src/commands/init.ts` - Updated to use templates
- `templates/common/templates/manifest.yaml.hbs` - New template
- `templates/common/templates/orchestra.yaml.hbs` - New template
- `templates/common/templates/progress.yaml.hbs` - New template
- `test/core/config-generator.test.ts` - New tests

---

## TD-004: Review and Update Sprint Initialization Process Guide

**Status**: ✅ Complete  
**Priority**: High  
**Identified**: 2025-12-05  
**Completed**: 2025-12-06  
**Source**: [configure-manifest.md](configure-manifest.md)

### Description

The orchestrator process guide `00-sprint-initialization.md` needs review and potential updates to align with current CLI implementation and workflow documentation.

### Implementation Summary

Completely rewrote `00-sprint-initialization.md` to align with current CLI implementation. Also updated `02-task-verification.md` to fix incorrect file paths.

### Key Issues Fixed

**00-sprint-initialization.md** (complete rewrite):
- Fixed manifest location: Was `.orchestra/orchestrator/.orchestrator-only/manifest.yaml`, now `.orchestra/manifest.yaml`
- Fixed progress location: Was `.orchestrator-only/`, now `.orchestra/progress.yaml`
- Updated manifest schema: Changed `id` to `task_id`, `depends_on` to `dependencies`, `spec_ref` to `speckit_task_ref`
- Updated phase schema: Changed `id`/`name` to `phase_id`/`phase_name`, added `status` and `speckit_tasks`
- Updated status values: Now uses correct enums (PENDING, IMPLEMENT, COMPLETE, etc.)
- Added CLI commands: `orchestra init`, `orchestra status`, `orchestra next`, `orchestra prepare`
- Added verification YAML schema matching current `VerificationCheckSchema`
- Added CLI Commands Reference table

**02-task-verification.md**:
- Fixed progress.yaml path (was in `.orchestrator-only/`, now at `.orchestra/progress.yaml`)
- Fixed manifest.yaml path (was in `.orchestrator-only/`, now at `.orchestra/manifest.yaml`)
- Updated schema examples to use `task_id` instead of `id`
- Updated status values to use correct enums (COMPLETE, RETRY)
- Added `orchestra feedback` and `orchestra escalate` to CLI Commands Reference

### Acceptance Criteria

- [x] Review all 7 steps in process guide for accuracy
- [x] Verify file paths match actual `.orchestra/` structure
- [x] Update verification YAML examples to match current schema
- [x] Ensure CLI commands are current
- [x] Update SpecKit mapping examples if needed
- [x] Review and update 02-task-verification.md

### Related Files

- `templates/orchestrator/processes/00-sprint-initialization.md` - Complete rewrite
- `templates/orchestrator/processes/02-task-verification.md` - Path/schema fixes

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

**Status**: ✅ Complete  
**Priority**: High  
**Identified**: 2025-12-05  
**Completed**: 2025-12-06  
**Source**: [closeout.md - C4 Check](closeout.md#c4-speckit-tasks-checked)

### Description

There was confusion about the SpecKit `tasks.md` file location and whether Orchestra maintains a copy.

### Resolution

After investigation, the correct flow is:

1. `orchestra init --spec <path>` stores the SpecKit root in `orchestra.yaml`
2. SpecKit's `tasks.md` lives externally at `{spec_path}/tasks.md`
3. C4 closeout check validates SpecKit tasks are checked in the external file
4. The old hardcoded path `.orchestra/orchestrator/.orchestrator-only/tasks.md` was incorrect

### Changes Made

1. **Schema Update** (`src/core/types.ts`):
   - Added `SpecKitConfigSchema` with `root` and `tasks_file` fields
   - Replaced `spec_path: string` with `speckit: { root, tasks_file }` object

2. **C4 Check Fixed** (`src/core/closeout.ts`):
   - Now reads from `speckit.tasks_file` configuration
   - Smart skip logic: Skip if no config AND no refs; Fail if refs exist but no config
   - Proper error messages with actionable fix suggestions

3. **Init Command** (`src/commands/init.ts`):
   - Now generates `speckit: { root, tasks_file }` when `--spec` provided

4. **Config Generator** (`src/core/config-generator.ts`):
   - Updated context interface to use `speckit` object

5. **Template Fixed** (`templates/common/templates/orchestra.yaml.hbs`):
   - Generates proper `speckit:` block with `root:` and `tasks_file:`

6. **Status Command** (`src/commands/status.ts`):
   - Updated to use `config.speckit?.root` instead of `config.spec_path`

### Acceptance Criteria

- [x] Clarify canonical location of SpecKit tasks.md (external at `speckit.tasks_file`)
- [x] Update C4 check to look in correct location
- [x] Update closeout.md File Impact section (via schema change)
- [x] Document who updates checkboxes and when (orchestrator updates after verification)
- [x] Remove dead code/references (hardcoded `.orchestrator-only/tasks.md` path)

### Related Files

- `src/core/closeout.ts` - C4 check implementation
- `src/core/types.ts` - SpecKitConfigSchema
- `src/commands/init.ts` - speckit config generation
- `templates/common/templates/orchestra.yaml.hbs` - Template update

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

**Status**: ✅ Complete  
**Priority**: 🚨 Critical  
**Identified**: 2025-12-05  
**Completed**: 2025-12-10  
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

- [x] `orchestra validate-handover` command exists
- [x] Restores ALL 13 original validation checks (V1-V13)
- [x] Validates task structure (title, objective, deliverables, TDD)
- [x] Extracts and validates file paths (table + list formats)
- [x] Checks CREATE files don't exist, UPDATE files do exist
- [x] Validates completeness (no TODOs, has scaffolds, test data)
- [x] Detects integration/visual tasks and checks MUST USE + demo
- [x] Returns appropriate exit codes (0, 1, 2)
- [x] JSON output for scripting (`--json`)
- [x] Verbose output showing all checks (`--verbose`)
- [x] Integrated into prepare.md workflow (A-PREP-15)
- [x] Integrated into implement.md workflow (A-IMPL-00)
- [x] Tests cover all validation scenarios

### Implementation Summary

Implemented `orchestra validate-handover` command that restores all 13 original validation checks from the degraded PowerShell script.

**Command Usage:**
```bash
# Run validation on current task
orchestra validate-handover

# Run for specific task
orchestra validate-handover --task 1

# Verbose output showing all checks
orchestra validate-handover --verbose

# JSON output for scripting
orchestra validate-handover --json
```

**Validation Checks Implemented:**
| ID | Check | Severity |
|----|-------|----------|
| V1 | Has task title | BLOCKING |
| V2 | Has objective section | BLOCKING |
| V3 | Has deliverables section | WARNING |
| V4 | Has TDD/testing section | WARNING |
| V5 | CREATE paths specified | WARNING |
| V6 | CREATE files don't exist | BLOCKING |
| V7 | UPDATE paths specified | WARNING |
| V8 | UPDATE files exist | BLOCKING |
| V9 | No TODO/TBD markers | BLOCKING |
| V10 | Has code scaffold | WARNING |
| V11 | Has test sample data | WARNING |
| V12 | MUST USE section (integration) | WARNING |
| V13 | Demo file requirement (visual) | WARNING |

**Key Features:**
- Extracts file operations from both table and list formats
- Validates file existence (CREATE shouldn't exist, UPDATE should)
- Detects TODO/TBD/PLACEHOLDER/XXX/FIXME markers
- Detects integration/visual tasks for MUST USE and demo checks
- Exit codes: 0 (pass), 1 (blocking failures), 2 (warnings only)

**Files Created:**
- `src/core/validate-handover.ts` (~565 lines) - Core validation logic
- `src/commands/validate-handover.ts` - CLI command wrapper
- `test/core/validate-handover.test.ts` - 28 tests for core logic
- `test/commands/validate-handover.test.ts` - 10 tests for command

**Files Modified:**
- `src/core/types.ts` - Added ValidationSeverity, ValidationCheckResult, ValidationReport types
- `src/cli.ts` - Registered validate-handover command
- `src/core/index.ts` - Added exports

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

**Status**: ✅ Complete  
**Priority**: Medium  
**Identified**: 2025-12-05  
**Completed**: 2025-12-10  
**Source**: [TD-007](#td-007-pre-flight-checklist-workflow), [prepare.md](prepare.md)

### Description

The process guide `01-handover-creation.md` is deployed to `.orchestra/orchestrator/processes/` and is meant to be read by **agents** (not human documentation). It needed to be restructured as clear, actionable agent instructions that follow the same flow as `prepare.md`.

### Implementation Summary

Completely rewrote `templates/orchestrator/processes/01-handover-creation.md` (285 lines) as agent-facing instructions:

1. **Quick Reference Table** - At-a-glance command lookup
2. **7-Step Process** - Matching prepare.md flow:
   - Step 1: Select Task (manifest.yaml)
   - Step 2: Check Previous Task Archived (--finalize flow)
   - Step 3: Validate Dependencies Complete
   - Step 4: Gather Task Information
   - Step 5: Create Verification Criteria (secret)
   - Step 6: Generate Handover Document
   - Step 7: Verify and Deliver

3. **Action Boxes** - Clear `DO:` and `DON'T:` guidance per step
4. **CLI Commands** - All relevant `orchestra` commands documented
5. **File Locations** - Exact paths for each artifact type

### Key Insight

`01-handover-creation.md` is for AGENTS reading from `.orchestra/` during execution.  
`prepare.md` is INTERNAL documentation for project maintainers.

### Changes Made

1. **`templates/orchestrator/processes/01-handover-creation.md`**: Complete rewrite (285 lines)
   - Quick Reference table with all commands
   - 7-step structured process with clear actions
   - Proper action IDs (A-PREP-01 to A-PREP-14)
   - Correct template names and file paths

2. **`templates/common/templates/manifest.yaml.hbs`**: Fixed formatting corruption

3. **`test/core/config-generator.test.ts`**: Fixed hardcoded date in test assertion

### Acceptance Criteria

- [x] `01-handover-creation.md` references `orchestra prepare --finalize`
- [x] Template names match actual templates
- [x] No conflicting information with `prepare.md`
- [x] Clear relationship between process guide and workflow doc
- [x] Structured as agent-consumable instructions (not human docs)

### Related Files

- `docs/workflow/prepare.md` - Source of truth (internal documentation)
- `templates/orchestrator/processes/01-handover-creation.md` - Template for agent guide

---

## TD-010: Pre-Signal Check Command

**Status**: ✅ Complete  
**Priority**: 🚨 Critical  
**Identified**: 2025-12-05  
**Completed**: 2025-12-06  
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

### ✅ Implementation Complete (2025-12-06)

**Implemented as `orchestra pre-signal-check` command:**

- **Core**: `src/core/pre-signal-check.ts` (~900 lines)
- **Command**: `src/commands/pre-signal-check.ts`
- **Tests**: 30 tests (9 command + 21 core)

**Features:**
- All 12 validation checks (P1-P12) restored
- 5 check categories: deliverables, testing, quality, visual, git
- Extracts CREATE/UPDATE paths from handover markdown
- Options: `--verbose`, `--json`, `--force`, `--skip-tests`, `--skip-lint`, `--skip-analyzer`
- Creates `pre-signal.yaml` artifact at `.orchestra/handover/verification/pre-signal.yaml`
- Creates dated audit trail artifacts
- Exit codes: 0 (pass), 1 (fail), 2 (warnings only)

**Workflow Integration:**
```
Implementor: orchestra pre-signal-check → creates pre-signal.yaml
Implementor: (writes completion signal)
Orchestrator: orchestra accept-signal → validates pre-signal.yaml exists & PASSED
```

### Acceptance Criteria

- [x] `orchestra pre-signal-check` command exists
- [x] Restores ALL 12 original validation checks (P1-P12)
- [x] Extracts CREATE/UPDATE paths from handover (table + list formats)
- [x] Verifies CREATE files exist and have content
- [x] Verifies UPDATE files were modified (git diff)
- [x] Detects and verifies test files
- [x] Runs build and tests
- [x] Runs analyzer on touched files only ("you touch it, you own it")
- [x] Detects TODO/FIXME in new files
- [x] Handles visual/demo task detection
- [x] Creates YAML artifact for `orchestra accept-signal`
- [x] Creates audit trail artifact
- [x] Returns appropriate exit codes (0, 1, 2)
- [x] JSON output for scripting (`--json`)
- [x] Verbose output showing all checks (`--verbose`)
- [x] Tests cover all validation scenarios
- [x] Integrates with `accept-signal` workflow (artifact handoff)

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
| 1.14.0 | 2025-12-06 | TD-009 complete: Comprehensive rewrite of 01-handover-creation.md (403 lines) |
| 1.15.0 | 2025-12-06 | TD-010 complete: Implemented `orchestra pre-signal-check` command (~900 lines core, 30 tests) |
| 1.13.0 | 2025-12-05 | TD-010 updated: Added "Relationship to accept-signal" section for analysis |
