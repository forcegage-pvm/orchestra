# Prepare Task

> **Phase**: PREPARE  
> **CLI Command**: `orchestra prepare`  
> **Source**: [src/commands/prepare.ts](../../src/commands/prepare.ts)

---

## Index

- [Overview](#overview)
- [Purpose](#purpose)
- [Philosophy](#philosophy)
- [Actions](#actions)
- [Execution Sequence](#execution-sequence)
- [Agent Process](#agent-process)
- [CLI Command](#cli-command)
- [Input](#input)
- [File Impact](#file-impact)
- [Template Details](#template-details)
- [Git Actions](#git-actions)
- [Outcome](#outcome)
- [Next Step](#next-step)
- [Evidence Produced](#evidence-produced)
- [Implementation Reference](#implementation-reference)
- [Troubleshooting](#troubleshooting)

---

## Overview

| Attribute | Value |
|-----------|-------|
| **Phase** | PREPARE |
| **Role** | Orchestrator Agent |
| **Trigger** | After `orchestra closeout` passes |
| **Preconditions** | Closeout passed; task is PENDING; dependencies complete |

---

## Purpose

Generate handover documents for the implementor. This step:

1. **Selects the task** - Next pending task or specific task ID
2. **Validates readiness** - Dependencies complete, no task in-progress
3. **Runs closeout check** - Ensures previous task is fully closed out
4. **Generates handover files** - Creates documents for implementor
5. **Updates manifest** - Sets task status to IMPLEMENT
6. **Updates progress** - Records PREPARE entry

The orchestrator agent **completes the handover** by filling in task-specific details after generation.

---

## Philosophy

Prepare creates the **communication bridge** between orchestrator and implementor.

### CRITICAL: Information Isolation Principle

> **Reference**: [spec/04-processes/information-isolation.md](../../spec/04-processes/information-isolation.md)

The Implementor has **ZERO access** to:
- Task lists or sprint manifests
- Specification files in `spec/`
- Other tasks in the sprint
- Verification criteria (hidden or visible)

**Your PRIMARY JOB as Orchestrator is EXTRACTION:**

1. **READ** the specification files, task definitions, and requirements
2. **EXTRACT** exactly what the Implementor needs to know
3. **WRITE** a complete, self-contained handover document
4. **NEVER** reference external documents the Implementor cannot access

### Forbidden Patterns

| NEVER Write This | Write This Instead |
|-----------------|-------------------|
| "See spec file for details" | Extract the details into the handover |
| "Per requirements.md" | Copy the relevant requirements |
| "Refer to task list for context" | Provide context directly |
| "Check other tasks for examples" | Include examples in the handover |
| Empty or [REQUIRED] sections | Fill in or remove the section |

**The handover IS the specification. There is no "see also."**

### Why This Matters

The handover documents are the **only information** the implementor receives about the task. Everything the implementor needs must be in these files:
- What to build
- How to verify it works
- What files to create/modify
- What tests to write

### Information Asymmetry

| Orchestrator Sees | Implementor Sees |
|-------------------|------------------|
| Hidden verification criteria | Handover documents only |
| Full manifest context | Task-specific context |
| Verification YAML in `.orchestrator-only/` | Visible checks in handover |
| All spec/ files | NOTHING - no access |

The orchestrator creates **visible acceptance criteria** (what implementor sees) and **hidden verification criteria** (what verifier uses). These should align but the implementor cannot game the hidden checks.

### Anti-Patterns This Prevents

| Anti-Pattern | How Prepare Prevents It |
|--------------|------------------------|
| Incomplete handover | Template ensures all required fields |
| External references | Validation catches "see spec file" patterns |
| Context leakage | Handover contains only task-relevant info |
| Dependency violations | Validates dependencies before generating |
| Concurrent tasks | Blocks if another task in-progress |
| Dirty state | Runs closeout check first |

---

## Actions

> Quick reference for all actions in this workflow step.  
> Use Action IDs to reference specific actions in other sections.

### CLI Actions

| ID | Action | Command |
|----|--------|--------|
| A-PREP-01 | Prepare next task | `orchestra prepare` |
| A-PREP-02 | Prepare specific task | `orchestra prepare --task <id>` |
| A-PREP-03 | Force prepare | `orchestra prepare --force` |
| A-PREP-04 | Preview prepare | `orchestra prepare --dry-run` |
| A-PREP-05 | Skip closeout | `orchestra prepare --skip-closeout` |

### Agent Actions

| ID | Role | Action |
|----|------|--------|
| A-PREP-07 | Orchestrator | Run prepare command |
| A-PREP-08 | Orchestrator | Complete handover content |
| A-PREP-09 | Orchestrator | Complete pre-flight checklist |
| A-PREP-10 | Orchestrator | Verify handover is complete |

### Manual Actions

| ID | Role | Action | Notes |
|----|------|--------|-------|
| A-PREP-12 | Human | Review handover | Optional quality check |

### Git Actions

| ID | Action | Level | Command |
|----|--------|-------|--------|
| A-PREP-13 | Stage handover | Recommended | `git add .orchestra/handover/` |
| A-PREP-14 | Commit handover | Recommended | `git commit -m "chore(orchestra): prepare task N"` |

---

## Execution Sequence

The complete ordered execution of this workflow step:

| Order | Action ID | Type | Action |
|-------|-----------|------|--------|
| 1 | A-PREP-07 | Agent | Initiate prepare |
| 2 | A-PREP-01 | CLI | `orchestra prepare` (generates handover + preflight checklist) |
| 3 | A-PREP-08 | Agent | Complete handover content (fill TODOs) |
| 4 | A-PREP-09 | Agent | Complete pre-flight checklist |
| 5 | A-PREP-10 | Agent | Verify handover is complete |
| 6 | A-PREP-12 | Manual | Review handover (optional) |
| 7 | A-PREP-13 | Git | Stage handover files |
| 8 | A-PREP-14 | Git | Commit handover |

---

## Agent Process

The orchestrator agent prepares the handover for the implementor.

### A-PREP-07: Initiate Prepare

- Determine which task to prepare (next pending or specific ID)
- Run `orchestra prepare --task N` or just `orchestra prepare`

### A-PREP-08: Complete Handover Content

After CLI generates the handover skeleton, **EXTRACT and FILL IN** task-specific details:

> ⚠️ **CRITICAL**: Never say "see spec file". Extract ALL information into the handover.

| Field | What to Extract & Write |
|-------|-------------------------|
| `objective` | Clear statement extracted from spec - fully self-contained |
| `acceptance_criteria` | Visible criteria with verification methods - complete table |
| `file_operations` | ALL files to create/modify/delete with exact paths and purposes |
| `test_file` | Exact path to test file |
| `test_cases` | Full test structure with describe/it blocks and sample data |
| `implementation_files` | Source files with function signatures and interfaces |
| `code_scaffolds` | TypeScript interfaces and function stubs |

**Extraction Checklist**:
- [ ] Read the task specification file completely
- [ ] Extract every requirement into the handover
- [ ] Include sample data for tests (not just test names)
- [ ] Provide code scaffolds showing expected interfaces
- [ ] Remove or fill all `[REQUIRED]` placeholders
- [ ] No references to external spec files remain

**Template markers**: Look for `<!-- ORCHESTRATOR: ... -->` comments in the generated template.

### A-PREP-09: Complete Pre-Flight Checklist

The CLI generates `handover/preflight-checklist.yaml`. Complete all checklist items:

- [ ] Task closeout check passed
- [ ] Read process documentation (not from memory)
- [ ] All sections filled (content or N/A with reason)
- [ ] File paths are unambiguous (relative to repo root)
- [ ] CREATE files have: path, purpose, export location
- [ ] UPDATE files have: exact methods/changes, code scaffold
- [ ] TDD has sample data objects (not just test names)
- [ ] INTEGRATION/VISUAL has runnable demo scaffold
- [ ] Verification YAML created with criteria

### A-PREP-10: Verify Handover Complete

Before handing off to implementor, verify:

- [ ] All TODO markers filled in
- [ ] Objective is clear and actionable
- [ ] Acceptance criteria are testable
- [ ] File paths are correct
- [ ] Test cases are specific
- [ ] Dependencies are documented
- [ ] Pre-flight checklist completed
- [ ] Verification YAML validated with `orchestra init --verify`

---

## CLI Command

```bash
orchestra prepare [options]
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--task <id>` | number | auto | Specific task ID (default: next pending) |
| `--force` | boolean | false | Prepare even if another task in-progress |
| `--skip-closeout` | boolean | false | Skip closeout check (not recommended) |
| `--dry-run` | boolean | false | Show what would be generated |
| `--format <fmt>` | string | from config | Output format: yaml, markdown, both |
| `--json` | boolean | false | JSON output for scripting |

### Examples

```bash
# Prepare next pending task
orchestra prepare

# Prepare specific task
orchestra prepare --task 3

# Force prepare (override in-progress check)
orchestra prepare --task 3 --force

# Preview what would be generated
orchestra prepare --dry-run

# Generate both YAML and markdown
orchestra prepare --format both

# JSON output for automation
orchestra prepare --json
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success - handover generated |
| 1 | Failure - validation or generation error |

---

## Input

### Required

| Input | Source | Purpose |
|-------|--------|---------|
| `.orchestra/manifest.yaml` | Manifest | Task definitions, dependencies |
| `.orchestra/orchestra.yaml` | Config | Template format, paths |
| `.orchestra/progress.yaml` | Progress | Current state |

### Optional

| Input | Source | Purpose |
|-------|--------|---------|
| `--task <id>` | CLI | Override automatic task selection |
| `.orchestra/orchestrator/.orchestrator-only/verification/task-N.md` | Verification | Hidden criteria to reference |

---

## File Impact

### Created

| Path | Purpose | Created By |
|------|---------|------------|
| `.orchestra/handover/current-task.md` | Main handover (markdown format) | CLI |
| `.orchestra/orchestrator/.orchestrator-only/verification/task-N.md` | Verification (YAML format) | CLI |
| `.orchestra/handover/completion-signal.md` | Signal template for implementor | CLI |
| `.orchestra/handover/task-context.md` | Background context | CLI |
| `.orchestra/handover/verification/` | Verification folder (cleared and recreated) | CLI |
| `.orchestra/handover/preflight-checklist.yaml` | Pre-flight checklist for orchestrator | CLI |
| `.orchestra/orchestrator/.orchestrator-only/verification/preflight-task-N.yaml` | Pre-flight checklist verification (YAML format) | CLI |

### Updated

| Path | Purpose | Updated By |
|------|---------|------------|
| `.orchestra/manifest.yaml` | Task status → IMPLEMENT | CLI |
| `.orchestra/progress.yaml` | PREPARE entry added | CLI |
| `.orchestra/handover/*.yaml` | Fill in TODOs | Orchestrator Agent |

### Read

| Path | Purpose |
|------|---------|
| `.orchestra/manifest.yaml` | Task info, dependencies |
| `.orchestra/orchestra.yaml` | Configuration |
| `.orchestra/common/templates/*.hbs` | Handlebars templates |
| `.orchestra/orchestrator/.orchestrator-only/verification/task-N.md` | Reference for visible checks |
| `.orchestra/orchestrator/.orchestrator-only/verification/preflight-task-N.md` | Reference for visible checks |

### Deleted

| Path | Purpose |
|------|---------|
| `.orchestra/handover/*` | Cleared before regeneration |
| `.orchestra/handover/verification/*` | Cleared before regeneration |

---

## Template Details

### Templates Used

| Template | Converts To | Format |
|----------|-------------|--------|
| `current-task.md.hbs` | `handover/current-task.md` | Markdown |
| `completion-signal.md.hbs` | `handover/completion-signal.md` | Markdown |
| `task-context.md.hbs` | `handover/task-context.md` | Markdown |
| `orchestrator-preflight.md.hbs` | `handover/preflight-checklist.yaml` | YAML |

### Format Selection

Controlled by `--format` flag or `orchestra.yaml`:

```yaml
template:
  default_format: "yaml"  # yaml | markdown | both
```

| Format | Files Generated |
|--------|-----------------|
| `yaml` | `task-N.yaml`, `completion-signal.md`, `task-context.md` |
| `markdown` | `current-task.md`, `completion-signal.md`, `task-context.md` |
| `both` | All of the above |

---

## Git Actions

### Enforcement Levels

| Action | Level | Current State |
|--------|-------|---------------|
| Stage handover | **Recommended** | Manual |
| Commit handover | **Recommended** | Manual |

### Current Git Workflow (Manual)

```bash
# After prepare and completing handover
orchestra prepare --task 3

# Edit handover files to fill TODOs
# Then commit
git add .orchestra/handover/
git commit -m "chore(orchestra): prepare task 3"
```

---

## Outcome

### Success

| Outcome | Description |
|---------|-------------|
| Handover generated | Files created in `.orchestra/handover/` |
| Status updated | Task status changed to IMPLEMENT |
| Progress recorded | PREPARE entry in progress.yaml |

**Console Output (Success):**
```
✓ Preparing task 3: Implement core types

  Task: 3 - Implement core types (INFRASTRUCTURE)
  Status: PENDING → IMPLEMENT

  Files generated:
    + handover/task-3.yaml
    + handover/completion-signal.md
    + handover/task-context.md

  Dependencies (satisfied):
    ✓ Task 1: Initialize project (COMPLETE)
    ✓ Task 2: Create folder structure (COMPLETE)

  Next: Complete the handover content, then hand off to implementor.
```

### Failure

| Failure | Cause | Resolution |
|---------|-------|------------|
| Closeout failed | Previous task not closed | Run `orchestra closeout --fix` |
| Task in-progress | Another task is IMPLEMENT | Complete that task or use `--force` |
| Dependencies incomplete | Required tasks not COMPLETE | Complete dependencies first |
| Task not PENDING | Task already prepared/complete | Check status, select different task |

---

## Next Step

After successful prepare:

| Action | Command/Location | Purpose |
|--------|------------------|---------|
| **Complete handover** | Edit `handover/task-N.yaml` | Fill in TODOs |
| **Copy visible checks** | Manual | Add visible verification to handover |
| **Commit handover** | `git commit` | Version control |
| **Hand off to implementor** | (role switch) | Implementor reads handover |

> **Next Workflow Step**: [implement.md](implement.md) (Implementor phase)

---

## Evidence Produced

| Evidence | Location | Purpose |
|----------|----------|--------|
| Handover files | `.orchestra/handover/` | Implementor instructions |
| Handover audit | `.orchestra/orchestrator/.orchestrator-only/preflight/task-N.md` | Record of what implementor received |
| Pre-flight audit | `.orchestra/orchestrator/.orchestrator-only/preflight/preflight-task-N.yaml` | Record of orchestrator verification |
| Progress entry | `.orchestra/progress.yaml` | Audit trail |
| Status change | `.orchestra/manifest.yaml` | Task tracking |

### Verification

```bash
# Verify handover was generated
ls .orchestra/handover/

# Check task status
orchestra status

# Verify progress entry
cat .orchestra/progress.yaml
```

---

## Implementation Reference

### Source Files

| File | Purpose |
|------|---------|
| [src/commands/prepare.ts](../../src/commands/prepare.ts) | CLI command |
| [src/core/prepare.ts](../../src/core/prepare.ts) | Core logic |
| [src/core/manifest.ts](../../src/core/manifest.ts) | Manifest operations |
| [src/core/progress.ts](../../src/core/progress.ts) | Progress tracking |
| [src/core/templates.ts](../../src/core/templates.ts) | Template rendering |

### Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `runPrepare()` | prepare.ts | Main entry point |
| `selectTask()` | prepare.ts | Task selection logic |
| `validatePrepare()` | prepare.ts | Validation checks |
| `generateHandoverFiles()` | prepare.ts | File generation |
| `updateTaskStatus()` | manifest.ts | Status update |

---

## Troubleshooting

### Common Issues

#### "Closeout check failed"

```
Error: Closeout check failed for task 2. Fix issues or use --skip-closeout.
```

**Cause**: Previous task not properly closed out.

**Resolution**:
```bash
# Check what failed
orchestra closeout --verbose

# Fix issues
orchestra closeout --fix

# Then retry
orchestra prepare
```

#### "Task N is already in progress"

```
Error: Task 2 is already in progress. Complete it first or use --force.
```

**Cause**: Another task has status IMPLEMENT.

**Resolution**:
```bash
# Complete the in-progress task
orchestra verify
orchestra complete

# Or force (use with caution)
orchestra prepare --task 3 --force
```

#### "Dependency N is not complete"

```
Error: Dependency 1 is not complete (status: PENDING)
```

**Cause**: Task depends on incomplete tasks.

**Resolution**:
```bash
# Check dependency status
orchestra status

# Prepare and complete dependencies first
orchestra prepare --task 1
# ... implement task 1 ...
orchestra verify
orchestra complete

# Then prepare the dependent task
orchestra prepare --task 2
```

#### "No pending tasks available"

```
Error: No pending tasks available
```

**Cause**: All tasks are complete or in other states.

**Resolution**:
```bash
# Check sprint status
orchestra status

# If sprint complete, close it out
# If tasks need retry, check for RETRY status
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-05 | Initial creation |
