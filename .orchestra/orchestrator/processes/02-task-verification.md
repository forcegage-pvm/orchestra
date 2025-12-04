# Process 02: Task Verification

## Overview

This process verifies an implementor's completed work against hidden criteria, accepts or rejects the submission, and archives completed tasks.

---

## 🎯 When to Execute

- Implementor says "ready for review" or "task complete"
- Completion signal file exists
- All deliverables claimed complete

---

## ✅ Prerequisites

Before running this process:

1. **Completion signal exists**: `.orchestra/handover/completion-signal.md`
2. **Implementor claims complete**: Deliverables checklist filled
3. **Verification criteria exist**: Hidden YAML for this task

---

## 📋 Process Steps

### Step 1: Check for Completion Signal

```powershell
# Verify completion signal exists
orchestra accept-signal
```

**Expected:** "Completion signal found" or similar success

**If signal missing:**
- Tell implementor to generate completion-signal.md
- They may have said "done" without actually signaling
- Do NOT proceed without the signal file

### Step 2: Load Hidden Verification Criteria

As orchestrator, read the hidden criteria:

```powershell
# Read verification criteria (NEVER show to implementor!)
Get-Content .orchestra/orchestrator/.orchestrator-only/verification/task-<NNN>.yaml
```

**Keep this information HIDDEN.** You will verify against it without revealing what you're checking.

### Step 3: Run Verification

```powershell
# Execute verification checks
orchestra verify --task <N>
```

**This command checks:**
- Files exist as specified
- Tests pass (if specified)
- Code quality (if specified)

### Step 4: Execute Each Criterion

For each item in the verification criteria:

#### 4a. File Existence Checks

```powershell
# Check each required file exists
Test-Path path/to/expected/file.dart
```

#### 4b. Test Execution

```powershell
# Run specified tests
flutter test test/unit/feature_test.dart
```

#### 4c. Code Quality

```powershell
# Run analyzer on touched files
flutter analyze lib/path/to/files/
```

**Required:** No errors, no warnings

#### 4d. Visual Verification (if required)

If verification criteria specify visual verification:

1. Check screenshot exists at specified path
2. Open screenshot via Chrome DevTools MCP:
   ```
   mcp_chrome-devtoo_new_page(url: "file:///path/to/screenshot.png")
   mcp_chrome-devtoo_take_screenshot()
   ```
3. Analyze returned image against visual criteria
4. Close browser page when done

---

## ✅ PASS Decision

If ALL criteria pass:

### Step 5a: Complete the Task

```powershell
# Archive and close out the task
orchestra complete --task <N>
```

**What this does:**
- Moves task status to "completed"
- Archives artifacts to `orchestrator/results/task-NNN/`
- Removes completion-signal.md from handover/
- Updates manifest.yaml

### Step 5b: Proceed to Next Task

Return to **Process 01: Handover Creation** for the next task:

```powershell
orchestra prepare --task <N+1>
```

---

## ❌ FAIL Decision

If ANY criterion fails:

### Step 5a: Provide Feedback

Tell the implementor WHAT failed, but NOT HOW you detected it:

**Good feedback examples:**
- "The feature doesn't handle edge case X"
- "Test coverage is incomplete for Y scenario"
- "Visual appearance doesn't match requirements"

**Bad feedback examples (reveals criteria):**
- "The file at path/to/specific/file.dart is missing" ❌
- "The verification YAML says you need X" ❌
- "You failed check #3 in my hidden criteria" ❌

### Step 5b: Request Retry

Tell implementor:

> Some issues were found. Please address the feedback and signal completion again when ready.

### Step 5c: Wait for New Signal

Do NOT re-verify until:
- Implementor acknowledges the feedback
- Implementor makes changes
- Implementor generates NEW completion-signal.md

---

## ⚠️ Common Issues

| Issue | Solution |
|-------|----------|
| "Completion signal not found" | Tell implementor to create it |
| "Verification criteria missing" | Create criteria in Process 00 |
| Partial pass | Fail the whole task, provide feedback |
| Implementor disputes result | Verify again, check criteria are fair |

---

## 🔐 Security Reminders

1. **NEVER reveal verification criteria** - Prevents gaming
2. **NEVER show file paths from criteria** - Use general descriptions
3. **NEVER share the .orchestrator-only folder** - Keep it hidden
4. **Fresh session for next task** - Prevent pattern learning

---

## 📁 Files Modified on PASS

| File | Change |
|------|--------|
| `.orchestra/manifest.yaml` | Task status → "completed" |
| `.orchestra/handover/completion-signal.md` | Deleted (archived) |
| `.orchestra/orchestrator/results/task-NNN/` | Created with archives |

---

## 🔄 Verification Complete

After verification:
- **PASS**: Proceed to Process 01 for next task
- **FAIL**: Wait for implementor retry, then re-verify

The cycle continues until all tasks in the manifest are completed.
