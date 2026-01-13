# TD-018: Cross-Reference Verification Checks

**Created**: 2025-12-14
**Status**: PROPOSED
**Priority**: P1 (High - Prevents runtime bugs)
**Root Cause**: Sprint 003A Task 4 passed verification but had inconsistent view IDs causing runtime failure

## Problem Statement

Current Orchestra verification model supports three check types:
1. **Structural**: File/pattern existence checks
2. **Behavioral**: Command execution with exit code/output validation
3. **Quality**: Pattern matching within files

**Missing**: Cross-reference consistency validation - ensuring identifiers, references, and definitions are consistent across multiple files.

## Example: The Bug That Slipped Through

**Task 4**: "Update package.json with multi-view registration"

**Verification that passed:**
```json
{
  "quality_checks": [
    {"path": "extension/package.json", "pattern": "orchestra.sprintExplorer"}
  ]
}
```

**What actually happened:**
- `package.json` line 145: `"id": "orchestra.sprintExplorer"` ✅ (matched)
- `package.json` line 182: `"view": "orchestraSprintExplorer"` ❌ (different ID, not caught)
- `extension.ts` line 633: `createTreeView("orchestraSprintExplorer")` ❌ (not caught)

**Result**: Extension activation failed with "No view is registered with id: orchestraSprintExplorer"

## Proposed Solution

### Option A: Add Cross-Reference Check Type

Add a new verification check type specifically for cross-file consistency:

```typescript
export const CrossReferenceCheckSchema = z.object({
  description: z.string().min(1),
  severity: SeveritySchema,
  
  // The "definition" - where the ID is declared
  definition: z.object({
    path: z.string(),           // e.g., "extension/package.json"
    json_path: z.string(),      // e.g., "$.contributes.views.orchestra[*].id"
    // OR
    pattern: z.string(),        // e.g., '"id":\\s*"([^"]+)"'
    capture_group: z.number().optional()
  }),
  
  // The "references" - all places that must use the same values
  references: z.array(z.object({
    path: z.string(),           // e.g., "extension/src/**/*.ts"
    pattern: z.string(),        // e.g., 'createTreeView\\("([^"]+)"'
    capture_group: z.number().optional()
  })),
  
  // How to match
  match_mode: z.enum(["exact", "subset", "superset"]).default("subset")
});
```

**Example usage:**
```json
{
  "cross_reference_checks": [
    {
      "description": "View IDs in createTreeView() must match package.json registration",
      "severity": "BLOCKING",
      "definition": {
        "path": "extension/package.json",
        "json_path": "$.contributes.views.orchestra[*].id"
      },
      "references": [
        {"path": "extension/src/**/*.ts", "pattern": "createTreeView\\(\"([^\"]+)\""},
        {"path": "extension/package.json", "pattern": "\"view\":\\s*\"([^\"]+)\""},
        {"path": "extension/package.json", "pattern": "view == ([\\w.]+)"}
      ],
      "match_mode": "subset"
    }
  ]
}
```

### Option B: Behavioral Check with Custom Validator

Use existing behavioral checks with a custom validation script:

```json
{
  "behavioral_checks": [
    {
      "description": "View ID consistency across package.json and source",
      "severity": "BLOCKING",
      "command": "node scripts/validate-view-ids.js",
      "expect_exit_code": 0
    }
  ]
}
```

**Pros**: Uses existing infrastructure
**Cons**: Requires custom scripts per project; less declarative

### Option C: Add Invariant Checks (Sprint-Level)

Add a new concept: **Sprint Invariants** - checks that run for EVERY task, not just individual tasks.

```json
{
  "sprint": {
    "invariants": [
      {
        "description": "VS Code view IDs must be consistent",
        "type": "cross-reference",
        ...
      },
      {
        "description": "All imports must resolve",
        "command": "npm run typecheck",
        "expect_exit_code": 0
      }
    ]
  }
}
```

These invariants would run:
1. After every task completion
2. Before any task is marked COMPLETE
3. As pre-flight check before starting new tasks

## Recommendation

**Implement Option A + Option C combined:**

1. **Cross-Reference Check Type** (Option A) - For declarative consistency validation
2. **Sprint Invariants** (Option C) - For checks that apply to ALL tasks

## Implementation Tasks

1. Add `CrossReferenceCheckSchema` to shared.ts
2. Add `cross_reference_checks` to VerificationSchema
3. Implement cross-reference executor in check-executor.ts
4. Add `invariants` to SprintSchema
5. Run invariants in submit_verification_judgment handler
6. Update orchestrator agent instructions to include invariant design
7. Add pre-built invariant templates for common patterns (VS Code extensions, Node.js, etc.)

## Affected Components

- `src/schemas/shared.ts` - Add new check schema
- `src/core/check-executor.ts` - Implement cross-reference execution
- `src/mcp-server/handlers/run-verification-checks.ts` - Support new check type
- `src/mcp-server/handlers/submit-verification-judgment.ts` - Run invariants
- `docs/orchestra-bible.md` - Document new verification layer

## Success Criteria

1. The view ID mismatch bug would have been caught automatically
2. Orchestrator can define cross-file consistency requirements
3. Sprint invariants run for every task without explicit configuration per task
4. Clear error messages identify exactly which references don't match

## Related

- Orchestra Bible Section 9: Verification Model
- TD-017: Verification Pattern Matching
