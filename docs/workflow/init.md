# Initialize Sprint

> **Phase**: INIT  
> **CLI Command**: `orchestra init`  
> **Source**: [src/commands/init.ts](../../src/commands/init.ts)

---

## Index

- [Overview](#overview)
- [Purpose](#purpose)
- [Philosophy](#philosophy)
- [Actions](#actions)
- [Execution Sequence](#execution-sequence)
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
| **Phase** | INIT |
| **Role** | Orchestrator or Human |
| **Trigger** | New sprint needs to start in a project |
| **Preconditions** | Project directory exists; no `.orchestra/` folder (or `--force` flag used) |

---

## Purpose

Initialize the Orchestra folder structure and configuration files in a project. This step establishes the workspace where:

1. **Orchestrator workspace** is created with hidden verification folders
2. **Implementor workspace** is created for artifacts
3. **Handover zone** is created as the neutral communication channel
4. **Templates** are copied for handover and verification generation
5. **Configuration** is established for the sprint

This is the foundational step that must occur before any task orchestration can begin.

---

## Philosophy

The initialization step creates the **physical separation of concerns** that enables the hidden verification pattern. 

### Why This Matters

Orchestra's core anti-pattern prevention relies on **asymmetric information**:
- The orchestrator knows how verification will work
- The implementor does NOT know how verification will work
- This prevents "teaching to the test" and ensures genuine implementation

By creating distinct folder structures:
- `.orchestra/orchestrator/.orchestrator-only/` - Orchestrator secrets (verification criteria)
- `.orchestra/handover/` - Shared communication zone
- `.orchestra/implementor/` - Implementor's workspace

We create a **trust boundary** that is enforced by convention (and can be audited).

### Anti-Patterns This Prevents

| Anti-Pattern | How Init Prevents It |
|--------------|---------------------|
| Gaming verification criteria | Hidden criteria stored in `.orchestrator-only/` |
| Context pollution | Separate workspaces for each role |
| Unstructured communication | Formal handover folder for all role-to-role communication |
| Missing audit trail | Preflight and results folders for documentation |

---

## Actions

> Quick reference for all actions in this workflow step.  
> Use Action IDs to reference specific actions in other sections.

### CLI Actions

| ID | Action | Command |
|----|--------|--------|
| A-INIT-01 | Initialize Orchestra | `orchestra init` |
| A-INIT-02 | Initialize with spec | `orchestra init --spec <path>` |
| A-INIT-03 | Force reinitialize | `orchestra init --force` |
| A-INIT-04 | Preview initialization | `orchestra init --dry-run` |
| A-INIT-05 | Validate result | `orchestra status` |

### Agent Actions

| ID | Role | Action |
|----|------|--------|
| A-INIT-06 | Orchestrator | Run init command |
| A-INIT-07 | Orchestrator | Verify folder structure |

### Manual Actions

| ID | Role | Action | Notes |
|----|------|--------|-------|
| A-INIT-08 | Human | Edit manifest.yaml | See [configure-manifest.md](configure-manifest.md) |
| A-INIT-09 | Human | Review orchestra.yaml | Verify configuration |

### Git Actions

| ID | Action | Level | Command |
|----|--------|-------|--------|
| A-INIT-10 | Stage .orchestra/ | Guideline | `git add .orchestra/` |
| A-INIT-11 | Commit initialization | Guideline | `git commit -m "chore(orchestra): initialize"` |

---

## Execution Sequence

The complete ordered execution of this workflow step:

| Order | Action ID | Type | Action |
|-------|-----------|------|--------|
| 1 | A-INIT-01 | CLI | `orchestra init` (or A-INIT-02/03/04 variant) |
| 2 | A-INIT-07 | Agent | Verify folder structure |
| 3 | A-INIT-05 | CLI | `orchestra status` |
| 4 | A-INIT-08 | Manual | Edit manifest.yaml (add real tasks) |
| 5 | A-INIT-09 | Manual | Review orchestra.yaml |
| 6 | A-INIT-10 | Git | Stage .orchestra/ |
| 7 | A-INIT-11 | Git | Commit initialization |

---

## CLI Command

```bash
orchestra init [options]
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--spec <path>` | string | none | Path to SpecKit spec file for auto-population of manifest |
| `--force` | boolean | false | Reinitialize even if `.orchestra/` already exists |
| `--dry-run` | boolean | false | Show what would be created without actually creating |
| `--json` | boolean | false | Output results as JSON |

### Examples

```bash
# Basic initialization
orchestra init

# Initialize with spec file
orchestra init --spec ./spec/requirements.md

# Reinitialize existing project
orchestra init --force

# Preview what would be created
orchestra init --dry-run

# JSON output for scripting
orchestra init --json
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Already initialized (use --force) |
| 2 | File system error |

---

## Input

### Required

None - this command can run with no arguments.

### Optional

| Input | Source | Purpose |
|-------|--------|---------|
| `--spec` path | Command line | Auto-populate manifest from SpecKit spec |
| Project directory | Current working directory | Where to create `.orchestra/` |

---

## File Impact

### Created

#### Folders

| Path | Purpose | Access |
|------|---------|--------|
| `.orchestra/` | Root Orchestra folder | All roles |
| `.orchestra/common/` | Shared resources | All roles |
| `.orchestra/common/templates/` | Handlebars templates for generation | All roles |
| `.orchestra/orchestrator/` | Orchestrator workspace | Orchestrator only |
| `.orchestra/orchestrator/.orchestrator-only/` | **HIDDEN** - Never accessed by implementor | Orchestrator only |
| `.orchestra/orchestrator/.orchestrator-only/verification/` | Hidden verification criteria storage | Orchestrator only |
| `.orchestra/orchestrator/.orchestrator-only/preflight/` | Orchestrator audit trails | Orchestrator only |
| `.orchestra/orchestrator/processes/` | Process documentation | Orchestrator only |
| `.orchestra/orchestrator/results/` | Verification results | Orchestrator only |
| `.orchestra/handover/` | Neutral zone for role communication | All roles |
| `.orchestra/implementor/` | Implementor workspace | Implementor |
| `.orchestra/implementor/artifacts/` | Work products and outputs | Implementor |

#### Files

| Path | Purpose | Source |
|------|---------|--------|
| `.orchestra/orchestra.yaml` | Configuration file | Generated with defaults |
| `.orchestra/manifest.yaml` | Sprint and task definitions | Generated as placeholder |

#### Templates Copied

These Handlebars (`.hbs`) template files are copied from the **template repository** to `.orchestra/common/templates/`.

> **Template Repository Location**: [`templates/`](../../templates/)  
> This folder in the Orchestra package root is the **source of truth** for all templates.  
> Templates are organized by role: `common/`, `orchestrator/`, `implementor/`, `handover/`.

| Template File | Purpose | Used By |
|---------------|---------|---------|
| `current-task.md.hbs` | Main handover document template | `orchestra prepare` |
| `completion-signal.md.hbs` | Signal template for implementor | `orchestra prepare` |
| `task-context.md.hbs` | Background context template | `orchestra prepare` |
| `feedback.md.hbs` | Retry guidance template | `orchestra feedback` |
| `task-results.md.hbs` | Task completion results | `orchestra complete` |
| `orchestrator-preflight.md.hbs` | Orchestrator audit trail | `orchestra prepare` |
| `verification-criteria.yaml.hbs` | Hidden verification checks | `orchestra prepare` |

#### Process Documentation Copied

These files are copied to `.orchestra/orchestrator/processes/`:

| File | Purpose |
|------|---------|
| `00-sprint-initialization.md` | How to initialize and configure a sprint |
| `01-handover-creation.md` | How to prepare task handovers |
| `02-task-verification.md` | How to verify completed tasks |

#### Readme Files Copied

| Path | Purpose |
|------|---------|
| `.orchestra/handover/agent_readme.md` | Instructions for implementor role |
| `.orchestra/orchestrator/readme.md` | Instructions for orchestrator role |
| `.orchestra/implementor/readme.md` | Additional implementor guidance |

### Updated

N/A - This step creates new files only.

### Read

N/A - This step does not read existing files.

### Deleted

N/A - This step does not delete files.

### Generated Files Detail

#### orchestra.yaml

The configuration file is **generated programmatically** (not from a template) with default settings from `DEFAULT_CONFIG` in `src/core/types.ts`.

> **`--spec` Behavior**: When `--spec <path>` is provided, the `spec_path` field is added to the configuration.  
> When `--spec` is omitted, no `spec_path` field is included and you must add it manually if needed.

```yaml
# Orchestra Configuration
# Generated by: orchestra init
# Version: 1.0.0

version: "1.0.0"

# Only present if --spec was provided:
# spec_path: "./spec/requirements.md"

# Paths configuration (relative to .orchestra/)
paths:
  manifest: "manifest.yaml"
  handovers: "handover"
  feedback: "handover/feedback"
  artifacts: "artifacts"
  templates: "common/templates"

# Template format preference
output:
  format: "markdown"  # Options: yaml, markdown, both
  
# Verification settings
verification:
  max_retries: 3
  require_visual: false
```

#### manifest.yaml (Placeholder)

The placeholder manifest that must be edited:

```yaml
# Orchestra Sprint Manifest
# Edit this file to define your sprint and tasks
# See: docs/workflow/configure-manifest.md

version: "1.0.0"

sprint:
  id: "sprint-001"
  name: "Sprint Name - Edit This"
  status: "ACTIVE"
  created_at: "2025-12-05T00:00:00.000Z"

# Define your tasks here
# Each task needs: id, title, and optionally dependencies
tasks:
  - id: 1
    title: "Example Task - Replace with real tasks"
    description: "This is a placeholder. Edit manifest.yaml to add your tasks."
    status: "PENDING"
    category: "INFRASTRUCTURE"
    dependencies: []
```

---

## Template Details

### Current State

| Template | Converts To | When Used |
|----------|-------------|----------|
| N/A | N/A | Templates are copied as-is during init, not rendered |

**Note**: During `init`, templates are copied verbatim to `.orchestra/common/templates/`. The `manifest.yaml` and `orchestra.yaml` files are currently generated programmatically.

### Future State (Pending TD-003)

Once [TD-003: Template-Based Config Generation](technical-debt.md#td-003-template-based-config-generation) is implemented:

| Template | Converts To | When Used |
|----------|-------------|----------|
| `manifest.yaml.hbs` | `.orchestra/manifest.yaml` | Sprint manifest with dynamic date, spec path |
| `orchestra.yaml.hbs` | `.orchestra/orchestra.yaml` | Configuration with defaults |

---

## Git Actions

### Enforcement Levels

Git actions can have different enforcement levels:

| Level | Meaning | CLI Behavior |
|-------|---------|-------------|
| **Guideline** | Suggested best practice | No CLI action, documentation only |
| **Recommended** | Strongly encouraged | CLI emits reminder, no automatic action |
| **Mandatory** | Required for workflow integrity | CLI warns if not done, blocks next step |
| **Enforced** | CLI executes automatically | CLI runs git command, fails if git unavailable |

### Actions for This Step

| Action | Level | Current State | Notes |
|--------|-------|---------------|-------|
| Stage `.orchestra/` | **Guideline** | Manual | Could be Enforced after TD-001 |
| Commit `.orchestra/` | **Guideline** | Manual | User should commit after editing manifest |
| Add to `.gitignore` | **Guideline** | Manual | Team preference |

> **Technical Debt**: See [TD-001: Git Actions CLI Automation](technical-debt.md#td-001-git-actions-cli-automation)  
> Future implementation may elevate these to Recommended or Enforced levels with CLI flags.

### Current Git Workflow (Manual)

```bash
# After init
orchestra init

# Edit manifest with real tasks
# Then commit
git add .orchestra/
git commit -m "chore(orchestra): initialize sprint structure"
```

### Future Git Workflow (After TD-001)

```bash
# Auto-stage after init
orchestra init --git-stage

# Auto-commit with conventional message
orchestra init --git-commit

# Or configure in orchestra.yaml for all commands
```

### .gitignore Considerations

Some files should potentially be ignored:

```gitignore
# Optional: Ignore ephemeral handover content
.orchestra/handover/current-task.md
.orchestra/handover/completion-signal.md
.orchestra/handover/verification/

# Optional: Ignore local artifacts
.orchestra/implementor/artifacts/
```

---

## Outcome

### Success

| Outcome | Description |
|---------|-------------|
| `.orchestra/` folder created | Complete folder structure with all subfolders |
| All templates copied | Templates ready for `orchestra prepare` |
| Configuration created | Sprint ready for task preparation |

**Console Output (Success):**
```
✓ Orchestra initialized successfully!

Created:
  ✓ .orchestra/
  ✓ .orchestra/orchestra.yaml
  ✓ .orchestra/manifest.yaml
  ✓ 7 templates copied to common/templates/
  ✓ 3 process documents copied
  ✓ 3 readme files copied

Next: Edit .orchestra/manifest.yaml to define your sprint and tasks
Then: Run 'orchestra status' to verify configuration
```

### Failure

| Failure | Cause | Resolution |
|---------|-------|------------|
| "Already initialized" | `.orchestra/` exists | Use `--force` to reinitialize |
| "Templates not found" | Package installation issue | Reinstall orchestra package |
| "Permission denied" | File system permissions | Check directory write permissions |
| "Invalid spec file" | `--spec` path doesn't exist | Verify spec file path |

**Console Output (Already Initialized):**
```
✗ Orchestra already initialized in this directory.
  Use --force to reinitialize.
  Path: /project/.orchestra
```

---

## Next Step

After successful initialization:

| Action | Command/Location | Purpose |
|--------|------------------|--------|
| **Edit manifest** | `.orchestra/manifest.yaml` | Define your sprint tasks |
| **Verify setup** | `orchestra status` | Confirm configuration is valid |
| **Check guidance** | `orchestra next` | Get context-aware next action |

> **`orchestra next` Command**: Run this at any point to get guidance on what to do next.  
> If there are errors (e.g., invalid manifest), `next` will show the error and how to resolve it.  
> See [Technical Debt: orchestra next](technical-debt.md#orchestra-next-command) for implementation status.

---

## Evidence Produced

After successful execution, these artifacts prove the step completed correctly:

### Verification Checklist

- [ ] `.orchestra/` folder exists
- [ ] `.orchestra/orchestra.yaml` contains valid YAML with version field
- [ ] `.orchestra/manifest.yaml` exists (placeholder or populated)
- [ ] `.orchestra/common/templates/` contains 7 `.hbs` files
- [ ] `.orchestra/orchestrator/.orchestrator-only/` folder exists
- [ ] `.orchestra/handover/` folder exists
- [ ] `.orchestra/implementor/artifacts/` folder exists

### Programmatic Verification

```bash
# Verify initialization
orchestra status
# Should output initialization status, not "not initialized" error
```

### JSON Output for Scripting

```bash
orchestra init --json
```

```json
{
  "success": true,
  "created": {
    "root": ".orchestra/",
    "folders": 11,
    "templates": 7,
    "configs": 2
  },
  "next_step": "Edit manifest.yaml to define sprint and tasks"
}
```

---

## Implementation Reference

### Source Files

| File | Purpose |
|------|---------|
| [src/commands/init.ts](../../src/commands/init.ts) | CLI command definition and execution |
| [src/core/config.ts](../../src/core/config.ts) | Configuration handling |
| [templates/](../../templates/) | Source templates copied during init |

### Key Functions

From `src/commands/init.ts`:

| Function | Purpose |
|----------|---------|
| `initCommand()` | Creates the Commander.js command |
| `runInit(options)` | Main execution logic |
| `getTemplatesDir()` | Locates package templates |

### Constants

From `src/commands/init.ts`:

```typescript
// Folders created during initialization
const DEFAULT_FOLDERS = [
  "common/templates",
  "orchestrator/.orchestrator-only/verification",
  "orchestrator/.orchestrator-only/preflight",
  "orchestrator/processes",
  "orchestrator/results",
  "handover",
  "implementor/artifacts",
];

// Template file mappings
const TEMPLATE_MAPPINGS = [
  { src: "common/templates/current-task.md.hbs", dest: "common/templates/current-task.md.hbs" },
  { src: "common/templates/completion-signal.md.hbs", dest: "common/templates/completion-signal.md.hbs" },
  // ... etc
];
```

---

## Troubleshooting

### Common Issues

| Issue | Symptom | Solution |
|-------|---------|----------|
| Missing templates | `orchestra prepare` fails with "template not found" | Reinitialize with `--force` |
| Corrupt manifest | `orchestra status` shows YAML errors | Delete manifest.yaml, reinitialize |
| Permission errors | "EACCES" or "Permission denied" | Check folder permissions, run as appropriate user |

### Recovery

```bash
# Full reset
rm -rf .orchestra
orchestra init

# Partial reset (keep manifest)
cp .orchestra/manifest.yaml ./manifest-backup.yaml
rm -rf .orchestra
orchestra init
cp ./manifest-backup.yaml .orchestra/manifest.yaml
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-05 | Initial specification |

---

*This document is part of the [Orchestra Workflow Specification](workflow.md).*
