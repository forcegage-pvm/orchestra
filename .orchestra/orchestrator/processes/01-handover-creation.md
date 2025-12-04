# Process 01: Handover Creation

## Overview

This process prepares the handover package for the next task. It verifies the previous task is closed out, generates task context, and creates the handover documents.

---

## 🎯 When to Execute

- After completing Process 00 (Sprint Init)
- After completing Process 02 (Task Verification) for previous task
- Before delegating to implementor agent

---

## ✅ Prerequisites

Before running this process:

1. **Previous task closed** (if not first task)
2. **Manifest exists** with task definitions
3. **Verification criteria created** for target task

---

## 📋 Process Steps

### Step 1: Run Closeout Check (Skip for First Task)

If this is NOT the first task:

```powershell
# Verify previous task is properly closed
orchestra closeout
```

**Expected:** "Previous task properly closed" or similar success message

**If closeout fails:**
- Return to Process 02 to complete verification
- Do NOT proceed until previous task is archived

### Step 2: Prepare Handover

```powershell
# Generate handover for next task
orchestra prepare --task <N>
```

**Replace `<N>` with the task number (1, 2, 3, etc.)**

**What this creates:**
- `.orchestra/handover/current-task.md` - Task details for implementor
- `.orchestra/handover/task-context.md` - Additional context (optional)

### Step 3: Validate Handover Package

Check the generated files:

```powershell
# View the current task file
Get-Content .orchestra/handover/current-task.md
```

**Checklist:**
- [ ] Task title matches manifest
- [ ] Description is clear
- [ ] Deliverables are listed
- [ ] Dependencies noted (if any)

### Step 4: Review Hidden Verification Criteria

As orchestrator, verify the criteria file exists:

```powershell
# Check verification criteria (DO NOT share with implementor!)
Test-Path .orchestra/orchestrator/.orchestrator-only/verification/task-<NNN>.yaml
```

**This file is HIDDEN from the implementor.** Do not reveal its contents.

### Step 5: Update Manifest Status

The `orchestra prepare` command should update the manifest:

```yaml
tasks:
  - id: N
    status: "in-progress"  # Changed from "pending"
```

Verify this change occurred.

---

## 🚀 Delegating to Implementor

### Start New Session

**CRITICAL:** Start a FRESH session for the implementor agent.

Do NOT use the same session as the orchestrator - this prevents:
- Implementor seeing verification criteria
- Pattern learning across tasks
- Context contamination

### Invocation Script

Tell the implementor:

> Read `.orchestra/handover/agent_readme.md` and begin Task N.

Or if more context needed:

> Read `.orchestra/handover/agent_readme.md` first, then `.orchestra/handover/current-task.md`. 
> Complete all deliverables and signal when ready for verification.

---

## ⚠️ Common Issues

| Issue | Solution |
|-------|----------|
| "Previous task not closed" | Run `orchestra complete --task <prev>` first |
| "Task not found" | Check manifest.yaml for task ID |
| "Template not found" | Run `orchestra init` to regenerate templates |

---

## 🔄 After Handover

Wait for implementor to:
1. Read agent_readme.md
2. Read current-task.md
3. Implement deliverables
4. Generate completion-signal.md

When implementor signals completion, proceed to **Process 02: Task Verification**.

---

## 📁 Files Modified

| File | Change |
|------|--------|
| `.orchestra/handover/current-task.md` | Created/updated |
| `.orchestra/handover/task-context.md` | Created (optional) |
| `.orchestra/manifest.yaml` | Task status → "in-progress" |
