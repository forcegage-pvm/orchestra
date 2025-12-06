# Process 1: Handover Creation

> **Role**: Orchestrator Agent  
> **When**: After previous task is complete OR starting a new sprint  
> **Output**: Complete handover in `.orchestra/handover/` ready for implementor

---

## Quick Reference

| Step | Action | Command |
|------|--------|---------|
| 1 | Run closeout check | `orchestra closeout` |
| 2 | Generate handover | `orchestra prepare --task N` |
| 3 | Complete handover content | Edit generated files |
| 4 | Complete pre-flight checklist | Fill `preflight-checklist.yaml` |
| 5 | Finalize handover | `orchestra prepare --finalize` |
| 6 | Commit changes | `git add -A && git commit` |
| 7 | Hand off to implementor | Direct to `agent_readme.md` |

---

## Prerequisites

Before starting, verify:

- [ ] Previous task is fully complete (or this is the first task)
- [ ] You have access to the manifest and SpecKit specs
- [ ] You are acting as the **Orchestrator** agent

---

## Step-by-Step Instructions

### STEP 1: Run Closeout Check (BLOCKING)

**⛔ DO NOT SKIP THIS STEP**

```bash
orchestra closeout
```

This verifies the previous task is properly closed:

| Check | What It Validates |
|-------|------------------|
| C1 | No uncommitted changes |
| C2 | Previous task status is COMPLETE |
| C3 | Commit hash recorded in progress.yaml |
| C4 | SpecKit tasks marked complete (if configured) |
| C5 | Completion signal cleared |
| C6 | Handover archived |

**If ANY check fails**: Fix the issue before proceeding.

```bash
# View detailed failure info
orchestra closeout --verbose

# Attempt auto-fix for common issues  
orchestra closeout --fix
```

**⛔ DO NOT PROCEED until `orchestra closeout` passes.**

---

### STEP 2: Generate Handover Files

```bash
orchestra prepare --task N
```

Replace `N` with the task ID, or omit to prepare the next pending task:

```bash
# Prepare next pending task automatically
orchestra prepare

# Prepare specific task
orchestra prepare --task 3
```

**What this generates:**

| File | Purpose |
|------|---------|
| `handover/current-task.md` | Main handover document |
| `handover/completion-signal.md` | Template for implementor to signal completion |
| `handover/task-context.md` | Background context for the task |
| `handover/preflight-checklist.yaml` | Pre-flight checklist (for you to complete) |

**What this updates:**

- `manifest.yaml` → Task status changes to `IMPLEMENT`
- `progress.yaml` → PREPARE entry added

---

### STEP 3: Complete Handover Content

The generated handover contains `# TODO:` markers. You MUST fill in all of them.

**Open and edit:**

```
.orchestra/handover/current-task.md
```

#### Required Content

| Section | What to Add |
|---------|-------------|
| **Objective** | Clear statement of what to accomplish |
| **Acceptance Criteria** | Visible criteria the implementor can verify |
| **File Operations** | Files to CREATE, MODIFY, or DELETE with full paths |
| **Test Requirements** | Test file path, specific test cases to write |
| **Implementation Details** | Code scaffolds, patterns to follow |

#### Quality Standards

| Rule | Why |
|------|-----|
| **No `# TODO:` markers remaining** | Incomplete handover causes implementor confusion |
| **All paths relative to repo root** | Avoids ambiguity |
| **CREATE files have path + purpose** | Implementor knows exactly where to create |
| **UPDATE files have exact changes** | Implementor knows what to modify |
| **Test cases have sample data** | Not just test names, but concrete objects |
| **Visual tasks have demo scaffold** | Runnable code to start from |

---

### STEP 4: Complete Pre-Flight Checklist

Open the generated checklist:

```
.orchestra/handover/preflight-checklist.yaml
```

Complete ALL checklist items honestly:

```yaml
checklist:
  - id: PRE-01
    item: "Closeout check passed"
    status: PASS  # PASS | FAIL | N/A
    
  - id: PRE-02
    item: "All TODO markers filled"
    status: PASS
    
  - id: PRE-03
    item: "File paths unambiguous"
    status: PASS
    
  # ... complete all items
```

**Every item must be PASS or N/A with reason.** If anything is FAIL, go back and fix it.

---

### STEP 5: Finalize Handover

After completing the handover content and pre-flight checklist:

```bash
orchestra prepare --finalize
```

**What this does:**

1. **Archives the handover** for audit trail:
   ```
   handover/current-task.md → orchestrator/.orchestrator-only/preflight/task-N.md
   ```

2. **Archives the checklist** for accountability:
   ```
   handover/preflight-checklist.yaml → orchestrator/.orchestrator-only/preflight/preflight-task-N.yaml
   ```

This creates a record of exactly what the implementor received.

---

### STEP 6: Commit Changes

Stage and commit the handover:

```bash
git add -A
git commit -m "chore(orchestra): prepare task N handover"
```

---

### STEP 7: Hand Off to Implementor

Direct the implementor to the entry point:

> **"Read `.orchestra/handover/agent_readme.md` and complete your task."**

**⚠️ IMPORTANT**: Always point to `agent_readme.md` first, NOT `current-task.md` directly.

This ensures:
- Consistent onboarding for new or continuing agents
- The implementor follows the correct workflow
- Context is provided before diving into task details

---

## Verification Criteria (HIDDEN)

As orchestrator, you may also need to create hidden verification criteria:

```
.orchestra/orchestrator/.orchestrator-only/verification/task-N.yaml
```

This file contains:
- Verification commands to run
- Expected outputs  
- Pass/fail thresholds
- Screenshot verification (for visual tasks)

**⛔ The implementor must NEVER see this file.** That's the purpose of hidden verification - the implementor cannot game the acceptance criteria.

---

## Quality Checklist: "Could a Fresh Agent Complete This?"

Before handing off, ask yourself:

| Check | Question |
|-------|----------|
| **Paths clear?** | Are ALL file paths relative to repo root? |
| **CREATE files?** | Path, purpose, AND export location specified? |
| **UPDATE files?** | Exact methods/changes listed with code scaffold? |
| **Tests specified?** | Concrete test data objects, not just test names? |
| **Visual tasks?** | Runnable demo scaffold included? |
| **Anti-patterns?** | Both what TO do and what NOT to do clear? |

### The 100% Rule

**85% complete is NOT complete.**

If the implementor might need to ask "where does this go?" or "what should this look like?" → the handover is incomplete. Go back and add specifics.

---

## Common Mistakes

| Mistake | Why It's Bad | Fix |
|---------|--------------|-----|
| Skip closeout check | Previous task incomplete | Always run STEP 1 |
| Leave TODO markers | Implementor confused | Fill every marker |
| Vague file references | Implementor guesses wrong | Use full paths |
| Test names only | No concrete data | Add sample objects |
| "Create demo" only | No starting point | Add full code scaffold |
| Skip finalize | No audit trail | Run STEP 5 |

---

## CLI Commands Reference

| Command | Purpose |
|---------|---------|
| `orchestra closeout` | Verify previous task closed |
| `orchestra closeout --fix` | Auto-fix closeout issues |
| `orchestra prepare` | Generate handover for next task |
| `orchestra prepare --task N` | Generate handover for specific task |
| `orchestra prepare --dry-run` | Preview without generating |
| `orchestra prepare --finalize` | Archive handover for audit |
| `orchestra status` | Check current sprint/task status |

---

## See Also

- [Process 0: Sprint Initialization](./00-sprint-initialization.md)
- [Process 2: Task Verification](./02-task-verification.md)
- [Orchestrator README](../readme.md)
