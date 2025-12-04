# Process 00: Sprint Initialization

## Overview

This process initializes a new sprint from a SpecKit specification. It creates the manifest.yaml, verification criteria, and progress tracking.

---

## 🎯 When to Execute

- Starting a brand new project with Orchestra
- Beginning a new sprint from a spec file
- Reinitializing after major spec changes

---

## ✅ Prerequisites

Before running this process:

1. **Spec file exists**: A SpecKit-compatible spec at the expected path
2. **Project workspace**: Clean working directory
3. **Orchestra CLI**: `orchestra` command available

---

## 📋 Process Steps

### Step 1: Initialize Orchestra

```powershell
# Initialize Orchestra with spec file
orchestra init --spec path/to/spec.md
```

**What this creates:**
- `.orchestra/` directory structure
- `manifest.yaml` with tasks parsed from spec
- Default templates in `common/templates/`
- This process documentation

### Step 2: Review Generated Manifest

Open `.orchestra/manifest.yaml` and verify:

```yaml
spec_path: "path/to/spec.md"
tasks:
  - id: 1
    title: "Task title from spec"
    description: "Task description"
    status: "pending"
    deliverables:
      - "Deliverable 1"
      - "Deliverable 2"
```

**Checklist:**
- [ ] All tasks from spec are present
- [ ] Task IDs are sequential
- [ ] Descriptions are accurate
- [ ] Deliverables are correct

### Step 3: Create Verification Criteria

For each task, create hidden verification criteria:

**Location:** `.orchestra/orchestrator/.orchestrator-only/verification/task-NNN.yaml`

```yaml
# Example: task-001.yaml
task_id: 1
verification:
  files_exist:
    - path/to/expected/file.dart
    - path/to/another/file.dart
  tests_pass:
    - test/unit/feature_test.dart
  code_quality:
    - no_errors: true
    - no_warnings: true
  visual_verification:
    required: false
    screenshot_path: null
```

**Important:** These criteria are HIDDEN from the implementor!

### Step 4: Verify Initialization

```powershell
# Check orchestra status
orchestra status
```

**Expected output:**
- Orchestra root found
- Manifest loaded
- Current task: 1 (or none if not started)
- Total tasks shown

---

## 🔄 After Initialization

Proceed to **Process 01: Handover Creation** to prepare the first task:

```powershell
orchestra prepare --task 1
```

---

## ⚠️ Common Issues

| Issue | Solution |
|-------|----------|
| "Already initialized" | Use `orchestra init --force` to reinitialize |
| "Spec file not found" | Check the path, ensure file exists |
| Missing tasks in manifest | Check spec format, ensure proper headers |

---

## 📁 Files Created

| File | Purpose |
|------|---------|
| `.orchestra/manifest.yaml` | Sprint task manifest |
| `.orchestra/config.json` | Orchestra configuration |
| `.orchestra/common/templates/*.hbs` | Handlebars templates |
| `.orchestra/orchestrator/readme.md` | This folder's readme |
| `.orchestra/handover/agent_readme.md` | Implementor instructions |
