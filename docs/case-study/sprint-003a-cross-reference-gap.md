# Sprint 003A Lessons Learned: Cross-Reference Verification Gap

**Date**: 2025-12-14
**Sprint**: sprint-003a-task-visibility
**Issue**: Task 4 passed verification but had inconsistent view IDs causing runtime failure

## Summary

Task 4 "Update package.json with multi-view registration" was marked COMPLETE after passing all verification checks. However, the extension failed to activate because:

- `package.json` line 145 registered view as `orchestra.sprintExplorer`
- `package.json` lines 182-243 referenced `orchestraSprintExplorer` (menus/viewsWelcome)
- `extension.ts` used `orchestraSprintExplorer` in 4 `createTreeView()` calls

The verification checks only confirmed the correct ID existed somewhere, not that ALL references were consistent.

## Root Cause Analysis

### What Verification Checked

```json
{
  "quality_checks": [
    {"path": "extension/package.json", "pattern": "orchestra.currentTask"},
    {"path": "extension/package.json", "pattern": "orchestra.sprintExplorer"}
  ]
}
```

### What Verification Should Have Checked

```json
{
  "quality_checks": [
    // Definition check
    {"description": "View ID registered", "path": "extension/package.json", "pattern": "\"id\":\\s*\"orchestra\\.sprintExplorer\""},
    
    // Reference checks
    {"description": "viewsWelcome uses same ID", "path": "extension/package.json", "pattern": "\"view\":\\s*\"orchestra\\.sprintExplorer\""},
    {"description": "when clauses use same ID", "path": "extension/package.json", "pattern": "view == orchestra\\.sprintExplorer"},
    {"description": "createTreeView uses same ID", "path": "extension/src/**/*.ts", "pattern": "createTreeView\\(\"orchestra\\.sprintExplorer\""}
  ],
  "behavioral_checks": [
    // Negative check - ensure wrong ID doesn't exist
    {"description": "No camelCase variant", "command": "grep -r 'orchestraSprintExplorer' extension/", "expect_exit_code": 1}
  ]
}
```

## Improvement Actions

### Immediate (Done)

1. ✅ Created TD-018: Cross-Reference Verification Checks
2. ✅ Updated orchestrator agent instructions with cross-reference design guidance
3. ✅ Fixed the bug (aligned all view IDs to `orchestra.sprintExplorer`)

### Short-term (TD-018)

1. Add `cross_reference_checks` schema to verification model
2. Implement cross-reference check executor
3. Add sprint-level invariants that run for all tasks

### Long-term

1. Add extension activation behavioral test
2. Create verification templates for common patterns (VS Code extension, Node.js module, etc.)
3. Add "negative checks" - patterns that should NOT exist

## Verification Design Principles (New)

For tasks that define identifiers used across files:

1. **Check definition exists** - Pattern in the defining file
2. **Check all references match** - Same pattern in ALL referencing files
3. **Check for common mistakes** - Negative checks for camelCase/typo variants
4. **Include behavioral check** - Actually run the code if possible

## VS Code Extension Verification Template

For any task modifying VS Code extension views/commands:

```json
{
  "structural_checks": [
    {"description": "package.json exists", "path": "extension/package.json"}
  ],
  "quality_checks": [
    // For each view ID registered:
    {"description": "View ID in contributes.views", "path": "extension/package.json", "pattern": "\"id\":\\s*\"VIEW_ID\""},
    {"description": "View ID in viewsWelcome", "path": "extension/package.json", "pattern": "\"view\":\\s*\"VIEW_ID\""},
    {"description": "View ID in when clauses", "path": "extension/package.json", "pattern": "view == VIEW_ID"},
    {"description": "View ID in createTreeView", "path": "extension/src/**/*.ts", "pattern": "createTreeView\\(\"VIEW_ID\""}
  ],
  "behavioral_checks": [
    {"description": "TypeScript compiles", "command": "cd extension && npm run build", "expect_exit_code": 0},
    {"description": "No wrong ID variant", "command": "grep -r 'WRONG_VARIANT' extension/src extension/package.json || true", "expect_output_contains": ""}
  ]
}
```

## Applicable To Future Sprints

When designing verification for tasks that:
- Register VS Code views, commands, or configuration
- Define module exports used by other files
- Create CSS classes/IDs used in templates
- Define database schemas used in queries
- Create API routes used by clients

**Always include cross-reference consistency checks.**
