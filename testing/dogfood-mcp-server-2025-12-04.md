# Orchestra Dogfooding Test Log - MCP Server Sprint

**Date**: 2025-12-04
**Sprint**: sprint-mcp-001 (MCP Server for Orchestra)
**Tester**: AI Agent (Orchestrator role)
**Version**: CLI v1.0.0 → v1.0.1 (with fixes)

---

## Session 1: Sprint Initialization & Task 1 Handover Preparation

### Test Scope
- `orchestra init` with speckit path
- `orchestra closeout` for first task
- `orchestra prepare --task 1`
- Process 1: Handover Creation workflow

---

## Issues Encountered (7 Total: 4 Fixed, 3 Pending Documentation)

### Issue 1: Manifest Schema Validation - Phase Status ✅ FIXED
**Severity**: BLOCKING → RESOLVED  
**Command**: `orchestra status` after manual manifest creation  
**Error**: `Invalid enum value. Expected 'ACTIVE' | 'COMPLETED' | 'ABORTED', received 'PENDING'`

**Fix Applied**: Created separate `PhaseStatusSchema` with `["PENDING", "ACTIVE", "COMPLETED", "ABORTED"]` in `src/core/types.ts`. Updated `PhaseSchema` to use this instead of `SprintStatusSchema`.

---

### Issue 2: Manifest Schema Validation - Task Category ✅ FIXED
**Severity**: BLOCKING → RESOLVED  
**Command**: `orchestra status` after manual manifest creation  
**Error**: `Invalid enum value. Expected 'INFRASTRUCTURE' | 'INTEGRATION' | 'VISUAL', received 'REFACTOR'`

**Fix Applied**: Added `REFACTOR` to `TaskCategorySchema` in `src/core/types.ts`.

---

### Issue 3: `orchestra verify --dry-run` Not Implemented ✅ FIXED
**Severity**: MAJOR → RESOLVED  
**Command**: `orchestra verify --task 1 --dry-run`  
**Error**: `error: unknown option '--dry-run'`

**Fix Applied**: 
- Added `--dry-run` option to `src/commands/verify.ts`
- Added `dryRun?: boolean` to `VerificationOptions` in `src/core/verification.ts`
- Implemented `validateCheckPaths()` function that validates all path references without executing checks

---

### Issue 4: Process Documentation References Non-Existent Template Path
**Severity**: MINOR (Pending)  
**Location**: `.orchestra/orchestrator/processes/01-handover-creation.md` STEP 3  
**Issue**: Documentation says:
```bash
cp .orchestra/common/templates/current-task-template.md .orchestra/handover/current-task.md
```

**Actual**: The template file is `.orchestra/common/templates/current-task.md.hbs` (Handlebars format).

**Recommendation**: Update documentation to reflect actual template names, or create plain `.md` versions alongside `.hbs` files.

---

### Issue 5: `orchestra prepare` Shows "undefined" for Task ID ✅ FIXED
**Severity**: MINOR → RESOLVED  
**Command**: `orchestra prepare --task 1`  
**Output**: `Task: undefined - Add MCP SDK dependency (INFRASTRUCTURE)`

**Root Cause**: Multiple places in the code used `task.id` directly instead of calling `getTaskId(task)` which handles both `id` and `task_id` properties.

**Fix Applied**: 
- Fixed 5 occurrences in `src/core/prepare.ts`
- Fixed 2 occurrences in `src/core/output.ts`
- Fixed 2 occurrences in `src/commands/status.ts`

---

### Issue 6: Manifest Location Ambiguity
**Severity**: INFO (Pending)  
**Context**: Process documentation references `.orchestra/orchestrator/.orchestrator-only/manifest.yaml` but the actual manifest is at `.orchestra/manifest.yaml`.

**Observation**: The folder structure documentation shows manifest in `.orchestrator-only/` but `orchestra init` creates it at `.orchestra/manifest.yaml`.

**Recommendation**: Clarify canonical manifest location. Either:
1. Move manifest to `.orchestrator-only/` (hidden from implementor), OR
2. Update documentation to reflect current location

---

### Issue 7: No Progress.yaml Created ✅ FIXED
**Severity**: INFO → RESOLVED  
**Context**: `orchestra init` doesn't create a `progress.yaml` file, but Process 0 (Sprint Initialization) mentions it should exist.

**Fix Applied**: Updated `src/commands/init.ts` to generate `progress.yaml` during initialization with empty entries array.

---

## All Issues Summary

| # | Issue | Severity | Status | Fix |
|---|-------|----------|--------|-----|
| 1 | PhaseStatusSchema needs PENDING | BLOCKING | ✅ FIXED | Added PhaseStatusSchema |
| 2 | TaskCategorySchema missing REFACTOR | BLOCKING | ✅ FIXED | Added REFACTOR enum |
| 3 | verify --dry-run not implemented | MAJOR | ✅ FIXED | Added option + logic |
| 4 | Template path wrong in docs | MINOR | ✅ FIXED | Updated process docs |
| 5 | Task ID shows "undefined" | MINOR | ✅ FIXED | Fixed getTaskId() usage |
| 6 | Manifest location ambiguity | INFO | ✅ FIXED | Updated Bible + Registry |
| 7 | No progress.yaml created | INFO | ✅ FIXED | Added to init command |

---

## Suggestions for Improvement

### Improvement 1: Template Rendering for Handover
**Current**: Orchestrator manually fills in the template by copying/editing.
**Suggestion**: `orchestra prepare --task N` could auto-render the template with task data from manifest, reducing manual work and errors.

---

### Improvement 2: Verification YAML Generator
**Current**: Orchestrator manually creates verification YAML from scratch.
**Suggestion**: `orchestra prepare --task N` could generate a skeleton verification YAML based on task category:
- INFRASTRUCTURE: file_exists + command checks
- INTEGRATION: adds test pattern checks
- VISUAL: adds screenshot placeholder

---

### Improvement 3: Closeout Should Check for Verification YAML
**Current**: Closeout doesn't verify that verification criteria exist for the prepared task.
**Suggestion**: Before allowing handover, verify `.orchestrator-only/verification/task-XXX.yaml` exists.

---

### Improvement 4: Status Command Should Show Phase Info
**Current**: `orchestra status` shows task info but not which phase it belongs to.
**Suggestion**: Show phase context: "Phase 1: Setup (5 tasks) - Task 1 of 5"

---

## Test Results Summary

| Step | Command/Action | Result | Notes |
|------|----------------|--------|-------|
| Init | `orchestra init specs/001-mcp-server` | ✅ PASS | Created .orchestra structure |
| Manifest | Manual creation with 57 tasks | ✅ FIXED | Schema issues resolved |
| Closeout | `orchestra closeout` | ✅ PASS | After committing init files |
| Prepare | `orchestra prepare --task 1` | ✅ FIXED | Now shows correct task ID |
| Verify dry-run | `orchestra verify --task 1 --dry-run` | ✅ FIXED | Option now implemented |
| Handover | Manual creation of current-task.md | ✅ PASS | Followed template structure |
| Verification YAML | Manual creation | ✅ PASS | Created task-001.yaml |

---

## Documentation Updates Made

### Files Modified:
1. **`templates/orchestrator/processes/01-handover-creation.md`**
   - STEP 3: Changed from manual copy to `orchestra prepare --task N`
   - STEP 4: Fixed manifest path from `.orchestrator-only/manifest.yaml` to `.orchestra/manifest.yaml`

2. **`docs/TEMPLATE_REGISTRY.md`**
   - Fixed manifest output path
   - Added progress.yaml to init output

3. **`docs/orchestra-bible.md`**
   - Section 0.4: Updated folder structure diagram
   - Section 6.1: Updated folder structure to match implementation

---

## Next Steps
1. Complete Task 1 as Implementor
2. Test Process 2: Task Verification
3. Log additional issues encountered

---

_Last Updated: 2025-12-04 (Session 2: All issues fixed)_