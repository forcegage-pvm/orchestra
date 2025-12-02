# Process 1: Handover Creation (Pre-Flight Protocol)

⚠️ **WHEN TO USE**: When preparing the NEXT task for the implementor to work on.

---

## Overview

This process prepares a complete handover package so an implementor (potentially a NEW agent with zero context) can execute the task autonomously without asking questions.

**Trigger**: Previous task is complete OR starting a new sprint
**Output**: Complete `handover/current-task.md` ready for implementor

---

## Prerequisites

Before starting this process, you MUST have:
- [ ] Previous task fully closed out (or this is first task)
- [ ] Access to manifest.yaml for task details
- [ ] Access to SpecKit tasks.md for requirements

---

## Step-by-Step Instructions

### ⚠️ STEP 0: Run Task Closeout Check (BLOCKING)

**This step is MANDATORY. Do NOT skip it.**

```powershell
# Source the environment FIRST
. .\.orchestra\common\scripts\set-env.ps1

# Run the closeout check
.\.orchestra\orchestrator\scripts\task-closeout-check.ps1
```

**What this checks:**
- ✅ No uncommitted changes in repo
- ✅ Previous task marked COMPLETED in progress.yaml
- ✅ Previous task has commit hash recorded
- ✅ SpecKit tasks.md updated with checkmarks
- ✅ Verification results recorded
- ✅ Screenshot exists (if visual task)
- ✅ Sprint tests still pass
- ✅ completion-signal.md is cleared
- ✅ task-context.md reflects current phase

**If ANY check fails**: Fix the issues BEFORE proceeding. Use `-Fix` flag for auto-fixable issues:
```powershell
.\.orchestra\orchestrator\scripts\task-closeout-check.ps1 -Fix
```

**⛔ DO NOT PROCEED UNTIL THIS SCRIPT PASSES**

---

### STEP 1: Read This Documentation

```
READ `.orchestra/orchestrator/processes/01-HANDOVER-CREATION.md` (this file)
```

Do NOT rely on memory. Re-read this process every time.

---

### STEP 2: Delete Old Task Handover

```powershell
Remove-Item ".orchestra/handover/current-task.md" -Force -ErrorAction SilentlyContinue
```

**Why**: Prevents contamination from previous task content. Forces fresh start.

---

### STEP 3: Copy Template

```powershell
Copy-Item ".orchestra/common/templates/current-task-template.md" ".orchestra/handover/current-task.md"
```

---

### STEP 4: Gather Task Information

Read these files to understand the next task:

1. **Manifest**: `.orchestra/orchestrator/.orchestrator-only/manifest.yaml`
   - Find the next pending task
   - Note the task ID, title, category, speckit_tasks

2. **SpecKit tasks.md**: `specs/<sprint>/tasks.md`
   - Read detailed requirements for referenced tasks
   - Gather acceptance criteria

3. **SpecKit contracts**: `specs/<sprint>/contracts/*.dart`
   - Reference exact code structures to follow

---

### STEP 5: Fill Template Completely

Fill EVERY section in `current-task.md` with either:
- **Actual content**, OR
- **`[N/A - Reason: explanation]`**

**⛔ No `[TODO]` markers may remain in the final version.**

#### Template Sections Checklist

| Section | Required Content |
|---------|------------------|
| Task Overview | Title, ID, category, objectives |
| SpecKit Traceability | Task IDs being covered, spec references |
| Deliverables | Files to CREATE (with paths) AND files to MODIFY |
| Technical Context | Relevant code structures, dependencies |
| TDD Requirements | Test file paths, sample test data objects |
| Code Scaffolds | Copy-paste ready code snippets |
| Visual Verification | REQUIRED if INTEGRATION/VISUAL task |
| Quality Gates | Test commands, analyze commands |
| Completion Protocol | How to signal completion |

---

### STEP 6: Create Verification Criteria (HIDDEN)

Create the verification file that will be used to verify this task:

```
CREATE `.orchestra/orchestrator/.orchestrator-only/verification/task-XXX.yaml`
```

This file contains:
- All verification commands to run
- Expected outputs
- Severity levels (BLOCKING, MAJOR, MINOR, INFO)
- Screenshot verification criteria (if visual task)

**⛔ Implementor must NEVER see this file - that's the point of hidden verification.**

---

### STEP 6a: Validate Verification Paths (MANDATORY)

**After creating verification YAML, immediately validate all file paths:**

```powershell
.\.orchestra\orchestrator\scripts\validate-verification-paths.ps1 -TaskId XXX
```

**If validation FAILS:**
- Script shows which paths are wrong
- Script suggests correct paths if found
- Run with `-Fix` to auto-correct: `.\.orchestra\orchestrator\scripts\validate-verification-paths.ps1 -TaskId XXX -Fix`

**Why this matters:**
- Specs may have outdated paths
- Copy-paste errors happen
- Saves time catching errors BEFORE implementor starts work

**⛔ DO NOT PROCEED with handover if path validation fails**

---

### STEP 7: Complete Pre-Flight Checklist

The template contains a pre-flight checklist section. Complete it honestly:

```markdown
## Pre-Flight Checklist (ORCHESTRATOR ONLY - DELETE BEFORE HANDOFF)

- [ ] Task closeout check passed
- [ ] Read this documentation (not from memory)
- [ ] Deleted old current-task.md
- [ ] Copied fresh template
- [ ] All sections filled (content or N/A with reason)
- [ ] File paths are unambiguous (relative to repo root)
- [ ] CREATE files have: path, purpose, export location
- [ ] UPDATE files have: exact methods/changes, code scaffold
- [ ] TDD has sample data objects (not just test names)
- [ ] INTEGRATION/VISUAL has runnable demo scaffold
- [ ] Verification YAML created with criteria
```

---

### STEP 8: Save Audit Trail

Copy the completed checklist to create accountability:

```powershell
Copy-Item ".orchestra/handover/current-task.md" ".orchestra/orchestrator/.orchestrator-only/preflight/orchestrator-preflight-XXX.md"
```

(Or just copy the checklist section)

---

### STEP 9: Remove Checklist from Handover

Delete the pre-flight checklist section from `current-task.md` before implementor sees it.

The implementor should receive a clean task document without orchestrator meta-information.

---

### STEP 10: Clear Completion Signal

```powershell
Remove-Item ".orchestra/handover/completion-signal.md" -Force -ErrorAction SilentlyContinue
```

Ensures no stale completion signals exist.

---

### STEP 11: Run Handover Validation (Optional but Recommended)

```powershell
.\.orchestra\orchestrator\scripts\handover-validate.ps1
```

This validates that the handover is complete and actionable.

---

### STEP 12: Invoke Implementor

Tell the implementor:

> **"Read `.orchestra/handover/agent_readme.md` and complete your task"**

**⚠️ IMPORTANT**: Always direct to `agent_readme.md` FIRST, not `current-task.md`.
This ensures consistent onboarding whether same agent or new agent after handover.

---

## Quality Checklist: "Could a Fresh Agent Complete This?"

Before invoking implementor, ask yourself:

| Check | Question |
|-------|----------|
| **File paths unambiguous** | Are ALL paths relative to repo root? No ambiguity? |
| **CREATE files clear** | Path, purpose, AND export location specified? |
| **UPDATE files specific** | Exact methods/changes listed? Code scaffold provided? |
| **TDD has sample data** | Concrete test objects provided (not just test names)? |
| **Visual task has demo** | Runnable demo scaffold code included? |
| **Anti-patterns explicit** | What to do AND what NOT to do clear? |

### The 100% Rule

**85% complete is NOT complete.** 

If the implementor might need to ask "where does this go?" or "what should this look like?" → the handover is incomplete. Go back and add specifics.

---

## Common Mistakes to Avoid

| Mistake | Why It's Bad | Fix |
|---------|--------------|-----|
| Skip closeout check | Previous task incomplete | Always run Step 0 |
| Reuse old current-task.md | Contamination | Always delete first |
| Vague "UPDATE: Use X" | Implementor guesses | Add integration scaffold |
| Test names only | No concrete data | Add sample test objects |
| "Create demo" only | No code to start from | Add full runnable scaffold |
| Skip verification YAML | No way to verify | Create before handoff |

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `task-closeout-check.ps1` | Verify previous task fully closed |
| `handover-validate.ps1` | Validate current-task.md completeness |
| `task-coverage.ps1` | Verify SpecKit ↔ Orchestrator sync |

---

## See Also

- [Process 2: Task Verification](./02-TASK-VERIFICATION.md)
- [Main Orchestrator README](../readme.md)
- [Folder Structure](../../docs/readme.md)
