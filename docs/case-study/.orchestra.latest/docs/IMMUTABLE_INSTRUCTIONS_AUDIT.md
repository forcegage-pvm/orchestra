# Immutable Instructions Audit

**Generated**: 2025-12-02
**Purpose**: Ensure all immutable workflow instructions appear in the correct templates

---

## Definition: What is "Immutable"?

An instruction is **immutable** if:
1. It appears in process documentation (01-HANDOVER-CREATION.md or 02-TASK-VERIFICATION.md)
2. It is marked as MANDATORY, BLOCKING, or ⚠️
3. Skipping it breaks the workflow or creates risk

---

## Orchestrator Immutable Instructions

### Process 1: Handover Creation

| Step | Instruction | Location in Bible | In Template? | Status |
|------|-------------|-------------------|--------------|--------|
| 0 | Run `task-closeout-check.ps1` BEFORE anything | 01-HANDOVER-CREATION.md Step 0 | N/A (orchestrator only) | ✅ OK |
| 9 | Remove checklist before handover | 01-HANDOVER-CREATION.md Step 9 | N/A (orchestrator only) | ✅ OK |
| 12 | Direct implementor to `agent_readme.md` FIRST | 01-HANDOVER-CREATION.md Step 12 | N/A (orchestrator only) | ✅ OK |

**Conclusion**: Orchestrator steps are documented in process files, not templates. ✅

---

## Implementor Immutable Instructions

### From AGENT_README.md

| Step | Instruction | In current-task-template.md? | Status |
|------|-------------|------------------------------|--------|
| 0 | Run `validate-handover.ps1` BEFORE implementation | ✅ YES (added today) | ✅ FIXED |
| 5 | Run `pre-signal-check.ps1` BEFORE signaling | ✅ YES | ✅ OK |
| 6 | Update `completion-signal.md` | ✅ YES | ✅ OK |
| 7 | Say "ready for review" | ✅ YES | ✅ OK |

### From Process 2: Task Verification (Orchestrator expectations)

| Instruction | Reason | In Template? | Status |
|-------------|--------|--------------|--------|
| Implementor MUST run pre-signal check | Creates artifact for orchestrator | ✅ YES | ✅ OK |
| Implementor MUST update completion-signal.md | Orchestrator reads this | ✅ YES | ✅ OK |

**Conclusion**: All implementor immutable steps now in template. ✅

---

## Template Cross-Reference

### current-task-template.md Immutable Sections

| Section | Purpose | Removable? | Status |
|---------|---------|------------|--------|
| "⚠️ BEFORE YOU START - MANDATORY VALIDATION" | validate-handover.ps1 | ❌ IMMUTABLE | ✅ Present |
| "Quality Gates" | Build/test/lint requirements | ❌ IMMUTABLE | ✅ Present |
| "Completion Protocol" | pre-signal + signal steps | ❌ IMMUTABLE | ✅ Present |
| Warning footer | "Do not read .orchestrator-only/" | ❌ IMMUTABLE | ✅ Present |

### completion-signal.md.template Immutable Fields

| Field | Purpose | Removable? | Status |
|-------|---------|------------|--------|
| Task ID | Traceability | ❌ IMMUTABLE | ✅ Present |
| Status | Workflow state | ❌ IMMUTABLE | ✅ Present |
| Summary | What was done | ❌ IMMUTABLE | ✅ Present |
| Build Status | Quality gate | ❌ IMMUTABLE | ✅ Present |
| Test Status | Quality gate | ❌ IMMUTABLE | ✅ Present |

### AGENT_README.md Immutable Sections

| Section | Purpose | Removable? | Status |
|---------|---------|------------|--------|
| "0. Validate Task Structure" | First step | ❌ IMMUTABLE | ✅ Present |
| "5. Run Pre-Signal Check" | Before signaling | ❌ IMMUTABLE | ✅ Present |
| "6. Signal Completion" | Completion protocol | ❌ IMMUTABLE | ✅ Present |
| Rules section | "Do NOT read verification files" | ❌ IMMUTABLE | ✅ Present |

---

## Consistency Check: Template vs Process Docs

### Step 0: validate-handover.ps1

| Document | Mentions This? | Status |
|----------|----------------|--------|
| AGENT_README.md | ✅ Yes (Step 0) | ✅ |
| current-task-template.md | ✅ Yes ("⚠️ BEFORE YOU START") | ✅ FIXED TODAY |
| 01-HANDOVER-CREATION.md | ⚠️ No (orchestrator doesn't need to know) | ✅ OK |

### Step 5: pre-signal-check.ps1

| Document | Mentions This? | Status |
|----------|----------------|--------|
| AGENT_README.md | ✅ Yes (Step 5) | ✅ |
| current-task-template.md | ✅ Yes ("Completion Protocol") | ✅ |
| 02-TASK-VERIFICATION.md | ✅ Yes (Step 1: accept-signal checks artifact) | ✅ |

### Step 6: Update completion-signal.md

| Document | Mentions This? | Status |
|----------|----------------|--------|
| AGENT_README.md | ✅ Yes (Step 6) | ✅ |
| current-task-template.md | ✅ Yes ("Completion Protocol") | ✅ |
| completion-signal.md.template | ✅ Yes (entire template) | ✅ |

---

## Issues Found and Fixed

### Issue 1: validate-handover.ps1 Missing from Template ❌ FIXED

**Problem**: AGENT_README.md said "Step 0: Validate" but current-task-template.md didn't mention it.

**Impact**: Implementor could skip validation and work with incomplete handover.

**Fix**: Added "⚠️ BEFORE YOU START - MANDATORY VALIDATION" section to template.

**Commit**: 8da0202 (2025-12-02)

---

## Verification Checklist

When creating/updating templates, verify:

- [ ] All MANDATORY steps from AGENT_README.md are in current-task-template.md
- [ ] All required fields from process docs are in templates
- [ ] No [TODO] markers in templates
- [ ] Warning about not reading .orchestrator-only/ present
- [ ] Quality gates clearly stated
- [ ] Completion protocol is step-by-step

---

## Maintenance Protocol

**When changing immutable instructions:**

1. Update process documentation (01-HANDOVER-CREATION.md or 02-TASK-VERIFICATION.md)
2. Update AGENT_README.md if implementor-facing
3. Update templates (current-task-template.md, completion-signal.md.template)
4. Update this audit document
5. Test with a dummy task to ensure consistency

**When adding new immutable steps:**

1. Document WHY it's immutable (blocking, mandatory, etc.)
2. Add to appropriate process doc
3. Add to templates with clear marking (⚠️ or **MANDATORY**)
4. Update this audit

---

## Summary

✅ **All immutable instructions are now present in appropriate templates**

- Orchestrator immutable steps: In process docs only (don't need to be in templates)
- Implementor immutable steps: In AGENT_README.md AND current-task-template.md
- Completion protocol: Consistent across all documents

**Last audit**: 2025-12-02
**Status**: ✅ COMPLETE - All templates consistent with process documentation
